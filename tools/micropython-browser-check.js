// Run against an isolated local-server Playwright CLI session:
// playwright-cli run-code --filename tools/micropython-browser-check.js
async (page) => {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(page.url()))
    throw new Error('Use an isolated local-server session; this test changes browser preferences.');
  const check = (ok, message) => { if (!ok) throw new Error(message); };
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
  check(await board.locator('option').count() === 4, 'only four shields initially');
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
    return files.length === 8 && new TextDecoder().decode(files[0].bytes).includes('PEN_PWM = 27\n');
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
  check(configBefore===await page.evaluate(()=>microPythonBoardConfig(selectedMicroPythonBoardId())),'view must not change firmware');
  await page.locator('#microPythonWiringDiagram').screenshot({path:'output/playwright/physical-shield.png'});
  await custom.check();
  await board.selectOption('pico');
  check(await page.locator('path[data-signal="X_STEP"]').getAttribute('data-physical')==='4','Pico GP2 physical pin4');
  await page.locator('#microPythonWiringDiagram').screenshot({path:'output/playwright/physical-pico.png'});
  await board.selectOption('xiao_rp2350');
  const previousOrigin=await page.locator('path[data-signal="PEN_PWM"]').getAttribute('d');
  await pen.selectOption('1');
  check(previousOrigin!==await page.locator('path[data-signal="PEN_PWM"]').getAttribute('d'),'physical wire moves across sides');
  check(await page.locator('path[data-signal="PEN_PWM"]').getAttribute('data-physical')==='右上から7番','XIAO D7 actual right bottom pin');
  await page.locator('#microPythonWiringDiagram').screenshot({path:'output/playwright/physical-xiao.png'});
  await page.reload();
  await page.getByRole('button',{name:'開発中',exact:true}).click();
  check(await physicalView.getAttribute('aria-pressed')==='true','view persisted');
  check(await pen.inputValue()==='1','view reload keeps pin config');
  await board.selectOption('rp2040_geek');
  check(await page.locator('#microPythonWiringDiagram').textContent().then(t=>t.includes('未照合')),'unverified geometry not invented');
  await schematicView.click();
  check(await page.locator('#microPythonWiringDiagram svg').count()===1,'schematic still available');
  await page.setViewportSize({width:390,height:844});
  check(await physicalView.isVisible() && await schematicView.isVisible(),'mobile toggle visible');
  await page.setViewportSize({width:1280,height:900});
  console.log('PASS: defaults, pin/diagram/bundle sync, persistence, conflicts, LCD, mobile, profile isolation');
}
