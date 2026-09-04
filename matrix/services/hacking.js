import { config, event, writeState, readJson, writeJson, clamp, getDirectives } from "/matrix/lib/common.js";
import { scanAll, workerHosts } from "/matrix/lib/network.js";
import {
    allocatePrep,
    execTag,
    pipelineDepth,
    planBatchPlacement,
} from "/matrix/lib/batch.js";
import { homeReserveFor } from "/matrix/lib/capabilities.js";
import {
    PLANNER_NATIVE,
    PLANNER_FORMULAS,
    formulaBatchShape,
    formulaProbePlanningSnapshot,
    formulaTargetScore,
    selectPlanningContext,
} from "/matrix/lib/hacking-planner.js";
import {
    BOOST_MODE_MAX,
    BOOST_MODE_NORMAL,
    BOOST_REQUEST_STATE,
    BOOST_TYPE,
    activateMaxBoostRequest,
    isOwnedShareProcess,
    maxBoostReady,
    normalShareBudget,
    normalizeBoostRequest,
    planShareThreads,
    shareArgs,
    shareCapacityThreads,
    shareProcessMeta,
} from "/matrix/lib/reputation-boost.js";

const H = "/matrix/workers/hack.js";
const G = "/matrix/workers/grow.js";
const W = "/matrix/workers/weaken.js";
const SHARE = "/matrix/workers/share.js";

const BOOST_RECONCILE_MS = 1_000;
const FAILURE_RING = 32;
const DEFERRAL_RING = 16;
const TARGET_TELEMETRY_LIMIT = 40;
const LAUNCH_MARGIN_MS = 300;
const SNAPSHOT_PROBE_SECURITY_EPSILON = 0.01;
const FORMULA_RANK_REFRESH_MS = 5_000;

function pushBounded(list, value, limit) {
    list.push(value);
    if (list.length > limit) list.splice(0, list.length - limit);
}

function candidateTargets(ns, hosts, cfg) {
    const minMoney = cfg.hacking?.minTargetMoney ?? 1_000_000;
    return hosts.filter(h =>
        h !== "home" &&
        ns.hasRootAccess(h) &&
        ns.getServerMaxMoney(h) >= minMoney &&
        ns.getServerRequiredHackingLevel(h) <= ns.getHackingLevel()
    );
}

function targetScore(ns, h) {
    const max = ns.getServerMaxMoney(h);
    const chance = clamp(ns.hackAnalyzeChance(h), 0, 1);
    const weaken = Math.max(1, ns.getWeakenTime(h));
    const req = Math.max(1, ns.getServerRequiredHackingLevel(h));
    const skillFactor = clamp(ns.getHackingLevel() / req, 0.25, 4);
    return max * chance * Math.sqrt(skillFactor) / weaken;
}

function xpScore(ns, h) {
    const req = Math.max(1, ns.getServerRequiredHackingLevel(h));
    const hackTime = Math.max(1, ns.getHackTime(h));
    const chance = clamp(ns.hackAnalyzeChance(h), 0.05, 1);
    return req * chance / hackTime;
}

function rankTargets(ns, hosts, cfg, mode = "money", planner = null) {
    const formulaMoney = mode === "money" && planner?.kind === PLANNER_FORMULAS;
    const scorer = mode === "xp"
        ? xpScore
        : formulaMoney
            ? (_ns, h) => formulaTargetScore(ns, h, cfg, planner)
            : targetScore;
    return candidateTargets(ns, hosts, cfg)
        .map(h => ({ host: h, score: scorer(ns, h) }))
        .sort((a, b) => b.score - a.score)
        .map(entry => entry.host);
}

function freePool(ns, hosts, cfg) {
    return workerHosts(ns, hosts, homeReserveFor(ns.getServerMaxRam("home"), cfg));
}

function liveRam(ns, hosts, cfg, boost = null) {
    const reserveHome = homeReserveFor(ns.getServerMaxRam("home"), cfg);
    const shareRam = Math.max(0, ns.getScriptRam(SHARE, "home"));
    let max = 0;
    let used = 0;
    let free = 0;
    let reclaimableShareRam = 0;
    for (const host of hosts) {
        if (!ns.hasRootAccess(host)) continue;
        const hostMax = Math.max(0, ns.getServerMaxRam(host));
        if (hostMax <= 0) continue;
        const hostUsed = Math.max(0, ns.getServerUsedRam(host));
        const reserve = host === "home" ? reserveHome : 0;
        max += hostMax;
        used += hostUsed;
        free += Math.max(0, hostMax - hostUsed - reserve);
        if (boost?.mode === BOOST_MODE_NORMAL && boost?.boostId && shareRam > 0) {
            const owned = boostProcessesOnHost(ns, host, boost.boostId)
                .reduce((sum, proc) => sum + Math.max(0, Number(proc.threads) || 0) * shareRam, 0);
            reclaimableShareRam += owned;
        }
    }
    return {
        max,
        used,
        free,
        reclaimableShareRam,
        schedulableFree: free + reclaimableShareRam,
    };
}

function isPrepped(ns, host, cfg) {
    const margin = cfg.hacking?.prepSecurityMargin ?? 0.5;
    const moneyFrac = cfg.hacking?.prepMoneyFraction ?? 0.985;
    const max = ns.getServerMaxMoney(host);
    if (max <= 0) return false;
    if (ns.getServerSecurityLevel(host) > ns.getServerMinSecurityLevel(host) + margin) return false;
    return ns.getServerMoneyAvailable(host) >= max * moneyFrac;
}

function targetLiveState(ns, host) {
    const maxMoney = Math.max(0, ns.getServerMaxMoney(host));
    const money = Math.max(0, ns.getServerMoneyAvailable(host));
    const minSecurity = ns.getServerMinSecurityLevel(host);
    const security = ns.getServerSecurityLevel(host);
    return {
        currentMoney: money,
        maxMoney,
        moneyFraction: maxMoney > 0 ? money / maxMoney : 0,
        currentSecurity: security,
        minSecurity,
        securityExcess: Math.max(0, security - minSecurity),
    };
}

function operationTimes(ns, target) {
    return {
        hTime: Math.max(1, ns.getHackTime(target)),
        gTime: Math.max(1, ns.getGrowTime(target)),
        wTime: Math.max(1, ns.getWeakenTime(target)),
    };
}

// Validated native planner. Keep this implementation intact as the capability
// fallback; Formulas.exe only replaces clean-state planning/ranking, never the
// execution layer or the launch-time native timing resample.
function batchShape(ns, target, cfg) {
    const max = ns.getServerMaxMoney(target);
    const chance = clamp(ns.hackAnalyzeChance(target), 0.0001, 1);
    const minF = cfg.hacking?.minHackFraction ?? 0.05;
    const maxF = cfg.hacking?.maxHackFraction ?? 0.40;
    const hRam = ns.getScriptRam(H, "home");
    const gRam = ns.getScriptRam(G, "home");
    const wRam = ns.getScriptRam(W, "home");
    const { hTime, gTime, wTime } = operationTimes(ns, target);
    const weakenPerThread = Math.max(0.0001, ns.weakenAnalyze(1));

    let best = null;
    for (let f = minF; f <= maxF + 1e-9; f += 0.025) {
        const hackAmount = max * f;
        let ht = Math.ceil(ns.hackAnalyzeThreads(target, hackAmount));
        if (!Number.isFinite(ht) || ht < 1) continue;

        const actualFraction = clamp(ns.hackAnalyze(target) * ht, 0.001, 0.90);
        let gt = Math.ceil(ns.growthAnalyze(target, 1 / (1 - actualFraction)));
        if (!Number.isFinite(gt) || gt < 1) gt = 1;

        const hSec = ns.hackAnalyzeSecurity(ht, target);
        const gSec = ns.growthAnalyzeSecurity(gt);
        const wt1 = Math.max(1, Math.ceil(hSec / weakenPerThread));
        const wt2 = Math.max(1, Math.ceil(gSec / weakenPerThread));

        const ram = ht * hRam + gt * gRam + (wt1 + wt2) * wRam;
        const ramSeconds =
            ht * hRam * hTime / 1000 +
            gt * gRam * gTime / 1000 +
            (wt1 + wt2) * wRam * wTime / 1000;
        const expected = max * actualFraction * chance;
        const metric = expected / Math.max(1, ramSeconds);

        const shape = {
            f: actualFraction,
            ht,
            gt,
            wt1,
            wt2,
            ram,
            expected,
            metric,
            hTime,
            gTime,
            wTime,
            growSecurity: gSec,
            hackSecurity: hSec,
            hRam,
            gRam,
            wRam,
        };
        if (!best || shape.metric > best.metric) best = shape;
    }
    return best;
}

