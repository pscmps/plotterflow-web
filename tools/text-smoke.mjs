const base = "http://127.0.0.1:9333";
const appUrl = process.argv[2] || "http://127.0.0.1:8765/";
const target = await (await fetch(`${base}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });

let sequence = 0;
const pending = new Map();
const exceptions = [];
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(message.error.message)) : resolve(message.result); }
  if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
});
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
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

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: appUrl });
let appReady = false;
for (let attempt = 0; attempt < 100; attempt++) {
  if (await evaluate(`document.documentElement?.dataset.plotterflowReady==='true'`)) { appReady = true; break; }
  await delay(100);
}
if (!appReady) throw new Error(`PlotterFlow did not become ready at ${appUrl}`);
for (let attempt = 0; attempt < 60; attempt++) {
  if (await evaluate(`document.querySelector('#textFontStatus')?.classList.contains('ready') || false`)) break;
  await delay(250);
}
const fontStatus = await evaluate(`document.querySelector('#textFontStatus')?.textContent`);
const planarInitialTravel = await evaluate(`(() => {
  const original = { ...window.state.settings };
  Object.assign(window.state.settings, window.CONTROLLER_PROFILES['pico2-drv8835-planar'].settings, {
    controllerProfile: 'pico2-drv8835-planar', yFlip: false, optimization: 'safe'
  });
  PlotterFlow.generateFromPaths([
    [{ x: 10, y: 20 }, { x: 11, y: 21 }],
    [{ x: 30, y: 40 }, { x: 31, y: 41 }]
  ], 'planar-initial-travel.gcode');
  const travel = document.querySelector('#gcodeEditor').value.split(/\\r?\\n/).filter(line => line.startsWith('G0 X') || line.startsWith('G0 Y'));
  Object.keys(window.state.settings).forEach(key => delete window.state.settings[key]);
  Object.assign(window.state.settings, original);
  Object.assign(window.state.settings, window.CONTROLLER_PROFILES['grbl-fluidnc'].settings, {
    controllerProfile: 'grbl-fluidnc', yFlip: false, optimization: 'safe'
  });
  PlotterFlow.generateFromPaths([[{ x: 10, y: 20 }, { x: 11, y: 21 }]], 'other-profile-travel.gcode');
  const otherProfileTravel = document.querySelector('#gcodeEditor').value.split(/\\r?\\n/).find(line => line.startsWith('G0 X'));
  Object.keys(window.state.settings).forEach(key => delete window.state.settings[key]);
  Object.assign(window.state.settings, original);
  return {
    travel,
    splitXThenY: travel[0] === 'G0 X10 F500' && travel[1] === 'G0 Y20 F500',
    laterTravelCombined: travel.includes('G0 X30 Y40 F500'),
    otherProfileUnchanged: /^G0 X10 Y20 F/.test(otherProfileTravel || '')
  };
})()`);
const rthetaProfile = await evaluate(`(() => {
  const original = { ...window.state.settings };
  applyControllerProfile('rtheta-control-web');
  PlotterFlow.generateFromPaths([[{ x: 10, y: 20 }, { x: 11, y: 21 }]], 'rtheta-compatible.gcode');
  const lines = document.querySelector('#gcodeEditor').value.split(/\\r?\\n/).filter(Boolean);
  const allowed = lines.every(line => /^(?:G90|G[01](?: [XYZF]-?(?:\\d+(?:\\.\\d+)?|\\.\\d+))+)$/.test(line));
  const result = {
    lines,
    allowed,
    header: lines[0],
    penUp: lines.includes('G0 Z1'),
    penDown: lines.includes('G1 Z0'),
    unsupported: lines.filter(line => /^(?:G21|G4|M)/.test(line))
  };
  Object.keys(window.state.settings).forEach(key => delete window.state.settings[key]);
  Object.assign(window.state.settings, original);
  return result;
})()`);
if (!rthetaProfile.allowed || rthetaProfile.header !== 'G90' || !rthetaProfile.penUp || !rthetaProfile.penDown || rthetaProfile.unsupported.length) throw new Error(`Rtheta profile mismatch: ${JSON.stringify(rthetaProfile)}`);
await evaluate(`(() => { const input=document.querySelector('#drawingTextInput'); input.value='展示会'; document.querySelector('#drawingAddText').click(); return true; })()`);
await delay(250);
const added = await evaluate(`(() => { const path=document.querySelector('#drawingCanvas path.drawing-object.selected'); return { count:document.querySelectorAll('#drawingCanvas .drawing-object').length, pathLength:path?.getAttribute('d')?.length||0, propertiesVisible:!document.querySelector('#drawingProperties').hidden, stored:localStorage.getItem('plotterflow.drawing.last')?.includes('"type":"text"')||false }; })()`);
const moveBefore = await evaluate(`(() => { const r=document.querySelector('#drawingCanvas path.drawing-object.selected').getBoundingClientRect(),o=JSON.parse(localStorage.getItem('plotterflow.drawing.last')).document.objects.at(-1);return { screenX:r.x+r.width/2,screenY:r.y+r.height/2,x:o.x,y:o.y }; })()`);
await send("Input.dispatchMouseEvent",{type:"mousePressed",x:moveBefore.screenX,y:moveBefore.screenY,button:"left",clickCount:1});
await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:moveBefore.screenX+30,y:moveBefore.screenY+20,button:"left",buttons:1});
await send("Input.dispatchMouseEvent",{type:"mouseReleased",x:moveBefore.screenX+30,y:moveBefore.screenY+20,button:"left",clickCount:1});
await delay(100);
const moveAfter = await evaluate(`(() => { const o=JSON.parse(localStorage.getItem('plotterflow.drawing.last')).document.objects.at(-1);return{x:o.x,y:o.y}; })()`);
const pinchBefore = await evaluate(`(() => { const r=document.querySelector('#drawingCanvas path.drawing-object.selected').getBoundingClientRect(),data=JSON.parse(localStorage.getItem('plotterflow.drawing.last'));return { x:r.x+r.width/2, y:r.y+r.height/2, fontSize:data.document.objects.at(-1).fontSize }; })()`);
await send("Input.dispatchTouchEvent", { type:"touchStart", touchPoints:[{x:pinchBefore.x-8,y:pinchBefore.y},{x:pinchBefore.x+8,y:pinchBefore.y}] });
await send("Input.dispatchTouchEvent", { type:"touchMove", touchPoints:[{x:pinchBefore.x-24,y:pinchBefore.y},{x:pinchBefore.x+24,y:pinchBefore.y}] });
await send("Input.dispatchTouchEvent", { type:"touchEnd", touchPoints:[] });
await delay(150);
const pinchAfter = await evaluate(`JSON.parse(localStorage.getItem('plotterflow.drawing.last')).document.objects.at(-1).fontSize`);
await evaluate(`document.querySelector('#drawingProperties').click()`);
const dialogOpen = await evaluate(`document.querySelector('#textPropertiesDialog').open`);
await evaluate(`(() => { document.querySelector('#textFontSize').value='10'; document.querySelector('#textLetterSpacing').value='0.5'; document.querySelector('#textLineHeight').value='1.4'; document.querySelector('#textWritingMode').value='vertical'; document.querySelector('#textRotation').value='15'; document.querySelector('#textPropertiesApply').click(); return true; })()`);
await delay(150);
await evaluate(`document.querySelector('#drawingGenerateGcode').click()`);
await delay(200);
const gcode = await evaluate(`(() => { const lines=document.querySelector('#gcodeEditor').value.split(/\\r?\\n/); return { active:[...document.querySelectorAll('.tab')].find(node=>node.classList.contains('active'))?.textContent, travel:lines.filter(line=>line.startsWith('G0 X')).length, draw:lines.filter(line=>line.startsWith('G1 X')).length, hasNaN:lines.some(line=>line.includes('NaN')) }; })()`);
await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
await evaluate(`document.querySelector('[data-tab="drawing"]').click()`);
const mobile = await evaluate(`(() => { const r=document.querySelector('.text-quick-add').getBoundingClientRect();return{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,textPanelTop:r.top,textPanelBottom:r.bottom}; })()`);
await send("Page.reload",{ignoreCache:false});
await delay(250);
for(let attempt=0;attempt<60;attempt++){if(await evaluate(`document.querySelector('#textFontStatus')?.classList.contains('ready')||false`))break;await delay(250);}
const reloaded=await evaluate(`({textPaths:document.querySelectorAll('#drawingCanvas path.drawing-object').length,stored:localStorage.getItem('plotterflow.drawing.last')?.includes('"renderMode":"outline"')||false})`);
console.log(JSON.stringify({ fontStatus, planarInitialTravel, rthetaProfile, added, move:{ before:{x:moveBefore.x,y:moveBefore.y}, after:moveAfter }, pinch:{ before:pinchBefore.fontSize, after:pinchAfter }, dialogOpen, gcode, mobile, reloaded, exceptions }, null, 2));
socket.close();
