/**
 * Faction requirement table, checked against known answers.
 *
 * This is the knowledge that lets MATRIX tell the player what to do while the
 * Singularity API is locked, so a wrong entry here is a wrong instruction on
 * screen. Every case below is a situation the player is actually in.
 */
import assert from "node:assert/strict";
import {
    factionPlan, factionDirectives, unmetRequirements, playerSnapshot, FACTIONS, CITY_FACTIONS,
} from "../matrix/lib/factions.js";

const names = FACTIONS.map(f => f.name);
assert.equal(new Set(names).size, names.length, "duplicate faction in the table");
for (const city of CITY_FACTIONS) assert.ok(names.includes(city), `${city} missing from the table`);

// --- the player's real save: hacking 252, combat 1, $1.883b, Sector-12 -------
const live = {
    skills: { hacking: 252, strength: 1, defense: 1, dexterity: 1, agility: 1, charisma: 88 },
    money: 1.883e9, city: "Sector-12", karma: 0, kills: 0, factions: [], backdoors: [],
    hacknet: { levels: 0, ram: 0, cores: 0 },
};

const plan = factionPlan(live);
const eligible = plan.eligible.map(f => f.name);

// Sector-12 wants $15m and residence. Both true, so the game shows an invite -
// which is exactly what the player screenshotted.
assert.ok(eligible.includes("Sector-12"), `Sector-12 should be joinable, got ${eligible.join(", ")}`);
// Tian Di Hui needs a different city, so it must NOT be offered here.
assert.ok(!eligible.includes("Tian Di Hui"), "Tian Di Hui needs Chongqing / New Tokyo / Ishima");
// No backdoors yet, so no hacking faction is joinable.
for (const faction of ["CyberSec", "NiteSec", "The Black Hand", "BitRunners"]) {
    assert.ok(!eligible.includes(faction), `${faction} needs a backdoor first`);
}
// Combat stats are 1, so nothing crime-side is available.
for (const faction of ["Slum Snakes", "Tetrads", "The Syndicate"]) {
    assert.ok(!eligible.includes(faction), `${faction} needs combat stats`);
}
// Aevum/Volhaven are affordable but the player is not there.
assert.ok(!eligible.includes("Aevum"), "Aevum requires being in Aevum");

// --- backdoors are the whole early tree -------------------------------------
const withBackdoor = factionPlan({ ...live, backdoors: ["CSEC"] });
assert.ok(withBackdoor.eligible.map(f => f.name).includes("CyberSec"),
    "backdooring CSEC must make CyberSec joinable");

// --- karma is negative, and more negative is MORE qualified -----------------
const thug = { ...live, skills: { ...live.skills, strength: 40, defense: 40, dexterity: 40, agility: 40 } };
assert.ok(!factionPlan({ ...thug, karma: 0 }).eligible.some(f => f.name === "Slum Snakes"),
    "karma 0 must not qualify for Slum Snakes");
assert.ok(factionPlan({ ...thug, karma: -12 }).eligible.some(f => f.name === "Slum Snakes"),
    "karma -12 is past the -9 requirement");
assert.ok(!factionPlan({ ...thug, karma: -5 }).eligible.some(f => f.name === "Slum Snakes"),
    "karma -5 has not reached -9");

// --- Daedalus takes hacking OR combat, not both ------------------------------
const daedalus = FACTIONS.find(f => f.name === "Daedalus").req;
const rich = playerSnapshot({ money: 200e9, augs: 30, skills: { hacking: 2500 } });
assert.deepEqual(unmetRequirements(daedalus, rich), [], "hacking 2500 alone must satisfy Daedalus");
const brawler = playerSnapshot({
    money: 200e9, augs: 30,
    skills: { hacking: 1, strength: 1500, defense: 1500, dexterity: 1500, agility: 1500 },
});
assert.deepEqual(unmetRequirements(daedalus, brawler), [], "all combat 1500 alone must satisfy Daedalus");
const neither = playerSnapshot({ money: 200e9, augs: 30, skills: { hacking: 100 } });
assert.equal(unmetRequirements(daedalus, neither).length, 1, "neither path met should report exactly one blocker");

