import * as THREE from "./vendor/three/three.module.min.js";
import { OrbitControls } from "./vendor/three/addons/controls/OrbitControls.js";
import { STLLoader } from "./vendor/three/addons/loaders/STLLoader.js";

const viewport = document.querySelector("#plotter3dViewport");
const controlsUi = {
  x: document.querySelector("#simulationX"),
  y: document.querySelector("#simulationY"),
  z: document.querySelector("#simulationZ"),
  speed: document.querySelector("#simulationSpeed"),
  xValue: document.querySelector("#simulationXValue"),
  yValue: document.querySelector("#simulationYValue"),
  zValue: document.querySelector("#simulationZValue"),
  play: document.querySelector("#simulationPlay"),
  stop: document.querySelector("#simulationStop"),
  reload: document.querySelector("#simulationReload"),
  paperReset: document.querySelector("#simulationPaperReset"),
  resetView: document.querySelector("#simulationResetView"),
  progress: document.querySelector("#simulationProgress"),
  progressText: document.querySelector("#simulationProgressText"),
  loadRow: document.querySelector("#simulationLoadRow"),
  loadProgress: document.querySelector("#simulationLoadProgress"),
  loadText: document.querySelector("#simulationLoadText"),
  status: document.querySelector("#simulationModelStatus")
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9eef0);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x526268, 2.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(130, -110, 180);
keyLight.castShadow = true;
scene.add(keyLight);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.07;
orbit.target.set(55, 10, 35);

const grid = new THREE.GridHelper(260, 26, 0x98a5aa, 0xcbd3d6);
grid.rotation.x = Math.PI / 2;
grid.position.set(55, 5, -28);
scene.add(grid);

const modelRoot = new THREE.Group();
scene.add(modelRoot);
const inkGroup = new THREE.Group();
modelRoot.add(inkGroup);
const stlLoader = new STLLoader();
const meshes = new Map();
const motionGroups = { x: new Set(), y: new Set(), z: new Set() };
const groupColors = { fixed: 0x78858b, x: 0x1976a3, y: 0xcf7a22, z: 0xb33d5c };
let playback = null;
let trail = null;
let modelBounds = null;
let paperConfig = null;
let paperExtension = null;
let paperRoll = null;
let paperLength = 0;
let paperBaseLength = 0;
let paperTravelY = 0;
let reloadAnimation = null;
let lockAmount = 0;
let penHome = { x: 56.8, y: -25.9 };
let penOriginX = 8.4;
const machinePosition = { x: 0, y: 0, z: 0 };

function resize() {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function resetView() {
  if (!modelBounds) {
    camera.position.set(250, -320, 240);
    orbit.target.set(55, 10, 35);
    orbit.update();
    return;
  }
  const center = modelBounds.getCenter(new THREE.Vector3());
  const size = modelBounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  const distance = maxDimension / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.85;
  const direction = new THREE.Vector3(1, -1.45, 0.9).normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(0.1, distance / 1000);
  camera.far = distance * 10;
  camera.updateProjectionMatrix();
  orbit.target.copy(center);
  orbit.update();
}

function roleFor(path) {
  if (motionGroups.z.has(path)) return "z";
  if (motionGroups.x.has(path)) return "x";
  if (motionGroups.y.has(path)) return "y";
  return "fixed";
}

function addProxyOccurrence(occurrence) {
  if (!occurrence.boundingBoxCm) return;
  const min = occurrence.boundingBoxCm.minCm.map(value => value * 10);
  const max = occurrence.boundingBoxCm.maxCm.map(value => value * 10);
  const size = max.map((value, index) => Math.max(0.8, value - min[index]));
  const center = max.map((value, index) => (value + min[index]) / 2);
  const role = roleFor(occurrence.fullPathName);
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const material = new THREE.MeshStandardMaterial({
    color: groupColors[role],
    transparent: true,
    opacity: occurrence.isVisible ? (role === "fixed" ? 0.22 : 0.58) : 0.06,
    roughness: 0.72,
    metalness: 0.08
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(center[0], center[1], center[2]);
  mesh.userData = { basePosition: mesh.position.clone(), baseQuaternion: mesh.quaternion.clone(), role, name: occurrence.fullPathName };
  mesh.castShadow = occurrence.isVisible;
  mesh.receiveShadow = true;
  modelRoot.add(mesh);
  meshes.set(occurrence.fullPathName, mesh);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x26363c, transparent: true, opacity: occurrence.isVisible ? 0.28 : 0.08 })
  );
  mesh.add(edges);
}

