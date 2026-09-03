/**
 * Employment and RAM-expansion advice.
 *
 * Both are cases where the game shows a number but not its meaning: reputation
 * at a company that grants no faction, and a home RAM price that has quietly
 * become two orders of magnitude worse than the alternative.
 */
import assert from "node:assert/strict";
import { companyStatus, companyDirectives, FACTION_COMPANIES, COMPANY_FACTION_REP } from "../matrix/lib/factions.js";
import { ramExpansionAdvice, homeRamUpgradeCost, serverCost } from "../matrix/lib/capabilities.js";

// --- which employers are worth anything --------------------------------------
assert.equal(COMPANY_FACTION_REP, 400_000, "the game's CorpFactionRepRequirement is 400k, not 200k");
assert.equal(Object.keys(FACTION_COMPANIES).length, 10, "exactly ten companies grant a faction");
// The only company whose faction is named differently from itself.
assert.equal(FACTION_COMPANIES["Fulcrum Technologies"], "Fulcrum Secret Technologies");
for (const [company, faction] of Object.entries(FACTION_COMPANIES)) {
    assert.ok(company && faction, `${company} has no faction`);
}
assert.ok(!("Alpha Enterprises" in FACTION_COMPANIES), "Alpha Enterprises grants nothing");

// The player's real job: reputation there buys no faction, and saying so is the
// entire point - the game never tells you.
{
    const [job] = companyStatus({ "Alpha Enterprises": "Software Consultant" });
    assert.equal(job.faction, null);
    assert.equal(job.needed, null);
    const [directive] = companyDirectives({ "Alpha Enterprises": "Software Consultant" });
    assert.equal(directive.tag, "EMPLOYMENT");
    assert.match(directive.label, /unlocks no faction/);
    assert.match(directive.detail, /10 companies/);
}
// A job that does lead somewhere reports the target instead.
{
    const [directive] = companyDirectives({ "ECorp": "Software Engineer" });
    assert.match(directive.label, /toward ECorp/);
    // toLocaleString is locale-dependent - this machine groups with spaces, a
    // US browser with commas - so assert on the digits, not the separator.
    const digits = text => text.replace(/[^0-9/]/g, "");
    assert.ok(digits(directive.detail).includes("400000"), directive.detail);
    // With Singularity supplying real reputation it becomes a distance.
    const [withRep] = companyDirectives({ "ECorp": "Software Engineer" }, { rep: { ECorp: 120_000 } });
    assert.ok(digits(withRep.detail).includes("120000/400000"), withRep.detail);
}
// Once the faction is joined the job stops being a directive.
assert.deepEqual(companyDirectives({ "ECorp": "CTO" }, { factions: ["ECorp"] }), []);
assert.deepEqual(companyDirectives({}), []);
for (const junk of [null, undefined, "nope", { x: null }]) {
    assert.doesNotThrow(() => companyStatus(junk));
    assert.doesNotThrow(() => companyDirectives(junk));
}
assert.doesNotThrow(() => companyDirectives({ ECorp: "x" }, null));

// --- home RAM has become terrible value --------------------------------------
// Both figures below are from the player's own screenshots, so the formula is
// checked against the game rather than against itself.
assert.equal(Math.round(homeRamUpgradeCost(1024) / 1e6), 3177, "1.02 TB -> next upgrade $3.177b");
assert.equal(Math.round(homeRamUpgradeCost(4096) / 1e6), 31725, "4.10 TB -> next upgrade $31.725b");
assert.equal(serverCost(1), 55_000, "a purchased server is a flat $55k per GB");

{
    const advice = ramExpansionAdvice({ homeRam: 4096, ownedServers: [] });
    assert.equal(advice.better, "servers");
    assert.ok(advice.multiple > 100, `servers should be ~141x better, got ${advice.multiple.toFixed(0)}x`);
    assert.ok(advice.equivalentServerGb > 500_000, "the same money buys over 500 TB of server RAM");
}
// Home RAM gets worse with every doubling, never better.
assert.ok(ramExpansionAdvice({ homeRam: 8192 }).homePerGb > ramExpansionAdvice({ homeRam: 4096 }).homePerGb);
assert.ok(ramExpansionAdvice({ homeRam: 64 }).homePerGb < ramExpansionAdvice({ homeRam: 4096 }).homePerGb);
// Purchased servers are cheaper per gigabyte at EVERY scale - even at 8 GB,
// home costs $126k/GB against a flat $55k. So price alone would say "never buy
// home RAM", which is wrong: home RAM is the only RAM that runs the services,
// and each stage needs a threshold of it before its modules can start.
for (const ram of [8, 64, 512, 4096]) {
    assert.ok(ramExpansionAdvice({ homeRam: ram }).homePerGb > serverCost(1),
        `home RAM is never cheaper per GB (checked ${ram} GB)`);
}
assert.equal(ramExpansionAdvice({ homeRam: 8, ownedServers: [] }).better, "home",
    "below the stage threshold home RAM buys capability, not throughput");
assert.match(ramExpansionAdvice({ homeRam: 8 }).reason, /unlocks modules/);
assert.equal(ramExpansionAdvice({ homeRam: 64, stageThreshold: 128 }).better, "home");
assert.equal(ramExpansionAdvice({ homeRam: 256, ownedServers: [] }).better, "servers",
    "past the last stage threshold it is pure throughput, and price decides");
assert.match(ramExpansionAdvice({ homeRam: 4096 }).reason, /cheaper per gigabyte/);

// And it flips back once there is nowhere left to put a server.
{
    const full = Array.from({ length: 25 }, (_, i) => ({ host: `s${i}`, ram: 1_048_576 }));
    assert.equal(ramExpansionAdvice({ homeRam: 4096, ownedServers: full }).better, "home",
        "a full, maxed fleet leaves home as the only way to grow");
    const upgradable = Array.from({ length: 25 }, (_, i) => ({ host: `s${i}`, ram: 8 }));
    assert.equal(ramExpansionAdvice({ homeRam: 4096, ownedServers: upgradable }).better, "servers",
        "a full but small fleet can still be upgraded");
}
for (const junk of [null, undefined, {}, { homeRam: NaN }, { ownedServers: "x" }, { ownedServers: [null] }]) {
    assert.doesNotThrow(() => ramExpansionAdvice(junk));
}

console.log("MATRIX-OS company passed: 10 faction employers, and home RAM priced against servers at every scale.");
