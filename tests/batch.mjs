/**
 * Wave allocation - how much of the network the batcher actually uses.
 *
 * The reported symptom was 804 TB of rooted network at 1.3% utilisation. These
 * tests pin the two causes so neither can come back: a flat batch cap unrelated
 * to the schedule, and a single target that cannot absorb a large network no
 * matter how much RAM is free.
 */
import assert from "node:assert/strict";
import { batchCapacity, allocateWave, mergeWave } from "../matrix/lib/batch.js";

const shape = (ram, wTime = 60_000) => ({ ram, wTime });

// --- the schedule, not a magic number ----------------------------------------
// A batch takes four launch slots `gap` apart and clears in a weaken-time, so
// ~weakenTime / (4 * gap) can be in flight. At 60s and 120ms that is 125.
assert.equal(batchCapacity({ freeRam: 1e9, batchRam: 100, weakenTimeMs: 60_000, gapMs: 120 }), 125);
// A slower target sustains more concurrent batches, not fewer.
assert.ok(batchCapacity({ freeRam: 1e9, batchRam: 100, weakenTimeMs: 240_000, gapMs: 120 }) >
          batchCapacity({ freeRam: 1e9, batchRam: 100, weakenTimeMs: 60_000, gapMs: 120 }),
    "a longer weaken means more batches fit in the pipeline");
// A wider gap means fewer, because each batch occupies more of the timeline.
assert.ok(batchCapacity({ freeRam: 1e9, batchRam: 100, weakenTimeMs: 60_000, gapMs: 500 }) <
          batchCapacity({ freeRam: 1e9, batchRam: 100, weakenTimeMs: 60_000, gapMs: 120 }));

// --- RAM still bounds it -----------------------------------------------------
assert.equal(batchCapacity({ freeRam: 1000, batchRam: 100, weakenTimeMs: 60_000, gapMs: 120 }), 10,
    "ten batches of RAM means ten batches, whatever the schedule allows");
assert.equal(batchCapacity({ freeRam: 50, batchRam: 100 }), 0, "less than one batch is none");
assert.equal(batchCapacity({ freeRam: 1e9, batchRam: 0 }), 0, "a zero-size batch is not infinite batches");
assert.equal(batchCapacity({ freeRam: 1e9, batchRam: -5 }), 0);

// --- the old flat cap was the bug --------------------------------------------
// 24 was applied regardless of a network that could carry five times as many.
{
    const uncapped = batchCapacity({ freeRam: 1e9, batchRam: 1e6, weakenTimeMs: 60_000, gapMs: 120 });
    assert.ok(uncapped > 24, `the schedule allows ${uncapped}, the old code allowed 24`);
    assert.equal(batchCapacity({ freeRam: 1e9, batchRam: 1e6, weakenTimeMs: 60_000, gapMs: 120, configuredMax: 24 }), 24,
        "an explicit ceiling is still honoured when the player sets one");
}

// --- one target cannot absorb a big network ----------------------------------
// This is the whole reason utilisation was 1.3%: capacity is per target, so the
// leftover has to flow somewhere.
{
    const freeRam = 800_000_000;          // ~800 TB in GB
    const one = allocateWave([{ host: "a", shape: shape(1000) }], { freeRam });
    assert.equal(one.plan.length, 1);
    assert.ok(one.used < freeRam * 0.05,
        `a single target leaves the network idle - used ${one.used} of ${freeRam}`);

    const many = allocateWave(
        Array.from({ length: 12 }, (_, i) => ({ host: `t${i}`, shape: shape(1000) })), { freeRam });
    assert.ok(many.plan.length > 1, "more targets must actually be used");
    assert.ok(many.used > one.used * 5, "spreading across targets uses far more of the network");
}

// --- allocation order and accounting -----------------------------------------
{
    const targets = [
        { host: "best", shape: shape(100, 60_000) },
        { host: "second", shape: shape(100, 60_000) },
        { host: "third", shape: shape(100, 60_000) },
    ];
    // Room for exactly 125 batches (schedule cap) plus a little.
    const result = allocateWave(targets, { freeRam: 20_000, reserveFraction: 0 });
    assert.equal(result.plan[0].host, "best", "best target is served first");
    assert.equal(result.plan[0].batches, 125, "and takes its full schedule capacity");
    assert.ok(result.plan.length > 1, "the remainder flows down the list");
    const total = result.plan.reduce((sum, entry) => sum + entry.ram, 0);
    assert.ok(total <= 20_000, "a wave must never allocate more RAM than exists");
    assert.equal(total, result.used);
}

// A reserve is always held back so prep and the worm are not starved.
{
    const result = allocateWave([{ host: "a", shape: shape(1) }], { freeRam: 1000, reserveFraction: 0.1 });
    assert.ok(result.reserved >= 99, `expected ~100 GB reserved, got ${result.reserved}`);
    assert.ok(result.used <= 900);
}

// Targets that cannot fit even one batch are skipped, not allocated zero.
{
    const result = allocateWave([
        { host: "huge", shape: shape(1e9) },
        { host: "small", shape: shape(10) },
    ], { freeRam: 1000, reserveFraction: 0 });
    assert.deepEqual(result.plan.map(p => p.host), ["small"]);
}
assert.equal(allocateWave([], { freeRam: 1e6 }).plan.length, 0);
assert.equal(allocateWave([{ host: "a", shape: shape(100) }], { freeRam: 0 }).plan.length, 0);
assert.equal(allocateWave([{ host: "", shape: shape(100) }], { freeRam: 1e6 }).plan.length, 0);
assert.equal(allocateWave([{ host: "a", shape: { ram: 0 } }], { freeRam: 1e6 }).plan.length, 0);
assert.ok(allocateWave([{ host: "a", shape: shape(1) }], { freeRam: 1e9, maxTargets: 1 }).plan.length <= 1);

