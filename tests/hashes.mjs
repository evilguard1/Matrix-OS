/**
 * Hash spending priority.
 *
 * Selling hashes for money is the default and the worst option: it converts a
 * compounding resource into a one-off. These tests pin the ordering that makes
 * hashes actually worth generating.
 */
import assert from "node:assert/strict";
import { hashPlan, nextHashSpend, SERVER_UPGRADE_LIMIT } from "../matrix/lib/hashes.js";

const ALL = ["Sell for Money", "Reduce Minimum Security", "Increase Maximum Money",
             "Generate Coding Contract", "Exchange for Bladeburner Rank",
             "Exchange for Bladeburner SP", "Exchange for Corporation Research"];
const cheap = () => 4;

// --- the target upgrades outrank cash ---------------------------------------
{
    const first = nextHashSpend({ hashes: 100, capacity: 100, available: ALL, target: "phantasy", costOf: cheap });
    assert.equal(first.upgrade, "Reduce Minimum Security", "server upgrades come before selling for money");
    assert.equal(first.target, "phantasy", "and they are aimed at the batcher's target");
}
// Even with the pool overflowing, cash is still last.
{
    const plan = hashPlan({ hashes: 999, capacity: 100, available: ALL, target: "phantasy", costOf: cheap });
    assert.equal(plan.at(-1).upgrade, "Sell for Money", "cash is the fallback, not the default");
    assert.ok(plan.findIndex(p => p.upgrade === "Increase Maximum Money") <
              plan.findIndex(p => p.upgrade === "Sell for Money"));
}

// --- no target means no server upgrades -------------------------------------
{
    const plan = hashPlan({ hashes: 100, capacity: 100, available: ALL, target: null, costOf: cheap });
    assert.ok(!plan.some(p => p.upgrade === "Reduce Minimum Security"),
        "a server upgrade with no server is a wasted purchase");
}
// Past the cap the game silently wastes them, so stop asking.
{
    const plan = hashPlan({ hashes: 100, capacity: 100, available: ALL, target: "phantasy",
                            serverUpgrades: SERVER_UPGRADE_LIMIT, costOf: cheap });
    assert.ok(!plan.some(p => p.target), "no more server upgrades once capped");
}

// --- only ever propose what the game offers and we can pay for --------------
{
    const plan = hashPlan({ hashes: 100, capacity: 100, available: ["Sell for Money"], target: "phantasy", costOf: cheap });
    assert.deepEqual(plan.map(p => p.upgrade), ["Sell for Money"], "absent upgrades are never proposed");
}
{
    assert.equal(nextHashSpend({ hashes: 3, capacity: 100, available: ALL, target: "phantasy", costOf: () => 50 }),
        null, "nothing affordable means nothing proposed");
    assert.equal(nextHashSpend({ hashes: 100, capacity: 100, available: ALL, target: "x", costOf: () => Infinity }),
        null, "an unpriceable upgrade is not proposed");
}
// Below 80% capacity, don't dump to cash at all.
{
    const plan = hashPlan({ hashes: 50, capacity: 100, available: ["Sell for Money"], costOf: cheap });
    assert.deepEqual(plan, [], "hold hashes while there is room to accumulate");
}

// --- Source-File sinks appear only when that Source-File is present ----------
{
    const without = hashPlan({ hashes: 100, capacity: 100, available: ALL, costOf: cheap });
    assert.ok(!without.some(p => p.upgrade.includes("Bladeburner")), "no Bladeburner spend without Bladeburner");
    const with_ = hashPlan({ hashes: 100, capacity: 100, available: ALL, costOf: cheap, bladeburner: true });
    assert.ok(with_.some(p => p.upgrade === "Exchange for Bladeburner Rank"));
}

// --- junk must not throw -----------------------------------------------------
for (const junk of [{}, { available: null }, { available: "x", costOf: null }, { hashes: NaN, capacity: NaN }]) {
    assert.doesNotThrow(() => hashPlan(junk), `hashPlan threw on ${JSON.stringify(junk)}`);
}
assert.doesNotThrow(() => hashPlan());

// Every entry must explain itself - the deck prints this.
for (const entry of hashPlan({ hashes: 999, capacity: 100, available: ALL, target: "t", costOf: cheap,
                               bladeburner: true, corporation: true })) {
    assert.ok(entry.why && entry.why.length > 8, `${entry.upgrade} has no reason`);
}

console.log("MATRIX-OS hashes passed: compounding server upgrades outrank cash, capped and gated correctly.");
