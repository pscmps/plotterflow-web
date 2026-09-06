"use strict";

const CONTROLLER_PROFILES = {
  "grbl-fluidnc": {
    label: "GRBL / FluidNC（標準）",
    phase: "標準",
    summary: "従来のGRBL / FluidNC互換設定です。既存のPlotterFlow動作を維持します。",
    notes: [
      "G21 / G90をG-codeヘッダへ出力します。",
      "Stopはfeed hold（!）後にペンアップを送ります。",
      "コマンドごとのok応答待ちは15秒です。"
    ],
    settings: {
      baudrate: 115200, header: "G21\nG90", footer: "",
      penUpCommand: "M3 S1400", penDownCommand: "M3 S1000",
      okTimeoutMs: 15000, stopStrategy: "hold-pen-up",
      initializeCommand: "", disconnectCommand: ""
    }
  },
  "xl330-pio": {
    development: true,
    label: "XL330 PIO / Pico・Pico 2（開発中）",
    phase: "開発中",
    summary: "PicoのPIOでXL330-M077-Tを直結し、X/Yを多回転制御する試作ファームウェア用です。",
    notes: [
      "Serial接続後、安全を確認して初期化（M17）を1回だけ実行します。M17時点がセッション原点です。",
      "長い多回転移動に備えてok応答待ちを120秒へ延長します。",
      "Stopは0x85で現在移動をキャンセルしてからペンアップを送ります。",
      "切断時はM18を送り、3台のトルクを無効にします。",
      "電源再投入後の多回転絶対位置は保持されないため、毎回原点確認が必要です。"
    ],
    settings: {
      baudrate: 115200, header: "G21\nG90", footer: "",
      penUpCommand: "M3 S1400", penDownCommand: "M3 S1000",
      okTimeoutMs: 120000, stopStrategy: "cancel-pen-up",
      initializeCommand: "M17", disconnectCommand: "M18"
    }
  },
  "xl330-pio-id1-test": {
    development: true,
    label: "XL330 ID1 単体安全テスト（開発中）",
    phase: "実機テスト",
    summary: "MOTION_LOCKED=1を維持したまま、ID 1のXL330を低速・小刻みで回転確認するCファーム専用プロファイルです。",
    notes: [
      "接続後の初期化はSCAN 1だけを送り、Pingと現在位置を読み出します。",
      "X左右だけを正転・逆転JOGとして使用します。Y方向、通常G-code、M17、ペン指令はロックされたままです。",
      "移動量の単位は回転です。初期値は1/16回転、1操作の上限は2回転です。",
      "速度欄はmm/minではなくXL330のProfile Velocity raw値です。初期値20、上限100です。",
      "各JOGの完了・停止・失敗後にTorqueをOFFにします。1台・無負荷・電流制限付き5 V電源で使用してください。"
    ],
    capabilities: { jogCommand: "xl330-test", jogAxes: ["X"] },
    settings: {
      baudrate: 115200, header: "", footer: "",
      penUpCommand: "G0 Z1", penDownCommand: "G0 Z0",
      okTimeoutMs: 30000, stopStrategy: "cancel-pen-up",
      initializeCommand: "SCAN 1", disconnectCommand: "M18", jogAutoDisable: false,
      jogStep: 0.0625, jogFeed: 20
    }
  },
  "rp2040-geek-sts3215-id2-id3": {
    label: "RP2040/RP2350-GEEK STS3215 XYZ直結G-code",
    phase: "動作確認",
    summary: "Rθ差動化前に、G-codeのXYZをSTS3215へ直接割り当てて確認する暫定プロファイルです。",
    notes: [
      "暫定割当はID 2=X、ID 1=Y、ID 3=Zです。設定画面からXYZのID・pulse/mm・反転を変更できます。",
      "Mode 0、Min/Max Angle Limit=0、Phase BIT4=1、Angle Resolution=1のときだけ動作し、符号付き約±7回転の範囲を使います。",
      "送信開始時の現在位置をXYZ=0として、G0/G1のmm座標を絶対多回転位置へ変換します。ZはID 3のペン軸として有効です。",
      "Z -5° / +5°はRθ差動化前の単体動作確認専用です。最終的な機械座標の意味はまだ確定していません。",
      "移動後は元の位置へ戻りません。Torque OFF後も、次の指令はその時点の現在位置から加算されます。",
      "速度はファームウェア側でraw 3400、加速度raw 150に固定されています。Stopは0x85で現在の往復動作を中止します。"
    ],
    capabilities: {
      jogCommand: "sts3215-test", jogAxes: ["X", "Y", "Z"],
      directAxes: true, statusPolling: false
    },
    settings: {
      baudrate: 115200, header: "G21\nG90", footer: "M18",
      penUpCommand: "G0 Z1", penDownCommand: "G0 Z0",
      okTimeoutMs: 20000, stopStrategy: "cancel-pen-up",
      initializeCommand: "M17\nG21\nG90\nG10 L20 P0 X0 Y0", disconnectCommand: "M18", jogAutoDisable: false,
      jogStep: 45, jogFeed: 3400, penUpDelay: 0, penDownDelay: 0, penUpClearanceDelay: 0,
      stsAxisXId: 2, stsAxisYId: 1, stsAxisZId: 3,
      stsAxisXPulsesPerMm: 128, stsAxisYPulsesPerMm: 128, stsAxisZPulsesPerMm: 128,
      stsAxisXInvert: false, stsAxisYInvert: false, stsAxisZInvert: false, stsAxisZEnabled: true
    }
  },
  "pico2-tmc2209-planar": {
    development: true,
    label: "Pico 2 TMC2209 XY Planar（開発中）",
    phase: "開発中",
    summary: "Pico 2とTMC2209 2個でA/B・C/D相のXY平面リニアステッパをG-code駆動する試作ファームウェア用です。",
    notes: [
      "初期キャンバスと確認範囲は30×30 mmを推奨します。0.1 mmジョグと低速feedから確認してください。",
      "ジョブ送信時のヘッダでM17、G21、G90、G10 L20 P0 X0 Y0を送り、現在位置をワーク原点にします。",
      "M3 S1400 / M3 S1000はペン互換コマンドとして維持します。実際のペン、電磁石、外部アクチュエータ割り当てはPico側で扱います。",
      "Stopは0x85で現在移動をキャンセルしてからペンアップを送ります。",
      "切断時はM18を送り、TMCドライバを無効にします。"
    ],
    settings: {
      baudrate: 115200, header: "M17\nG21\nG90\nG10 L20 P0 X0 Y0", footer: "M122 P\nM18",
      penUpCommand: "M3 S1400", penDownCommand: "M3 S1000",
      okTimeoutMs: 30000, stopStrategy: "cancel-pen-up",
      initializeCommand: "M18\nG21\nG90", disconnectCommand: "M18", jogAutoDisable: true,
      travelFeed: 500, drawFeed: 300, jogStep: 40, jogFeed: 2400,
      sampleInterval: 0.5, optimization: "safe", yFlip: true
    }
  },
  "pico2-drv8835-planar": {
    development: true,
    label: "Pico 2 DRV8835 XY Planar（開発中）",
    phase: "開発中",
    summary: "Pico 2とDRV8835 4個でXY平面リニアステッパを駆動し、GP12のPWMサーボでZ上下する試作ファームウェア用です。",
    notes: [
      "ジョブ開始前にM18で出力を止め、M281でGP12サーボを上1000us・下1800us・待機150msへ設定します。",
      "M980で単相U1・XYピーク100%・停止後500ms保持・初期捕捉100ms・移動軸だけ励磁を設定します。",
      "滑らか動作を試す場合はカスタム設定でU8へ変更できますが、通常運転は動作確認済みの単相励磁を優先します。",
      "ペン上はG0 Z1、ペン下はG1 Z0です。DYNAMIXELプロファイルのM3 S1400/S1000は変更しません。",
      "G0/G1と$Jジョグを使用し、診断用M974～M978は通常運転では送りません。",
      "Stopは0x85で現在移動をキャンセルしてペンを上げ、切断時はM18で全DRV8835入力をLowへ戻します。",
      "VM 3V、電源制限1.5A、各相1.5Ω直列抵抗から実機確認してください。"
    ],
    capabilities: { positionSensors: true },
    settings: {
      baudrate: 115200,
      header: "M18\nM281 U1000 D1800 T150 Z0.5\nM980 U1 X100 Y100 H500 A1 C100\nG0 Z1\nM17\nG21\nG90\nG10 L20 P0 X0 Y0 Z1",
      footer: "M122\nM18",
      penUpCommand: "G0 Z1", penDownCommand: "G1 Z0",
      okTimeoutMs: 30000, stopStrategy: "cancel-pen-up",
      initializeCommand: "M18\nM281 U1000 D1800 T150 Z0.5\nM980 U1 X100 Y100 H500 A1 C100\nG0 Z1\nG21\nG90",
      disconnectCommand: "M18", jogAutoDisable: false,
      travelFeed: 500, drawFeed: 300, jogStep: 2.5, jogFeed: 300,
      sampleInterval: 0.5, optimization: "safe", yFlip: true
    }
  },
  "m5stack-drv8835-planar": {
    development: true,
    label: "M5Stack Basic DRV8835 XY Planar（開発中）",
    phase: "開発中",
    summary: "M5Stack BasicとDRV8835 4個でXY平面リニアステッパとPWMサーボを制御し、USB実行、microSD保存、SDファイル管理に対応する試作ファームウェア用です。",
    notes: [
      "M5Stack起動時にUSB SERIALを選択すると、通常実行とmicroSDへのG-code転送をPlotterFlowから切り替えられます。",
      "SD転送はM28/M29を使い、完了時だけ正式な.gcodeファイルとして確定します。",
      "転送中はG-codeを実行せずDRV8835出力をLowへ戻します。",
      "転送後はM5StackをSD CARDモードへ戻し、本体ボタンからファイルを選択して実行します。",
      "停止・切断・転送失敗時は未完成ファイルを破棄します。",
      "SDカード管理ではPCからモードを指定し、一覧同期、名前変更、削除ができます。"
    ],
    capabilities: { sdUpload: true, sdManagement: true },
    settings: {
      baudrate: 115200,
      header: "M18\nM281 U1400 D1000 T150 Z0.5\nM980 U1 X100 Y100 H500 A1 C100\nG0 Z1\nM17\nG21\nG90\nG10 L20 P0 X0 Y0 Z1",
      footer: "M122\nM18",
      penUpCommand: "G0 Z1", penDownCommand: "G1 Z0",
      okTimeoutMs: 30000, stopStrategy: "cancel-pen-up",
      initializeCommand: "M18\nM281 U1400 D1000 T150 Z0.5\nM980 U1 X100 Y100 H500 A1 C100\nG0 Z1\nG21\nG90",
      disconnectCommand: "M18", jogAutoDisable: false,
      travelFeed: 500, drawFeed: 300, jogStep: 2.5, jogFeed: 300,
      sampleInterval: 0.5, optimization: "safe", yFlip: true
    }
  },
  custom: {
    label: "カスタム（値を維持）",
    phase: "手動設定",
    summary: "現在の各設定値を維持し、個別に調整します。プロファイルによる上書きは行いません。",
    notes: ["接続先の仕様に合わせて、出力・接続欄とペン命令を手動で設定してください。"],
    settings: null
  }
};

const DEFAULTS = {
  controllerProfile: "grbl-fluidnc",
  penUpCommand: "M3 S1400", penDownCommand: "M3 S1000",
  penUpDelay: 0.1, penDownDelay: 0.1, penUpClearanceDelay: 0.1, upDelayMode: "fixed",
  longMoveThreshold: 100, penUpDelayShort: 0.1, penUpDelayLong: 0.3,
  baseDelay: 0.1, delayPer100: 0.1, maxDelay: 1,
  travelFeed: 500, drawFeed: 500, sampleInterval: 0.5,
  scale: 1, offsetX: 0, offsetY: 0, yFlip: true,
  optimization: "overlap_up", downLeadDistance: 5, requiredPenDownTime: 0.1,
  rthetaControlUrl: "http://127.0.0.1:8768/",
  baudrate: 115200, jogStep: 1, jogFeed: 1000, jogAutoDisable: false, header: "G21\nG90", footer: "",
  okTimeoutMs: 15000, stopStrategy: "hold-pen-up", initializeCommand: "", disconnectCommand: "",
  stsAxisXId: 2, stsAxisYId: 3, stsAxisZId: 1,
  stsAxisXPulsesPerMm: 128, stsAxisYPulsesPerMm: 128, stsAxisZPulsesPerMm: 128,
  stsAxisXInvert: false, stsAxisYInvert: false, stsAxisZInvert: false, stsAxisZEnabled: false,
  serialDestination: "execute",
  reloadGcode: `M3 S1600

G1 X0 Y45 F500
G1 Y-7 F500
G1 Y0 F500`
};

const DEVELOPMENT_MODE_KEY = "plotterflow.developmentModeV1";

