"use strict";

const DEFAULTS = {
  penUpCommand: "M3 S1400", penDownCommand: "M3 S1000",
  penUpDelay: 0.1, penDownDelay: 0.1, penUpClearanceDelay: 0.1, upDelayMode: "fixed",
  longMoveThreshold: 100, penUpDelayShort: 0.1, penUpDelayLong: 0.3,
  baseDelay: 0.1, delayPer100: 0.1, maxDelay: 1,
  travelFeed: 500, drawFeed: 500, sampleInterval: 0.5,
  scale: 1, offsetX: 0, offsetY: 0, yFlip: true,
  optimization: "overlap_up", downLeadDistance: 5, requiredPenDownTime: 0.1,
  baudrate: 115200, jogStep: 1, jogFeed: 1000, header: "G21\nG90", footer: "",
  reloadGcode: `M3 S1600

G1 X0 Y45 F500
G1 Y-7 F500
G1 Y0 F500`
};

const state = {
  settings: loadJSON("plotterflow.settings", DEFAULTS), svgText: "", paths: [], gcodeMoves: [],
  library: loadJSON("plotterflow.library", []), currentId: null, port: null, reader: null, writer: null,
  readBuffer: "", okWaiters: [], sending: false, jogging: false, paused: false, stopped: false, jobStopped: false,
  previewMode: "svg", previewNormalizeY: false, position: null, machinePosition: null, workPosition: null, workOffset: null, controllerState: "未接続", statusPollTimer: null
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
function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2200); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function switchTab(name) { $$(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === name)); $$(".panel").forEach(x => x.classList.toggle("active", x.id === `tab-${name}`)); }

