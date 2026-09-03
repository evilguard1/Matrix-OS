const H = "/matrix/workers/hack.js";
const G = "/matrix/workers/grow.js";
const W = "/matrix/workers/weaken.js";

export const PLANNER_NATIVE = "native";
export const PLANNER_FORMULAS = "formulas";
export const SNAPSHOT_PROBE_SECURITY_EPSILON = 0.01;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
}

function formulaFacts(ns, target) {
    const moneyMax = Math.max(0, ns.getServerMaxMoney(target));
    const minDifficulty = Math.max(1, Number(ns.getServerMinSecurityLevel(target)) || 1);
    return {
        hostname: target,
        moneyMax,
        minDifficulty,
        requiredHackingSkill: Math.max(1, Number(ns.getServerRequiredHackingLevel(target)) || 1),
        serverGrowth: Math.max(0, Number(ns.getServerGrowth(target)) || 0),
    };
}

/**
 * Build the minimum synthetic Server object the hacking formulas need.
 *
 * The object deliberately comes from formulas.mockServer() rather than
 * ns.getServer(): the latter costs 2 GB. The only extra paid accessor is
 * getServerGrowth() (0.1 GB); getPlayer() is captured once per scheduler loop.
 */
export function formulaServer(ns, facts, options = {}) {
    const server = ns.formulas.mockServer();
    const moneyAvailable = options.moneyAvailable ?? facts.moneyMax;
    const hackDifficulty = options.hackDifficulty ?? facts.minDifficulty;
    server.hostname = facts.hostname;
    server.hasAdminRights = true;
    server.moneyMax = facts.moneyMax;
    server.moneyAvailable = Math.max(0, Number(moneyAvailable) || 0);
    server.minDifficulty = facts.minDifficulty;
    server.hackDifficulty = Math.max(facts.minDifficulty, Number(hackDifficulty) || facts.minDifficulty);
    server.requiredHackingSkill = facts.requiredHackingSkill;
    server.serverGrowth = facts.serverGrowth;
    return server;
}

/** Select the planning capability without changing execution semantics. */
export function selectPlanningContext(ns) {
    let formulasAvailable = false;
    try { formulasAvailable = ns.fileExists("Formulas.exe", "home"); } catch {}
    if (!formulasAvailable) {
        return { kind: PLANNER_NATIVE, formulasAvailable: false, player: null, fallbackReason: null };
    }

    try {
        return {
            kind: PLANNER_FORMULAS,
            formulasAvailable: true,
            player: ns.getPlayer(),
            fallbackReason: null,
        };
    } catch {
        // getPlayer() should always be available, but a broken capability probe
        // must degrade to the already-validated native planner rather than kill
        // the hacking service.
        return {
            kind: PLANNER_NATIVE,
            formulasAvailable: true,
            player: null,
            fallbackReason: "get-player-failed",
        };
    }
}

/**
 * Predict the best clean-state HWGW shape with Formulas.exe.
 *
 * Security accounting intentionally stays on the native analysis calls. In
 * particular growthAnalyzeSecurity(gt) must remain uncapped: passing a target
 * argument reintroduced the old W2 under-weaken bug.
 */