function occurrenceMatrix(values) {
  return new THREE.Matrix4().set(
    values[0], values[1], values[2], values[3] * 10,
    values[4], values[5], values[6], values[7] * 10,
    values[8], values[9], values[10], values[11] * 10,
    values[12], values[13], values[14], values[15]
  );
}

function addMeshOccurrence(item, occurrence, geometry, worldMatrix) {
  const role = roleFor(item.fullPathName);
  const isPaper = item.fullPathName === paperConfig?.rollOccurrence;
  const isLock = item.fullPathName === paperConfig?.lockOccurrence;
  if (isPaper) {
    geometry.dispose();
    return;
  }
  geometry.applyMatrix4(worldMatrix);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: isLock ? 0x455a61 : groupColors[role],
    transparent: true,
    opacity: isLock ? 1 : role === "fixed" ? 0.78 : 0.92,
    roughness: isLock ? 0.78 : 0.62,
    metalness: isLock ? 0.02 : 0.08,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = { basePosition: new THREE.Vector3(), baseQuaternion: mesh.quaternion.clone(), role, name: item.fullPathName };
  mesh.castShadow = !isLock;
  mesh.receiveShadow = true;
  modelRoot.add(mesh);
  meshes.set(item.fullPathName, mesh);
}

function createPaperExtension(config) {
  const width = config.widthMaxXmm - config.widthMinXmm;
  const material = new THREE.MeshStandardMaterial({ color: 0xf3f1e8, roughness: 0.92, metalness: 0 });
  paperExtension = new THREE.Mesh(new THREE.BoxGeometry(width, 1, config.thicknessMm), material);
  paperExtension.castShadow = true;
  paperExtension.receiveShadow = true;
  modelRoot.add(paperExtension);
  paperRoll = new THREE.Mesh(
    new THREE.CylinderGeometry(config.rollRadiusMm, config.rollRadiusMm, config.rollWidthMm, 64),
    material.clone()
  );
  paperRoll.rotation.z = Math.PI / 2;
  paperRoll.position.set(...config.rollCenterMm);
  paperRoll.castShadow = true;
  paperRoll.receiveShadow = true;
  modelRoot.add(paperRoll);
  paperBaseLength = config.defaultLengthMm || 0;
  setPaperLength(paperBaseLength);
}

function setPaperLength(length) {
  if (!paperExtension || !paperConfig) return;
  paperLength = Math.max(0, Math.min(paperConfig.maxExtensionMm, length));
  updatePaperMesh(paperLength);
}

function updatePaperMesh(length) {
  if (!paperExtension || !paperConfig) return;
  const displayedLength = Math.max(0, Math.min(paperConfig.maxExtensionMm, length));
  const frontY = paperConfig.frontEdgeYmm - displayedLength;
  const visibleLength = paperConfig.sheetBackEdgeYmm - frontY;
  paperExtension.visible = true;
  paperExtension.scale.set(1, Math.max(0.001, visibleLength), 1);
  paperExtension.position.set(
    (paperConfig.widthMinXmm + paperConfig.widthMaxXmm) / 2,
    (paperConfig.sheetBackEdgeYmm + frontY) / 2,
    paperConfig.topZmm - paperConfig.thicknessMm / 2 + 0.08
  );
}

function fedPaperLength() {
  return Math.max(0, paperLength - paperBaseLength);
}

