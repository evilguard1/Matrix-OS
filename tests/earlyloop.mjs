/**
 * The early worker's decision.
 *
 * Every thread on every rooted box runs this thousands of times, so a wrong
 * answer here is the difference between an early game that compounds and one
 * that crawls - and it is invisible from the dashboard, which only ever shows
 * that threads are running.
 *
 * Each case below also documents what the previous loop did, because the point
 * is not that these answers are reasonable but that the old ones were not.
 */
import assert from "node:assert/strict";
import { nextAction, SECURITY_SLACK, MONEY_FLOOR } from "../matrix/lib/earlyloop.js";

const full = { security: 5, minSecurity: 5, money: 1e6, maxMoney: 1e6 };

// --- security comes first ----------------------------------------------------
// The old loop required `sec >= 95` before weakening. Security is capped at 100,
// so on a server sitting at 20 over a minimum of 5 it never weakened at all,
// and every hack pushed it further up.
assert.equal(nextAction({ ...full, security: 20, minSecurity: 5 }), "weaken",
    "15 above minimum must weaken - the old loop waited for 95 and never got there");
assert.equal(nextAction({ ...full, security: 60, minSecurity: 5 }), "weaken");
assert.equal(nextAction({ ...full, security: 94, minSecurity: 5 }), "weaken",
    "the old loop hacked here, at 89 over minimum");

// At or just above minimum there is nothing to gain from weakening.
assert.equal(nextAction({ ...full, security: 5, minSecurity: 5 }), "hack");
assert.equal(nextAction({ ...full, security: 5 + SECURITY_SLACK, minSecurity: 5 }), "hack",
    "exactly at the slack boundary is still worth hacking");
assert.equal(nextAction({ ...full, security: 5 + SECURITY_SLACK + 0.1, minSecurity: 5 }), "weaken",
    "just past it, weaken");

// --- then the balance --------------------------------------------------------
// The old loop only grew below 0.5% of maximum, so almost every hack landed on
// a drained server and took a percentage of nearly nothing.
assert.equal(nextAction({ ...full, money: 1e5, maxMoney: 1e6 }), "grow",
    "10% of maximum must grow - the old loop hacked it");
assert.equal(nextAction({ ...full, money: 4e5, maxMoney: 1e6 }), "grow",
    "40% of maximum must grow - the old loop hacked it");
assert.equal(nextAction({ ...full, money: 1e6, maxMoney: 1e6 }), "hack", "a full server is hacked");
assert.equal(nextAction({ ...full, money: 1e6 * MONEY_FLOOR, maxMoney: 1e6 }), "hack",
    "at the floor, take the cut rather than chase the last few percent");
assert.equal(nextAction({ ...full, money: 1e6 * MONEY_FLOOR - 1, maxMoney: 1e6 }), "grow");

// Security outranks money: a rich but noisy server is weakened first, because
// security multiplies the value of the hack that follows.
assert.equal(nextAction({ security: 40, minSecurity: 5, money: 1e6, maxMoney: 1e6 }), "weaken");

// --- servers with nothing to take --------------------------------------------
// Hacking a zero-money server earns nothing and raises security for free.
assert.equal(nextAction({ ...full, money: 0, maxMoney: 0 }), "grow");
assert.equal(nextAction({ ...full, money: 0, maxMoney: 1e6 }), "grow");

// --- degenerate input --------------------------------------------------------
// The worker reads live server state; a missing or malformed field must produce
// a safe action, never a crash in a loop running on hundreds of threads.
for (const junk of [{}, null, undefined, { security: NaN, maxMoney: NaN },
                    { security: "x", minSecurity: "y", money: null, maxMoney: undefined }]) {
    let action;
    assert.doesNotThrow(() => { action = nextAction(junk); }, `nextAction threw on ${JSON.stringify(junk)}`);
    assert.ok(["weaken", "grow", "hack"].includes(action), `returned ${action}`);
}
// With nothing known, growing is the safe default: it cannot waste a hack.
assert.equal(nextAction({}), "grow");

// --- the tuning knobs still work ---------------------------------------------
assert.equal(nextAction({ ...full, security: 12, minSecurity: 5 }, { slack: 20 }), "hack",
    "a wider slack tolerates more security");
assert.equal(nextAction({ ...full, money: 5e5, maxMoney: 1e6 }, { floor: 0.4 }), "hack",
    "a lower floor hacks sooner");

console.log("MATRIX-OS early loop passed: security before money, money before hacking, and no hacking an empty server.");
