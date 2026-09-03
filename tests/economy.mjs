/**
 * Early-game economics.
 *
 * The reserve and the manager fractions decide whether MATRIX can buy anything
 * at all. Set wrong they do not error, they just quietly do nothing - which is
 * exactly what happened: a flat $10m floor meant no infrastructure was bought
 * until $50m of cash, for the entire early game.
 */
import assert from "node:assert/strict";
import { reserveFloor, managerFraction } from "../matrix/lib/common.js";
import { serverPurchasePlan, serverCost, bestServerBuy } from "../matrix/lib/capabilities.js";

const cfg = { economy: { cashReserve: 10e6, reserveFraction: 0.15, cloudBudgetFraction: 0.12 } };
const budget = (cash, homeRam) => Math.max(0,
    Math.min(cash - reserveFloor(cash, cfg), cash * managerFraction("cloud", { configured: 0.12, homeRam })));

// --- the bug: nothing was affordable before $50m -----------------------------
// A flat $10m reserve exceeds the whole balance below $10m, so `cash - reserve`
// was negative and every budget clamped to zero.
{
    const oldReserve = cash => Math.max(10e6, cash * 0.15);
    assert.ok(1e6 - oldReserve(1e6) < 0, "the old rule really did reserve more than the player owned");
    assert.ok(budget(1e6, 16) > 0, "a player with $1m must be able to buy something");
}

// The smallest useful server is 8 GB at $440k. That has to be reachable early.
assert.equal(serverCost(8), 440_000);
assert.ok(budget(1e6, 16) >= 440_000, `$1m should afford an 8 GB server, got ${budget(1e6, 16)}`);
assert.ok(budget(6e5, 16) >= 440_000, `$600k should afford one too, got ${budget(6e5, 16)}`);

// --- the reserve still protects something ------------------------------------
for (const cash of [1e5, 1e6, 1e8, 1e10]) {
    const reserve = reserveFloor(cash, cfg);
    assert.ok(reserve > 0, "there is always some reserve");
    assert.ok(reserve < cash, `reserve must never exceed the balance (cash ${cash})`);
    assert.ok(reserve >= cash * 0.15 - 1e-6, "the fractional reserve is always honoured");
}
// Once rich, the full flat reserve applies again rather than staying scaled.
assert.equal(reserveFloor(1e9, cfg), 1e9 * 0.15, "at $1b the 15% fraction dominates");
assert.ok(reserveFloor(4e7, cfg) >= 1e7, "past $40m the flat $10m floor is fully honoured");
for (const junk of [null, undefined, NaN, -5]) {
    assert.ok(Number.isFinite(reserveFloor(junk, cfg)), `reserveFloor(${junk}) must be a number`);
    assert.ok(reserveFloor(junk, cfg) >= 0);
}
assert.ok(Number.isFinite(reserveFloor(1e6, {})), "a config with no economy block still works");
assert.ok(Number.isFinite(reserveFloor(1e6)), "and no config at all");

// --- aggression is early only ------------------------------------------------
assert.ok(managerFraction("cloud", { configured: 0.12, homeRam: 16 }) > 0.12,
    "below the threshold, spend hard on worker RAM");
assert.equal(managerFraction("cloud", { configured: 0.12, homeRam: 1024 }), 0.12,
    "once home is large, revert to the configured fraction");
assert.equal(managerFraction("hacknet", { configured: 0.04, homeRam: 16 }), 0.04,
    "only the cloud manager is made aggressive - hacknet is a poor early investment");
assert.equal(managerFraction("stock", { configured: 0.25, homeRam: 16 }), 0.25);

// A coordinator directive always wins, including one that says "stop spending".
assert.equal(managerFraction("cloud", { configured: 0.12, homeRam: 16, directive: 0 }), 0,
    "an explicit zero directive must halt spending even in the aggressive phase");
assert.equal(managerFraction("cloud", { configured: 0.12, homeRam: 16, directive: 0.5 }), 0.5);
// Number(null) is 0 and 0 is finite: testing the coercion alone would read
// "no directive" as "spend nothing" and silently zero every budget.
assert.ok(managerFraction("cloud", { configured: 0.12, homeRam: 16, directive: null }) > 0.12,
    "a null directive means no directive, not zero");