function capturePlanningSnapshot(ns, target, cfg, gap, configuredMax, planner) {
    const live = targetLiveState(ns, target);
    const useFormulas = planner?.kind === PLANNER_FORMULAS;
    const shape = useFormulas
        ? formulaBatchShape(ns, target, cfg, planner)
        : batchShape(ns, target, cfg);
    if (!shape) return null;
    const depth = pipelineDepth({
        weakenTimeMs: shape.wTime,
        gapMs: gap,
        configuredMax,
    });
    return {
        target,
        planner: useFormulas ? PLANNER_FORMULAS : PLANNER_NATIVE,
        capturedAt: Date.now(),
        hackingLevel: ns.getHackingLevel(),
        moneyFraction: live.moneyFraction,
        securityExcess: live.securityExcess,
        hackPerThread: useFormulas
            ? clamp(shape.hackPerThread, 0, 1)
            : clamp(ns.hackAnalyze(target), 0, 1),
        shape,
        depth,
        used: false,
        lastProbe: null,
    };
}

/**
 * Probe whether a stable native planning snapshot still has enough grow threads
 * under the CURRENT player/global hacking conditions.
 *
 * We intentionally probe only when the target is essentially at minimum
 * security. hackAnalyze() and growthAnalyze() both depend on live security, so
 * probing a transient H/G/W intermediate state would recreate the contamination
 * that stable snapshots were introduced to eliminate.
 *
 * A snapshot becomes correctness-stale only when the grow threads required for
 * its fixed H thread count exceed the grow threads it planned at capture. This
 * catches hacking-level and hacking-money increases (including IPvGO effects)
 * as well as any loss of hacking-grow multiplier, without draining merely
 * because operation speed changed.
 */
function probePlanningSnapshot(ns, target, snapshot) {
    if (!snapshot?.shape) return null;
    const live = targetLiveState(ns, target);
    if (live.securityExcess > SNAPSHOT_PROBE_SECURITY_EPSILON) return null;

    const shape = snapshot.shape;
    const currentHackPerThread = clamp(ns.hackAnalyze(target), 0, 1);
    const currentHackFraction = clamp(currentHackPerThread * shape.ht, 0.001, 0.90);
    const growthFactor = 1 / Math.max(0.10, 1 - currentHackFraction);
    let currentGrowThreads = Math.ceil(ns.growthAnalyze(target, growthFactor));
    if (!Number.isFinite(currentGrowThreads) || currentGrowThreads < 1) currentGrowThreads = 1;

    return {
        observedAt: Date.now(),
        planner: PLANNER_NATIVE,
        hackingLevel: ns.getHackingLevel(),
        securityExcess: live.securityExcess,
        currentHackPerThread,
        currentHackFraction,
        plannedHackFraction: shape.f,
        currentGrowThreads,
        plannedGrowThreads: shape.gt,
        growThreadShortfall: Math.max(0, currentGrowThreads - shape.gt),
        requiresDrain: currentGrowThreads > shape.gt,
    };
}

async function ensureScript(ns, script, host) {
    if (host === "home" || ns.fileExists(script, host)) return true;
    try {
        return await ns.scp(script, host, "home");
    } catch {
        return false;
    }
}

async function execDistributed(ns, script, threads, args, hosts, cfg, boost = null) {
    let remaining = Math.max(0, Math.floor(threads));
    const ram = ns.getScriptRam(script, "home");
    const pids = [];
    const workers = [];

    for (const item of schedulablePool(ns, hosts, cfg, boost)) {
        if (remaining <= 0) break;
        if (!(await ensureScript(ns, script, item.host))) continue;

        const reserve = item.host === "home"
            ? homeReserveFor(ns.getServerMaxRam("home"), cfg)
            : 0;
        await reclaimBoostShareForRam(ns, item.host, ram, cfg, boost);
        const nowFree = Math.max(
            0,
            ns.getServerMaxRam(item.host) - ns.getServerUsedRam(item.host) - reserve,
        );
        const fit = Math.floor(nowFree / ram);
        if (fit <= 0) continue;

        const use = Math.min(fit, remaining);
        const pid = ns.exec(script, item.host, use, ...args, execTag());
        if (pid) {
            pids.push(pid);
            workers.push({ pid, host: item.host, threads: use, ram: use * ram });
            remaining -= use;
        }
    }

    return {
        launched: Math.max(0, Math.floor(threads)) - remaining,
        remaining,
        pids,
        workers,
    };
}

async function execPlannedComponent(ns, component, args, cfg, boost) {
    const pids = [];
    const workers = [];
    let launched = 0;
    const failedPlacements = [];

    for (const placement of component.placements ?? []) {
        const ok = await ensureScript(ns, component.script, placement.host);
        if (!ok) {
            failedPlacements.push({
                host: placement.host,
                requestedThreads: placement.threads,
                launchedThreads: 0,
                failedThreads: placement.threads,
                reason: "script-unavailable",
            });
            continue;
        }

        await reclaimBoostShareForRam(
            ns,
            placement.host,
            placement.threads * component.ramPerThread,
            cfg,
            boost,
        );
        const pid = ns.exec(
            component.script,
            placement.host,
            placement.threads,
            ...args,
            execTag(),
        );
        if (pid) {
            launched += placement.threads;
            pids.push(pid);
            workers.push({
                pid,
                host: placement.host,
                threads: placement.threads,
                ram: placement.threads * component.ramPerThread,
                op: component.op,
            });
        } else {
            failedPlacements.push({
                host: placement.host,
                requestedThreads: placement.threads,
                launchedThreads: 0,
                failedThreads: placement.threads,
                reason: "exec-returned-0",
            });
        }
    }

    return {
        launched,
        remaining: Math.max(0, component.requestedThreads - launched),
        pids,
        workers,
        failedPlacements,
    };
}

function batchComponents(ns, shape) {
    return [
        { op: "H", script: H, threads: shape.ht, ramPerThread: ns.getScriptRam(H, "home") },
        { op: "W1", script: W, threads: shape.wt1, ramPerThread: ns.getScriptRam(W, "home") },
        { op: "G", script: G, threads: shape.gt, ramPerThread: ns.getScriptRam(G, "home") },
        { op: "W2", script: W, threads: shape.wt2, ramPerThread: ns.getScriptRam(W, "home") },
    ];
}

function eventFinishes(baseFinish, gap) {
    return {
        H: baseFinish,
        W1: baseFinish + gap,
        G: baseFinish + gap * 2,
        W2: baseFinish + gap * 3,
    };
}

function timingForOp(times, op) {
    if (op === "H") return times.hTime;
    if (op === "G") return times.gTime;
    return times.wTime;
}

