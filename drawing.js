"use strict";

(() => {
  const STORAGE_LAST = "plotterflow.drawing.last";
  const STORAGE_LIBRARY = "plotterflow.drawings";
  const svgNS = "http://www.w3.org/2000/svg";
  const clone = value => JSON.parse(JSON.stringify(value));
  const $d = selector => document.querySelector(selector);
  const $$d = selector => [...document.querySelectorAll(selector)];
  const textContourCache = new Map();
  const stampAssets = new Map();
  const stampCategoryNames = { character: "キャラクター", bubble: "吹き出し", effect: "効果", preset_line: "定型線画" };

  const editor = {
    document: { version: 1, canvas: { widthMm: 30, heightMm: 30 }, objects: [] },
    tool: "pen", selected: -1, history: [], future: [], gesture: null, eraserPoint: null, currentId: null,
    font: null, fontReady: false, textWriting: "horizontal", activePointers: new Map(), longPressTimer: null,
    stampCatalog: [], stampsReady: false,
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
    loadTextFont(); loadStampCatalog();
  }

  function bindDrawingEvents() {
    $$d(".draw-tool").forEach(button => button.addEventListener("click", () => setTool(button.dataset.drawTool)));
    const canvas = $d("#drawingCanvas");
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerCancel);
    canvas.addEventListener("contextmenu", drawingContextMenu);
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
    $d("#drawingLoadSvg").addEventListener("change", loadSvgObjectFile);
    $d("#drawingAddSvgText").addEventListener("click",()=>{const input=$d("#drawingSvgText"),text=input.value.trim();if(text){addSvgObjectFromText(text,"pasted.svg");input.value="";}else setStatus("SVGテキストを入力してください。",true);});
    $d("#drawingDownloadJson").addEventListener("click", downloadJson);
    $d("#drawingDownloadSvg").addEventListener("click", downloadSvg);
    $d("#drawingGenerateGcode").addEventListener("click", generateDrawingGcode);
    $d("#drawingAddText").addEventListener("click", addTextObject);
    $$d("[data-text-writing]").forEach(button => button.addEventListener("click", () => setTextWriting(button.dataset.textWriting)));
    $d("#drawingProperties").addEventListener("click", openSelectedProperties);
    $d("#drawingDuplicate").addEventListener("click", duplicateSelected);
    $d("#drawingToFront").addEventListener("click", bringSelectedToFront);
    $d("#drawingToBack").addEventListener("click", sendSelectedToBack);
    $d("#textPropertiesApply").addEventListener("click", applyTextProperties);
    $d("#textPropertiesClose").addEventListener("click", closeTextProperties);
    $d("#textPropertiesCancel").addEventListener("click", closeTextProperties);
    $d("#openStampLibrary").addEventListener("click", openStampLibrary);
    $d("#stampLibraryClose").addEventListener("click", closeStampLibrary);
    $d("#stampCategory").addEventListener("change", renderStampLibrary);
    $d("#stampGrid").addEventListener("click", event => { const button=event.target.closest("[data-stamp-id]");if(button)addStampObject(button.dataset.stampId); });
    $d("#stampPropertiesApply").addEventListener("click", applyStampProperties);
    $d("#stampPropertiesClose").addEventListener("click", closeStampProperties);
    $d("#stampPropertiesCancel").addEventListener("click", closeStampProperties);
    $d("#stampPropertiesDelete").addEventListener("click", () => { closeStampProperties(); deleteSelected(); });
    $d("#stampToFront").addEventListener("click", bringStampToFront);
    $d("#stampToBack").addEventListener("click", sendStampToBack);
    document.addEventListener("keydown", drawingKeydown);
  }

  async function loadStampCatalog() {
    const status=$d("#stampLibraryStatus"),openButton=$d("#openStampLibrary");openButton.disabled=true;
    try {
      const response=await fetch("assets/stamps/catalog.json");if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const catalog=await response.json();if(!Array.isArray(catalog))throw new Error("catalog.jsonの形式が不正です");
      const loaded=await Promise.all(catalog.map(async item=>{
        const svgResponse=await fetch(item.src);if(!svgResponse.ok)throw new Error(`${item.src}: HTTP ${svgResponse.status}`);
        const parsed=parseStampSvg(await svgResponse.text());
        const meta={id:String(item.id),name:String(item.name||item.id),category:String(item.category||"effect"),src:String(item.src),defaultWidthMm:Math.max(.1,+item.defaultWidthMm||30),defaultHeightMm:Math.max(.1,+item.defaultHeightMm||30)};
        stampAssets.set(meta.id,{...meta,...parsed});return meta;
      }));
      editor.stampCatalog=loaded;editor.stampsReady=true;openButton.disabled=false;status.textContent=`${loaded.length}種類の素材`;status.className="stamp-library-status ready";renderStampLibrary();renderDrawing();
    } catch(error) { status.textContent=`素材読込エラー: ${error.message}`;status.className="stamp-library-status error";setStatus(status.textContent,true); }
  }
  function parseStampSvg(text) {
    const doc=new DOMParser().parseFromString(text,"image/svg+xml"),root=doc.documentElement;
    if(root.localName!=="svg"||doc.querySelector("parsererror"))throw new Error("SVG形式が不正です");
    root.querySelectorAll("script,foreignObject,image,text,style,defs,clipPath,mask,pattern,symbol,metadata").forEach(node=>node.remove());
    root.querySelectorAll("*").forEach(node=>{[...node.attributes].forEach(attribute=>{if(attribute.name.toLowerCase().startsWith("on")||/^(href|xlink:href|clip-path|mask|filter)$/i.test(attribute.name)||/url\s*\(/i.test(attribute.value))node.removeAttribute(attribute.name);});if(["g","path","line","polyline","polygon","rect","circle","ellipse"].includes(node.localName)){["fill","stroke","stroke-width","stroke-linecap","stroke-linejoin"].forEach(name=>node.removeAttribute(name));if(node.localName!=="g")node.setAttribute("fill","none");}});
    const vb=(root.getAttribute("viewBox")||"0 0 100 100").trim().split(/[ ,]+/).map(Number);
    if(vb.length!==4||vb.some(value=>!Number.isFinite(value))||vb[2]<=0||vb[3]<=0)throw new Error("viewBoxが不正です");
    const presentation={fill:"none",stroke:"#111"};["stroke-linecap","stroke-linejoin","stroke-dasharray"].forEach(name=>{if(root.hasAttribute(name))presentation[name]=sanitizePresentationValue(root.getAttribute(name));});
    return{markup:root.innerHTML,presentation,viewBox:{x:vb[0],y:vb[1],width:vb[2],height:vb[3]},rawWidth:root.getAttribute("width")||"",rawHeight:root.getAttribute("height")||""};
  }
  function sanitizePresentationValue(value){const clean=String(value||"").replace(/["'<>]/g,"");return/url\s*\(|javascript:/i.test(clean)?"":clean;}
  function presentationAttributes(values={}){return Object.entries(values).filter(([name,value])=>["fill","stroke","stroke-linecap","stroke-linejoin","stroke-dasharray"].includes(name)&&value).map(([name,value])=>`${name}="${escapeHtml(value)}"`).join(" ");}
  function openStampLibrary(){if(!editor.stampsReady)return setStatus("スタンプ素材を読み込み中です。",true);renderStampLibrary();openDialog($d("#stampLibraryDialog"));}
  function closeStampLibrary(){closeDialog($d("#stampLibraryDialog"));}
  function renderStampLibrary(){
    const grid=$d("#stampGrid"),category=$d("#stampCategory")?.value||"all";
    const items=editor.stampCatalog.filter(item=>category==="all"||item.category===category);
    grid.innerHTML=items.map(item=>`<button class="stamp-card" data-stamp-id="${escapeHtml(item.id)}"><img src="${escapeHtml(item.src)}" alt=""><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(stampCategoryNames[item.category]||item.category)}</small></button>`).join("")||"<p class=\"muted\">このカテゴリには素材がありません。</p>";
  }
  function addStampObject(stampId){
    const asset=stampAssets.get(stampId);if(!asset)return setStatus("スタンプ素材が見つかりません。",true);
    const c=editor.document.canvas,fit=Math.min(1,c.widthMm/(asset.defaultWidthMm*1.4),c.heightMm/(asset.defaultHeightMm*1.4));
    editor.document.objects.push({type:"stamp",stampId,x:c.widthMm/2,y:c.heightMm/2,scale:Math.max(.05,fit),rotation:0,flipX:false,flipY:false});
    editor.selected=editor.document.objects.length-1;commit("スタンプ追加");setTool("select");closeStampLibrary();renderDrawing();setStatus(`${asset.name}を中央に追加しました。`);
  }
  async function loadSvgObjectFile(event){
    const file=event.target.files[0];if(!file)return;
    try{addSvgObjectFromText(await file.text(),file.name);}catch(error){setStatus(`SVG読込エラー: ${error.message}`,true);}event.target.value="";
  }
  function addSvgObjectFromText(text,name){
      const parsed=parseStampSvg(text),size=svgObjectNaturalSize(parsed),c=editor.document.canvas,fit=Math.min(1,c.widthMm/(size.widthMm*1.15),c.heightMm/(size.heightMm*1.15));
      editor.document.objects.push({type:"svgObject",name,x:c.widthMm/2,y:c.heightMm/2,scale:Math.max(.01,fit),rotation:0,flipX:false,flipY:false,widthMm:size.widthMm,heightMm:size.heightMm,viewBox:parsed.viewBox,markup:parsed.markup,presentation:parsed.presentation});
      editor.selected=editor.document.objects.length-1;commit("SVG配置");setTool("select");renderDrawing();setStatus(`${name}をキャンバス中央へ配置しました。`);
  }
  function svgObjectNaturalSize(parsed){
    const ratio=parsed.viewBox.width/parsed.viewBox.height,w=svgLengthMm(parsed.rawWidth),h=svgLengthMm(parsed.rawHeight);
    if(w&&h)return{widthMm:w,heightMm:h};if(w)return{widthMm:w,heightMm:w/ratio};if(h)return{widthMm:h*ratio,heightMm:h};
    const widthMm=Math.min(80,Math.max(10,parsed.viewBox.width*25.4/96));return{widthMm,heightMm:widthMm/ratio};
  }
  function svgLengthMm(raw){const value=parseFloat(raw);if(!Number.isFinite(value)||value<=0)return 0;const unit=(String(raw).match(/[a-z]+/i)||["px"])[0].toLowerCase(),factor={mm:1,cm:10,in:25.4,pt:25.4/72,pc:25.4/6,px:25.4/96}[unit];return factor?value*factor:0;}

  async function loadTextFont() {
    const addButton=$d("#drawingAddText"),status=$d("#textFontStatus");addButton.disabled=true;
    try {
      const response=await fetch("vendor/noto-sans-jp/NotoSansJP-wght.ttf");if(!response.ok)throw new Error(`HTTP ${response.status}`);
      editor.font=opentype.parse(await response.arrayBuffer());editor.fontReady=true;addButton.disabled=false;
      status.textContent="Noto Sans JP・アウトライン";status.className="text-font-status ready";renderDrawing();
    } catch(error) { status.textContent=`フォント読込エラー: ${error.message}`;status.className="text-font-status error"; }
  }

  function setTextWriting(mode) { editor.textWriting=mode;$$d("[data-text-writing]").forEach(button=>button.classList.toggle("active",button.dataset.textWriting===mode)); }
  function addTextObject() {
    const input=$d("#drawingTextInput"),text=input.value.trim();if(!text)return setStatus("文字を入力してください。",true);if(!editor.fontReady)return setStatus("フォントを読み込み中です。",true);
    const c=editor.document.canvas,object={type:"text",text,x:c.widthMm/2,y:c.heightMm/2,fontSize:Math.max(4,Math.min(12,c.heightMm*.22)),letterSpacing:0,lineHeight:1.2,writingMode:editor.textWriting,rotation:0,renderMode:"outline"};
    editor.document.objects.push(object);editor.selected=editor.document.objects.length-1;input.value="";commit("テキスト追加");setTool("select");renderDrawing();setStatus("テキストを中央に追加しました。ドラッグで移動できます。");
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
    editor.activePointers.set(event.pointerId, point);
    canvas.setPointerCapture?.(event.pointerId);
    if (editor.tool === "select" && editor.activePointers.size === 2 && (editor.document.objects[editor.selected]?.type === "text" || isVectorObject(editor.document.objects[editor.selected]))) {
      clearLongPress(); const distance=twoPointerDistance();
      editor.gesture={type:"pinch",startDistance:Math.max(.01,distance),original:clone(editor.document.objects[editor.selected]),changed:false};return;
    }
    if (editor.tool === "eraser") {
      editor.selected = -1; editor.eraserPoint = point;
      editor.gesture = { type: "erase", last: point, before: clone(editor.document.objects), changed: false };
      editor.gesture.changed = eraseAlongStroke(point, point);
      renderDrawing();
      return;
    }
    if (editor.tool === "select") {
      const current=editor.document.objects[editor.selected];
      if(isVectorObject(current)&&pointNearRotationHandle(point,current)){
        const center={x:current.x,y:current.y};editor.gesture={type:"rotate",center,startAngle:Math.atan2(point.y-center.y,point.x-center.x),original:clone(current),changed:false};renderDrawing();return;
      }
      editor.selected = findNearestObject(point);
      editor.gesture = editor.selected >= 0 ? { type: "move", start: point, original: clone(editor.document.objects[editor.selected]), changed: false } : null;
      if ((editor.document.objects[editor.selected]?.type === "text" || isVectorObject(editor.document.objects[editor.selected])) && event.pointerType !== "mouse") scheduleLongPress(point);
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
    if (editor.activePointers.has(event.pointerId)) editor.activePointers.set(event.pointerId, point);
    $d("#drawingCoordinates").textContent = `${fmt(point.x)}, ${fmt(point.y)} mm`;
    const gesture = editor.gesture; if (!gesture) return;
    event.preventDefault();
    if (gesture.type === "pinch") {
      const scale=twoPointerDistance()/gesture.startDistance;
      editor.document.objects[editor.selected]=isVectorObject(gesture.original)?{...clone(gesture.original),scale:clamp(gesture.original.scale*scale,.01,50)}:{...clone(gesture.original),fontSize:clamp(gesture.original.fontSize*scale,1,500)};
      gesture.changed=Math.abs(scale-1)>.01;clearLongPress();
    } else if (gesture.type === "rotate") {
      const angle=Math.atan2(point.y-gesture.center.y,point.x-gesture.center.x),delta=(angle-gesture.startAngle)*180/Math.PI;
      editor.document.objects[editor.selected]={...clone(gesture.original),rotation:normalizeAngle(gesture.original.rotation+delta)};gesture.changed=Math.abs(delta)>.2;
    } else if (gesture.type === "erase") {
      editor.eraserPoint = point;
      gesture.changed = eraseAlongStroke(gesture.last, point) || gesture.changed;
      gesture.last = point;
    } else if (gesture.type === "move") {
      const dx = point.x - gesture.start.x, dy = point.y - gesture.start.y;
      editor.document.objects[editor.selected] = translateObject(gesture.original, dx, dy);
      gesture.changed = Math.hypot(dx, dy) > 0.01;
      if (gesture.changed) clearLongPress();
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
    clearLongPress();editor.activePointers.delete(event.pointerId);
    const gesture = editor.gesture; if (!gesture) return;
    event.preventDefault();
    if (gesture.type === "pinch") {
      if (gesture.changed) commit(isVectorObject(gesture.original)?"SVG素材拡大縮小":"テキスト拡大縮小");
    } else if (gesture.type === "rotate") {
      if (gesture.changed) commit("スタンプ回転");
    } else if (gesture.type === "erase") {
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
    clearLongPress();editor.activePointers.clear();
    if (editor.gesture?.type === "move") editor.document.objects[editor.selected] = editor.gesture.original;
    if (editor.gesture?.type === "pinch") editor.document.objects[editor.selected] = editor.gesture.original;
    if (editor.gesture?.type === "rotate") editor.document.objects[editor.selected] = editor.gesture.original;
    if (editor.gesture?.type === "erase") editor.document.objects = editor.gesture.before;
    editor.gesture = null; renderDrawing();
  }

  function twoPointerDistance(){const points=[...editor.activePointers.values()];return points.length<2?0:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);}
  function scheduleLongPress(point){clearLongPress();editor.longPressTimer=setTimeout(()=>{const object=editor.document.objects[editor.selected];if((object?.type==="text"||isVectorObject(object))&&!editor.gesture?.changed)openSelectedProperties();},650);}
  function clearLongPress(){if(editor.longPressTimer){clearTimeout(editor.longPressTimer);editor.longPressTimer=null;}}
  function drawingContextMenu(event){const index=findNearestObject(eventPoint(event)),object=editor.document.objects[index];if(!(object?.type==="text"||isVectorObject(object)))return;event.preventDefault();editor.selected=index;renderDrawing();openSelectedProperties();}

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
      const selectedObject=editor.document.objects[editor.selected],b = objectBounds(selectedObject), pad = Math.max(c.widthMm, c.heightMm) * .008;
      svg.insertAdjacentHTML("beforeend", `<rect class="drawing-selection" x="${b.x-pad}" y="${b.y-pad}" width="${b.width+2*pad}" height="${b.height+2*pad}"/>`);
      if(isVectorObject(selectedObject)){
        const handle=rotationHandlePoint(selectedObject),top={x:b.x+b.width/2,y:b.y-pad};
        svg.insertAdjacentHTML("beforeend",`<line class="stamp-rotation-line" x1="${fmt(top.x)}" y1="${fmt(top.y)}" x2="${fmt(handle.x)}" y2="${fmt(handle.y)}"/><circle class="stamp-rotation-handle" cx="${fmt(handle.x)}" cy="${fmt(handle.y)}" r="${fmt(Math.max(pad*1.8,.8))}"/>`);
      }
    }
    if (editor.tool === "eraser" && editor.eraserPoint) {
      svg.insertAdjacentHTML("beforeend", `<circle class="drawing-eraser-cursor" cx="${fmt(editor.eraserPoint.x)}" cy="${fmt(editor.eraserPoint.y)}" r="${fmt(eraserRadius())}"/>`);
    }
    $d("#drawingObjectCount").textContent = `${editor.document.objects.length}オブジェクト`;
    $d("#drawingUndo").disabled = editor.history.length <= 1; $d("#drawingRedo").disabled = !editor.future.length;
    $d("#drawingDelete").disabled = editor.selected < 0;
    const selectedObject=editor.document.objects[editor.selected];$d("#drawingProperties").hidden = !(selectedObject?.type==="text"||isVectorObject(selectedObject));
    ["#drawingDuplicate","#drawingToFront","#drawingToBack"].forEach(selector=>$d(selector).disabled=editor.selected<0);
    updateCanvasFit(); persistLast();
  }

  function objectMarkup(object, selected) {
    const cls = `drawing-object${selected ? " selected" : ""}`;
    if (object.type === "freehand") return `<polyline class="${cls}" points="${object.points.map(p => `${fmt(p[0])},${fmt(p[1])}`).join(" ")}"/>`;
    if (object.type === "rect") return `<rect class="${cls}" x="${fmt(object.x)}" y="${fmt(object.y)}" width="${fmt(object.width)}" height="${fmt(object.height)}"/>`;
    if (object.type === "circle") return `<circle class="${cls}" cx="${fmt(object.cx)}" cy="${fmt(object.cy)}" r="${fmt(object.r)}"/>`;
    if (object.type === "star") return `<polygon class="${cls}" points="${starPoints(object).map(p => `${fmt(p[0])},${fmt(p[1])}`).join(" ")}"/>`;
    if (object.type === "text") return `<path class="${cls}" d="${contoursToPathData(textObjectContours(object))}"/>`;
    if (isVectorObject(object)) return vectorObjectMarkup(object,selected);
    return "";
  }
  function isVectorObject(object){return !!object&&["stamp","svgObject"].includes(object.type);}
  function vectorAsset(object){if(object?.type==="stamp")return stampAssets.get(object.stampId);if(object?.type==="svgObject")return{markup:object.markup,presentation:object.presentation||{},viewBox:object.viewBox,defaultWidthMm:object.widthMm,defaultHeightMm:object.heightMm,name:object.name};return null;}
  function vectorObjectMarkup(object,selected=false){
    const asset=vectorAsset(object);if(!asset)return"";
    return `<g class="stamp-visual${selected?" selected":""}" ${presentationAttributes(asset.presentation)} transform="${stampTransform(object,asset)}">${asset.markup}</g>`;
  }
  function stampTransform(object,asset){
    const sx=asset.defaultWidthMm/asset.viewBox.width,sy=asset.defaultHeightMm/asset.viewBox.height,flipX=object.flipX?-1:1,flipY=object.flipY?-1:1;
    return `translate(${fmt(object.x)} ${fmt(object.y)}) rotate(${fmt(object.rotation||0)}) scale(${fmt(object.scale*flipX)} ${fmt(object.scale*flipY)}) translate(${fmt(-asset.defaultWidthMm/2)} ${fmt(-asset.defaultHeightMm/2)}) scale(${fmt(sx)} ${fmt(sy)}) translate(${fmt(-asset.viewBox.x)} ${fmt(-asset.viewBox.y)})`;
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
  function duplicateSelected(){if(editor.selected<0)return;const copy=translateObject(editor.document.objects[editor.selected],Math.max(.8,editor.document.canvas.widthMm*.02),Math.max(.8,editor.document.canvas.heightMm*.02));editor.document.objects.splice(editor.selected+1,0,copy);editor.selected++;commit("複製");renderDrawing();}
  function bringSelectedToFront(){if(editor.selected<0||editor.selected===editor.document.objects.length-1)return;const [object]=editor.document.objects.splice(editor.selected,1);editor.document.objects.push(object);editor.selected=editor.document.objects.length-1;commit("最前面へ移動");renderDrawing();}
  function sendSelectedToBack(){if(editor.selected<=0)return;const [object]=editor.document.objects.splice(editor.selected,1);editor.document.objects.unshift(object);editor.selected=0;commit("最背面へ移動");renderDrawing();}
  function clearDrawing() { if (!editor.document.objects.length || !confirm("描画内容をすべて消去しますか？")) return; editor.document.objects = []; editor.selected = -1; commit("全消去"); renderDrawing(); }

  function openSelectedProperties(){const object=editor.document.objects[editor.selected];if(object?.type==="text")openTextProperties();if(isVectorObject(object))openStampProperties();}
  function openDialog(dialog){if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");}
  function closeDialog(dialog){if(typeof dialog.close==="function"&&dialog.open)dialog.close();else dialog.removeAttribute("open");}

  function openTextProperties() {
    const object=editor.document.objects[editor.selected];if(object?.type!=="text")return;
    $d("#textFontSize").value=object.fontSize;$d("#textLetterSpacing").value=object.letterSpacing;$d("#textLineHeight").value=object.lineHeight;$d("#textWritingMode").value=object.writingMode;$d("#textRotation").value=object.rotation;
    openDialog($d("#textPropertiesDialog"));
  }
  function closeTextProperties(){closeDialog($d("#textPropertiesDialog"));}
  function applyTextProperties() {
    const object=editor.document.objects[editor.selected];if(object?.type!=="text")return closeTextProperties();
    object.fontSize=clamp(+$d("#textFontSize").value||object.fontSize,1,500);object.letterSpacing=clamp(+$d("#textLetterSpacing").value||0,-20,100);object.lineHeight=clamp(+$d("#textLineHeight").value||1.2,.5,5);object.writingMode=$d("#textWritingMode").value;object.rotation=clamp(+$d("#textRotation").value||0,-360,360);object.renderMode="outline";
    commit("文字プロパティ変更");closeTextProperties();renderDrawing();
  }
  function openStampProperties(){
    const object=editor.document.objects[editor.selected];if(!isVectorObject(object))return;
    const asset=vectorAsset(object);$d("#stampPropertiesName").textContent=asset?.name||object.stampId||object.name||"SVG素材";
    $d("#stampScale").value=fmt(object.scale);$d("#stampRotation").value=fmt(object.rotation);$d("#stampFlipX").checked=!!object.flipX;$d("#stampFlipY").checked=!!object.flipY;openDialog($d("#stampPropertiesDialog"));
  }
  function closeStampProperties(){closeDialog($d("#stampPropertiesDialog"));}
  function applyStampProperties(){
    const object=editor.document.objects[editor.selected];if(!isVectorObject(object))return closeStampProperties();
    object.scale=clamp(+$d("#stampScale").value||object.scale,.01,50);object.rotation=normalizeAngle(+$d("#stampRotation").value||0);object.flipX=$d("#stampFlipX").checked;object.flipY=$d("#stampFlipY").checked;
    commit("SVG素材プロパティ変更");closeStampProperties();renderDrawing();
  }
  function bringStampToFront(){bringSelectedToFront();}
  function sendStampToBack(){sendSelectedToBack();}

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
    if (object.type === "text") return `<path d="${contoursToPathData(textObjectContours(object))}"/>`;
    if (isVectorObject(object)) return vectorObjectMarkup(object,false);
    return `<polygon points="${starPoints(object).map(p => `${fmt(p[0])},${fmt(p[1])}`).join(" ")}"/>`;
  }
  function generateDrawingGcode() {
    if (!editor.document.objects.length) return setStatus("先に図形を描いてください。", true);
    if (editor.document.objects.some(object=>object.type==="text")&&!editor.fontReady) return setStatus("フォントを読み込み中です。",true);
    if (editor.document.objects.some(object=>isVectorObject(object)&&!vectorAsset(object))) return setStatus("SVG素材を読み込み中、または素材が見つかりません。",true);
    const paths = objectsToPaths(editor.document.objects); const name = ensureJsonName($d("#drawingName").value || editor.name);
    window.PlotterFlow.generateFromPaths(paths, name); setStatus(`${paths.length}パスをG-codeへ変換しました。`);
  }
  function objectsToPaths(objects) {
    const interval = Math.max(.05, +(window.PlotterFlow.getSettings().sampleInterval || .5));
    return objects.flatMap(object => {
      if (object.type === "freehand") return [object.points.map(p => ({ x: p[0], y: p[1] }))];
      if (object.type === "rect") return [[[object.x,object.y],[object.x+object.width,object.y],[object.x+object.width,object.y+object.height],[object.x,object.y+object.height],[object.x,object.y]].map(p => ({x:p[0],y:p[1]}))];
      if (object.type === "star") return [[...starPoints(object), starPoints(object)[0]].map(p => ({x:p[0],y:p[1]}))];
      if (object.type === "text") return textObjectContours(object,interval).map(contour=>contour.map(p=>({x:p[0],y:p[1]})));
      if (isVectorObject(object)) return stampObjectPaths(object,interval).map(path=>path.map(p=>({x:p[0],y:p[1]})));
      const count = Math.max(16, Math.ceil(2 * Math.PI * object.r / interval));
      return [Array.from({ length: count + 1 }, (_, i) => ({ x: object.cx + Math.cos(i/count*2*Math.PI) * object.r, y: object.cy + Math.sin(i/count*2*Math.PI) * object.r }))];
    }).filter(path => path.length >= 2);
  }

  function eraserRadius() { return clamp(+$d("#drawingEraserSize").value || 2, .2, 100) / 2; }
  function eraseAlongStroke(from, to) {
    const radius = eraserRadius(), step = Math.max(.04, radius / 3); let changed = false; const next = [];
    for (const object of editor.document.objects) {
      if(isVectorObject(object)){next.push(object);continue;}
      const sources = objectAsPolylines(object, step);
      const touched = sources.some(source=>source.points.some(point => distanceToSegment({ x: point[0], y: point[1] }, from, to) <= radius));
      if (!touched) { next.push(object); continue; }
      changed = true;
      sources.forEach(source=>splitPolylineOutsideStroke(source.points,from,to,radius,source.closed).forEach(points=>next.push({type:"freehand",points})));
    }
    if (changed) editor.document.objects = next;
    return changed;
  }
  function objectAsPolylines(object, step) {
    if (object.type === "freehand") return [{ points: resamplePolyline(object.points, step), closed: false }];
    if (object.type === "rect") return [{ points: resamplePolyline([[object.x,object.y],[object.x+object.width,object.y],[object.x+object.width,object.y+object.height],[object.x,object.y+object.height],[object.x,object.y]], step), closed: true }];
    if (object.type === "star") { const points=starPoints(object);points.push(points[0]);return [{ points:resamplePolyline(points,step),closed:true }]; }
    if (object.type === "text") return textObjectContours(object,step).map(points=>({points:resamplePolyline(points,step),closed:true}));
    if (isVectorObject(object)) return stampObjectPaths(object,step).map(points=>({points:resamplePolyline(points,step),closed:Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<.01}));
    const count=Math.max(24,Math.ceil(2*Math.PI*object.r/step));
    return [{ points:Array.from({length:count+1},(_,i)=>[object.cx+Math.cos(i/count*2*Math.PI)*object.r,object.cy+Math.sin(i/count*2*Math.PI)*object.r]),closed:true }];
  }
  function resamplePolyline(points, step) {
    const result=[clone(points[0])];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],distance=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.max(1,Math.ceil(distance/step));
      for(let j=1;j<=count;j++)result.push([a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count]);
    }
    return result;
  }
  function stampObjectPaths(object,interval=.5){
    const asset=vectorAsset(object);if(!asset)return[];
    const host=document.createElementNS(svgNS,"svg");host.setAttribute("viewBox",`${asset.viewBox.x} ${asset.viewBox.y} ${asset.viewBox.width} ${asset.viewBox.height}`);host.style.cssText="position:fixed;left:-10000px;top:-10000px;width:400px;height:400px;visibility:hidden";host.innerHTML=asset.markup;document.body.append(host);
    const rootCtm=host.getScreenCTM(),sx=asset.defaultWidthMm/asset.viewBox.width,sy=asset.defaultHeightMm/asset.viewBox.height,paths=[];
    host.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse").forEach(element=>{
      let length;try{length=element.getTotalLength();}catch{return;}if(!Number.isFinite(length)||length<=0)return;
      const elementCtm=element.getScreenCTM();if(!rootCtm||!elementCtm)return;const relative=rootCtm.inverse().multiply(elementCtm),localScale=Math.max(Math.hypot(relative.a,relative.b)*sx,Math.hypot(relative.c,relative.d)*sy)*object.scale;
      const count=Math.max(1,Math.ceil(length*localScale/Math.max(.04,interval))),splitDistance=Math.max(.12,interval*2.5);let points=[];
      for(let i=0;i<=count;i++){
        const raw=element.getPointAtLength(length*i/count),q=new DOMPoint(raw.x,raw.y).matrixTransform(relative);
        const point=transformStampPoint(object,[(q.x-asset.viewBox.x)*sx-asset.defaultWidthMm/2,(q.y-asset.viewBox.y)*sy-asset.defaultHeightMm/2]);
        if(points.length&&Math.hypot(point[0]-points.at(-1)[0],point[1]-points.at(-1)[1])>splitDistance){if(points.length>=2)paths.push(points);points=[];}points.push(point);
      }
      if(points.length>=2)paths.push(points);
    });
    host.remove();return paths;
  }
  function transformStampPoint(object,point){
    const x=point[0]*object.scale*(object.flipX?-1:1),y=point[1]*object.scale*(object.flipY?-1:1),angle=(object.rotation||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
    return[object.x+x*cos-y*sin,object.y+x*sin+y*cos];
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
    if (object.type === "text") { const b=objectBounds(object);if(point.x>=b.x&&point.x<=b.x+b.width&&point.y>=b.y&&point.y<=b.y+b.height)return 0;return Math.min(...textObjectContours(object).map(points=>distanceToPointList(point,points)),Infinity); }
    if (isVectorObject(object)) { const b=objectBounds(object);if(point.x>=b.x&&point.x<=b.x+b.width&&point.y>=b.y&&point.y<=b.y+b.height)return 0;return Math.min(Math.abs(point.x-b.x),Math.abs(point.x-b.x-b.width),Math.abs(point.y-b.y),Math.abs(point.y-b.y-b.height)); }
    let points;
    if (object.type === "freehand") points = object.points;
    if (object.type === "rect") points = [[object.x,object.y],[object.x+object.width,object.y],[object.x+object.width,object.y+object.height],[object.x,object.y+object.height],[object.x,object.y]];
    if (object.type === "star") { points = starPoints(object); points.push(points[0]); }
    let distance = Infinity; for (let i=1;i<points.length;i++) distance=Math.min(distance,distanceToSegment(point,{x:points[i-1][0],y:points[i-1][1]},{x:points[i][0],y:points[i][1]})); return distance;
  }
  function distanceToPointList(point,points){let distance=Infinity;for(let i=1;i<points.length;i++)distance=Math.min(distance,distanceToSegment(point,{x:points[i-1][0],y:points[i-1][1]},{x:points[i][0],y:points[i][1]}));return distance;}
  function distanceToSegment(p, a, b) { const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(!l2)return Math.hypot(p.x-a.x,p.y-a.y);const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/l2,0,1);return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy)); }
  function translateObject(object, dx, dy) { const result=clone(object);if(result.type==="freehand")result.points=result.points.map(p=>[p[0]+dx,p[1]+dy]);else if(result.type==="rect"){result.x+=dx;result.y+=dy;}else if(result.type==="text"||isVectorObject(result)){result.x+=dx;result.y+=dy;}else{result.cx+=dx;result.cy+=dy;}return result; }
  function objectBounds(object) {
    let points;if(object.type==="freehand")points=object.points;else if(object.type==="rect")points=[[object.x,object.y],[object.x+object.width,object.y+object.height]];else if(object.type==="text")points=textObjectContours(object).flat();else if(isVectorObject(object)){
      const asset=vectorAsset(object),w=(asset?.defaultWidthMm||30)/2,h=(asset?.defaultHeightMm||30)/2;points=[[-w,-h],[w,-h],[w,h],[-w,h]].map(point=>transformStampPoint(object,point));
    }else points=[[object.cx-object.r,object.cy-object.r],[object.cx+object.r,object.cy+object.r]];
    if(!points.length)return{x:object.x||0,y:object.y||0,width:0,height:0};const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
  }
  function rotationHandlePoint(object){const b=objectBounds(object),c=editor.document.canvas;return{x:b.x+b.width/2,y:b.y-Math.max(2,Math.max(c.widthMm,c.heightMm)*.035)};}
  function pointNearRotationHandle(point,object){const handle=rotationHandlePoint(object),svg=$d("#drawingCanvas"),rect=svg.getBoundingClientRect(),c=editor.document.canvas,threshold=Math.max(c.widthMm/Math.max(1,rect.width),c.heightMm/Math.max(1,rect.height))*18;return Math.hypot(point.x-handle.x,point.y-handle.y)<=threshold;}
  function starPoints(object) { const points=[];for(let i=0;i<object.vertices*2;i++){const radius=i%2?object.r*.45:object.r,angle=-Math.PI/2+i*Math.PI/object.vertices;points.push([object.cx+Math.cos(angle)*radius,object.cy+Math.sin(angle)*radius]);}return points; }

  function textObjectContours(object,tolerance) {
    if(!editor.fontReady||!object.text)return[];
    const sample=Math.max(.04,tolerance??Math.min(.25,+window.PlotterFlow.getSettings().sampleInterval||.5));
    const key=JSON.stringify([object.text,object.fontSize,object.letterSpacing,object.lineHeight,object.writingMode,object.renderMode,sample]);
    let raw=textContourCache.get(key);
    if(!raw){raw=buildRawTextContours(object,sample);textContourCache.set(key,raw);if(textContourCache.size>100)textContourCache.delete(textContourCache.keys().next().value);}
    const angle=(object.rotation||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
    return raw.map(contour=>contour.map(point=>[object.x+point[0]*cos-point[1]*sin,object.y+point[0]*sin+point[1]*cos]));
  }
  function buildRawTextContours(object,tolerance) {
    const commands=[],font=editor.font,size=object.fontSize,spacing=object.letterSpacing,units=font.unitsPerEm||1000,lines=object.text.split("\n");
    if(object.writingMode==="vertical"){
      lines.forEach((line,column)=>{let cursorY=0;const x=-column*size*object.lineHeight;for(const char of [...line]){const glyph=font.charToGlyph(char),advance=(glyph.advanceWidth||units)*size/units;commands.push(...glyph.getPath(x-advance/2,cursorY+size,size).commands);cursorY+=size+spacing;}});
    }else{
      lines.forEach((line,row)=>{let cursorX=0,baseline=row*size*object.lineHeight;for(const char of [...line]){const glyph=font.charToGlyph(char);commands.push(...glyph.getPath(cursorX,baseline,size).commands);cursorX+=(glyph.advanceWidth||units)*size/units+spacing;}});
    }
    const contours=flattenPathCommands(commands,tolerance);const points=contours.flat();if(!points.length)return[];
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
    return contours.map(contour=>contour.map(point=>[point[0]-cx,point[1]-cy]));
  }
  function flattenPathCommands(commands,tolerance) {
    const contours=[];let contour=[],current=[0,0],start=[0,0];
    const finish=closed=>{if(closed&&contour.length&&Math.hypot(contour[0][0]-contour.at(-1)[0],contour[0][1]-contour.at(-1)[1])>.0001)contour.push([...contour[0]]);if(contour.length>=2)contours.push(contour);contour=[];};
    for(const command of commands){const type=command.type.toUpperCase();
      if(type==="M"){finish(false);current=[command.x,command.y];start=[...current];contour.push([...current]);}
      else if(type==="L"){current=[command.x,command.y];contour.push([...current]);}
      else if(type==="Q"){const p0=[...current],p1=[command.x1,command.y1],p2=[command.x,command.y],length=Math.hypot(p1[0]-p0[0],p1[1]-p0[1])+Math.hypot(p2[0]-p1[0],p2[1]-p1[1]),count=clamp(Math.ceil(length/tolerance),2,120);for(let i=1;i<=count;i++){const t=i/count,u=1-t;contour.push([u*u*p0[0]+2*u*t*p1[0]+t*t*p2[0],u*u*p0[1]+2*u*t*p1[1]+t*t*p2[1]]);}current=p2;}
      else if(type==="C"){const p0=[...current],p1=[command.x1,command.y1],p2=[command.x2,command.y2],p3=[command.x,command.y],length=Math.hypot(p1[0]-p0[0],p1[1]-p0[1])+Math.hypot(p2[0]-p1[0],p2[1]-p1[1])+Math.hypot(p3[0]-p2[0],p3[1]-p2[1]),count=clamp(Math.ceil(length/tolerance),2,160);for(let i=1;i<=count;i++){const t=i/count,u=1-t;contour.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}current=p3;}
      else if(type==="Z"){current=[...start];finish(true);}
    }finish(false);return contours;
  }
  function contoursToPathData(contours){return contours.map(contour=>contour.length?`M${fmt(contour[0][0])} ${fmt(contour[0][1])}${contour.slice(1).map(point=>`L${fmt(point[0])} ${fmt(point[1])}`).join("")}Z`:"").join("");}

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
    if (!object || !["freehand","rect","circle","star","text","stamp","svgObject"].includes(object.type)) throw new Error("未対応のオブジェクトがあります");
    if(object.type==="freehand"){if(!Array.isArray(object.points)||object.points.length<2)throw new Error("自由線の点列が不正です");return{type:"freehand",points:object.points.map(p=>[finite(p[0]),finite(p[1])])};}
    if(object.type==="rect")return{type:"rect",x:finite(object.x),y:finite(object.y),width:Math.abs(finite(object.width)),height:Math.abs(finite(object.height))};
    if(object.type==="circle")return{type:"circle",cx:finite(object.cx),cy:finite(object.cy),r:Math.abs(finite(object.r))};
    if(object.type==="text")return{type:"text",text:String(object.text||""),x:finite(object.x),y:finite(object.y),fontSize:clamp(Math.abs(finite(object.fontSize||6)),1,500),letterSpacing:clamp(finite(object.letterSpacing||0),-20,100),lineHeight:clamp(finite(object.lineHeight||1.2),.5,5),writingMode:object.writingMode==="vertical"?"vertical":"horizontal",rotation:clamp(finite(object.rotation||0),-360,360),renderMode:object.renderMode==="singleline"?"singleline":"outline"};
    if(object.type==="stamp")return{type:"stamp",stampId:String(object.stampId||""),x:finite(object.x),y:finite(object.y),scale:clamp(Math.abs(finite(object.scale??1)),.05,50),rotation:normalizeAngle(finite(object.rotation||0)),flipX:!!object.flipX,flipY:!!object.flipY};
    if(object.type==="svgObject")return normalizeSvgObject(object);
    return{type:"star",cx:finite(object.cx),cy:finite(object.cy),r:Math.abs(finite(object.r)),vertices:clamp(Math.round(finite(object.vertices||5)),3,24)};
  }
  function normalizeSvgObject(object){
    const sourceViewBox=object.viewBox||{},viewBox={x:finite(sourceViewBox.x??0),y:finite(sourceViewBox.y??0),width:Math.max(.001,Math.abs(finite(sourceViewBox.width||100))),height:Math.max(.001,Math.abs(finite(sourceViewBox.height||100)))};
    const parsed=parseStampSvg(`<svg xmlns="${svgNS}" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}">${String(object.markup||"")}</svg>`),presentation={};
    Object.entries(object.presentation||{}).forEach(([name,value])=>{if(["fill","stroke","stroke-linecap","stroke-linejoin","stroke-dasharray"].includes(name))presentation[name]=sanitizePresentationValue(value);});
    return{type:"svgObject",name:String(object.name||"imported.svg"),x:finite(object.x),y:finite(object.y),scale:clamp(Math.abs(finite(object.scale??1)),.01,50),rotation:normalizeAngle(finite(object.rotation||0)),flipX:!!object.flipX,flipY:!!object.flipY,widthMm:Math.max(.01,Math.abs(finite(object.widthMm||30))),heightMm:Math.max(.01,Math.abs(finite(object.heightMm||30))),viewBox:parsed.viewBox,markup:parsed.markup,presentation};
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
  function normalizeAngle(value){let angle=(+value||0)%360;if(angle>180)angle-=360;if(angle<=-180)angle+=360;return angle;}
  function fmt(value){return Number((+value).toFixed(3)).toString();}

  document.addEventListener("DOMContentLoaded", initDrawing);
})();