const state = {
  developmentMode: false,
  settings: loadJSON("plotterflow.settings", DEFAULTS), svgText: "", paths: [], gcodeMoves: [],
  library: loadJSON("plotterflow.library", []), jobSets: loadJSON("plotterflow.jobSets", []), currentId: null, currentJobSetId: null, port: null, reader: null, writer: null,
  serialLogLimit: 200, lastSentLine: "", lastReceivedLine: "", lastOkAt: 0, lastSendAt: 0,
  serialUiTimer: null, pendingSerialProgress: null, pendingPositionDisplay: false, pendingJobProgress: null,
  readBuffer: "", okWaiters: [], sending: false, sdUploading: false, sdManagementActive: false, sdFiles: [], sdListReceiving: false, jogging: false, keyboardJogEnabled: false, paused: false, stopped: false, jobStopped: false,
  previewMode: "svg", previewNormalizeY: false, position: null, machinePosition: null, workPosition: null, workOffset: null, controllerState: "未接続", statusPollTimer: null,
  positionTelemetryEnabled: false, rthetaTransfer: null,
  positionSensors: { presentMask: 0, magnetMask: 0, joints: [{ raw: 0, degrees: 180 }, { raw: 0, degrees: 180 }] },
  armCalibration: loadJSON("plotterflow.armCalibration", { offset1: 0, offset2: 0, invert1: false, invert2: false, calibrated: false })
};

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const fmt = n => Number(n.toFixed(3)).toString();
const sleep = ms => new Promise(r => setTimeout(r, ms));
function loadJSON(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    if (parsed == null) return Array.isArray(fallback) ? [...fallback] : { ...fallback };
    return Array.isArray(fallback) ? (Array.isArray(parsed) ? parsed : [...fallback]) : { ...fallback, ...parsed };
  } catch { return Array.isArray(fallback) ? [...fallback] : { ...fallback }; }
}
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function isDevelopmentProfile(profileId = state.settings.controllerProfile) {
  return CONTROLLER_PROFILES[profileId]?.development === true;
}
function migrateDevelopmentMode() {
  const saved = localStorage.getItem(DEVELOPMENT_MODE_KEY);
  if (saved === null) {
    state.developmentMode = isDevelopmentProfile() || state.settings.optimization === "overlap_down";
    localStorage.setItem(DEVELOPMENT_MODE_KEY, state.developmentMode ? "1" : "0");
    return;
  }
  state.developmentMode = saved === "1";
  if (!state.developmentMode && isDevelopmentProfile()) {
    state.developmentMode = true;
    localStorage.setItem(DEVELOPMENT_MODE_KEY, "1");
  }
}
function migrateDrv8835RobustMode() {
  const migrationKey = "plotterflow.drv8835RobustModeV1";
  if (localStorage.getItem(migrationKey)) return;
  if (state.settings.controllerProfile === "pico2-drv8835-planar") {
    const robustCommand = command => String(command || "").replace(/^M980[^\r\n]*$/m,
      "M980 U1 X100 Y100 H500 A1 C100");
    state.settings.header = robustCommand(state.settings.header);
    state.settings.initializeCommand = robustCommand(state.settings.initializeCommand);
    state.settings.jogStep = 2.5;
    state.settings.jogFeed = 300;
    saveJSON("plotterflow.settings", state.settings);
  }
  localStorage.setItem(migrationKey, "1");
}
function migrateDrv8835ServoDirection() {
  const migrationKey = "plotterflow.drv8835ServoDirectionV1";
  if (localStorage.getItem(migrationKey)) return;
  if (state.settings.controllerProfile === "pico2-drv8835-planar") {
    const reversedServo = command => String(command || "").replace(/^M281[^\r\n]*$/m,
      "M281 U1000 D1800 T150 Z0.5");
    state.settings.header = reversedServo(state.settings.header);
    state.settings.initializeCommand = reversedServo(state.settings.initializeCommand);
    saveJSON("plotterflow.settings", state.settings);
  }
  localStorage.setItem(migrationKey, "1");
}
function migrateSts3215DirectAxesProfile() {
  if (state.settings.controllerProfile === "rp2040-geek-sts3215-id2-id3") {
    const oldInitialize = cleanLines(String(state.settings.initializeCommand || ""));
    const isOldScanOnly = oldInitialize.length === 2 && oldInitialize[0] === "SCAN 2" && oldInitialize[1] === "SCAN 3";
    const compactInitialize = String(state.settings.initializeCommand || "").replace(/\s+/g, "").toUpperCase();
    const isCollapsedOldScan = compactInitialize === "SCAN2SCAN3";
    const isCollapsedDirectInit = compactInitialize === "M17G21G90G10L20P0X0Y0";
    if (isOldScanOnly || isCollapsedOldScan || isCollapsedDirectInit || oldInitialize.length === 0) {
      state.settings.initializeCommand = "M17\nG21\nG90\nG10 L20 P0 X0 Y0";
      if (!String(state.settings.header || "").trim()) state.settings.header = "G21\nG90";
      if (!String(state.settings.footer || "").trim()) state.settings.footer = "M18";
      saveJSON("plotterflow.settings", state.settings);
    }
  }
  const xyzMigrationKey = "plotterflow.sts3215X2Y1Z3V2";
  if (!localStorage.getItem(xyzMigrationKey)) {
    if (state.settings.controllerProfile === "rp2040-geek-sts3215-id2-id3") {
      if (+state.settings.stsAxisXId === 2 && +state.settings.stsAxisYId === 3 && +state.settings.stsAxisZId === 1) {
        state.settings.stsAxisYId = 1;
        state.settings.stsAxisZId = 3;
      }
      state.settings.stsAxisZEnabled = true;
      state.settings.stsAxisZPulsesPerMm = 128;
      if (!String(state.settings.penUpCommand || "").trim()) state.settings.penUpCommand = "G0 Z1";
      if (!String(state.settings.penDownCommand || "").trim()) state.settings.penDownCommand = "G0 Z0";
      saveJSON("plotterflow.settings", state.settings);
    }
    localStorage.setItem(xyzMigrationKey, "1");
  }
}
function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2200); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function switchTab(name) { $$(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === name)); $$(".panel").forEach(x => x.classList.toggle("active", x.id === `tab-${name}`)); }
function installLocalTestBridge() {
  if (!["127.0.0.1", "localhost"].includes(location.hostname)) return;
  Object.defineProperties(window, {
    state: { value: state, configurable: true },
    CONTROLLER_PROFILES: { value: CONTROLLER_PROFILES, configurable: true }
  });
}

