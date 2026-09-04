import assert from "node:assert/strict";
import fs from "node:fs";
import {
    BOOST_MODE_MAX,
    BOOST_MODE_NORMAL,
    BOOST_TYPE,
    SHARE_SCRIPT,
    isOwnedShareProcess,
    makeBoostRequest,
    makeCancelRequest,
    maxBoostReady,
    normalShareBudget,
    normalizeBoostRequest,
    parseDuration,
    planShareThreads,
    shareArgs,
    shareCapacityThreads,
    shareProcessMeta,
} from "../matrix/lib/reputation-boost.js";

assert.equal(parseDuration("10m"), 600_000);
assert.equal(parseDuration("20 minutes"), 1_200_000);
assert.equal(parseDuration("1h 30m"), 5_400_000);
assert.equal(parseDuration("20"), null);

const normal = makeBoostRequest("rep", 600_000, 1_000, "boost-a");
assert.equal(normal.type, BOOST_TYPE);
assert.equal(normal.mode, BOOST_MODE_NORMAL);
assert.equal(normal.endsAt, 601_000);

const maximum = makeBoostRequest("max", 1_200_000, 2_000, "boost-b");
assert.equal(maximum.mode, BOOST_MODE_MAX);
assert.equal(maximum.endsAt, 1_202_000);

const active = normalizeBoostRequest(normal, 101_000);
assert.equal(active.boostId, "boost-a");
assert.equal(active.remainingMs, 500_000);
assert.equal(normalizeBoostRequest(normal, normal.endsAt), null, "expiry must fail safe to normal mode");
assert.equal(normalizeBoostRequest(makeCancelRequest(normal, 5_000), 5_001), null);

const args = shareArgs(normal, 3);
const owned = { filename: SHARE_SCRIPT, threads: 7, args };
assert.equal(shareProcessMeta(owned).boostId, "boost-a");
assert.equal(shareProcessMeta(owned).slot, 3);
assert.equal(isOwnedShareProcess(owned, "boost-a"), true);
assert.equal(isOwnedShareProcess(owned, "boost-b"), false);
assert.equal(isOwnedShareProcess({ filename: SHARE_SCRIPT, args: [] }, "boost-a"), false);

assert.equal(shareCapacityThreads({ maxRam: 64, usedRam: 20, reserveRam: 8, ownedRam: 0, scriptRam: 4 }), 9);
assert.equal(shareCapacityThreads({ maxRam: 64, usedRam: 52, reserveRam: 8, ownedRam: 16, scriptRam: 4 }), 5,
    "owned share RAM must remain reclaimable scheduler capacity");
assert.equal(normalShareBudget(100, 0.05), 95);

assert.deepEqual(planShareThreads([
    { host: "a", availableRam: 20 },
    { host: "b", availableRam: 20 },
], 24, 4), [
    { host: "a", threads: 5, ram: 20 },
    { host: "b", threads: 1, ram: 4 },
]);

assert.equal(maxBoostReady({ activeBatches: 0, activePrep: 0, legacyWorkers: 0 }), true);
assert.equal(maxBoostReady({ activeBatches: 1, activePrep: 0, legacyWorkers: 0 }), false);
assert.equal(maxBoostReady({ activeBatches: 0, activePrep: 1, legacyWorkers: 0 }), false);
assert.equal(maxBoostReady({ activeBatches: 0, activePrep: 0, legacyWorkers: 1 }), false);

const hacking = fs.readFileSync("matrix/services/hacking.js", "utf8");
const coordinator = fs.readFileSync("matrix/services/coordinator.js", "utf8");
const worker = fs.readFileSync("matrix/workers/share.js", "utf8");
assert.doesNotMatch(hacking, /SHARE_FRACTION/);
assert.doesNotMatch(hacking, /scriptKill\s*\(\s*SHARE/);
assert.doesNotMatch(hacking, /killall/i);
assert.match(hacking, /reclaimBoostShareForRam/);
assert.match(hacking, /maxBoostReady/);
assert.match(hacking, /admissionPaused/);
assert.match(coordinator, /directives\.reputationBoost/);
assert.match(worker, /--ends/);
assert.match(worker, /Date\.now\(\)\s*<\s*endsAt/);

console.log("MATRIX-OS reputation boost passed: bounded duration, ownership, reclaimability, drain gating, cleanup guards.");