function parseReloadSegments(code, startPosition = { x: 0, y: 0 }) {
  let position = { ...startPosition }, absolute = true, feed = 500;
  const segments = [];
  for (const raw of String(code || "").split(/\r?\n/)) {
    const line = raw.replace(/;.*|\([^)]*\)/g, "").trim().toUpperCase();
    if (/\bG90\b/.test(line)) absolute = true;
    if (/\bG91\b/.test(line)) absolute = false;
    const feedMatch = line.match(/\bF(-?\d*\.?\d+)/);
    if (feedMatch && +feedMatch[1] > 0) feed = +feedMatch[1];
    if (!/\bG0?1\b/.test(line)) continue;
    const xMatch = line.match(/\bX(-?\d*\.?\d+)/), yMatch = line.match(/\bY(-?\d*\.?\d+)/);
    if (!xMatch && !yMatch) continue;
    const to = {
      x: xMatch ? (absolute ? +xMatch[1] : position.x + +xMatch[1]) : position.x,
      y: yMatch ? (absolute ? +yMatch[1] : position.y + +yMatch[1]) : position.y
    };
    const distance = Math.hypot(to.x - position.x, to.y - position.y);
    segments.push({ from: { ...position }, to, durationMs: Math.max(180, distance / feed * 60000) });
    position = to;
  }
  return segments;
}

function startPaperReload(code) {
  if (!paperExtension || reloadAnimation) return;
  if (playback) stopPlayback();
  const segments = parseReloadSegments(code, machinePosition);
  if (!segments.length) return;
  reloadAnimation = {
    segments,
    index: 0,
    segmentStartedAt: performance.now(),
    initialLength: paperLength,
    initialPaperY: paperTravelY,
    fedBeforeSegment: 0,
    lockTransition: null
  };
  controlsUi.reload.disabled = true;
  controlsUi.paperReset.disabled = true;
  controlsUi.progress.value = 0;
  controlsUi.progressText.textContent = "リロード 0%";
}

function resetPaper() {
  reloadAnimation = null;
  lockAmount = 0;
  controlsUi.reload.disabled = false;
  controlsUi.paperReset.disabled = false;
  setPaperLength(paperBaseLength);
  applyPosition(machinePosition.x, 0, machinePosition.z, 0);
  controlsUi.progress.value = 0;
  controlsUi.progressText.textContent = "紙送り 0 mm";
}