function init() {
  migrateDevelopmentMode();
  migrateDrv8835RobustMode();
  migrateDrv8835ServoDirection();
  migrateSts3215DirectAxesProfile();
  if (!localStorage.getItem("plotterflow.svgOrientationV1")) { state.settings.yFlip = true; saveJSON("plotterflow.settings", state.settings); localStorage.setItem("plotterflow.svgOrientationV1", "1"); }
  $$(".tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  bindSvg(); bindEditor(); bindSettings(); bindSerial(); bindJobs();
  populateSettings(); refreshLibrary(); updateEditorStats(); renderJobs();
  if (!("serial" in navigator)) log("Web SerialはChrome/EdgeのHTTPSまたはlocalhostで利用できます。", "rx");
  installLocalTestBridge();
  document.documentElement.dataset.plotterflowReady = "true";
}

function bindSvg() {
  const file = $("#svgFile"), drop = $("#dropZone");
  file.addEventListener("change", () => file.files[0] && readSvgFile(file.files[0]));
  ["dragenter", "dragover"].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", e => e.dataTransfer.files[0] && readSvgFile(e.dataTransfer.files[0]));
  $("#loadSvgText").addEventListener("click", () => loadSvg($("#svgText").value));
  $("#generateGcode").addEventListener("click", () => generateGcode());
  $("#generateAndSendSvg").addEventListener("click", generateAndSendSvg);
  $("#svgOrientationFlip").addEventListener("change", event => { state.settings.yFlip=event.target.checked;$("#settingsForm").elements.yFlip.checked=event.target.checked;saveJSON("plotterflow.settings",state.settings); });
  $("#showSvgPreview").addEventListener("click", () => setPreviewMode("svg"));
  $("#showGcodePreview").addEventListener("click", () => setPreviewMode("gcode"));
}
async function readSvgFile(file) { if (!file.name.toLowerCase().endsWith(".svg")) return setSvgStatus("SVGファイルを選択してください。", true); loadSvg(await file.text(), file.name); }
function loadSvg(text, name = "") {
  try {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg") throw new Error("有効なSVGではありません");
    doc.querySelectorAll("script,foreignObject").forEach(n => n.remove());
    state.svgText = new XMLSerializer().serializeToString(doc.documentElement);
    $("#svgText").value = state.svgText;
    const host = mountSvgForMeasurement(state.svgText);
    state.paths = extractPaths(host);
    renderSvgPreview();
    setSvgStatus(`${name ? name + ": " : ""}${state.paths.length}個の描画要素を読み込みました。`);
  } catch (e) { setSvgStatus(e.message, true); }
}
function mountSvgForMeasurement(text) {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml"),host = $("#previewSvg");
    [...host.attributes].forEach(a => !["id", "aria-label", "style"].includes(a.name) && host.removeAttribute(a.name));
    host.innerHTML = doc.documentElement.innerHTML;
    [...doc.documentElement.attributes].forEach(a => { if (a.name !== "xmlns") host.setAttribute(a.name, a.value); });
    if (!host.getAttribute("viewBox")) {
      const w = parseFloat(doc.documentElement.getAttribute("width")) || 100, h = parseFloat(doc.documentElement.getAttribute("height")) || 100;
      host.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    return host;
}
function setSvgStatus(msg, error = false) { const el = $("#svgStatus"); el.textContent = msg; el.classList.toggle("error", error); }

function extractPaths(svg) {
  const supported = "path,line,polyline,polygon,rect,circle,ellipse";
  const shapes = $$(supported, svg).filter(el => !el.closest("defs") && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden");
  const viewBox = svg.viewBox.baseVal;
  const mmScale = getSvgMmScale(svg, viewBox);
  const intervalMm = Math.max(0.05, +state.settings.sampleInterval || .5);
  const outputScale = Math.max(0.0001, Math.abs(+state.settings.scale || 1));
  return shapes.map(el => {
    let length;
    try { length = el.getTotalLength(); } catch { return null; }
    if (!Number.isFinite(length) || length <= 0) return null;
    const rootCtm = svg.getScreenCTM(), elementCtm = el.getScreenCTM();
    if (!rootCtm || !elementCtm) return null;
    const ctm = rootCtm.inverse().multiply(elementCtm);
    const localScale = Math.max(Math.hypot(ctm.a, ctm.b), Math.hypot(ctm.c, ctm.d)) * mmScale;
    const count = Math.max(1, Math.ceil(length * localScale * outputScale / intervalMm));
    const points = [];
    for (let i = 0; i <= count; i++) {
      const p = el.getPointAtLength(length * i / count);
      const q = new DOMPoint(p.x, p.y).matrixTransform(ctm);
      points.push({ x: q.x * mmScale, y: q.y * mmScale });
    }
    return points;
  }).filter(Boolean);
}
function getSvgMmScale(svg, vb) {
  const raw = svg.getAttribute("width") || ""; const value = parseFloat(raw);
  const unit = (raw.match(/[a-z%]+/i) || [""])[0].toLowerCase();
  const unitMm = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96 }[unit || "px"] || 25.4 / 96;
  return value && vb.width ? value * unitMm / vb.width : 25.4 / 96;
}
function transformedPaths() {
  return transformOutputPaths(state.paths);
}
function transformOutputPaths(sourcePaths) {
  const s = state.settings; const scale = +s.scale || 1, ox = +s.offsetX || 0, oy = +s.offsetY || 0;
  let paths = sourcePaths.map(path => path.map(p => ({ x: p.x * scale + ox, y: p.y * scale + oy })));
  if (s.yFlip && paths.length) {
    const ys = paths.flat().map(p => p.y), axis = Math.min(...ys) + Math.max(...ys);
    paths = paths.map(path => path.map(p => ({ x: p.x, y: axis - p.y })));
  }
  return paths;
}

function requiredUpDelay(distance) {
  const s = state.settings;
  if (s.upDelayMode === "threshold") return distance >= +s.longMoveThreshold ? +s.penUpDelayLong : +s.penUpDelayShort;
  if (s.upDelayMode === "distance") return Math.min(+s.maxDelay, +s.baseDelay + distance / 100 * +s.delayPer100);
  return +s.penUpDelay;
}
function dwell(lines, seconds) { if (seconds > 0.0001) lines.push(`G4 P${fmt(seconds)}`); }
function appendTravelMove(lines, moves, from, to, feed, splitXThenY = false) {
  if (!splitXThenY) {
    lines.push(`G0 X${fmt(to.x)} Y${fmt(to.y)} F${fmt(feed)}`);
    moves.push({ type: "travel", from, to });
    return;
  }

  let current = from;
  if (Math.abs(to.x - current.x) > 0.000001) {
    const xTarget = { x: to.x, y: current.y };
    lines.push(`G0 X${fmt(xTarget.x)} F${fmt(feed)}`);
    moves.push({ type: "travel", from: current, to: xTarget });
    current = xTarget;
  }
  if (Math.abs(to.y - current.y) > 0.000001) {
    const yTarget = { x: current.x, y: to.y };
    lines.push(`G0 Y${fmt(yTarget.y)} F${fmt(feed)}`);
    moves.push({ type: "travel", from: current, to: yTarget });
  }
}
function generateGcode(options = {}) {
  if (!state.paths.length) return setSvgStatus("先にSVGを読み込んでください。", true);
  state.paths = extractPaths(mountSvgForMeasurement(state.svgText));
  return buildGcodeFromPaths(transformedPaths(), "", { normalizeYPreview: !!state.settings.yFlip, stayOnCurrentTab: !!options.stayOnCurrentTab });
}
async function generateAndSendSvg() {
  const code = generateGcode({ stayOnCurrentTab: true });
  if (code) {
    $("#sdFilename").value = sanitizeSdFilename($("#gcodeName").value);
    openSerialTrajectory(code, $("#gcodeName").value);
    await startConfiguredTransfer(code, $("#gcodeName").value);
  }
}
function buildGcodeFromPaths(paths, outputName = "", previewOptions = {}) {
  const s = state.settings, lines = [], moves = [];
  lines.push(...String(s.header).split(/\r?\n/).filter(Boolean));
  let previous = { x: 0, y: 0 };
  let isFirstDrawablePath = true;
  for (const path of paths) {
    if (path.length < 2) continue;
    const start = path[0], distance = Math.hypot(start.x - previous.x, start.y - previous.y);
    const splitInitialTravel = isFirstDrawablePath && isPicoDrv8835Profile();
    lines.push(s.penUpCommand);
    const upDelay = Math.max(0, requiredUpDelay(distance));
    const travelSpeed = Math.max(1, +s.travelFeed) / 60;
    const clearanceDelay = Math.min(upDelay, Math.max(0, +s.penUpClearanceDelay || 0));
    const overlapEnabled = s.optimization === "overlap_up" || s.optimization === "overlap_down";
    const preTravelDelay = overlapEnabled ? clearanceDelay : upDelay;
    dwell(lines, preTravelDelay);
    if (s.optimization === "overlap_down" && distance > +s.downLeadDistance) {
      const lead = Math.min(distance, +s.downLeadDistance), ratio = (distance - lead) / distance;
      const leadPoint = { x: previous.x + (start.x - previous.x) * ratio, y: previous.y + (start.y - previous.y) * ratio };
      appendTravelMove(lines, moves, previous, leadPoint, +s.travelFeed, splitInitialTravel);
      dwell(lines, Math.max(0, upDelay - preTravelDelay - (distance - lead) / travelSpeed));
      lines.push(s.penDownCommand);
      lines.push(`G0 X${fmt(start.x)} Y${fmt(start.y)} F${fmt(+s.travelFeed)}`); moves.push({ type: "travel", from: leadPoint, to: start });
      const absorbed = lead / travelSpeed; dwell(lines, Math.max(0, +s.requiredPenDownTime - absorbed));
    } else {
      appendTravelMove(lines, moves, previous, start, +s.travelFeed, splitInitialTravel);
      if (overlapEnabled) dwell(lines, Math.max(0, upDelay - preTravelDelay - distance / travelSpeed));
      lines.push(s.penDownCommand); dwell(lines, +s.penDownDelay);
    }
    for (let i = 1; i < path.length; i++) {
      const p = path[i], from = path[i - 1]; lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)} F${fmt(+s.drawFeed)}`); moves.push({ type: "draw", from, to: p });
    }
    previous = path[path.length - 1];
    isFirstDrawablePath = false;
  }
  lines.push(s.penUpCommand); dwell(lines, +s.penUpDelay); lines.push(...String(s.footer).split(/\r?\n/).filter(Boolean));
  $("#gcodeEditor").value = lines.join("\n"); state.gcodeMoves = moves; state.previewNormalizeY = !!previewOptions.normalizeYPreview; state.currentId = null;
  $("#gcodeName").value = outputName ? ensureExt(outputName.replace(/\.plotter\.json$/i, "")) : `plot-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.gcode`;
  updateEditorStats(); setPreviewMode("gcode"); renderGcodePreview(); if (!previewOptions.stayOnCurrentTab) switchTab("gcode"); toast("G-codeを生成しました");
  return lines.join("\n");
}

function generateFromLayoutPaths(paths, outputName = "") { return buildGcodeFromPaths(transformOutputPaths(paths), outputName, { normalizeYPreview: !!state.settings.yFlip }); }
function notifyReloadSimulation(code = state.settings.reloadGcode) { window.dispatchEvent(new CustomEvent("plotterflow:reload-start", { detail: { gcode: code || "" } })); }
function simulationGcodeOptions() { return [{ id: "editor", name: "現在のエディタ" }, ...state.library.map(item => ({ id: item.id, name: item.name }))]; }
function simulationGcode(id) { return id === "editor" ? $("#gcodeEditor").value : state.library.find(item => item.id === id)?.gcode || ""; }
window.PlotterFlow = { generateFromPaths: generateFromLayoutPaths, switchTab, getSettings: () => state.settings, parseGcodeMoves, simulateReload: notifyReloadSimulation, simulationGcodeOptions, simulationGcode };

function setPreviewMode(mode) { state.previewMode = mode; $("#showSvgPreview").classList.toggle("active", mode === "svg"); $("#showGcodePreview").classList.toggle("active", mode === "gcode"); mode === "svg" ? renderSvgPreview() : renderGcodePreview(); }
function renderSvgPreview() { if (!state.svgText) return; const svg = $("#previewSvg"); svg.style.display = "block"; }
function renderGcodePreview() {
  const svg = $("#previewSvg"); let moves = parseGcodeMoves($("#gcodeEditor").value);
  let previewPosition = state.position;
  if (state.previewNormalizeY && moves.length) {
    const drawnPoints = moves.filter(m => m.type === "draw").flatMap(m => [m.from, m.to]);
    const referencePoints = drawnPoints.length ? drawnPoints : moves.flatMap(m => [m.from, m.to]);
    const ys = referencePoints.map(p => p.y), axis = Math.min(...ys) + Math.max(...ys);
    const flipPoint = p => ({ x: p.x, y: axis - p.y });
    moves = moves.map(m => ({ ...m, from: flipPoint(m.from), to: flipPoint(m.to) }));
    if (previewPosition) previewPosition = flipPoint(previewPosition);
  }
  renderTrajectorySvg(svg, moves, previewPosition);
  if ($("#serialSource")?.value === "editor") renderSerialTrajectory($("#gcodeEditor").value, $("#gcodeName").value);
}
function renderTrajectorySvg(svg, moves, previewPosition = null) {
  const pts = moves.flatMap(m => [m.from, m.to]); if (!pts.length) { svg.innerHTML = ""; svg.removeAttribute("viewBox"); return; }
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), pad = Math.max(5, (Math.max(...xs)-Math.min(...xs))*.05);
  svg.setAttribute("viewBox", `${Math.min(...xs)-pad} ${Math.min(...ys)-pad} ${Math.max(...xs)-Math.min(...xs)+2*pad || 10} ${Math.max(...ys)-Math.min(...ys)+2*pad || 10}`);
  svg.innerHTML = moves.map(m => `<line x1="${m.from.x}" y1="${m.from.y}" x2="${m.to.x}" y2="${m.to.y}" stroke="${m.type === "draw" ? "#087985" : "#df8a32"}" stroke-width="0.5" ${m.type === "travel" ? 'stroke-dasharray="2 2"' : ""} vector-effect="non-scaling-stroke"/>`).join("") + (previewPosition ? `<circle cx="${previewPosition.x}" cy="${previewPosition.y}" r="2" fill="#d02f52" vector-effect="non-scaling-stroke"/>` : "");
}
function renderSerialTrajectory(code, name = "送信データ") {
  renderTrajectorySvg($("#serialTrajectorySvg"), parseGcodeMoves(String(code || "")), state.position);
  $("#serialTrajectoryName").textContent = name || "送信データ";
}
function renderSelectedSerialTrajectory() {
  const payload = selectedSerialPayload();
  renderSerialTrajectory(payload.code, payload.name);
}
function scrollToSerialTrajectory() {
  requestAnimationFrame(() => requestAnimationFrame(() => $("#serialTrajectoryCard").scrollIntoView({ behavior: "smooth", block: "start" })));
}
function openSerialTrajectory(code, name) {
  switchTab("serial");
  renderSerialTrajectory(code, name);
  scrollToSerialTrajectory();
}
function parseGcodeMoves(code) {
  let pos = { x: 0, y: 0 }, absolute = true; const moves = [];
  for (const raw of code.split(/\r?\n/)) {
    const line = raw.replace(/;.*|\([^)]*\)/g, "").trim().toUpperCase();
    if (/\bG90\b/.test(line)) absolute = true; if (/\bG91\b/.test(line)) absolute = false;
    const motion = line.match(/\bG([01])\b/); if (!motion) continue;
    const xm = line.match(/\bX(-?\d*\.?\d+)/), ym = line.match(/\bY(-?\d*\.?\d+)/); if (!xm && !ym) continue;
    const to = { x: xm ? (absolute ? +xm[1] : pos.x + +xm[1]) : pos.x, y: ym ? (absolute ? +ym[1] : pos.y + +ym[1]) : pos.y };
    moves.push({ type: motion[1] === "0" ? "travel" : "draw", from: { ...pos }, to }); pos = to;
  }
  return moves;
}

function bindEditor() {
  $("#gcodeEditor").addEventListener("input", () => { state.previewNormalizeY = false; updateEditorStats(); if (state.previewMode === "gcode") renderGcodePreview(); });
  $("#gcodeName").addEventListener("input", () => updateSdFilenameFromSource(true));
  $("#saveGcode").addEventListener("click", saveCurrentGcode); $("#downloadGcode").addEventListener("click", downloadGcode); $("#downloadSdGcode").addEventListener("click", downloadSdGcode);
  $("#transferToRtheta").addEventListener("click", transferToRthetaControl);
  $("#newGcode").addEventListener("click", () => loadEditor(null)); $("#duplicateGcode").addEventListener("click", duplicateGcode);
  $("#renameGcode").addEventListener("click", renameGcode); $("#deleteGcode").addEventListener("click", deleteGcode);
  $("#gcodeLibrary").addEventListener("change", e => loadEditor(e.target.value));
  $("#gcodeFile").addEventListener("change", event => event.target.files[0] && loadGcodeFile(event.target.files[0]));
  $("#sendFromEditor").addEventListener("click", () => { const code=$("#gcodeEditor").value,name=$("#gcodeName").value; openSerialTrajectory(code,name); $("#sdFilename").value = sanitizeSdFilename(name); startConfiguredTransfer(code,name); });
}
function rthetaTransferStatus(message, failed = false) {
  const status = $("#rthetaTransferStatus");
  status.textContent = message;
  status.classList.toggle("error", failed);
}
function clearRthetaTransfer() {
  if (!state.rthetaTransfer) return;
  clearInterval(state.rthetaTransfer.timer);
  clearTimeout(state.rthetaTransfer.timeout);
  state.rthetaTransfer = null;
}
function transferToRthetaControl() {
  const gcode = $("#gcodeEditor").value;
  if (!gcode.trim()) return toast("転送するG-codeがありません");
  readSettings();
  let url;
  try {
    url = new URL(state.settings.rthetaControlUrl || DEFAULTS.rthetaControlUrl, location.href);
    if (!/^https?:$/.test(url.protocol)) throw new Error("unsupported protocol");
  } catch (_) {
    rthetaTransferStatus("設定のRθ Control Web URLを確認してください。", true);
    return toast("Rθ Control Web URLが正しくありません");
  }
  saveJSON("plotterflow.settings", state.settings);
  clearRthetaTransfer();
  const target = window.open(url.href, "plotterflow-rtheta-control");
  if (!target) {
    rthetaTransferStatus("ポップアップを許可して、もう一度転送してください。", true);
    return toast("Rθ Control Webを開けませんでした");
  }
  const payload = {
    type: "plotterflow:gcode-transfer", version: 1,
    name: ensureExt($("#gcodeName").value.trim() || "untitled.gcode"), gcode
  };
  const send = () => {
    try {
      target.postMessage({ type: "plotterflow:hello", version: 1 }, url.origin);
      target.postMessage(payload, url.origin);
    } catch (_) { /* navigation中は次のretryへ任せる */ }
  };
  const transfer = { target, origin: url.origin, payload, timer: setInterval(send, 500), timeout: 0 };
  transfer.timeout = setTimeout(() => {
    if (state.rthetaTransfer !== transfer) return;
    clearRthetaTransfer();
    rthetaTransferStatus("Control Webの起動を確認し、必要ならもう一度転送してください。", true);
  }, 15000);
  state.rthetaTransfer = transfer;
  rthetaTransferStatus("Rθ Control Webを開いて転送しています…");
  send();
}
window.addEventListener("message", event => {
  const transfer = state.rthetaTransfer;
  if (!transfer || event.source !== transfer.target || event.origin !== transfer.origin) return;
  if (event.data?.type === "rtheta-control:ready") {
    transfer.target.postMessage(transfer.payload, transfer.origin);
  }
  if (event.data?.type === "rtheta-control:gcode-accepted") {
    const name = event.data.name || transfer.payload.name;
    clearRthetaTransfer();
    rthetaTransferStatus(`${name}を転送しました。Control Webで内容を確認してから実行してください。`);
    toast("Rθ Control Webへ転送しました");
  }
});
async function loadGcodeFile(file) {
  if (!/\.(gcode|nc|tap|txt)$/i.test(file.name)) return toast("G-codeファイルを選択してください");
  state.currentId = null; state.previewNormalizeY = false;
  $("#gcodeName").value = ensureExt(file.name); $("#gcodeEditor").value = await file.text();
  $("#gcodeLibrary").value = ""; updateEditorStats(); renderGcodePreview(); toast(`${file.name}を読み込みました`);
}
function updateEditorStats() { const text = $("#gcodeEditor").value, lines = text ? text.split(/\r?\n/).length : 0; $("#gcodeStats").textContent = `${lines}行 / ${new Blob([text]).size} bytes`; }
function refreshLibrary() {
  const select = $("#gcodeLibrary"), source = $("#serialSource");
  const options = state.library.sort((a,b) => b.updated-a.updated).map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join("");
  select.innerHTML = `<option value="">未選択</option>${options}`; source.innerHTML = `<option value="editor">現在のエディタ</option><option value="__reload__">リロード動作（設定）</option>${options}`;
  if (state.currentId) select.value = state.currentId; renderJobs();
  window.dispatchEvent(new CustomEvent("plotterflow:gcode-library-changed"));
}
function saveCurrentGcode() {
  const name = ensureExt($("#gcodeName").value.trim() || "untitled.gcode"), gcode = $("#gcodeEditor").value;
  let item = state.library.find(x => x.id === state.currentId);
  if (item) Object.assign(item, { name, gcode, settings: { ...state.settings }, updated: Date.now() });
  else { item = { id: uid(), name, gcode, settings: { ...state.settings }, updated: Date.now() }; state.library.push(item); state.currentId = item.id; }
  saveJSON("plotterflow.library", state.library); refreshLibrary(); toast("G-codeを保存しました");
}
function loadEditor(id) { const item = state.library.find(x => x.id === id); state.currentId = item?.id || null; state.previewNormalizeY = false; $("#gcodeName").value = item?.name || "untitled.gcode"; $("#gcodeEditor").value = item?.gcode || ""; updateEditorStats(); updateSdFilenameFromSource(true); renderGcodePreview(); }
function duplicateGcode() { const item = state.library.find(x => x.id === state.currentId); if (!item) return toast("複製するG-codeを選択してください"); state.currentId = null; $("#gcodeName").value = item.name.replace(/(\.gcode)?$/, "-copy.gcode"); saveCurrentGcode(); }
function renameGcode() { const item = state.library.find(x => x.id === state.currentId); if (!item) return toast("名前を変更する項目を選択してください"); const name = prompt("新しい名前", item.name); if (name) { item.name = ensureExt(name); item.updated = Date.now(); saveJSON("plotterflow.library", state.library); refreshLibrary(); $("#gcodeName").value = item.name; } }
function deleteGcode() { if (!state.currentId || !confirm("選択中のG-codeを削除しますか？")) return; state.library = state.library.filter(x => x.id !== state.currentId); saveJSON("plotterflow.library", state.library); loadEditor(null); refreshLibrary(); }
function downloadGcode() { const blob = new Blob([$("#gcodeEditor").value], { type: "text/plain" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = ensureExt($("#gcodeName").value); a.click(); URL.revokeObjectURL(a.href); }
function downloadSdGcode() {
  if (!isSts3215DirectAxes()) return toast("STS3215 XYZ直結プロファイルを選択してください");
  const setup = [sts3215AxisConfigCommand(), "M17", "G21", "G90", "G10 L20 P0 X0 Y0"];
  const body = cleanLines($("#gcodeEditor").value);
  const text = [...setup, ...body, "M18", ""].join("\n");
  const blob = new Blob([text], { type: "text/plain" }), a = document.createElement("a");
  const sourceName = ensureExt($("#gcodeName").value.trim() || "untitled.gcode");
  a.href = URL.createObjectURL(blob);
  a.download = sourceName.replace(/\.(gcode|nc|tap)$/i, "-sd.gcode");
  a.click(); URL.revokeObjectURL(a.href);
  toast("GEEK本体SD用G-codeをダウンロードしました");
}
function ensureExt(name) { return /\.(gcode|nc|tap)$/i.test(name) ? name : `${name}.gcode`; }
function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

function bindSettings() {
  $("#settingsForm").addEventListener("submit", e => { e.preventDefault(); readSettings(); saveJSON("plotterflow.settings", state.settings); $("#svgOrientationFlip").checked=state.settings.yFlip; $("#serialBaud").value = state.settings.baudrate; updateSerialProfileDisplay(); $("#settingsStatus").textContent = "保存しました。"; toast("設定を保存しました"); });
  $("#developmentModeToggle").addEventListener("change", handleDevelopmentModeChange);
  $("#controllerProfile").addEventListener("change", event => applyControllerProfile(event.target.value));
  $("#resetSettings").addEventListener("click", () => { if (confirm("設定を初期値へ戻しますか？")) { state.settings = { ...DEFAULTS }; populateSettings(); saveJSON("plotterflow.settings", state.settings); } });
}
function populateSettings() { const f = $("#settingsForm"); renderDevelopmentMode(); for (const [k,v] of Object.entries(state.settings)) if (f.elements[k]) f.elements[k].type === "checkbox" ? f.elements[k].checked = !!v : f.elements[k].value = v; $("#svgOrientationFlip").checked=state.settings.yFlip; $("#serialBaud").value = state.settings.baudrate; populateJogSettings(); renderControllerProfile(); updateSerialProfileDisplay(); }
function readSettings() { const f = $("#settingsForm"); for (const k of Object.keys(DEFAULTS)) if (f.elements[k]) state.settings[k] = f.elements[k].type === "checkbox" ? f.elements[k].checked : f.elements[k].type === "number" ? +f.elements[k].value : f.elements[k].value; }
function developmentModeBusy() {
  return !!(state.port || state.sending || state.jogging || state.sdUploading || state.sdManagementActive);
}
function renderDevelopmentMode() {
  const toggle = $("#developmentModeToggle"), select = $("#controllerProfile");
  if (toggle) toggle.checked = state.developmentMode;
  document.documentElement.dataset.developmentMode = state.developmentMode ? "true" : "false";
  if (select) {
    const selected = state.settings.controllerProfile;
    select.replaceChildren(...Object.entries(CONTROLLER_PROFILES)
      .filter(([, profile]) => state.developmentMode || !profile.development)
      .map(([id, profile]) => new Option(profile.label, id, false, id === selected)));
  }
  const experimentalOptimization = $('#settingsForm [name="optimization"] option[value="overlap_down"]');
  if (experimentalOptimization) {
    experimentalOptimization.hidden = !state.developmentMode;
    experimentalOptimization.disabled = !state.developmentMode;
  }
  const stsSettings = $("#stsDirectAxesSettings");
  if (stsSettings) stsSettings.hidden = !isSts3215DirectAxes();
}
function handleDevelopmentModeChange(event) {
  const requested = event.target.checked;
  if (developmentModeBusy()) {
    event.target.checked = state.developmentMode;
    return toast("Serial接続・送信・ジョグ・SD操作中は開発中機能を切り替えられません");
  }
  const leavesDevelopmentProfile = !requested && isDevelopmentProfile();
  const leavesExperimentalOptimization = !requested && state.settings.optimization === "overlap_down";
  if ((leavesDevelopmentProfile || leavesExperimentalOptimization) && !confirm("開発中機能を非表示にして、通常設定へ切り替えますか？")) {
    event.target.checked = true;
    return;
  }
  state.developmentMode = requested;
  localStorage.setItem(DEVELOPMENT_MODE_KEY, requested ? "1" : "0");
  if (leavesExperimentalOptimization) state.settings.optimization = "overlap_up";
  if (leavesDevelopmentProfile) return applyControllerProfile("grbl-fluidnc");
  populateSettings();
  saveJSON("plotterflow.settings", state.settings);
  toast(requested ? "開発中機能を表示しました" : "開発中機能を非表示にしました");
}
function applyControllerProfile(profileId) {
  if (state.sdManagementActive && profileId !== state.settings.controllerProfile) {
    $("#controllerProfile").value = state.settings.controllerProfile;
    return toast("SDカード管理を終了してからプロファイルを変更してください");
  }
  const previousProfile = state.settings.controllerProfile;
  const profile = CONTROLLER_PROFILES[profileId] || CONTROLLER_PROFILES.custom;
  if (profile.development && !state.developmentMode) {
    $("#controllerProfile").value = previousProfile;
    return toast("先に「開発中機能を表示」を有効にしてください");
  }
  if (previousProfile === "pico2-drv8835-planar" && profileId !== previousProfile && state.positionTelemetryEnabled) void setPositionTelemetryEnabled(false);
  state.settings.controllerProfile = profileId;
  if (profile.settings) Object.assign(state.settings, profile.settings);
  populateSettings();
  saveJSON("plotterflow.settings", state.settings);
  $("#settingsStatus").textContent = `${profile.label}を反映しました。必要に応じて各値を調整して保存してください。`;
  toast(`${profile.label}を反映しました`);
}
function activeControllerProfile() { return CONTROLLER_PROFILES[state.settings.controllerProfile] || CONTROLLER_PROFILES.custom; }
function isSts3215DirectAxes() { return activeControllerProfile().capabilities?.directAxes === true; }
function sts3215AxisConfigCommand() {
  const s = state.settings;
  const id = key => Math.max(0, Math.min(253, Math.round(+s[key] || 0)));
  const ppm = key => Math.max(0.001, Math.min(28672, +s[key] || 128));
  return `M950 X${id("stsAxisXId")} Y${id("stsAxisYId")} Z${id("stsAxisZId")} ` +
    `PX${fmt(ppm("stsAxisXPulsesPerMm"))} PY${fmt(ppm("stsAxisYPulsesPerMm"))} PZ${fmt(ppm("stsAxisZPulsesPerMm"))} ` +
    `IX${s.stsAxisXInvert ? 1 : 0} IY${s.stsAxisYInvert ? 1 : 0} IZ${s.stsAxisZInvert ? 1 : 0} EZ${s.stsAxisZEnabled ? 1 : 0}`;
}
function sts3215SetupLines() { return isSts3215DirectAxes() ? [sts3215AxisConfigCommand(), "M17"] : []; }
function renderControllerProfile() {
  const profile = activeControllerProfile(), host = $("#controllerProfileDescription");
  if (!host) return;
  host.innerHTML = `<div class="profile-description-heading"><strong>${escapeHtml(profile.label)}</strong><span>${escapeHtml(profile.phase)}</span></div><p>${escapeHtml(profile.summary)}</p><ul>${profile.notes.map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
}
function updateSerialProfileDisplay() {
  const profile = activeControllerProfile(), badge = $("#serialControllerProfile"), button = $("#initializeController");
  if (badge) badge.textContent = profile.label;
  if (button) {
    const command = String(state.settings.initializeCommand || "").trim();
    button.hidden = !command;
    button.textContent = command ? `初期化 (${command})` : "初期化";
  }
  updateSerialDestinationUi();
  updateJogProfileUi();
  updatePlanarArmVisibility();
  const sdDownload = $("#downloadSdGcode");
  if (sdDownload) sdDownload.hidden = !isSts3215DirectAxes();
  const stsSettings = $("#stsDirectAxesSettings");
  if (stsSettings) stsSettings.hidden = !isSts3215DirectAxes();
}

function isPicoDrv8835Profile() { return state.settings.controllerProfile === "pico2-drv8835-planar"; }
function updatePlanarArmVisibility() {
  const panel = $("#planarArmPanel");
  if (!panel) return;
  panel.hidden = !isPicoDrv8835Profile();
  if (panel.hidden && state.positionTelemetryEnabled) disablePositionTelemetry(false);
  renderPlanarArm();
}

function supportsSdUpload() {
  return activeControllerProfile().capabilities?.sdUpload === true;
}
function supportsSdManagement() {
  return activeControllerProfile().capabilities?.sdManagement === true;
}
function effectiveSerialDestination() {
  return supportsSdUpload() && state.settings.serialDestination === "sd" ? "sd" : "execute";
}
function sanitizeSdFilename(name) {
  const source = String(name || "").split(/[\\/]/).pop();
  const extensionMatch = source.match(/\.(gcode|gc|nc|tap)$/i);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : ".gcode";
  const rawStem = extensionMatch ? source.slice(0, -extensionMatch[0].length) : source;
  const stem = rawStem.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "") || "plot";
  return `${stem.slice(0, 48 - extension.length)}${extension}`;
}
function selectedSerialPayload() {
  const id = $("#serialSource").value;
  if (id === "editor") return { code: $("#gcodeEditor").value, name: $("#gcodeName").value };
  if (id === "__reload__") return { code: state.settings.reloadGcode, name: "reload.gcode", reload: true };
  const item = state.library.find(entry => entry.id === id);
  return { code: item?.gcode || "", name: item?.name || "plot.gcode" };
}
function updateSdFilenameFromSource(force = false) {
  const input = $("#sdFilename");
  if (!input) return;
  const suggested = sanitizeSdFilename(selectedSerialPayload().name);
  if (force || !input.value) input.value = suggested;
}
function updateSerialDestinationUi() {
  const group = $("#serialDestinationGroup");
  if (!group) return;
  const supported = supportsSdUpload();
  group.hidden = !supported;
  const mode = $("#m5OperationMode");
  if (!supportsSdManagement()) mode.value = "normal";
  const managerSelected = supportsSdManagement() && mode.value === "sd-manager";
  const destination = $("#serialDestination");
  destination.value = supported && state.settings.serialDestination === "sd" ? "sd" : "execute";
  const sdSelected = supported && !managerSelected && destination.value === "sd";
  $("#serialDestinationLabel").hidden = managerSelected;
  $("#sdFilenameLabel").hidden = !sdSelected;
  $("#sdTransferHint").hidden = !sdSelected;
  $("#serialTransferControls").hidden = managerSelected;
  $("#sdManager").hidden = !managerSelected;
  $("#startSend").textContent = sdSelected ? "SDカードへ転送" : "送信開始";
  $("#sendFromEditor").textContent = sdSelected ? "SDカードへ転送" : "Serialで送信";
  if (sdSelected) updateSdFilenameFromSource(false);
  renderSdFileList();
}

function bindSerial() {
  $("#connectSerial").addEventListener("click", connectSerial); $("#disconnectSerial").addEventListener("click", disconnectSerial);
  $("#serialBaud").addEventListener("change", e => { state.settings.baudrate = +e.target.value || 115200; saveJSON("plotterflow.settings", state.settings); });
  $("#serialDestination").addEventListener("change", event => {
    state.settings.serialDestination = event.target.value === "sd" ? "sd" : "execute";
    saveJSON("plotterflow.settings", state.settings);
    updateSerialDestinationUi();
  });
  $("#m5OperationMode").addEventListener("change", async event => {
    if (event.target.value === "sd-manager") {
      await enterSdManagement();
    } else {
      await exitSdManagement();
    }
    updateSerialDestinationUi();
  });
  $("#refreshSdFiles").addEventListener("click", refreshSdFiles);
  $("#closeSdManager").addEventListener("click", async () => {
    $("#m5OperationMode").value = "normal";
    await exitSdManagement();
    updateSerialDestinationUi();
  });
  $("#serialSource").addEventListener("change", () => { updateSdFilenameFromSource(true); renderSelectedSerialTrajectory(); });
  $("#sdFilename").addEventListener("change", event => { event.target.value = sanitizeSdFilename(event.target.value); });
  populateJogSettings();
  $("#jogStep").addEventListener("change", saveJogSettings); $("#jogFeed").addEventListener("input", updateJogPreview); $("#jogFeed").addEventListener("change", saveJogSettings);
  $$('[data-jog-axis]').forEach(button => button.addEventListener("click", () => sendJog(
    button.dataset.jogAxis, +button.dataset.jogSign, +(button.dataset.jogDegrees || 0) || null
  )));
  $("#keyboardJogToggle").addEventListener("change", event => setKeyboardJogEnabled(event.target.checked));
  document.addEventListener("keydown", handleKeyboardJog);
  $("#jogCancel").addEventListener("click", cancelJog); updateJogPreview();
  $("#setXyZero").addEventListener("click", setCurrentXyZero); updateSerialPositionDisplay();
  $("#positionTelemetryToggle").addEventListener("change", event => setPositionTelemetryEnabled(event.target.checked));
  $("#armJ1Invert").addEventListener("change", saveArmCalibrationFromUi);
  $("#armJ2Invert").addEventListener("change", saveArmCalibrationFromUi);
  $("#calibrateArmDown").addEventListener("click", calibrateArmDown);
  renderPlanarArm();
  $("#initializeController").addEventListener("click", initializeController);
  $$('[data-command]').forEach(b => b.addEventListener("click", () => sendRealtime(b.dataset.command + "\n")));
  $("#sendManual").addEventListener("click", () => { const c = $("#manualCommand").value; if (c) sendRealtime(c + "\n"); });
  $("#penUpButton").addEventListener("click", () => sendRealtime(state.settings.penUpCommand + "\n")); $("#penDownButton").addEventListener("click", () => sendRealtime(state.settings.penDownCommand + "\n"));
  $("#reloadButton").addEventListener("click", () => { notifyReloadSimulation(); startSending(state.settings.reloadGcode); });
  $("#pauseSend").addEventListener("click", pauseSending); $("#resumeSend").addEventListener("click", resumeSending); $("#stopSend").addEventListener("click", stopSending); $("#resetController").addEventListener("click", resetController);
  $("#startSend").addEventListener("click", () => {
    const payload = selectedSerialPayload();
    if (payload.reload && effectiveSerialDestination() === "execute") notifyReloadSimulation(payload.code);
    renderSerialTrajectory(payload.code, payload.name);
    scrollToSerialTrajectory();
    startConfiguredTransfer(payload.code, payload.name);
  });
  $("#scrollToSerialControls").addEventListener("click", () => $("#serialSendPanel").scrollIntoView({ behavior: "smooth", block: "start" }));
  renderSelectedSerialTrajectory();
  $("#clearLog").addEventListener("click", () => $("#serialLog").innerHTML = "");
}
async function connectSerial() {
  if (!("serial" in navigator)) return toast("このブラウザはWeb Serialに対応していません");
  try {
    state.port = await navigator.serial.requestPort(); await state.port.open({ baudRate: +$("#serialBaud").value || 115200 }); state.writer = state.port.writable.getWriter();
    $("#connectionBadge").textContent = "Serial: 接続済み"; $("#connectionBadge").classList.add("connected"); log(`接続しました / ${activeControllerProfile().label}`, "rx"); readSerial(); startStatusPolling(); updateSerialProfileDisplay();
  } catch (e) { log(`接続エラー: ${e.message}`, "rx"); }
}
async function readSerial() {
  const decoder = new TextDecoder(); state.reader = state.port.readable.getReader();
  try { while (state.port) { const { value, done } = await state.reader.read(); if (done) break; state.readBuffer += decoder.decode(value, { stream:true }); const lines = state.readBuffer.split(/\r?\n/); state.readBuffer = lines.pop(); lines.forEach(handleSerialLine); } }
  catch (e) { if (state.port) log(`受信エラー: ${e.message}`, "rx"); }
  finally { try { state.reader?.releaseLock(); } catch {} state.reader = null; }
}
function handleSerialLine(line) {
  const text = line.trim();
  if (!text) return;
  state.lastReceivedLine = text;
  if (/^<.*>$/.test(text)) { parseControllerStatus(text); return; }
  if (text === "[SDLIST:BEGIN]") {
    state.sdFiles = [];
    state.sdListReceiving = true;
    renderSdFileList();
    return;
  }
  const sdFile = text.match(/^\[SDLIST:FILE name=([A-Za-z0-9._-]+) size=(\d+)\]$/);
  if (sdFile) {
    state.sdFiles.push({ name: sdFile[1], size: Number(sdFile[2]) });
    return;
  }
  const sdListEnd = text.match(/^\[SDLIST:END count=(\d+)\]$/);
  if (sdListEnd) {
    state.sdListReceiving = false;
    renderSdFileList();
    return;
  }
  const sdMode = text.match(/^\[MSG:SDMODE active=([01])\]$/);
  if (sdMode) {
    state.sdManagementActive = sdMode[1] === "1";
    $("#sdManagerStatus").textContent = state.sdManagementActive ? "接続済み・同期できます" : "管理モードを終了しました";
    return;
  }
  if (/^ok\b/i.test(text)) {
    state.lastOkAt = Date.now();
    state.okWaiters.shift()?.resolve(text);
    if (!state.sending) log(text, "rx");
    return;
  }
  if (/^(error|alarm):?/i.test(text)) {
    log(text, "rx");
    state.okWaiters.shift()?.reject(new Error(text));
    return;
  }
  if (!state.sending || shouldLogPicoPlanarDebug(text)) log(text, "rx");
}
function shouldLogPicoPlanarDebug(text) {
  if (state.settings.controllerProfile === "pico2-tmc2209-planar") {
    return /^\[MSG:PFDBG(?:\s|\])/i.test(text);
  }
  if (state.settings.controllerProfile === "pico2-drv8835-planar") {
    return /^\[MSG:(?:DRV8835|M980)(?:\s|\])/i.test(text);
  }
  return state.settings.controllerProfile === "m5stack-drv8835-planar" &&
    /^\[MSG:(?:DRV8835|M980|SDUPLOAD|SDMODE|SDFILE)(?:\s|\])/i.test(text);
}
async function disconnectSerial() {
  stopStatusPolling();
  if (state.writer && state.positionTelemetryEnabled) {
    try { await rawWrite("M983 S0\n", false); await sleep(50); }
    catch (error) { log(`切断前位置センサ通信停止失敗: ${error.message}`, "rx"); }
  }
  if (state.writer && state.sdUploading) {
    try { await rawWrite("\x18", false); log("SD upload cancel before disconnect (Ctrl-X)", "tx"); await sleep(100); }
    catch (error) { log(`切断前SD転送中止失敗: ${error.message}`, "rx"); }
  }
  if (state.writer && !state.sdUploading && state.settings.stopStrategy === "cancel-pen-up" && (state.sending || state.jogging)) {
    try { await state.writer.write(new Uint8Array([0x85])); log("Motion cancel before disconnect (0x85)", "tx"); await sleep(250); }
    catch (error) { log(`切断前キャンセル失敗: ${error.message}`, "rx"); }
  }
  if (state.writer && state.sdManagementActive) {
    try { await rawWrite("M22\n", false); await sleep(100); }
    catch (error) { log(`切断前SD管理終了失敗: ${error.message}`, "rx"); }
  }
  const disconnectCommand = String(state.settings.disconnectCommand || "").trim();
  if (state.writer && disconnectCommand) {
    try { await rawWrite(disconnectCommand + "\n"); await sleep(150); }
    catch (error) { log(`切断コマンド失敗: ${error.message}`, "rx"); }
  }
  state.stopped = true; clearOkWaiters("切断");
  try { await state.reader?.cancel(); } catch {} try { state.writer?.releaseLock(); state.writer = null; await state.port?.close(); } catch (e) { log(`切断エラー: ${e.message}`, "rx"); }
  state.port = null; state.sdUploading=false; state.sdManagementActive=false; state.sdFiles=[]; state.sdListReceiving=false; $("#m5OperationMode").value="normal"; updateSerialDestinationUi(); state.controllerState="未接続"; state.machinePosition=null; state.workPosition=null; state.workOffset=null; disablePositionTelemetry(false); updateSerialPositionDisplay(); $("#connectionBadge").textContent = "Serial: 未接続"; $("#connectionBadge").classList.remove("connected"); log("切断しました", "rx");
}
async function rawWrite(text, shouldLog = true) { if (!state.writer) throw new Error("Serial未接続です"); await state.writer.write(new TextEncoder().encode(text)); if (shouldLog) log(text.replace(/[\r\n]+$/, "") || "Ctrl-X", "tx"); }
async function sendRealtime(text) {
  if (state.sdUploading && text !== "\x18" && text !== "\x85") {
    return toast("SD転送中は停止以外の手動コマンドを送信できません");
  }
  if (state.sdManagementActive && text !== "\x18" && text !== "\x85") {
    return toast("SDカード管理中は通常コマンドを送信できません");
  }
  try { await rawWrite(text); } catch (e) { toast(e.message); }
}
function clearOkWaiters(reason = "キャンセル") {
  state.okWaiters.splice(0).forEach(w => w.reject(new Error(reason)));
}
function waitOk(timeout = 15000, meta = {}) {
  timeout = Math.max(1000, +(timeout || state.settings.okTimeoutMs) || 15000);
  return new Promise((resolve,reject) => {
    const item = {
      ...meta,
      startedAt: Date.now(),
      resolve: value => { clearTimeout(item.timer); resolve(value); },
      reject: e => { clearTimeout(item.timer); reject(e); }
    };
    item.timer = setTimeout(() => {
      const i=state.okWaiters.indexOf(item); if(i>=0) state.okWaiters.splice(i,1);
      logOkTimeoutDebug(item, timeout);
      reject(new Error("ok応答がタイムアウトしました"));
    }, timeout);
    state.okWaiters.push(item);
  });
}
async function sendLineAndWait(line, trackPosition = true, meta = {}) {
  const pending = waitOk(null, { line, ...meta });
  state.lastSentLine = line; state.lastSendAt = Date.now();
  await rawWrite(line + "\n", false);
  await pending;
  if (trackPosition) updatePosition(line);
}
function formatSdFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function renderSdFileList() {
  const list = $("#sdFileList");
  if (!list) return;
  list.replaceChildren();
  if (state.sdListReceiving) {
    const loading = document.createElement("p");
    loading.className = "muted";
    loading.textContent = "SDカードを読み込み中...";
    list.append(loading);
    return;
  }
  if (!state.sdFiles.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = state.sdManagementActive ? "対応するG-codeファイルはありません" : "SDカード管理モードを選ぶと一覧を同期します";
    list.append(empty);
    return;
  }
  for (const file of state.sdFiles) {
    const row = document.createElement("div");
    row.className = "sd-file-row";
    const name = document.createElement("input");
    name.value = file.name;
    name.maxLength = 48;
    name.inputMode = "latin";
    name.spellcheck = false;
    name.setAttribute("aria-label", `${file.name}の新しいファイル名`);
    const size = document.createElement("span");
    size.className = "sd-file-size";
    size.textContent = formatSdFileSize(file.size);
    const rename = document.createElement("button");
    rename.textContent = "名前変更";
    rename.addEventListener("click", () => renameSdFile(file.name, name.value));
    const remove = document.createElement("button");
    remove.className = "danger";
    remove.textContent = "削除";
    remove.addEventListener("click", () => deleteSdFile(file.name));
    row.append(name, size, rename, remove);
    list.append(row);
  }
}
async function synchronizeSdFileList() {
  state.sdListReceiving = true;
  state.sdFiles = [];
  renderSdFileList();
  await sendLineAndWait("M20", false);
  state.sdListReceiving = false;
  renderSdFileList();
  $("#sdManagerStatus").textContent = `${state.sdFiles.length}件を同期しました`;
}
async function enterSdManagement() {
  if (!supportsSdManagement()) return toast("このプロファイルはSDカード管理に対応していません");
  if (!state.writer) {
    $("#m5OperationMode").value = "normal";
    updateSerialDestinationUi();
    return toast("先にSerial接続してください");
  }
  if (state.sending || state.jogging) {
    $("#m5OperationMode").value = "normal";
    updateSerialDestinationUi();
    return toast("送信・ジョグ中はSDカード管理へ切り替えられません");
  }
  stopStatusPolling();
  clearOkWaiters("SD管理開始");
  state.sending = true;
  $("#sdManagerStatus").textContent = "M5StackをSDカード管理へ切替中...";
  updateSerialDestinationUi();
  try {
    await sendLineAndWait("M21", false);
    state.sdManagementActive = true;
    await synchronizeSdFileList();
    toast("SDカードの一覧を同期しました");
  } catch (error) {
    state.sdListReceiving = false;
    log(`SD管理開始エラー: ${error.message}`, "rx");
    $("#sdManagerStatus").textContent = `同期失敗: ${error.message}`;
    if (!state.sdManagementActive) $("#m5OperationMode").value = "normal";
  } finally {
    state.sending = false;
    clearOkWaiters("SD管理開始終了");
    updateSerialDestinationUi();
  }
}
async function refreshSdFiles() {
  if (!state.writer) return toast("先にSerial接続してください");
  if (!state.sdManagementActive) return enterSdManagement();
  if (state.sending) return toast("別のSerial処理が完了するまで待ってください");
  clearOkWaiters("SD再同期");
  state.sending = true;
  try {
    await synchronizeSdFileList();
    toast("SDカードの一覧を再同期しました");
  } catch (error) {
    state.sdListReceiving = false;
    log(`SD再同期エラー: ${error.message}`, "rx");
    $("#sdManagerStatus").textContent = `同期失敗: ${error.message}`;
  } finally {
    state.sending = false;
    clearOkWaiters("SD再同期終了");
    renderSdFileList();
  }
}
async function exitSdManagement() {
  if (!state.sdManagementActive) {
    state.sdFiles = [];
    state.sdListReceiving = false;
    renderSdFileList();
    return;
  }
  if (!state.writer || state.sending) return;
  clearOkWaiters("SD管理終了");
  state.sending = true;
  try {
    await sendLineAndWait("M22", false);
    state.sdManagementActive = false;
    state.sdFiles = [];
    $("#sdManagerStatus").textContent = "管理モードを終了しました";
  } catch (error) {
    log(`SD管理終了エラー: ${error.message}`, "rx");
    toast("SDカード管理を終了できませんでした");
  } finally {
    state.sending = false;
    clearOkWaiters("SD管理終了完了");
    renderSdFileList();
    if (!state.sdManagementActive && state.port && state.writer) startStatusPolling();
  }
}
async function renameSdFile(oldName, requestedName) {
  if (!state.sdManagementActive || state.sending) return;
  const newName = sanitizeSdFilename(requestedName);
  if (newName === oldName) return toast("ファイル名は変更されていません");
  clearOkWaiters("SDファイル名変更");
  state.sending = true;
  try {
    await sendLineAndWait(`M993 ${oldName} ${newName}`, false);
    await synchronizeSdFileList();
    toast(`${oldName}を${newName}へ変更しました`);
  } catch (error) {
    state.sdListReceiving = false;
    log(`SD名前変更エラー: ${error.message}`, "rx");
    toast("SDファイル名を変更できませんでした");
  } finally {
    state.sending = false;
    clearOkWaiters("SDファイル名変更終了");
    renderSdFileList();
  }
}
async function deleteSdFile(name) {
  if (!state.sdManagementActive || state.sending) return;
  if (!confirm(`${name}をSDカードから削除しますか？`)) return;
  clearOkWaiters("SDファイル削除");
  state.sending = true;
  try {
    await sendLineAndWait(`M30 ${name}`, false);
    await synchronizeSdFileList();
    toast(`${name}を削除しました`);
  } catch (error) {
    state.sdListReceiving = false;
    log(`SD削除エラー: ${error.message}`, "rx");
    toast("SDファイルを削除できませんでした");
  } finally {
    state.sending = false;
    clearOkWaiters("SDファイル削除終了");
    renderSdFileList();
  }
}
async function initializeController() {
  if (!state.writer) return toast("先にSerial接続してください");
  if (state.sdManagementActive) return toast("SDカード管理を終了してから初期化してください");
  if (state.sending || state.jogging) return toast("送信・ジョグ中は初期化できません");
  const commands = [...(isSts3215DirectAxes() ? [sts3215AxisConfigCommand()] : []), ...cleanLines(String(state.settings.initializeCommand || ""))];
  if (!commands.length) return toast("このプロファイルに初期化コマンドはありません");
  try {
    for (const command of commands) await sendLineAndWait(command, false);
    if (activeControllerProfile().capabilities?.statusPolling !== false) await rawWrite("?", false);
    toast("コントローラーを初期化しました");
  } catch (error) {
    log(`初期化エラー: ${error.message}`, "rx");
    toast("コントローラーの初期化に失敗しました");
  }
}
function saveJogSettings() {
  state.settings.jogStep = Math.max(.001, +$("#jogStep").value || 1); state.settings.jogFeed = Math.max(1, +$("#jogFeed").value || 1000);
  saveJSON("plotterflow.settings", state.settings); updateJogPreview();
}
const STANDARD_JOG_STEPS = [0.15625, 0.625, 0.1, 1, 2.5, 10, 40, 50];
const XL330_TEST_JOG_STEPS = [0.015625, 0.0625, 0.25, 1, 2];
const STS3215_TEST_JOG_STEPS = [11.25, 45, 90, 180, 360, 720, 1080, 1800, 2520];
function isXl330TestJog() { return activeControllerProfile().capabilities?.jogCommand === "xl330-test"; }
function isSts3215TestJog() { return activeControllerProfile().capabilities?.jogCommand === "sts3215-test"; }
function updateSts3215JogProfileUi() {
  const stepSelect = $("#jogStep"), feed = $("#jogFeed");
  if (stepSelect.dataset.mode !== "sts3215-test") {
    stepSelect.replaceChildren(...STS3215_TEST_JOG_STEPS.map(value => new Option(`${value} deg`, String(value))));
    stepSelect.dataset.mode = "sts3215-test";
  }
  $("#jogUnitLabel").textContent = "deg";
  $("#jogStepLabel").textContent = "角度";
  $("#jogFeedLabel").textContent = "速度raw（FW固定）";
  $("#jogFeedUnit").textContent = "3400固定";
  $("#jogTitle").textContent = `STS3215 ID${state.settings.stsAxisXId}(X) / ID${state.settings.stsAxisYId}(Y) / ID${state.settings.stsAxisZId}(Z)`;
  $("#jogHint").textContent = "矢印はXY、W/Sは選択角度のZ+/Z−。Zボタンは固定±5°。完了後Torque OFF";
  $("#jogCoordinates").hidden = true;
  $("#serialSourceLabel").hidden = false;
  $("#serialTransferControls").hidden = false;
  $("#serialSource").disabled = false;
  ["penUpButton", "penDownButton", "reloadButton"].forEach(id => { $(`#${id}`).disabled = false; });
  ["pauseSend", "resumeSend"].forEach(id => { $(`#${id}`).disabled = false; });
  ['[data-command="$$"]', '[data-command="$X"]'].forEach(selector => { $(selector).disabled = true; });
  $('[data-command="?"]').disabled = true;
  $("#stsZJogControls").hidden = false;
  $(".keyboard-jog-toggle").title = `矢印キーでXY、W/SキーでID ${state.settings.stsAxisZId}(Z)を選択角度だけ安全JOG`;
  $("#keyboardJogLabel").textContent = "矢印＋W/S";
  feed.min = "3400"; feed.max = "3400"; feed.value = "3400"; feed.disabled = true;
  $$('[data-jog-axis="Y"]').forEach(button => { button.disabled = false; });
  const labels = [
    ['[data-jog-axis="X"][data-jog-sign="1"]', `ID${state.settings.stsAxisXId} +`],
    ['[data-jog-axis="X"][data-jog-sign="-1"]', `ID${state.settings.stsAxisXId} -`],
    ['[data-jog-axis="Y"][data-jog-sign="-1"]', `ID${state.settings.stsAxisYId} -`],
    ['[data-jog-axis="Y"][data-jog-sign="1"]', `ID${state.settings.stsAxisYId} +`]
  ];
  labels.forEach(([selector, label]) => {
    const button = $(selector), small = $(`${selector} small`);
    if (small) small.textContent = label;
    if (button) button.setAttribute("aria-label", label);
  });
}
function updateJogProfileUi() {
  if (isSts3215TestJog()) return updateSts3215JogProfileUi();
  const testMode = isXl330TestJog(), stepSelect = $("#jogStep"), feed = $("#jogFeed");
  feed.disabled = false;
  $('[data-command="?"]').disabled = false;
  $("#stsZJogControls").hidden = true;
  const mode = testMode ? "xl330-test" : "standard";
  if (stepSelect.dataset.mode !== mode) {
    const values = testMode ? XL330_TEST_JOG_STEPS : STANDARD_JOG_STEPS;
    stepSelect.replaceChildren(...values.map(value => new Option(`${value} ${testMode ? "回転" : "mm"}`, String(value))));
    stepSelect.dataset.mode = mode;
  }
  $("#jogUnitLabel").textContent = testMode ? "回転" : "mm";
  $("#jogStepLabel").textContent = testMode ? "回転量" : "移動量";
  $("#jogFeedLabel").textContent = testMode ? "速度raw" : "速度";
  $("#jogFeedUnit").textContent = testMode ? "1～100" : "mm/min";
  $("#jogTitle").textContent = testMode ? "XL330 ID1 単体JOG" : "XYジョグ";
  $("#jogHint").textContent = testMode ? "X左右でID 1を選択回転量だけ正転・逆転" : "1タップで選択距離だけ移動";
  $("#jogCoordinates").hidden = testMode;
  $("#serialSourceLabel").hidden = testMode;
  $("#serialTransferControls").hidden = testMode;
  $("#serialSource").disabled = testMode;
  ["penUpButton", "penDownButton", "reloadButton", "pauseSend", "resumeSend"].forEach(id => { $(`#${id}`).disabled = testMode; });
  ['[data-command="$$"]', '[data-command="$X"]'].forEach(selector => { $(selector).disabled = testMode; });
  $(".keyboard-jog-toggle").title = testMode ? "PCの左右キーでID 1を正転・逆転" : "PCの矢印キーでXYジョグ";
  $("#keyboardJogLabel").textContent = "矢印キー";
  feed.min = "1"; feed.max = testMode ? "100" : "50000";
  $$('[data-jog-axis="Y"]').forEach(button => { button.disabled = testMode; });
  const left = $('[data-jog-axis="X"][data-jog-sign="1"] small');
  const right = $('[data-jog-axis="X"][data-jog-sign="-1"] small');
  if (left) left.textContent = testMode ? "正転" : "X←";
  if (right) right.textContent = testMode ? "逆転" : "X→";
  const leftButton = $('[data-jog-axis="X"][data-jog-sign="1"]');
  const rightButton = $('[data-jog-axis="X"][data-jog-sign="-1"]');
  if (leftButton) leftButton.setAttribute("aria-label", testMode ? "ID 1 正転" : "X左方向");
  if (rightButton) rightButton.setAttribute("aria-label", testMode ? "ID 1 逆転" : "X右方向");
  const up = $('[data-jog-axis="Y"][data-jog-sign="-1"] small');
  const down = $('[data-jog-axis="Y"][data-jog-sign="1"] small');
  const upButton = $('[data-jog-axis="Y"][data-jog-sign="-1"]');
  const downButton = $('[data-jog-axis="Y"][data-jog-sign="1"]');
  if (up) up.textContent = "Y↑";
  if (down) down.textContent = "Y↓";
  if (upButton) upButton.setAttribute("aria-label", "Y上方向");
  if (downButton) downButton.setAttribute("aria-label", "Y下方向");
}
function populateJogSettings() {
  updateJogProfileUi();
  const stepSelect = $("#jogStep"), step = String(state.settings.jogStep || 1);
  if (![...stepSelect.options].some(option => option.value === step)) {
    stepSelect.add(new Option(`${step} ${isXl330TestJog() ? "回転" : "mm"}`, step), 0);
  }
  stepSelect.value = step;
  $("#jogFeed").value = state.settings.jogFeed || 1000;
  updateJogPreview();
}
function updateJogPreview() {
  const step=+$("#jogStep").value||1,feed=+$("#jogFeed").value||1000;
  if (isSts3215TestJog()) {
    const pulses = Math.round(step * 4096 / 360);
    const zPulses = Math.round(5 * 4096 / 360);
    $("#jogCommandPreview").textContent = `XY: ID${state.settings.stsAxisXId}/ID${state.settings.stsAxisYId} ±${pulses} pulse | Z: ID${state.settings.stsAxisZId} ±${zPulses} pulse`;
    return;
  }
  $("#jogCommandPreview").textContent = isXl330TestJog()
    ? `TESTJOG D±${Math.round(step * 4096)} V${Math.round(feed)}`
    : `$J=G91 G21 X±${fmt(step)} F${fmt(feed)}`;
}
const KEYBOARD_JOG_DIRECTIONS = {
  ArrowUp: { axis: "Y", sign: -1 },
  ArrowDown: { axis: "Y", sign: 1 },
  ArrowLeft: { axis: "X", sign: 1 },
  ArrowRight: { axis: "X", sign: -1 }
};
function setKeyboardJogEnabled(enabled) {
  state.keyboardJogEnabled = !!enabled;
  const toggle = $("#keyboardJogToggle");
  toggle.checked = state.keyboardJogEnabled;
  $("#keyboardJogState").textContent = state.keyboardJogEnabled ? "ON" : "OFF";
  toast(`${isSts3215TestJog() ? "矢印＋W/S" : "矢印キー"}ジョグ: ${state.keyboardJogEnabled ? "ON" : "OFF"}`);
}
function isKeyboardJogEditingTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("textarea, select, [contenteditable='true']")) return true;
  const input = target.closest("input");
  return !!input && !["button", "checkbox", "radio"].includes(input.type);
}
function flashKeyboardJogButton(axis, sign) {
  const button = $(`[data-jog-axis="${axis}"][data-jog-sign="${sign}"]`);
  if (!button) return;
  button.classList.add("keyboard-active");
  clearTimeout(button.keyboardActiveTimer);
  button.keyboardActiveTimer = setTimeout(() => button.classList.remove("keyboard-active"), 160);
}
function handleKeyboardJog(event) {
  const stsZDirection = isSts3215TestJog()
    ? ({ w: { axis: "Z", sign: 1 }, s: { axis: "Z", sign: -1 } }[event.key.toLowerCase()])
    : null;
  const direction = KEYBOARD_JOG_DIRECTIONS[event.key] || stsZDirection;
  if (!state.keyboardJogEnabled || !direction || event.repeat || event.defaultPrevented) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!$("#tab-serial").classList.contains("active") || document.querySelector("dialog[open]")) return;
  if (isKeyboardJogEditingTarget(event.target)) return;
  event.preventDefault();
  flashKeyboardJogButton(direction.axis, direction.sign);
  void sendJog(direction.axis, direction.sign);
}
async function sendJog(axis, sign, degreesOverride = null) {
  if (!state.writer) return toast("先にSerial接続してください");
  if (state.sdManagementActive) return toast("SDカード管理を終了してからジョグしてください");
  if (state.sending) return toast("G-code送信中はジョグできません");
  if (state.jogging) return;
  saveJogSettings();
  const distance=sign*(degreesOverride ?? state.settings.jogStep);
  let command, successText;
  if (isSts3215TestJog()) {
    if (!["X", "Y", "Z"].includes(axis)) return toast("STS3215安全JOGはX/Y/Zだけ使用できます");
    const delta = Math.round(distance * 4096 / 360);
    if (!delta) return toast("角度が小さすぎます");
    if (Math.abs(delta) > 28672) return toast("多回転JOGは1操作7回転（2520度）以下にしてください");
    const id = +({ X: state.settings.stsAxisXId, Y: state.settings.stsAxisYId, Z: state.settings.stsAxisZId }[axis]);
    if (!id) return toast(`${axis}軸のSTS3215 IDが未設定です`);
    command = `TESTJOG ${id} ${delta}`;
    successText = `ID ${id}: ${distance > 0 ? "+" : ""}${fmt(distance)} deg 移動（現在位置を更新・Torque OFF）`;
  } else if (isXl330TestJog()) {
    if (axis !== "X") return toast("単体安全テストではX左右だけを使用します");
    const turns = Math.abs(distance), velocity = Math.round(state.settings.jogFeed);
    if (!(turns > 0 && turns <= 2)) return toast("単体JOGは1操作2回転以下にしてください");
    if (!(velocity >= 1 && velocity <= 100)) return toast("速度rawは1～100にしてください");
    const delta = Math.round(distance * 4096);
    if (!delta) return toast("回転量が小さすぎます");
    command = `TESTJOG D${delta} V${velocity}`;
    successText = `${distance > 0 ? "+" : ""}${fmt(distance)}回転（Torque OFF）`;
  } else {
    command=`$J=G91 G21 ${axis}${fmt(distance)} F${fmt(state.settings.jogFeed)}`;
    successText=`${axis} ${distance>0?"+":""}${fmt(distance)} mm`;
  }
  state.jogging=true;
  try { await sendLineAndWait(command, false); toast(successText); }
  catch (error) { log(`ジョグエラー: ${error.message}`, "rx"); }
  finally {
    if (state.settings.jogAutoDisable && state.writer) {
      try { await sendLineAndWait("M18", false); }
      catch (error) { log(`ジョグ後のM18失敗: ${error.message}`, "rx"); }
    }
    state.jogging=false;
  }
}
async function cancelJog() {
  if (!state.writer) return toast("先にSerial接続してください");
  try { await state.writer.write(new Uint8Array([0x85])); log("Jog cancel (0x85)", "tx"); toast("ジョグ停止を送信しました"); }
  catch (error) { toast(error.message); }
}
function startStatusPolling() {
  stopStatusPolling();
  const poll=()=>{if(activeControllerProfile().capabilities?.statusPolling!==false&&state.writer&&!state.sending&&!state.jobStopped&&!state.sdManagementActive)rawWrite("?",false).catch(()=>{});};poll();state.statusPollTimer=setInterval(poll,state.positionTelemetryEnabled?250:750);
}
function stopStatusPolling(){if(state.statusPollTimer){clearInterval(state.statusPollTimer);state.statusPollTimer=null;}}
function parseControllerStatus(line) {
  const fields=line.slice(1,-1).split("|");state.controllerState=fields.shift()||"接続済み";let hasWorkPosition=false;
  for(const field of fields){
    const separator=field.indexOf(":");if(separator<0)continue;const key=field.slice(0,separator),value=field.slice(separator+1);
    if(key==="MPos")state.machinePosition=parseStatusVector(value);
    if(key==="WPos"){state.workPosition=parseStatusVector(value);hasWorkPosition=true;}
    if(key==="WCO")state.workOffset=parseStatusVector(value);
    if(key==="AS5600")parsePositionSensorStatus(value);
  }
  if(!hasWorkPosition&&state.machinePosition&&state.workOffset)state.workPosition={x:state.machinePosition.x-state.workOffset.x,y:state.machinePosition.y-state.workOffset.y,z:state.machinePosition.z-state.workOffset.z};
  if(state.workPosition){state.position={x:state.workPosition.x,y:state.workPosition.y};}
  scheduleSerialUiFlush();
}
function parsePositionSensorStatus(value) {
  const values=value.split(",").map(Number);
  if(values.length<6||values.some(number=>!Number.isFinite(number)))return false;
  state.positionSensors={presentMask:values[0]&3,magnetMask:values[1]&3,joints:[{raw:values[2]&4095,degrees:values[4]},{raw:values[3]&4095,degrees:values[5]}]};
  return true;
}
function normalizedDegrees(value){return((Number(value)||0)%360+360)%360;}
function armJointDegrees(index) {
  const joint=state.positionSensors.joints[index];
  const invert=index===0?state.armCalibration.invert1:state.armCalibration.invert2;
  const offset=index===0?state.armCalibration.offset1:state.armCalibration.offset2;
  return normalizedDegrees((invert?360-joint.degrees:joint.degrees)+offset);
}
function armPoint(origin,length,degrees){const radians=degrees*Math.PI/180;return{x:origin.x+length*Math.sin(radians),y:origin.y-length*Math.cos(radians)};}
function renderPlanarArm() {
  if(!$("#planarArmPanel"))return;
  const present=state.positionSensors.presentMask,magnet=state.positionSensors.magnetMask;
  const j1=present&1?armJointDegrees(0):180,j2=present&2?armJointDegrees(1):180,base={x:120,y:20};
  const elbow=armPoint(base,78,j1),tip=armPoint(elbow,78,j1+j2-180);
  const setLine=(selector,a,b)=>{const element=$(selector);element.setAttribute("x1",a.x);element.setAttribute("y1",a.y);element.setAttribute("x2",b.x);element.setAttribute("y2",b.y);};
  setLine("#planarArmLink1",base,elbow);setLine("#planarArmLink2",elbow,tip);
  $("#planarArmJoint").setAttribute("cx",elbow.x);$("#planarArmJoint").setAttribute("cy",elbow.y);
  $("#planarArmTip").setAttribute("cx",tip.x);$("#planarArmTip").setAttribute("cy",tip.y);
  [0,1].forEach(index=>{
    const isPresent=!!(present&(1<<index)),hasMagnet=!!(magnet&(1<<index));
    $(`#armJ${index+1}Angle`).textContent=isPresent?`${armJointDegrees(index).toFixed(2)} deg`:`--.-- deg`;
    const status=$(`#armJ${index+1}Status`);status.textContent=!isPresent?"未接続":hasMagnet?`磁石OK / raw ${state.positionSensors.joints[index].raw}`:"磁石なし";
    status.dataset.state=!isPresent?"missing":hasMagnet?"ok":"warning";
  });
  $("#armJ1Invert").checked=!!state.armCalibration.invert1;$("#armJ2Invert").checked=!!state.armCalibration.invert2;
  $("#positionTelemetryToggle").checked=state.positionTelemetryEnabled;$("#positionTelemetryState").textContent=state.positionTelemetryEnabled?"ON":"OFF";
}
function saveArmCalibrationFromUi() {
  state.armCalibration.invert1=$("#armJ1Invert").checked;state.armCalibration.invert2=$("#armJ2Invert").checked;
  saveJSON("plotterflow.armCalibration",state.armCalibration);renderPlanarArm();
}
function calibrateArmDown() {
  if((state.positionSensors.presentMask&3)!==3)return toast("J1とJ2の両方を接続してから基準設定してください");
  saveArmCalibrationFromUi();
  const base1=state.armCalibration.invert1?360-state.positionSensors.joints[0].degrees:state.positionSensors.joints[0].degrees;
  const base2=state.armCalibration.invert2?360-state.positionSensors.joints[1].degrees:state.positionSensors.joints[1].degrees;
  state.armCalibration.offset1=180-base1;state.armCalibration.offset2=180-base2;state.armCalibration.calibrated=true;
  saveJSON("plotterflow.armCalibration",state.armCalibration);renderPlanarArm();toast("現在姿勢を180 deg / 180 degの真下基準にしました");
}
async function setPositionTelemetryEnabled(enabled) {
  if(!isPicoDrv8835Profile()){disablePositionTelemetry(false);return;}
  if(enabled&&!state.writer){disablePositionTelemetry(false);return toast("先にPico 2 DRV8835へSerial接続してください");}
  if(state.sending||state.jogging||state.sdManagementActive){disablePositionTelemetry(false);return toast("動作完了後に位置センサ通信を切り替えてください");}
  try{await sendLineAndWait(`M983 S${enabled?1:0}`,false);state.positionTelemetryEnabled=enabled;renderPlanarArm();startStatusPolling();toast(`位置センサ通信を${enabled?"開始":"停止"}しました`);}
  catch(error){disablePositionTelemetry(false);log(`位置センサ通信設定失敗: ${error.message}`,"rx");toast("位置センサ通信を切り替えられませんでした");}
}
function disablePositionTelemetry(restartPolling=true){state.positionTelemetryEnabled=false;renderPlanarArm();if(restartPolling&&state.writer)startStatusPolling();}
function parseStatusVector(value){const numbers=value.split(",").map(Number);return{x:numbers[0]||0,y:numbers[1]||0,z:numbers[2]||0};}
function updateSerialPositionDisplay() {
  const actual=state.workPosition,position=actual||state.position;
  $("#serialXPosition").textContent=position?fmt(position.x):"—";$("#serialYPosition").textContent=position?fmt(position.y):"—";
  $("#machineState").textContent=state.controllerState;$("#machineStateDot").classList.toggle("online",!!state.writer);
  $("#positionSource").textContent=actual?"ワーク座標 WPos":position?"送信値からの推定":"ワーク座標";
}
async function setCurrentXyZero() {
  if(!state.writer)return toast("先にSerial接続してください");if(state.sdManagementActive)return toast("SDカード管理を終了してから0点を変更してください");if(state.sending)return toast("G-code送信中は0点を変更できません");
  try{await sendLineAndWait("G10 L20 P0 X0 Y0",false);state.workPosition={x:0,y:0,z:state.workPosition?.z||0};state.position={x:0,y:0};updateSerialPositionDisplay();if(activeControllerProfile().capabilities?.statusPolling!==false)await rawWrite("?",false);toast("現在位置をXY=0に設定しました");}
  catch(error){log(`0点設定エラー: ${error.message}`,"rx");toast("XYの0点設定に失敗しました");}
}
function cleanLines(code) { return code.split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith(";") && !x.startsWith("(")); }
async function startSending(code, options = {}) {
  if (!state.writer) return toast("先にSerial接続してください"); if (state.sdManagementActive) return toast("SDカード管理を終了してから送信してください"); if (state.sending) return toast("すでに送信中です");
  const lines = [...sts3215SetupLines(), ...cleanLines(code)]; if (!lines.length) return toast("送信するG-codeがありません");
  clearOkWaiters("新しい送信を開始");
  state.sending = true; state.stopped = false; state.jobStopped = false; state.paused = false;
  try { await sendLines(lines, options); if (!state.stopped && !options.silent) toast("送信が完了しました"); }
  catch (e) { if (!state.stopped) log(`送信停止: ${e.message}`, "rx"); }
  finally { state.sending = false; state.paused = false; state.stopped = false; state.jobStopped = false; clearOkWaiters("送信終了"); flushSerialUi(); }
}
async function startConfiguredTransfer(code, suggestedName = "plot.gcode") {
  return effectiveSerialDestination() === "sd"
    ? startSdUpload(code, $("#sdFilename").value || suggestedName)
    : startSending(code);
}
function sdUploadLines(code) {
  const lines = String(code || "").replace(/\r\n?/g, "\n").split("\n").filter(line => line.length > 0);
  const encoder = new TextEncoder();
  for (const line of lines) {
    if (/^\s*M29\s*$/i.test(line)) throw new Error("G-code内に転送終了命令M29を含められません");
    if (line.includes("\0")) throw new Error("G-codeにNUL文字を含められません");
    if (encoder.encode(line).length >= 192) throw new Error("192 bytes以上のG-code行はSDへ転送できません");
  }
  return lines;
}
async function startSdUpload(code, requestedName) {
  if (!supportsSdUpload()) return toast("このプロファイルはSD転送に対応していません");
  if (!state.writer) return toast("先にSerial接続してください");
  if (state.sdManagementActive) return toast("SDカード管理を終了してから転送してください");
  if (state.sending) return toast("すでに送信中です");
  let lines;
  try { lines = sdUploadLines(code); }
  catch (error) { return toast(error.message); }
  if (!lines.length) return toast("転送するG-codeがありません");
  const filename = sanitizeSdFilename(requestedName);
  $("#sdFilename").value = filename;
  clearOkWaiters("新しいSD転送を開始");
  state.sending = true; state.sdUploading = true; state.stopped = false; state.paused = false;
  const resumePolling = !!state.statusPollTimer;
  if (resumePolling) stopStatusPolling();
  log(`SD転送開始: ${filename} / ${lines.length}行`, "rx");
  try {
    scheduleSendProgress(0, lines.length);
    await sendLineAndWait(`M28 ${filename}`, false, { line: "M28", index: 0, total: lines.length });
    for (let index = 0; index < lines.length; index++) {
      if (state.stopped) throw new Error("停止しました");
      await sendLineAndWait(lines[index], false, { index: index + 1, total: lines.length });
      scheduleSendProgress(index + 1, lines.length);
    }
    await sendLineAndWait("M29", false, { line: "M29", index: lines.length, total: lines.length });
    flushSerialUi();
    log(`SD転送完了: ${filename}`, "rx");
    toast("SDカードへの転送が完了しました");
  } catch (error) {
    if (!state.stopped && state.writer) {
      try { await rawWrite("\x18", false); await sleep(100); }
      catch {}
    }
    if (!state.stopped) {
      log(`SD転送停止: ${error.message}`, "rx");
      toast("SDカードへの転送に失敗しました");
    }
  } finally {
    state.sdUploading = false; state.sending = false; state.paused = false; state.stopped = false;
    clearOkWaiters("SD転送終了");
    if (resumePolling && state.port && state.writer) startStatusPolling();
    flushSerialUi();
  }
}
async function pauseSending() {
  if (state.sdUploading) return toast("SD転送は一時停止できません。停止で破棄できます");
  state.paused = true; await sendRealtime("!"); log("一時停止", "rx");
}
async function resumeSending() {
  if (state.sdUploading) return toast("SD転送中です");
  state.paused = false; await sendRealtime("~"); log("再開", "rx");
}
async function stopSending() {
  state.stopped = true; state.paused = false; clearOkWaiters("停止");
  if (state.sdUploading) {
    try { await rawWrite("\x18", false); log("SD upload cancel (Ctrl-X)", "tx"); }
    catch (error) { log(`SD転送中止失敗: ${error.message}`, "rx"); }
    toast("SD転送を中止し、未完成ファイルを破棄しました");
    return;
  }
  await sendSafeStop("送信キューを停止しました");
}
async function resetController() {
  if (state.sdUploading) return stopSending();
  state.stopped = true; state.paused = false; clearOkWaiters("リセット"); await sendRealtime("\x18");
}
function updatePosition(line) {
  const xm=line.match(/\bX(-?\d*\.?\d+)/i), ym=line.match(/\bY(-?\d*\.?\d+)/i);
  if (!xm&&!ym) return;
  state.position={x:xm?+xm[1]:(state.position?.x||0),y:ym?+ym[1]:(state.position?.y||0)};
  scheduleSerialUiFlush();
}
function scheduleSendProgress(done, total, onProgress) {
  const ratio = total ? done / total : 0;
  state.pendingSerialProgress = { done, total, ratio };
  if (onProgress) state.pendingJobProgress = { ratio, onProgress };
  scheduleSerialUiFlush();
}
function scheduleSerialUiFlush() {
  state.pendingPositionDisplay = true;
  if (state.serialUiTimer) return;
  state.serialUiTimer = setTimeout(flushSerialUi, 150);
}
function flushSerialUi() {
  if (state.serialUiTimer) { clearTimeout(state.serialUiTimer); state.serialUiTimer = null; }
  if (state.pendingSerialProgress) {
    const p = state.pendingSerialProgress;
    $("#sendProgress").value = p.ratio;
    $("#sendProgressText").textContent = `${p.done} / ${p.total} (${Math.round(p.ratio*100)}%)`;
    state.pendingSerialProgress = null;
  }
  if (state.pendingJobProgress) {
    const p = state.pendingJobProgress;
    p.onProgress?.(p.ratio);
    state.pendingJobProgress = null;
  }
  if (state.pendingPositionDisplay) {
    updateSerialPositionDisplay();
    renderPlanarArm();
    state.pendingPositionDisplay = false;
  }
}
function logOkTimeoutDebug(item, timeout) {
  const elapsed = Date.now() - (item.startedAt || Date.now());
  const lineInfo = item.total ? `${item.index}/${item.total}` : "manual";
  log(`[timeout] ok応答なし ${elapsed}ms / timeout ${timeout}ms`, "rx");
  log(`[timeout] 待機行 ${lineInfo}: ${item.line || "(unknown)"}`, "rx");
  log(`[timeout] 直近TX: ${state.lastSentLine || "(none)"}`, "rx");
  log(`[timeout] 直近RX: ${state.lastReceivedLine || "(none)"}`, "rx");
  log(`[timeout] waiters=${state.okWaiters.length} sending=${state.sending} paused=${state.paused} stopped=${state.stopped}`, "rx");
}
async function sendSafeStop(message = "停止しました") {
  if (state.settings.stopStrategy === "cancel-pen-up") {
    try { await state.writer.write(new Uint8Array([0x85])); log("Motion cancel (0x85)", "tx"); await sleep(250); }
    catch (error) { log(`キャンセル送信失敗: ${error.message}`, "rx"); }
  } else {
    try { await rawWrite("!", false); } catch (error) { log(`停止リアルタイム送信失敗: ${error.message}`, "rx"); }
  }
  const penUp = String(state.settings.penUpCommand || "").trim();
  if (penUp) {
    try { await rawWrite(penUp + "\n", false); }
    catch (error) { log(`ペンアップ送信失敗: ${error.message}`, "rx"); }
  }
  log(message, "rx");
}
function log(text, type) {
  const el=$("#serialLog"), line=document.createElement("div");
  line.className=type;
  line.textContent=`${new Date().toLocaleTimeString()} ${type==="tx"?">":"<"} ${text}`;
  el.append(line);
  while (el.children.length > state.serialLogLimit) el.firstElementChild?.remove();
  el.scrollTop=el.scrollHeight;
}

