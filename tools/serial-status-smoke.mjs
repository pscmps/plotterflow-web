const base = process.env.PLOTTERFLOW_CDP_BASE || "http://127.0.0.1:9333";
const appUrl = process.argv[2] || "http://127.0.0.1:8765/";
const target = await (await fetch(`${base}/json/new?${encodeURIComponent(appUrl)}`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence=0;const pending=new Map(),exceptions=[];
socket.addEventListener("message",event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const callbacks=pending.get(message.id);pending.delete(message.id);message.error?callbacks.reject(new Error(message.error.message)):callbacks.resolve(message.result);}if(message.method==="Runtime.exceptionThrown")exceptions.push(message.params.exceptionDetails.text);});
function send(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const response=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);return response.result.value;}
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
await send("Runtime.enable");await send("Page.enable");
for(let attempt=0;attempt<40;attempt++){if(await evaluate(`document.querySelector('#setXyZero')!==null&&typeof handleSerialLine==='function'`))break;await delay(100);}
await evaluate(`handleSerialLine('<Idle|MPos:12.500,-3.000,0.000|WCO:2.500,-1.000,0.000>')`);
const derived=await evaluate(`({x:document.querySelector('#serialXPosition').textContent,y:document.querySelector('#serialYPosition').textContent,status:document.querySelector('#machineState').textContent,source:document.querySelector('#positionSource').textContent})`);
await evaluate(`handleSerialLine('<Jog|WPos:4.250,5.500,0.000>')`);
const direct=await evaluate(`({x:document.querySelector('#serialXPosition').textContent,y:document.querySelector('#serialYPosition').textContent,status:document.querySelector('#machineState').textContent})`);
await evaluate(`(() => { window.__serialWrites=[];state.writer={write:async bytes=>window.__serialWrites.push(new TextDecoder().decode(bytes))};document.querySelector('#setXyZero').click();setTimeout(()=>handleSerialLine('ok'),20);return true;})()`);
await delay(100);
const zero=await evaluate(`({writes:window.__serialWrites,x:document.querySelector('#serialXPosition').textContent,y:document.querySelector('#serialYPosition').textContent})`);
const pfdbg=await evaluate(`(() => {
  const log=document.querySelector('#serialLog');
  log.innerHTML='';state.sending=true;state.settings.controllerProfile='pico2-tmc2209-planar';
  handleSerialLine('[MSG:PFDBG END axis=X result=ok]');
  handleSerialLine('[MSG:ordinary message]');
  const planar=[...log.children].map(item=>item.textContent);
  log.innerHTML='';state.settings.controllerProfile='grbl-fluidnc';
  handleSerialLine('[MSG:PFDBG END axis=X result=ok]');
  const grbl=[...log.children].map(item=>item.textContent);
  state.sending=false;
  return {planar,grbl};
})()`);
const planarProfile=await evaluate(`({footer:CONTROLLER_PROFILES['pico2-tmc2209-planar'].settings.footer,initializeCommand:CONTROLLER_PROFILES['pico2-tmc2209-planar'].settings.initializeCommand,jogAutoDisable:CONTROLLER_PROFILES['pico2-tmc2209-planar'].settings.jogAutoDisable,grblFooter:CONTROLLER_PROFILES['grbl-fluidnc'].settings.footer,grblJogAutoDisable:CONTROLLER_PROFILES['grbl-fluidnc'].settings.jogAutoDisable})`);
const planarJog=await evaluate(`(() => { applyControllerProfile('pico2-tmc2209-planar'); return {stateStep:state.settings.jogStep,stateFeed:state.settings.jogFeed,uiStep:document.querySelector('#jogStep').value,uiFeed:document.querySelector('#jogFeed').value,preview:document.querySelector('#jogCommandPreview').textContent}; })()`);
const drvDebug=await evaluate(`(() => {
  const log=document.querySelector('#serialLog');
  log.innerHTML='';state.sending=true;state.settings.controllerProfile='pico2-drv8835-planar';
  handleSerialLine('[MSG:DRV8835 armed=1 outputs=HiZ]');
  handleSerialLine('[MSG:ordinary message]');
  const lines=[...log.children].map(item=>item.textContent);
  state.sending=false;
  return lines;
})()`);
const drvProfile=await evaluate(`(() => { applyControllerProfile('pico2-drv8835-planar'); const profile=CONTROLLER_PROFILES['pico2-drv8835-planar']; return {header:profile.settings.header,footer:profile.settings.footer,initializeCommand:profile.settings.initializeCommand,jogAutoDisable:profile.settings.jogAutoDisable,stateStep:state.settings.jogStep,stateFeed:state.settings.jogFeed,uiStep:document.querySelector('#jogStep').value,uiFeed:document.querySelector('#jogFeed').value}; })()`);
if(pfdbg.planar.length!==1||!pfdbg.planar[0].includes('[MSG:PFDBG END axis=X result=ok]'))throw new Error(`planar PFDBG log mismatch: ${JSON.stringify(pfdbg.planar)}`);
if(pfdbg.grbl.length!==0)throw new Error(`PFDBG leaked into non-planar profile: ${JSON.stringify(pfdbg.grbl)}`);
if(planarProfile.footer!=='M122 P\nM18'||planarProfile.initializeCommand!=='M18\nG21\nG90'||planarProfile.jogAutoDisable!==true||planarProfile.grblFooter!==''||planarProfile.grblJogAutoDisable!==undefined)throw new Error(`profile safety mismatch: ${JSON.stringify(planarProfile)}`);
if(planarJog.stateStep!==40||planarJog.stateFeed!==2400||planarJog.uiStep!=='40'||planarJog.uiFeed!=='2400'||!planarJog.preview.includes('40 F2400'))throw new Error(`planar jog mismatch: ${JSON.stringify(planarJog)}`);
if(drvDebug.length!==1||!drvDebug[0].includes('[MSG:DRV8835 armed=1 outputs=HiZ]'))throw new Error(`DRV8835 debug log mismatch: ${JSON.stringify(drvDebug)}`);
if(drvProfile.header!=='M18\nM980 U8 X100 Y100 H500\nM17\nG21\nG90\nG10 L20 P0 X0 Y0'||drvProfile.footer!=='M122\nM18'||drvProfile.initializeCommand!=='M18\nM980 U8 X100 Y100 H500\nG21\nG90'||drvProfile.jogAutoDisable!==false||drvProfile.stateStep!==0.625||drvProfile.stateFeed!==300||drvProfile.uiStep!=='0.625'||drvProfile.uiFeed!=='300')throw new Error(`DRV8835 profile mismatch: ${JSON.stringify(drvProfile)}`);
console.log(JSON.stringify({derived,direct,zero,pfdbg,planarProfile,planarJog,drvDebug,drvProfile,exceptions},null,2));socket.close();
