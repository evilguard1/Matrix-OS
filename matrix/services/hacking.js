import { config, event, writeState, sleepUntil, clamp, getDirectives } from "/matrix/lib/common.js";
import { scanAll, workerHosts, totalFreeRam } from "/matrix/lib/network.js";
import { allocateWave, mergeWave, allocatePrep } from "/matrix/lib/batch.js";
import { homeReserveFor } from "/matrix/lib/capabilities.js";

const H = "/matrix/workers/hack.js";
const G = "/matrix/workers/grow.js";
const W = "/matrix/workers/weaken.js";
const SHARE = "/matrix/workers/share.js";

// Fraction of network RAM devoted to ns.share() when the coordinator asks for
// reputation instead of pure income.
const SHARE_FRACTION = 0.25;

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

// XP-per-second is dominated by required level and low hack time, not money, so
// score differently when the coordinator asks for an experience rush.
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

function chooseTarget(ns, hosts, cfg, mode = "money") {
    return rankTargets(ns, hosts, cfg, mode)[0] ?? "n00dles";
}

function freePool(ns, hosts, cfg) {
    return workerHosts(ns, hosts, homeReserveFor(ns.getServerMaxRam('home'), cfg));
}

async function execDistributed(ns, script, threads, args, hosts, cfg) {
    let remaining = Math.max(0, Math.floor(threads));
    const ram = ns.getScriptRam(script, "home");
    const pids = [];
    for (const item of freePool(ns, hosts, cfg)) {
        if (remaining <= 0) break;
        if (item.host !== "home" && !ns.fileExists(script, item.host)) {
            try { await ns.scp(script, item.host, "home"); } catch {}
        }
        const nowFree = Math.max(0, ns.getServerMaxRam(item.host) - ns.getServerUsedRam(item.host) -
            (item.host === "home" ? (homeReserveFor(ns.getServerMaxRam('home'), cfg)) : 0));
        const fit = Math.floor(nowFree / ram);
        if (fit <= 0) continue;
        const use = Math.min(fit, remaining);
        const pid = ns.exec(script, item.host, use, ...args);
        if (pid) {
            pids.push(pid);
            remaining -= use;
        }
    }
    return { launched: threads - remaining, remaining, pids };
}

// ns.share() multiplies faction reputation gain while working. Only worth RAM
// when the coordinator says reputation is the bottleneck, so it is directive-led.
async function applyShare(ns, hosts, cfg, wanted) {
    const ram = ns.getScriptRam(SHARE, "home");
    for (const item of freePool(ns, hosts, cfg)) {
        if (!wanted) { try { ns.scriptKill(SHARE, item.host); } catch {} continue; }
        if (item.host !== "home" && !ns.fileExists(SHARE, item.host)) {
            try { await ns.scp(SHARE, item.host, "home"); } catch {}
        }
        const threads = Math.floor((ns.getServerMaxRam(item.host) * SHARE_FRACTION) / ram);
        if (threads > 0) { try { ns.exec(SHARE, item.host, { threads, preventDuplicates: true }); } catch {} }
    }
}

async function waitPids(ns, pids) {
    while (pids.some(pid => ns.isRunning(pid))) await ns.sleep(40);
}

// HWGW arithmetic assumes minimum security and a full balance. A target that is
// not there yet desyncs, so it is left out of the wave until prep brings it in.
function isPrepped(ns, host, cfg) {
    const margin = cfg.hacking?.prepSecurityMargin ?? 0.5;
    const moneyFrac = cfg.hacking?.prepMoneyFraction ?? 0.985;
    const max = ns.getServerMaxMoney(host);
    if (max <= 0) return false;
    if (ns.getServerSecurityLevel(host) > ns.getServerMinSecurityLevel(host) + margin) return false;
    return ns.getServerMoneyAvailable(host) >= max * moneyFrac;
}

