const H = "/matrix/workers/hack.js";
const G = "/matrix/workers/grow.js";
const W = "/matrix/workers/weaken.js";

export const PLANNER_NATIVE = "native";
export const PLANNER_FORMULAS = "formulas";
export const SNAPSHOT_PROBE_SECURITY_EPSILON = 0.01;
export const SHAPE_POLICY_EFFICIENCY = "efficiency";
export const SHAPE_POLICY_RAM_AWARE = "ram-aware";

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
}

function requestedFraction(value) {
    return Math.max(0, Number(Number(value).toFixed(6)) || 0);
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
 * The object deliberately comes from formulas.mockServer() rather than the
 * 2 GB getServer() call. The only extra paid accessor is getServerGrowth()
 * (0.1 GB); getPlayer() is captured once per scheduler loop.
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

function formulaEnvironment(ns, target, context) {
    if (context?.kind !== PLANNER_FORMULAS || !context.player) return null;
    const facts = formulaFacts(ns, target);
    if (facts.moneyMax <= 0) return null;

    const hacking = ns.formulas.hacking;
    const clean = formulaServer(ns, facts);
    const player = context.player;
    const chance = clamp(hacking.hackChance(clean, player), 0.0001, 1);
    const hackPerThread = clamp(hacking.hackPercent(clean, player), 0, 0.90);
    if (!(hackPerThread > 0)) return null;

    return {
        facts,
        hacking,
        clean,
        player,
        chance,
        hackPerThread,
        hTime: Math.max(1, Number(hacking.hackTime(clean, player)) || 1),
        gTime: Math.max(1, Number(hacking.growTime(clean, player)) || 1),
        wTime: Math.max(1, Number(hacking.weakenTime(clean, player)) || 1),
        hRam: ns.getScriptRam(H, "home"),
        gRam: ns.getScriptRam(G, "home"),
        wRam: ns.getScriptRam(W, "home"),
        weakenPerThread: Math.max(0.0001, ns.weakenAnalyze(1)),
    };
}

function formulaShapeFromEnvironment(ns, target, env, fraction, maxFraction) {
    if (!env) return null;
    const requested = requestedFraction(fraction);
    if (!(requested > 0)) return null;

    const {
        facts,
        hacking,
        player,
        chance,
        hackPerThread,
        hTime,
        gTime,
        wTime,
        hRam,
        gRam,
        wRam,
        weakenPerThread,
    } = env;

    const ht = Math.min(Math.max(1, Math.ceil(requested / hackPerThread)), Math.floor((maxFraction + 1e-12) / hackPerThread));
    if (ht < 1) return null; // Even one H thread would violate the configured cap.
    const actualFraction = clamp(hackPerThread * ht, 0.001, 0.90);

    // W1 lands before G, so growth is planned from post-hack money at the
    // server's minimum security rather than from a live transient state.
    const postHack = formulaServer(ns, facts, {
        moneyAvailable: facts.moneyMax * (1 - actualFraction),
        hackDifficulty: facts.minDifficulty,
    });
    let gt = Math.ceil(hacking.growThreads(postHack, player, facts.moneyMax, 1));
    if (!Number.isFinite(gt) || gt < 1) return null;

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

    return {
        planner: PLANNER_FORMULAS,
        requestedFraction: requested,
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
}

/**
 * Return every clean Formula shape in the configured fraction range.
 *
 * The frontier is intentionally explicit because the globally optimal shape is
 * not always the locally most RAM-efficient shape. Once every target is
 * slot-saturated, spare RAM can buy larger per-slot money extraction without
 * reducing the already-validated batch gap.
 */
export function formulaBatchFrontier(ns, target, cfg, context) {
    const env = formulaEnvironment(ns, target, context);
    if (!env) return [];

    const maxF = Math.min(0.90, Math.max(0, Number(cfg.hacking?.maxHackFraction ?? 0.40)));
    const minF = Math.min(maxF, Math.max(0.001, Number(cfg.hacking?.minHackFraction ?? 0.05) || 0.05));
    const out = [];
    for (let f = minF; f <= maxF + 1e-9; f += 0.025) {
        const shape = formulaShapeFromEnvironment(ns, target, env, f, maxF);
        if (shape) out.push(shape);
    }
    return out;
}

/** Build one exact requested-fraction Formula shape using a fresh player context. */
export function formulaBatchShapeAtFraction(ns, target, cfg, context, fraction) {
    const maxF = Math.min(0.90, Math.max(0, Number(cfg.hacking?.maxHackFraction ?? 0.40)));
    const minF = Math.min(maxF, Math.max(0.001, Number(cfg.hacking?.minHackFraction ?? 0.05) || 0.05));
    const requested = clamp(Number(fraction), minF, maxF);
    return formulaShapeFromEnvironment(ns, target, formulaEnvironment(ns, target, context), requested, maxF);
}

/** Predict the locally most RAM-efficient clean-state HWGW shape. */
export function formulaBatchShape(ns, target, cfg, context) {
    let best = null;
    for (const shape of formulaBatchFrontier(ns, target, cfg, context)) {
        if (!best || shape.metric > best.metric) best = shape;
    }
    return best;
}

function nextUsefulUpgrade(frontier, currentIndex, depth, slotRate) {
    const current = frontier[currentIndex];
    if (!current) return null;
    for (let index = currentIndex + 1; index < frontier.length; index += 1) {
        const shape = frontier[index];
        const incrementalRam = (shape.ram - current.ram) * depth;
        const incrementalMoneyPerSec = (shape.expected - current.expected) * slotRate;
        if (incrementalRam > 1e-9 && incrementalMoneyPerSec > 1e-9) {
            return {
                index,
                shape,
                incrementalRam,
                incrementalMoneyPerSec,
                marginal: incrementalMoneyPerSec / incrementalRam,
            };
        }
    }
    return null;
}

/**
 * Allocate spare steady-state HWGW RAM across larger Formula shapes.
 *
 * Safety rule: the existing efficiency planner is the baseline. Adaptive
 * upgrades only activate when EVERY baseline target fits inside the supplied
 * steady-state RAM budget. This preserves the validated small/medium-network
 * behavior and turns on slot-value optimization only when RAM is genuinely
 * abundant.
 *
 * `depthForShape` is supplied by the scheduler so this allocator cannot drift
 * from matrix/lib/batch.js pipelineDepth() semantics.
 */
export function formulaRamAwareShapePlan(ns, targets, cfg, context, options = {}) {
    const hosts = Array.isArray(targets) ? targets : [];
    const depthForShape = typeof options.depthForShape === "function"
        ? options.depthForShape
        : (() => 1);
    const gapMs = Math.max(1, Number(options.gapMs) || 120);
    const slotRate = 1000 / (gapMs * 4);
    const budgetRam = Math.max(0, Number(options.budgetRam) || 0);

    const entries = [];
    for (const target of hosts) {
        const frontier = formulaBatchFrontier(ns, target, cfg, context);
        if (!frontier.length) continue;

        let baselineIndex = 0;
        for (let i = 1; i < frontier.length; i += 1) {
            if (frontier[i].metric > frontier[baselineIndex].metric) baselineIndex = i;
        }
        const baselineShape = frontier[baselineIndex];
        const depth = Math.max(1, Math.floor(Number(depthForShape(baselineShape, target)) || 1));
        entries.push({
            target,
            frontier,
            baselineIndex,
            currentIndex: baselineIndex,
            depth,
            baselineShape,
            shape: baselineShape,
        });
    }

    const baselineRam = entries.reduce((sum, entry) => sum + entry.baselineShape.ram * entry.depth, 0);
    const baselineExpectedMoneyPerSec = entries.reduce(
        (sum, entry) => sum + entry.baselineShape.expected * slotRate,
        0,
    );

    const adaptive = context?.kind === PLANNER_FORMULAS &&
        cfg.hacking?.ramAwareBatchShapes !== false &&
        entries.length > 0 &&
        baselineRam <= budgetRam + 1e-9;

    let plannedRam = baselineRam;
    let plannedExpectedMoneyPerSec = baselineExpectedMoneyPerSec;
    let upgradeSteps = 0;

    if (adaptive) {
        while (true) {
            let best = null;
            for (let rank = 0; rank < entries.length; rank += 1) {
                const entry = entries[rank];
                const upgrade = nextUsefulUpgrade(
                    entry.frontier,
                    entry.currentIndex,
                    entry.depth,
                    slotRate,
                );
                if (!upgrade) continue;
                if (plannedRam + upgrade.incrementalRam > budgetRam + 1e-9) continue;

                const candidate = { entry, rank, ...upgrade };
                if (!best ||
                    candidate.marginal > best.marginal + 1e-18 ||
                    (Math.abs(candidate.marginal - best.marginal) <= 1e-18 &&
                        candidate.incrementalMoneyPerSec > best.incrementalMoneyPerSec + 1e-9) ||
                    (Math.abs(candidate.marginal - best.marginal) <= 1e-18 &&
                        Math.abs(candidate.incrementalMoneyPerSec - best.incrementalMoneyPerSec) <= 1e-9 &&
                        candidate.rank < best.rank)) {
                    best = candidate;
                }
            }

            if (!best) break;
            best.entry.currentIndex = best.index;
            best.entry.shape = best.shape;
            plannedRam += best.incrementalRam;
            plannedExpectedMoneyPerSec += best.incrementalMoneyPerSec;
            upgradeSteps += 1;
        }
    }

    const byTarget = new Map();
    const serialEntries = entries.map(entry => {
        const baselineFullDepthRam = entry.baselineShape.ram * entry.depth;
        const fullDepthRam = entry.shape.ram * entry.depth;
        const baselineExpectedPerSec = entry.baselineShape.expected * slotRate;
        const expectedPerSec = entry.shape.expected * slotRate;
        const result = {
            target: entry.target,
            depth: entry.depth,
            baselineRequestedFraction: entry.baselineShape.requestedFraction,
            requestedFraction: entry.shape.requestedFraction,
            baselineActualFraction: entry.baselineShape.f,
            actualFraction: entry.shape.f,
            baselineFullDepthRam,
            fullDepthRam,
            baselineExpectedPerSec,
            expectedPerSec,
            gainPerSec: expectedPerSec - baselineExpectedPerSec,
            addedRam: fullDepthRam - baselineFullDepthRam,
        };
        byTarget.set(entry.target, result);
        return result;
    });

    return {
        policy: adaptive ? SHAPE_POLICY_RAM_AWARE : SHAPE_POLICY_EFFICIENCY,
        reason: adaptive ? "baseline-fits-budget" :
            entries.length === 0 ? "no-formula-shapes" :
            cfg.hacking?.ramAwareBatchShapes === false ? "disabled" :
            baselineRam > budgetRam ? "baseline-exceeds-budget" : "planner-unavailable",
        budgetRam,
        gapMs,
        slotRate,
        baselineRam,
        plannedRam,
        remainingRam: Math.max(0, budgetRam - plannedRam),
        baselineExpectedMoneyPerSec,
        plannedExpectedMoneyPerSec,
        improvementFraction: baselineExpectedMoneyPerSec > 0
            ? plannedExpectedMoneyPerSec / baselineExpectedMoneyPerSec - 1
            : 0,
        upgradeSteps,
        upgradedTargets: serialEntries.filter(entry =>
            entry.requestedFraction > entry.baselineRequestedFraction + 1e-9
        ).length,
        entries: serialEntries,
        byTarget,
    };
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
