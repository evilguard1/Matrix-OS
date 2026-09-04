import assert from "node:assert/strict";
import fs from "node:fs";
import {
    PLANNER_NATIVE,
    PLANNER_FORMULAS,
    formulaBatchShape,
    formulaProbePlanningSnapshot,
    formulaServer,
    formulaTargetScore,
    selectPlanningContext,
} from "../matrix/lib/hacking-planner.js";

function makeNs({ formulas = true, hacking = 500 } = {}) {
    const growCalls = [];
    const growthSecurityArgs = [];
    let getPlayerCalls = 0;
    const servers = {
        alpha: { moneyMax: 1_000_000_000, minDifficulty: 2, requiredHackingSkill: 100, serverGrowth: 60 },
        beta: { moneyMax: 250_000_000, minDifficulty: 4, requiredHackingSkill: 80, serverGrowth: 45 },
    };
    const player = { skills: { hacking } };

    const ns = {
        fileExists: file => formulas && file === "Formulas.exe",
        getPlayer: () => { getPlayerCalls += 1; return player; },
        getHackingLevel: () => player.skills.hacking,
        getServerMaxMoney: host => servers[host].moneyMax,
        getServerMinSecurityLevel: host => servers[host].minDifficulty,
        getServerSecurityLevel: host => servers[host].minDifficulty,
        getServerRequiredHackingLevel: host => servers[host].requiredHackingSkill,
        getServerGrowth: host => servers[host].serverGrowth,
        getScriptRam: file => file.includes("hack.js") ? 1.7 : 1.75,
        weakenAnalyze: () => 0.05,
        hackAnalyzeSecurity: threads => 0.002 * threads,
        growthAnalyzeSecurity: (...args) => {
            growthSecurityArgs.push(args);
            return 0.004 * args[0];
        },
        formulas: {
            mockServer: () => ({}),
            hacking: {
                hackChance: server => server.hostname === "alpha" ? 0.95 : 0.80,
                hackPercent: (_server, p) => 0.005 + Number(p.skills?.hacking ?? 0) / 100_000,
                hackTime: server => server.hostname === "alpha" ? 1_000 : 10_000,
                growTime: server => server.hostname === "alpha" ? 3_200 : 32_000,
                weakenTime: server => server.hostname === "alpha" ? 4_000 : 40_000,
                growThreads: (server, _player, targetMoney, cores) => {
                    growCalls.push({ server: { ...server }, targetMoney, cores });
                    const missing = Math.max(0, targetMoney - server.moneyAvailable);
                    return Math.max(1, Math.ceil(missing / 10_000_000));
                },
            },
        },
        _growCalls: growCalls,
        _growthSecurityArgs: growthSecurityArgs,
        _getPlayerCalls: () => getPlayerCalls,
        _player: player,
        _servers: servers,
    };
    return ns;
}

// Capability selection must be cheap when Formulas.exe is absent: do not pay a
// runtime getPlayer() call merely to discover the native fallback.
{
    const ns = makeNs({ formulas: false });
    const context = selectPlanningContext(ns);
    assert.equal(context.kind, PLANNER_NATIVE);
    assert.equal(context.formulasAvailable, false);
    assert.equal(ns._getPlayerCalls(), 0);
}

{
    const ns = makeNs({ formulas: true });
    const context = selectPlanningContext(ns);
    assert.equal(context.kind, PLANNER_FORMULAS);
    assert.equal(context.formulasAvailable, true);
    assert.equal(context.player.skills.hacking, 500);
    assert.equal(ns._getPlayerCalls(), 1, "player snapshot should be captured once per planner context");
}

// The synthetic server must carry every structural field the formulas planner
// relies on without ever requiring the 2 GB ns.getServer() API.
{
    const ns = makeNs();
    const facts = {
        hostname: "alpha",
        moneyMax: 1_000_000_000,
        minDifficulty: 2,
        requiredHackingSkill: 100,
        serverGrowth: 60,
    };
    const server = formulaServer(ns, facts, { moneyAvailable: 750_000_000, hackDifficulty: 2 });
    assert.deepEqual(server, {
        hostname: "alpha",
        hasAdminRights: true,
        moneyMax: 1_000_000_000,
        moneyAvailable: 750_000_000,
        minDifficulty: 2,
        hackDifficulty: 2,
        requiredHackingSkill: 100,
        serverGrowth: 60,
    });
}

