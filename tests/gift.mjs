/**
 * Stanek's Gift charge policy.
 *
 * An uncharged fragment grants nothing, and charge has diminishing returns per
 * fragment, so the policy must level them rather than deepen the best one.
 */
import assert from "node:assert/strict";
import { weakestFragment, chargeHosts } from "../matrix/lib/gift.js";

// --- charge the weakest ------------------------------------------------------
const fragments = [
    { x: 0, y: 0, numCharge: 900 },
    { x: 2, y: 1, numCharge: 12 },
    { x: 4, y: 3, numCharge: 340 },
];
assert.deepEqual(
    (({ x, y }) => ({ x, y }))(weakestFragment(fragments)), { x: 2, y: 1 },
    "the least-charged fragment is the one to top up");
// A brand-new fragment has no numCharge at all and must count as zero.
assert.deepEqual((({ x, y }) => ({ x, y }))(weakestFragment([{ x: 1, y: 1 }, { x: 0, y: 0, numCharge: 5 }])),
    { x: 1, y: 1 }, "a fragment with no charge field is the weakest, not the strongest");
assert.equal(weakestFragment([]), null);
assert.equal(weakestFragment(null), null);
// Malformed entries must be skipped, not chosen and then fed to chargeFragment.
assert.deepEqual((({ x, y }) => ({ x, y }))(weakestFragment([{ x: null, y: 2 }, { x: 3, y: 3, numCharge: 99 }])),
    { x: 3, y: 3 }, "a fragment with no coordinates cannot be charged");
assert.equal(weakestFragment([{ x: "a", y: "b" }]), null);

// --- thread allocation -------------------------------------------------------
const hosts = [
    { host: "home", free: 100 },
    { host: "big", free: 512 },
    { host: "tiny", free: 1 },
    { host: "negative", free: -50 },
];
const plan = chargeHosts(hosts, 2.0);
assert.equal(plan[0].host, "big", "the widest host runs the charge");
assert.equal(plan[0].threads, 256);
assert.ok(!plan.some(h => h.host === "tiny"), "1 GB free cannot run a 2 GB worker");
assert.ok(!plan.some(h => h.host === "negative"), "negative free RAM must not become threads");
assert.deepEqual(chargeHosts([], 2), []);
assert.deepEqual(chargeHosts(null, 2), []);
// A zero or missing script size must not divide by zero into Infinity threads.
assert.ok(chargeHosts([{ host: "a", free: 8 }], 0).every(h => Number.isFinite(h.threads)));
assert.doesNotThrow(() => chargeHosts([null, {}, { host: 5 }], 2));

console.log("MATRIX-OS gift passed: charge levels the weakest fragment, threads scale to the widest host.");
