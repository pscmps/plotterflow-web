const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const setup = require('../micropython-setup.js');
global.MicroPythonSetup = setup;
global.MicroPythonTmcView = require('../micropython-tmc-view.js');
global.MicroPythonShieldData = require('../micropython-shield-data.js');
const recipes = require('../micropython-shield-recipes.js');
const boardView = require('../micropython-board-view.js');
const app = fs.readFileSync(new URL('../app.js', `file://${__filename.replaceAll('\\', '/')}`), 'utf8');
const start = app.indexOf('const MICRO_PYTHON_BOARD_PROFILES =');
const end = app.indexOf('const MICRO_PYTHON_BUNDLE_FILES', start);
const boards = vm.runInNewContext(app.slice(start, end) + '; MICRO_PYTHON_BOARD_PROFILES', {MicroPythonShieldRecipes:recipes});
// Crossings and common ENABLE branches are allowed; different signals must
// never share any nonzero-length segment (including diagonal pin escapes).
function assertNoSignalOverlap(svg) {
  const lines = [];
  for (const match of svg.matchAll(/<path d="([^"]+)"[^>]*data-(?:signal|net)="([^"]+)"/g)) {
    let cursor;
    for (const command of match[1].matchAll(/([MLHV])([\d. -]+)/g)) {
      const values = command[2].trim().split(/\s+/).map(Number);
      const end = command[1] === 'H' ? [values[0], cursor[1]]
        : command[1] === 'V' ? [cursor[0], values[0]] : values;
      if (command[1] !== 'M' && (cursor[0] !== end[0] || cursor[1] !== end[1]))
        lines.push({ start: cursor, end, signal: match[2] });
      cursor = end;
    }
  }
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const minus = (a, b) => [a[0] - b[0], a[1] - b[1]];
  for (let i = 0; i < lines.length; i++) for (const b of lines.slice(i + 1)) {
    const a = lines[i];
    if (a.signal === b.signal) continue;
    const direction = minus(a.end, a.start);
    if (cross(direction, minus(b.end, b.start)) || cross(direction, minus(b.start, a.start))) continue;
    const axis = direction[0] ? 0 : 1;
    const low = Math.max(Math.min(a.start[axis], a.end[axis]), Math.min(b.start[axis], b.end[axis]));
    const high = Math.min(Math.max(a.start[axis], a.end[axis]), Math.max(b.start[axis], b.end[axis]));
    assert.ok(high <= low, `${a.signal}/${b.signal} overlap: ${JSON.stringify([a, b])}`);
  }
}
let count = 0;
let wiringCount = 0;
let physicalCount = 0;
function checkPhysical(config) {
  const svg = boardView.render(config);
  if (!boardView.supported(config.id)) {
    assert.ok(svg.includes('未照合'));
    assert.ok(!svg.includes('<svg'));
  } else if (!setup.isShield(config.id)) {
    assertNoSignalOverlap(svg);
    checkNetwork(boardView.standaloneNetwork(config).network, false);
    for(const signal of setup.signals) {
      const pad=boardView.layout(config).pads.find(p=>p.gpio===config.pins[signal]);
      assert.ok(svg.includes(`M${pad.x} ${pad.y} `));
      assert.ok(svg.includes(`data-signal="${signal}" data-pin="${pad.gpio}" data-physical="${pad.physical}"`));
    }
    physicalCount++;
  } else if (config.board.compact) {
    assertNoSignalOverlap(svg);
    const compact=config.board.compact;
    const n=boardView.compactNetwork(config).network;
    checkNetwork(n,true);
    // A crossing is allowed, but not so near an unrelated physical pad that
    // it looks connected (particularly Touch J13 next to the motor sockets).
    for(const e of n.edges) {
      const run=[n.points[e.from],...e.via,n.points[e.to]];
      for(const [id,p] of Object.entries(n.points).filter(([id])=>id.startsWith('J')&&id!==e.from&&id!==e.to)) for(let i=1;i<run.length;i++) {
        const a=run[i-1],b=run[i],dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
        if(!len) continue;
        const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len));
        assert.ok(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)>=6,`${config.id}: ${e.net} too close to ${id}`);
      }
    }
    assert.ok(svg.includes('ENが右上・VMが右下'));
    for(const [ref,part] of Object.entries(compact.parts)) if(ref.startsWith('J')) for(const pin of Object.keys(part.pads))
      assert.ok(svg.includes(`data-connector="${ref}" data-terminal="${pin}"`));
    const u=compact.parts.U1.pads;
    const en=boardView.compactPoint(compact,...u['1']),dir=boardView.compactPoint(compact,...u['8']),vm=boardView.compactPoint(compact,...u['16']);
    assert.ok(dir.x<en.x && dir.y===en.y && vm.x===en.x && vm.y>en.y);
    for(const ref of ['U1','U2']) {
      const pads=compact.parts[ref].pads,origin=boardView.compactPoint(compact,...pads['1']);
      const standard=global.MicroPythonTmcView.ports(0,0,20.32);
      for(const [names,numbers] of [[global.MicroPythonTmcView.left,[1,2,3,4,5,6,7,8]],[global.MicroPythonTmcView.right,[16,15,14,13,12,11,10,9]]]) names.forEach((name,i)=>{
        const actual=boardView.compactPoint(compact,...pads[numbers[i]]),local=standard[name];
        assert.ok(Math.abs(actual.x-(origin.x-local.y))<1e-6 && Math.abs(actual.y-(origin.y+local.x))<1e-6,`${ref} ${name} rotated pad mismatch`);
      });
    }
  } else {
    assertNoSignalOverlap(svg);
    checkNetwork(boardView.shieldNetwork().network, true);
    assert.ok(svg.includes('裏面'));
    for(const connector of boardView.shieldConnectors) connector.pads.forEach((_,i)=>
      assert.ok(svg.includes(`data-connector="${connector.ref}" data-terminal="${i+1}"`)));
  }
}
function checkNetwork(n, shield) {
  for(const e of n.edges) {
    assert.ok(n.points[e.from] && n.points[e.to], `missing endpoint ${e.from}/${e.to}`);
    for(const p of [n.points[e.from],...e.via,n.points[e.to]]) assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  }
  function connected(net, terminals) {
    const visited=new Set([terminals[0]]);
    for(let changed=true;changed;) {
      changed=false;
      for(const e of n.edges.filter(e=>e.net===net)) if(visited.has(e.from)||visited.has(e.to)) {
        for(const id of [e.from,e.to]) if(!visited.has(id)) {visited.add(id);changed=true;}
      }
    }
    for(const id of terminals) assert.ok(visited.has(id), `${net}: disconnected ${id}`);
  }
  if(shield) {
    for(const [ref,axis] of [['J5','X'],['J6','Y']]) ['A1','A2','B1','B2'].forEach((pin,i)=>connected(`${axis}_${pin}`,[`${ref}.${i+1}`,`${axis}.${pin}`]));
    connected('VM',['J7.1','vm.PLUS']);connected('GND',['J7.2','vm.GND']);
    connected('SERVO_5V',['J8.1','five.PLUS']);connected('GND',['J8.2','five.GND']);
    connected('PEN_PWM',['J9.3','servo.PWM']);connected('SERVO_5V',['J9.2','servo.VPLUS']);connected('GND',['J9.1','servo.GND']);
    return;
  }
  connected('ENABLE',['mcu.ENABLE','X.EN','Y.EN']);
  connected('PEN_PWM',['mcu.PEN_PWM','servo.PWM']);
  connected('VDD',['mcu.VDD','X.VDD','Y.VDD']);
  connected('VM',['vm.PLUS','X.VM','Y.VM']);
  connected('SERVO_5V',['five.PLUS','servo.VPLUS']);
  connected('GND',['mcu.GND','vm.GND','five.GND','servo.GND',...['X','Y'].flatMap(a=>['GND1','GND2','MS1','MS2','CLK'].map(p=>`${a}.${p}`))]);
  for(const axis of ['X','Y']) {
    for(const pin of ['STEP','DIR']) connected(`${axis}_${pin}`,[`mcu.${axis}_${pin}`,`${axis}.${pin}`]);
    for(const pin of ['A1','A2','B1','B2']) connected(`${axis}_${pin}`,[`${axis}.${pin}`,`${axis}motor.${pin}`]);
    for(const pin of ['PDN4','PDN5']) assert.ok(!n.edges.some(e=>e.from===`${axis}.${pin}`||e.to===`${axis}.${pin}`),'PDN must remain NC');
  }
  // Supply positive nets must not share any physical terminal.
  const assigned=new Map();
  for(const e of n.edges) for(const id of [e.from,e.to]) {
    assert.ok(!assigned.has(id)||assigned.get(id)===e.net,`shorted terminal ${id}`);
    assigned.set(id,e.net);
  }
}
for (const [id, board] of Object.entries(boards)) {
  if (board.supported === false) continue;
  const config = setup.configuration(id, board);
  assert.deepEqual(config.errors, [], id);
  const python = setup.boardConfig(config), svg = setup.render(config);
  assertNoSignalOverlap(svg);
  checkPhysical(config);
  wiringCount++;
  for (const name of setup.signals) {
    assert.ok(python.includes(`${name} = ${config.pins[name]}\n`), id + name);
    assert.ok(svg.includes(`data-signal="${name}" data-pin="${config.pins[name]}"`), id + name);
  }
  const updated = setup.configuration(id, board, { PEN_PWM: 0 });
  if (setup.isShield(id)) assert.equal(updated.pins.PEN_PWM, config.pins.PEN_PWM);
  else {
    for (const name of setup.signals) for (const pin of setup.availablePins(id)) {
      const variant = setup.configuration(id, board, { [name]: pin });
      if (!variant.errors.length) {
        assertNoSignalOverlap(setup.render(variant));
        checkPhysical(variant);
        wiringCount++;
      }
    }
    const free = setup.availablePins(id).find(pin => !Object.values(config.pins).includes(pin));
    if (free !== undefined) {
      const custom = setup.configuration(id, board, { PEN_PWM: free });
      assert.deepEqual(custom.errors, []);
      assert.ok(setup.boardConfig(custom).includes(`PEN_PWM = ${free}\n`));
      assert.notEqual(setup.render(custom), svg);
    }
    const duplicate = setup.configuration(id, board, { PEN_PWM: config.pins.X_STEP });
    assert.ok(duplicate.errors.some(e => e.includes('重複')));
    assert.throws(() => setup.boardConfig(duplicate));
    const invalid = setup.configuration(id, board, { X_STEP: 99 });
    assert.ok(invalid.errors.length);
    assert.throws(() => setup.boardConfig(invalid));
    assert.ok(python.includes('X_LIMIT = None\n'));
  }
  count++;
}
const zero = setup.configuration('plotterflow_motor_shield_pizero', boards.plotterflow_motor_shield_pizero);
for(const [id,board] of Object.entries(boards).filter(([id])=>setup.isShield(id))) {
  const config=setup.configuration(id,board), py=setup.boardConfig(config);
  assert.ok(py.includes('LIMIT_PULL_UP = True\n'));
  assert.ok(py.includes('INPUT_DEBOUNCE_MS = 20\n'));
  assert.ok(!board.reserved.some(pin=>Object.values(config.pins).includes(pin)));
  for(const [name,signal] of Object.entries(board.signals)) if(signal.gpio!==null) assert.ok(!board.reserved.includes(signal.gpio),id+name);
}
const touch=setup.boardConfig(setup.configuration('plotterflow_motor_shield_touch2_compact',boards.plotterflow_motor_shield_touch2_compact));
for(const name of ['BUTTON_UP','BUTTON_DOWN','BUTTON_OK']) assert.ok(touch.includes(`${name} = None\n`));
assert.ok(touch.includes('X_LIMIT = 6\n') && touch.includes('Y_LIMIT = 8\n'));
assert.equal(Object.keys(boards).filter(setup.isShield).length,7);
assert.ok(setup.boardConfig(zero).includes('BUTTON_UP = None\n'));
assert.equal(setup.pinLabel('xiao_rp2040', 26), 'D0 / GP26');
console.log(`${count} board configurations: Python/SVG mapping, conflicts, fixed wiring, unused pins passed`);
console.log(`${wiringCount} wiring variants: no overlapping segments between different signals`);
console.log(`${physicalCount} physical pin variants: matching wire origins and no overlapping signal segments`);
const picoPads=boardView.layout(setup.configuration('pico',boards.pico)).pads;
assert.equal(picoPads.find(p=>p.gpio===2).physical,'4');
assert.equal(picoPads.find(p=>p.gpio===28).physical,'34');
const xiaoPads=boardView.layout(setup.configuration('xiao_rp2040',boards.xiao_rp2040)).pads;
assert.equal(xiaoPads.find(p=>p.gpio===26).side,'left');
assert.equal(xiaoPads.find(p=>p.gpio===3).physical,'右上から4番');
assert.ok(boardView.shieldPoint(58,42.85).x>boardView.shieldPoint(63.08,42.85).x,'bottom view must mirror X');
const tmc=global.MicroPythonTmcView, tmcPins=tmc.ports(900,180);
assert.deepEqual(tmc.left,['EN','MS1','MS2','PDN4','PDN5','CLK','STEP','DIR']);
assert.deepEqual(tmc.right,['VM','GND1','A2','A1','B1','B2','VDD','GND2']);
assert.deepEqual(tmcPins.EN,{x:900,y:180});assert.deepEqual(tmcPins.VM,{x:1100,y:180});
assert.deepEqual(tmcPins.DIR,{x:900,y:460});assert.deepEqual(tmcPins.GND2,{x:1100,y:460});
assert.equal(Object.keys(tmcPins).length,16);
console.log('BTT V1.2: 16-pin orientation, complete power/signal/motor/servo connectivity and NC checks passed');
