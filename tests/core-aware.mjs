import assert from "node:assert/strict";
import {
    homeCoreBatchVariant,
    homeCorePrepWeakenThreads,
    planWholeHomeCoreBatch,
} from "../matrix/lib/core-aware.js";
import { PLANNER_FORMULAS } from "../matrix/lib/hacking-planner.js";

function makeNs() {
    const growCalls = [];
    const growthSecurityArgs = [];
    return {
        getServerMaxMoney: () => 1_000_000_000,
        getServerMinSecurityLevel: () => 2,
        getServerRequiredHackingLevel: () => 100,
        getServerGrowth: () => 60,
        growthAnalyze: (_target, _factor, cores) => Math.ceil(60 / Math.max(1, Number(cores) || 1)),
        weakenAnalyze: (_threads, cores = 1) => 0.05 * (1 + (Math.max(1, Number(cores) || 1) - 1) / 16),
        growthAnalyzeSecurity: (...args) => {
            growthSecurityArgs.push(args);
            return 0.004 * args[0];
        },
        formulas: {
            mockServer: () => ({}),
            hacking: {
                growThreads: (server, _player, targetMoney, cores) => {
                    growCalls.push({ server: { ...server }, targetMoney, cores });
                    return Math.ceil(58 / (1 + (Math.max(1, cores) - 1) / 16));
                },
            },
        },
        _growCalls: growCalls,
        _growthSecurityArgs: growthSecurityArgs,
    };
}

const baseline = {
    planner: PLANNER_FORMULAS,
    f: 0.15,
    ht: 66,
    gt: 58,
    wt1: 3,
    wt2: 5,
    ram: 227.7,
    hackSecurity: 0.132,
    hRam: 1.7,
    gRam: 1.75,
    wRam: 1.75,
};

{
    const ns = makeNs();
    const planner = { kind: PLANNER_FORMULAS, player: { skills: { hacking: 500 } } };
    const shape = homeCoreBatchVariant(ns, "alpha", baseline, planner, 6);
    assert.ok(shape);
    assert.equal(shape.homeCoreAware, true);
    assert.equal(shape.coreHost, "home");
    assert.equal(shape.coreCount, 6);
    assert.ok(shape.gt < baseline.gt, "six-core Home must reduce grow threads");
    assert.ok(shape.wt1 <= baseline.wt1 && shape.wt2 <= baseline.wt2,
        "six-core Home must not increase weaken threads");
    assert.ok(shape.ram < baseline.ram, "core-aware shape must use less RAM for this representative batch");
    assert.equal(ns._growCalls.at(-1).cores, 6, "Formula grow sizing must use the guaranteed execution cores");
    for (const args of ns._growthSecurityArgs) {
        assert.equal(args.length, 1,
            "growthAnalyzeSecurity must stay uncapped; never pass the target argument");
    }
}

{
    const ns = makeNs();
    const oneCore = 1_260;
    const sixCore = homeCorePrepWeakenThreads(ns, oneCore, 6);
    assert.equal(sixCore, 960,
        "1,260 one-core weaken threads should become 960 threads at the 1.3125x six-core effect");
}

{
    const components = [
        { op: "H", script: "/matrix/workers/hack.js", threads: 10, ramPerThread: 1.7 },
        { op: "W1", script: "/matrix/workers/weaken.js", threads: 2, ramPerThread: 1.75 },
        { op: "G", script: "/matrix/workers/grow.js", threads: 40, ramPerThread: 1.75 },
        { op: "W2", script: "/matrix/workers/weaken.js", threads: 3, ramPerThread: 1.75 },
    ];
    const pool = [
        { host: "home", free: 100 },
        { host: "pserv-0", free: 1_000 },
    ];
    const plan = planWholeHomeCoreBatch(pool, components);
    assert.equal(plan.ok, true);
    for (const op of ["W1", "G", "W2"]) {
        const component = plan.components.find(entry => entry.op === op);
        assert.deepEqual(component.placements, [{ host: "home", threads: component.threads }],
            `${op} must be guaranteed entirely on Home`);
    }
    const h = plan.components.find(entry => entry.op === "H");
    assert.equal(h.placements.reduce((sum, p) => sum + p.threads, 0), 10);
}

{
    const components = [
        { op: "H", script: "H", threads: 10, ramPerThread: 1.7 },
        { op: "W1", script: "W", threads: 2, ramPerThread: 1.75 },
        { op: "G", script: "G", threads: 40, ramPerThread: 1.75 },
        { op: "W2", script: "W", threads: 3, ramPerThread: 1.75 },
    ];
    const plan = planWholeHomeCoreBatch([
        { host: "home", free: 50 },
        { host: "pserv-0", free: 10_000 },
    ], components);
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, "home-capacity",
        "core-aware sizing must refuse to spill G/W and let the caller fall back to the one-core planner");
}

console.log("MATRIX core-aware helpers passed: six-core sizing, uncapped G security, Home-only G/W, safe fallback gate.");