async function sendLines(lines, { silent = false, onProgress, stopPolling = true } = {}) {
  const resumePolling = stopPolling && !!state.statusPollTimer;
  if (resumePolling) stopStatusPolling();
  try {
    scheduleSendProgress(0, lines.length, onProgress);
    for (let i=0; i<lines.length; i++) {
      if (state.stopped || state.jobStopped) throw new Error("停止しました");
      while (state.paused && !state.stopped) await sleep(100);
      await sendLineAndWait(lines[i], true, { index: i + 1, total: lines.length });
      scheduleSendProgress(i + 1, lines.length, onProgress);
    }
    flushSerialUi();
  } finally {
    if (resumePolling && state.port && state.writer) startStatusPolling();
  }
  if (!silent) renderGcodePreview();
}

function bindJobs() {
  $("#addJob").addEventListener("click", () => { addJob(); persistJobs(); }); $("#runJobs").addEventListener("click", runJobs); $("#stopJobs").addEventListener("click", stopJobs);
  $("#saveJobSet").addEventListener("click", saveCurrentJobSet);
  $("#loadJobSet").addEventListener("click", () => loadJobSet($("#jobSetLibrary").value));
  $("#downloadJobSet").addEventListener("click", downloadJobSet);
  $("#deleteJobSet").addEventListener("click", deleteJobSet);
  $("#jobSetLibrary").addEventListener("change", e => { state.currentJobSetId = e.target.value || null; const set=state.jobSets.find(x=>x.id===state.currentJobSetId); if(set) $("#jobSetName").value=set.name; });
  $("#jobSetFile").addEventListener("change", event => event.target.files[0] && loadJobSetFile(event.target.files[0]));
  $("#autoReloadBetweenJobs").checked = localStorage.getItem("plotterflow.autoReloadBetweenJobs") === "1";
  $("#autoReloadBetweenJobs").addEventListener("change", persistJobs);
  $("#jobLoops").value = localStorage.getItem("plotterflow.jobLoops") || 1; $("#jobLoops").addEventListener("change", persistJobs);
  $("#jobList").addEventListener("input", persistJobs); $("#jobList").addEventListener("change", persistJobs);
  $("#jobList").addEventListener("click", e => {
    const row=e.target.closest(".job-row"); if(!row)return;
    clearAutoReloadMarkers();
    const rows=$$(".job-row"), index=rows.indexOf(row);
    if(e.target.matches(".remove-job")) row.remove();
    if(e.target.matches(".move-up")&&index>0) row.parentElement.insertBefore(row,rows[index-1]);
    if(e.target.matches(".move-down")&&index<rows.length-1) row.parentElement.insertBefore(rows[index+1],row);
    if(e.target.matches(".toggle-job-options")) toggleJobOptions(row);
    persistJobs();
  });
}
function addJob(data={}) {
  const row=document.createElement("div"); row.className="job-row"; row.dataset.id=data.id||uid();
  const options=state.library.map(x=>`<option value="${x.id}" ${x.id===data.gcodeId?"selected":""}>${escapeHtml(x.name)}</option>`).join("");
  const reloadSelected = data.gcodeId === "__reload__" ? "selected" : "";
  const hasOptions=!!(+data.beforeDelay||+data.afterDelay||data.beforeCommand||data.afterCommand);
  row.classList.toggle("expanded",hasOptions);
  row.innerHTML=`<div class="job-main"><div class="job-move-buttons"><button class="move-up" title="上へ">↑</button><button class="move-down" title="下へ">↓</button></div><label class="job-gcode-label">G-code<select class="job-gcode"><option value="">選択</option><option value="__reload__" ${reloadSelected}>リロード動作（設定）</option>${options}</select></label><label class="job-count-label">回数<input class="job-count" type="number" min="1" value="${data.count||1}"></label><button class="toggle-job-options" type="button" aria-expanded="${hasOptions}">${hasOptions?"−":"+"}</button><button class="remove-job danger" title="削除">×</button></div><div class="job-extra" ${hasOptions?"":"hidden"}><label>前delay (秒)<input class="job-before-delay" type="number" min="0" step="0.1" value="${data.beforeDelay||0}"></label><label>後delay (秒)<input class="job-after-delay" type="number" min="0" step="0.1" value="${data.afterDelay||0}"></label><label>前コマンド<input class="job-before-command" value="${escapeHtml(data.beforeCommand||"")}"></label><label>後コマンド<input class="job-after-command" value="${escapeHtml(data.afterCommand||"")}"></label></div>`;
  $("#jobList").append(row);
}
function toggleJobOptions(row){
  const extra=$(".job-extra",row),button=$(".toggle-job-options",row); if(!extra||!button)return;
  const expanded=extra.hasAttribute("hidden");
  extra.toggleAttribute("hidden",!expanded); row.classList.toggle("expanded",expanded); button.textContent=expanded?"−":"+"; button.setAttribute("aria-expanded",String(expanded));
}
function getJobs() { return $$(".job-row").map(r=>({id:r.dataset.id,gcodeId:$(".job-gcode",r).value,count:+$(".job-count",r).value||1,beforeDelay:+$(".job-before-delay",r).value||0,afterDelay:+$(".job-after-delay",r).value||0,beforeCommand:$(".job-before-command",r).value,afterCommand:$(".job-after-command",r).value})); }
function autoReloadBetweenJobs(){return !!$("#autoReloadBetweenJobs")?.checked;}
function persistJobs(){ saveJSON("plotterflow.jobs",getJobs()); localStorage.setItem("plotterflow.jobLoops",$("#jobLoops").value); localStorage.setItem("plotterflow.autoReloadBetweenJobs",autoReloadBetweenJobs()?"1":"0"); renderAutoReloadMarkers(); }
function renderJobs(){ const saved=loadJSON("plotterflow.jobs",[]); $("#jobList").innerHTML=""; if(Array.isArray(saved)) saved.forEach(addJob); renderAutoReloadMarkers(); refreshJobSetLibrary(); }
function clearAutoReloadMarkers(){ $$(".job-reload-marker").forEach(x=>x.remove()); }
function renderAutoReloadMarkers(){
  clearAutoReloadMarkers();
  if(!autoReloadBetweenJobs())return;
  const rows=$$(".job-row");
  rows.forEach((row,index)=>{
    const marker=document.createElement("div");
    marker.className=`job-reload-marker ${index===rows.length-1?"final":""}`;
    marker.textContent=index===rows.length-1?"↻ 最後にリロード動作":"↻ リロード動作";
    row.after(marker);
  });
}
function ensureJobSetExt(name){return /\.plotter-jobs\.json$/i.test(name)?name:`${name.replace(/\.json$/i,"")}.plotter-jobs.json`;}
function buildJobSetDocument(name=$("#jobSetName").value){
  const jobs=getJobs(), ids=[...new Set(jobs.map(j=>j.gcodeId).filter(id=>id&&id!=="__reload__"))];
  const embeddedGcodes=ids.map(id=>state.library.find(x=>x.id===id)).filter(Boolean).map(x=>({id:x.id,name:x.name,gcode:x.gcode,settings:x.settings||null,updated:x.updated||Date.now()}));
  return {version:1,type:"plotterflow.jobSet",name:ensureJobSetExt(name.trim()||"job-set.plotter-jobs.json"),loops:Math.max(1,+$("#jobLoops").value||1),autoReloadBetweenJobs:autoReloadBetweenJobs(),jobs,embeddedGcodes,exportedAt:new Date().toISOString()};
}
function refreshJobSetLibrary(){
  const select=$("#jobSetLibrary"); if(!select)return;
  const options=state.jobSets.sort((a,b)=>(b.updated||0)-(a.updated||0)).map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join("");
  select.innerHTML=`<option value="">未選択</option>${options}`;
  if(state.currentJobSetId)select.value=state.currentJobSetId;
}
function saveCurrentJobSet(){
  const doc=buildJobSetDocument(), now=Date.now();
  let item=state.jobSets.find(x=>x.id===state.currentJobSetId);
  if(item)Object.assign(item,{...doc,updated:now});
  else{item={id:uid(),...doc,updated:now};state.jobSets.push(item);state.currentJobSetId=item.id;}
  saveJSON("plotterflow.jobSets",state.jobSets);refreshJobSetLibrary();$("#jobSetLibrary").value=item.id;$("#jobSetName").value=item.name;toast("ジョブセットを保存しました");
}
function applyJobSetDocument(doc,{saveLocal=false}={}){
  if(!doc||doc.type!=="plotterflow.jobSet"||!Array.isArray(doc.jobs))throw new Error("有効なジョブセットではありません");
  if(Array.isArray(doc.embeddedGcodes)){
    let changed=false;
    for(const item of doc.embeddedGcodes){
      if(!item?.id||!item?.gcode)continue;
      if(!state.library.some(x=>x.id===item.id)){state.library.push({id:item.id,name:ensureExt(item.name||"imported.gcode"),gcode:item.gcode,settings:item.settings||{},updated:item.updated||Date.now()});changed=true;}
    }
    if(changed){saveJSON("plotterflow.library",state.library);refreshLibrary();}
  }
  $("#jobList").innerHTML="";doc.jobs.forEach(addJob);$("#jobLoops").value=Math.max(1,+doc.loops||1);$("#autoReloadBetweenJobs").checked=!!doc.autoReloadBetweenJobs;$("#jobSetName").value=ensureJobSetExt(doc.name||"job-set.plotter-jobs.json");persistJobs();
  if(saveLocal){state.currentJobSetId=null;saveCurrentJobSet();}
  else{state.currentJobSetId=null;$("#jobSetLibrary").value="";}
}
function loadJobSet(id){
  const item=state.jobSets.find(x=>x.id===id); if(!item)return toast("読み出すジョブセットを選択してください");
  applyJobSetDocument(item);state.currentJobSetId=item.id;$("#jobSetLibrary").value=item.id;$("#jobSetName").value=item.name;toast("ジョブセットを読み出しました");
}
function downloadJobSet(){
  const doc=buildJobSetDocument();
  const blob=new Blob([JSON.stringify(doc,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=ensureJobSetExt(doc.name||$("#jobSetName").value||"job-set.plotter-jobs.json");a.click();URL.revokeObjectURL(a.href);
}
async function loadJobSetFile(file){
  try{const doc=JSON.parse(await file.text());applyJobSetDocument(doc,{saveLocal:true});toast(`${file.name}を読み込みました`);}
  catch(error){toast(error.message);}
  finally{$("#jobSetFile").value="";}
}
function deleteJobSet(){
  if(!state.currentJobSetId)return toast("削除するジョブセットを選択してください");
  if(!confirm("選択中のジョブセットを削除しますか？"))return;
  state.jobSets=state.jobSets.filter(x=>x.id!==state.currentJobSetId);state.currentJobSetId=null;saveJSON("plotterflow.jobSets",state.jobSets);refreshJobSetLibrary();$("#jobSetName").value="job-set.plotter-jobs.json";toast("ジョブセットを削除しました");
}
async function runJobs() {
  if(!state.writer)return toast("先にSerial接続してください"); if(state.sdManagementActive)return toast("SDカード管理を終了してからジョブを実行してください"); if(state.sending)return toast("Serial送信中です");
  const jobs=getJobs().filter(j=>j.gcodeId), loops=Math.max(1,+$("#jobLoops").value||1); if(!jobs.length)return toast("実行するジョブを追加してください");
  clearOkWaiters("ジョブ開始");
  state.sending=true; state.stopped=false; state.jobStopped=false; state.paused=false;
  const resumePolling=!!state.statusPollTimer; if(resumePolling)stopStatusPolling();
  const useAutoReload=autoReloadBetweenJobs();
  let total=loops*jobs.reduce((n,j)=>n+j.count,0), done=0;
  try{
    for (const command of sts3215SetupLines()) await sendLineAndWait(command, false);
    scheduleJobProgress(done,total);
    for(let loop=1;loop<=loops;loop++){
      for(let ji=0;ji<jobs.length;ji++){
        const j=jobs[ji],item=state.library.find(x=>x.id===j.gcodeId),jobGcode=j.gcodeId==="__reload__"?state.settings.reloadGcode:item?.gcode;
        if(!jobGcode)continue;
        for(let run=1;run<=j.count;run++){
          ensureJobActive();
          $("#jobProgressText").textContent=`ループ ${loop}/${loops}・ジョブ ${ji+1}/${jobs.length}・実行 ${run}/${j.count}`;
          if(j.beforeDelay)await interruptibleDelay(j.beforeDelay*1000);
          await sendJobCommandBlock(j.beforeCommand,{label:"beforeCommand"});
          if(j.gcodeId==="__reload__")notifyReloadSimulation(jobGcode);
          await sendLines(cleanLines(jobGcode),{silent:true,stopPolling:false,onProgress:r=>scheduleJobProgress(done+r,total)});
          await sendJobCommandBlock(j.afterCommand,{label:"afterCommand"});
          if(j.afterDelay)await interruptibleDelay(j.afterDelay*1000);
          if(useAutoReload)await sendAutoReloadStep({loop,loops,jobIndex:ji+1,jobTotal:jobs.length,run,runTotal:j.count});
          done++; scheduleJobProgress(done,total); flushSerialUi();
        }
      }
    }
    $("#jobProgressText").textContent="完了"; toast("全ジョブが完了しました");
  }
  catch(e){$("#jobProgressText").textContent=`停止: ${e.message}`;}
  finally{
    clearOkWaiters("ジョブ終了");
    state.sending=false; state.paused=false; state.stopped=false; state.jobStopped=false;
    flushSerialUi();
    if(resumePolling&&state.port&&state.writer)startStatusPolling();
  }
}
function ensureJobActive(){if(state.stopped||state.jobStopped)throw new Error("停止しました");}
async function sendJobCommandBlock(code,{label=""}={}){
  const lines=cleanLines(code||""); if(!lines.length)return;
  await sendLines(lines,{silent:true,stopPolling:false,onProgress:null});
}
async function sendAutoReloadStep(context={}){
  const lines=cleanLines(state.settings.reloadGcode||""); if(!lines.length)return;
  ensureJobActive();
  $("#jobProgressText").textContent=`リロード動作 ${context.loop||""}/${context.loops||""}・ジョブ ${context.jobIndex||""}/${context.jobTotal||""}`;
  notifyReloadSimulation(state.settings.reloadGcode);
  await sendLines(lines,{silent:true,stopPolling:false,onProgress:null});
}
function scheduleJobProgress(done,total){$("#jobProgress").value=total?done/total:0;}
async function interruptibleDelay(ms){for(let t=0;t<ms;t+=100){ensureJobActive();while(state.paused&&!state.stopped){await sleep(100);ensureJobActive();}await sleep(Math.min(100,ms-t));}}
async function stopJobs(){state.jobStopped=true;state.stopped=true;state.paused=false;clearOkWaiters("ジョブ停止");await sendSafeStop("ジョブを停止しました");}

window.addEventListener("beforeunload", e => { if(state.sending){e.preventDefault();e.returnValue="";} });
document.addEventListener("DOMContentLoaded", init);
