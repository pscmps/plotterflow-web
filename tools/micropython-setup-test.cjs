const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const setup = require('../micropython-setup.js');
global.MicroPythonSetup = setup;
const boardView = require('../micropython-board-view.js');
const app = fs.readFileSync(new URL('../app.js', `file://${__filename.replaceAll('\\', '/')}`), 'utf8');
const start = app.indexOf('const MICRO_PYTHON_BOARD_PROFILES =');
const end = app.indexOf('const MICRO_PYTHON_BUNDLE_FILES', start);
const boards = vm.runInNewContext(app.slice(start, end) + '; MICRO_PYTHON_BOARD_PROFILES');
// Crossings and common ENABLE branches are allowed; different signals must
// never share any nonzero-length segment (including diagonal pin escapes).
function assertNoSignalOverlap(svg) {
  const lines = [];
  for (const match of svg.matchAll(/<path d="([^"]+)"[^>]*data-signal="([^"]+)"/g)) {
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
    for(const signal of setup.signals) {
      const pad=boardView.layout(config).pads.find(p=>p.gpio===config.pins[signal]);
      assert.ok(svg.includes(`M${pad.x} ${pad.y} `));
      assert.ok(svg.includes(`data-signal="${signal}" data-pin="${pad.gpio}" data-physical="${pad.physical}"`));
    }
    physicalCount++;
  } else {
    assert.ok(svg.includes('裏面'));
    for(const connector of boardView.shieldConnectors) connector.pads.forEach((_,i)=>
      assert.ok(svg.includes(`data-connector="${connector.ref}" data-terminal="${i+1}"`)));
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
