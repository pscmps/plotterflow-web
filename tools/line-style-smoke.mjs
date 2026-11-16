import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

let source = await readFile(new URL("../drawing.js", import.meta.url), "utf8");
source = source.replace(
  'document.addEventListener("DOMContentLoaded", initDrawing);',
  "globalThis.__drawingLineStyleTest={normalizeObject,linePatternPaths,lineStylePresentation};"
);
assert.match(source, /__drawingLineStyleTest/);

const context = {
  localStorage: { getItem: () => null, setItem: () => {} },
  console
};
vm.runInNewContext(source, context);
const { normalizeObject, linePatternPaths, lineStylePresentation } = context.__drawingLineStyleTest;

const legacy = normalizeObject({ type: "rect", x: 0, y: 0, width: 10, height: 5 });
assert.equal(legacy.lineStyle, "solid");
assert.equal(legacy.forceCornerDots, false);
assert.deepEqual({ ...lineStylePresentation(legacy) }, { "stroke-dasharray": "none" });

const dashed = normalizeObject({
  type: "freehand",
  points: [[0, 0], [10, 0]],
  lineStyle: "dashed",
  lineLengthMm: 2,
  lineGapMm: 1
});
const dashedPaths = linePatternPaths([{ x: 0, y: 0 }, { x: 10, y: 0 }], dashed);
assert.equal(JSON.stringify(dashedPaths.map(path => path.map(point => Number(point.x.toFixed(3))))), JSON.stringify([[0, 2], [3, 5], [6, 8], [9, 10]]));
assert.equal(lineStylePresentation(dashed, 0.1)["stroke-dasharray"], "20 10");

const dotted = normalizeObject({
  type: "freehand",
  points: [[0, 0], [3, 0]],
  lineStyle: "dotted",
  lineLengthMm: 0.3,
  lineGapMm: 0.7
});
assert.equal(linePatternPaths([{ x: 0, y: 0 }, { x: 3, y: 0 }], dotted).length, 3);

const cornerPath = [{ x: 0, y: 0 }, { x: 2.5, y: 0 }, { x: 2.5, y: 2.5 }];
const cornerStyle = { ...dashed, lineLengthMm: 1, lineGapMm: 3 };
assert.equal(linePatternPaths(cornerPath, cornerStyle).length, 2);
const forcedCornerPaths = linePatternPaths(cornerPath, { ...cornerStyle, forceCornerDots: true });
assert.equal(forcedCornerPaths.length, 3);
assert.ok(forcedCornerPaths.some(path => path.some(point => Math.abs(point.x - 2.5) < 1e-6 && Math.abs(point.y) < 1e-6)));
const circlePath = Array.from({ length: 17 }, (_, index) => ({ x: Math.cos(index / 16 * Math.PI * 2), y: Math.sin(index / 16 * Math.PI * 2) }));
assert.equal(linePatternPaths(circlePath, cornerStyle).length, linePatternPaths(circlePath, { ...cornerStyle, forceCornerDots: true }).length);

console.log("PlotterFlow line style smoke test passed");
