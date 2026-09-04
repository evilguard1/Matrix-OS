import { PLANNER_FORMULAS, formulaServer } from "./hacking-planner.js";

export const CORE_HOST = "home";

function finite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export function normalizeCores(value) {
    return Math.max(1, Math.floor(finite(value, 1)));
}

function facts(ns, target) {
    return {
        hostname: target,
        moneyMax: Math.max(0, ns.getServerMaxMoney(target)),
        minDifficulty: Math.max(1, finite(ns.getServerMinSecurityLevel(target), 1)),
        requiredHackingSkill: Math.max(1, finite(ns.getServerRequiredHackingLevel(target), 1)),
        serverGrowth: Math.max(0, finite(ns.getServerGrowth(target), 0)),
    };
}

function finishVariant(ns, baseline, gt, cores) {
    const c = normalizeCores(cores);
    const weakenPerThread = Math.max(0.0001, finite(ns.weakenAnalyze(1, c), 0.05));
    const hSec = Math.max(0, finite(baseline?.hackSecurity, 0));
    // Keep the historical W2 safety invariant: growthAnalyzeSecurity() receives
    // only the grow thread count. Passing a target argument can cap the result
    // against transient target state and under-weaken the batch.
    const gSec = Math.max(0, finite(ns.growthAnalyzeSecurity(gt), 0));
    const wt1 = Math.max(1, Math.ceil(hSec / weakenPerThread));
    const wt2 = Math.max(1, Math.ceil(gSec / weakenPerThread));
    const hRam = Math.max(0, finite(baseline?.hRam, 0));
    const gRam = Math.max(0, finite(baseline?.gRam, 0));
    const wRam = Math.max(0, finite(baseline?.wRam, 0));
    const ram = baseline.ht * hRam + gt * gRam + (wt1 + wt2) * wRam;
    return {
        ...baseline,
        gt,
        wt1,
        wt2,
        ram,
        growSecurity: gSec,
        homeCoreAware: true,
        coreHost: CORE_HOST,
        coreCount: c,
        baselineGt: baseline.gt,
        baselineWt1: baseline.wt1,
        baselineWt2: baseline.wt2,
        baselineRam: baseline.ram,
    };
}

/**
 * Re-size one already-valid clean/stable batch shape for execution of the whole
 * G/W portion on Home. H is intentionally unchanged. This function changes only
 * arithmetic; callers must still guarantee actual placement on Home before they
 * use the returned thread counts.
 */
export function homeCoreBatchVariant(ns, target, baseline, planner, cores) {
    const c = normalizeCores(cores);
    if (!baseline || c <= 1 || !(baseline.ht > 0) || !(baseline.f > 0)) return null;

    let gt;
    if (planner?.kind === PLANNER_FORMULAS && planner.player) {
        const serverFacts = facts(ns, target);
        if (!(serverFacts.moneyMax > 0)) return null;
        const postHack = formulaServer(ns, serverFacts, {
            moneyAvailable: serverFacts.moneyMax * (1 - baseline.f),
            hackDifficulty: serverFacts.minDifficulty,
        });
        gt = Math.ceil(ns.formulas.hacking.growThreads(
            postHack,
            planner.player,
            serverFacts.moneyMax,
            c,
        ));
    } else {
        const factor = 1 / Math.max(0.10, 1 - baseline.f);
        gt = Math.ceil(ns.growthAnalyze(target, factor, c));
    }

    if (!Number.isFinite(gt) || gt < 1) return null;
    return finishVariant(ns, baseline, gt, c);
}

function clonePool(hosts = []) {
    return (Array.isArray(hosts) ? hosts : [])
        .filter(item => item?.host)
        .map(item => ({ host: item.host, free: Math.max(0, finite(item.free, 0)) }));
}

function placeComponent(pool, component) {
    let remaining = Math.max(0, Math.floor(finite(component?.threads, 0)));
    const ram = Math.max(0, finite(component?.ramPerThread, 0));
    if (!component?.op || !component?.script || remaining < 1 || ram <= 0) return null;
    pool.sort((a, b) => b.free - a.free || a.host.localeCompare(b.host));
    const placements = [];
    for (const host of pool) {
        if (remaining <= 0) break;
        const fit = Math.floor(host.free / ram);
        if (fit <= 0) continue;
        const use = Math.min(fit, remaining);
        placements.push({ host: host.host, threads: use });
        host.free -= use * ram;
        remaining -= use;
    }
    return remaining === 0 ? { ...component, requestedThreads: component.threads, placements } : null;
}

/**
 * Conservative placement fast path.
 *
 * Reserve W1+G+W2 completely on Home first. Only if that succeeds do we place H
 * across the remaining pool. This guarantees that core-aware G/W sizing can
 * never spill onto a lower-core host. Callers should fall back to the existing
 * one-core distributed planner when this returns ok=false.
 */
export function planWholeHomeCoreBatch(hosts, components, homeHost = CORE_HOST) {
    const pool = clonePool(hosts);
    const home = pool.find(item => item.host === homeHost);
    const list = Array.isArray(components) ? components : [];
    const byOp = new Map(list.map(component => [component?.op, component]));
    const h = byOp.get("H");
    const w1 = byOp.get("W1");
    const g = byOp.get("G");
    const w2 = byOp.get("W2");
    if (!home || !h || !w1 || !g || !w2) return { ok: false, reason: "invalid-components", components: [] };

    const homeOnly = [w1, g, w2];
    const requiredHomeRam = homeOnly.reduce((sum, component) =>
        sum + Math.max(0, finite(component.threads, 0)) * Math.max(0, finite(component.ramPerThread, 0)), 0);
    if (home.free + 1e-9 < requiredHomeRam) {
        return { ok: false, reason: "home-capacity", requiredHomeRam, homeFreeRam: home.free, components: [] };
    }

    // Reserve the complete core-sensitive portion before H can consume Home.
    home.free -= requiredHomeRam;
    const plannedH = placeComponent(pool, h);
    if (!plannedH) return { ok: false, reason: "hack-capacity", requiredHomeRam, components: [] };

    const fixed = homeOnly.map(component => ({
        ...component,
        requestedThreads: component.threads,
        placements: [{ host: homeHost, threads: component.threads }],
    }));

    return {
        ok: true,
        mode: "whole-home-core",
        coreHost: homeHost,
        requiredHomeRam,
        components: [plannedH, fixed[0], fixed[1], fixed[2]],
        remainingHosts: pool,
    };
}

export function homeCorePrepWeakenThreads(ns, oneCoreThreads, cores) {
    const one = Math.max(0.0001, finite(ns.weakenAnalyze(1, 1), 0.05));
    const multi = Math.max(0.0001, finite(ns.weakenAnalyze(1, normalizeCores(cores)), one));
    const required = Math.max(0, Math.floor(finite(oneCoreThreads, 0))) * one;
    return required > 0 ? Math.max(1, Math.ceil(required / multi)) : 0;
}

export function homeCorePrepGrowThreads(ns, target, factor, cores) {
    const threads = Math.ceil(ns.growthAnalyze(target, Math.max(1, finite(factor, 1)), normalizeCores(cores)));
    return Number.isFinite(threads) && threads > 0 ? threads : 0;
}
