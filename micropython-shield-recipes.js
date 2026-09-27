/* Keep PCB revision/layout separate from the MCU UF2 selection. */
const MicroPythonShieldRecipes = (() => {
  const prefix='plotterflow_motor_shield_';
  const keys={pico2w:'pico2w',lcd147a:'lcd147a',touch2:'touch2_no_camera',pizero:'rp2350_pizero'};
  const sockets={pico2w:'J1',lcd147a:'J2',touch2:'J3',pizero:'J4'};
  const safety='抵抗改訂r2：LIMITは内部プルアップ・LOWで作動。起動時はENABLE無効、STEP/PWM LOW。LIMIT作動中はM17/G0/G1を拒否しますが、移動中の即時停止・ホーミングは未実装です。';
  function decorate(base, mapping, controller, compact=null) {
    const disabled=mapping.disabled_signals || [];
    const signals=Object.fromEntries(Object.entries(mapping.signals).map(([name,s])=>[name,{
      gpio:disabled.includes(name)?null:s.gpio,
      physical:s.pin===null?'未接続':`${sockets[controller]}-${s.pin}`,
      disabled:disabled.includes(name)
    }]));
    const label=compact ? base.label.replace('v0.7',`専用2層 ${compact.outline.width}×${compact.outline.height}mm v0.1 r2`) : base.label.replace('v0.7','汎用4層 v0.7 r2');
    const pinText=Object.entries(signals).map(([name,s])=>`${name}: ${s.gpio===null?'無効/NC':`GP${s.gpio}`} (${s.physical})`).join('、');
    return {...base,label,signals,reserved:mapping.reserved,disabledSignals:disabled,
      pins:['X_STEP','X_DIR','Y_STEP','Y_DIR','ENABLE','Z_SERVO_PWM'].map(n=>signals[n].gpio),
      hardwareRevision:compact?'compact-v0.1-r2':'generic-v0.7-r2',compact,
      wiring:`${label}。${safety} ${pinText}。${controller==='touch2'?'カメラ/FPCを外す構成です。':''}LCD/タッチ・ボタン操作・TMC UART・シリアルサーボは今回のSTEP/DIR版では未実装。実機動作未確認。`};
  }
  function extend(profiles) {
    for(const [controller,key] of Object.entries(keys)) {
      const id=prefix+controller, original=profiles[id];
      profiles[id]=decorate(original,MicroPythonShieldData.generic[key],controller);
      const compact=MicroPythonShieldData.compact[controller];
      if(compact) profiles[id+'_compact']=decorate(original,compact.mapping,controller,compact);
    }
  }
  return {extend};
})();
if(typeof module!=='undefined') module.exports=MicroPythonShieldRecipes;