async function prep(ns, target, hosts, cfg) {
    const margin = cfg.hacking?.prepSecurityMargin ?? 0.5;
    const moneyFrac = cfg.hacking?.prepMoneyFraction ?? 0.985;
    const minSec = ns.getServerMinSecurityLevel(target);
    const sec = ns.getServerSecurityLevel(target);
    const maxMoney = ns.getServerMaxMoney(target);
    const money = ns.getServerMoneyAvailable(target);

    if (sec > minSec + margin) {
        const need = Math.ceil((sec - minSec) / Math.max(0.0001, ns.weakenAnalyze(1)));
        const res = await execDistributed(ns, W, need, [target, 0], hosts, cfg);
        await writeState(ns, "hacking", { status: "preparing", phase: "weaken", target, threads: res.launched });
        await waitPids(ns, res.pids);
        return true;
    }

    if (maxMoney > 0 && money < maxMoney * moneyFrac) {
        const factor = Math.max(1.01, maxMoney / Math.max(1, money));
        let growThreads = Math.ceil(ns.growthAnalyze(target, factor));
        if (!Number.isFinite(growThreads) || growThreads < 1) growThreads = 1;

        const growSec = ns.growthAnalyzeSecurity(growThreads, target, 1);
        const weakThreads = Math.ceil(growSec / Math.max(0.0001, ns.weakenAnalyze(1)));

        const gap = cfg.hacking?.batchGapMs ?? 120;
        const gTime = ns.getGrowTime(target);
        const wTime = ns.getWeakenTime(target);
        const finishGrow = Date.now() + Math.max(gTime, wTime) + 250;
        const finishWeak = finishGrow + gap;

        const events = [
            { script: G, threads: growThreads, duration: gTime, finish: finishGrow, args: [target] },
            { script: W, threads: weakThreads, duration: wTime, finish: finishWeak, args: [target] },
        ].sort((a,b) => (a.finish-a.duration) - (b.finish-b.duration));

        const pids = [];
        for (const e of events) {
            await sleepUntil(ns, e.finish - e.duration);
            const extra = Math.max(0, e.finish - Date.now() - e.duration);
            const r = await execDistributed(ns, e.script, e.threads, [target, extra], hosts, cfg);
            pids.push(...r.pids);
        }
        await writeState(ns, "hacking", { status: "preparing", phase: "grow", target, threads: growThreads });
        await waitPids(ns, pids);
        return true;
    }
    return false;
}

function batchShape(ns, target, cfg) {
    const max = ns.getServerMaxMoney(target);
    const chance = clamp(ns.hackAnalyzeChance(target), 0.0001, 1);
    const minF = cfg.hacking?.minHackFraction ?? 0.05;
    const maxF = cfg.hacking?.maxHackFraction ?? 0.40;
    const hRam = ns.getScriptRam(H, "home");
    const gRam = ns.getScriptRam(G, "home");
    const wRam = ns.getScriptRam(W, "home");
    const hTime = ns.getHackTime(target);
    const gTime = ns.getGrowTime(target);
    const wTime = ns.getWeakenTime(target);

    let best = null;
    for (let f = minF; f <= maxF + 1e-9; f += 0.025) {
        const hackAmount = max * f;
        let ht = Math.ceil(ns.hackAnalyzeThreads(target, hackAmount));
        if (!Number.isFinite(ht) || ht < 1) continue;
        const actualFraction = clamp(ns.hackAnalyze(target) * ht, 0.001, 0.90);
        const gt = Math.max(1, Math.ceil(ns.growthAnalyze(target, 1 / (1 - actualFraction))));
        const hSec = ns.hackAnalyzeSecurity(ht, target);
        const gSec = ns.growthAnalyzeSecurity(gt, target, 1);
        const wt1 = Math.max(1, Math.ceil(hSec / Math.max(0.0001, ns.weakenAnalyze(1))));
        const wt2 = Math.max(1, Math.ceil(gSec / Math.max(0.0001, ns.weakenAnalyze(1))));
        const ram = ht*hRam + gt*gRam + (wt1+wt2)*wRam;
        const ramSeconds = ht*hRam*hTime/1000 + gt*gRam*gTime/1000 + (wt1+wt2)*wRam*wTime/1000;
        const expected = max * actualFraction * chance;
        const metric = expected / Math.max(1, ramSeconds);
        const shape = { f: actualFraction, ht, gt, wt1, wt2, ram, expected, metric, hTime, gTime, wTime };
        if (!best || shape.metric > best.metric) best = shape;
    }
    return best;
}

