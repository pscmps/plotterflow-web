import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

assert.match(app, /"rp2040-geek-sts3215-id2-id3"/);
assert.match(app, /jogCommand: "sts3215-test"/);
assert.match(app, /jogIds: \{ X: 2, Y: 3 \}, statusPolling: false/);
assert.match(app, /initializeCommand: "SCAN 2\\nSCAN 3"/);
assert.match(app, /command = `TESTJOG \$\{id\} \$\{delta\}`/);
assert.match(app, /Math\.abs\(delta\) > 128/);
assert.match(app, /\$\('\[data-command="\?"\]'\)\.disabled = true/);
assert.match(html, /value="rp2040-geek-sts3215-id2-id3"/);
assert.match(html, /app\.js\?v=20260812-1/);
assert.match(readme, /X = STS3215 ID 2, Y = STS3215 ID 3/);

console.log("STS3215 PlotterFlow profile smoke test passed");
