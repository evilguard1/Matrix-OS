import { config, event, writeState, sleepUntil, clamp, getDirectives } from "/matrix/lib/common.js";
import { scanAll, workerHosts, totalFreeRam } from "/matrix/lib/network.js";

const H = "/matrix/workers/hack.js";
const G = "/matrix/workers/grow.js";
const W = "/matrix/workers/weaken.js";

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

function chooseTarget(ns, hosts, cfg, mode = "money") {
    const scorer = mode === "xp" ? xpScore : targetScore;
    const list = candidateTargets(ns, hosts, cfg)
        .map(h => ({ host: h, score: scorer(ns, h) }))
        .sort((a,b) => b.score - a.score);
    return list[0]?.host ?? "n00dles";
}

function freePool(ns, hosts, cfg) {
    return workerHosts(ns, hosts, cfg.hacking?.homeReserveGb ?? 24);
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
            (item.host === "home" ? (cfg.hacking?.homeReserveGb ?? 24) : 0));
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

async function waitPids(ns, pids) {
    while (pids.some(pid => ns.isRunning(pid))) await ns.sleep(40);
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
            { op:"H", script:H, threads:shape.ht, duration:shape.hTime, finish:base, args:[target] },
            { op:"W1",script:W, threads:shape.wt1,duration:shape.wTime,finish:base+gap,args:[target] },
            { op:"G", script:G, threads:shape.gt, duration:shape.gTime, finish:base+gap*2,args:[target] },
            { op:"W2",script:W, threads:shape.wt2,duration:shape.wTime,finish:base+gap*3,args:[target] },
        );
    }
    return events.sort((a,b) => (a.finish-a.duration) - (b.finish-b.duration));
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
        const mode = getDirectives(ns)?.directives?.hacking === "xp" ? "xp" : "money";
        const target = chooseTarget(ns, hosts, cfg, mode);
        if (await prep(ns, target, hosts, cfg)) continue;

        const shape = batchShape(ns, target, cfg);
        if (!shape) {
            await writeState(ns, "hacking", { status:"waiting", target, reason:"No viable batch shape" });
            await ns.sleep(2000);
            continue;
        }

        const free = totalFreeRam(ns, hosts, cfg.hacking?.homeReserveGb ?? 24);
        const maxBatches = cfg.hacking?.maxBatches ?? 24;
        const batches = Math.min(maxBatches, Math.floor(free / Math.max(1, shape.ram)));
        if (batches < 1) {
            await writeState(ns, "hacking", {
                status:"waiting", phase:"RAM-GATED", target,
                freeRam:free, requiredRam:shape.ram,
                reason:"Waiting for enough free RAM for one complete HWGW batch"
            });
            await ns.sleep(1500);
            continue;
        }
        const gap = cfg.hacking?.batchGapMs ?? 120;
        const events = makeBatchEvents(shape, target, batches, gap);
        const pids = [];
        let failedThreads = 0;

        await writeState(ns, "hacking", {
            status:"batching", phase:"HWGW", target,
            hackFraction: shape.f, batches,
            batchRam: shape.ram, expectedPerBatch: shape.expected,
            gapMs: gap, batchCounter
        });

        for (const e of events) {
            await sleepUntil(ns, e.finish - e.duration);
            const extra = Math.max(0, e.finish - Date.now() - e.duration);
            const r = await execDistributed(ns, e.script, e.threads, [target, extra], hosts, cfg);
            pids.push(...r.pids);
            failedThreads += r.remaining;
        }

        await waitPids(ns, pids);
        batchCounter += batches;
        if (failedThreads > 0) {
            await event(ns, "hacking", `Batch pressure: ${failedThreads} threads could not launch`, "warn");
            await ns.sleep(gap * 2);
        }
    }
}
