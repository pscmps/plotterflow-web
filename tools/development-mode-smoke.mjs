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

const initial = await evaluate(`(() => {
  document.querySelector('[data-tab="settings"]').click();
  return {
    enabled: window.state.developmentMode,
    toggle: document.querySelector('#developmentModeToggle').checked,
    profile: window.state.settings.controllerProfile,
    options: [...document.querySelector('#controllerProfile').options].map(option => option.value),
    stsSettingsHidden: document.querySelector('#stsDirectAxesSettings').hidden,
    experimentalOptimizationHidden: document.querySelector('[name="optimization"] option[value="overlap_down"]').hidden
  };
})()`);
if (initial.enabled || initial.toggle || initial.profile !== "grbl-fluidnc") throw new Error(`initial mode mismatch: ${JSON.stringify(initial)}`);
if (initial.options.length !== 3 || initial.options.includes("pico2-drv8835-planar") || !initial.stsSettingsHidden || !initial.experimentalOptimizationHidden) throw new Error(`initial visibility mismatch: ${JSON.stringify(initial)}`);

const stableProfile = await evaluate(`(() => {
  applyControllerProfile('rp2040-geek-sts3215-id2-id3');
  const result = { enabled: window.state.developmentMode, profile: window.state.settings.controllerProfile, stsSettingsHidden: document.querySelector('#stsDirectAxesSettings').hidden };
  applyControllerProfile('grbl-fluidnc');
  return result;
})()`);
if (stableProfile.enabled || stableProfile.profile !== "rp2040-geek-sts3215-id2-id3" || stableProfile.stsSettingsHidden) throw new Error(`stable profile mismatch: ${JSON.stringify(stableProfile)}`);

const enabled = await evaluate(`(() => {
  const toggle = document.querySelector('#developmentModeToggle');
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  applyControllerProfile('pico2-drv8835-planar');
  return {
    enabled: window.state.developmentMode,
    profile: window.state.settings.controllerProfile,
    options: [...document.querySelector('#controllerProfile').options].map(option => option.value),
    armHidden: document.querySelector('#planarArmPanel').hidden,
    stored: localStorage.getItem('plotterflow.developmentModeV1')
  };
})()`);
if (!enabled.enabled || enabled.profile !== "pico2-drv8835-planar" || enabled.options.length !== 8 || enabled.armHidden || enabled.stored !== "1") throw new Error(`enabled mode mismatch: ${JSON.stringify(enabled)}`);

await reload();
const persisted = await evaluate(`({enabled:window.state.developmentMode,profile:window.state.settings.controllerProfile,toggle:document.querySelector('#developmentModeToggle').checked,armHidden:document.querySelector('#planarArmPanel').hidden})`);
if (!persisted.enabled || persisted.profile !== "pico2-drv8835-planar" || !persisted.toggle || persisted.armHidden) throw new Error(`persistence mismatch: ${JSON.stringify(persisted)}`);

const cancelled = await evaluate(`(() => {
  window.confirm = () => false;
  const toggle = document.querySelector('#developmentModeToggle');
  toggle.checked = false;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  return { enabled: window.state.developmentMode, toggle: toggle.checked, profile: window.state.settings.controllerProfile };
})()`);
if (!cancelled.enabled || !cancelled.toggle || cancelled.profile !== "pico2-drv8835-planar") throw new Error(`cancel mismatch: ${JSON.stringify(cancelled)}`);

const disabled = await evaluate(`(() => {
  window.confirm = () => true;
  const toggle = document.querySelector('#developmentModeToggle');
  toggle.checked = false;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  return {
    enabled: window.state.developmentMode,
    profile: window.state.settings.controllerProfile,
    options: [...document.querySelector('#controllerProfile').options].map(option => option.value),
    armHidden: document.querySelector('#planarArmPanel').hidden,
    stored: localStorage.getItem('plotterflow.developmentModeV1')
  };
})()`);
if (disabled.enabled || disabled.profile !== "grbl-fluidnc" || disabled.options.length !== 3 || !disabled.armHidden || disabled.stored !== "0") throw new Error(`disable mismatch: ${JSON.stringify(disabled)}`);

await evaluate(`(() => {
  const saved = JSON.parse(localStorage.getItem('plotterflow.settings'));
  saved.controllerProfile = 'm5stack-drv8835-planar';
  localStorage.setItem('plotterflow.settings', JSON.stringify(saved));
  localStorage.removeItem('plotterflow.developmentModeV1');
  return true;
})()`);
await reload();
const migrated = await evaluate(`({enabled:window.state.developmentMode,profile:window.state.settings.controllerProfile,sdControlsHidden:document.querySelector('#serialDestinationGroup').hidden,stored:localStorage.getItem('plotterflow.developmentModeV1')})`);
if (!migrated.enabled || migrated.profile !== "m5stack-drv8835-planar" || migrated.sdControlsHidden || migrated.stored !== "1") throw new Error(`migration mismatch: ${JSON.stringify(migrated)}`);

const busy = await evaluate(`(() => {
  window.state.port = {};
  const toggle = document.querySelector('#developmentModeToggle');
  toggle.checked = false;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  const result = { enabled: window.state.developmentMode, toggle: toggle.checked, profile: window.state.settings.controllerProfile };
  window.state.port = null;
  return result;
})()`);
if (!busy.enabled || !busy.toggle || busy.profile !== "m5stack-drv8835-planar") throw new Error(`busy guard mismatch: ${JSON.stringify(busy)}`);

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
const mobile = await evaluate(`(() => { document.querySelector('[data-tab="settings"]').click(); const toggle=document.querySelector('.development-mode-toggle').getBoundingClientRect(); return {clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,toggleWidth:toggle.width,toggleRight:toggle.right}; })()`);
if (mobile.scrollWidth > mobile.clientWidth || mobile.toggleWidth <= 0 || mobile.toggleRight > mobile.clientWidth) throw new Error(`mobile overflow: ${JSON.stringify(mobile)}`);

console.log(JSON.stringify({ initial, stableProfile, enabled, persisted, cancelled, disabled, migrated, busy, mobile }, null, 2));
socket.close();