export function formulaBatchShape(ns, target, cfg, context) {
    if (context?.kind !== PLANNER_FORMULAS || !context.player) return null;

    const facts = formulaFacts(ns, target);
    if (facts.moneyMax <= 0) return null;

    const hacking = ns.formulas.hacking;
    const clean = formulaServer(ns, facts);
    const player = context.player;
    const chance = clamp(hacking.hackChance(clean, player), 0.0001, 1);
    const hackPerThread = clamp(hacking.hackPercent(clean, player), 0, 0.90);
    if (!(hackPerThread > 0)) return null;

    const hTime = Math.max(1, Number(hacking.hackTime(clean, player)) || 1);
    const gTime = Math.max(1, Number(hacking.growTime(clean, player)) || 1);
    const wTime = Math.max(1, Number(hacking.weakenTime(clean, player)) || 1);
    const hRam = ns.getScriptRam(H, "home");
    const gRam = ns.getScriptRam(G, "home");
    const wRam = ns.getScriptRam(W, "home");
    const weakenPerThread = Math.max(0.0001, ns.weakenAnalyze(1));
    const minF = cfg.hacking?.minHackFraction ?? 0.05;
    const maxF = cfg.hacking?.maxHackFraction ?? 0.40;

    let best = null;
    for (let f = minF; f <= maxF + 1e-9; f += 0.025) {
        const ht = Math.max(1, Math.ceil(f / hackPerThread));
        const actualFraction = clamp(hackPerThread * ht, 0.001, 0.90);

        // W1 lands before G, so growth is planned from post-hack money at the
        // server's minimum security rather than from a live transient state.
        const postHack = formulaServer(ns, facts, {
            moneyAvailable: facts.moneyMax * (1 - actualFraction),
            hackDifficulty: facts.minDifficulty,
        });
        let gt = Math.ceil(hacking.growThreads(postHack, player, facts.moneyMax, 1));
        if (!Number.isFinite(gt) || gt < 1) continue;

        const hSec = ns.hackAnalyzeSecurity(ht, target);
        const gSec = ns.growthAnalyzeSecurity(gt);
        const wt1 = Math.max(1, Math.ceil(hSec / weakenPerThread));
        const wt2 = Math.max(1, Math.ceil(gSec / weakenPerThread));
        const ram = ht * hRam + gt * gRam + (wt1 + wt2) * wRam;
        const ramSeconds =
            ht * hRam * hTime / 1000 +
            gt * gRam * gTime / 1000 +
            (wt1 + wt2) * wRam * wTime / 1000;
        const expected = facts.moneyMax * actualFraction * chance;
        const metric = expected / Math.max(1, ramSeconds);

        const shape = {
            planner: PLANNER_FORMULAS,
            f: actualFraction,
            ht,
            gt,
            wt1,
            wt2,
            ram,
            expected,
            metric,
            chance,
            hackPerThread,
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

/** Money-mode target score for the predictive planner. */
export function formulaTargetScore(ns, target, cfg, context) {
    try {
        return formulaBatchShape(ns, target, cfg, context)?.metric ?? Number.NEGATIVE_INFINITY;
    } catch {
        return Number.NEGATIVE_INFINITY;
    }
}

/**
 * Re-evaluate a fixed Formula snapshot under the current player multipliers.
 * Live money is intentionally ignored. The near-min-security guard is retained
 * so an in-flight H/G/W intermediate state cannot trigger a false refresh.
 */
export function formulaProbePlanningSnapshot(ns, target, snapshot, context) {
    if (!snapshot?.shape || snapshot.planner !== PLANNER_FORMULAS) return null;
    if (context?.kind !== PLANNER_FORMULAS || !context.player) return null;

    const minSecurity = ns.getServerMinSecurityLevel(target);
    const securityExcess = Math.max(0, ns.getServerSecurityLevel(target) - minSecurity);
    if (securityExcess > SNAPSHOT_PROBE_SECURITY_EPSILON) return null;

    const facts = formulaFacts(ns, target);
    if (facts.moneyMax <= 0) return null;
    const hacking = ns.formulas.hacking;
    const clean = formulaServer(ns, facts);
    const currentHackPerThread = clamp(hacking.hackPercent(clean, context.player), 0, 1);
    const currentHackFraction = clamp(currentHackPerThread * snapshot.shape.ht, 0.001, 0.90);
    const postHack = formulaServer(ns, facts, {
        moneyAvailable: facts.moneyMax * (1 - currentHackFraction),
        hackDifficulty: facts.minDifficulty,
    });
    let currentGrowThreads = Math.ceil(
        hacking.growThreads(postHack, context.player, facts.moneyMax, 1),
    );
    if (!Number.isFinite(currentGrowThreads) || currentGrowThreads < 1) return null;

    return {
        observedAt: Date.now(),
        planner: PLANNER_FORMULAS,
        hackingLevel: Number(context.player?.skills?.hacking ?? ns.getHackingLevel()) || 0,
        securityExcess,
        currentHackPerThread,
        currentHackFraction,
        plannedHackFraction: snapshot.shape.f,
        currentGrowThreads,
        plannedGrowThreads: snapshot.shape.gt,
        growThreadShortfall: Math.max(0, currentGrowThreads - snapshot.shape.gt),
        requiresDrain: currentGrowThreads > snapshot.shape.gt,
    };
}
