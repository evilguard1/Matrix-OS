import { config, event, writeState, clamp, getDirectives } from "/matrix/lib/common.js";
import { scanAll, workerHosts } from "/matrix/lib/network.js";
import {
    allocatePrep,
    execTag,
    pipelineDepth,
    planBatchPlacement,
} from "/matrix/lib/batch.js";
import { homeReserveFor } from "/matrix/lib/capabilities.js";

const H = "/matrix/workers/hack.js";
const G = "/matrix/workers/grow.js";
const W = "/matrix/workers/weaken.js";
const SHARE = "/matrix/workers/share.js";

const SHARE_FRACTION = 0.25;
const FAILURE_RING = 32;
const DEFERRAL_RING = 16;
const TARGET_TELEMETRY_LIMIT = 40;
const LAUNCH_MARGIN_MS = 300;

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

function rankTargets(ns, hosts, cfg, mode = "money") {
    const scorer = mode === "xp" ? xpScore : targetScore;
    return candidateTargets(ns, hosts, cfg)
        .map(h => ({ host: h, score: scorer(ns, h) }))
        .sort((a, b) => b.score - a.score)
        .map(entry => entry.host);
}

function freePool(ns, hosts, cfg) {
    return workerHosts(ns, hosts, homeReserveFor(ns.getServerMaxRam("home"), cfg));
}

function liveRam(ns, hosts, cfg) {
    const reserveHome = homeReserveFor(ns.getServerMaxRam("home"), cfg);
    let max = 0;
    let used = 0;
    let free = 0;
    for (const host of hosts) {
        if (!ns.hasRootAccess(host)) continue;
        const hostMax = Math.max(0, ns.getServerMaxRam(host));
        if (hostMax <= 0) continue;
        const hostUsed = Math.max(0, ns.getServerUsedRam(host));
        const reserve = host === "home" ? reserveHome : 0;
        max += hostMax;
        used += hostUsed;
        free += Math.max(0, hostMax - hostUsed - reserve);
    }
    return { max, used, free };
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

function capturePlanningSnapshot(ns, target, cfg, gap, configuredMax) {
    const live = targetLiveState(ns, target);
    const shape = batchShape(ns, target, cfg);
    if (!shape) return null;
    const depth = pipelineDepth({
        weakenTimeMs: shape.wTime,
        gapMs: gap,
        configuredMax,
    });
    return {
        target,
        capturedAt: Date.now(),
        hackingLevel: ns.getHackingLevel(),
        moneyFraction: live.moneyFraction,
        securityExcess: live.securityExcess,
        shape,
        depth,
        used: false,
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

async function execDistributed(ns, script, threads, args, hosts, cfg) {
    let remaining = Math.max(0, Math.floor(threads));
    const ram = ns.getScriptRam(script, "home");
    const pids = [];
    const workers = [];

    for (const item of freePool(ns, hosts, cfg)) {
        if (remaining <= 0) break;
        if (!(await ensureScript(ns, script, item.host))) continue;

        const reserve = item.host === "home"
            ? homeReserveFor(ns.getServerMaxRam("home"), cfg)
            : 0;
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

async function execPlannedComponent(ns, component, args) {
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
}) {
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
        const result = await execPlannedComponent(ns, component, [target, extra]);
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

async function applyShare(ns, hosts, cfg, wanted) {
    const ram = ns.getScriptRam(SHARE, "home");
    for (const item of freePool(ns, hosts, cfg)) {
        if (!wanted) {
            try { ns.scriptKill(SHARE, item.host); } catch {}
            continue;
        }
        if (!(await ensureScript(ns, SHARE, item.host))) continue;
        const threads = Math.floor((ns.getServerMaxRam(item.host) * SHARE_FRACTION) / ram);
        if (threads > 0) {
            try { ns.exec(SHARE, item.host, { threads, preventDuplicates: true }); } catch {}
        }
    }
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
            planningSnapshotCapturedAt: snapshot?.capturedAt ?? null,
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

        const { hosts } = scanAll(ns);
        const directive = getDirectives(ns)?.directives?.hacking;
        await applyShare(ns, hosts, cfg, directive === "share");
        const mode = directive === "xp" ? "xp" : "money";

        pruneActive(ns, activeBatches, activePrep);
        const trackedPids = trackedPidSet(activeBatches, activePrep);
        const legacy = legacyWorkers(ns, hosts, trackedPids);
        const activeCounts = activeByTarget(activeBatches);

        for (const [target] of taintedTargets) {
            if ((activeCounts.get(target) ?? 0) === 0 &&
                (legacy.byTarget.get(target) ?? 0) === 0) {
                taintedTargets.delete(target);
            }
        }

        const ranked = rankTargets(ns, hosts, cfg, mode);
        const rankMap = new Map(ranked.map((host, index) => [host, index + 1]));
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
                    );
                    if (!snapshot) {
                        schedulerState.set(host, "no-shape");
                        continue;
                    }
                    planningSnapshots.set(host, snapshot);
                    nextFinishByTarget.delete(host);
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

        fill:
        for (const entry of ready) {
            const { host, snapshot, rank } = entry;
            let active = activeCounts.get(host) ?? 0;

            while (active < snapshot.depth) {
                const ramNow = liveRam(ns, hosts, cfg);
                const schedulerReserveRam = ramNow.free * reserveFraction;
                const schedulerUsableIdleRam = Math.max(0, ramNow.free - schedulerReserveRam);

                if (schedulerUsableIdleRam < snapshot.shape.ram) break fill;

                const pool = freePool(ns, hosts, cfg).map(item => ({
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

        const afterHwgw = liveRam(ns, hosts, cfg);
        const prepReserve = afterHwgw.free * reserveFraction;
        const prepUsable = Math.max(0, afterHwgw.free - prepReserve);
        await launchBackgroundPrep(ns, {
            ranked,
            activeCounts,
            legacyByTarget: legacy.byTarget,
            taintedTargets,
            activePrep,
            hosts,
            cfg,
            freeRam: prepUsable,
        });

        const afterAll = liveRam(ns, hosts, cfg);
        const intentionallyReservedRam = afterAll.free * reserveFraction;
        const usableIdleRam = Math.max(0, afterAll.free - intentionallyReservedRam);
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
            status: ready.length || activeBatches.length ? "batching" : "preparing",
            scheduler: "rolling",
            phase: "HWGW-ROLLING",
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
            recentAdmissionDeferrals,
            recentFailureIncidents,
            actualNetworkRamUtilisation: afterAll.max > 0 ? afterAll.used / afterAll.max : 0,
            networkRamUsed: afterAll.used,
            networkRamMax: afterAll.max,
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
                rankMap,
            }),
            targetTelemetryTruncated: ranked.length > TARGET_TELEMETRY_LIMIT,
            prepTargets,
        });

        await ns.sleep(Math.max(40, Math.min(250, gap)));
    }
}
