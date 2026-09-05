/**
 * Config migrations.
 *
 * matrix/config.json is protected so the player's settings survive an update.
 * The cost is that a value which was only ever a DEFAULT gets frozen and then
 * silently overrides every later default. A live save carried
 * hacking.maxBatches: 24 from version 0.3.0, which capped every target and held
 * an 800 TB network at 5.7% utilisation. Removing it took that same save from
 * 168 batches to 790 - measured, not estimated.
 *
 * The rule that makes this safe: migrate only a value the player never changed.
 */
import assert from "node:assert/strict";
import { migrateConfig, CONFIG_MIGRATIONS } from "../matrix/lib/common.js";

// --- the real maxBatches case ------------------------------------------------
{
    const saved = { version: "0.3.0", hacking: { maxBatches: 24, batchGapMs: 120 } };
    const { config, applied } = migrateConfig(saved);
    assert.equal(config.hacking.maxBatches, null, "the stale cap must be lifted");
    assert.equal(config.hacking.batchGapMs, 120, "everything else is untouched");
    assert.equal(applied.length, 1);
    assert.match(applied[0].why, /schedule/, "a migration must explain itself");
    assert.equal(applied[0].path, "hacking.maxBatches");
}

// --- the live-proven maxTargets case -----------------------------------------
{
    const saved = { version: "1.10.0", hacking: { maxTargets: 32, batchGapMs: 120 } };
    const { config, applied } = migrateConfig(saved);
    assert.equal(config.hacking.maxTargets, 1024, "the stale 32-target ceiling must be lifted");
    assert.equal(config.hacking.batchGapMs, 120, "unrelated hacking settings are untouched");
    assert.equal(applied.length, 1);
    assert.equal(applied[0].path, "hacking.maxTargets");
    assert.match(applied[0].why, /32-target ceiling|28 PB|idle/, "the migration must preserve the live reason");
}

// --- a value the player chose is theirs --------------------------------------
// This is the whole safety property: only the exact old default is migrated.
for (const chosen of [1, 12, 50, 500, 0]) {
    const { config, applied } = migrateConfig({ hacking: { maxBatches: chosen } });
    assert.equal(config.hacking.maxBatches, chosen, `${chosen} was deliberate and must survive`);
    assert.equal(applied.length, 0);
}
for (const chosen of [1, 16, 31, 33, 64, 256, 2048, 0]) {
    const { config, applied } = migrateConfig({ hacking: { maxTargets: chosen } });
    assert.equal(config.hacking.maxTargets, chosen, `${chosen} target(s) was deliberate and must survive`);
    assert.equal(applied.length, 0);
}
// Already migrated: idempotent, and does not report a change it did not make.
{
    const { config, applied } = migrateConfig({ hacking: { maxBatches: null } });
    assert.equal(config.hacking.maxBatches, null);
    assert.deepEqual(applied, []);
}
{
    const { config, applied } = migrateConfig({ hacking: { maxTargets: 1024 } });
    assert.equal(config.hacking.maxTargets, 1024);
    assert.deepEqual(applied, []);
}
// A key that was never written stays absent, so the default applies normally.
{
    const { config, applied } = migrateConfig({ hacking: { batchGapMs: 120 } });
    assert.ok(!("maxBatches" in config.hacking), "an absent key must not be invented");
    assert.ok(!("maxTargets" in config.hacking), "an absent target ceiling must not be invented");
    assert.deepEqual(applied, []);
}

// --- the input is never mutated ----------------------------------------------
{
    const saved = { hacking: { maxBatches: 24 } };
    const result = migrateConfig(saved);
    assert.equal(saved.hacking.maxBatches, 24, "the caller's object must not be modified");
    assert.equal(result.config.hacking.maxBatches, null);
    assert.notEqual(result.config.hacking, saved.hacking, "and the copy must be deep");
}
{
    const saved = { hacking: { maxTargets: 32 } };
    const result = migrateConfig(saved);
    assert.equal(saved.hacking.maxTargets, 32, "the caller's target ceiling must not be modified");
    assert.equal(result.config.hacking.maxTargets, 1024);
    assert.notEqual(result.config.hacking, saved.hacking, "and the target-ceiling copy must be deep");
}

// --- malformed saves ---------------------------------------------------------
// config.json is player-editable and can be anything at all.
for (const junk of [null, undefined, {}, [], "text", 42, { hacking: null }, { hacking: "x" },
                    { hacking: { maxBatches: "24" } }, { hacking: { maxTargets: "32" } }]) {
    assert.doesNotThrow(() => migrateConfig(junk), `migrateConfig threw on ${JSON.stringify(junk)}`);
}
// Strings are not the numeric stale defaults and must not be migrated by coercion.
assert.equal(migrateConfig({ hacking: { maxBatches: "24" } }).applied.length, 0);
assert.equal(migrateConfig({ hacking: { maxTargets: "32" } }).applied.length, 0);
assert.doesNotThrow(() => migrateConfig({ hacking: { maxBatches: 24 } }, null));
assert.deepEqual(migrateConfig({ hacking: { maxBatches: 24 } }, []).applied, [],
    "no migrations means no changes");

// --- every migration is well formed -----------------------------------------
for (const migration of CONFIG_MIGRATIONS) {
    assert.ok(Array.isArray(migration.path) && migration.path.length, "a migration needs a path");
    assert.ok(migration.why && migration.why.length > 20, `${migration.path} needs a real explanation`);
    assert.notEqual(migration.stale, migration.next, "a migration that changes nothing is noise");
}

console.log(`MATRIX-OS migrate passed: ${CONFIG_MIGRATIONS.length} migration(s), and a value the player chose is never overwritten.`);