function makeBatchEvents(shape, target, batches, gap) {
    const now = Date.now();
    const longest = Math.max(shape.hTime, shape.gTime, shape.wTime);
    const first = now + longest + 300;
    const stride = gap * 4;
    const events = [];
    for (let i = 0; i < batches; i++) {
        const base = first + i * stride;
        events.push(
            { op:"H", target, script:H, threads:shape.ht, duration:shape.hTime, finish:base, args:[target] },
            { op:"W1",target, script:W, threads:shape.wt1,duration:shape.wTime,finish:base+gap,args:[target] },
            { op:"G", target, script:G, threads:shape.gt, duration:shape.gTime, finish:base+gap*2,args:[target] },
            { op:"W2",target, script:W, threads:shape.wt2,duration:shape.wTime,finish:base+gap*3,args:[target] },
        );
    }
    return events.sort((a,b) => (a.finish-a.duration) - (b.finish-b.duration));
}

// Everything the wave does not use goes into making more servers batchable.
//
// Hosts are only RAM - a weaken thread helps its target wherever it runs - so
// the limit is targets, not machines. Extra weakens against a server already at
// minimum security do nothing, but the ninety-odd servers that are NOT prepped
// each want threads, and every one finished joins the wave and starts paying.
// Grow and weaken both award hacking experience while they run, so this is
// earning even before the money arrives.
//
// Fire-and-forget: these workers are one-shot, so nothing here waits on them.
async function backgroundPrep(ns, ranked, target, freeRam, hosts, cfg) {
    if (freeRam < 2) return null;
    const wRam = ns.getScriptRam(W, "home");
    const gRam = ns.getScriptRam(G, "home");
    const margin = cfg.hacking?.prepSecurityMargin ?? 0.5;
    const moneyFrac = cfg.hacking?.prepMoneyFraction ?? 0.985;

    const needs = [];
    for (const host of ranked) {
        if (host === target) continue;
        if (needs.length >= (cfg.hacking?.maxPrepTargets ?? 8)) break;
        try {
            const max = ns.getServerMaxMoney(host);
            if (max <= 0) continue;
            const security = ns.getServerSecurityLevel(host);
            const minSecurity = ns.getServerMinSecurityLevel(host);
            // Security first: it gates how effective the grow that follows is.
            if (security > minSecurity + margin) {
                const per = Math.max(0.0001, ns.weakenAnalyze(1));
                const threads = Math.max(1, Math.ceil((security - minSecurity) / per));
                needs.push({ host, op: "weaken", threads, ram: wRam });
                continue;
            }
            const money = ns.getServerMoneyAvailable(host);
            if (money < max * moneyFrac) {
                const factor = Math.max(1.01, max / Math.max(1, money));
                const threads = Math.max(1, Math.ceil(ns.growthAnalyze(host, factor)));
                needs.push({ host, op: "grow", threads, ram: gRam });
            }
        } catch {}
    }
    if (!needs.length) return null;

    const prep = allocatePrep(needs, {
        freeRam,
        maxTargets: cfg.hacking?.maxPrepTargets ?? 8,
    });
    for (const entry of prep.plan) {
        const script = entry.op === "weaken" ? W : G;
        try { await execDistributed(ns, script, entry.threads, [entry.host, 0], hosts, cfg); } catch {}
    }
    return { targets: prep.plan.length, threads: prep.plan.reduce((n, e) => n + e.threads, 0), ram: prep.used };
}

