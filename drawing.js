"use strict";

(() => {
  const STORAGE_LAST = "plotterflow.drawing.last";
  const STORAGE_LIBRARY = "plotterflow.drawings";
  const svgNS = "http://www.w3.org/2000/svg";
  const clone = value => JSON.parse(JSON.stringify(value));
  const $d = selector => document.querySelector(selector);
  const $$d = selector => [...document.querySelectorAll(selector)];

  const editor = {
    document: { version: 1, canvas: { widthMm: 30, heightMm: 30 }, objects: [] },
    tool: "pen", selected: -1, history: [], future: [], gesture: null, eraserPoint: null, currentId: null,
    name: "drawing.plotter.json", library: readStorage(STORAGE_LIBRARY, [])
  };

  function initDrawing() {
    const saved = readStorage(STORAGE_LAST, null);
    if (saved) {
      try { editor.document = normalizeDocument(saved.document || saved); editor.name = ensureJsonName(saved.name || editor.name); editor.currentId = saved.currentId || null; }
      catch { /* Invalid stale data falls back to a blank document. */ }
    }
    editor.history = [snapshot()];
    bindDrawingEvents(); populateDrawingControls(); refreshDrawingLibrary(); renderDrawing();
    new ResizeObserver(updateCanvasFit).observe($d("#drawingCanvasWrap"));
  }

  function bindDrawingEvents() {
    $$d(".draw-tool").forEach(button => button.addEventListener("click", () => setTool(button.dataset.drawTool)));
    const canvas = $d("#drawingCanvas");
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerCancel);
    $d("#drawingUndo").addEventListener("click", undo);
    $d("#drawingRedo").addEventListener("click", redo);
    $d("#drawingDelete").addEventListener("click", deleteSelected);
    $d("#drawingClear").addEventListener("click", clearDrawing);
    $d("#drawingCanvasPreset").addEventListener("change", applyCanvasPreset);
    $d("#drawingWidth").addEventListener("change", changeCanvasSize);
    $d("#drawingHeight").addEventListener("change", changeCanvasSize);
    $d("#drawingNew").addEventListener("click", newDrawing);
    $d("#drawingSave").addEventListener("click", saveDrawing);
    $d("#drawingSaveAs").addEventListener("click", saveDrawingAs);
    $d("#drawingLibrary").addEventListener("change", event => loadLibraryDrawing(event.target.value));
    $d("#drawingLoadJson").addEventListener("change", loadJsonFile);
    $d("#drawingDownloadJson").addEventListener("click", downloadJson);
    $d("#drawingDownloadSvg").addEventListener("click", downloadSvg);
    $d("#drawingGenerateGcode").addEventListener("click", generateDrawingGcode);
    document.addEventListener("keydown", drawingKeydown);
  }

  function setTool(tool) {
    editor.tool = tool; editor.gesture = null;
    if (tool !== "eraser") editor.eraserPoint = null;
    $$d(".draw-tool").forEach(button => button.classList.toggle("active", button.dataset.drawTool === tool));
    const canvas = $d("#drawingCanvas");
    canvas.classList.toggle("select-mode", tool === "select");
    canvas.classList.toggle("eraser-mode", tool === "eraser");
  }

  function pointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const point = eventPoint(event); const canvas = $d("#drawingCanvas");
    canvas.setPointerCapture?.(event.pointerId);
    if (editor.tool === "eraser") {
      editor.selected = -1; editor.eraserPoint = point;
      editor.gesture = { type: "erase", last: point, before: clone(editor.document.objects), changed: false };
      editor.gesture.changed = eraseAlongStroke(point, point);
      renderDrawing();
      return;
    }
    if (editor.tool === "select") {
      editor.selected = findNearestObject(point);
      editor.gesture = editor.selected >= 0 ? { type: "move", start: point, original: clone(editor.document.objects[editor.selected]), changed: false } : null;
      renderDrawing(); return;
    }
    editor.selected = -1;
    if (editor.tool === "pen") editor.gesture = { type: "draw", start: point, draft: { type: "freehand", points: [[point.x, point.y]] } };
    if (editor.tool === "rect") editor.gesture = { type: "draw", start: point, draft: { type: "rect", x: point.x, y: point.y, width: 0, height: 0 } };
    if (editor.tool === "circle") editor.gesture = { type: "draw", start: point, draft: { type: "circle", cx: point.x, cy: point.y, r: 0 } };
    if (editor.tool === "star") editor.gesture = { type: "draw", start: point, draft: { type: "star", cx: point.x, cy: point.y, r: 0, vertices: clamp(+$d("#drawingStarPoints").value || 5, 3, 24) } };
    renderDrawing();
  }

  function pointerMove(event) {
    const point = eventPoint(event);
    $d("#drawingCoordinates").textContent = `${fmt(point.x)}, ${fmt(point.y)} mm`;
    const gesture = editor.gesture; if (!gesture) return;
    event.preventDefault();
    if (gesture.type === "erase") {
      editor.eraserPoint = point;
      gesture.changed = eraseAlongStroke(gesture.last, point) || gesture.changed;
      gesture.last = point;
    } else if (gesture.type === "move") {
      const dx = point.x - gesture.start.x, dy = point.y - gesture.start.y;
      editor.document.objects[editor.selected] = translateObject(gesture.original, dx, dy);
      gesture.changed = Math.hypot(dx, dy) > 0.01;
    } else if (gesture.draft.type === "freehand") {
      const last = gesture.draft.points.at(-1);
      if (Math.hypot(point.x - last[0], point.y - last[1]) >= pointerSampleDistance()) gesture.draft.points.push([point.x, point.y]);
    } else if (gesture.draft.type === "rect") {
      gesture.draft.x = Math.min(gesture.start.x, point.x); gesture.draft.y = Math.min(gesture.start.y, point.y);
      gesture.draft.width = Math.abs(point.x - gesture.start.x); gesture.draft.height = Math.abs(point.y - gesture.start.y);
    } else {
      gesture.draft.r = Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y);
    }
    renderDrawing();
  }

  function pointerUp(event) {
    const gesture = editor.gesture; if (!gesture) return;
    event.preventDefault();
    if (gesture.type === "erase") {
      if (gesture.changed) commit("部分消去");
    } else if (gesture.type === "move") {
      if (gesture.changed) commit("移動");
    } else {
      let object = gesture.draft;
      if (object.type === "freehand") object.points = simplifyRdp(object.points, Math.max(0, +$d("#drawingSimplify").value || 0));
      const valid = object.type === "freehand" ? object.points.length >= 2 : object.type === "rect" ? object.width > .05 && object.height > .05 : object.r > .05;
      if (valid) { editor.document.objects.push(object); editor.selected = editor.document.objects.length - 1; commit("描画"); }
    }
    editor.gesture = null; renderDrawing();
  }
  function pointerCancel() {
    if (editor.gesture?.type === "move") editor.document.objects[editor.selected] = editor.gesture.original;
    if (editor.gesture?.type === "erase") editor.document.objects = editor.gesture.before;
    editor.gesture = null; renderDrawing();
  }

  function eventPoint(event) {
    const svg = $d("#drawingCanvas"), rect = svg.getBoundingClientRect(), canvas = editor.document.canvas;
    return { x: clamp((event.clientX - rect.left) / rect.width * canvas.widthMm, 0, canvas.widthMm), y: clamp((event.clientY - rect.top) / rect.height * canvas.heightMm, 0, canvas.heightMm) };
  }
  function pointerSampleDistance() {
    const rect = $d("#drawingCanvas").getBoundingClientRect(), c = editor.document.canvas;
    return Math.max(.05, Math.max(c.widthMm / rect.width, c.heightMm / rect.height) * 1.5);
  }

  function renderDrawing() {
    const svg = $d("#drawingCanvas"), c = editor.document.canvas;
    svg.setAttribute("viewBox", `0 0 ${c.widthMm} ${c.heightMm}`);
    svg.innerHTML = editor.document.objects.map((object, index) => objectMarkup(object, index === editor.selected)).join("");
    if (editor.gesture?.draft) svg.insertAdjacentHTML("beforeend", objectMarkup(editor.gesture.draft, false));
    if (editor.selected >= 0 && editor.document.objects[editor.selected]) {
      const b = objectBounds(editor.document.objects[editor.selected]), pad = Math.max(c.widthMm, c.heightMm) * .008;
      svg.insertAdjacentHTML("beforeend", `<rect class="drawing-selection" x="${b.x-pad}" y="${b.y-pad}" width="${b.width+2*pad}" height="${b.height+2*pad}"/>`);
    }
    if (editor.tool === "eraser" && editor.eraserPoint) {
      svg.insertAdjacentHTML("beforeend", `<circle class="drawing-eraser-cursor" cx="${fmt(editor.eraserPoint.x)}" cy="${fmt(editor.eraserPoint.y)}" r="${fmt(eraserRadius())}"/>`);
    }
    $d("#drawingObjectCount").textContent = `${editor.document.objects.length}オブジェクト`;
    $d("#drawingUndo").disabled = editor.history.length <= 1; $d("#drawingRedo").disabled = !editor.future.length;
    $d("#drawingDelete").disabled = editor.selected < 0;
    updateCanvasFit(); persistLast();
  }

  function objectMarkup(object, selected) {
    const cls = `drawing-object${selected ? " selected" : ""}`;
    if (object.type === "freehand") return `<polyline class="${cls}" points="${object.points.map(p => `${fmt(p[0])},${fmt(p[1])}`).join(" ")}"/>`;
    if (object.type === "rect") return `<rect class="${cls}" x="${fmt(object.x)}" y="${fmt(object.y)}" width="${fmt(object.width)}" height="${fmt(object.height)}"/>`;
    if (object.type === "circle") return `<circle class="${cls}" cx="${fmt(object.cx)}" cy="${fmt(object.cy)}" r="${fmt(object.r)}"/>`;
    if (object.type === "star") return `<polygon class="${cls}" points="${starPoints(object).map(p => `${fmt(p[0])},${fmt(p[1])}`).join(" ")}"/>`;
    return "";
  }

  function commit() {
    const next = snapshot(), previous = editor.history.at(-1);
    if (JSON.stringify(next) !== JSON.stringify(previous)) editor.history.push(next);
    if (editor.history.length > 100) editor.history.shift();
    editor.future = []; persistLast();
  }
  function snapshot() { return clone(editor.document); }
  function restore(data) { editor.document = clone(data); editor.selected = -1; editor.gesture = null; populateDrawingControls(); renderDrawing(); }
  function undo() { if (editor.history.length <= 1) return; editor.future.push(editor.history.pop()); restore(editor.history.at(-1)); }
  function redo() { if (!editor.future.length) return; const item = editor.future.pop(); editor.history.push(clone(item)); restore(item); }
  function deleteSelected() { if (editor.selected < 0) return; editor.document.objects.splice(editor.selected, 1); editor.selected = -1; commit("削除"); renderDrawing(); }
  function clearDrawing() { if (!editor.document.objects.length || !confirm("描画内容をすべて消去しますか？")) return; editor.document.objects = []; editor.selected = -1; commit("全消去"); renderDrawing(); }

  function drawingKeydown(event) {
    if (!$d("#tab-drawing").classList.contains("active") || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
    if ((event.key === "Delete" || event.key === "Backspace") && editor.selected >= 0) { event.preventDefault(); deleteSelected(); }
  }

  function applyCanvasPreset() {
    const value = $d("#drawingCanvasPreset").value; if (value === "custom") return;
    const [width, height] = value.split("x").map(Number); $d("#drawingWidth").value = width; $d("#drawingHeight").value = height; changeCanvasSize();
  }
  function changeCanvasSize() {
    const width = clamp(+$d("#drawingWidth").value || 30, 1, 2000), height = clamp(+$d("#drawingHeight").value || 30, 1, 2000);
    if (width === editor.document.canvas.widthMm && height === editor.document.canvas.heightMm) return;
    editor.document.canvas = { widthMm: width, heightMm: height }; editor.selected = -1; syncPreset(); commit("キャンバス変更"); renderDrawing();
  }
  function populateDrawingControls() {
    const c = editor.document.canvas; $d("#drawingWidth").value = c.widthMm; $d("#drawingHeight").value = c.heightMm; $d("#drawingName").value = editor.name; syncPreset();
  }
  function syncPreset() {
    const c = editor.document.canvas, value = `${c.widthMm}x${c.heightMm}`, select = $d("#drawingCanvasPreset");
    select.value = [...select.options].some(option => option.value === value) ? value : "custom";
  }
  function updateCanvasFit() {
    const svg = $d("#drawingCanvas"), wrap = $d("#drawingCanvasWrap"); if (!svg || !wrap) return;
    const canvasRatio = editor.document.canvas.widthMm / editor.document.canvas.heightMm, wrapRatio = Math.max(1, wrap.clientWidth) / Math.max(1, wrap.clientHeight);
    svg.style.aspectRatio = `${editor.document.canvas.widthMm} / ${editor.document.canvas.heightMm}`;
    if (canvasRatio >= wrapRatio) { svg.style.width = "100%"; svg.style.height = "auto"; } else { svg.style.width = "auto"; svg.style.height = "100%"; }
  }

  function newDrawing() {
    if (editor.document.objects.length && !confirm("現在の描画を閉じて新規作成しますか？")) return;
    editor.document = { version: 1, canvas: { widthMm: 30, heightMm: 30 }, objects: [] }; editor.name = "drawing.plotter.json"; editor.currentId = null; editor.selected = -1; editor.history = [snapshot()]; editor.future = []; populateDrawingControls(); refreshDrawingLibrary(); renderDrawing(); setStatus("新規作成しました。");
  }
  function saveDrawing() {
    editor.name = ensureJsonName($d("#drawingName").value || editor.name);
    let item = editor.library.find(entry => entry.id === editor.currentId);
    if (item) Object.assign(item, { name: editor.name, document: snapshot(), updated: Date.now() });
    else { item = { id: makeId(), name: editor.name, document: snapshot(), updated: Date.now() }; editor.library.push(item); editor.currentId = item.id; }
    saveStorage(STORAGE_LIBRARY, editor.library); refreshDrawingLibrary(); persistLast(); setStatus("お絵描きデータを保存しました。");
  }
  function saveDrawingAs() {
    const name = prompt("保存名", ensureJsonName($d("#drawingName").value || editor.name)); if (!name) return;
    editor.currentId = null; editor.name = ensureJsonName(name); $d("#drawingName").value = editor.name; saveDrawing();
  }
  function refreshDrawingLibrary() {
    const select = $d("#drawingLibrary");
    select.innerHTML = `<option value="">新規</option>${editor.library.sort((a,b) => b.updated-a.updated).map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}`;
    select.value = editor.currentId || "";
  }
  function loadLibraryDrawing(id) {
    if (!id) return newDrawing(); const item = editor.library.find(entry => entry.id === id); if (!item) return;
    editor.document = normalizeDocument(item.document); editor.name = item.name; editor.currentId = item.id; editor.selected = -1; editor.history = [snapshot()]; editor.future = []; populateDrawingControls(); renderDrawing(); setStatus(`${item.name}を読み込みました。`);
  }
  async function loadJsonFile(event) {
    const file = event.target.files[0]; if (!file) return;
    try { editor.document = normalizeDocument(JSON.parse(await file.text())); editor.name = ensureJsonName(file.name); editor.currentId = null; editor.selected = -1; editor.history = [snapshot()]; editor.future = []; populateDrawingControls(); refreshDrawingLibrary(); renderDrawing(); setStatus(`${file.name}を読み込みました。`); }
    catch (error) { setStatus(`読み込みエラー: ${error.message}`, true); }
    event.target.value = "";
  }
  function downloadJson() { editor.name = ensureJsonName($d("#drawingName").value || editor.name); download(editor.name, JSON.stringify(editor.document, null, 2), "application/json"); }
  function downloadSvg() { const name = ensureJsonName($d("#drawingName").value || editor.name).replace(/\.plotter\.json$/i, ".svg"); download(name, drawingSvgText(), "image/svg+xml"); }

  function drawingSvgText() {
    const c = editor.document.canvas;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="${svgNS}" width="${c.widthMm}mm" height="${c.heightMm}mm" viewBox="0 0 ${c.widthMm} ${c.heightMm}">\n  <g fill="none" stroke="#000" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round">\n    ${editor.document.objects.map(object => objectSvgMarkup(object)).join("\n    ")}\n  </g>\n</svg>\n`;
  }
  function objectSvgMarkup(object) {
    if (object.type === "freehand") return `<polyline points="${object.points.map(p => `${fmt(p[0])},${fmt(p[1])}`).join(" ")}"/>`;
    if (object.type === "rect") return `<rect x="${fmt(object.x)}" y="${fmt(object.y)}" width="${fmt(object.width)}" height="${fmt(object.height)}"/>`;
    if (object.type === "circle") return `<circle cx="${fmt(object.cx)}" cy="${fmt(object.cy)}" r="${fmt(object.r)}"/>`;
    return `<polygon points="${starPoints(object).map(p => `${fmt(p[0])},${fmt(p[1])}`).join(" ")}"/>`;
  }
  function generateDrawingGcode() {
    if (!editor.document.objects.length) return setStatus("先に図形を描いてください。", true);
    const paths = objectsToPaths(editor.document.objects); const name = ensureJsonName($d("#drawingName").value || editor.name);
    window.PlotterFlow.generateFromPaths(paths, name); setStatus(`${paths.length}パスをG-codeへ変換しました。`);
  }
  function objectsToPaths(objects) {
    const interval = Math.max(.05, +(window.PlotterFlow.getSettings().sampleInterval || .5));
    return objects.map(object => {
      if (object.type === "freehand") return object.points.map(p => ({ x: p[0], y: p[1] }));
      if (object.type === "rect") return [[object.x,object.y],[object.x+object.width,object.y],[object.x+object.width,object.y+object.height],[object.x,object.y+object.height],[object.x,object.y]].map(p => ({x:p[0],y:p[1]}));
      if (object.type === "star") return [...starPoints(object), starPoints(object)[0]].map(p => ({x:p[0],y:p[1]}));
      const count = Math.max(16, Math.ceil(2 * Math.PI * object.r / interval));
      return Array.from({ length: count + 1 }, (_, i) => ({ x: object.cx + Math.cos(i/count*2*Math.PI) * object.r, y: object.cy + Math.sin(i/count*2*Math.PI) * object.r }));
    }).filter(path => path.length >= 2);
  }

  function eraserRadius() { return clamp(+$d("#drawingEraserSize").value || 2, .2, 100) / 2; }
  function eraseAlongStroke(from, to) {
    const radius = eraserRadius(), step = Math.max(.04, radius / 3); let changed = false; const next = [];
    for (const object of editor.document.objects) {
      const source = objectAsPolyline(object, step);
      const touched = source.points.some(point => distanceToSegment({ x: point[0], y: point[1] }, from, to) <= radius);
      if (!touched) { next.push(object); continue; }
      changed = true;
      const runs = splitPolylineOutsideStroke(source.points, from, to, radius, source.closed);
      runs.forEach(points => next.push({ type: "freehand", points }));
    }
    if (changed) editor.document.objects = next;
    return changed;
  }
  function objectAsPolyline(object, step) {
    if (object.type === "freehand") return { points: resamplePolyline(object.points, step), closed: false };
    if (object.type === "rect") return { points: resamplePolyline([[object.x,object.y],[object.x+object.width,object.y],[object.x+object.width,object.y+object.height],[object.x,object.y+object.height],[object.x,object.y]], step), closed: true };
    if (object.type === "star") { const points=starPoints(object);points.push(points[0]);return { points:resamplePolyline(points,step),closed:true }; }
    const count=Math.max(24,Math.ceil(2*Math.PI*object.r/step));
    return { points:Array.from({length:count+1},(_,i)=>[object.cx+Math.cos(i/count*2*Math.PI)*object.r,object.cy+Math.sin(i/count*2*Math.PI)*object.r]),closed:true };
  }
  function resamplePolyline(points, step) {
    const result=[clone(points[0])];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],distance=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.max(1,Math.ceil(distance/step));
      for(let j=1;j<=count;j++)result.push([a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count]);
    }
    return result;
  }
  function splitPolylineOutsideStroke(points, from, to, radius, closed) {
    const runs=[];let current=[];
    for(const point of points){
      const outside=distanceToSegment({x:point[0],y:point[1]},from,to)>radius;
      if(outside)current.push(point);else if(current.length){if(current.length>=2)runs.push(current);current=[];}
    }
    if(current.length>=2)runs.push(current);
    if(closed&&runs.length>1){
      const firstOutside=distanceToSegment({x:points[0][0],y:points[0][1]},from,to)>radius;
      const lastOutside=distanceToSegment({x:points.at(-1)[0],y:points.at(-1)[1]},from,to)>radius;
      if(firstOutside&&lastOutside){const merged=runs.at(-1).concat(runs[0].slice(1));runs[0]=merged;runs.pop();}
    }
    return runs;
  }

  function findNearestObject(point) {
    const svg = $d("#drawingCanvas"), rect = svg.getBoundingClientRect(), c = editor.document.canvas;
    const threshold = Math.max(c.widthMm / rect.width, c.heightMm / rect.height) * 16;
    let best = -1, bestDistance = threshold;
    editor.document.objects.forEach((object, index) => { const distance = distanceToObject(point, object); if (distance <= bestDistance) { bestDistance = distance; best = index; } });
    return best;
  }
  function distanceToObject(point, object) {
    if (object.type === "circle") return Math.abs(Math.hypot(point.x-object.cx,point.y-object.cy)-object.r);
    let points;
    if (object.type === "freehand") points = object.points;
    if (object.type === "rect") points = [[object.x,object.y],[object.x+object.width,object.y],[object.x+object.width,object.y+object.height],[object.x,object.y+object.height],[object.x,object.y]];
    if (object.type === "star") { points = starPoints(object); points.push(points[0]); }
    let distance = Infinity; for (let i=1;i<points.length;i++) distance=Math.min(distance,distanceToSegment(point,{x:points[i-1][0],y:points[i-1][1]},{x:points[i][0],y:points[i][1]})); return distance;
  }
  function distanceToSegment(p, a, b) { const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(!l2)return Math.hypot(p.x-a.x,p.y-a.y);const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/l2,0,1);return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy)); }
  function translateObject(object, dx, dy) { const result=clone(object);if(result.type==="freehand")result.points=result.points.map(p=>[p[0]+dx,p[1]+dy]);else if(result.type==="rect"){result.x+=dx;result.y+=dy;}else{result.cx+=dx;result.cy+=dy;}return result; }
  function objectBounds(object) { let points;if(object.type==="freehand")points=object.points;else if(object.type==="rect")points=[[object.x,object.y],[object.x+object.width,object.y+object.height]];else points=[[object.cx-object.r,object.cy-object.r],[object.cx+object.r,object.cy+object.r]];const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}; }
  function starPoints(object) { const points=[];for(let i=0;i<object.vertices*2;i++){const radius=i%2?object.r*.45:object.r,angle=-Math.PI/2+i*Math.PI/object.vertices;points.push([object.cx+Math.cos(angle)*radius,object.cy+Math.sin(angle)*radius]);}return points; }

  function simplifyRdp(points, tolerance) {
    if (points.length <= 2 || tolerance <= 0) return points;
    const first={x:points[0][0],y:points[0][1]},last={x:points.at(-1)[0],y:points.at(-1)[1]};let max=0,index=0;
    for(let i=1;i<points.length-1;i++){const distance=distanceToSegment({x:points[i][0],y:points[i][1]},first,last);if(distance>max){index=i;max=distance;}}
    if(max>tolerance){const left=simplifyRdp(points.slice(0,index+1),tolerance),right=simplifyRdp(points.slice(index),tolerance);return left.slice(0,-1).concat(right);}return[points[0],points.at(-1)];
  }
  function normalizeDocument(data) {
    if (!data || +data.version !== 1 || !data.canvas || !Array.isArray(data.objects)) throw new Error("対応する.plotter.jsonではありません");
    const width=clamp(finite(data.canvas.widthMm),1,2000),height=clamp(finite(data.canvas.heightMm),1,2000);
    const objects=data.objects.map(normalizeObject);return{version:1,canvas:{widthMm:width,heightMm:height},objects};
  }
  function normalizeObject(object) {
    if (!object || !["freehand","rect","circle","star"].includes(object.type)) throw new Error("未対応のオブジェクトがあります");
    if(object.type==="freehand"){if(!Array.isArray(object.points)||object.points.length<2)throw new Error("自由線の点列が不正です");return{type:"freehand",points:object.points.map(p=>[finite(p[0]),finite(p[1])])};}
    if(object.type==="rect")return{type:"rect",x:finite(object.x),y:finite(object.y),width:Math.abs(finite(object.width)),height:Math.abs(finite(object.height))};
    if(object.type==="circle")return{type:"circle",cx:finite(object.cx),cy:finite(object.cy),r:Math.abs(finite(object.r))};
    return{type:"star",cx:finite(object.cx),cy:finite(object.cy),r:Math.abs(finite(object.r)),vertices:clamp(Math.round(finite(object.vertices||5)),3,24)};
  }
  function finite(value){const number=+value;if(!Number.isFinite(number))throw new Error("数値データが不正です");return number;}
  function persistLast(){saveStorage(STORAGE_LAST,{document:editor.document,name:editor.name,currentId:editor.currentId});}
  function setStatus(message,error=false){const el=$d("#drawingStatus");el.textContent=message;el.classList.toggle("error",error);}
  function readStorage(key,fallback){try{const value=JSON.parse(localStorage.getItem(key));return value??fallback;}catch{return fallback;}}
  function saveStorage(key,value){localStorage.setItem(key,JSON.stringify(value));}
  function ensureJsonName(name){const clean=String(name).trim()||"drawing";return clean.toLowerCase().endsWith(".plotter.json")?clean:`${clean.replace(/\.json$/i,"")}.plotter.json`;}
  function download(name,text,type){const a=document.createElement("a"),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
  function makeId(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;}
  function escapeHtml(text){const div=document.createElement("div");div.textContent=text;return div.innerHTML;}
  function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
  function fmt(value){return Number((+value).toFixed(3)).toString();}

  document.addEventListener("DOMContentLoaded", initDrawing);
})();