// Formula shapes use clean-state chance/percent/times, post-hack money for G,
// one-core distributed workers, and native uncapped security accounting.
{
    const ns = makeNs();
    const context = selectPlanningContext(ns);
    const cfg = { hacking: { minHackFraction: 0.05, maxHackFraction: 0.20 } };
    const shape = formulaBatchShape(ns, "alpha", cfg, context);
    assert.ok(shape, "Formulas planner should produce a batch shape");
    assert.equal(shape.planner, PLANNER_FORMULAS);
    assert.ok(shape.ht >= 1 && shape.gt >= 1 && shape.wt1 >= 1 && shape.wt2 >= 1);
    assert.ok(shape.expected > 0 && shape.metric > 0 && shape.ram > 0);
    assert.equal(shape.hTime, 1_000);
    assert.equal(shape.gTime, 3_200);
    assert.equal(shape.wTime, 4_000);
    assert.ok(ns._growCalls.length > 0);
    for (const call of ns._growCalls) {
        assert.equal(call.cores, 1, "distributed workers must be planned at one core");
        assert.equal(call.targetMoney, call.server.moneyMax);
        assert.equal(call.server.hackDifficulty, call.server.minDifficulty,
            "W1 finishes before G, so growth must be planned at minimum security");
        assert.ok(call.server.moneyAvailable < call.server.moneyMax,
            "growThreads must start from synthetic post-hack money");
    }
    for (const args of ns._growthSecurityArgs) {
        assert.equal(args.length, 1,
            "growthAnalyzeSecurity must remain uncapped; never pass the target argument");
    }
}

// Money ranking is the predicted clean Formula yield per RAM-second. A much
// slower target must lose even if it is otherwise hackable.
{
    const ns = makeNs();
    const context = selectPlanningContext(ns);
    const cfg = { hacking: { minHackFraction: 0.05, maxHackFraction: 0.20 } };
    const alpha = formulaTargetScore(ns, "alpha", cfg, context);
    const beta = formulaTargetScore(ns, "beta", cfg, context);
    assert.ok(Number.isFinite(alpha) && Number.isFinite(beta));
    assert.ok(alpha > beta, `expected alpha Formula score ${alpha} to beat beta ${beta}`);
}

// Stale probing keeps the original fixed H count but recomputes hack percent and
// grow threads from a synthetic clean/post-hack state under the CURRENT player.
{
    const ns = makeNs({ hacking: 500 });
    const oldContext = selectPlanningContext(ns);
    const cfg = { hacking: { minHackFraction: 0.10, maxHackFraction: 0.10 } };
    const shape = formulaBatchShape(ns, "alpha", cfg, oldContext);
    const snapshot = { planner: PLANNER_FORMULAS, shape };

    ns._player.skills.hacking = 1_000;
    const currentContext = selectPlanningContext(ns);
    const beforeCalls = ns._growCalls.length;
    const probe = formulaProbePlanningSnapshot(ns, "alpha", snapshot, currentContext);
    assert.ok(probe);
    assert.equal(probe.planner, PLANNER_FORMULAS);
    assert.ok(probe.currentHackFraction > shape.f,
        "higher current hack percent should increase the fixed-H hack fraction");
    assert.ok(ns._growCalls.length > beforeCalls);
    const call = ns._growCalls.at(-1);
    assert.equal(call.server.hackDifficulty, call.server.minDifficulty);
    assert.equal(call.cores, 1);
    assert.equal(call.server.moneyAvailable,
        call.server.moneyMax * (1 - probe.currentHackFraction),
        "probe must ignore live money and synthesize the fixed-H post-hack state");
    assert.equal(probe.requiresDrain, probe.currentGrowThreads > probe.plannedGrowThreads);
}

const source = fs.readFileSync("matrix/lib/hacking-planner.js", "utf8");
assert.doesNotMatch(source, /\bns\.getServer\s*\(/,
    "Formulas planner must not pay 2 GB for ns.getServer(); use mockServer + granular accessors");
assert.match(source, /\bns\.getServerGrowth\s*\(/,
    "Formulas planner needs the 0.1 GB serverGrowth accessor");
assert.match(source, /\bns\.getPlayer\s*\(/,
    "Formulas planner needs one current player snapshot");

// rankTargets invokes every scorer as scorer(ns, host). The Formula adapter must
// therefore accept the same two-argument scorer interface; a one-argument arrow
// silently receives ns as the target and collapses every Formula score to -Infinity.
const hackingSource = fs.readFileSync("matrix/services/hacking.js", "utf8");
assert.match(hackingSource,
    /\(_ns,\s*h\)\s*=>\s*formulaTargetScore\(ns,\s*h,\s*cfg,\s*planner\)/,
    "Formula target scorer must preserve the common (ns, host) scorer signature");
assert.doesNotMatch(hackingSource,
    /\?\s*h\s*=>\s*formulaTargetScore\(ns,\s*h,\s*cfg,\s*planner\)/,
    "one-argument Formula scorer drops the real host when rankTargets calls scorer(ns, host)");

console.log("MATRIX-OS planner passed: native fallback, synthetic Formula shapes, ranking, and stale probes.");
