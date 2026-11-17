// RθZアーム座標アダプタのホストテスト。実機・ブラウザ不要: node tools/rtheta-arm-test.cjs
const assert = require("node:assert/strict");
const arm = require("../rtheta-arm.js");

const config = arm.normalizeConfig(arm.DEFAULT_CONFIG);
const tcp = config.tools.get(1).tcp;
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
const throwsAt = (code, pattern, line, options) => {
  try { arm.convertProgram(code, config, options); }
  catch (error) {
    assert.ok(error instanceof arm.RthetaArmError, String(error));
    assert.match(error.message, pattern);
    if (line !== undefined) assert.equal(error.line, line);
    return;
  }
  assert.fail(`expected an error for: ${code}`);
};

// 送信行を「X=R / Y=θ / Z=Z の絶対指令」として解釈する最小のファーム模型。
function simulate(lines, startTool = 0) {
  const pose = { r: null, theta: null, z: null };
  let tool = startTool;
  const trace = [];
  for (const line of lines) {
    const comment = line.match(/^; T(\d+) (取得|返却)$/);
    if (comment) { trace.push({ event: comment[2], tool: Number(comment[1]) }); continue; }
    const motion = line.match(/^G([01]) /);
    if (!motion) { trace.push({ raw: line }); continue; }
    for (const [, letter, value] of line.matchAll(/([XYZ])(-?[\d.]+)/g)) {
      pose[{ X: "r", Y: "theta", Z: "z" }[letter]] = Number(value);
    }
    trace.push({ motion: motion[1], ...pose, tool });
    const last = trace.filter(item => item.event).at(-1);
    // 取得はengage後、返却はlower後にツールの有無が変わる（模型上の約束）。
    if (last) tool = last.event === "取得" ? last.tool : 0;
  }
  return trace;
}

// 1. 順変換と逆変換が一致する。
for (const [r, theta] of [[60, 5], [100, 90], [150, 45], [199, 179], [1, 120]]) {
  const xy = arm.poseToXy(tcp, r, theta);
  const pose = arm.xyToPose(tcp, xy.x, xy.y, config.limits.theta, theta);
  near(pose.r, r, 1e-9, "r"); near(pose.theta, theta, 1e-9, "theta");
}
// θ=0°は+X、θ=90°は-Y（時計回りが正）。
near(arm.poseToXy({ radial: 0, lateral: 0 }, 100, 0).x, 100, 1e-9, "theta0 x");
near(arm.poseToXy({ radial: 0, lateral: 0 }, 100, 90).y, -100, 1e-9, "theta90 y");
assert.equal(arm.xyToPose(tcp, 0, 0, config.limits.theta, 90), null); // 特異点
assert.equal(arm.xyToPose(tcp, 0, 100, config.limits.theta, 90), null); // θ範囲外（+Y側）

// 2. 2色プログラム: ラック動作の順序と、描画点が元の直線上にあること。
const twoColor = [
  "G90", "G0 Z5", "T1 M6 ; tool-color #1b1b1b",
  "G0 X-20 Y-120 F3000", "G1 Z0", "G1 X20 Y-120 F1200", "G1 X20 Y-80", "G0 Z5",
  "T2 M6 ; tool-color #d02f52",
  "G0 X0 Y-115 F3000", "G1 Z0", "G1 X15 Y-100 F1200", "G0 Z5", "T0 M6"
].join("\n");
const result = arm.convertProgram(twoColor, config);
assert.equal(result.finalTool, 0);
assert.equal(result.stats.toolChanges, 2);
assert.equal(result.stats.drawSegments, 40 + 40 + Math.ceil(Math.hypot(15, 15)));
assert.ok(result.sendLines.every(line => !line.startsWith(";")));
assert.ok(result.sendLines.every(line => /^(G90|G[01] [XYZF\-\d. ]+)$/.test(line)), "only RθZ G-code is sent");
assert.deepEqual(result.lines.filter(line => line.startsWith(";")), ["; T1 取得", "; T1 返却", "; T2 取得", "; T2 返却"]);

const slot1 = config.tools.get(1).rack;
const firstPickup = result.lines.slice(result.lines.indexOf("; T1 取得") + 1, result.lines.indexOf("; T1 取得") + 9);
assert.deepEqual(firstPickup, [
  "G0 Z15 F600", "G0 X62 F600", "G0 Y4 F600",   // 移送はZ→R→θの1軸ずつ（開始Z=5 < 進入高さ15）
  "G0 X62 Y4 Z5 F600", "G1 X70 Y4 Z5 F600",      // 高さ合わせ → 差し込み
  "G1 X70 Y4 Z15 F600", "G1 X62 Y4 Z15 F600",    // 持ち上げ → 後退
  result.lines[result.lines.indexOf("; T1 取得") + 8]
]);
const firstRelease = result.lines.slice(result.lines.indexOf("; T1 返却") + 1, result.lines.indexOf("; T1 返却") + 9);
assert.deepEqual(firstRelease, [
  "G0 Z15 F600", "G0 X62 F600", "G0 Y4 F600",
  "G0 X70 Y4 Z15 F600", "G1 X70 Y4 Z8 F600",      // スロット上 → 降ろす
  "G1 X62 Y4 Z8 F600", "G0 X62 Y4 Z15 F600",      // 引き抜き → 退避
  "; T2 取得"
]);
assert.deepEqual(slot1.release, [70, 4, 8]);

