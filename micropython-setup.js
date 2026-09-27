/* Pin catalog and SVG primitives adapted from pscmps/pico-blocks-studio
 * app.js / wiring.js. Functional wiring, not physical connector pin order. */
const MicroPythonSetup = (() => {
  const signals = ["X_STEP", "X_DIR", "Y_STEP", "Y_DIR", "ENABLE", "PEN_PWM"];
  const shieldPrefix = "plotterflow_motor_shield_";
  const isShield = id => id.startsWith(shieldPrefix);
  const picoPins = [...Array(23).keys(), 26, 27, 28];
  const catalogs = {
    rp2040_geek: [2, 3, 4, 5, 28, 29], rp2350_geek: [2, 3, 4, 5, 28, 29],
    xiao_rp2040: [26, 27, 28, 29, 6, 7, 0, 1, 2, 4, 3],
    xiao_rp2350: [26, 27, 28, 5, 6, 7, 0, 1, 2, 4, 3]
  };
  const pinLabel = (id, pin) => id.startsWith("xiao_")
    ? `D${catalogs[id].indexOf(pin)} / GP${pin}` : `GP${pin}`;
  const availablePins = id => catalogs[id] || picoPins;
  function defaults(id, board) {
    const pins = id.includes("geek") ? [2, 4, 3, 5, 28, 29]
      : id.startsWith("xiao_") ? [2, 4, 3, 6, 7, 26] : board.pins;
    return Object.fromEntries(signals.map((name, index) => [name, pins[index]]));
  }
  function configuration(id, board, customPins = null) {
    const pins = { ...defaults(id, board), ...(!isShield(id) && customPins ? customPins : {}) };
    const errors = [];
    if (board.supported === false) errors.push("このボードはRP版の対象外です。");
    for (const name of signals) {
      if (!Number.isInteger(pins[name]) || (!isShield(id) && !availablePins(id).includes(pins[name])))
        errors.push(`${name}: 選択したボードで使用できないGPIOです。`);
    }
    const used = new Map();
    for (const name of signals) {
      if (used.has(pins[name])) errors.push(`GP${pins[name]}が${used.get(pins[name])}と${name}で重複しています。`);
      used.set(pins[name], name);
    }
    return { id, board, pins, errors };
  }
  function boardConfig(config) {
    if (config.errors.length) throw new Error(config.errors.join(" "));
    const { id, board, pins } = config;
    const extras = ["X_LIMIT", "Y_LIMIT", "BUTTON_UP", "BUTTON_DOWN", "BUTTON_OK", "TMC_UART_TX", "TMC_UART_RX", "SERIAL_DATA_GPIO"];
    const assignments = signals.map(name => `${name} = ${pins[name]}`);
    for (const name of extras) assignments.push(`${name} = ${board.signals?.[name]?.gpio ?? "None"}`);
    return `"""PlotterFlow board recipe: ${board.label}"""\n\nBOARD = ${JSON.stringify(id + "-stepdir")}\n${assignments.join("\n")}\nENABLE_ACTIVE_LOW = True\nSTEPS_PER_MM_X = 80.0\nSTEPS_PER_MM_Y = 80.0\nMAX_FEED_MM_MIN = 2400.0\nPEN_UP_US = 1000\nPEN_DOWN_US = 1800\nPEN_PWM_FREQ = 50\n`;
  }
  const escape = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function render(config) {
    const { id, board, pins } = config;
    const fixed = isShield(id);
    // Pico Blocks' path / terminal / text primitives and data-signal/data-pin
    // markers are retained; STEP/DIR branches and named power nets are added.
    const path = (d, colour, attrs = "") => `<path d="${d}" fill="none" stroke="${colour}" stroke-width="2.4" ${attrs}/>`;
    const terminal = (x, y, colour) => `<circle cx="${x}" cy="${y}" r="4" fill="white" stroke="${colour}" stroke-width="2"/>`;
    const text = (x, y, value, size = 13) => `<text x="${x}" y="${y}" font-size="${size}">${escape(value)}</text>`;
    const box = (x, y, w, h, title) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#f8fafc" stroke="#cbd5e1"/>${text(x + 14, y + 26, title, 15)}`;
    const colours = ["#2563eb", "#0284c7", "#7c3aed", "#a21caf", "#b45309", "#047857"];
    const list = fixed ? [...new Set(Object.values(board.signals).map(s => s.gpio).filter(Number.isInteger))].sort((a,b) => a-b) : availablePins(id);
    const point = pin => ({ x: 260, y: 120 + list.indexOf(pin) * 18 });
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 715" role="img" aria-label="${escape(board.label)}の配線図"><title>${escape(board.label)}の機能配線図</title><g font-family="system-ui,sans-serif" fill="#1e293b">`;
    svg += text(20, 28, fixed ? "Plotter基板：信号線は基板内配線（固定）" : "単体ボード：選択したGPIOへ配線", 18);
    svg += text(20, 51, "機能接続図です。実物の端子順・向きではありません。", 13);
    svg += box(20, 72, 240, 555, fixed ? "Motor Shield / MCU" : "MCU / GPIO");
    for (const pin of list) {
      const p = point(pin), names = signals.filter(name => pins[name] === pin);
      svg += terminal(p.x, p.y, names.length ? colours[signals.indexOf(names[0])] : "#94a3b8");
      svg += text(32, p.y + 4, pinLabel(id, pin), 12);
      svg += text(145, p.y + 4, names.join(" / "), 11);
    }
    svg += text(32, 596, "USB → MCU電源 / GND共通", 12);
    svg += text(32, 617, "3V3 → ドライバVIO（対応品）", 12);
    const endpoints = { X_STEP: [[515, 137]], X_DIR: [[515, 163]], Y_STEP: [[515, 352]], Y_DIR: [[515, 378]], ENABLE: [[515, 189], [515, 404]], PEN_PWM: [[515, 560]] };
    const occupiedRows = Object.values(endpoints).flat().map(([, y]) => y);
    signals.forEach((name, i) => {
      const p = point(pins[name]), rail = 298 + i * 32, colour = colours[i];
      // Avoid overlapping unrelated horizontal wires when a custom pin happens
      // to sit at a driver's input height. A short diagonal clears the pin bank.
      let exitY = p.y;
      while (occupiedRows.some(y => Math.abs(y - exitY) < 12)) exitY += 12;
      occupiedRows.push(exitY);
      for (const [x, y] of endpoints[name]) {
        svg += path(`M${p.x} ${p.y} L282 ${exitY} H${rail} V${y} H${x}`, colour, `data-signal="${name}" data-pin="${pins[name]}"`);
      }
    });
    for (const [axis, y, driver, connector] of [["X", 90, "U1", "J5"], ["Y", 305, "U2", "J6"]]) {
      svg += box(515, y, 220, 190, `${fixed ? driver + " · " : ""}${axis} STEP/DIRドライバ`);
      ["STEP", "DIR", "EN (active-low)"].forEach((label, i) => {
        const name = i === 2 ? "ENABLE" : axis + "_" + label;
        svg += terminal(515, y + 47 + i * 26, colours[signals.indexOf(name)]);
        svg += text(529, y + 51 + i * 26, label);
      });
      svg += text(529, y + 134, "VIO ← 3V3 / GND ← 共通GND", 11);
      svg += text(529, y + 156, fixed ? "VMOT ← J7 電源+ / GND" : "VMOT ← モータ用外部電源+", 11);
      svg += text(529, y + 177, "TMC等：STEP/DIRモード", 11);
      svg += box(838, y + 18, 145, 135, `${axis} モータ`);
      ["A1", "A2", "B1", "B2"].forEach((label, i) => {
        const ty = y + 63 + i * 21;
        svg += path(`M735 ${ty} H838`, i < 2 ? "#0e7490" : "#9333ea");
        svg += text(766, ty - 5, label, 11) + terminal(838, ty, "#64748b");
      });
      if (fixed) svg += text(765, y + 177, `${connector} モータ端子`, 11);
    }
    svg += box(515, 518, 360, 109, fixed ? "J9 · PWMペンサーボ" : "PWMペンサーボ");
    svg += terminal(515, 560, colours[5]) + text(529, 564, `SIGNAL ← ${pinLabel(id, pins.PEN_PWM)}`);
    svg += terminal(515, 584, "#dc2626") + path("M475 584 H515", "#dc2626") + text(529, 588, fixed ? "V+ ← J8 外部5V（サーボ定格を確認）" : "V+ ← サーボ用外部電源（定格を確認）", 12);
    svg += terminal(515, 608, "#64748b") + path("M475 608 H515", "#64748b") + text(529, 612, "GND ← 共通GND", 12);
    svg += text(20, 660, "GND：MCU・ドライバ・モータ用電源・サーボ用電源を共通にします。", 14);
    svg += text(20, 685, "電源の＋同士は接続しません。GPIOは3.3V信号専用。サーボを3V3から給電しないでください。", 13);
    svg += text(20, 707, "TMC UART設定・シリアルサーボ・LCD操作はこのSTEP/DIR版の対象外です。実機動作未確認。", 12);
    return svg + "</g></svg>";
  }
  return { signals, isShield, availablePins, pinLabel, defaults, configuration, boardConfig, render };
})();
if (typeof module !== "undefined") module.exports = MicroPythonSetup;
