import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

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
  resetView: document.querySelector("#simulationResetView"),
  progress: document.querySelector("#simulationProgress"),
  progressText: document.querySelector("#simulationProgressText"),
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
const stlLoader = new STLLoader();
const meshes = new Map();
const motionGroups = { x: new Set(), y: new Set(), z: new Set() };
const groupColors = { fixed: 0x78858b, x: 0x1976a3, y: 0xcf7a22, z: 0xb33d5c };
let playback = null;
let trail = null;
let modelBounds = null;

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
  mesh.userData = { basePosition: mesh.position.clone(), role, name: occurrence.fullPathName };
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
  geometry.applyMatrix4(worldMatrix);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: groupColors[role],
    transparent: true,
    opacity: role === "fixed" ? 0.78 : 0.92,
    roughness: 0.62,
    metalness: 0.08,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = { basePosition: new THREE.Vector3(), role, name: item.fullPathName };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  modelRoot.add(mesh);
  meshes.set(item.fullPathName, mesh);
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

function applyPosition(x, y, z) {
  controlsUi.x.value = x;
  controlsUi.y.value = y;
  controlsUi.z.value = z;
  controlsUi.xValue.textContent = `${x.toFixed(1)} mm`;
  controlsUi.yValue.textContent = `${y.toFixed(1)} mm`;
  controlsUi.zValue.textContent = `${z.toFixed(1)} mm`;
  for (const mesh of meshes.values()) {
    const base = mesh.userData.basePosition;
    mesh.position.copy(base);
    if (motionGroups.x.has(mesh.userData.name)) mesh.position.x -= x;
    if (motionGroups.y.has(mesh.userData.name)) mesh.position.y -= y;
    if (motionGroups.z.has(mesh.userData.name)) mesh.position.z += z;
  }
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
}

function demoMoves() {
  const moves = [];
  let previous = { x: 0, y: 0 };
  for (let index = 0; index <= 80; index += 1) {
    const angle = index / 80 * Math.PI * 2;
    const next = { x: 28 * Math.cos(angle), y: 38 * Math.sin(angle) };
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
  scene.remove(trail);
  trail.geometry.dispose();
  trail.material.dispose();
  trail = null;
}

function startPlayback() {
  const moves = getMoves();
  if (!moves.length) return;
  clearTrail();
  playback = { moves, index: 0, distance: 0, points: [], lastTime: performance.now() };
  controlsUi.play.disabled = true;
  controlsUi.stop.disabled = false;
  controlsUi.progress.value = 0;
  controlsUi.progressText.textContent = `0 / ${moves.length}`;
}

function stopPlayback() {
  playback = null;
  controlsUi.play.disabled = false;
  controlsUi.stop.disabled = true;
  controlsUi.progressText.textContent = "停止";
}

function updateTrail(move, x, y) {
  if (move.type !== "draw") return;
  const z = -26.5;
  if (!playback.points.length) playback.points.push(new THREE.Vector3(move.from.x, move.from.y, z));
  playback.points.push(new THREE.Vector3(x, y, z));
  clearTrail();
  trail = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(playback.points),
    new THREE.LineBasicMaterial({ color: 0x075b63 })
  );
  scene.add(trail);
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
  applyPosition(x, y, move.type === "travel" ? 6 : 0);
  updateTrail(move, x, y);
  if (ratio >= 1) {
    playback.index += 1;
    playback.distance = 0;
    controlsUi.progress.value = playback.index / playback.moves.length;
    controlsUi.progressText.textContent = `${playback.index} / ${playback.moves.length}`;
    if (playback.index >= playback.moves.length) {
      playback = null;
      controlsUi.play.disabled = false;
      controlsUi.stop.disabled = true;
      controlsUi.progressText.textContent = "完了";
    }
  }
}

async function loadAssembly() {
  const [assemblyResponse, manifestResponse] = await Promise.all([
    fetch("assets/fusion-demo/assembly.json"),
    fetch("assets/fusion-demo/mesh-manifest.json")
  ]);
  if (!assemblyResponse.ok) throw new Error(`assembly.json: HTTP ${assemblyResponse.status}`);
  if (!manifestResponse.ok) throw new Error(`mesh-manifest.json: HTTP ${manifestResponse.status}`);
  const [assembly, manifest] = await Promise.all([assemblyResponse.json(), manifestResponse.json()]);
  for (const axis of ["x", "y", "z"]) {
    for (const path of assembly.motionGroups?.[axis]?.occurrences || []) motionGroups[axis].add(path);
  }
  const occurrences = new Map(assembly.occurrences.map(occurrence => [occurrence.fullPathName, occurrence]));
  const worldMatrices = new Map();
  let loaded = 0;
  let failed = 0;
  await Promise.all(manifest.items.map(async item => {
    const occurrence = occurrences.get(item.fullPathName);
    if (!item.isVisible || (item.kind !== "rootBody" && !occurrence)) return;
    try {
      const geometry = await stlLoader.loadAsync(`assets/fusion-demo/${item.file}`);
      const transform = item.kind === "rootBody"
        ? occurrenceMatrix(item.transformCmRowMajor)
        : worldOccurrenceMatrix(occurrence, occurrences, worldMatrices);
      addMeshOccurrence(item, occurrence, geometry, transform);
      loaded += 1;
      controlsUi.status.textContent = `Fusion STLを読み込み中・${loaded}部品`;
    } catch (error) {
      failed += 1;
      if (occurrence) addProxyOccurrence(occurrence);
      console.error(`STL load failed: ${item.file}`, error);
    }
  }));
  modelBounds = new THREE.Box3().setFromObject(modelRoot);
  resetView();
  controlsUi.status.textContent = `${assembly.source.documentName}・実形状${loaded}部品・${assembly.root.jointCount}ジョイント${failed ? `・代替表示${failed}` : ""}`;
  applyPosition(0, 0, 0);
}

function animate(now) {
  resize();
  updatePlayback(now);
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

bindControls();
resetView();
loadAssembly().catch(error => {
  controlsUi.status.textContent = `読み込み失敗: ${error.message}`;
});
requestAnimationFrame(animate);
