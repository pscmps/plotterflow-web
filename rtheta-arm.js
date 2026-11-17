// RθZアーム用の座標アダプタ（開発中・実機未確認）。
// 通常のXY G-codeを、RθZファームの直接入力（X=R mm / Y=θ deg / Z=Z mm）へ変換する。
// ファームは変更せず、XY→Rθ変換、直線の分割、T<n> M6のラック動作への展開、範囲検査を
// すべてここで行う。1行でも変換できなければ何も送らない。
// 座標の約束: θ旋回中心がXY原点、θ=0°が+X、θ=90°が-Y、θは上から見て時計回りが正。
(function (root) {
  "use strict";

  const DEFAULT_CONFIG = {
    limits: { r: [0, 200], theta: [0, 180], z: [-50, 50] },
    drawStepMm: 1,
    rackFeed: 600,
    // slot poseとTCPは実機・CAD未確認の仮値。メカ確定後に実測値へ差し替える。
    tools: [
      { number: 1, tcp: { radial: 3, lateral: 7.1 },
        rack: { approach: [62, 4, 15], pickup: [70, 4, 5], release: [70, 4, 8] } },
      { number: 2, tcp: { radial: 3, lateral: 7.1 },
        rack: { approach: [62, 16, 15], pickup: [70, 16, 5], release: [70, 16, 8] } }
    ]
  };
  const EPSILON = 1e-9;
  const MAX_SEGMENTS_PER_LINE = 5000;

  class RthetaArmError extends Error {
    constructor(message, line = null) {
      super(line ? `${line}行目: ${message}` : message);
      this.name = "RthetaArmError";
      this.line = line;
    }
  }

  function poseToXy(tcp, r, thetaDeg) {
    const theta = thetaDeg * Math.PI / 180, radial = r + tcp.radial;
    return {
      x: radial * Math.cos(theta) - tcp.lateral * Math.sin(theta),
      y: -radial * Math.sin(theta) - tcp.lateral * Math.cos(theta)
    };
  }

  // 戻り値 { r, theta }。到達できない点はnull。枝は参照θに最も近いものを選ぶ。
  function xyToPose(tcp, x, y, thetaLimits, referenceTheta) {
    const radialSquared = x * x + y * y - tcp.lateral * tcp.lateral;
    if (!Number.isFinite(radialSquared) || radialSquared < -EPSILON) return null;
    const radial = Math.sqrt(Math.max(0, radialSquared));
    if (radial <= EPSILON) return null;
    const base = (Math.atan2(-tcp.lateral, radial) - Math.atan2(y, x)) * 180 / Math.PI;
    let best = null;
    for (let turn = -2; turn <= 2; turn++) {
      const candidate = base + 360 * turn;
      if (candidate < thetaLimits[0] - EPSILON || candidate > thetaLimits[1] + EPSILON) continue;
      if (best === null || Math.abs(candidate - referenceTheta) < Math.abs(best - referenceTheta)) best = candidate;
    }
    return best === null ? null : { r: radial - tcp.radial, theta: best };
  }

  function isRange(value) {
    return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && value[0] < value[1];
  }
  function isPose(value) { return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite); }
  function within(value, range) { return value >= range[0] - EPSILON && value <= range[1] + EPSILON; }
  function poseInside(pose, limits) {
    return within(pose[0], limits.r) && within(pose[1], limits.theta) && within(pose[2], limits.z);
  }

  function normalizeConfig(raw) {
    const source = typeof raw === "string" ? (raw.trim() ? JSON.parse(raw) : DEFAULT_CONFIG) : (raw || DEFAULT_CONFIG);
    const limits = source.limits || {};
    if (!isRange(limits.r) || !isRange(limits.theta) || !isRange(limits.z)) {
      throw new RthetaArmError("limits.r / limits.theta / limits.z は [最小, 最大] で指定してください");
    }
    const drawStepMm = Number(source.drawStepMm ?? 1), rackFeed = Number(source.rackFeed ?? 600);
    if (!(drawStepMm >= 0.05 && drawStepMm <= 20)) throw new RthetaArmError("drawStepMm は 0.05〜20 mm で指定してください");
    if (!(rackFeed > 0)) throw new RthetaArmError("rackFeed は正の値で指定してください");
    const tools = new Map();
    for (const tool of source.tools || []) {
      const number = Number(tool.number);
      if (!Number.isInteger(number) || number < 1) throw new RthetaArmError("ツール番号は1以上の整数にしてください（T0は返却専用）");
      if (tools.has(number)) throw new RthetaArmError(`ツール番号が重複しています: T${number}`);
      const tcp = tool.tcp || {};
      if (!Number.isFinite(tcp.radial) || !Number.isFinite(tcp.lateral)) throw new RthetaArmError(`T${number} の tcp.radial / tcp.lateral が不正です`);
      const rack = tool.rack || {};
      for (const name of ["approach", "pickup", "release"]) {
        if (!isPose(rack[name])) throw new RthetaArmError(`T${number} の rack.${name} は [R, θ, Z] で指定してください`);
        if (!poseInside(rack[name], limits)) throw new RthetaArmError(`T${number} の rack.${name} が可動範囲の外です`);
      }
      // ラック動作の途中点（approachのRとpickup/releaseの高さの組合せ）も範囲内であること。
      for (const pose of [[rack.approach[0], rack.pickup[1], rack.pickup[2]], [rack.pickup[0], rack.pickup[1], rack.approach[2]],
        [rack.release[0], rack.release[1], rack.approach[2]], [rack.approach[0], rack.release[1], rack.release[2]]]) {
        if (!poseInside(pose, limits)) throw new RthetaArmError(`T${number} のラック動作が可動範囲の外を通ります`);
      }
      tools.set(number, { number, tcp: { radial: tcp.radial, lateral: tcp.lateral },
        rack: { approach: [...rack.approach], pickup: [...rack.pickup], release: [...rack.release] } });
    }
    return { limits: { r: [...limits.r], theta: [...limits.theta], z: [...limits.z] }, drawStepMm, rackFeed, tools };
  }

  const fmt = value => {
    const text = (Math.round(value * 1000) / 1000).toFixed(3).replace(/\.?0+$/, "");
    return text === "-0" ? "0" : text;
  };

  // ラック動作。現在姿勢を知らなくても成立するよう、移送は「Z→R→θ」の1軸ずつの絶対移動にする。
  function rackTransit(slot, currentZ, feed) {
    const [r, theta, z] = slot.rack.approach;
    const transitZ = currentZ === null ? z : Math.max(currentZ, z);
    const lines = [`G0 Z${fmt(transitZ)} F${fmt(feed)}`, `G0 X${fmt(r)} F${fmt(feed)}`, `G0 Y${fmt(theta)} F${fmt(feed)}`];
    if (Math.abs(transitZ - z) > EPSILON) lines.push(`G0 Z${fmt(z)} F${fmt(feed)}`);
    return lines;
  }
  const full = (code, pose, feed) => `${code} X${fmt(pose[0])} Y${fmt(pose[1])} Z${fmt(pose[2])} F${fmt(feed)}`;
  function pickupLines(slot, currentZ, feed) {
    const { approach, pickup } = slot.rack;
    return [
      `; T${slot.number} 取得`, ...rackTransit(slot, currentZ, feed),
      full("G0", [approach[0], pickup[1], pickup[2]], feed), // align
      full("G1", pickup, feed),                               // engage
      full("G1", [pickup[0], pickup[1], approach[2]], feed),  // lift
      full("G1", approach, feed)                              // retreat
    ];
  }
  function releaseLines(slot, currentZ, feed) {
    const { approach, release } = slot.rack;
    return [
      `; T${slot.number} 返却`, ...rackTransit(slot, currentZ, feed),
      full("G0", [release[0], release[1], approach[2]], feed), // over slot
      full("G1", release, feed),                                // lower
      full("G1", [approach[0], release[1], release[2]], feed),  // withdraw
      full("G0", approach, feed)                                // clear
    ];
  }

  function convertProgram(code, rawConfig, options = {}) {
    const config = rawConfig && rawConfig.tools instanceof Map ? rawConfig : normalizeConfig(rawConfig);
    const startTool = Number(options.startTool || 0);
    if (startTool !== 0 && !config.tools.has(startTool)) throw new RthetaArmError(`開始時のツール T${startTool} が設定にありません`);
    const out = [];
    const stats = { sourceLines: 0, toolChanges: 0, drawSegments: 0, travelMoves: 0 };
    let tool = startTool, pendingTool = null;
    let xy = null, z = null, theta = null, feed = null;
    const tcpOf = number => config.tools.get(number).tcp;

    const changeTool = (wanted, lineNumber) => {
      if (wanted !== 0 && !config.tools.has(wanted)) throw new RthetaArmError(`T${wanted} が設定にありません`, lineNumber);
      if (wanted === tool) return;
      let last = null;
      if (tool !== 0) { last = config.tools.get(tool); out.push(...releaseLines(last, z, config.rackFeed)); z = last.rack.approach[2]; }
      if (wanted !== 0) { last = config.tools.get(wanted); out.push(...pickupLines(last, z, config.rackFeed)); stats.toolChanges++; }
      tool = wanted;
      const [r, approachTheta, approachZ] = last.rack.approach;
      theta = approachTheta; z = approachZ;
      xy = tool === 0 ? null : poseToXy(tcpOf(tool), r, approachTheta);
    };

    const sourceLines = String(code || "").split(/\r?\n/);
    sourceLines.forEach((rawLine, index) => {
      const lineNumber = index + 1;
      const line = rawLine.replace(/;.*$/, "").replace(/\([^)]*\)/g, "").trim().toUpperCase();
      if (!line) return;
      stats.sourceLines++;
      if (/^G91\b/.test(line)) throw new RthetaArmError("相対座標(G91)はRθZアーム変換では使えません", lineNumber);
      let match = line.match(/^(?:T(\d+)\s*M0*6|M0*6\s*T(\d+))$/);
      if (match) { pendingTool = Number(match[1] ?? match[2]); changeTool(pendingTool, lineNumber); return; }
      if ((match = line.match(/^T(\d+)$/))) { pendingTool = Number(match[1]); return; }
      if (/^M0*6$/.test(line)) {
        if (pendingTool === null) throw new RthetaArmError("M6の前にT<n>がありません", lineNumber);
        changeTool(pendingTool, lineNumber); return;
      }
      match = line.match(/^G0*([01])(?![0-9.])\s*(.*)$/);
      if (!match) { out.push(line); return; } // G90、M17、M18、@PF1 … はそのまま送る。

      const motion = match[1], words = {};
      const rest = match[2].replace(/([XYZF])\s*(-?(?:\d+\.?\d*|\.\d+))/g, (_, letter, value) => {
        if (letter in words) throw new RthetaArmError(`${letter}が重複しています`, lineNumber);
        words[letter] = Number(value); return "";
      });
      if (rest.trim()) throw new RthetaArmError(`対応していない指定です: ${rest.trim()}`, lineNumber);
      if ("F" in words) { if (!(words.F > 0)) throw new RthetaArmError("Fは正の値にしてください", lineNumber); feed = words.F; }
      const feedText = feed === null ? "" : ` F${fmt(feed)}`;
      if ("Z" in words && !within(words.Z, config.limits.z)) throw new RthetaArmError(`Z${fmt(words.Z)} が可動範囲の外です`, lineNumber);

      if (!("X" in words) && !("Y" in words)) {
        if ("Z" in words) { out.push(`G${motion} Z${fmt(words.Z)}${feedText}`); z = words.Z; }
        return;
      }
      if (tool === 0) throw new RthetaArmError("ツール未装着のままXY移動があります。先にT<n> M6でツールを取得してください", lineNumber);
      if (xy === null && !("X" in words && "Y" in words)) throw new RthetaArmError("最初のXY移動はXとYの両方を指定してください", lineNumber);
      const tcp = tcpOf(tool);
      const target = { x: words.X ?? xy.x, y: words.Y ?? xy.y };
      const targetZ = "Z" in words ? words.Z : null;
      const convert = (point, reference) => {
        const pose = xyToPose(tcp, point.x, point.y, config.limits.theta, reference);
        if (!pose || !within(pose.r, config.limits.r)) {
          throw new RthetaArmError(`X${fmt(point.x)} Y${fmt(point.y)} はアームの可動範囲の外です`, lineNumber);
        }
        return pose;
      };

      if (motion === "0" || xy === null) {
        if (motion === "1") throw new RthetaArmError("現在位置が不明なまま描画(G1)はできません。先に空走(G0)で移動してください", lineNumber);
        // 空走は1回の関節移動で送る（ペンは上がっている前提で、直線にはならない）。
        const pose = convert(target, theta ?? 90);
        out.push(`G0 X${fmt(pose.r)} Y${fmt(pose.theta)}${targetZ === null ? "" : ` Z${fmt(targetZ)}`}${feedText}`);
        theta = pose.theta; stats.travelMoves++;
      } else {
        // 描画は紙面上で直線になるよう、短い区間に分けてから1点ずつ変換する。
        const dx = target.x - xy.x, dy = target.y - xy.y;
        const count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / config.drawStepMm));
        if (count > MAX_SEGMENTS_PER_LINE) throw new RthetaArmError("1行の移動が長すぎます", lineNumber);
        const segment = [];
        let reference = theta;
        for (let step = 1; step <= count; step++) {
          const ratio = step / count;
          const pose = convert({ x: xy.x + dx * ratio, y: xy.y + dy * ratio }, reference);
          reference = pose.theta;
          let zText = "";
          if (targetZ !== null) zText = ` Z${fmt(z === null ? targetZ : z + (targetZ - z) * ratio)}`;
          segment.push(`G1 X${fmt(pose.r)} Y${fmt(pose.theta)}${zText}${feedText}`);
        }
        out.push(...segment); theta = reference; stats.drawSegments += count;
      }
      xy = target; if (targetZ !== null) z = targetZ;
    });
    return { lines: out, sendLines: out.filter(line => !line.startsWith(";")), stats, finalTool: tool };
  }

  const api = { DEFAULT_CONFIG, RthetaArmError, poseToXy, xyToPose, normalizeConfig, convertProgram };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PlotterFlowRthetaArm = api;
})(typeof window !== "undefined" ? window : globalThis);