function updatePaper(now) {
  if (!reloadAnimation) return;
  if (reloadAnimation.lockTransition) {
    const transition = reloadAnimation.lockTransition;
    const ratio = Math.min(1, (now - transition.startedAt) / transition.durationMs);
    lockAmount = transition.from + (transition.to - transition.from) * ratio;
    applyPosition(transition.x, transition.y, machinePosition.z, reloadAnimation.initialPaperY + reloadAnimation.fedBeforeSegment);
    controlsUi.progressText.textContent = transition.to > transition.from ? "バー下降・紙を保持" : "バー上昇・紙を解放";
    if (ratio < 1) return;
    lockAmount = transition.to;
    reloadAnimation.lockTransition = null;
    reloadAnimation.segmentStartedAt = now;
    return;
  }
  const segment = reloadAnimation.segments[reloadAnimation.index];
  const ratio = Math.min(1, (now - reloadAnimation.segmentStartedAt) / segment.durationMs);
  const dx = segment.to.x - segment.from.x, dy = segment.to.y - segment.from.y;
  const x = segment.from.x + dx * ratio, y = segment.from.y + dy * ratio;
  const followsPaper = dy >= 0;
  const feedInSegment = followsPaper ? dy * ratio : 0;
  const feedTotal = reloadAnimation.fedBeforeSegment + feedInSegment;
  setPaperLength(reloadAnimation.initialLength + feedTotal);
  applyPosition(x, y, machinePosition.z, reloadAnimation.initialPaperY + feedTotal);
  const completed = reloadAnimation.segments.slice(0, reloadAnimation.index).reduce((sum, item) => sum + item.durationMs, 0);
  const total = reloadAnimation.segments.reduce((sum, item) => sum + item.durationMs, 0);
  controlsUi.progress.value = total ? (completed + segment.durationMs * ratio) / total : 0;
  controlsUi.progressText.textContent = `リロード ${Math.round(controlsUi.progress.value * 100)}%・紙送り ${fedPaperLength().toFixed(0)} mm`;
  if (ratio < 1) return;
  if (followsPaper) reloadAnimation.fedBeforeSegment += Math.max(0, dy);
  const nextSegment = reloadAnimation.segments[reloadAnimation.index + 1];
  reloadAnimation.index += 1;
  reloadAnimation.segmentStartedAt = now;
  if (nextSegment) {
    const nextDy = nextSegment.to.y - nextSegment.from.y;
    if (dy >= 0 && nextDy < 0) {
      reloadAnimation.lockTransition = { from: 0, to: 1, startedAt: now, durationMs: paperConfig.lockTransitionMs || 900, x: segment.to.x, y: segment.to.y };
    } else if (dy < 0 && nextDy >= 0) {
      reloadAnimation.lockTransition = { from: 1, to: 0, startedAt: now, durationMs: paperConfig.lockTransitionMs || 900, x: segment.to.x, y: segment.to.y };
    }
  }
  if (reloadAnimation.index < reloadAnimation.segments.length) return;
  reloadAnimation = null;
  lockAmount = 0;
  controlsUi.reload.disabled = false;
  controlsUi.paperReset.disabled = false;
  controlsUi.progress.value = 1;
  controlsUi.progressText.textContent = `紙送り ${fedPaperLength().toFixed(0)} mm`;
  applyPosition(machinePosition.x, machinePosition.y, machinePosition.z, paperTravelY);
}

function worldOccurrenceMatrix(occurrence, occurrences, cache) {
  if (cache.has(occurrence.fullPathName)) return cache.get(occurrence.fullPathName).clone();
  const local = occurrenceMatrix(occurrence.transformCmRowMajor);
  if (occurrence.transformSpace === "root-proxy") {
    cache.set(occurrence.fullPathName, local.clone());
    return local;
  }
  const parent = occurrence.parentPath ? occurrences.get(occurrence.parentPath) : null;
  const world = parent ? worldOccurrenceMatrix(parent, occurrences, cache).multiply(local) : local;
  cache.set(occurrence.fullPathName, world.clone());
  return world;
}

function applyPosition(x, y, z, paperY = null) {
  const nextPaperY = paperY == null ? paperTravelY + (y - machinePosition.y) : paperY;
  machinePosition.x = x;
  machinePosition.y = y;
  machinePosition.z = z;
  paperTravelY = nextPaperY;
  updatePaperMesh(paperBaseLength + paperTravelY);
  controlsUi.x.value = x;
  controlsUi.y.value = y;
  controlsUi.z.value = z;
  controlsUi.xValue.textContent = `${x.toFixed(1)} mm`;
  controlsUi.yValue.textContent = `${y.toFixed(1)} mm`;
  controlsUi.zValue.textContent = `${z.toFixed(1)} mm`;
  for (const mesh of meshes.values()) {
    const base = mesh.userData.basePosition;
    mesh.position.copy(base);
    mesh.quaternion.copy(mesh.userData.baseQuaternion);
    if (motionGroups.x.has(mesh.userData.name)) mesh.position.x += penOriginX - penHome.x + x;
    if (motionGroups.y.has(mesh.userData.name)) mesh.position.y -= y;
    if (motionGroups.z.has(mesh.userData.name)) mesh.position.z += z;
  }
  const lockBar = meshes.get(paperConfig?.lockOccurrence);
  if (lockBar && paperConfig?.lockPivotMm && paperConfig?.lockAxis) {
    const pivot = new THREE.Vector3(...paperConfig.lockPivotMm);
    const axis = new THREE.Vector3(...paperConfig.lockAxis).normalize();
    const rotation = new THREE.Quaternion().setFromAxisAngle(axis, lockAmount * paperConfig.lockTravelRad);
    const rotatedBase = lockBar.userData.basePosition.clone().applyQuaternion(rotation);
    const rotatedPivot = pivot.clone().applyQuaternion(rotation);
    lockBar.quaternion.copy(rotation).multiply(lockBar.userData.baseQuaternion);
    lockBar.position.copy(rotatedBase).add(pivot).sub(rotatedPivot);
  }
  inkGroup.position.y = -paperTravelY;
}

