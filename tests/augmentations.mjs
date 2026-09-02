/**
 * Augmentation knowledge and planning.
 *
 * The table is generated from the game's own data files, so these tests check
 * its integrity and then the planning rules on top of it - which faction can
 * actually sell an implant, what is affordable, and what is merely close.
 */
import assert from "node:assert/strict";
import {
    AUGMENTATIONS, augmentationPlan, bestFactionToGrind, augmentationDirectives, NEUROFLUX,
} from "../matrix/lib/augmentations.js";
import { FACTIONS, CITY_FACTIONS } from "../matrix/lib/factions.js";

// --- table integrity ---------------------------------------------------------
assert.ok(AUGMENTATIONS.length > 40, "the generated table looks truncated");
const names = AUGMENTATIONS.map(a => a.name);
assert.equal(new Set(names).size, names.length, "duplicate augmentation in the table");
for (const aug of AUGMENTATIONS) {
    assert.ok(aug.name && typeof aug.name === "string", "every row needs a name");
    assert.ok(Number.isFinite(aug.rep) && aug.rep >= 0, `${aug.name} has a bad rep cost`);
    assert.ok(Number.isFinite(aug.money) && aug.money > 0, `${aug.name} has a bad money cost`);
    assert.ok(Array.isArray(aug.factions) && aug.factions.length, `${aug.name} has no seller`);
    assert.ok(aug.value > 0, `${aug.name} should not be in a table of valued augmentations`);
}

// Faction names must match factions.js exactly, or the planner silently finds
// nothing: the two tables are cross-referenced by string.
const known = new Set([...FACTIONS.map(f => f.name), ...CITY_FACTIONS]);
const megacorps = new Set(["ECorp", "MegaCorp", "Bachman & Associates", "Blade Industries", "NWO",
    "Clarke Incorporated", "OmniTek Incorporated", "Four Sigma", "KuaiGong International",
    "Fulcrum Secret Technologies", "Bladeburners", "Church of the Machine God", "Shadows of Anarchy"]);
for (const aug of AUGMENTATIONS) {
    for (const faction of aug.factions) {
        assert.ok(known.has(faction) || megacorps.has(faction),
            `${aug.name} is sold by "${faction}", which matches no known faction name`);
    }
}
// Spot-check a well-known entry against the game's published numbers.
const bitwire = AUGMENTATIONS.find(a => a.name === "BitWire");
assert.ok(bitwire, "BitWire missing from the table");
assert.equal(bitwire.rep, 3750);
assert.equal(bitwire.money, 10000000);
assert.ok(bitwire.factions.includes("CyberSec") && bitwire.factions.includes("NiteSec"));

// --- only a joined faction can sell to you -----------------------------------
{
    const plan = augmentationPlan({ factions: [], money: 1e12 });
    assert.equal(plan.total, 0, "with no factions joined, nothing is purchasable at any price");
}
{
    const plan = augmentationPlan({ factions: ["CyberSec"], factionRep: { CyberSec: 1e9 }, money: 1e12 });
    assert.ok(plan.ready.length > 0, "a joined faction with rep and cash offers something");
    for (const aug of plan.ready) {
        assert.ok(aug.factions.includes("CyberSec"), `${aug.name} is not sold by CyberSec`);
        assert.equal(aug.faction, "CyberSec");
    }
}

// --- owned augmentations disappear -------------------------------------------
{
    const rich = { factions: ["CyberSec"], factionRep: { CyberSec: 1e9 }, money: 1e12 };
    const before = augmentationPlan({ ...rich, limit: 99 }).ready.map(a => a.name);
    assert.ok(before.includes("BitWire"));
    const after = augmentationPlan({ ...rich, owned: ["BitWire"], limit: 99 }).ready.map(a => a.name);
    assert.ok(!after.includes("BitWire"), "an owned augmentation must not be offered again");
    assert.equal(after.length, before.length - 1);
}

// --- affordability is rep AND money ------------------------------------------
{
    // Enough rep, no cash.
    const broke = augmentationPlan({ factions: ["CyberSec"], factionRep: { CyberSec: 1e9 }, money: 0 });
    assert.equal(broke.ready.length, 0, "rep alone does not buy an implant");
    assert.ok(broke.blocked.length > 0, "but it should still be reported as blocked");
    assert.ok(broke.blocked.every(a => a.moneyShort > 0));
    // Enough cash, no rep.
    const unknown = augmentationPlan({ factions: ["CyberSec"], factionRep: {}, money: 1e12 });
    assert.equal(unknown.ready.length, 0, "cash alone does not buy an implant");
    assert.ok(unknown.blocked.every(a => a.repShort > 0));
}

// --- buy from whichever joined faction is furthest along ---------------------
{
    // BitWire is sold by both CyberSec and NiteSec; the one with more rep wins.
    const plan = augmentationPlan({
        factions: ["CyberSec", "NiteSec"],
        factionRep: { CyberSec: 100, NiteSec: 50000 },
        money: 1e12, limit: 99,
    });
    const found = plan.ready.find(a => a.name === "BitWire");
    assert.ok(found, "BitWire should be buyable");
    assert.equal(found.faction, "NiteSec", "buy from the faction that already has the reputation");
}

// --- which faction to grind --------------------------------------------------
{
    const grind = bestFactionToGrind({ factions: ["CyberSec", "Netburners"], factionRep: {} });
    assert.ok(grind && grind.faction, "with locked augmentations there is always somewhere to grind");
    assert.ok(grind.augs > 0 && grind.repNeeded > 0);
    // Nothing left to unlock means nothing to grind for.
    assert.equal(bestFactionToGrind({ factions: ["CyberSec"], factionRep: { CyberSec: 1e12 } }), null);
    assert.equal(bestFactionToGrind({ factions: [] }), null);
}

// --- directives --------------------------------------------------------------
{
    const state = { factions: ["CyberSec"], factionRep: { CyberSec: 1e9 }, money: 1e12 };
    const buy = augmentationDirectives(state);
    assert.equal(buy[0].tag, "AUGMENT");
    assert.match(buy[0].detail, /Augmentations tab/, "without Singularity, tell the player where to click");
    assert.match(augmentationDirectives(state, { singularity: true })[0].detail, /MATRIX purchases/,
        "with Singularity, MATRIX buys it instead of nagging");
    // With no cash the advice becomes "go earn reputation", not silence.
    const poor = augmentationDirectives({ factions: ["CyberSec"], factionRep: {}, money: 0 });
    assert.ok(poor.some(d => d.tag === "REPUTATION"), "a blocked player still gets a direction");
}

// --- junk ---------------------------------------------------------------------
for (const junk of [{}, { factions: null, owned: null }, { factionRep: "x", money: NaN },
                    { factions: ["CyberSec"], factionRep: { CyberSec: "lots" } }]) {
    assert.doesNotThrow(() => augmentationPlan(junk), `augmentationPlan threw on ${JSON.stringify(junk)}`);
    assert.doesNotThrow(() => bestFactionToGrind(junk));
    assert.doesNotThrow(() => augmentationDirectives(junk));
}
assert.equal(typeof NEUROFLUX, "string");

console.log(`MATRIX-OS augmentations passed: ${AUGMENTATIONS.length} implants from the game's own data, faction names cross-checked.`);
