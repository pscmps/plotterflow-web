import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

assert.match(app, /"rp2040-geek-sts3215-id2-id3"/);
assert.match(app, /jogCommand: "sts3215-test"/);
assert.match(app, /directAxes: true, statusPolling: false/);
assert.match(app, /initializeCommand: "M17\\nG21\\nG90\\nG10 L20 P0 X0 Y0"/);
assert.match(app, /okTimeoutMs: 20000/);
assert.match(app, /jogStep: 45, jogFeed: 3400/);
assert.match(app, /stsAxisXId: 2, stsAxisYId: 3, stsAxisZId: 1/);
assert.match(app, /function sts3215AxisConfigCommand\(\)/);
assert.match(app, /`M950 X\$\{id\("stsAxisXId"\)\}/);
assert.match(app, /const lines = \[\.\.\.sts3215SetupLines\(\), \.\.\.cleanLines\(code\)\]/);
assert.match(app, /feed\.min = "3400"; feed\.max = "3400"; feed\.value = "3400"/);
assert.match(app, /command = `TESTJOG \$\{id\} \$\{delta\}`/);
assert.match(app, /Math\.abs\(delta\) > 28672/);
assert.match(app, /\$\('\[data-command="\?"\]'\)\.disabled = true/);
assert.match(html, /value="rp2040-geek-sts3215-id2-id3"/);
assert.match(html, /name="stsAxisXId"/);
assert.match(html, /name="stsAxisZEnabled"/);
assert.match(html, /app\.js\?v=20260812-5/);
assert.match(readme, /M950/);

console.log("STS3215 PlotterFlow profile smoke test passed");