// --- Netburners tracks hacknet totals ----------------------------------------
const netburners = FACTIONS.find(f => f.name === "Netburners").req;
assert.deepEqual(
    unmetRequirements(netburners, playerSnapshot({
        skills: { hacking: 80 }, hacknet: { levels: 100, ram: 8, cores: 4 },
    })), [], "exact hacknet totals must qualify");
assert.ok(unmetRequirements(netburners, playerSnapshot({
    skills: { hacking: 80 }, hacknet: { levels: 99, ram: 8, cores: 4 },
})).length === 1, "one level short must report one blocker");


// --- "done" and "actionable" are different sets ------------------------------
// backdoors = effectively done (its faction is joined). reachable = rooted and
// in hacking range, so the player can do it right now. Confusing the two would
// either mark a faction joinable when it is not, or nag about finished work.
const bdBase = { ...live, factions: [], backdoors: [], reachable: ["CSEC"] };
const bd = factionDirectives(bdBase, { limit: 6 });
const csec = bd.find(d => d.id === "BACKDOOR_CyberSec");
assert.ok(csec, "a reachable, unjoined backdoor must be an instruction");
assert.equal(csec.ready, true, "CSEC is rooted and in range, so it is actionable now");
const nite = bd.find(d => d.id === "BACKDOOR_NiteSec");
assert.equal(nite?.ready, false, "avmnite-02h is not reachable, so it is not yet actionable");
assert.match(nite.detail, /not rooted or out of hacking range/);

// Reachability must NOT make the faction joinable.
assert.ok(!factionPlan(bdBase).eligible.some(f => f.name === "CyberSec"),
    "being able to backdoor CSEC is not the same as having joined CyberSec");

// Once CyberSec is joined, its backdoor is done and must stop being mentioned.
const after = factionDirectives({ ...bdBase, factions: ["CyberSec"], backdoors: ["CSEC"] }, { limit: 6 });
assert.ok(!after.some(d => d.id === "BACKDOOR_CyberSec"), "a finished backdoor must not be nagged about");
assert.ok(factionPlan({ ...bdBase, factions: ["CyberSec"], backdoors: ["CSEC"] }).joined.some(f => f.name === "CyberSec"));

// --- the player's real screenshot: two pending invitations -------------------
const real = factionDirectives(
    { ...live, factions: [], hacknet: { levels: 120, ram: 16, cores: 8 } }, { limit: 5 });
const joins = real.filter(d => d.tag === "JOIN").map(d => d.label);
assert.deepEqual(joins.sort(), ["Join Netburners", "Join Sector-12"],
    `expected exactly the two invitations the game is showing, got ${joins.join(", ")}`);

// --- directives are instructions, and must never crash on junk ---------------
const directives = factionDirectives(live);
assert.ok(directives.length > 0, "a player with a pending invitation must get a directive");
assert.equal(directives[0].tag, "JOIN", "a joinable faction outranks everything else");
assert.match(directives[0].detail, /Factions tab/, "without Singularity, tell the player to click Join");
assert.match(factionDirectives(live, { singularity: true })[0].detail, /automatically/,
    "with Singularity, MATRIX joins it rather than nagging the player");

for (const junk of [{}, { skills: null, factions: null, backdoors: null }, { skills: { hacking: NaN }, money: null },
                    { factions: "not-an-array", karma: "x", hacknet: null }]) {
    assert.doesNotThrow(() => factionDirectives(junk), `factionDirectives threw on ${JSON.stringify(junk)}`);
    assert.doesNotThrow(() => factionPlan(junk), `factionPlan threw on ${JSON.stringify(junk)}`);
}

// A brand-new save must still produce a sensible first instruction.
const fresh = factionDirectives({ skills: { hacking: 1 }, money: 0, city: "Sector-12" });
assert.ok(fresh.length > 0, "a fresh save must still be told what to aim at");

console.log(`MATRIX-OS factions passed: ${FACTIONS.length} factions, ${directives.length} live directives for the current save.`);
