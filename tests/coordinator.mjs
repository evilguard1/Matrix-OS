/**
 * Coordinator milestone selection.
 *
 * The coordinator decides what the whole system saves for, so a milestone that
 * cannot clear stalls every other module behind it. That is exactly what
 * happened: hasTor was read from singularity.txt, which does not exist below
 * SF4, so "Reaching $200k for TOR Router" stayed on screen with the router
 * already bought.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Services import by absolute in-game path ("/matrix/lib/common.js"), which
// Node cannot resolve. Rewrite them to file URLs and load the real module, so
// this tests the shipped code rather than a copy of its logic.
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");
const source = fs.readFileSync(path.join(root, "matrix/services/coordinator.js"), "utf8")
    .replace(/from\s*["'](\/matrix\/[^"']+)["']/g,
        (_, spec) => `from "${pathToFileURL(path.join(root, spec.replace(/^\//, ""))).href}"`);
const { evaluateObjective, planDirectives, formatEta } =
    await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const base = {
    cash: 1.883e9, cashRate: 1e6, hackingLevel: 252, karma: 0,
    homeRam: 1024, homeRamUpgradeCost: 3.177e9,
    resetInfo: { currentNode: 1, ownedSF: new Map() },
    factions: [], totalAssets: 1.883e9,
};

// --- the reported bug --------------------------------------------------------
{
    const without = evaluateObjective({ ...base, hasTor: false });
    assert.equal(without.id, "BUY_TOR", "with no router, buying one is the objective");

    const with_ = evaluateObjective({ ...base, hasTor: true });
    assert.notEqual(with_.id, "BUY_TOR",
        "owning the router must clear the milestone - this is what stalled at $200k");
    assert.ok(!/TOR/i.test(with_.nextStep ?? ""), `next step still mentions TOR: ${with_.nextStep}`);
}

// A player who already owns the router but has no program data must move on to
// something real rather than sitting on a cleared milestone.
{
    const objective = evaluateObjective({ ...base, hasTor: true, missingPrograms: [], programCosts: 0 });
    assert.ok(objective.id && objective.title, "there is always a next objective");
    assert.ok(objective.milestone && Number.isFinite(objective.milestone.pct),
        "every objective carries a finite percentage - the deck renders it");
}

// --- port programs -----------------------------------------------------------
{
    const buying = evaluateObjective({
        ...base, hasTor: true, missingPrograms: ["HTTPWorm.exe", "SQLInject.exe"], programCosts: 280e6,
    });
    assert.equal(buying.id, "BUY_PROGRAMS");
    assert.match(buying.reason, /HTTPWorm/);
}
// An empty program list must never produce a zero-cost milestone: dividing by it
// yields Infinity or NaN and the deck shows a broken bar.
{
    const objective = evaluateObjective({ ...base, hasTor: true, missingPrograms: [], programCosts: 0 });
    assert.notEqual(objective.id, "BUY_PROGRAMS", "no missing programs means no program milestone");
}

// --- home RAM ceiling --------------------------------------------------------
// The old `homeRam < 64` cut-off meant this never appeared again past 64 GB.
{
    const objective = evaluateObjective({
        ...base, hasTor: true, homeRam: 1024, homeRamUpgradeCost: 3.177e9, cash: 2e9,
    });
    assert.ok(objective, "a 1 TB machine still has a next objective");
}

// --- every objective is renderable -------------------------------------------
for (const hasTor of [true, false]) {
    for (const cash of [0, 1e6, 1e9, 1e12]) {
        const objective = evaluateObjective({ ...base, hasTor, cash, totalAssets: cash });
        assert.ok(objective.milestone, `no milestone at cash ${cash}`);
        const pct = objective.milestone.pct;
        assert.ok(Number.isFinite(pct) && pct >= 0 && pct <= 100,
            `milestone pct out of range at cash ${cash}, hasTor ${hasTor}: ${pct}`);
        assert.ok(typeof objective.nextStep === "string" && objective.nextStep.length > 0);
    }
}

// --- directives are always complete ------------------------------------------
{
    const plan = planDirectives({ ...base, hasTor: true });
    assert.ok(plan.phase, "a plan always names its phase");
    assert.ok(plan.objectiveId, "and the objective it came from");
    for (const key of ["hacking", "gang", "singularity", "stock"]) {
        assert.ok(plan.directives[key], `directive "${key}" missing`);
    }
    assert.ok(plan.budgets && typeof plan.budgets === "object");

    // The TOR objective used to share the id "BUY_PROGRAMS", so while it was
    // active every manager was steered by the wrong branch of this table.
    const withoutTor = planDirectives({ ...base, hasTor: false });
    assert.equal(withoutTor.objectiveId, "BUY_TOR", "each objective needs its own id");
    assert.notEqual(withoutTor.objectiveId, planDirectives({
        ...base, hasTor: true, missingPrograms: ["HTTPWorm.exe"], programCosts: 30e6,
    }).objectiveId, "buying the router and buying programs are different objectives");
}

assert.equal(typeof formatEta(90), "string");
for (const junk of [{}, { resetInfo: null }, { cash: NaN, homeRamUpgradeCost: NaN }]) {
    assert.doesNotThrow(() => evaluateObjective(junk), `evaluateObjective threw on ${JSON.stringify(junk)}`);
    assert.doesNotThrow(() => planDirectives(junk));
}

console.log("MATRIX-OS coordinator passed: owning the TOR router clears its milestone, every objective renders.");
