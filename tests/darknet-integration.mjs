import assert from "node:assert/strict";
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const config = JSON.parse(fs.readFileSync("matrix/config.json", "utf8"));
const start = fs.readFileSync("matrix/start.js", "utf8");

const stageOf = path => manifest.files.find(entry => entry.path === path)?.stage ?? null;
for (const path of [
    "matrix/lib/darknet.js",
    "matrix/workers/darknet-node.js",
    "matrix/services/darknet.js",
]) {
    assert.equal(stageOf(path), "operations", `${path} must install with the 128 GB operations stage`);
}

assert.equal(config.automation.darknet, true, "new installs must expose Darknet automation as enabled by default");
assert.match(
    start,
    /\{ file: "\/matrix\/services\/darknet\.js", key: "darknet", minRam: 128, requiresFile: "DarkscapeNavigator\.exe" \}/,
    "the supervisor must own Darknet only in the operations tier and gate it on DarkscapeNavigator.exe",
);
assert.match(
    start,
    /service\.requiresFile && !ns\.fileExists\(service\.requiresFile, "home"\)/,
    "capability-gated services must not consume resident RAM before their required program exists",
);
assert.match(start, /state: "needs-program", program: service\.requiresFile/);
assert.match(start, /entry\.state === "needs-program" \? `needs \$\{entry\.program\}`/);

console.log("MATRIX Darknet integration passed: operations-stage install, explicit toggle, capability-gated supervision.");