const trace = simulate(result.lines);
for (const point of trace.filter(item => item.motion)) {
  assert.ok(point.r >= 0 && point.r <= 200 && point.theta >= 0 && point.theta <= 180 && point.z >= -50 && point.z <= 50, JSON.stringify(point));
}
// 1本目の描画（Y=-120の水平線と X=20の垂直線）: G1かつZ=0の点が線上にある。
const drawn = trace.filter(item => item.motion === "1" && item.z === 0 && item.tool !== 0)
  .map(item => ({ ...arm.poseToXy(config.tools.get(item.tool).tcp, item.r, item.theta), tool: item.tool }));
// 各ツールの先頭はペンを下ろす「G1 Z0」の点（描画の開始点そのもの）なので、線上の検査からは外す。
const penDown1 = drawn.filter(point => point.tool === 1)[0], penDown2 = drawn.filter(point => point.tool === 2)[0];
near(penDown1.x, -20, 0.02, "pen down 1 x"); near(penDown1.y, -120, 0.02, "pen down 1 y");
near(penDown2.x, 0, 0.02, "pen down 2 x"); near(penDown2.y, -115, 0.02, "pen down 2 y");
const tool1 = drawn.filter(point => point.tool === 1).slice(1), tool2 = drawn.filter(point => point.tool === 2).slice(1);
assert.equal(tool1.length, 80); assert.equal(tool2.length, Math.ceil(Math.hypot(15, 15)));
tool1.slice(0, 40).forEach((point, index) => { near(point.y, -120, 0.02, "line1 y"); near(point.x, -19 + index, 0.02, "line1 x"); });
tool1.slice(40).forEach((point, index) => { near(point.x, 20, 0.02, "line2 x"); near(point.y, -119 + index, 0.02, "line2 y"); });
tool2.forEach(point => near(point.y + 115, point.x, 0.03, "diagonal"));
near(tool2.at(-1).x, 15, 0.02, "diagonal end x");

// 3. 同じツールの再選択は何もしない。T<n> と M6 を分けても同じ。
const reselect = arm.convertProgram("G90\nT1 M6\nG0 X0 Y-100\nT1 M6\nT1\nM6\nG1 X5 Y-100", config);
assert.equal(reselect.stats.toolChanges, 1); assert.equal(reselect.finalTool, 1);

// 4. 開始時にツール装着済み（固定ペン）なら、T行なしでも変換できる。
const fixed = arm.convertProgram("G90\nG0 X0 Y-100 F3000\nG1 Z0\nG1 X10 Y-100 F600\nG0 Z5", config, { startTool: 1 });
assert.equal(fixed.stats.toolChanges, 0); assert.equal(fixed.stats.drawSegments, 10);
assert.match(fixed.sendLines[1], /^G0 X[\d.]+ Y[\d.]+ F3000$/);
assert.equal(fixed.sendLines[2], "G1 Z0 F3000");

// 5. G1でXYとZを同時に動かすとZも補間する。
const ramp = arm.convertProgram("G90\nG0 X0 Y-100 Z4\nG1 X4 Y-100 Z0 F600", config, { startTool: 1 });
assert.deepEqual(ramp.sendLines.slice(2).map(line => line.match(/Z(-?[\d.]+)/)[1]), ["3", "2", "1", "0"]);

// 6. 変換できないプログラムは、行番号つきで全体を拒否する。
throwsAt("G90\nG0 X0 Y-100", /ツール未装着/, 2);
throwsAt("G90\nT1 M6\nG91", /G91/, 3);
throwsAt("G90\nT9 M6", /T9/, 2);
throwsAt("M6", /T<n>/, 1);
throwsAt("G90\nT1 M6\nG0 X0 Y-100\nG1 X0 Y-400", /可動範囲の外/, 4);
throwsAt("G90\nT1 M6\nG0 X0 Y-100\nG1 X0 Y100", /可動範囲の外/, 4); // 途中でθ範囲を外れる
throwsAt("G90\nT1 M6\nG0 X0 Y-100 Z80", /Z80/, 3);
throwsAt("G90\nG1 X0 Y-100", /先に空走/, 2, { startTool: 1 });
throwsAt("G90\nG0 X0", /XとYの両方/, 2, { startTool: 1 });
throwsAt("G90\nT1 M6\nG0 X0 Y-100 A5", /対応していない指定/, 3);
throwsAt("G90\nG0 X0 Y-100", /開始時のツール/, undefined, { startTool: 7 });

// 7. 設定の検査。
const broken = patch => { const copy = JSON.parse(JSON.stringify(arm.DEFAULT_CONFIG)); patch(copy); return copy; };
assert.throws(() => arm.normalizeConfig(broken(c => { c.tools[0].rack.pickup[0] = 250; })), /可動範囲の外/);
assert.throws(() => arm.normalizeConfig(broken(c => { c.tools[1].number = 1; })), /重複/);
assert.throws(() => arm.normalizeConfig(broken(c => { c.limits.theta = [180, 0]; })), /limits/);
assert.throws(() => arm.normalizeConfig(broken(c => { c.drawStepMm = 0; })), /drawStepMm/);
assert.throws(() => arm.normalizeConfig("{ not json"), SyntaxError);
assert.equal(arm.normalizeConfig("").tools.size, 2);

console.log("rtheta-arm-test passed");