export async function main(ns) {
    ns.disableLog("ALL");
    let batchCounter = 0;
    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled === false || cfg.automation?.hacking === false) {
            await writeState(ns, "hacking", { status:"paused" });
            await ns.sleep(2000);
            continue;
        }

        const { hosts } = scanAll(ns);
        const directive = getDirectives(ns)?.directives?.hacking;
        await applyShare(ns, hosts, cfg, directive === "share");
        const mode = directive === "xp" ? "xp" : "money";
        const target = chooseTarget(ns, hosts, cfg, mode);
        if (await prep(ns, target, hosts, cfg)) continue;

        // One target cannot absorb a large network. Its batch shape is a fixed
        // size and its schedule allows only so many concurrent batches, so past
        // that point every remaining gigabyte simply idles - which is how a
        // 95-server, 800 TB network ran at 1.3% utilisation. Build the wave
        // across as many targets as the RAM supports instead.
        const ranked = rankTargets(ns, hosts, cfg, mode);
        const shaped = [];
        for (const host of ranked.slice(0, cfg.hacking?.maxTargets ?? 12)) {
            // The primary was prepped above. A secondary that is not at minimum
            // security and full money would desync - its grow cannot restore
            // what its hack takes - so it waits rather than wasting threads.
            if (host !== target && !isPrepped(ns, host, cfg)) continue;
            const built = batchShape(ns, host, cfg);
            if (built) shaped.push({ host, shape: built });
        }
        if (!shaped.length) {
            await writeState(ns, "hacking", { status:"waiting", target, reason:"No viable batch shape" });
            await ns.sleep(2000);
            continue;
        }
        const shape = shaped[0].shape;

        const free = totalFreeRam(ns, hosts, homeReserveFor(ns.getServerMaxRam('home'), cfg));
        const gap = cfg.hacking?.batchGapMs ?? 120;
        const wave = allocateWave(shaped, {
            freeRam: free,
            gapMs: gap,
            // maxBatches is now an optional ceiling, not the working limit: the
            // real cap is the schedule, which allows far more than the old 24.
            configuredMax: cfg.hacking?.maxBatches,
            maxTargets: cfg.hacking?.maxTargets ?? 12,
            reserveFraction: cfg.hacking?.waveReserveFraction ?? 0.05,
        });
        const batches = wave.plan.reduce((sum, entry) => sum + entry.batches, 0);
        if (batches < 1) {
            await writeState(ns, "hacking", {
                status:"waiting", phase:"RAM-GATED", target,
                freeRam:free, requiredRam:shape.ram,
                reason:"Waiting for enough free RAM for one complete HWGW batch"
            });
            await ns.sleep(1500);
            continue;
        }
        const events = mergeWave(wave.plan, (host, built, count) => makeBatchEvents(built, host, count, gap));
        const pids = [];
        let failedThreads = 0;

        await writeState(ns, "hacking", {
            status:"batching", phase:"HWGW", target,
            hackFraction: shape.f, batches,
            targets: wave.plan.map(entry => ({ host: entry.host, batches: entry.batches, ram: entry.ram })),
            batchRam: shape.ram, expectedPerBatch: shape.expected,
            waveRam: wave.used, freeRam: free,
            utilisation: free > 0 ? wave.used / free : 0,
            gapMs: gap, batchCounter
        });

        for (const e of events) {
            await sleepUntil(ns, e.finish - e.duration);
            const extra = Math.max(0, e.finish - Date.now() - e.duration);
            const r = await execDistributed(ns, e.script, e.threads, [e.target ?? target, extra], hosts, cfg);
            pids.push(...r.pids);
            failedThreads += r.remaining;
        }
        // Convert the RAM this wave did not claim into prep for the rest of
        // the network, so it earns experience now and money shortly after.
        const prepped = await backgroundPrep(ns, ranked, target, wave.remaining + wave.reserved * 0.5, hosts, cfg);
        if (prepped) {
            await writeState(ns, "hacking", {
                status:"batching", phase:"HWGW", target,
                hackFraction: shape.f, batches,
                targets: wave.plan.map(entry => ({ host: entry.host, batches: entry.batches, ram: entry.ram })),
                batchRam: shape.ram, expectedPerBatch: shape.expected,
                waveRam: wave.used, freeRam: free,
                utilisation: free > 0 ? (wave.used + prepped.ram) / free : 0,
                prep: prepped,
                gapMs: gap, batchCounter
            });
        }

        await waitPids(ns, pids);
        batchCounter += batches;
        if (failedThreads > 0) {
            await event(ns, "hacking", `Batch pressure: ${failedThreads} threads could not launch`, "warn");
            await ns.sleep(gap * 2);
        }
    }
}
