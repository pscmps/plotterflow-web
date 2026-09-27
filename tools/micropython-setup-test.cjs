const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const setup = require('../micropython-setup.js');
const app = fs.readFileSync(new URL('../app.js', `file://${__filename.replaceAll('\\', '/')}`), 'utf8');
const start = app.indexOf('const MICRO_PYTHON_BOARD_PROFILES =');
const end = app.indexOf('const MICRO_PYTHON_BUNDLE_FILES', start);
const boards = vm.runInNewContext(app.slice(start, end) + '; MICRO_PYTHON_BOARD_PROFILES');
let count = 0;
for (const [id, board] of Object.entries(boards)) {
  if (board.supported === false) continue;
  const config = setup.configuration(id, board);
  assert.deepEqual(config.errors, [], id);
  const python = setup.boardConfig(config), svg = setup.render(config);
  for (const name of setup.signals) {
    assert.ok(python.includes(`${name} = ${config.pins[name]}\n`), id + name);
    assert.ok(svg.includes(`data-signal="${name}" data-pin="${config.pins[name]}"`), id + name);
  }
  const updated = setup.configuration(id, board, { PEN_PWM: 0 });
  if (setup.isShield(id)) assert.equal(updated.pins.PEN_PWM, config.pins.PEN_PWM);
  else {
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
