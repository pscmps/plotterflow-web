/* Board outlines / pin ordering adapted from Pico Blocks app.js
 * picoBoardDrawing / xiaoBoardDrawing. Shield pads: KiCad v0.7, 25aed48.
 * Coordinates are presentation coordinates, not a manufacturing drawing. */
const MicroPythonBoardView = (() => {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = (x,y,value,size=14,anchor='start') => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}">${escape(value)}</text>`;
  const path = (d,colour,attrs='') => `<path d="${d}" fill="none" stroke="${colour}" stroke-width="2.4" ${attrs}/>`;
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
  function start(title,height=865) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 ${height}" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title><g font-family="system-ui,sans-serif" fill="#1e293b">`;
  }
  function renderStandalone(config) {
    const { pads, xiao, top, height } = layout(config);
    let svg = start(config.board.label+'の実端子位置');
    svg += text(20,28,config.board.label,19) + text(20,53,'表面（部品面）を手前に、USBを上へ。外形は模式図・縮尺不同です。');
    svg += `<rect x="${xiao?160:210}" y="${top}" width="${xiao?320:220}" height="${height}" rx="22" fill="${xiao ? '#e2e8f0' : '#d1fae5'}" stroke="#475569" stroke-width="2"/>`;
    svg += `<rect x="278" y="${top-18}" width="84" height="36" rx="7" fill="#94a3b8" stroke="#475569"/>${text(320,top+6,xiao?'USB-C':'USB',13,'middle')}`;
    if (!xiao) svg += `<rect x="286" y="280" width="68" height="90" rx="8" fill="#334155"/>`;
    const title = xiao ? config.board.label.replace('Seeed Studio ','') : config.board.label.replace('Raspberry Pi ','');
    svg += text(320,top+height+24,title,15,'middle');
    const targetNames = ['Xドライバ STEP','Xドライバ DIR','Yドライバ STEP','Yドライバ DIR','X/Y両ドライバ EN','ペンサーボ SIGNAL'];
    const occupied = MicroPythonSetup.signals.map((_,i)=>128+i*76);
    let wires = '', labels = '';
    MicroPythonSetup.signals.forEach((name,i)=>{
      const pad = pads.find(p=>p.gpio===config.pins[name]);
      if (!pad) throw new Error(`${name}: 端子位置が未定義です`);
      const endY=128+i*76, rail=572+i*20, busY=700+i*20;
      let d;
      if (pad.side==='left') {
        const lane=28+i*18;
        d=`M${pad.x} ${pad.y} H${lane} V${busY} H${rail} V${endY} H750`;
      } else {
        let exitY=pad.y;
        while(occupied.some(y=>Math.abs(y-exitY)<12)) exitY+=12;
        occupied.push(exitY);
        d=`M${pad.x} ${pad.y} H496 L520 ${exitY} H${rail} V${endY} H750`;
      }
      wires += path(d,colours[i],`data-signal="${name}" data-pin="${pad.gpio}" data-physical="${escape(pad.physical)}"`);
      labels += `<rect x="750" y="${endY-27}" width="330" height="62" rx="10" fill="#f8fafc" stroke="${colours[i]}"/>`;
      labels += text(765,endY-5,targetNames[i],15)+text(765,endY+17,`${name} ← ${pad.name} · ${xiao?'':'物理'}${pad.physical}`,12);
    });
    svg += wires;
    for (const pad of pads) {
      const selected=MicroPythonSetup.signals.findIndex(name=>config.pins[name]===pad.gpio);
      const colour=selected>=0?colours[selected]:pad.name==='GND'?'#475569':pad.name==='3V3'?'#b45309':'#94a3b8';
      const hint=`${xiao?'':'物理ピン '}${pad.physical}: ${pad.name}${selected>=0?' → '+targetNames[selected]:''}`;
      svg += `<g data-pad="${escape(pad.physical)}" data-gpio="${pad.gpio ?? ''}"><title>${escape(hint)}</title><circle cx="${pad.x}" cy="${pad.y}" r="6" fill="${selected>=0?colour:'#fff'}" stroke="${colour}" stroke-width="2"/>`;
      svg += text(pad.x+(pad.side==='left'?12:-12),pad.y+4,pad.name,12,pad.side==='left'?'start':'end');
      if(!xiao) svg += text(pad.x+(pad.side==='left'?-10:10),pad.y-8,pad.physical,10,pad.side==='left'?'end':'start');
      svg += '</g>';
    }
    svg += labels;
    const gnd = pads.find(p=>p.name==='GND'), power = pads.find(p=>p.name==='3V3');
    svg += text(750,618,`共通GND：${gnd.name} · ${xiao?'':'物理'}${gnd.physical}`,13);
    svg += text(750,643,`ロジック電源：3V3 · ${xiao?'':'物理'}${power.physical}`,13);
    svg += text(750,671,'ドライバ側の端子位置は製品ごとに確認。',13);
    svg += text(750,696,'この図の接続先カードは実物の端子順ではありません。',11);
    svg += text(20,837,'サーボ・VMOTは別の外部電源。GPIOは3.3V信号専用。全機器のGNDを共通にします。',14);
    svg += text(20,858,'電源を切って配線し、実物の端子印字と照合してください。実機配線・動作は未確認です。',13);
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
  function renderShield(config) {
    let svg=start('PlotterFlow Motor Shield v0.7の裏面端子位置',830);
    svg+=text(20,28,'Motor Shield v0.7 · 裏面／コネクタ・ドライバ側',19);
    svg+=text(20,53,'USB用の切り欠きを左へ。表面のMCU／LCDとは反対側から見た図です。',14);
    svg+=`<g transform="translate(610 120) scale(-8 8)"><path d="M5 0H65A5 5 0 0 1 70 5V17.59H61V31.59H70V40A5 5 0 0 1 65 45H5A5 5 0 0 1 0 40V5A5 5 0 0 1 5 0Z" fill="#d1fae5" stroke="#475569" stroke-width=".3"/></g>`;
    svg+=text(55,100,'← 切り欠き',13);
    svg+=text(190,155,'MCU / LCDは反対面に装着',16);
    // Footprint extents projected from the bottom-mounted StepStick sockets.
    for(const [name,x] of [['U1 · X',444],['U2 · Y',241]]) {
      svg+=`<rect x="${x}" y="266" width="129" height="165" rx="7" fill="#e2e8f0" stroke="#64748b"/>`;
      svg+=text(x+64,340,name,16,'middle')+text(x+64,366,'StepStick',14,'middle');
    }
    const rows=[536,622,126,212,300];
    let cards='';
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
        svg+=xMin===xMax ? text(p.x+16,p.y+4,j+1,12) : text(p.x,p.y+34,j+1,12,'middle');
        svg+='</g>';
      });
      const y=rows[i];
      cards+=`<rect x="700" y="${y-20}" width="380" height="70" rx="8" fill="#f8fafc" stroke="${colour}"/>`;
      cards+=text(714,y,`${connector.ref} · ${connector.label}`,15);
      const legend=connector.pads.map((p,j)=>`${j+1}=${p[2]}`).join('  ');
      cards+=text(714,y+26,`${connector.ref}：${legend}`,14);
      // Numbered connector callouts avoid a nest of wires across the PCB face.
      if(i<2) {
        const center=(xMin+xMax)/2;
        svg+=path(`M${center} ${yMax+10} V${y} H700`,colour);
      }
    });
    svg+=cards;
    svg+=text(700,410,`J9-3のPWM元：GP${config.pins.PEN_PWM}`,15);
    svg+=text(700,441,'STEP / DIR / ENABLEは基板内配線です。',14);
    svg+=text(700,469,'MCUから外部へジャンパ配線しません。',14);
    svg+=text(20,720,'番号はコネクタのピン番号。四角が1番ピンです。電源は＋／GNDを必ず照合してください。',14);
    svg+=text(20,747,'J7=モータ電源、J8=独立したサーボ5V入力、J9=サーボ出力。電源の＋同士は接続しません。',14);
    svg+=text(20,775,'v0.7共通シールド専用です。Pico 2 W compact基板とは外形・端子位置が異なります。',14);
    svg+=text(20,803,'端子座標：KiCad v0.7 / 25aed48。縮尺不同・主要部品のみ表示。実機配線は未確認です。',13);
    return svg+'</g></svg>';
  }
  function render(config) {
    if (!supported(config.id)) {
      const source=config.id==='rp2350_geek'?'https://files.waveshare.com/wiki/RP2350-GEEK/RP2350-GEEK.pdf':'https://files.waveshare.com/wiki/RP2040-GEEK/RP2040-GEEK-Schematic.pdf';
      return `<p class="muted">このボードは実物のコネクタの向きを未照合のため、実端子位置を表示しません。「機能配線図」と<a href="${source}" target="_blank" rel="noreferrer">公式回路図</a>を使用してください。回路図の端子番号は実物の左右方向を保証しません。</p>`;
    }
    return MicroPythonSetup.isShield(config.id) ? renderShield(config) : renderStandalone(config);
  }
  return {supported,layout,render,shieldConnectors,shieldPoint};
})();
if(typeof module!=='undefined') module.exports=MicroPythonBoardView;