async function launchBatch(ns, {
    target,
    shape,
    plan,
    baseFinish,
    gap,
    rank,
    activeCount,
    depth,
    preflight,
    schedulerReserveRam,
    schedulerUsableIdleRam,
    cfg,
    boost,
}) {
    // Execution timing remains native and live. The planner may predict from a
    // stable clean Formula snapshot, but dispatch always resamples real operation
    // times and applies one coherent finish shift to preserve H/W1/G/W2 order.
    const liveTimes = operationTimes(ns, target);
    const original = eventFinishes(baseFinish, gap);
    const now = Date.now();

    let finishShiftMs = 0;
    for (const component of plan.components) {
        const duration = timingForOp(liveTimes, component.op);
        const intended = original[component.op];
        finishShiftMs = Math.max(
            finishShiftMs,
            duration + LAUNCH_MARGIN_MS - (intended - now),
        );
    }
    finishShiftMs = Math.max(0, Math.ceil(finishShiftMs));

    const finishes = eventFinishes(baseFinish + finishShiftMs, gap);
    const workers = [];
    const pids = [];
    const failures = [];

    for (const component of plan.components) {
        const duration = timingForOp(liveTimes, component.op);
        const finish = finishes[component.op];
        const extra = Math.max(0, finish - Date.now() - duration);
        const result = await execPlannedComponent(ns, component, [target, extra], cfg, boost);
        workers.push(...result.workers);
        pids.push(...result.pids);

        if (result.remaining > 0) {
            failures.push({
                op: component.op,
                script: component.script,
                requestedThreads: component.requestedThreads,
                launchedThreads: result.launched,
                failedThreads: result.remaining,
                ramPerThread: component.ramPerThread,
                requestedRam: component.requestedThreads * component.ramPerThread,
                launchedRam: result.launched * component.ramPerThread,
                missingRam: result.remaining * component.ramPerThread,
                plannedNominalFreeRam: component.nominalFreeRam,
                plannedSchedulableRam: component.schedulableRam,
                plannedFragmentationRam: component.fragmentationRam,
                failedPlacements: result.failedPlacements,
            });
        }
    }

    return {
        target,
        workers,
        pids,
        failures,
        failedThreads: failures.reduce((sum, f) => sum + f.failedThreads, 0),
        baseFinish: baseFinish + finishShiftMs,
        finishShiftMs,
        finishes,
        liveTimes,
        rank,
        activeCount,
        depth,
        preflight,
        schedulerReserveRam,
        schedulerUsableIdleRam,
        shape,
    };
}

function trackedPidSet(activeBatches, activePrep) {
    const set = new Set();
    for (const batch of activeBatches) {
        for (const worker of batch.workers ?? []) set.add(worker.pid);
    }
    for (const prep of activePrep.values()) {
        for (const worker of prep.workers ?? []) set.add(worker.pid);
    }
    return set;
}

function legacyWorkers(ns, hosts, trackedPids) {
    const workers = [];
    const byTarget = new Map();

    for (const host of hosts) {
        if (!ns.hasRootAccess(host) || ns.getServerMaxRam(host) <= 0) continue;
        let processes = [];
        try { processes = ns.ps(host); } catch { continue; }

        for (const proc of processes) {
            if (![H, G, W].includes(proc.filename)) continue;
            if (trackedPids.has(proc.pid)) continue;
            const target = String(proc.args?.[0] ?? "");
            const entry = {
                pid: proc.pid,
                host,
                script: proc.filename,
                target,
                threads: proc.threads,
            };
            workers.push(entry);
            if (target) byTarget.set(target, (byTarget.get(target) ?? 0) + 1);
        }
    }

    return { workers, byTarget };
}

function pruneActive(ns, activeBatches, activePrep) {
    for (let i = activeBatches.length - 1; i >= 0; i--) {
        const batch = activeBatches[i];
        batch.workers = (batch.workers ?? []).filter(worker => ns.isRunning(worker.pid));
        if (batch.workers.length === 0) activeBatches.splice(i, 1);
    }

    for (const [target, prep] of activePrep.entries()) {
        prep.workers = (prep.workers ?? []).filter(worker => ns.isRunning(worker.pid));
        if (prep.workers.length === 0) activePrep.delete(target);
    }
}

function activeByTarget(activeBatches) {
    const map = new Map();
    for (const batch of activeBatches) {
        map.set(batch.target, (map.get(batch.target) ?? 0) + 1);
    }
    return map;
}

function activeHwgwRam(activeBatches) {
    let ram = 0;
    for (const batch of activeBatches) {
        for (const worker of batch.workers ?? []) ram += Number(worker.ram) || 0;
    }
    return ram;
}

function activePrepRam(activePrep) {
    let ram = 0;
    for (const prep of activePrep.values()) {
        for (const worker of prep.workers ?? []) ram += Number(worker.ram) || 0;
    }
    return ram;
}

function boostProcessesOnHost(ns, host, boostId = null) {
    let processes = [];
    try { processes = ns.ps(host); } catch { return []; }
    return processes.filter(proc => {
        const meta = shareProcessMeta(proc);
        if (!meta) return false;
        return boostId == null || meta.boostId === String(boostId);
    });
}

function boostCapacities(ns, hosts, cfg, boostId) {
    const reserveHome = homeReserveFor(ns.getServerMaxRam("home"), cfg);
    const scriptRam = Math.max(0, ns.getScriptRam(SHARE, "home"));
    const out = [];
    for (const host of hosts) {
        if (!ns.hasRootAccess(host)) continue;
        const maxRam = Math.max(0, ns.getServerMaxRam(host));
        if (maxRam <= 0) continue;
        const usedRam = Math.max(0, ns.getServerUsedRam(host));
        const reserveRam = host === "home" ? reserveHome : 0;
        const ownedProcesses = boostProcessesOnHost(ns, host, boostId);
        const ownedRam = ownedProcesses.reduce(
            (sum, proc) => sum + Math.max(0, Number(proc.threads) || 0) * scriptRam,
            0,
        );
        const threads = shareCapacityThreads({ maxRam, usedRam, reserveRam, ownedRam, scriptRam });
        out.push({
            host,
            maxRam,
            usedRam,
            reserveRam,
            ownedRam,
            ownedProcesses,
            availableRam: threads * scriptRam,
        });
    }
    return out.sort((a, b) => b.availableRam - a.availableRam);
}

function schedulablePool(ns, hosts, cfg, boost) {
    if (boost?.mode !== BOOST_MODE_NORMAL || !boost?.boostId) return freePool(ns, hosts, cfg);
    return boostCapacities(ns, hosts, cfg, boost.boostId)
        .filter(item => item.availableRam > 0)
        .map(item => ({
            host: item.host,
            max: item.maxRam,
            used: item.usedRam,
            free: item.availableRam,
        }));
}

function killOwnedBoostShare(ns, host, proc, boostId) {
    if (!isOwnedShareProcess(proc, boostId)) return false;
    const args = Array.isArray(proc.args) ? proc.args : [];

    // Prefer the fully-qualified filename/host/args overload. This is
    // both server-scoped and ownership-exact. PID is a fallback only.
    try {
        if (ns.kill(SHARE, host, ...args)) return true;
    } catch {}
    try {
        return Boolean(ns.kill(proc.pid));
    } catch {
        return false;
    }
}

async function stopOwnedBoostShares(ns, hosts, boostId) {
    if (!boostId) {
        return { stopped: 0, remaining: 0, remainingHosts: 0, remainingThreads: 0 };
    }
    let stopped = 0;
    // Netscript kill is synchronous, but use two bounded passes so a
    // process list mutation cannot leave a skipped owned worker.
    for (let pass = 0; pass < 2; pass += 1) {
        let found = false;
        for (const host of hosts) {
            const owned = boostProcessesOnHost(ns, host, boostId);
            if (owned.length > 0) found = true;
            for (const proc of owned) {
                if (killOwnedBoostShare(ns, host, proc, boostId)) stopped += 1;
            }
        }
        if (!found) break;
    }
    const inventory = boostShareInventory(ns, hosts, boostId);
    return {
        stopped,
        remaining: inventory.workerCount,
        remainingHosts: inventory.hostCount,
        remainingThreads: inventory.threadCount,
    };
}

