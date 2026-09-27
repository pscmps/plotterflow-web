/* Board outlines / pin ordering adapted from Pico Blocks app.js
 * picoBoardDrawing / xiaoBoardDrawing. Shield pads: KiCad v0.7, 25aed48.
 * Coordinates are presentation coordinates, not a manufacturing drawing. */
const MicroPythonBoardView = (() => {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = (x,y,value,size=14,anchor='start') => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}">${escape(value)}</text>`;
  const colours = ['#2563eb','#0284c7','#7c3aed','#a21caf','#b45309','#047857'];
  const leftPico = ['GP0','GP1','GND','GP2','GP3','GP4','GP5','GND','GP6','GP7','GP8','GP9','GND','GP10','GP11','GP12','GP13','GND','GP14','GP15'];
  const rightPico = ['VBUS','VSYS','GND','3V3_EN','3V3','ADC_VREF','GP28','GND','GP27','GP26','RUN','GP22','GND','GP21','GP20','GP19','GP18','GND','GP17','GP16'];
  function supported(id) {
    return MicroPythonSetup.isShield(id) || ['pico','picow','pico2','pico2w','xiao_rp2040','xiao_rp2350'].includes(id);
  }
  function layout(config) {
    const xiao = config.id.startsWith('xiao_');
    const left = xiao ? MicroPythonSetup.availablePins(config.id).slice(0,7).map((pin,i)=>`D${i} / GP${pin}`) : leftPico;
    const right = xiao ? ['5V','GND','3V3',...[10,9,8,7].map(i=>`D${i} / GP${MicroPythonSetup.availablePins(config.id)[i]}`)] : rightPico;
    const pads = [];
    for (const [side,names,x] of [['left',left,xiao?160:210],['right',right,xiao?480:430]]) names.forEach((name,i) => {
      const gpio = name.match(/GP(\d+)$/);
      pads.push({ name, gpio: gpio ? Number(gpio[1]) : null, x, y: (xiao ? 205 : 130) + i * (xiao ? 42 : 25), side,
        physical: xiao ? `${side === 'left' ? '左' : '右'}上から${i+1}番` : String(side === 'left' ? i+1 : 40-i) });
    });
    return { pads, xiao, top: xiao ? 160 : 100, height: xiao ? 377 : 540 };
  }
  function start(title,height=865,width=1100) {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="physical-wiring" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title><g font-family="system-ui,sans-serif" fill="#1e293b">`;
  }
  function standaloneNetwork(config) {
    const t=MicroPythonTmcView, n=t.network(), pads=layout(config).pads;
    const driver={X:t.ports(900,180),Y:t.ports(900,680)};
    for(const [axis,ports] of Object.entries(driver)) for(const [name,p] of Object.entries(ports)) n.add(`${axis}.${name}`,p);
    const servo=t.servo(900,1210), vm=t.supply('モータ用 外部電源',1470,1120,'VM'), five=t.supply('サーボ用 外部電源',1470,1330,'5V');
    for(const [name,p] of Object.entries(servo.ports)) n.add(`servo.${name}`,p);
    for(const [name,p] of Object.entries(vm.ports)) n.add(`vm.${name}`,p);
    for(const [name,p] of Object.entries(five.ports)) n.add(`five.${name}`,p);
    let devices=servo.svg+vm.svg+five.svg;
    for(const [axis,y] of [['X',260],['Y',760]]) {
      const motor=t.motor(axis,1470,y); devices+=motor.svg;
      for(const [name,p] of Object.entries(motor.ports)) {
        n.add(`${axis}motor.${name}`,p);
        n.wire(`${axis}_${name}`,`${axis}.${name}`,`${axis}motor.${name}`);
      }
    }
    const targets=['X.STEP','X.DIR','Y.STEP','Y.DIR','X.EN','servo.PWM'];
    MicroPythonSetup.signals.forEach((name,i)=>{
      const pad=pads.find(p=>p.gpio===config.pins[name]);
      if(!pad) throw new Error(`${name}: 端子位置が未定義です`);
      n.add(`mcu.${name}`,pad);
      const rail=600+i*24,busY=700+i*20,end=n.points[targets[i]];
      const via=pad.side==='left' ? [{x:28+i*18,y:pad.y},{x:28+i*18,y:busY},{x:rail,y:busY},{x:rail,y:end.y}]
        : [{x:500,y:pad.y},{x:550,y:busY},{x:rail,y:busY},{x:rail,y:end.y}];
      if(name==='ENABLE') {
        n.add('enable.branch',{x:rail,y:end.y});
        n.wire(name,`mcu.${name}`,'enable.branch',via.slice(0,-1),`data-signal="${name}" data-pin="${pad.gpio}" data-physical="${escape(pad.physical)}"`);
        n.wire(name,'enable.branch','X.EN');
        n.wire(name,'enable.branch','Y.EN',[{x:rail,y:driver.Y.EN.y}]);
      } else n.wire(name,`mcu.${name}`,targets[i],via,`data-signal="${name}" data-pin="${pad.gpio}" data-physical="${escape(pad.physical)}"`);
    });
    // Independent buses: VM and servo 5V are never tied to MCU 3V3.
    for(const [net,rail,terminal] of [['GND',1210,'GND'],['VDD',1250,'3V3']]) {
      const pad=pads.find(p=>p.name===terminal && p.side==='right');
      n.add(`mcu.${net}`,pad);
      const y=net==='GND'?1120:1160,x=net==='GND'?560:540;
      n.add(`${net}.mcu`,{x:rail,y});
      n.wire(net,`mcu.${net}`,`${net}.mcu`,[{x,y:pad.y},{x,y}]);
    }
    for(const [net,rail,pins,source] of [['GND',1210,['GND1','GND2'],'GND.mcu'],['VDD',1250,['VDD'],'VDD.mcu'],['VM',1290,['VM'],'vm.PLUS']]) {
      let previous=source;
      for(const axis of ['X','Y']) for(const pin of pins) {
        const endpoint=`${axis}.${pin}`,p=n.points[endpoint],id=`${axis}.${pin}.bus`;
        n.add(id,{x:rail,y:p.y});
        n.wire(net,previous,id,[{x:rail,y:n.points[previous].y}]);
        n.wire(net,id,endpoint);previous=id;
      }
    }
    n.wire('GND','vm.GND','GND.mcu',[{x:1210,y:n.points['vm.GND'].y}]);
    n.wire('GND','five.GND','GND.mcu',[{x:1210,y:n.points['five.GND'].y}]);
    n.wire('GND','servo.GND','GND.mcu',[{x:830,y:1310},{x:830,y:1430},{x:1210,y:1430}]);
    n.wire('SERVO_5V','servo.VPLUS','five.PLUS',[{x:800,y:1260},{x:800,y:1460},{x:1350,y:1460},{x:1350,y:1330}]);
    // Standalone example: MS1=MS2=GND => 1/8 microstep (not full step).
    // CLK=GND selects internal clock. Both PDN positions stay unconnected.
    for(const [axis,y] of [['X',550],['Y',1050]]) for(const pin of ['MS1','MS2','CLK']) {
      const p=n.points[`${axis}.${pin}`];
      n.wire('GND',`${axis}.${pin}`,`${axis}.GND2.bus`,[{x:850,y:p.y},{x:850,y},{x:1210,y}]);
    }
    return {network:n,devices};
  }
  function renderStandalone(config) {
    const { pads, xiao, top, height } = layout(config);
    let svg = start(config.board.label+'とBTT TMC2209 V1.2の配線',1640,1780);
    svg += text(20,28,config.board.label,19) + text(20,53,'表面（部品面）を手前に、USBを上へ。外形は模式図・縮尺不同です。');
    svg += `<rect x="${xiao?160:210}" y="${top}" width="${xiao?320:220}" height="${height}" rx="22" fill="${xiao ? '#e2e8f0' : '#d1fae5'}" stroke="#475569" stroke-width="2"/>`;
    svg += `<rect x="278" y="${top-18}" width="84" height="36" rx="7" fill="#94a3b8" stroke="#475569"/>${text(320,top+6,xiao?'USB-C':'USB',13,'middle')}`;
    if (!xiao) svg += `<rect x="286" y="280" width="68" height="90" rx="8" fill="#334155"/>`;
    const title = xiao ? config.board.label.replace('Seeed Studio ','') : config.board.label.replace('Raspberry Pi ','');
    svg += text(320,top+height+24,title,15,'middle');
    const targetNames = ['X STEP','X DIR','Y STEP','Y DIR','X/Y EN','サーボ SIGNAL'];
    const wiring=standaloneNetwork(config);
    svg+=MicroPythonTmcView.moduleSvg('X',900,180)+MicroPythonTmcView.moduleSvg('Y',900,680);
    svg+=wiring.network.svg()+wiring.devices;
    for(const [axis,y] of [['X',180],['Y',680]]) {
      svg+=text(900,y-55,`${axis} · BIGTREETECH TMC2209 V1.2`,18);
      for(const offset of [120,160]) svg+=text(875,y+offset+5,'NC',13,'end');
      svg+=text(895,y+329,'PDN(4)/(5)は未接続 / CLK・MS1・MS2はGND',13);
    }
    svg+=text(880,72,'TOP / 金色の放熱面を手前に。ENが左上、VMが右上。',17);
    svg+=text(880,98,'左右8ピンのStepStick。ICが見えるBOTTOM面ではありません。',15);
    for (const pad of pads) {
      const selected=MicroPythonSetup.signals.findIndex(name=>config.pins[name]===pad.gpio);
      const colour=selected>=0?colours[selected]:pad.name==='GND'?'#475569':pad.name==='3V3'?'#b45309':'#94a3b8';
      const hint=`${xiao?'':'物理ピン '}${pad.physical}: ${pad.name}${selected>=0?' → '+targetNames[selected]:''}`;
      svg += `<g data-pad="${escape(pad.physical)}" data-gpio="${pad.gpio ?? ''}"><title>${escape(hint)}</title><circle cx="${pad.x}" cy="${pad.y}" r="6" fill="${selected>=0?colour:'#fff'}" stroke="${colour}" stroke-width="2"/>`;
      svg += text(pad.x+(pad.side==='left'?12:-12),pad.y+4,pad.name,12,pad.side==='left'?'start':'end');
      if(!xiao) svg += text(pad.x+(pad.side==='left'?-10:10),pad.y-8,pad.physical,10,pad.side==='left'?'end':'start');
      svg += '</g>';
    }
    MicroPythonSetup.signals.forEach((name,i)=>{svg+=text(170,855+i*29,`${name} = GP${config.pins[name]} → ${targetNames[i]}`,17);});
    svg+=text(170,1060,'●は接続点。線が交差するだけでは接続しません。',16);
    svg+=text(1470,1230,'VM：4.75〜28V（ドライバ定格）',15);
    svg+=text(1470,1255,'電源・電流は使用モータに合わせます。',14);
    svg+=text(20,1520,'単体配線例：UARTなし、MS1=MS2=GND → 1/8マイクロステップ。steps/mmは機構に合わせて設定。',17);
    svg+=text(20,1550,'モータ線の色・プラグ順は機種で異なります。導通を測り、巻線Aの2本と巻線Bの2本を識別してください。',17);
    svg+=text(20,1580,'VDD=MCUの3V3、VM=モータ外部電源、サーボ=別の5V電源。GNDだけ共通。電源の＋同士は接続しません。',17);
    svg+=text(20,1610,'必ず全電源OFFで配線。通電中の抜き差し禁止。VREFで電流調整・放熱が必要です。実機配線・動作は未確認。',17);
    return svg+'</g></svg>';
  }
  // Absolute TOP-view pad coordinates from the committed KiCad v0.7 PCB.
  // Bottom view is mirrored in X across the 70 mm board; text is not mirrored.
  const shieldConnectors = [
    {ref:'J5',label:'Xモータ',pads:[[8,42.85,'A1'],[10.5,42.85,'A2'],[13,42.85,'B1'],[15.5,42.85,'B2']]},
    {ref:'J6',label:'Yモータ',pads:[[31.8,42.85,'A1'],[34.3,42.85,'A2'],[36.8,42.85,'B1'],[39.3,42.85,'B2']]},
    {ref:'J7',label:'モータ電源入力',pads:[[66,9,'VMOT +'],[66,3.92,'GND']]},
    {ref:'J8',label:'サーボ電源入力',pads:[[67.5,39,'5V +'],[67.5,36.46,'GND']]},
    {ref:'J9',label:'PWMペンサーボ',pads:[[58,42.85,'GND'],[60.54,42.85,'5V'],[63.08,42.85,'PWM']]}
  ];
  const shieldPoint = (x,y)=>({x:50+(70-x)*8,y:120+y*8});
  function shieldNetwork() {
    const t=MicroPythonTmcView,n=t.network();
    for(const c of shieldConnectors) c.pads.forEach(([x,y,name],i)=>n.add(`${c.ref}.${i+1}`,{...shieldPoint(x,y),name}));
    const devices={X:t.motor('X',1470,560),Y:t.motor('Y',1470,810),servo:t.servo(900,1070),vm:t.supply('モータ用 外部電源',1000,100,'VM'),five:t.supply('サーボ用 外部5V電源',1000,280,'5V')};
    for(const [ref,device] of Object.entries(devices)) for(const [name,p] of Object.entries(device.ports)) n.add(`${ref}.${name}`,p);
    for(const [ref,axis,y] of [['J5','X',520],['J6','Y',760]]) {
      shieldConnectors.find(c=>c.ref===ref).pads.forEach((pad,i)=>{
        const from=`${ref}.${i+1}`,to=`${axis}.${pad[2]}`,p=n.points[from],target=n.points[to],rail=1160+i*24;
        n.wire(`${axis}_${pad[2]}`,from,to,[{x:p.x,y:y+i*16},{x:rail,y:y+i*16},{x:rail,y:target.y}]);
      });
    }
    for(const [i,to,net] of [[1,'servo.GND','GND'],[2,'servo.VPLUS','SERVO_5V'],[3,'servo.PWM','PEN_PWM']]) {
      const p=n.points[`J9.${i}`],target=n.points[to],y=990+i*20,x=730+i*24;
      n.wire(net,`J9.${i}`,to,[{x:p.x,y},{x,y},{x,y:target.y}]);
    }
    n.wire('VM','J7.1','vm.PLUS',[{x:28,y:n.points['J7.1'].y},{x:28,y:78},{x:930,y:78},{x:930,y:100}]);
    n.wire('GND','J7.2','vm.GND',[{x:40,y:n.points['J7.2'].y},{x:40,y:93},{x:910,y:93},{x:910,y:150}]);
    n.wire('SERVO_5V','J8.1','five.PLUS',[{x:16,y:n.points['J8.1'].y},{x:16,y:660},{x:650,y:660},{x:650,y:280}]);
    n.wire('GND','J8.2','five.GND',[{x:4,y:n.points['J8.2'].y},{x:4,y:690},{x:675,y:690},{x:675,y:330}]);
    return {network:n,devices:Object.values(devices).map(d=>d.svg).join('')};
  }
  function renderShield(config) {
    let svg=start('PlotterFlow Motor Shield v0.7とBTT TMC2209 V1.2の裏面配線',1410,1780);
    svg+=text(20,28,'Motor Shield v0.7 · 裏面／コネクタ・ドライバ側',19);
    svg+=text(20,53,'USB用の切り欠きを左へ。表面のMCU／LCDとは反対側から見た図です。',14);
    svg+=`<g transform="translate(610 120) scale(-8 8)"><path d="M5 0H65A5 5 0 0 1 70 5V17.59H61V31.59H70V40A5 5 0 0 1 65 45H5A5 5 0 0 1 0 40V5A5 5 0 0 1 5 0Z" fill="#d1fae5" stroke="#475569" stroke-width=".3"/></g>`;
    svg+=text(190,155,'MCU / LCDは反対面に装着',16);
    // BTT TOP face remains visible after inserting it into the bottom sockets.
    // The 12.7 mm row spacing and 2.54 mm pitch match the PCB pad positions.
    for(const [name,x] of [['U1 · X',19.1],['U2 · Y',44.5]]) {
      const p=shieldPoint(x,19.51);
      svg+=MicroPythonTmcView.moduleSvg(name,p.x,p.y,20.32);
    }
    const wiring=shieldNetwork();
    svg+=wiring.network.svg()+wiring.devices;
    shieldConnectors.forEach((connector,i)=>{
      const colour=colours[i];
      const points=connector.pads.map(([x,y])=>shieldPoint(x,y));
      const xMin=Math.min(...points.map(p=>p.x)),xMax=Math.max(...points.map(p=>p.x));
      const yMin=Math.min(...points.map(p=>p.y)),yMax=Math.max(...points.map(p=>p.y));
      svg+=`<rect x="${xMin-10}" y="${yMin-10}" width="${xMax-xMin+20}" height="${yMax-yMin+20}" rx="5" fill="#fff" stroke="${colour}"/>`;
      svg+=text(xMin,yMin-17,connector.ref,16);
      points.forEach((p,j)=>{
        const name=connector.pads[j][2], attrs=`data-connector="${connector.ref}" data-terminal="${j+1}"`;
        svg+=`<g ${attrs}><title>${connector.ref}-${j+1}: ${name}</title>`;
        svg+=j===0?`<rect x="${p.x-5}" y="${p.y-5}" width="10" height="10" fill="${colour}"/>`:`<circle cx="${p.x}" cy="${p.y}" r="5" fill="${colour}"/>`;
        svg+=xMin===xMax ? text(p.x+16,p.y+4,j+1,12) : text(p.x+7,p.y+26,j+1,12);
        svg+='</g>';
      });
    });
    svg+=text(710,420,`J9-3のPWM元：GP${config.pins.PEN_PWM}`,17);
    svg+=text(710,448,'STEP / DIR / EN / VDD / 共通GNDは基板内配線。',17);
    svg+=text(710,476,'MCUからドライバへのジャンパ配線は不要です。',17);
    svg+=text(1380,105,'BTT TMC2209 V1.2',19);
    svg+=text(1380,137,'金色の放熱面（TOP）が手前。',16);
    svg+=text(1380,166,'左上EN / 右上VMを照合して装着。',16);
    svg+=text(1380,195,'部品面ではなく裏面ソケット側の図。',16);
    svg+=text(1380,245,'モータ線は導通で巻線ペアを確認。',16);
    svg+=text(1380,274,'線色・プラグ順は機種ごとに異なります。',16);
    svg+=text(1380,326,'VM：4.75〜28V（ドライバ定格）',16);
    svg+=text(1380,355,'使用モータに合わせ電源・電流を選定。',16);
    shieldConnectors.forEach((c,i)=>{svg+=text(150,855+i*30,`${c.ref} ${c.label}: ${c.pads.map((p,j)=>`${j+1}=${p[2]}`).join(' / ')}`,15);});
    svg+=text(150,1110,'●は接続。交差のみの線は非接続。四角い端子が1番。',16);
    svg+=text(20,1290,'J7=モータ電源、J8=独立したサーボ5V入力、J9=サーボ出力。電源の＋同士は接続しません。',17);
    svg+=text(20,1320,'v0.7共通シールド専用。Pico 2 W compact基板には使用不可。端子座標：KiCad v0.7 / 25aed48。',17);
    svg+=text(20,1350,'必ず全電源OFFで装着・配線。通電中の抜き差し禁止。VREFで電流調整・放熱が必要です。',17);
    svg+=text(20,1380,'縮尺不同・主要部品のみ表示。シールドのMS/UART設定は基板設計に従います。実機配線・動作は未確認。',17);
    return svg+'</g></svg>';
  }
  function render(config) {
    if (!supported(config.id)) {
      const source=config.id==='rp2350_geek'?'https://files.waveshare.com/wiki/RP2350-GEEK/RP2350-GEEK.pdf':'https://files.waveshare.com/wiki/RP2040-GEEK/RP2040-GEEK-Schematic.pdf';
      return `<p class="muted">このボードは実物のコネクタの向きを未照合のため、実端子位置を表示しません。「機能配線図」と<a href="${source}" target="_blank" rel="noreferrer">公式回路図</a>を使用してください。回路図の端子番号は実物の左右方向を保証しません。</p>`;
    }
    const guide='<p class="muted">接続先は <strong>BIGTREETECH TMC2209 V1.2</strong> です。他社品・別バージョンは端子配置を照合してください。図は横にスクロールできます。<a href="https://github.com/bigtreetech/BIGTREETECH-TMC2209-V1.2/blob/master/manual/TMC2209-V1.2-manual.pdf" target="_blank" rel="noreferrer">公式マニュアル（端子図・電流調整）</a>。実機配線・動作は未確認です。</p>';
    return guide+(MicroPythonSetup.isShield(config.id) ? renderShield(config) : renderStandalone(config));
  }
  return {supported,layout,render,shieldConnectors,shieldPoint,standaloneNetwork,shieldNetwork};
})();
if(typeof module!=='undefined') module.exports=MicroPythonBoardView;