assert.ok(managerFraction("cloud", { configured: 0.12, homeRam: 16, directive: undefined }) > 0.12);
assert.ok(managerFraction("cloud", { configured: 0.12, homeRam: 16, directive: "" }) > 0.12);
assert.equal(managerFraction("cloud", { configured: 0.12, homeRam: 16, directive: "junk" }), 0.75,
    "an unparseable directive falls back rather than zeroing");

// --- what the budget actually buys -------------------------------------------
assert.equal(bestServerBuy(440_000), 8);
assert.equal(bestServerBuy(100), 0, "too little buys nothing");
{
    const plan = serverPurchasePlan({ budget: 440_000, owned: [] });
    assert.equal(plan.action, "buy");
    assert.equal(plan.ram, 8);
    assert.ok(plan.cost <= 440_000, "never plan a purchase the budget cannot cover");
}
// Buy now rather than saving for a bigger box: the smaller one starts earning
// immediately and funds the next.
{
    assert.equal(serverPurchasePlan({ budget: 7.5e5, owned: [] }).ram, 8);
    assert.equal(serverPurchasePlan({ budget: 3.75e6, owned: [] }).ram, 64);
}
// A full fleet only replaces its weakest machine, and only for a real multiple.
{
    const owned = Array.from({ length: 25 }, (_, i) => ({ host: `mx-${i}`, ram: 8 }));
    assert.equal(serverPurchasePlan({ budget: 5e5, owned }).action, "wait",
        "a marginal upgrade is not worth killing a working server");
    const upgrade = serverPurchasePlan({ budget: 3.75e6, owned });
    assert.equal(upgrade.action, "replace");
    assert.equal(upgrade.host, "mx-0");
    assert.ok(upgrade.ram >= 8 * 4, "replacement must be a real multiple");
}
// Respect a smaller fleet limit and a lower RAM cap.
assert.equal(serverPurchasePlan({ budget: 1e9, owned: [{ host: "a", ram: 8 }], limit: 1 }).action, "replace");
assert.ok(serverPurchasePlan({ budget: 1e12, owned: [], ramLimit: 64 }).ram <= 64);

for (const junk of [{}, null, undefined, { owned: null }, { owned: [null, {}], budget: NaN }]) {
    assert.doesNotThrow(() => serverPurchasePlan(junk), `serverPurchasePlan threw on ${JSON.stringify(junk)}`);
}


// --- the home reserve is headroom, not waste ---------------------------------
// It exists so the supervisor can relaunch a service. A flat 24 GB was sized
// for a 32 GB home and never grew: at 4 TB it still held back 24 GB, which fits
// contracts.js at 21.8 but not two at once, and not singularity.js at 79.7 once
// SF4 arrives. A service that cannot relaunch is a module silently missing.
{
    const { homeReserveFor } = await import("../matrix/lib/capabilities.js");
    assert.equal(homeReserveFor(32, {}), 24, "small homes keep the configured floor");
    assert.equal(homeReserveFor(1024, {}), 24, "2% of 1 TB is still under the floor");
    assert.ok(homeReserveFor(4096, {}) > 79.7,
        "a 4 TB home must be able to relaunch singularity.js at 79.7 GB");
    assert.ok(homeReserveFor(8192, {}) > homeReserveFor(4096, {}), "it scales with home");
    assert.equal(homeReserveFor(1_048_576, {}), 512, "and is capped so it never becomes silly");

    // The reserve must never eat a meaningful share of a large home.
    for (const home of [4096, 8192, 65536]) {
        assert.ok(homeReserveFor(home, {}) / home <= 0.021, `reserve is over 2% at ${home} GB`);
    }
    // An explicit configuration is always honoured as a floor.
    assert.equal(homeReserveFor(32, { hacking: { homeReserveGb: 100 } }), 100);
    assert.ok(homeReserveFor(1_048_576, { hacking: { homeReserveGb: 900 } }) >= 900,
        "a configured value above the cap still wins");
    for (const junk of [null, undefined, NaN, -5, "x"]) {
        assert.ok(Number.isFinite(homeReserveFor(junk, {})), `homeReserveFor(${junk}) must be a number`);
        assert.ok(homeReserveFor(4096, junk) > 0);
    }
}

console.log("MATRIX-OS economy passed: $1m now buys a server, the reserve never exceeds the balance, aggression is early-only.");