function bindControls() {
  const update = () => {
    if (playback) stopPlayback();
    applyPosition(+controlsUi.x.value, +controlsUi.y.value, +controlsUi.z.value);
  };
  controlsUi.x.addEventListener("input", update);
  controlsUi.y.addEventListener("input", update);
  controlsUi.z.addEventListener("input", update);
  controlsUi.resetView.addEventListener("click", resetView);
  controlsUi.play.addEventListener("click", startPlayback);
  controlsUi.stop.addEventListener("click", stopPlayback);
  controlsUi.reload.addEventListener("click", () => window.PlotterFlow?.simulateReload?.());
  controlsUi.paperReset.addEventListener("click", resetPaper);
  window.addEventListener("plotterflow:reload-start", event => startPaperReload(event.detail?.gcode || ""));
}

function demoMoves() {
  const moves = [];
  let previous = { x: 0, y: 0 };
  for (let index = 0; index <= 80; index += 1) {
    const angle = index / 80 * Math.PI * 2;
    const next = { x: 30 + 25 * Math.cos(angle), y: 30 + 20 * Math.sin(angle) };
    moves.push({ type: index ? "draw" : "travel", from: previous, to: next });
    previous = next;
  }
  return moves;
}

function getMoves() {
  const code = document.querySelector("#gcodeEditor")?.value || "";
  const parsed = window.PlotterFlow?.parseGcodeMoves?.(code) || [];
  return parsed.length ? parsed : demoMoves();
}

function clearTrail() {
  if (!trail) return;
  inkGroup.remove(trail);
  trail.geometry.dispose();
  trail.material.dispose();
  trail = null;
}

function archiveTrail() {
  trail = null;
}

function startPlayback() {
  const moves = getMoves();
  if (!moves.length) return;
  archiveTrail();
  const first = moves[0].from;
  const entryDistance = Math.hypot(first.x - machinePosition.x, first.y - machinePosition.y);
  if (entryDistance > 0.001) {
    moves.unshift({ type: "travel", from: { x: machinePosition.x, y: machinePosition.y }, to: { ...first } });
  }
  playback = {
    moves,
    index: 0,
    distance: 0,
    segments: [],
    trailMoveIndex: -1,
    lastTime: performance.now(),
    paperOffset: paperTravelY - machinePosition.y
  };
  controlsUi.play.disabled = true;
  controlsUi.stop.disabled = false;
  controlsUi.progress.value = 0;
  controlsUi.progressText.textContent = `0 / ${moves.length}`;
}

function stopPlayback() {
  playback = null;
  archiveTrail();
  controlsUi.play.disabled = false;
  controlsUi.stop.disabled = true;
  controlsUi.progressText.textContent = "停止";
}