async function cleanupOrphanBoostShares(ns, hosts, activeBoostId) {
    let stopped = 0;
    for (const host of hosts) {
        for (const proc of boostProcessesOnHost(ns, host, null)) {
            const meta = shareProcessMeta(proc);
            if (!meta || meta.boostId === activeBoostId) continue;
            if (killOwnedBoostShare(ns, host, proc, meta.boostId)) stopped += 1;
        }
    }
    return stopped;
}

async function reclaimBoostShareForRam(ns, host, neededRam, cfg, boost) {
    if (boost?.mode !== BOOST_MODE_NORMAL || !boost?.boostId) return 0;
    const reserve = host === "home" ? homeReserveFor(ns.getServerMaxRam("home"), cfg) : 0;
    const physicalFree = Math.max(
        0,
        ns.getServerMaxRam(host) - ns.getServerUsedRam(host) - reserve,
    );
    if (physicalFree + 1e-9 >= Math.max(0, Number(neededRam) || 0)) return 0;
    let stopped = 0;
    for (const proc of boostProcessesOnHost(ns, host, boost.boostId)) {
        if (killOwnedBoostShare(ns, host, proc, boost.boostId)) stopped += 1;
    }
    return stopped;
}

function boostShareInventory(ns, hosts, boostId) {
    const scriptRam = Math.max(0, ns.getScriptRam(SHARE, "home"));
    let workerCount = 0;
    let threadCount = 0;
    let hostCount = 0;
    for (const host of hosts) {
        const owned = boostProcessesOnHost(ns, host, boostId);
        if (owned.length > 0) hostCount += 1;
        workerCount += owned.length;
        threadCount += owned.reduce((sum, proc) => sum + Math.max(0, Number(proc.threads) || 0), 0);
    }
    return { hostCount, workerCount, threadCount, ram: threadCount * scriptRam };
}

async function reconcileBoostShares(ns, hosts, cfg, boost, budgetRam) {
    const scriptRam = Math.max(0, ns.getScriptRam(SHARE, "home"));
    if (!boost?.boostId || scriptRam <= 0) {
        return { hostCount: 0, workerCount: 0, threadCount: 0, ram: 0, error: "share-script-ram-unavailable" };
    }
    const capacities = boostCapacities(ns, hosts, cfg, boost.boostId);
    const plan = planShareThreads(capacities, budgetRam, scriptRam);
    const desired = new Map(plan.map(item => [item.host, item.threads]));
    const failures = [];

    for (const item of capacities) {
        const wanted = desired.get(item.host) ?? 0;
        const owned = item.ownedProcesses;
        const currentThreads = owned.reduce((sum, proc) => sum + Math.max(0, Number(proc.threads) || 0), 0);
        const stable = wanted === currentThreads && owned.length <= 1 && owned.every(proc => {
            const meta = shareProcessMeta(proc);
            return meta?.boostId === boost.boostId && Number(meta?.endsAt) === Number(boost.endsAt);
        });
        if (stable) continue;

        for (const proc of owned) {
            killOwnedBoostShare(ns, item.host, proc, boost.boostId);
        }
        if (wanted <= 0) continue;
        if (!(await ensureScript(ns, SHARE, item.host))) {
            failures.push(`${item.host}:share-script-unavailable`);
            continue;
        }
        let pid = 0;
        try {
            pid = ns.exec(SHARE, item.host, wanted, ...shareArgs(boost, 0));
        } catch {}
        if (!pid) failures.push(`${item.host}:exec-returned-0`);
    }

    return {
        ...boostShareInventory(ns, hosts, boost.boostId),
        error: failures.length ? failures.join(",") : null,
    };
}

function prepNeed(ns, target, cfg) {
    const margin = cfg.hacking?.prepSecurityMargin ?? 0.5;
    const moneyFrac = cfg.hacking?.prepMoneyFraction ?? 0.985;
    const minSec = ns.getServerMinSecurityLevel(target);
    const sec = ns.getServerSecurityLevel(target);
    const maxMoney = ns.getServerMaxMoney(target);
    const money = ns.getServerMoneyAvailable(target);

    if (sec > minSec + margin) {
        const per = Math.max(0.0001, ns.weakenAnalyze(1));
        return {
            host: target,
            op: "weaken",
            threads: Math.max(1, Math.ceil((sec - minSec) / per)),
            ram: ns.getScriptRam(W, "home"),
            securityExcess: Math.max(0, sec - minSec),
            moneyFraction: maxMoney > 0 ? money / maxMoney : 0,
        };
    }

    if (maxMoney > 0 && money < maxMoney * moneyFrac) {
        const factor = Math.max(1.01, maxMoney / Math.max(1, money));
        let threads = Math.ceil(ns.growthAnalyze(target, factor));
        if (!Number.isFinite(threads) || threads < 1) threads = 1;
        return {
            host: target,
            op: "grow",
            threads,
            ram: ns.getScriptRam(G, "home"),
            securityExcess: Math.max(0, sec - minSec),
            moneyFraction: money / maxMoney,
        };
    }

    return null;
}

async function launchBackgroundPrep(ns, {
    ranked,
    activeCounts,
    legacyByTarget,
    taintedTargets,
    activePrep,
    hosts,
    cfg,
    freeRam,
    boost,
}) {
    const maxPrep = Math.max(0, cfg.hacking?.maxPrepTargets ?? 20);
    if (maxPrep <= 0 || activePrep.size >= maxPrep || freeRam < 2) return;

    const needs = [];
    for (const target of ranked) {
        if (needs.length + activePrep.size >= maxPrep) break;
        if (activePrep.has(target)) continue;
        if ((activeCounts.get(target) ?? 0) > 0) continue;
        if ((legacyByTarget.get(target) ?? 0) > 0) continue;
        if (taintedTargets.has(target)) continue;
        const need = prepNeed(ns, target, cfg);
        if (need) needs.push(need);
    }
    if (!needs.length) return;

    const allocation = allocatePrep(needs, {
        freeRam,
        maxTargets: Math.max(0, maxPrep - activePrep.size),
    });

    for (const entry of allocation.plan) {
        const script = entry.op === "weaken" ? W : G;
        const started = Date.now();
        const result = await execDistributed(
            ns,
            script,
            entry.threads,
            [entry.host, 0],
            hosts,
            cfg,
            boost,
        );
        if (result.workers.length > 0) {
            activePrep.set(entry.host, {
                target: entry.host,
                op: entry.op,
                threads: result.launched,
                ram: result.workers.reduce((sum, w) => sum + w.ram, 0),
                startedAt: started,
                expectedFinishAt: null,
                securityExcess: needs.find(n => n.host === entry.host)?.securityExcess ?? null,
                moneyFraction: needs.find(n => n.host === entry.host)?.moneyFraction ?? null,
                workers: result.workers,
            });
        }
    }
}