function init() {
  if (!localStorage.getItem("plotterflow.svgOrientationV1")) { state.settings.yFlip = true; saveJSON("plotterflow.settings", state.settings); localStorage.setItem("plotterflow.svgOrientationV1", "1"); }
  $$(".tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  bindSvg(); bindEditor(); bindSettings(); bindSerial(); bindJobs();
  populateSettings(); refreshLibrary(); updateEditorStats(); renderJobs();
  if (!("serial" in navigator)) log("Web SerialはChrome/EdgeのHTTPSまたはlocalhostで利用できます。", "rx");
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
function generateGcode(options = {}) {
  if (!state.paths.length) return setSvgStatus("先にSVGを読み込んでください。", true);
  state.paths = extractPaths(mountSvgForMeasurement(state.svgText));
  return buildGcodeFromPaths(transformedPaths(), "", { normalizeYPreview: !!state.settings.yFlip, stayOnCurrentTab: !!options.stayOnCurrentTab });
}
async function generateAndSendSvg() {
  const code = generateGcode({ stayOnCurrentTab: true });
  if (code) await startSending(code);
}
function buildGcodeFromPaths(paths, outputName = "", previewOptions = {}) {
  const s = state.settings, lines = [], moves = [];
  lines.push(...String(s.header).split(/\r?\n/).filter(Boolean));
  let previous = { x: 0, y: 0 };
  for (const path of paths) {
    if (path.length < 2) continue;
    const start = path[0], distance = Math.hypot(start.x - previous.x, start.y - previous.y);
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
      lines.push(`G0 X${fmt(leadPoint.x)} Y${fmt(leadPoint.y)} F${fmt(+s.travelFeed)}`); moves.push({ type: "travel", from: previous, to: leadPoint });
      dwell(lines, Math.max(0, upDelay - preTravelDelay - (distance - lead) / travelSpeed));
      lines.push(s.penDownCommand);
      lines.push(`G0 X${fmt(start.x)} Y${fmt(start.y)} F${fmt(+s.travelFeed)}`); moves.push({ type: "travel", from: leadPoint, to: start });
      const absorbed = lead / travelSpeed; dwell(lines, Math.max(0, +s.requiredPenDownTime - absorbed));
    } else {
      lines.push(`G0 X${fmt(start.x)} Y${fmt(start.y)} F${fmt(+s.travelFeed)}`); moves.push({ type: "travel", from: previous, to: start });
      if (overlapEnabled) dwell(lines, Math.max(0, upDelay - preTravelDelay - distance / travelSpeed));
      lines.push(s.penDownCommand); dwell(lines, +s.penDownDelay);
    }
    for (let i = 1; i < path.length; i++) {
      const p = path[i], from = path[i - 1]; lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)} F${fmt(+s.drawFeed)}`); moves.push({ type: "draw", from, to: p });
    }
    previous = path[path.length - 1];
  }
  lines.push(s.penUpCommand); dwell(lines, +s.penUpDelay); lines.push(...String(s.footer).split(/\r?\n/).filter(Boolean));
  $("#gcodeEditor").value = lines.join("\n"); state.gcodeMoves = moves; state.previewNormalizeY = !!previewOptions.normalizeYPreview; state.currentId = null;
  $("#gcodeName").value = outputName ? ensureExt(outputName.replace(/\.plotter\.json$/i, "")) : `plot-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.gcode`;
  updateEditorStats(); setPreviewMode("gcode"); renderGcodePreview(); if (!previewOptions.stayOnCurrentTab) switchTab("gcode"); toast("G-codeを生成しました");
  return lines.join("\n");
}

function generateFromLayoutPaths(paths, outputName = "") { return buildGcodeFromPaths(transformOutputPaths(paths), outputName, { normalizeYPreview: !!state.settings.yFlip }); }
window.PlotterFlow = { generateFromPaths: generateFromLayoutPaths, switchTab, getSettings: () => state.settings };

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
  const pts = moves.flatMap(m => [m.from, m.to]); if (!pts.length) { svg.innerHTML = ""; return; }
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), pad = Math.max(5, (Math.max(...xs)-Math.min(...xs))*.05);
  svg.setAttribute("viewBox", `${Math.min(...xs)-pad} ${Math.min(...ys)-pad} ${Math.max(...xs)-Math.min(...xs)+2*pad || 10} ${Math.max(...ys)-Math.min(...ys)+2*pad || 10}`);
  svg.innerHTML = moves.map(m => `<line x1="${m.from.x}" y1="${m.from.y}" x2="${m.to.x}" y2="${m.to.y}" stroke="${m.type === "draw" ? "#087985" : "#df8a32"}" stroke-width="0.5" ${m.type === "travel" ? 'stroke-dasharray="2 2"' : ""} vector-effect="non-scaling-stroke"/>`).join("") + (previewPosition ? `<circle cx="${previewPosition.x}" cy="${previewPosition.y}" r="2" fill="#d02f52" vector-effect="non-scaling-stroke"/>` : "");
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
  $("#saveGcode").addEventListener("click", saveCurrentGcode); $("#downloadGcode").addEventListener("click", downloadGcode);
  $("#newGcode").addEventListener("click", () => loadEditor(null)); $("#duplicateGcode").addEventListener("click", duplicateGcode);
  $("#renameGcode").addEventListener("click", renameGcode); $("#deleteGcode").addEventListener("click", deleteGcode);
  $("#gcodeLibrary").addEventListener("change", e => loadEditor(e.target.value));
  $("#gcodeFile").addEventListener("change", event => event.target.files[0] && loadGcodeFile(event.target.files[0]));
  $("#sendFromEditor").addEventListener("click", () => { switchTab("serial"); startSending($("#gcodeEditor").value); });
}
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
}
function saveCurrentGcode() {
  const name = ensureExt($("#gcodeName").value.trim() || "untitled.gcode"), gcode = $("#gcodeEditor").value;
  let item = state.library.find(x => x.id === state.currentId);
  if (item) Object.assign(item, { name, gcode, settings: { ...state.settings }, updated: Date.now() });
  else { item = { id: uid(), name, gcode, settings: { ...state.settings }, updated: Date.now() }; state.library.push(item); state.currentId = item.id; }
  saveJSON("plotterflow.library", state.library); refreshLibrary(); toast("G-codeを保存しました");
}
function loadEditor(id) { const item = state.library.find(x => x.id === id); state.currentId = item?.id || null; state.previewNormalizeY = false; $("#gcodeName").value = item?.name || "untitled.gcode"; $("#gcodeEditor").value = item?.gcode || ""; updateEditorStats(); renderGcodePreview(); }
function duplicateGcode() { const item = state.library.find(x => x.id === state.currentId); if (!item) return toast("複製するG-codeを選択してください"); state.currentId = null; $("#gcodeName").value = item.name.replace(/(\.gcode)?$/, "-copy.gcode"); saveCurrentGcode(); }
function renameGcode() { const item = state.library.find(x => x.id === state.currentId); if (!item) return toast("名前を変更する項目を選択してください"); const name = prompt("新しい名前", item.name); if (name) { item.name = ensureExt(name); item.updated = Date.now(); saveJSON("plotterflow.library", state.library); refreshLibrary(); $("#gcodeName").value = item.name; } }
function deleteGcode() { if (!state.currentId || !confirm("選択中のG-codeを削除しますか？")) return; state.library = state.library.filter(x => x.id !== state.currentId); saveJSON("plotterflow.library", state.library); loadEditor(null); refreshLibrary(); }
function downloadGcode() { const blob = new Blob([$("#gcodeEditor").value], { type: "text/plain" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = ensureExt($("#gcodeName").value); a.click(); URL.revokeObjectURL(a.href); }
function ensureExt(name) { return /\.(gcode|nc|tap)$/i.test(name) ? name : `${name}.gcode`; }
function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

function bindSettings() {
  $("#settingsForm").addEventListener("submit", e => { e.preventDefault(); readSettings(); saveJSON("plotterflow.settings", state.settings); $("#svgOrientationFlip").checked=state.settings.yFlip; $("#serialBaud").value = state.settings.baudrate; $("#settingsStatus").textContent = "保存しました。"; toast("設定を保存しました"); });
  $("#resetSettings").addEventListener("click", () => { if (confirm("設定を初期値へ戻しますか？")) { state.settings = { ...DEFAULTS }; populateSettings(); saveJSON("plotterflow.settings", state.settings); } });
}
function populateSettings() { const f = $("#settingsForm"); for (const [k,v] of Object.entries(state.settings)) if (f.elements[k]) f.elements[k].type === "checkbox" ? f.elements[k].checked = !!v : f.elements[k].value = v; $("#svgOrientationFlip").checked=state.settings.yFlip; $("#serialBaud").value = state.settings.baudrate; }
function readSettings() { const f = $("#settingsForm"); for (const k of Object.keys(DEFAULTS)) if (f.elements[k]) state.settings[k] = f.elements[k].type === "checkbox" ? f.elements[k].checked : f.elements[k].type === "number" ? +f.elements[k].value : f.elements[k].value; }

function bindSerial() {
  $("#connectSerial").addEventListener("click", connectSerial); $("#disconnectSerial").addEventListener("click", disconnectSerial);
  $("#serialBaud").addEventListener("change", e => { state.settings.baudrate = +e.target.value || 115200; saveJSON("plotterflow.settings", state.settings); });
  $("#jogStep").value = String(state.settings.jogStep || 1); $("#jogFeed").value = state.settings.jogFeed || 1000;
  $("#jogStep").addEventListener("change", saveJogSettings); $("#jogFeed").addEventListener("input", updateJogPreview); $("#jogFeed").addEventListener("change", saveJogSettings);
  $$('[data-jog-axis]').forEach(button => button.addEventListener("click", () => sendJog(button.dataset.jogAxis, +button.dataset.jogSign)));
  $("#jogCancel").addEventListener("click", cancelJog); updateJogPreview();
  $("#setXyZero").addEventListener("click", setCurrentXyZero); updateSerialPositionDisplay();
  $$('[data-command]').forEach(b => b.addEventListener("click", () => sendRealtime(b.dataset.command + "\n")));
  $("#sendManual").addEventListener("click", () => { const c = $("#manualCommand").value; if (c) sendRealtime(c + "\n"); });
  $("#penUpButton").addEventListener("click", () => sendRealtime(state.settings.penUpCommand + "\n")); $("#penDownButton").addEventListener("click", () => sendRealtime(state.settings.penDownCommand + "\n"));
  $("#reloadButton").addEventListener("click", () => startSending(state.settings.reloadGcode));
  $("#pauseSend").addEventListener("click", pauseSending); $("#resumeSend").addEventListener("click", resumeSending); $("#stopSend").addEventListener("click", stopSending); $("#resetController").addEventListener("click", resetController);
  $("#startSend").addEventListener("click", () => { const id = $("#serialSource").value, code = id === "editor" ? $("#gcodeEditor").value : id === "__reload__" ? state.settings.reloadGcode : state.library.find(x => x.id === id)?.gcode; startSending(code || ""); });
  $("#clearLog").addEventListener("click", () => $("#serialLog").innerHTML = "");
}
async function connectSerial() {
  if (!("serial" in navigator)) return toast("このブラウザはWeb Serialに対応していません");
  try {
    state.port = await navigator.serial.requestPort(); await state.port.open({ baudRate: +$("#serialBaud").value || 115200 }); state.writer = state.port.writable.getWriter();
    $("#connectionBadge").textContent = "Serial: 接続済み"; $("#connectionBadge").classList.add("connected"); log("接続しました", "rx"); readSerial(); startStatusPolling();
  } catch (e) { log(`接続エラー: ${e.message}`, "rx"); }
}
async function readSerial() {
  const decoder = new TextDecoder(); state.reader = state.port.readable.getReader();
  try { while (state.port) { const { value, done } = await state.reader.read(); if (done) break; state.readBuffer += decoder.decode(value, { stream:true }); const lines = state.readBuffer.split(/\r?\n/); state.readBuffer = lines.pop(); lines.forEach(handleSerialLine); } }
  catch (e) { if (state.port) log(`受信エラー: ${e.message}`, "rx"); }
  finally { try { state.reader?.releaseLock(); } catch {} state.reader = null; }
}
function handleSerialLine(line) {
  if (!line) return;
  if (/^<.*>$/.test(line)) { parseControllerStatus(line); return; }
  log(line, "rx"); if (/^ok\b/i.test(line)) state.okWaiters.shift()?.resolve(); else if (/^(error|alarm):?/i.test(line)) state.okWaiters.shift()?.reject(new Error(line));
}
async function disconnectSerial() {
  stopStatusPolling();
  state.stopped = true; state.okWaiters.splice(0).forEach(w => w.reject(new Error("切断")));
  try { await state.reader?.cancel(); } catch {} try { state.writer?.releaseLock(); state.writer = null; await state.port?.close(); } catch (e) { log(`切断エラー: ${e.message}`, "rx"); }
  state.port = null; state.controllerState="未接続"; state.machinePosition=null; state.workPosition=null; state.workOffset=null; updateSerialPositionDisplay(); $("#connectionBadge").textContent = "Serial: 未接続"; $("#connectionBadge").classList.remove("connected"); log("切断しました", "rx");
}
async function rawWrite(text, shouldLog = true) { if (!state.writer) throw new Error("Serial未接続です"); await state.writer.write(new TextEncoder().encode(text)); if (shouldLog) log(text.replace(/[\r\n]+$/, "") || "Ctrl-X", "tx"); }
async function sendRealtime(text) { try { await rawWrite(text); } catch (e) { toast(e.message); } }
function waitOk(timeout = 15000) { return new Promise((resolve,reject) => { const item = { resolve: () => { clearTimeout(item.timer); resolve(); }, reject: e => { clearTimeout(item.timer); reject(e); } }; item.timer = setTimeout(() => { const i=state.okWaiters.indexOf(item); if(i>=0) state.okWaiters.splice(i,1); reject(new Error("ok応答がタイムアウトしました")); }, timeout); state.okWaiters.push(item); }); }
async function sendLineAndWait(line, trackPosition = true) { const pending = waitOk(); await rawWrite(line + "\n"); await pending; if (trackPosition) updatePosition(line); }
function saveJogSettings() {
  state.settings.jogStep = Math.max(.001, +$("#jogStep").value || 1); state.settings.jogFeed = Math.max(1, +$("#jogFeed").value || 1000);
  saveJSON("plotterflow.settings", state.settings); updateJogPreview();
}
function updateJogPreview() { const step=+$("#jogStep").value||1,feed=+$("#jogFeed").value||1000;$("#jogCommandPreview").textContent=`$J=G91 G21 X±${fmt(step)} F${fmt(feed)}`; }
async function sendJog(axis, sign) {
  if (!state.writer) return toast("先にSerial接続してください");
  if (state.sending) return toast("G-code送信中はジョグできません");
  if (state.jogging) return;
  saveJogSettings(); const distance=sign*state.settings.jogStep,command=`$J=G91 G21 ${axis}${fmt(distance)} F${fmt(state.settings.jogFeed)}`;
  state.jogging=true;
  try { await sendLineAndWait(command, false); toast(`${axis} ${distance>0?"+":""}${fmt(distance)} mm`); }
  catch (error) { log(`ジョグエラー: ${error.message}`, "rx"); }
  finally { state.jogging=false; }
}
async function cancelJog() {
  if (!state.writer) return toast("先にSerial接続してください");
  try { await state.writer.write(new Uint8Array([0x85])); log("Jog cancel (0x85)", "tx"); toast("ジョグ停止を送信しました"); }
  catch (error) { toast(error.message); }
}
function startStatusPolling() {
  stopStatusPolling();
  const poll=()=>{if(state.writer)rawWrite("?",false).catch(()=>{});};poll();state.statusPollTimer=setInterval(poll,750);
}
function stopStatusPolling(){if(state.statusPollTimer){clearInterval(state.statusPollTimer);state.statusPollTimer=null;}}
function parseControllerStatus(line) {
  const fields=line.slice(1,-1).split("|");state.controllerState=fields.shift()||"接続済み";let hasWorkPosition=false;
  for(const field of fields){
    const separator=field.indexOf(":");if(separator<0)continue;const key=field.slice(0,separator),value=field.slice(separator+1);
    if(key==="MPos")state.machinePosition=parseStatusVector(value);
    if(key==="WPos"){state.workPosition=parseStatusVector(value);hasWorkPosition=true;}
    if(key==="WCO")state.workOffset=parseStatusVector(value);
  }
  if(!hasWorkPosition&&state.machinePosition&&state.workOffset)state.workPosition={x:state.machinePosition.x-state.workOffset.x,y:state.machinePosition.y-state.workOffset.y,z:state.machinePosition.z-state.workOffset.z};
  if(state.workPosition){state.position={x:state.workPosition.x,y:state.workPosition.y};if(state.previewMode==="gcode")renderGcodePreview();}
  updateSerialPositionDisplay();
}
function parseStatusVector(value){const numbers=value.split(",").map(Number);return{x:numbers[0]||0,y:numbers[1]||0,z:numbers[2]||0};}
function updateSerialPositionDisplay() {
  const actual=state.workPosition,position=actual||state.position;
  $("#serialXPosition").textContent=position?fmt(position.x):"—";$("#serialYPosition").textContent=position?fmt(position.y):"—";
  $("#machineState").textContent=state.controllerState;$("#machineStateDot").classList.toggle("online",!!state.writer);
  $("#positionSource").textContent=actual?"ワーク座標 WPos":position?"送信値からの推定":"ワーク座標";
}
async function setCurrentXyZero() {
  if(!state.writer)return toast("先にSerial接続してください");if(state.sending)return toast("G-code送信中は0点を変更できません");
  try{await sendLineAndWait("G10 L20 P0 X0 Y0",false);state.workPosition={x:0,y:0,z:state.workPosition?.z||0};state.position={x:0,y:0};updateSerialPositionDisplay();await rawWrite("?",false);toast("現在位置をXY=0に設定しました");}
  catch(error){log(`0点設定エラー: ${error.message}`,"rx");toast("XYの0点設定に失敗しました");}
}
function cleanLines(code) { return code.split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith(";") && !x.startsWith("(")); }
async function startSending(code, options = {}) {
  if (!state.writer) return toast("先にSerial接続してください"); if (state.sending) return toast("すでに送信中です");
  const lines = cleanLines(code); if (!lines.length) return toast("送信するG-codeがありません");
  state.sending = true; state.stopped = false; state.paused = false;
  try { await sendLines(lines, options); if (!state.stopped && !options.silent) toast("送信が完了しました"); }
  catch (e) { if (!state.stopped) log(`送信停止: ${e.message}`, "rx"); }
  finally { state.sending = false; }
}
async function sendLines(lines, { silent = false, onProgress } = {}) {
  for (let i=0; i<lines.length; i++) {
    if (state.stopped || state.jobStopped) throw new Error("停止しました"); while (state.paused && !state.stopped) await sleep(100);
    await sendLineAndWait(lines[i]); const ratio=(i+1)/lines.length; $("#sendProgress").value=ratio; $("#sendProgressText").textContent=`${i+1} / ${lines.length} (${Math.round(ratio*100)}%)`; onProgress?.(ratio);
  }
  if (!silent) renderGcodePreview();
}
async function pauseSending() { state.paused = true; await sendRealtime("!"); log("一時停止", "rx"); }
async function resumeSending() { state.paused = false; await sendRealtime("~"); log("再開", "rx"); }
async function stopSending() { state.stopped = true; state.paused = false; state.okWaiters.splice(0).forEach(w => w.reject(new Error("停止"))); await sendRealtime(state.settings.penUpCommand + "\n"); log("送信キューを停止しました", "rx"); }
async function resetController() { state.stopped = true; state.paused = false; state.okWaiters.splice(0).forEach(w => w.reject(new Error("リセット"))); await sendRealtime("\x18"); }
function updatePosition(line) { const xm=line.match(/\bX(-?\d*\.?\d+)/i), ym=line.match(/\bY(-?\d*\.?\d+)/i); if (!xm&&!ym) return; state.position={x:xm?+xm[1]:(state.position?.x||0),y:ym?+ym[1]:(state.position?.y||0)}; updateSerialPositionDisplay(); if(state.previewMode==="gcode") renderGcodePreview(); }
function log(text, type) { const el=$("#serialLog"), line=document.createElement("div"); line.className=type; line.textContent=`${new Date().toLocaleTimeString()} ${type==="tx"?">":"<"} ${text}`; el.append(line); el.scrollTop=el.scrollHeight; }

function bindJobs() {
  $("#addJob").addEventListener("click", () => { addJob(); persistJobs(); }); $("#runJobs").addEventListener("click", runJobs); $("#stopJobs").addEventListener("click", stopJobs);
  $("#jobLoops").value = localStorage.getItem("plotterflow.jobLoops") || 1; $("#jobLoops").addEventListener("change", persistJobs);
  $("#jobList").addEventListener("input", persistJobs); $("#jobList").addEventListener("change", persistJobs);
  $("#jobList").addEventListener("click", e => { const row=e.target.closest(".job-row"); if(!row)return; const rows=$$(".job-row"); if(e.target.matches(".remove-job")) row.remove(); if(e.target.matches(".move-up")&&row.previousElementSibling) row.parentElement.insertBefore(row,row.previousElementSibling); if(e.target.matches(".move-down")&&row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling,row); persistJobs(); });
}
function addJob(data={}) {
  const row=document.createElement("div"); row.className="job-row"; row.dataset.id=data.id||uid();
  const options=state.library.map(x=>`<option value="${x.id}" ${x.id===data.gcodeId?"selected":""}>${escapeHtml(x.name)}</option>`).join("");
  const reloadSelected = data.gcodeId === "__reload__" ? "selected" : "";
  row.innerHTML=`<div><button class="move-up" title="上へ">↑</button><button class="move-down" title="下へ">↓</button></div><label>G-code<select class="job-gcode"><option value="">選択</option><option value="__reload__" ${reloadSelected}>リロード動作（設定）</option>${options}</select></label><label>回数<input class="job-count" type="number" min="1" value="${data.count||1}"></label><label>前delay (秒)<input class="job-before-delay" type="number" min="0" step="0.1" value="${data.beforeDelay||0}"></label><label>後delay (秒)<input class="job-after-delay" type="number" min="0" step="0.1" value="${data.afterDelay||0}"></label><label>前コマンド<input class="job-before-command" value="${escapeHtml(data.beforeCommand||"")}"></label><label>後コマンド<input class="job-after-command" value="${escapeHtml(data.afterCommand||"")}"></label><button class="remove-job danger" title="削除">×</button>`;
  $("#jobList").append(row);
}
function getJobs() { return $$(".job-row").map(r=>({id:r.dataset.id,gcodeId:$(".job-gcode",r).value,count:+$(".job-count",r).value||1,beforeDelay:+$(".job-before-delay",r).value||0,afterDelay:+$(".job-after-delay",r).value||0,beforeCommand:$(".job-before-command",r).value,afterCommand:$(".job-after-command",r).value})); }
function persistJobs(){ saveJSON("plotterflow.jobs",getJobs()); localStorage.setItem("plotterflow.jobLoops",$("#jobLoops").value); }
function renderJobs(){ const saved=loadJSON("plotterflow.jobs",[]); $("#jobList").innerHTML=""; if(Array.isArray(saved)) saved.forEach(addJob); }
async function runJobs() {
  if(!state.writer)return toast("先にSerial接続してください"); if(state.sending)return toast("Serial送信中です");
  const jobs=getJobs().filter(j=>j.gcodeId), loops=Math.max(1,+$("#jobLoops").value||1); if(!jobs.length)return toast("実行するジョブを追加してください");
  state.sending=true; state.stopped=false; state.jobStopped=false; let total=loops*jobs.reduce((n,j)=>n+j.count,0), done=0;
  try{ for(let loop=1;loop<=loops;loop++){ for(let ji=0;ji<jobs.length;ji++){const j=jobs[ji],item=state.library.find(x=>x.id===j.gcodeId),jobGcode=j.gcodeId==="__reload__"?state.settings.reloadGcode:item?.gcode;if(!jobGcode)continue;for(let run=1;run<=j.count;run++){
    if(state.jobStopped)throw new Error("停止しました"); $("#jobProgressText").textContent=`ループ ${loop}/${loops}・ジョブ ${ji+1}/${jobs.length}・実行 ${run}/${j.count}`;
    if(j.beforeDelay)await interruptibleDelay(j.beforeDelay*1000); if(j.beforeCommand)for(const c of cleanLines(j.beforeCommand))await sendLineAndWait(c);
    await sendLines(cleanLines(jobGcode),{silent:true,onProgress:r=>{$("#jobProgress").value=(done+r)/total;}});
    if(j.afterCommand)for(const c of cleanLines(j.afterCommand))await sendLineAndWait(c); if(j.afterDelay)await interruptibleDelay(j.afterDelay*1000); done++; $("#jobProgress").value=done/total;
  }}} $("#jobProgressText").textContent="完了"; toast("全ジョブが完了しました");}
  catch(e){$("#jobProgressText").textContent=`停止: ${e.message}`;}finally{state.sending=false;}
}
async function interruptibleDelay(ms){for(let t=0;t<ms;t+=100){if(state.jobStopped)throw new Error("停止しました");await sleep(Math.min(100,ms-t));}}
async function stopJobs(){state.jobStopped=true;state.stopped=true;state.okWaiters.splice(0).forEach(w=>w.reject(new Error("ジョブ停止")));await sendRealtime(state.settings.penUpCommand+"\n");}

window.addEventListener("beforeunload", e => { if(state.sending){e.preventDefault();e.returnValue="";} });
document.addEventListener("DOMContentLoaded", init);