function createInkGeometry(segments, width = 0.65) {
  const vertices = [];
  const halfWidth = width / 2;
  for (let index = 0; index < segments.length; index += 2) {
    const start = segments[index], end = segments[index + 1];
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.0001) continue;
    const nx = -dy / length * halfWidth, ny = dx / length * halfWidth;
    vertices.push(
      start.x + nx, start.y + ny, start.z,
      end.x + nx, end.y + ny, end.z,
      end.x - nx, end.y - ny, end.z,
      start.x + nx, start.y + ny, start.z,
      end.x - nx, end.y - ny, end.z,
      start.x - nx, start.y - ny, start.z
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  return geometry;
}

function updateTrail(move, x, y) {
  if (move.type !== "draw") return;
  const z = (paperConfig?.topZmm || 18.6) + 0.5;
  const point = (px, py) => new THREE.Vector3(penOriginX + px, penHome.y + playback.paperOffset + py, z);
  const continuesCurrentMove = playback.trailMoveIndex === playback.index && playback.segments.length;
  const segmentStart = continuesCurrentMove
    ? playback.segments[playback.segments.length - 1]
    : point(move.from.x, move.from.y);
  const segmentEnd = point(x, y);
  if (segmentStart.distanceToSquared(segmentEnd) < 0.0001) return;
  playback.trailMoveIndex = playback.index;
  playback.segments.push(segmentStart.clone(), segmentEnd);
  clearTrail();
  trail = new THREE.Mesh(
    createInkGeometry(playback.segments),
    new THREE.MeshBasicMaterial({ color: 0x003f46, side: THREE.DoubleSide, depthTest: false, depthWrite: false })
  );
  trail.renderOrder = 20;
  inkGroup.add(trail);
}

function updatePlayback(now) {
  if (!playback) return;
  const move = playback.moves[playback.index];
  const dx = move.to.x - move.from.x;
  const dy = move.to.y - move.from.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const elapsed = Math.max(0, now - playback.lastTime) / 1000;
  playback.lastTime = now;
  playback.distance += elapsed * +controlsUi.speed.value;
  const ratio = Math.min(1, playback.distance / length);
  const x = move.from.x + dx * ratio;
  const y = move.from.y + dy * ratio;
  applyPosition(x, y, move.type === "travel" ? 6 : 0, playback.paperOffset + y);
  updateTrail(move, x, y);
  if (ratio >= 1) {
    playback.index += 1;
    playback.distance = 0;
    controlsUi.progress.value = playback.index / playback.moves.length;
    controlsUi.progressText.textContent = `${playback.index} / ${playback.moves.length}`;
    if (playback.index >= playback.moves.length) {
      archiveTrail();
      playback = null;
      controlsUi.play.disabled = false;
      controlsUi.stop.disabled = true;
      controlsUi.progressText.textContent = "完了";
    }
  }
}

async function retry(operation, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError;
}

function setLoadProgress(value, text) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  controlsUi.loadProgress.value = percent;
  controlsUi.loadText.textContent = text || `${percent}%`;
  controlsUi.loadRow.classList.toggle("is-complete", percent >= 100);
}

async function fetchWithTimeout(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "default", signal: controller.signal });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function fetchAsset(url) {
  return retry(() => fetchWithTimeout(url), 2);
}

async function fetchBundle(url, expectedBytes) {
  const response = await fetchWithTimeout(url, 15000);
  const total = +(response.headers.get("content-length") || expectedBytes || 0);
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    setLoadProgress(70, "70%");
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    const ratio = total ? received / total : 0;
    const percent = Math.min(70, 5 + ratio * 65);
    setLoadProgress(percent, total ? `${Math.round(percent)}%` : `${Math.round(received / 1024)} KB`);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  setLoadProgress(70, "70%");
  return merged.buffer;
}