// --- merging into one ordered wave -------------------------------------------
{
    const plan = [
        { host: "a", shape: shape(10), batches: 2 },
        { host: "b", shape: shape(10), batches: 2 },
    ];
    const events = mergeWave(plan, (host, _s, batches) =>
        Array.from({ length: batches }, (_, i) => ({ host, finish: 1000 + i * 100, duration: 500 })));
    assert.equal(events.length, 4, "every target's events are present");
    for (let i = 1; i < events.length; i++) {
        const prev = events[i - 1].finish - events[i - 1].duration;
        const cur = events[i].finish - events[i].duration;
        assert.ok(cur >= prev, "events must be ordered by launch time, not finish time");
    }
    assert.ok(new Set(events.map(e => e.host)).size === 2, "both targets appear in one wave");
}
assert.deepEqual(mergeWave([], () => []), []);
assert.deepEqual(mergeWave(null, () => []), []);
assert.deepEqual(mergeWave([{ host: "a", shape: shape(1), batches: 1 }], null), [],
    "no event builder means no events, not a crash");

// --- hostile input -----------------------------------------------------------
for (const junk of [null, undefined, {}, { freeRam: NaN }, { freeRam: "x", gapMs: null }]) {
    assert.doesNotThrow(() => batchCapacity(junk));
    assert.doesNotThrow(() => allocateWave(null, junk));
    assert.doesNotThrow(() => allocateWave([{ host: "a", shape: null }], junk));
}

// --- leftover RAM prepares the rest of the network ---------------------------
// Hosts are only RAM; the limit is targets. So whatever the wave does not use
// goes into making more servers batchable - which pays hacking experience while
// it runs and money once each one joins the rotation.
{
    const { allocatePrep } = await import("../matrix/lib/batch.js");
    const needs = [
        { host: "a", op: "weaken", threads: 100, ram: 1.75 },
        { host: "b", op: "grow", threads: 200, ram: 1.75 },
        { host: "c", op: "weaken", threads: 50, ram: 1.75 },
    ];
    const full = allocatePrep(needs, { freeRam: 10_000 });
    assert.equal(full.plan.length, 3, "with plenty of RAM every waiting target is prepped");
    assert.deepEqual(full.plan.map(p => p.threads), [100, 200, 50], "each gets exactly what it needs");

    // Tight RAM: serve in order, and give a partial pass rather than nothing -
    // a half-finished weaken still lowers security and still earns experience.
    const tight = allocatePrep(needs, { freeRam: 175 });
    assert.equal(tight.plan[0].host, "a");
    assert.equal(tight.plan[0].threads, 100);
    assert.ok(tight.used <= 175, "never allocate more RAM than exists");
    assert.ok(tight.plan.length < 3, "and stop when it runs out");

    const partial = allocatePrep([{ host: "a", op: "weaken", threads: 100, ram: 1.75 }], { freeRam: 100 });
    assert.ok(partial.plan[0].threads > 0 && partial.plan[0].threads < 100, "a partial pass is still launched");

    assert.deepEqual(allocatePrep(needs, { freeRam: 0 }).plan, [], "no RAM, no prep");
    assert.deepEqual(allocatePrep([], { freeRam: 1e6 }).plan, []);
    assert.ok(allocatePrep(needs, { freeRam: 1e6, maxTargets: 1 }).plan.length <= 1);
    for (const junk of [null, undefined, [null], [{}], [{ host: "x", ram: 0, threads: 5 }]]) {
        assert.doesNotThrow(() => allocatePrep(junk, { freeRam: 100 }));
    }
    assert.doesNotThrow(() => allocatePrep(needs, null));
}


// --- the target cap must not be the binding constraint -----------------------
// A cap of 12 held an 800 TB network to ~37%: every target was already at its
// schedule limit, so the ceiling itself was the thing leaving RAM idle. A cap
// only earns its place by being generous enough that RAM binds first.
{
    const freeRam = 804_300;
    const targets = Array.from({ length: 60 }, (_, i) => ({ host: `t${i}`, shape: { ram: 200, wTime: 60_000 } }));

    const capped = allocateWave(targets, { freeRam, maxTargets: 12 });
    assert.ok(capped.used / freeRam < 0.45, "a cap of 12 provably cannot fill this network");
    assert.equal(capped.plan.length, 12, "and it is the cap, not the RAM, that stopped it");

    const generous = allocateWave(targets, { freeRam, maxTargets: 32 });
    assert.ok(generous.used / freeRam > 0.7,
        `a generous cap must use most of the network, got ${(100 * generous.used / freeRam).toFixed(1)}%`);
    assert.ok(generous.remaining < capped.remaining, "and leave less idle");

    // With enough targets, RAM is what stops the allocation - which is correct.
    const unlimited = allocateWave(targets, { freeRam, maxTargets: 60 });
    assert.ok(unlimited.plan.length < 60, "RAM should run out before the target list does");
    // What "RAM ran out" means here is that less than one more batch fits -
    // not that the remainder is zero.
    assert.ok(unlimited.remaining < 200,
        `less than one batch should remain, got ${unlimited.remaining.toFixed(0)} GB`);
}

console.log("MATRIX-OS batch passed: capacity follows the schedule, waves spread across targets, and leftover RAM preps the rest of the network.");