function targetTelemetry(ns, {
    ranked,
    schedulerState,
    snapshots,
    activeCounts,
    activePrep,
    taintedTargets,
    staleSnapshots,
    rankMap,
}) {
    const out = [];
    for (const target of ranked.slice(0, TARGET_TELEMETRY_LIMIT)) {
        const snapshot = snapshots.get(target);
        const shape = snapshot?.shape ?? null;
        const live = targetLiveState(ns, target);
        let liveTimes = null;
        try { liveTimes = operationTimes(ns, target); } catch {}

        const active = activeCounts.get(target) ?? 0;
        const depth = snapshot?.depth ?? null;
        const stale = staleSnapshots.get(target) ?? null;
        out.push({
            target,
            rank: rankMap.get(target) ?? null,
            state: schedulerState.get(target) ??
                (taintedTargets.has(target) ? "tainted" :
                activePrep.has(target) ? "prep" :
                active > 0 ? "active" : "excluded"),
            activeBatches: active,
            pipelineDepth: depth,
            availableSlots: depth == null ? null : Math.max(0, depth - active),
            planningPlanner: snapshot?.planner ?? null,
            planningSnapshotCapturedAt: snapshot?.capturedAt ?? null,
            planningHackingLevel: snapshot?.hackingLevel ?? null,
            planningHackPerThread: snapshot?.hackPerThread ?? null,
            planningMoneyFraction: snapshot?.moneyFraction ?? null,
            planningSecurityExcess: snapshot?.securityExcess ?? null,
            planningBatchRam: shape?.ram ?? null,
            planningMetric: shape?.metric ?? null,
            planningExpectedMoney: shape?.expected ?? null,
            planningHackThreads: shape?.ht ?? null,
            planningGrowThreads: shape?.gt ?? null,
            planningW1Threads: shape?.wt1 ?? null,
            planningW2Threads: shape?.wt2 ?? null,
            planningGrowSecurity: shape?.growSecurity ?? null,
            planningHackTime: shape?.hTime ?? null,
            planningGrowTime: shape?.gTime ?? null,
            planningWeakenTime: shape?.wTime ?? null,
            snapshotStale: Boolean(stale),
            snapshotStaleSince: stale?.staleSince ?? null,
            snapshotStaleReason: stale?.reason ?? null,
            probeHackingLevel: snapshot?.lastProbe?.hackingLevel ?? null,
            probeHackFraction: snapshot?.lastProbe?.currentHackFraction ?? null,
            probeRequiredGrowThreads: snapshot?.lastProbe?.currentGrowThreads ?? null,
            probeGrowThreadShortfall: snapshot?.lastProbe?.growThreadShortfall ?? null,
            liveMoneyFraction: live.moneyFraction,
            liveSecurityExcess: live.securityExcess,
            liveHackTime: liveTimes?.hTime ?? null,
            liveGrowTime: liveTimes?.gTime ?? null,
            liveWeakenTime: liveTimes?.wTime ?? null,
        });
    }
    return out;
}