async function loadAssembly() {
  setLoadProgress(1, "1%");
  const [assemblyResponse, manifestResponse, bundleMapResponse] = await Promise.all([
    fetchAsset("assets/fusion-demo/assembly.json"),
    fetchAsset("assets/fusion-demo/mesh-manifest.json"),
    fetchAsset("assets/fusion-demo/mesh-bundle.json")
  ]);
  const [assembly, manifest, bundleMap] = await Promise.all([assemblyResponse.json(), manifestResponse.json(), bundleMapResponse.json()]);
  setLoadProgress(5, "5%");
  paperConfig = assembly.paperSimulation;
  if (paperConfig) createPaperExtension(paperConfig);
  for (const axis of ["x", "y", "z"]) {
    for (const path of assembly.motionGroups?.[axis]?.occurrences || []) motionGroups[axis].add(path);
  }
  const occurrences = new Map(assembly.occurrences.map(occurrence => [occurrence.fullPathName, occurrence]));
  const penOccurrence = occurrences.get("pen v1:1");
  if (penOccurrence?.boundingBoxCm) {
    penHome = {
      x: (penOccurrence.boundingBoxCm.minCm[0] + penOccurrence.boundingBoxCm.maxCm[0]) * 5,
      y: (penOccurrence.boundingBoxCm.minCm[1] + penOccurrence.boundingBoxCm.maxCm[1]) * 5
    };
    penOriginX = paperConfig?.xOriginWorldMm ?? penHome.x;
    if (paperConfig?.xTravelMm) controlsUi.x.max = paperConfig.xTravelMm;
  }
  const worldMatrices = new Map();
  let loaded = 0;
  let failed = 0;
  const items = manifest.items.filter(item => {
    const occurrence = occurrences.get(item.fullPathName);
    return item.isVisible && (item.kind === "rootBody" || occurrence);
  });
  let settled = 0;
  const addItem = (item, occurrence, geometry) => {
      const transform = item.kind === "rootBody"
        ? occurrenceMatrix(item.transformCmRowMajor)
        : worldOccurrenceMatrix(occurrence, occurrences, worldMatrices);
      addMeshOccurrence(item, occurrence, geometry, transform);
      loaded += 1;
  };
  const updateParseProgress = () => {
    settled += 1;
    const percent = 70 + settled / items.length * 30;
    setLoadProgress(percent, `${Math.round(percent)}%`);
    controlsUi.status.textContent = `Fusion STLを解析中・${settled}/${items.length}部品`;
  };
  try {
    const bundleBuffer = await retry(() => fetchBundle(`assets/fusion-demo/${bundleMap.file}`, bundleMap.bytes), 2);
    for (const item of items) {
      const occurrence = occurrences.get(item.fullPathName);
      const entry = bundleMap.items[item.file];
      if (!entry) throw new Error(`bundle entry missing: ${item.file}`);
      addItem(item, occurrence, stlLoader.parse(bundleBuffer.slice(entry.offset, entry.offset + entry.length)));
      updateParseProgress();
      if (settled % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (bundleError) {
    console.warn("STL bundle load failed; using individual files", bundleError);
    loaded = 0;
    failed = 0;
    settled = 0;
    let nextItem = 0;
    setLoadProgress(5, "個別読込");
    const loadNext = async () => {
      while (nextItem < items.length) {
        const item = items[nextItem];
        nextItem += 1;
        const occurrence = occurrences.get(item.fullPathName);
        try {
          const response = await retry(() => fetchWithTimeout(`assets/fusion-demo/${item.file}`), 2);
          addItem(item, occurrence, stlLoader.parse(await response.arrayBuffer()));
        } catch (error) {
          failed += 1;
          if (occurrence) addProxyOccurrence(occurrence);
          console.error(`STL load failed: ${item.file}`, error);
        } finally {
          updateParseProgress();
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, items.length) }, loadNext));
  }
  modelBounds = new THREE.Box3().setFromObject(modelRoot);
  resetView();
  controlsUi.status.textContent = `${assembly.source.documentName}・実形状${loaded}部品・${assembly.root.jointCount}ジョイント${failed ? `・代替表示${failed}` : ""}`;
  setLoadProgress(100, "100%");
  applyPosition(0, 0, 0);
}

function animate(now) {
  resize();
  updatePlayback(now);
  updatePaper(now);
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

bindControls();
resetView();
loadAssembly().catch(error => {
  controlsUi.status.textContent = `読み込み失敗: ${error.message}`;
  controlsUi.loadText.textContent = "失敗";
});
requestAnimationFrame(animate);
