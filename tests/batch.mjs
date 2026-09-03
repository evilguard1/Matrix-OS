import assert from "node:assert/strict";
import fs from "node:fs";
import {
    pipelineDepth,
    batchCapacity,
    allocatePrep,
    placementCapacity,
    planBatchPlacement,
    execTag,
} from "../matrix/lib/batch.js";

// Stable rolling depth follows one full four-slot stride.
assert.equal(pipelineDepth({ weakenTimeMs: 60_000, gapMs: 120 }), 125);
assert.equal(pipelineDepth({ weakenTimeMs: 60_000, gapMs: 120, configuredMax: 24 }), 24);
assert.equal(pipelineDepth({ weakenTimeMs: 0, gapMs: 120 }), 1);
assert.ok(
    pipelineDepth({ weakenTimeMs: 240_000, gapMs: 120 }) >
    pipelineDepth({ weakenTimeMs: 60_000, gapMs: 120 })
);

// Compatibility capacity is still RAM bounded.
assert.equal(batchCapacity({ freeRam: 1_000, batchRam: 100, weakenTimeMs: 60_000, gapMs: 120 }), 10);
assert.equal(batchCapacity({ freeRam: 50, batchRam: 100, weakenTimeMs: 60_000, gapMs: 120 }), 0);

// Fragment-aware placement capacity.
const hosts = [
    { host: "a", free: 5.0 },
    { host: "b", free: 3.0 },
    { host: "c", free: 1.0 },
];
assert.equal(placementCapacity(hosts, 1.75), 3);

// Atomic prospective placement: H/W1 fit but G does not => whole plan rejected.
{
    const plan = planBatchPlacement(
        [{ host: "a", free: 4 }, { host: "b", free: 2 }],
        [
            { op: "H", script: "h", threads: 1, ramPerThread: 1.7 },
            { op: "W1", script: "w", threads: 1, ramPerThread: 1.75 },
            { op: "G", script: "g", threads: 2, ramPerThread: 1.75 },
            { op: "W2", script: "w", threads: 1, ramPerThread: 1.75 },
        ],
    );
    assert.equal(plan.ok, false);
    assert.equal(plan.failed.op, "G");
    assert.ok(plan.failed.missingThreads > 0);
}

// A successful plan contains concrete host/thread assignments for every op.
{
    const plan = planBatchPlacement(
        [{ host: "a", free: 20 }, { host: "b", free: 20 }],
        [
            { op: "H", script: "h", threads: 2, ramPerThread: 1.7 },
            { op: "W1", script: "w", threads: 1, ramPerThread: 1.75 },
            { op: "G", script: "g", threads: 3, ramPerThread: 1.75 },
            { op: "W2", script: "w", threads: 1, ramPerThread: 1.75 },
        ],
    );
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.components.map(c => c.op), ["H", "W1", "G", "W2"]);
    for (const component of plan.components) {
        assert.ok(component.placements.length > 0);
        assert.equal(
            component.placements.reduce((n, p) => n + p.threads, 0),
            component.requestedThreads,
        );
    }
}

// Prep remains intentionally partial-capable.
{
    const needs = [
        { host: "a", op: "weaken", threads: 100, ram: 1.75 },
        { host: "b", op: "grow", threads: 200, ram: 1.75 },
    ];
    const partial = allocatePrep(needs, { freeRam: 100 });
    assert.ok(partial.plan[0].threads > 0 && partial.plan[0].threads < 100);
}

// Exec tags must remain unique.
{
    const frozen = 1_700_000_000_000;
    const tags = new Set();
    for (let i = 0; i < 10_000; i++) tags.add(execTag(frozen));
    assert.equal(tags.size, 10_000);
}

// Runtime source invariants.
const hacking = fs.readFileSync(new URL("../matrix/services/hacking.js", import.meta.url), "utf8");

assert.match(hacking, /scheduler:\s*"rolling"/);
assert.match(hacking, /planningSnapshots\s*=\s*new Map/);
assert.match(hacking, /capturePlanningSnapshot/);
assert.match(hacking, /operationTimes/);
assert.match(hacking, /finishShiftMs/);
assert.match(hacking, /planBatchPlacement/);
assert.match(hacking, /probePlanningSnapshot/);
assert.match(hacking, /snapshot-stale-drain/);
assert.match(hacking, /staleSnapshots\s*=\s*new Map/);
assert.match(hacking, /execPlannedComponent/);

// Ordinary batch W2 must use uncapped grow hardening.
assert.match(hacking, /growthAnalyzeSecurity\(gt\)/);
assert.doesNotMatch(
    hacking,
    /function batchShape[\s\S]*?growthAnalyzeSecurity\(gt,\s*target\s*,\s*1\)/,
);

// No finite-wave drain barrier in the rolling service.
assert.doesNotMatch(hacking, /await\s+waitPids\s*\(/);
assert.doesNotMatch(hacking, /const\s+wave\s*=\s*allocateWave\s*\(/);

// Active targets may not fabricate snapshots from transient state.
assert.match(hacking, /if\s*\(!snapshot\)[\s\S]*snapshot-missing/);

// Deferral and real failure accounting remain separate.
assert.match(hacking, /batchAdmissionDeferrals\s*\+=\s*1/);
assert.match(hacking, /failedBatchIncidents\s*\+=\s*1/);
assert.match(hacking, /taintedTargets\.set/);

// A stable target-state snapshot must still drain/replan when CURRENT player/
// global hacking conditions require more grow threads than the snapshot owns.
// This is the long-run regression that appears as progressive target-money loss
// while security remains healthy.
assert.match(hacking, /currentGrowThreads\s*>\s*shape\.gt/);
assert.match(hacking, /grow-thread-shortfall/);
assert.match(hacking, /staleSnapshotCount/);
assert.match(hacking, /snapshotStaleDrains/);
assert.match(hacking, /probeRequiredGrowThreads/);

// The probe must be gated to near-minimum security so it cannot reintroduce
// transient target-state contamination.
assert.match(hacking, /SNAPSHOT_PROBE_SECURITY_EPSILON/);
assert.match(hacking, /live\.securityExcess\s*>\s*SNAPSHOT_PROBE_SECURITY_EPSILON/);

// Telemetry histories stay bounded.
assert.match(hacking, /FAILURE_RING\s*=\s*32/);
assert.match(hacking, /DEFERRAL_RING\s*=\s*16/);

console.log("MATRIX-OS batch passed: rolling depth, atomic placement, stable planning, and bounded diagnostics.");
