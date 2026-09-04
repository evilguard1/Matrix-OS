import assert from "node:assert/strict";
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const hacking = fs.readFileSync("matrix/services/hacking.js", "utf8");

const stageOf = path => manifest.files.find(entry => entry.path === path)?.stage ?? null;
assert.equal(stageOf("matrix/lib/core-aware.js"), "full",
    "core-aware helper must install with the full scheduler stage");

assert.match(hacking, /from "\/matrix\/lib\/core-aware\.js"/);
assert.match(hacking, /ns\.getServer\("home"\)\?\.cpuCores/,
    "scheduler must use Home's real CPU core count");
assert.match(hacking, /planWholeHomeCoreBatch\(pool, batchComponents\(ns, coreShape\)\)/,
    "core-sized batches must pass through the whole-Home placement gate");
assert.match(hacking, /plan = planBatchPlacement\(pool, batchComponents\(ns, snapshot\.shape\)\)/,
    "the validated one-core distributed planner must remain the fallback");
assert.match(hacking, /homeCoreProbePlanningSnapshot/,
    "active core-sized snapshots must be re-probed for grow-thread safety");
assert.match(hacking, /entry\.threads >= sourceNeed\.threads/,
    "grow prep may only be core-resized when its full one-core need was admitted");
assert.match(hacking, /placements: \[\{ host: "home", threads: coreThreads \}\]/,
    "core-sized prep must be placed entirely on Home");

assert.match(hacking, /cachedEligible\.length !== formulaRankedCache\.length \|\|/,
    "formula rank-cache candidate-set hardening must not regress");
assert.match(hacking, /ranked = cachedEligible;/,
    "formula rank cache must continue filtering to currently eligible targets");
assert.match(hacking, /\[H, G, W\]\.some\(script => sameScriptPath\(proc\.filename, script\)\)/,
    "legacy H/G/W reconstruction must keep normalized script matching");

assert.doesNotMatch(hacking, /growthAnalyzeSecurity\s*\([^\n,]+,\s*[^\n)]+\)/,
    "growthAnalyzeSecurity must remain one-argument everywhere in the hacking service");

console.log("MATRIX core-aware integration passed: Home-only fast path, exact one-core fallback, stale probes, prep safety, and scheduler hardening preserved.");
