const base = "http://127.0.0.1:9333";
const appUrl = process.argv[2] || "http://127.0.0.1:8765/";
const target = await (await fetch(`${base}/json/new?${encodeURIComponent(appUrl)}`, { method: "PUT" })).json();
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
async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

await send("Runtime.enable");
await send("Page.enable");
for (let attempt = 0; attempt < 60; attempt++) {
  if (await evaluate(`document.querySelector('#textFontStatus')?.classList.contains('ready') || false`)) break;
  await delay(250);
}
const fontStatus = await evaluate(`document.querySelector('#textFontStatus')?.textContent`);
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
for(let attempt=0;attempt<60;attempt++){if(await evaluate(`document.querySelector('#textFontStatus')?.classList.contains('ready')||false`))break;await delay(250);}
const reloaded=await evaluate(`({textPaths:document.querySelectorAll('#drawingCanvas path.drawing-object').length,stored:localStorage.getItem('plotterflow.drawing.last')?.includes('"renderMode":"outline"')||false})`);
console.log(JSON.stringify({ fontStatus, added, move:{ before:{x:moveBefore.x,y:moveBefore.y}, after:moveAfter }, pinch:{ before:pinchBefore.fontSize, after:pinchAfter }, dialogOpen, gcode, mobile, reloaded, exceptions }, null, 2));
socket.close();
