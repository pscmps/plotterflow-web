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


const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="40mm" viewBox="0 0 60 40">
<path d="M5 5 L25 5" stroke="#ff0000" fill="none"/>
<path d="M5 15 L25 15" stroke="blue" fill="none"/>
<path d="M5 25 L25 25" style="stroke:rgb(255,0,0)" fill="none"/>
<rect x="35" y="5" width="10" height="10" fill="#008000" stroke="none"/>
</svg>`;
const generate = `(() => {
  loadSvg(${JSON.stringify(svg)}, 'colors.svg');
  const code = generateGcode({ stayOnCurrentTab: true });
  const lines = code.split(/\\r?\\n/);
  return {
    toolLines: lines.filter(line => /M6/.test(line)),
    draws: lines.filter(line => line.startsWith('G1 ')).length,
    lastLines: lines.slice(-3),
    colors: window.state.paths.map(path => path.color),
    previewStrokes: [...new Set([...document.querySelectorAll('#previewSvg line')].map(line => line.getAttribute('stroke')))].sort()
  };
})()`;
const fieldVisible = `(() => { document.querySelector('[data-tab="settings"]').click(); return getComputedStyle(document.querySelector('#toolChangeByColorField')).display !== 'none'; })()`;
const setOption = value => `(() => { const form = document.querySelector('#settingsForm'); form.elements.toolChangeByColor.checked = ${value}; form.requestSubmit(); return window.state.settings.toolChangeByColor; })()`;
const setDevelopment = value => `(() => { window.confirm = () => true; const toggle = document.querySelector('#developmentModeToggle'); toggle.checked = ${value}; toggle.dispatchEvent(new Event('change', { bubbles: true })); return window.state.developmentMode; })()`;
const fail = (label, value) => { throw new Error(`${label}: ${JSON.stringify(value)}`); };

// 1. 通常表示: 設定は見えず、保存値がtrueでも T/M6 は出ない。
const hiddenByDefault = !(await evaluate(fieldVisible));
if (!hiddenByDefault) fail("field must be hidden without development mode", hiddenByDefault);
await evaluate(`(() => { window.state.settings.toolChangeByColor = true; return true; })()`);
const normal = await evaluate(generate);
if (normal.toolLines.length || normal.previewStrokes.includes("#ff0000")) fail("normal mode emitted tool changes", normal);
if (normal.colors.join() !== "#ff0000,#0000ff,#ff0000,#008000") fail("path colors", normal);
await evaluate(`(() => { window.state.settings.toolChangeByColor = false; return true; })()`);

// 2. 開発中オン＋チェックなし: 表示されるが出力は従来どおり。
if (!(await evaluate(setDevelopment(true)))) fail("development mode", false);
const visibleInDevelopment = await evaluate(fieldVisible);
if (!visibleInDevelopment) fail("field must be visible in development mode", visibleInDevelopment);
const unchecked = await evaluate(generate);
if (unchecked.toolLines.length || unchecked.draws !== normal.draws) fail("unchecked option changed output", unchecked);

// 3. 開発中オン＋チェックあり: 色ごとにまとめて T<n> M6、最後に T0 M6。
if (!(await evaluate(setOption(true)))) fail("option was not saved", false);
const grouped = await evaluate(generate);
const expected = ["T1 M6 ; tool-color #ff0000", "T2 M6 ; tool-color #0000ff", "T3 M6 ; tool-color #008000", "T0 M6"];
if (grouped.toolLines.join("|") !== expected.join("|")) fail("tool change lines", grouped);
if (grouped.draws !== normal.draws) fail("draw count changed", grouped);
if (!grouped.lastLines.includes("T0 M6")) fail("T0 M6 must follow the final pen up", grouped);
for (const color of ["#ff0000", "#0000ff", "#008000"]) if (!grouped.previewStrokes.includes(color)) fail("preview color missing", grouped);

// 4. 再読込後も保持され、開発中をオフにすると出力されなくなる。
await reload();
const persisted = await evaluate(`({development:window.state.developmentMode,option:window.state.settings.toolChangeByColor,checked:document.querySelector('#settingsForm').elements.toolChangeByColor.checked})`);
if (!persisted.development || !persisted.option || !persisted.checked) fail("persistence", persisted);
if (await evaluate(setDevelopment(false))) fail("development mode must turn off", true);
const hiddenAgain = !(await evaluate(fieldVisible));
const afterDisable = await evaluate(generate);
if (!hiddenAgain || afterDisable.toolLines.length) fail("disabled development mode still emits tool changes", afterDisable);

console.log(JSON.stringify({ hiddenByDefault, visibleInDevelopment, grouped, persisted, hiddenAgain, afterDisableToolLines: afterDisable.toolLines.length }, null, 2));
socket.close();
