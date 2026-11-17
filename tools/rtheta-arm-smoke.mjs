const base = process.env.PLOTTERFLOW_CDP_BASE || "http://127.0.0.1:9333";
const appUrl = process.argv[2] || "http://127.0.0.1:8765/";
const target = await (await fetch(`${base}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const callbacks = pending.get(message.id);
  pending.delete(message.id);
  message.error ? callbacks.reject(new Error(message.error.message)) : callbacks.resolve(message.result);
});
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function evaluate(expression) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    } catch (error) {
      if (!/execution context|Cannot find context/i.test(error.message) || attempt === 39) throw error;
      await delay(50);
    }
  }
}
async function waitUntilReady() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(`document.documentElement?.dataset.plotterflowReady==='true'`)) return;
    await delay(100);
  }
  throw new Error(`PlotterFlow did not become ready at ${appUrl}`);
}
async function reload() {
  await send("Page.reload", { ignoreCache: true });
  await delay(250);
  await waitUntilReady();
}

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: appUrl });
await waitUntilReady();
await evaluate(`localStorage.clear()`);
await reload();

const PROFILE = "rp2040-geek-sts3215-rtheta-arm";
const fail = (label, value) => { throw new Error(`${label}: ${JSON.stringify(value)}`); };
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="40mm" viewBox="0 0 60 40">
<rect x="5" y="5" width="50" height="30" stroke="#1b1b1b" fill="none"/>
<circle cx="30" cy="20" r="10" stroke="#d02f52" fill="none"/>
</svg>`;
const cardVisible = `(() => { document.querySelector('[data-tab="settings"]').click(); const card = document.querySelector('#rthetaArmSettings'); return !card.hidden && getComputedStyle(card).display !== 'none'; })()`;
// 送った行を記録し、すぐ ok を返す模擬シリアル。confirm の回数と返事も記録する。
const installMocks = `(() => {
  window.__writes = []; window.__confirms = 0; window.__confirmAnswer = true;
  window.confirm = () => { window.__confirms++; return window.__confirmAnswer; };
  window.state.writer = { write: async bytes => {
    const text = new TextDecoder().decode(bytes);
    window.__writes.push(text.trim());
    if (text.endsWith('\\n')) setTimeout(() => handleSerialLine('ok'), 0);
  } };
  return true;
})()`;
const sendEditor = `(async () => {
  window.__writes = [];
  await startSending(document.querySelector('#gcodeEditor').value, { silent: true });
  return { writes: window.__writes, confirms: window.__confirms, tool: window.state.rthetaArmTool === undefined ? 'unknown' : window.state.rthetaArmTool };
})()`;

// 1. 通常表示ではプロファイルも設定欄も出ない。
const normal = await evaluate(`({ listed: [...document.querySelector('#controllerProfile').options].some(option => option.value === '${PROFILE}'), module: typeof window.PlotterFlowRthetaArm })`);
if (normal.listed || normal.module !== "object") fail("normal mode", normal);
if (await evaluate(cardVisible)) fail("card must be hidden in normal mode", true);

// 2. 開発中オン＋プロファイル選択で設定欄が出て、関連設定が反映される。
const applied = await evaluate(`(() => {
  const toggle = document.querySelector('#developmentModeToggle'); toggle.checked = true; toggle.dispatchEvent(new Event('change', { bubbles: true }));
  applyControllerProfile('${PROFILE}');
  const s = window.state.settings;
  return { profile: s.controllerProfile, header: s.header, up: s.penUpCommand, down: s.penDownCommand, init: s.initializeCommand, timeout: s.okTimeoutMs };
})()`);
if (applied.profile !== PROFILE || applied.header !== "G90" || applied.up !== "G0 Z5" || applied.down !== "G1 Z0" || applied.init !== "M17\nG90" || applied.timeout !== 60000) fail("profile settings", applied);
if (!(await evaluate(cardVisible))) fail("card must be visible for the arm profile", false);

// 3. 2色SVGからXYのG-codeを作る（エディタとプレビューはXYのまま）。
const generated = await evaluate(`(() => {
  Object.assign(window.state.settings, { toolChangeByColor: true, offsetX: -30, offsetY: -120, drawFeed: 1200, travelFeed: 3000 });
  loadSvg(${JSON.stringify(svg)}, 'arm.svg');
  const code = generateGcode({ stayOnCurrentTab: true });
  return { toolLines: code.split('\\n').filter(line => /M6/.test(line)).map(line => line.trim()), hasXy: /G1 X-?[\\d.]+ Y-1[\\d.]+/.test(code) };
})()`);
if (generated.toolLines.join("|") !== "T1 M6 ; tool-color #1b1b1b|T2 M6 ; tool-color #d02f52|T0 M6" || !generated.hasXy) fail("generated XY program", generated);

// 4. 「変換を確認」ボタン。
const checked = await evaluate(`(() => { document.querySelector('#rthetaArmCheck').click(); const status = document.querySelector('#rthetaArmStatus'); return { text: status.textContent, error: status.classList.contains('error') }; })()`);
if (checked.error || !/変換OK/.test(checked.text) || !/ツール取得 2回/.test(checked.text) || !/終了時 ツールなし/.test(checked.text)) fail("conversion check", checked);

// 5. 送信: RθZの行だけが出ていき、T/M6は出ない。開始時の確認は1回だけ。
await evaluate(installMocks);
const first = await evaluate(sendEditor);
const rthetaLine = /^(G90|G[01] (?:[XYZF]-?[\d.]+ ?)+)$/;
if (!first.writes.length || !first.writes.every(line => rthetaLine.test(line))) fail("sent lines must be RθZ G-code", first.writes.filter(line => !rthetaLine.test(line)).slice(0, 5));
if (first.writes.some(line => /M6|T\d/.test(line))) fail("tool words must not reach the firmware", first.writes.filter(line => /M6|T\d/.test(line)));
if (first.confirms !== 1 || first.tool !== 0) fail("first send confirmation/tool tracking", first);
const pickup = ["G0 Z15 F600", "G0 X62 F600", "G0 Y4 F600", "G0 X62 Y4 Z5 F600", "G1 X70 Y4 Z5 F600", "G1 X70 Y4 Z15 F600", "G1 X62 Y4 Z15 F600"];
const pickupAt = first.writes.indexOf(pickup[0]);
if (pickupAt < 0 || first.writes.slice(pickupAt, pickupAt + pickup.length).join("|") !== pickup.join("|")) fail("T1 pickup sequence", first.writes.slice(0, 14));
if (first.writes.at(-1) !== "G0 X62 Y16 Z15 F600") fail("program must end by returning T2", first.writes.slice(-5));
const limits = first.writes.filter(line => /^G[01] /.test(line)).every(line => {
  const value = letter => { const match = line.match(new RegExp(letter + "(-?[\\d.]+)")); return match ? Number(match[1]) : null; };
  const r = value("X"), theta = value("Y"), z = value("Z");
  return (r === null || (r >= 0 && r <= 200)) && (theta === null || (theta >= 0 && theta <= 180)) && (z === null || (z >= -50 && z <= 50));
});
if (!limits) fail("sent values must stay inside the arm limits", false);

const second = await evaluate(sendEditor);
if (second.confirms !== 1 || second.writes.length !== first.writes.length) fail("second send must not ask again", { confirms: second.confirms, lines: second.writes.length });

// 6. 変換できないプログラムは1行も送らない。
const rejected = await evaluate(`(async () => { window.__writes = []; await startSending('G90\\nT1 M6\\nG0 X0 Y-100\\nG1 X0 Y-400', { silent: true }); return window.__writes; })()`);
if (rejected.length) fail("rejected program must send nothing", rejected);

// 7. 切断後は再確認し、取り消したら送らない。
const declined = await evaluate(`(async () => {
  window.state.rthetaArmTool = undefined; window.__confirmAnswer = false; window.__writes = [];
  await startSending(document.querySelector('#gcodeEditor').value, { silent: true });
  return { writes: window.__writes.length, confirms: window.__confirms };
})()`);
if (declined.writes !== 0 || declined.confirms !== 2) fail("declined confirmation must send nothing", declined);

// 8. 開始時ツールの指定（固定ペン）と、設定JSONの誤り。
const fixedPen = await evaluate(`(async () => {
  window.__confirmAnswer = true; window.state.settings.rthetaArmStartTool = 1; window.__writes = [];
  await startSending('G90\\nG0 X0 Y-100 F3000\\nG1 Z0\\nG1 X3 Y-100 F600\\nG0 Z5', { silent: true });
  const writes = window.__writes; window.state.settings.rthetaArmStartTool = 0; window.state.rthetaArmTool = undefined;
  return writes;
})()`);
if (fixedPen.length !== 7 || fixedPen[2] !== "G1 Z0 F3000" || !/^G1 X[\d.]+ Y[\d.]+ F600$/.test(fixedPen[3])) fail("fixed pen program", fixedPen);
const badConfig = await evaluate(`(async () => {
  window.state.settings.rthetaArmConfig = '{ broken'; window.__writes = [];
  await startSending(document.querySelector('#gcodeEditor').value, { silent: true });
  const writes = window.__writes.length; window.state.settings.rthetaArmConfig = '';
  return writes;
})()`);
if (badConfig !== 0) fail("broken config must send nothing", badConfig);

// 9. 通常プロファイルへ戻すと変換されず、設定欄も消える。
const back = await evaluate(`(async () => {
  applyControllerProfile('grbl-fluidnc'); window.__writes = [];
  await startSending('G90\\nG1 X1 Y2 F500', { silent: true });
  const card = document.querySelector('#rthetaArmSettings');
  return { writes: window.__writes, cardHidden: card.hidden };
})()`);
if (back.writes.join("|") !== "G90|G1 X1 Y2 F500" || !back.cardHidden) fail("normal profile must send raw G-code", back);

console.log(JSON.stringify({ applied, generated, checked: checked.text, sentLines: first.writes.length, firstLines: first.writes.slice(0, 12), fixedPen }, null, 2));
socket.close();
