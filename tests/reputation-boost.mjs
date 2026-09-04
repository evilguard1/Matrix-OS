import assert from "node:assert/strict";
import fs from "node:fs";
import {
    BOOST_MODE_MAX,
    BOOST_MODE_NORMAL,
    BOOST_TYPE,
    SHARE_SCRIPT,
    activateMaxBoostRequest,
    isOwnedShareProcess,
    isShareScriptPath,
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
assert.equal(normal.requestedAt, 1_000);
assert.equal(normal.startedAt, 1_000);
assert.equal(normal.endsAt, 601_000);

const maximum = makeBoostRequest("max", 1_200_000, 2_000, "boost-b");
assert.equal(maximum.mode, BOOST_MODE_MAX);
assert.equal(maximum.requestedAt, 2_000);
assert.equal(maximum.startedAt, null);
assert.equal(maximum.endsAt, null, "MAX duration must not start while HWGW is draining");
const draining = normalizeBoostRequest(maximum, 9_999_999);
assert.equal(draining.boostId, "boost-b");
assert.equal(draining.endsAt, null, "a long drain must not consume the requested share duration");
assert.equal(draining.remainingMs, 1_200_000);
const activatedMaximum = activateMaxBoostRequest(maximum, 9_999_999);
assert.equal(activatedMaximum.startedAt, 9_999_999);
assert.equal(activatedMaximum.endsAt, 11_199_999);
assert.equal(normalizeBoostRequest(activatedMaximum, 10_099_999).remainingMs, 1_100_000);
assert.equal(normalizeBoostRequest(activatedMaximum, activatedMaximum.endsAt), null,
    "MAX must fail safe back to normal after its all-share duration");

const active = normalizeBoostRequest(normal, 101_000);
assert.equal(active.boostId, "boost-a");
assert.equal(active.remainingMs, 500_000);
assert.equal(normalizeBoostRequest(normal, normal.endsAt), null, "normal boost expiry must fail safe to normal mode");
assert.equal(normalizeBoostRequest(makeCancelRequest(normal, 5_000), 5_001), null);

const args = shareArgs(normal, 3);
const owned = { filename: SHARE_SCRIPT, threads: 7, args };
assert.equal(shareProcessMeta(owned).boostId, "boost-a");
assert.equal(shareProcessMeta(owned).slot, 3);
assert.equal(isOwnedShareProcess(owned, "boost-a"), true);
assert.equal(isOwnedShareProcess(owned, "boost-b"), false);
assert.equal(isOwnedShareProcess({ filename: SHARE_SCRIPT, args: [] }, "boost-a"), false);

// Live Bitburner can expose ns.ps().filename in a normalized form that differs
// from the leading-slash path used at ns.exec() time. Cleanup ownership must not
// silently become an empty set merely because of that representation difference.
assert.equal(isShareScriptPath(SHARE_SCRIPT), true);
assert.equal(isShareScriptPath("matrix/workers/share.js"), true,
    "ns.ps filename without a leading slash must still be recognized");
assert.equal(isShareScriptPath("\\matrix\\workers\\share.js"), true,
    "path separators must not break ownership recognition");
assert.equal(isOwnedShareProcess({ ...owned, filename: "matrix/workers/share.js" }, "boost-a"), true,
    "ownership matching must tolerate ns.ps path normalization");
assert.equal(isOwnedShareProcess({ ...owned, filename: "/matrix/workers/other.js" }, "boost-a"), false,
    "ownership matching must remain script-specific");

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
assert.match(hacking, /activateMaxBoostRequest/);
assert.match(hacking, /isOwnedShareProcess/);
assert.match(hacking, /ns\.kill\(SHARE,\s*host,\s*\.\.\.args\)/);
assert.doesNotMatch(hacking, /ns\.kill\(proc\.pid,\s*host\)/);
assert.match(hacking, /cleanup\.remaining > 0/);
assert.match(hacking, /status:\s*"cleanup-pending"/);
assert.match(hacking, /runtimeExpired\s*\?\s*"completed"\s*:\s*"cancelled"/);
assert.match(coordinator, /directives\.reputationBoost/);
assert.match(worker, /--ends/);
assert.match(worker, /Date\.now\(\)\s*<\s*endsAt/);

console.log("MATRIX-OS reputation boost passed: bounded duration, ownership, reclaimability, drain gating, normalized-path cleanup.");