export async function main(ns) {
    ns.disableLog("ALL");

    const planningSnapshots = new Map();
    const nextFinishByTarget = new Map();
    const taintedTargets = new Map();
    const staleSnapshots = new Map();
    const staleRefreshPending = new Set();
    const activeBatches = [];
    const activePrep = new Map();
    const schedulerState = new Map();

    const recentFailureIncidents = [];
    const recentAdmissionDeferrals = [];

    let successfulBatchLaunches = 0;
    let batchAdmissionDeferrals = 0;
    let batchAdmissionDeferredThreads = 0;
    let batchAdmissionDeferredRam = 0;
    let failedBatchIncidents = 0;
    let failedThreadsTotal = 0;
    let snapshotStaleDrains = 0;
    let snapshotRefreshes = 0;
    let plannerSnapshotSwitches = 0;
    let formulaRankedCache = [];
    let formulaRankRefreshAt = 0;
    let boostRuntime = null;
    let boostStats = { hostCount: 0, workerCount: 0, threadCount: 0, ram: 0, error: null };
    let lastBoostReconcileAt = 0;
    let lastBoostStateAt = 0;

    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled === false || cfg.automation?.hacking === false) {
            await writeState(ns, "hacking", {
                status: "paused",
                scheduler: "rolling",
            });
            await ns.sleep(2000);
            continue;
        }

        const planner = selectPlanningContext(ns);
        const { hosts } = scanAll(ns);
        const directiveState = getDirectives(ns);
        const directive = directiveState?.directives?.hacking;
        const now = Date.now();
        const directiveBoost = normalizeBoostRequest(
            directiveState?.directives?.reputationBoost,
            now,
        );
        // Coordinator publishes the command into directives; the raw request is
        // also read as an immediate revocation/expiry guard so cancel cannot be
        // delayed by a stale directives file.
        const requestRecord = readJson(ns, BOOST_REQUEST_STATE, null);
        const requestRecordActive = normalizeBoostRequest(requestRecord, now);
        const requestRevoked = Boolean(
            directiveBoost &&
            requestRecord?.type === BOOST_TYPE &&
            String(requestRecord?.boostId ?? "") === directiveBoost.boostId &&
            !requestRecordActive
        );
        const requestedBoost = requestRevoked ? null : directiveBoost;
        const automaticShare = !requestedBoost && directive === "share" ? {
            type: BOOST_TYPE,
            status: "active",
            mode: BOOST_MODE_NORMAL,
            boostId: "coordinator-share",
            startedAt: now,
            durationMs: null,
            endsAt: Number.MAX_SAFE_INTEGER,
            remainingMs: null,
        } : null;
        let announcedBoost = requestedBoost ?? automaticShare;
        const runtimeExpired = Boolean(
            boostRuntime?.source === "command" &&
            Number.isFinite(boostRuntime?.endsAt) &&
            now >= boostRuntime.endsAt
        );

        if (boostRuntime && (runtimeExpired || !announcedBoost ||
            announcedBoost.boostId !== boostRuntime.boostId ||
            announcedBoost.mode !== boostRuntime.mode)) {
            const prior = boostRuntime;
            const cleanup = await stopOwnedBoostShares(ns, hosts, prior.boostId);
            if (cleanup.remaining > 0) {
                await writeState(ns, "boost", {
                    status: "cleanup-pending",
                    type: BOOST_TYPE,
                    mode: prior.mode,
                    source: prior.source,
                    boostId: prior.boostId,
                    durationMs: prior.durationMs ?? null,
                    requestedAt: prior.requestedAt ?? null,
                    startedAt: prior.startedAt ?? null,
                    endsAt: prior.source === "command" ? prior.endsAt ?? null : null,
                    remainingMs: 0,
                    phase: "cleanup-pending",
                    admissionPaused: prior.mode === BOOST_MODE_MAX,
                    admissionState: prior.mode === BOOST_MODE_MAX ? "paused" : "open",
                    shareHosts: cleanup.remainingHosts,
                    shareWorkers: cleanup.remaining,
                    shareThreads: cleanup.remainingThreads,
                    restoreState: "cleanup-pending",
                    shareWorkersStopped: cleanup.stopped,
                    error: "owned-share-cleanup-incomplete",
                });
                await ns.sleep(250);
                continue;
            }
            const stopped = cleanup.stopped;
            const controlLost = Boolean(
                prior.source === "command" &&
                !runtimeExpired &&
                !announcedBoost &&
                requestRecordActive?.boostId === prior.boostId
            );
            if (prior.source === "command" && (runtimeExpired || controlLost)) {
                await writeJson(ns, BOOST_REQUEST_STATE, {
                    type: BOOST_TYPE,
                    status: runtimeExpired ? "completed" : "cancelled",
                    mode: prior.mode,
                    boostId: prior.boostId,
                    requestedAt: prior.requestedAt ?? null,
                    startedAt: prior.startedAt ?? null,
                    durationMs: prior.durationMs ?? null,
                    endsAt: prior.endsAt ?? null,
                    completedAt: runtimeExpired ? now : null,
                    cancelledAt: controlLost ? now : null,
                    reason: controlLost ? "control-plane-lost" : null,
                });
                announcedBoost = null;
            }
            await writeState(ns, "boost", {
                status: runtimeExpired ? "completed" : "cancelled",
                type: BOOST_TYPE,
                mode: prior.mode,
                source: prior.source,
                boostId: prior.boostId,
                durationMs: prior.durationMs ?? null,
                requestedAt: prior.requestedAt ?? null,
                startedAt: prior.startedAt ?? null,
                endsAt: prior.source === "command" ? prior.endsAt ?? null : null,
                remainingMs: 0,
                phase: "restored",
                admissionPaused: false,
                admissionState: "open",
                drainStartedAt: prior.drainStartedAt ?? null,
                drainCompletedAt: prior.drainedAt ?? null,
                shareStartedAt: prior.shareStartedAt ?? null,
                shareHosts: 0,
                shareWorkers: 0,
                shareThreads: 0,
                shareRam: 0,
                lastReconcileAt: lastBoostReconcileAt || null,
                restoreState: "rolling",
                completedAt: now,
                shareWorkersStopped: stopped,
                error: null,
            });
            boostRuntime = null;
            boostStats = { hostCount: 0, workerCount: 0, threadCount: 0, ram: 0, error: null };
            lastBoostReconcileAt = 0;
            lastBoostStateAt = 0;
        }

        if (announcedBoost && !boostRuntime) {
            boostRuntime = {
                ...announcedBoost,
                source: requestedBoost ? "command" : "coordinator",
                activatedAt: now,
                drainStartedAt: announcedBoost.mode === BOOST_MODE_MAX ? now : null,
                drainedAt: null,
                shareStartedAt: null,
            };
        }
        const boost = boostRuntime;
        await cleanupOrphanBoostShares(ns, hosts, boost?.boostId ?? null);
        const mode = directive === "xp" ? "xp" : "money";

        pruneActive(ns, activeBatches, activePrep);
        const trackedPids = trackedPidSet(activeBatches, activePrep);
        const legacy = legacyWorkers(ns, hosts, trackedPids);
        const activeCounts = activeByTarget(activeBatches);

        // A capability change is a generation boundary. Existing in-flight
        // batches keep their original immutable shape and drain normally; only
        // clean idle targets may capture a snapshot from the new planner.
        for (const [target, snapshot] of planningSnapshots.entries()) {
            const snapshotPlanner = snapshot.planner ?? PLANNER_NATIVE;
            if (snapshotPlanner !== planner.kind && !staleSnapshots.has(target)) {
                plannerSnapshotSwitches += 1;
                const inFlight = activeCounts.get(target) ?? 0;
                if (inFlight > 0) {
                    const observedAt = Date.now();
                    staleSnapshots.set(target, {
                        staleSince: observedAt,
                        observedAt,
                        reason: "planner-switch",
                        fromPlanner: snapshotPlanner,
                        toPlanner: planner.kind,
                        hackingLevel: ns.getHackingLevel(),
                        requiresDrain: true,
                    });
                    snapshotStaleDrains += 1;
                } else {
                    planningSnapshots.delete(target);
                    nextFinishByTarget.delete(target);
                    staleRefreshPending.add(target);
                }
                continue;
            }

            if (staleSnapshots.has(target)) continue;
            if ((activeCounts.get(target) ?? 0) <= 0) continue;
            const probe = snapshotPlanner === PLANNER_FORMULAS
                ? formulaProbePlanningSnapshot(ns, target, snapshot, planner)
                : probePlanningSnapshot(ns, target, snapshot);
            if (!probe) continue;
            snapshot.lastProbe = probe;
            if (probe.requiresDrain) {
                staleSnapshots.set(target, {
                    staleSince: probe.observedAt,
                    reason: "grow-thread-shortfall",
                    ...probe,
                });
                snapshotStaleDrains += 1;
            }
        }

        for (const [target] of taintedTargets) {
            if ((activeCounts.get(target) ?? 0) === 0 &&
                (legacy.byTarget.get(target) ?? 0) === 0) {
                taintedTargets.delete(target);
            }
        }

        let ranked;
        if (mode === "money" && planner.kind === PLANNER_FORMULAS) {
            const now = Date.now();
            const candidates = candidateTargets(ns, hosts, cfg);
            const eligible = new Set(candidates);
            const cachedEligible = formulaRankedCache.filter(host => eligible.has(host));
            const candidateSetChanged = cachedEligible.length !== formulaRankedCache.length ||
                cachedEligible.length !== candidates.length;
            if (now >= formulaRankRefreshAt || formulaRankedCache.length === 0 || candidateSetChanged) {
                formulaRankedCache = rankTargets(ns, hosts, cfg, mode, planner);
                formulaRankRefreshAt = now + FORMULA_RANK_REFRESH_MS;
                ranked = formulaRankedCache;
            } else {
                ranked = cachedEligible;
            }
        } else {
            ranked = rankTargets(ns, hosts, cfg, mode, planner);
            formulaRankedCache = [];
            formulaRankRefreshAt = 0;
        }

        const rankMap = new Map(ranked.map((host, index) => [host, index + 1]));
        const admissionPaused = boost?.mode === BOOST_MODE_MAX;
        const maxTargets = Math.max(1, cfg.hacking?.maxTargets ?? 32);
        const gap = Math.max(1, cfg.hacking?.batchGapMs ?? 120);
        const configuredMax = cfg.hacking?.maxBatches;
        const reserveFraction = Math.min(
            0.9,
            Math.max(0, Number(cfg.hacking?.waveReserveFraction ?? 0.05) || 0),
        );

        schedulerState.clear();
        const ready = [];

        for (const host of ranked.slice(0, maxTargets)) {
            const inFlight = activeCounts.get(host) ?? 0;
            const hasLegacy = (legacy.byTarget.get(host) ?? 0) > 0;
            const stale = staleSnapshots.get(host);

            if (stale && inFlight > 0) {
                schedulerState.set(host, "snapshot-stale-drain");
                continue;
            }
            if (stale && inFlight === 0) {
                // The old generation is gone. Discard the stale assumptions,
                // then flow through the normal prep/clean-capture lifecycle.
                staleSnapshots.delete(host);
                staleRefreshPending.add(host);
                planningSnapshots.delete(host);
                nextFinishByTarget.delete(host);
            }

            if (taintedTargets.has(host)) {
                schedulerState.set(host, "tainted");
                continue;
            }
            if (activePrep.has(host)) {
                schedulerState.set(host, "prep");
                continue;
            }
            if (hasLegacy) {
                schedulerState.set(host, "legacy-drain");
                continue;
            }

            if (inFlight === 0) {
                if (!isPrepped(ns, host, cfg)) {
                    planningSnapshots.delete(host);
                    nextFinishByTarget.delete(host);
                    schedulerState.set(host, "unprepped");
                    continue;
                }

                const existing = planningSnapshots.get(host);
                if (!existing || existing.used) {
                    const snapshot = capturePlanningSnapshot(
                        ns,
                        host,
                        cfg,
                        gap,
                        configuredMax,
                        planner,
                    );
                    if (!snapshot) {
                        schedulerState.set(host, "no-shape");
                        continue;
                    }
                    planningSnapshots.set(host, snapshot);
                    nextFinishByTarget.delete(host);
                    if (staleRefreshPending.delete(host) || existing?.used) snapshotRefreshes += 1;
                }
            }

            const snapshot = planningSnapshots.get(host);
            if (!snapshot) {
                schedulerState.set(host, inFlight > 0 ? "snapshot-missing" : "no-snapshot");
                continue;
            }

            schedulerState.set(host, "ready");
            ready.push({ host, snapshot, active: inFlight, rank: rankMap.get(host) ?? null });
        }

        const leadTarget = ready[0]?.host ?? ranked[0] ?? null;

        if (!admissionPaused) {
        fill:
        for (const entry of ready) {
            const { host, snapshot, rank } = entry;
            let active = activeCounts.get(host) ?? 0;

            while (active < snapshot.depth) {
                const ramNow = liveRam(ns, hosts, cfg, boost);
                const schedulerReserveRam = ramNow.schedulableFree * reserveFraction;
                const schedulerUsableIdleRam = Math.max(0, ramNow.schedulableFree - schedulerReserveRam);

                if (schedulerUsableIdleRam < snapshot.shape.ram) break fill;

                const pool = schedulablePool(ns, hosts, cfg, boost).map(item => ({
                    host: item.host,
                    free: item.free,
                }));
                const components = batchComponents(ns, snapshot.shape);
                const plan = planBatchPlacement(pool, components);

                if (!plan.ok) {
                    batchAdmissionDeferrals += 1;
                    batchAdmissionDeferredThreads += plan.failed?.missingThreads ?? 0;
                    batchAdmissionDeferredRam += plan.failed?.missingRam ?? 0;

                    pushBounded(recentAdmissionDeferrals, {
                        timestamp: Date.now(),
                        target: host,
                        targetRank: rank,
                        activeBatches: active,
                        pipelineDepth: snapshot.depth,
                        shapeRam: snapshot.shape.ram,
                        networkMaxRam: ramNow.max,
                        networkUsedRam: ramNow.used,
                        nominalFreeRam: ramNow.free,
                        schedulerReserveRam,
                        schedulerUsableIdleRam,
                        failedComponent: plan.failed?.op ?? null,
                        requestedThreads: plan.failed?.requestedThreads ?? 0,
                        placeableThreads: plan.failed?.placeableThreads ?? 0,
                        missingThreads: plan.failed?.missingThreads ?? 0,
                        requestedComponentRam: plan.failed?.requestedRam ?? 0,
                        placeableComponentRam: plan.failed?.placeableRam ?? 0,
                        missingComponentRam: plan.failed?.missingRam ?? 0,
                        componentNominalFreeRam: plan.failed?.nominalFreeRam ?? 0,
                        componentSchedulableRam: plan.failed?.schedulableRam ?? 0,
                        componentFragmentationRam: plan.failed?.fragmentationRam ?? 0,
                    }, DEFERRAL_RING);

                    break fill;
                }

                let baseFinish = nextFinishByTarget.get(host);
                if (!Number.isFinite(baseFinish)) {
                    const liveTimes = operationTimes(ns, host);
                    baseFinish = Date.now() +
                        Math.max(liveTimes.hTime, liveTimes.gTime, liveTimes.wTime) +
                        LAUNCH_MARGIN_MS;
                }

                const result = await launchBatch(ns, {
                    target: host,
                    shape: snapshot.shape,
                    plan,
                    baseFinish,
                    gap,
                    rank,
                    activeCount: active,
                    depth: snapshot.depth,
                    preflight: ramNow,
                    schedulerReserveRam,
                    schedulerUsableIdleRam,
                    cfg,
                    boost,
                });

                nextFinishByTarget.set(
                    host,
                    result.baseFinish + gap * 4,
                );

                if (result.failedThreads > 0) {
                    failedBatchIncidents += 1;
                    failedThreadsTotal += result.failedThreads;

                    const first = result.failures[0] ?? null;
                    const incident = {
                        timestamp: Date.now(),
                        target: host,
                        failedComponent: first?.op ?? null,
                        componentScript: first?.script ?? null,
                        requestedThreads: first?.requestedThreads ?? 0,
                        launchedThreads: first?.launchedThreads ?? 0,
                        failedThreads: result.failedThreads,
                        requestedComponentRam: first?.requestedRam ?? 0,
                        launchedComponentRam: first?.launchedRam ?? 0,
                        missingComponentRam: first?.missingRam ?? 0,
                        totalBatchShapeRam: snapshot.shape.ram,
                        batchHThreads: snapshot.shape.ht,
                        batchW1Threads: snapshot.shape.wt1,
                        batchGThreads: snapshot.shape.gt,
                        batchW2Threads: snapshot.shape.wt2,
                        batchExpectedMoney: snapshot.shape.expected,
                        batchMetric: snapshot.shape.metric,
                        pipelineDepth: snapshot.depth,
                        targetRank: rank,
                        activeBatches: active,
                        networkMaxRam: ramNow.max,
                        networkUsedRam: ramNow.used,
                        nominalFreeRam: ramNow.free,
                        schedulerReserveRam,
                        schedulerUsableIdleRam,
                        plannedNominalFreeRam: first?.plannedNominalFreeRam ?? null,
                        plannedSchedulableRam: first?.plannedSchedulableRam ?? null,
                        plannedFragmentationRam: first?.plannedFragmentationRam ?? null,
                        finishShiftMs: result.finishShiftMs,
                        failures: result.failures,
                    };
                    pushBounded(recentFailureIncidents, incident, FAILURE_RING);

                    if (!taintedTargets.has(host)) {
                        taintedTargets.set(host, {
                            taintedSince: Date.now(),
                            cause: "batch-pressure",
                            lastFailureComponent: first?.op ?? null,
                            failedThreads: result.failedThreads,
                        });
                    } else {
                        const prior = taintedTargets.get(host);
                        prior.lastFailureComponent = first?.op ?? prior.lastFailureComponent;
                        prior.failedThreads = result.failedThreads;
                    }

                    if (result.workers.length > 0) {
                        activeBatches.push({
                            target: host,
                            workers: result.workers,
                            startedAt: Date.now(),
                            baseFinish: result.baseFinish,
                            shape: snapshot.shape,
                            partial: true,
                        });
                    }

                    await event(
                        ns,
                        "hacking",
                        `Batch pressure: ${result.failedThreads} threads could not launch for ${host}`,
                        "warn",
                    );
                    break fill;
                }

                activeBatches.push({
                    target: host,
                    workers: result.workers,
                    startedAt: Date.now(),
                    baseFinish: result.baseFinish,
                    shape: snapshot.shape,
                    partial: false,
                });
                successfulBatchLaunches += 1;
                snapshot.used = true;
                active += 1;
                activeCounts.set(host, active);
            }
        }
        }

        const afterHwgw = liveRam(ns, hosts, cfg, boost);
        const prepReserve = afterHwgw.schedulableFree * reserveFraction;
        const prepUsable = Math.max(0, afterHwgw.schedulableFree - prepReserve);
        if (!admissionPaused) {
            await launchBackgroundPrep(ns, {
                ranked,
                activeCounts,
                legacyByTarget: legacy.byTarget,
                taintedTargets,
                activePrep,
                hosts,
                cfg,
                freeRam: prepUsable,
                boost,
            });
        }

        let afterAll = liveRam(ns, hosts, cfg, boost);
        const drainReady = admissionPaused && maxBoostReady({
            activeBatches: activeBatches.length,
            activePrep: activePrep.size,
            legacyWorkers: legacy.workers.length,
        });
        if (drainReady && boost && !boost.drainedAt) {
            const drainedAt = Date.now();
            boost.drainedAt = drainedAt;
            if (boost.mode === BOOST_MODE_MAX && boost.source === "command" && !Number.isFinite(boost.endsAt)) {
                const activated = activateMaxBoostRequest(boost, drainedAt);
                if (activated) {
                    Object.assign(boost, activated);
                    await writeJson(ns, BOOST_REQUEST_STATE, activated);
                } else {
                    boostStats.error = "max-activation-failed";
                }
            }
        }
        const boostPhase = boost?.mode === BOOST_MODE_MAX
            ? (drainReady ? "sharing" : "draining")
            : boost ? "sharing-idle" : null;
        const maxTimingReady = boost?.mode !== BOOST_MODE_MAX ||
            boost?.source !== "command" || Number.isFinite(boost?.endsAt);
        const shouldShare = Boolean(
            boost && maxTimingReady && (boost.mode === BOOST_MODE_NORMAL || drainReady)
        );

        if (boost && !shouldShare && boostStats.workerCount > 0) {
            const cleanup = await stopOwnedBoostShares(ns, hosts, boost.boostId);
            boostStats = cleanup.remaining > 0
                ? {
                    hostCount: cleanup.remainingHosts,
                    workerCount: cleanup.remaining,
                    threadCount: cleanup.remainingThreads,
                    ram: cleanup.remainingThreads * Math.max(0, ns.getScriptRam(SHARE, "home")),
                    error: "owned-share-cleanup-incomplete",
                }
                : { hostCount: 0, workerCount: 0, threadCount: 0, ram: 0, error: null };
        }
        if (shouldShare && Date.now() - lastBoostReconcileAt >= BOOST_RECONCILE_MS) {
            const capacities = boostCapacities(ns, hosts, cfg, boost.boostId);
            const totalCapacity = capacities.reduce((sum, item) => sum + item.availableRam, 0);
            const budget = boost.mode === BOOST_MODE_MAX
                ? totalCapacity
                : normalShareBudget(afterAll.schedulableFree, reserveFraction);
            boostStats = await reconcileBoostShares(ns, hosts, cfg, boost, budget);
            lastBoostReconcileAt = Date.now();
            if (!boost.shareStartedAt && boostStats.threadCount > 0) boost.shareStartedAt = lastBoostReconcileAt;
            afterAll = liveRam(ns, hosts, cfg, boost);
        }

        const intentionallyReservedRam = afterAll.schedulableFree * reserveFraction;
        const usableIdleRam = Math.max(0, afterAll.schedulableFree - intentionallyReservedRam);

        if (boost && Date.now() - lastBoostStateAt >= BOOST_RECONCILE_MS) {
            const stateNow = Date.now();
            await writeState(ns, "boost", {
                status: boost.source === "command" ? "active" : "automatic",
                type: BOOST_TYPE,
                mode: boost.mode,
                source: boost.source,
                boostId: boost.boostId,
                durationMs: boost.durationMs ?? null,
                requestedAt: boost.requestedAt ?? null,
                startedAt: boost.startedAt ?? null,
                activatedAt: boost.activatedAt,
                endsAt: boost.source === "command" ? boost.endsAt : null,
                remainingMs: boost.source === "command" ? Math.max(0, boost.endsAt - stateNow) : null,
                phase: boostPhase,
                admissionPaused,
                admissionState: admissionPaused ? "paused" : "open",
                drainStartedAt: boost.drainStartedAt ?? null,
                drainCompletedAt: boost.drainedAt ?? null,
                shareStartedAt: boost.shareStartedAt ?? null,
                shareHosts: boostStats.hostCount,
                shareWorkers: boostStats.workerCount,
                shareThreads: boostStats.threadCount,
                shareRam: boostStats.ram,
                networkRamUsed: afterAll.used,
                networkRamMax: afterAll.max,
                networkRamUtilisation: afterAll.max > 0 ? afterAll.used / afterAll.max : 0,
                homeReserveRam: homeReserveFor(ns.getServerMaxRam("home"), cfg),
                lastReconcileAt: lastBoostReconcileAt || null,
                restoreState: "pending",
                completedAt: null,
                error: boostStats.error ?? null,
            });
            lastBoostStateAt = stateNow;
        }
        const refreshedCounts = activeByTarget(activeBatches);

        const taintState = [...taintedTargets.entries()].map(([target, meta]) => ({
            target,
            taintedSince: meta.taintedSince,
            cause: meta.cause,
            lastFailureComponent: meta.lastFailureComponent,
            failedThreads: meta.failedThreads,
            activeBatchesRemaining: refreshedCounts.get(target) ?? 0,
            pipelineDepth: planningSnapshots.get(target)?.depth ?? null,
        }));

        const prepTargets = [...activePrep.values()].map(prep => ({
            target: prep.target,
            op: prep.op,
            threads: prep.threads,
            ram: prep.ram,
            startTimestamp: prep.startedAt,
            expectedCompletionTimestamp: prep.expectedFinishAt,
            securityExcess: prep.securityExcess,
            moneyFraction: prep.moneyFraction,
        }));

        await writeState(ns, "hacking", {
            status: admissionPaused
                ? (maxBoostReady({ activeBatches: activeBatches.length, activePrep: activePrep.size, legacyWorkers: legacy.workers.length })
                    ? "boost-sharing" : "boost-draining")
                : ready.length || activeBatches.length ? "batching" : "preparing",
            scheduler: "rolling",
            phase: "HWGW-ROLLING",
            controlMode: boost ? `reputation-boost:${boost.mode}` : "normal",
            boostMode: boost?.mode ?? null,
            boostId: boost?.boostId ?? null,
            boostPhase,
            admissionPaused,
            planner: planner.kind,
            formulasAvailable: planner.formulasAvailable,
            plannerFallbackReason: planner.fallbackReason,
            plannerSnapshotSwitches,
            formulaRankRefreshAt: formulaRankRefreshAt || null,
            target: leadTarget,
            gapMs: gap,
            candidateCount: ranked.length,
            successfulBatchLaunches,
            batchCounter: successfulBatchLaunches,
            batchAdmissionDeferrals,
            batchAdmissionDeferredThreads,
            batchAdmissionDeferredRam,
            failedBatchIncidents,
            failedThreads: failedThreadsTotal,
            taintedTargetCount: taintState.length,
            taintedTargets: taintState,
            staleSnapshotCount: staleSnapshots.size,
            snapshotStaleDrains,
            snapshotRefreshes,
            staleRefreshPendingCount: staleRefreshPending.size,
            staleSnapshots: [...staleSnapshots.entries()].map(([target, meta]) => ({
                target,
                staleSince: meta.staleSince,
                reason: meta.reason,
                fromPlanner: meta.fromPlanner ?? null,
                toPlanner: meta.toPlanner ?? null,
                planningGrowThreads: meta.plannedGrowThreads ?? null,
                requiredGrowThreads: meta.currentGrowThreads ?? null,
                growThreadShortfall: meta.growThreadShortfall ?? null,
                planningHackFraction: meta.plannedHackFraction ?? null,
                observedHackFraction: meta.currentHackFraction ?? null,
                planningHackingLevel: planningSnapshots.get(target)?.hackingLevel ?? null,
                observedHackingLevel: meta.hackingLevel ?? null,
                activeBatchesRemaining: refreshedCounts.get(target) ?? 0,
            })),
            recentAdmissionDeferrals,
            recentFailureIncidents,
            actualNetworkRamUtilisation: afterAll.max > 0 ? afterAll.used / afterAll.max : 0,
            networkRamUsed: afterAll.used,
            networkRamMax: afterAll.max,
            reclaimableShareRam: afterAll.reclaimableShareRam,
            schedulableFreeRam: afterAll.schedulableFree,
            inflightHwgwRam: activeHwgwRam(activeBatches),
            prepRam: activePrepRam(activePrep),
            intentionallyReservedRam,
            usableIdleRam,
            freeRam: afterAll.free,
            activeBatches: activeBatches.length,
            readyTargets: ready.length,
            preppingTargets: activePrep.size,
            legacyWorkerProcesses: legacy.workers.length,
            targetScheduler: targetTelemetry(ns, {
                ranked,
                schedulerState,
                snapshots: planningSnapshots,
                activeCounts: refreshedCounts,
                activePrep,
                taintedTargets,
                staleSnapshots,
                rankMap,
            }),
            targetTelemetryTruncated: ranked.length > TARGET_TELEMETRY_LIMIT,
            prepTargets,
        });

        await ns.sleep(Math.max(40, Math.min(250, gap)));
    }
}
