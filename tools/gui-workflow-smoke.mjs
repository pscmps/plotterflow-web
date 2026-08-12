import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const drawing = await readFile(new URL("../drawing.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

const sendPanel = html.indexOf('id="serialSendPanel"');
const jogPanel = html.indexOf('class="jog-section"');
const trajectory = html.indexOf('id="serialTrajectoryCard"');
assert.ok(sendPanel >= 0 && sendPanel < jogPanel, "G-code send controls must be above JOG");
assert.ok(trajectory > jogPanel, "Serial trajectory must be below the controls");
assert.equal((html.match(/id="serialSendPanel"/g) || []).length, 1);
assert.match(html, /id="serialTrajectorySvg"/);
assert.match(app, /function openSerialTrajectory\(code, name\)/);
assert.match(app, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
assert.match(app, /renderSerialTrajectory\(payload\.code, payload\.name\)/);

for (const id of ["drawingSelectionProperties", "drawingSelectionX", "drawingSelectionY", "drawingSelectionWidth", "drawingSelectionHeight", "drawingSelectionRotation", "drawingSelectionApply"]) {
  assert.match(html, new RegExp(`id="${id}"`));
}
assert.match(drawing, /function syncSelectionProperties\(object,hasDetailed=false\)/);
assert.match(drawing, /function applySelectionProperties\(\)/);
assert.match(drawing, /function objectPropertyGeometry\(object\)/);
assert.match(drawing, /transform="rotate\(\$\{fmt\(object\.rotation\|\|0\)\}/);
assert.match(drawing, /rotation:normalizeAngle\(finite\(object\.rotation\|\|0\)\)/);

console.log("PlotterFlow GUI workflow smoke test passed");
