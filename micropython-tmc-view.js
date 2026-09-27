/* BIGTREETECH TMC2209 V1.2, official manual pp. 4-7.
 * View: heatsink pad/TOP face toward the viewer. Not the chip/BOTTOM face.
 * J1/J2 are the manual's two pin rows, not shield connector references. */
const MicroPythonTmcView = (() => {
  const left = ['EN','MS1','MS2','PDN4','PDN5','CLK','STEP','DIR'];
  const right = ['VM','GND1','A2','A1','B1','B2','VDD','GND2'];
  const colours = {GND:'#475569',VDD:'#dc2626',VM:'#be123c',SERVO_5V:'#ea580c',ENABLE:'#b45309',PEN_PWM:'#047857',X_STEP:'#2563eb',X_DIR:'#0284c7',Y_STEP:'#7c3aed',Y_DIR:'#a21caf'};
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = (x,y,s,size=16,anchor='start',fill='#1e293b')=>`<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${fill}">${esc(s)}</text>`;
  function ports(x,y,pitch=40) {
    const result={};
    for (const [names,px] of [[left,x],[right,x+5*pitch]]) names.forEach((name,i)=>{result[name]={x:px,y:y+i*pitch};});
    return result;
  }
  function moduleSvg(ref,x,y,pitch=40) {
    const p=ports(x,y,pitch), s=pitch/40;
    let svg=`<g data-tmc="${ref}" aria-label="${ref} BIGTREETECH TMC2209 V1.2 TOP"><rect x="${x-pitch/2}" y="${y-pitch/2}" width="${6*pitch}" height="${8*pitch}" rx="${8*s}" fill="#202b35" stroke="#0f172a" stroke-width="${2*s}"/>`;
    // Gold cooling area and the upper-right trim pot make the viewing side explicit.
    svg+=`<rect x="${x+1.65*pitch}" y="${y+2*pitch}" width="${1.7*pitch}" height="${2.8*pitch}" rx="${3*s}" fill="#e0b557" stroke="#ad8436"/>`;
    svg+=`<circle cx="${x+3.4*pitch}" cy="${y+.6*pitch}" r="${.3*pitch}" fill="#d1d5db" stroke="#94a3b8"/><path d="M${x+3.2*pitch} ${y+.6*pitch} h${.4*pitch}" stroke="#475569"/>`;
    svg+=text(x+2.8*pitch,y+.75*pitch,'VREF',11*s,'end','#f8fafc');
    svg+=text(x+2.5*pitch,y+1.6*pitch,'TOP',14*s,'middle','#f8fafc');
    svg+=text(x+2.5*pitch,y+3.15*pitch,ref,20*s,'middle');
    svg+=text(x+2.5*pitch,y+3.8*pitch,'放熱面',13*s,'middle');
    svg+=text(x+2.5*pitch,y+5.55*pitch,'TMC2209',14*s,'middle','#f8fafc');
    svg+=text(x+2.5*pitch,y+6.1*pitch,'BTT V1.2',13*s,'middle','#f8fafc');
    for (const [name,point] of Object.entries(p)) {
      const isLeft=left.includes(name), label=name.startsWith('GND')?'GND':name.startsWith('PDN')?`PDN(${name.at(-1)})`:name;
      svg+=`<g data-driver="${ref}" data-terminal="${name}"><title>${ref} ${label}</title>`;
      svg+=(name==='EN'||name==='VM') ? `<rect x="${point.x-5*s}" y="${point.y-5*s}" width="${10*s}" height="${10*s}" fill="#fde68a" stroke="#a16207"/>` : `<circle cx="${point.x}" cy="${point.y}" r="${5*s}" fill="#fde68a" stroke="#a16207"/>`;
      svg+=text(point.x+(isLeft?10:-10)*s,point.y+5*s,label,14*s,isLeft?'start':'end','#f8fafc')+'</g>';
    }
    return svg+'</g>';
  }
  function motor(ref,x,y) {
    const ports={A2:{x,y},A1:{x,y:y+40},B1:{x,y:y+80},B2:{x,y:y+120}};
    let svg=`<g data-motor="${ref}"><rect x="${x+30}" y="${y-25}" width="190" height="185" rx="18" fill="#e2e8f0" stroke="#475569"/><circle cx="${x+175}" cy="${y+67}" r="22" fill="#94a3b8"/>`;
    svg+=text(x+125,y-40,`${ref} ステッピングモータ`,17,'middle');
    for (const [name,p] of Object.entries(ports)) svg+=`<circle cx="${p.x}" cy="${p.y}" r="5" fill="#fff" stroke="#475569"/>`+text(p.x+6,p.y-7,name,14);
    svg+=`<path d="M${x} ${y} H${x+65} q40 0 40 20 q0 20 -40 20 H${x} M${x} ${y+80} H${x+65} q40 0 40 20 q0 20 -40 20 H${x}" fill="none" stroke="#475569" stroke-width="3"/>`;
    svg+=text(x+125,y+188,'Aは同じ巻線 / Bはもう一組',14,'middle');
    return {ports,svg:svg+'</g>'};
  }
  function servo(x,y) {
    const ports={PWM:{x,y},VPLUS:{x,y:y+50},GND:{x,y:y+100}};
    let svg=`<g data-device="servo"><rect x="${x+30}" y="${y-10}" width="175" height="135" rx="10" fill="#bfdbfe" stroke="#2563eb"/><rect x="${x+85}" y="${y-28}" width="65" height="15" rx="6" fill="#e2e8f0" stroke="#475569"/>`;
    for (const [name,p] of Object.entries(ports)) svg+=`<path d="M${p.x} ${p.y} h30" stroke="#475569"/><circle cx="${p.x}" cy="${p.y}" r="5" fill="#fff" stroke="#475569"/>`+text(p.x+38,p.y+5,name==='VPLUS'?'V+（外部5V）':name==='PWM'?'SIGNAL / PWM':'GND',15);
    svg+=text(x+110,y+153,'PWMペンサーボ',17,'middle');
    svg+=text(x+110,y+180,'端子順・線色は製品で確認',14,'middle');
    return {ports,svg:svg+'</g>'};
  }
  function supply(label,x,y,positive) {
    const ports={PLUS:{x,y},GND:{x,y:y+50}};
    const svg=`<g data-device="${positive}"><rect x="${x}" y="${y-28}" width="245" height="111" rx="10" fill="#fff7ed" stroke="#c2410c"/>${text(x+15,y-48,label,18)}${text(x+15,y+5,positive+' ＋',17)}${text(x+15,y+55,'GND −',17)}<circle cx="${x}" cy="${y}" r="5" fill="#dc2626"/><circle cx="${x}" cy="${y+50}" r="5" fill="#475569"/></g>`;
    return {ports,svg};
  }
  // Each edge names its two physical endpoints. Tests check graph connectivity,
  // pin coordinates, NC pins, and distinct-net segment overlap from this model.
  function network() {
    const points={}, edges=[];
    const add=(id,p)=>{points[id]=p;return id;};
    const wire=(net,from,to,via=[],attrs='')=>{edges.push({net,from,to,via,attrs});};
    function svg() {
      const paths=edges.map(e=>({e,d:[points[e.from],...e.via,points[e.to]].map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')}));
      // All white underlays precede coloured paths, so crossings cannot erase a wire.
      let s=paths.map(({d})=>`<path d="${d}" fill="none" stroke="white" stroke-width="6"/>`).join('');
      s+=paths.map(({e,d})=>`<path d="${d}" fill="none" stroke="${colours[e.net] || (e.net.includes('_A')?'#0891b2':'#9333ea')}" stroke-width="2.4" data-net="${e.net}" data-from="${e.from}" data-to="${e.to}" ${e.attrs}/>`).join('');
      const connected=new Set(edges.flatMap(e=>[e.from,e.to]));
      s+=[...connected].map(id=>`<circle cx="${points[id].x}" cy="${points[id].y}" r="3.5" fill="${colours[edges.find(e=>e.from===id||e.to===id).net] || '#475569'}"/>`).join('');
      // Mark T junctions along shared net segments, not only named endpoints.
      for(const net of new Set(edges.map(e=>e.net))) {
        const runs=edges.filter(e=>e.net===net).map(e=>[points[e.from],...e.via,points[e.to]]);
        const vertices=new Map(runs.flat().map(p=>[`${p.x},${p.y}`,p]));
        for(const p of vertices.values()) {
          const rays=new Set();
          for(const run of runs) for(let i=1;i<run.length;i++) {
            const a=run[i-1],b=run[i],cross=(p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x);
            if(Math.abs(cross)>1e-6||p.x<Math.min(a.x,b.x)||p.x>Math.max(a.x,b.x)||p.y<Math.min(a.y,b.y)||p.y>Math.max(a.y,b.y)) continue;
            for(const q of [a,b]) if(q.x!==p.x||q.y!==p.y) rays.add(Math.atan2(q.y-p.y,q.x-p.x).toFixed(6));
          }
          if(rays.size>=3) s+=`<circle cx="${p.x}" cy="${p.y}" r="4" fill="${colours[net] || '#475569'}" data-junction="${net}"/>`;
        }
      }
      return s;
    }
    return {points,edges,add,wire,svg};
  }
  return {left,right,ports,moduleSvg,motor,servo,supply,network,text};
})();
if(typeof module!=='undefined') module.exports=MicroPythonTmcView;
