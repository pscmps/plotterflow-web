// Run against an isolated local-server Playwright CLI session:
// playwright-cli run-code --filename tools/micropython-browser-check.js
async (page) => {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(page.url()))
    throw new Error('Use an isolated local-server session; this test changes browser preferences.');
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const captureWiring = async name => {
    // Export exactly the live SVG to an isolated preview so screenshots do not
    // clip the destination devices behind the production horizontal scroller.
    const svg=await page.locator('#microPythonWiringDiagram svg').evaluate(n=>n.outerHTML);
    const preview=await page.context().newPage();
    try {
      await preview.setViewportSize({width:1800,height:1700});
      await preview.setContent(`<style>body{margin:0;background:white}svg{display:block;width:1780px}</style>${svg}`);
      await preview.locator('svg').screenshot({path:`output/playwright/physical-${name}.png`});
    } finally { await preview.close(); }
  };
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => localStorage.removeItem('plotterflow.micropythonSetupV2'));
  await page.reload();
  await page.getByRole('button', { name: '開発中', exact: true }).click();
  await page.locator('#developmentFirmwareProfile').selectOption('micropython-rp-stepdir');
  const physicalView=page.getByRole('button',{name:'基板の端子位置',exact:true});
  const schematicView=page.getByRole('button',{name:'機能配線図',exact:true});
  check(await schematicView.getAttribute('aria-pressed')==='true','default schematic view');
  const board = page.locator('#microPythonBoard');
  const custom = page.locator('#microPythonCustomPins');
  check(await board.inputValue() === 'plotterflow_motor_shield_pico2w', 'shield default');
  check(await board.locator('option').count() === 7, 'four generic + three compact shields');
  check(!await page.locator('#microPythonPinControls').isVisible(), 'hide custom pins');
  await board.selectOption('plotterflow_motor_shield_pizero');
  check(await page.evaluate(() => microPythonBoardConfig(selectedMicroPythonBoardId()).includes('BUTTON_UP = None\n')), 'absent buttons stay None');
  await custom.check();
  await board.selectOption('xiao_rp2040');
  const pen = page.getByRole('combobox', { name: 'PEN_PWM', exact: true });
  check(await pen.locator('option').count() === 11, 'XIAO exposed pins only');
  check((await pen.textContent()).includes('D0 / GP26'), 'D-labels');
  const oldPath = await page.locator('path[data-signal="PEN_PWM"]').getAttribute('d');
  await pen.selectOption('27');
  check(await page.locator('path[data-signal="PEN_PWM"]').getAttribute('data-pin') === '27', 'new SVG pin');
  check(await page.locator('path[data-signal="PEN_PWM"]').getAttribute('d') !== oldPath, 'wire endpoint moves');
  // Read the actual bundle loader, not just the generator. No Serial/hardware.
  check(await page.evaluate(async () => {
    const files = await loadMicroPythonBundle(selectedMicroPythonBoardId());
    return files.length === 9 && new TextDecoder().decode(files[0].bytes).includes('PEN_PWM = 27\n') && files.some(f=>f.name==='inputs.py'||f.path==='inputs.py');
  }), 'transferred configuration matches UI');
  await page.reload();
  await page.getByRole('button', { name: '開発中', exact: true }).click();
  check(await custom.isChecked(), 'mode persisted');
  check(await board.inputValue() === 'xiao_rp2040' && await pen.inputValue() === '27', 'board/pins persisted');
  await pen.selectOption('2');
  check(await page.locator('#microPythonPinError').isVisible(), 'duplicate error shown');
  check(await page.locator('#uploadMicroPythonFiles').isDisabled(), 'duplicate blocks transfer');
  check(await page.locator('#microPythonWiringDiagram svg').count() === 0, 'invalid wiring not suggested');
  await pen.selectOption('27');
  check(!await page.locator('#uploadMicroPythonFiles').isDisabled(), 'fixed config allows transfer');
  await page.locator('#microPythonWiringDiagram').screenshot({ path: 'output/playwright/xiao-custom.png' });
  await board.selectOption('rp2040_geek');
  check(await pen.locator('option').count() === 6, 'GEEK exposed pins');
  await board.selectOption('xiao_rp2040');
  check(await pen.inputValue() === '27', 'per-board pins retained');
  await custom.uncheck();
  check(await board.inputValue() === 'plotterflow_motor_shield_pizero', 'independent shield selection');
  check(await page.evaluate(() => microPythonBoardConfig(selectedMicroPythonBoardId()).includes('PEN_PWM = 12\n')), 'custom pins do not leak into shield');
  for (const id of ['plotterflow_motor_shield_lcd147a', 'plotterflow_motor_shield_touch2']) {
    await board.selectOption(id);
    check(await page.locator('path[data-signal="PEN_PWM"]').getAttribute('data-pin') === '9', 'LCD PWM fixed GP9');
  }
  await board.selectOption('plotterflow_motor_shield_pico2w');
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile page overflow');
  await page.locator('#microPythonSetupControls').screenshot({ path: 'output/playwright/mobile-controls.png' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#developmentFirmwareProfile').selectOption('xl330-pio');
  check(!await page.locator('#microPythonTransferCard').isVisible(), 'other profile unaffected');
  await page.locator('#developmentFirmwareProfile').selectOption('micropython-rp-stepdir');
  const configBefore=await page.evaluate(()=>microPythonBoardConfig(selectedMicroPythonBoardId()));
  await physicalView.click();
  check(await physicalView.getAttribute('aria-pressed')==='true','physical toggle pressed');
  check(await page.locator('#microPythonWiringDiagram').textContent().then(t=>t.includes('裏面')),'shield bottom orientation');
  check(await page.locator('[data-connector="J9"]').count()===3,'three servo terminals');
  check(await page.locator('[data-tmc]').count()===2,'two physical BTT modules on shield');
  check(await page.locator('[data-motor]').count()===2,'both actual motor destinations');
  check(await page.locator('[data-device="servo"]').count()===1,'servo shape and terminals');
  check(configBefore===await page.evaluate(()=>microPythonBoardConfig(selectedMicroPythonBoardId())),'view must not change firmware');
  // Full-width captures include the destinations beyond the scroll container.
  await page.setViewportSize({width:2000,height:1200});
  await page.locator('.toast').evaluateAll(nodes=>nodes.forEach(n=>n.remove()));
  await captureWiring('shield');
  for(const kind of ['pico2w','lcd147a','touch2']) {
    await board.selectOption(`plotterflow_motor_shield_${kind}_compact`);
    check((await page.locator('#microPythonBoardWiring').textContent()).includes('内部プルアップ'),'r2 safety notice');
    check((await page.locator('#microPythonWiringDiagram').textContent()).includes('ENが右上・VMが右下'),'compact driver rotated');
    check(await page.locator('[data-connector="J10"]').count()===3,'compact actual limit connector');
    check(await page.locator('[data-tmc]').count()===2,'compact TMC shapes');
    check(await page.evaluate(async()=>{
      const files=await loadMicroPythonBundle(selectedMicroPythonBoardId());
      const config=new TextDecoder().decode(files[0].bytes);
      return files.length===9 && files.at(-1).name==='main.py' && config.includes('compact-v0.1-r2') && config.includes('LIMIT_PULL_UP = True');
    }),'compact transfer bundle contains the r2 configuration');
    if(kind==='touch2') check(await page.evaluate(()=>microPythonBoardConfig(selectedMicroPythonBoardId()).includes('BUTTON_UP = None\n')),'compact touch buttons NC');
    await captureWiring(kind+'-compact');
  }
  await custom.check();
  await board.selectOption('pico');
  check(await page.locator('path[data-signal="X_STEP"]').getAttribute('data-physical')==='4','Pico GP2 physical pin4');
  check(await page.locator('[data-driver="X"]').count()===16,'all 16 X module pins');
  check(await page.locator('[data-driver="Y"]').count()===16,'all 16 Y module pins');
  check(await page.locator('path[data-from="mcu.X_STEP"][data-to="X.STEP"]').count()===1,'STEP terminates at physical driver pin');
  check(await page.locator('path[data-from="enable.branch"][data-to="Y.EN"]').count()===1,'common enable reaches second driver');
  await captureWiring('pico');
  await board.selectOption('xiao_rp2350');
  const previousOrigin=await page.locator('path[data-signal="PEN_PWM"]').getAttribute('d');
  await pen.selectOption('1');
  check(previousOrigin!==await page.locator('path[data-signal="PEN_PWM"]').getAttribute('d'),'physical wire moves across sides');
  check(await page.locator('path[data-signal="PEN_PWM"]').getAttribute('data-physical')==='右上から7番','XIAO D7 actual right bottom pin');
  await captureWiring('xiao');
  await page.reload();
  await page.getByRole('button',{name:'開発中',exact:true}).click();
  check(await physicalView.getAttribute('aria-pressed')==='true','view persisted');
  check(await pen.inputValue()==='1','view reload keeps pin config');
  await page.setViewportSize({width:390,height:844});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'physical view does not overflow mobile page');
  check(await page.locator('#microPythonWiringDiagram').evaluate(n=>n.scrollWidth>n.clientWidth),'physical diagram scrolls within its panel');
  await page.setViewportSize({width:1280,height:900});
  await board.selectOption('rp2040_geek');
  check(await page.locator('#microPythonWiringDiagram').textContent().then(t=>t.includes('未照合')),'unverified geometry not invented');
  await schematicView.click();
  check(await page.locator('#microPythonWiringDiagram svg').count()===1,'schematic still available');
  await page.setViewportSize({width:390,height:844});
  check(await physicalView.isVisible() && await schematicView.isVisible(),'mobile toggle visible');
  await page.setViewportSize({width:1280,height:900});
  console.log('PASS: defaults, pin/diagram/bundle sync, persistence, conflicts, LCD, mobile, profile isolation, compact r2');
}
