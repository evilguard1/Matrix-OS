import { config, writeState, writeJson, readJson, STATE_DIR, formatMoney } from "/matrix/lib/common.js";
import { homeRamUpgradeCost as homeRamCost } from "/matrix/lib/capabilities.js";

const COORDINATOR_STATE = `${STATE_DIR}/coordinator.txt`;
const DIRECTIVES_STATE = `${STATE_DIR}/directives.txt`;
const WORLD_DAEMON = "w0r1d_d43m0n";
const RED_PILL = "The Red Pill";
const TOR_COST = 200_000;
const DAEDALUS_CASH = 100_000_000_000;
const CORP_CASH = 150_000_000_000;

export function formatEta(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "CALCULATING...";
    if (seconds === 0) return "READY";
    if (seconds < 60) return `~${Math.ceil(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    if (mins < 60) return `~${mins}m ${secs}s`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `~${hrs}h ${remMins}m`;
}

export function evaluateObjective(data) {
    const {
        cash = 0,
        cashRate = 0,
        hackingLevel = 1,
        karma = 0,
        homeRam = 8,
        homeRamUpgradeCost = Infinity,
        hasTor = false,
        missingPrograms = [],
        programCosts = 0,
        resetInfo = {},
        factions = [],
        queuedAugs = 0,
        targetAugPrice = 0,
        targetAugName = "",
        targetAugFaction = "",
        stockPortfolioValue = 0,
        worldDaemonRooted = false,
        worldDaemonReqLevel = 3000,
        hasGang = false,
        hasCorp = false,
        hasRedPill = false,
        redPillRep = 0,
        redPillReqRep = 2_500_000,
    } = data;

    const totalAssets = cash + stockPortfolioValue;
    const sf2 = (resetInfo.currentNode === 2) || ((resetInfo.ownedSF?.get?.(2) ?? 0) > 0);
    const sf3 = (resetInfo.currentNode === 3) || ((resetInfo.ownedSF?.get?.(3) ?? 0) > 0);

    const calcEta = (reqCash) => {
        if (cash >= reqCash) return "READY";
        if (cashRate > 0) return formatEta((reqCash - cash) / cashRate);
        return "CALCULATING...";
    };

    // 1. World Daemon / BitNode completion
    if (worldDaemonRooted && hackingLevel >= worldDaemonReqLevel) {
        return {
            id: "W0R1D_D43M0N",
            title: "Destroy World Daemon",
            reason: `Hacking level ${hackingLevel}/${worldDaemonReqLevel} reached on ${WORLD_DAEMON}`,
            liquidateStocks: true,
            budgets: { augmentationReserve: 0, milestoneReserve: 0, discretionaryFraction: 0 },
            milestone: { name: "BitNode Exit", current: hackingLevel, required: worldDaemonReqLevel, pct: 100 },
            nextStep: "Destroy World Daemon to finish BitNode",
            etaStr: "READY",
        };
    }

    // 2. Install Augmentations if queued count or target is ready
    if (queuedAugs >= 10 || (queuedAugs >= 5 && targetAugPrice > 0 && cash < targetAugPrice)) {
        return {
            id: "INSTALL_AUGMENTATIONS",
            title: "Install Augmentations",
            reason: `${queuedAugs} augmentations queued for installation`,
            liquidateStocks: true,
            budgets: { augmentationReserve: targetAugPrice, milestoneReserve: 0, discretionaryFraction: 0.05 },
            milestone: { name: "Augmentation Reset", current: queuedAugs, required: 5, pct: Math.min(100, (queuedAugs / 5) * 100) },
            nextStep: `Install ${queuedAugs} queued augmentations and restart`,
            etaStr: "READY",
        };
    }

    // 3. Acquire Red Pill / Daedalus
    if (factions.includes("Daedalus") && !hasRedPill) {
        if (redPillRep >= redPillReqRep) {
            const redPillCost = 1_500_000_000;
            const canAfford = totalAssets >= redPillCost;
            return {
                id: "THE_RED_PILL",
                title: "Acquire The Red Pill",
                reason: "Reputation requirement met for The Red Pill from Daedalus",
                liquidateStocks: canAfford && cash < redPillCost,
                budgets: { augmentationReserve: redPillCost, milestoneReserve: 0, discretionaryFraction: 0.05 },
                milestone: { name: "Red Pill Purchase", current: totalAssets, required: redPillCost, pct: Math.min(100, (totalAssets / redPillCost) * 100) },
                nextStep: `Accumulating ${formatMoney(redPillCost)} for The Red Pill`,
                etaStr: calcEta(redPillCost),
            };
        }
    }

    // 4. Daedalus unlock preparation (requires $100B cash & 30 Augmentations or 2500 Skill)
    if (!factions.includes("Daedalus") && !hasRedPill && (hackingLevel >= 1500 || totalAssets >= 50_000_000_000)) {
        const pct = Math.min(100, (totalAssets / DAEDALUS_CASH) * 100);
        const liquidate = totalAssets >= DAEDALUS_CASH && cash < DAEDALUS_CASH;
        return {
            id: "RESERVE_MILESTONE",
            title: "Daedalus Requirement ($100B)",
            reason: "Accumulating capital for Daedalus faction invitation",
            liquidateStocks: liquidate,
            budgets: { augmentationReserve: 0, milestoneReserve: DAEDALUS_CASH, discretionaryFraction: 0.10 },
            milestone: { name: "Daedalus Cash", current: totalAssets, required: DAEDALUS_CASH, pct },
            nextStep: `Accumulating ${formatMoney(DAEDALUS_CASH)} for Daedalus invite`,
            etaStr: calcEta(DAEDALUS_CASH),
        };
    }

    // 5. High-priority augmentation purchase funding
    if (targetAugPrice > 0) {
        const canAffordWithStocks = totalAssets >= targetAugPrice;
        const liquidate = canAffordWithStocks && cash < targetAugPrice;
        return {
            id: liquidate ? "LIQUIDATE_STOCKS" : "FACTION_REP",
            title: `Augmentation: ${targetAugName || "Target"}`,
            reason: `Funding ${targetAugName || "augmentation"} from ${targetAugFaction || "faction"}`,
            liquidateStocks: liquidate,
            budgets: { augmentationReserve: targetAugPrice, milestoneReserve: 0, discretionaryFraction: 0.15 },
            milestone: { name: targetAugName || "Augmentation", current: cash, required: targetAugPrice, pct: Math.min(100, (cash / targetAugPrice) * 100) },
            nextStep: `Funding ${targetAugName || "augmentation"} (${formatMoney(targetAugPrice)})`,
            etaStr: calcEta(targetAugPrice),
        };
    }

    // 6. Gang Karma rush (SF2 unlocked but no gang yet)
    if (sf2 && !hasGang && karma > -54) {
        return {
            id: "GANG_KARMA",
            title: "Karma Rush for Gang",
            reason: `Karma is ${karma.toFixed(1)} / -54.0 required to unlock Gang`,
            liquidateStocks: false,
            budgets: { augmentationReserve: 0, milestoneReserve: 0, discretionaryFraction: 0.20 },
            milestone: { name: "Gang Karma", current: Math.abs(karma), required: 54, pct: Math.min(100, (Math.abs(karma) / 54) * 100) },
            nextStep: `Accumulating Karma (${karma.toFixed(1)} / -54.0 for Gang)`,
            etaStr: "IN PROGRESS",
        };
    }

    // 7. Port programs acquisition
    if (!hasTor && cash >= TOR_COST * 0.5) {
        return {
            id: "BUY_PROGRAMS",
            title: "Purchase TOR Router",
            reason: "Buying TOR Router to unlock Darkweb port-opening programs",
            liquidateStocks: false,
            budgets: { augmentationReserve: 0, milestoneReserve: TOR_COST, discretionaryFraction: 0.10 },
            milestone: { name: "TOR Router", current: cash, required: TOR_COST, pct: Math.min(100, (cash / TOR_COST) * 100) },
            nextStep: `Reaching ${formatMoney(TOR_COST)} for TOR Router`,
            etaStr: calcEta(TOR_COST),
        };
    }
    if (missingPrograms.length > 0 && programCosts > 0) {
        return {
            id: "BUY_PROGRAMS",
            title: `Buy Port Programs (${missingPrograms.length} left)`,
            reason: `Acquiring Darkweb programs: ${missingPrograms.join(", ")}`,
            liquidateStocks: false,
            budgets: { augmentationReserve: 0, milestoneReserve: programCosts, discretionaryFraction: 0.15 },
            milestone: { name: "Port Programs", current: cash, required: programCosts, pct: Math.min(100, (cash / programCosts) * 100) },
            nextStep: `Buying ${missingPrograms[0]} (${formatMoney(programCosts)})`,
            etaStr: calcEta(programCosts),
        };
    }

    // 8. Corporation Bootstrap Reserve ($150B if SF3 not active)
    if (!sf3 && !hasCorp && totalAssets >= 50_000_000_000 && totalAssets < CORP_CASH * 1.2) {
        const pct = Math.min(100, (totalAssets / CORP_CASH) * 100);
        return {
            id: "RESERVE_MILESTONE",
            title: "Corporation Bootstrap ($150B)",
            reason: "Saving capital to create self-funded Corporation",
            liquidateStocks: totalAssets >= CORP_CASH && cash < CORP_CASH,
            budgets: { augmentationReserve: 0, milestoneReserve: CORP_CASH, discretionaryFraction: 0.10 },
            milestone: { name: "Corp Capital", current: totalAssets, required: CORP_CASH, pct },
            nextStep: `Accumulating ${formatMoney(CORP_CASH)} for Corporation bootstrap`,
            etaStr: calcEta(CORP_CASH),
        };
    }

    // 9. Home RAM expansion
    // No upper RAM cap: home is a worker host, so every doubling roughly doubles
    // the home half of the batcher. The old `homeRam < 64` cut-off treated home
    // RAM as a staging requirement, which left it unreported forever afterwards.
    // The half-price gate still keeps this from hijacking the goal display while
    // the next upgrade is out of reach, and it sits below augmentations, the Red
    // Pill, Daedalus, gang karma, TOR and programs in this list.
    if (Number.isFinite(homeRamUpgradeCost) && homeRamUpgradeCost > 0 && cash >= homeRamUpgradeCost * 0.5) {
        return {
            id: "EXPAND_RAM",
            title: `Upgrade Home RAM (${homeRam * 2}GB)`,
            reason: `Expanding Home RAM from ${homeRam}GB to ${homeRam * 2}GB`,
            liquidateStocks: false,
            budgets: { augmentationReserve: 0, milestoneReserve: homeRamUpgradeCost, discretionaryFraction: 0.15 },
            milestone: { name: "Home RAM Upgrade", current: cash, required: homeRamUpgradeCost, pct: Math.min(100, (cash / homeRamUpgradeCost) * 100) },
            nextStep: `Reaching ${formatMoney(homeRamUpgradeCost)} for ${homeRam * 2}GB Home RAM`,
            etaStr: calcEta(homeRamUpgradeCost),
        };
    }

    // Default: Bootstrap / Growth Hacking
    const reqCash = homeRam < 16 ? 1_000_000 : 500_000;
    const reqLabel = homeRam < 16 ? "16 GB Home RAM upgrade" : "network growth target";
    return {
        id: "BOOTSTRAP_INCOME",
        title: "Network Expansion & Hacking Income",
        reason: `Building cash reserve and hacking skill (lvl ${hackingLevel})`,
        liquidateStocks: false,
        budgets: { augmentationReserve: 0, milestoneReserve: 0, discretionaryFraction: 0.25 },
        milestone: { name: "Capital Target", current: cash, required: reqCash, pct: Math.min(100, (cash / reqCash) * 100) },
        nextStep: `Reaching ${formatMoney(reqCash)} for ${reqLabel}`,
        etaStr: calcEta(reqCash),
    };
}

// Translate the single global objective into a per-manager directive + budget
// protocol that independent services consume so they stop competing for cash,
// RAM, and player actions. This is a PURE function: identical input -> identical
// output, and every branch is covered by tests in tests/validate.mjs.
//
// Consumed today (see docs/CAPABILITY-MATRIX.md for status):
//   directives.hacking      hacking.js / early.js  -> target selection bias
//   directives.sleeves      sleeves.js             -> sleeve task assignment
//   directives.gang         gang.js                -> task scoring mode
//   directives.singularity  singularity.js         -> spend / faction-work focus
//   directives.stock        stock.js               -> trade / hold / liquidate
//   budgets.hacknet|cloud|stock   *.js via managerBudget()  -> discretionary spend
//   budgets.sleeveAugs      sleeves.js             -> sleeve augmentation spend
// Published for future consumers: directives.bladeburner, budgets.corporation,
// budgets.homeRam.
export function planDirectives(data) {
    const objective = data.objective ?? evaluateObjective(data);
    const {
        karma = 0,
        hasGang = false,
        resetInfo = {},
        hasTor = false,
        homeRam = 8,
        hackingLevel = 1,
        targetAugFaction = "",
    } = data;

    const id = objective.id;
    const liquidate = Boolean(objective.liquidateStocks);

    let phase;
    if (id === "W0R1D_D43M0N" || id === "THE_RED_PILL") phase = "ENDGAME";
    else if (id === "INSTALL_AUGMENTATIONS") phase = "AUG_RESET";
    else if (id === "RESERVE_MILESTONE") phase = "MILESTONE";
    else if (id === "GANG_KARMA") phase = "KARMA_GANG";
    else if (id === "FACTION_REP" || id === "LIQUIDATE_STOCKS") phase = "FACTION_REP";
    else if (id === "BUY_PROGRAMS" || (id === "BOOTSTRAP_INCOME" && homeRam < 32)) phase = "BOOTSTRAP";
    else phase = "HACK_ECON";

    // Reserve-heavy phases: stop feeding the infrastructure spenders so cash
    // converges on the augmentation / milestone reserve.
    const lean = phase === "AUG_RESET" || phase === "MILESTONE" || phase === "ENDGAME";
    const repFaction = targetAugFaction || "";

    const budgets = {
        hacknet:     lean ? 0 : 0.04,
        cloud:       lean ? 0 : 0.12,
        stock:       (phase === "AUG_RESET" || phase === "ENDGAME") ? 0 : 0.25,
        corporation: lean ? 0 : 0.10,
        sleeveAugs:  lean ? 0.001 : 0.005,
        homeRam:     phase === "BOOTSTRAP" ? 0.50 : (lean ? 0 : 0.15),
    };

    const directives = {
        hacking:
            phase === "BOOTSTRAP" && hackingLevel < 300 ? "xp"
            // Reputation, not cash, is the bottleneck here - spend RAM on
            // ns.share() instead of squeezing out marginal income.
            : (phase === "FACTION_REP" || phase === "ENDGAME") && repFaction ? "share"
            : "money",
        sleeves:
            phase === "KARMA_GANG" ? "karma"
            : (phase === "FACTION_REP" || phase === "ENDGAME") && repFaction ? `rep:${repFaction}`
            : "money",
        gang:
            !hasGang ? "idle"
            : phase === "KARMA_GANG" ? "respect"
            : (liquidate || lean) ? "money"
            : "balanced",
        singularity:
            phase === "BOOTSTRAP" && !hasTor ? "programs"
            : phase === "AUG_RESET" ? "augs"
            : "rep",
        bladeburner:
            phase === "ENDGAME" ? "blackops" : "rank",
        stock:
            liquidate ? "liquidate"
            : lean ? "hold"
            : "trade",
    };

    return { phase, objectiveId: id, directives, budgets };
}

export async function main(ns) {
    ns.disableLog("ALL");
    let lastCash = 0;
    let lastTime = 0;
    let cashRate = 0;

    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled === false || cfg.automation?.progression === false) {
            await writeState(ns, "coordinator", { status: "paused" });
            // Blank the directive so consumers immediately revert to their own defaults.
            await writeJson(ns, DIRECTIVES_STATE, { service: "coordinator", updated: 0 });
            await ns.sleep(5000);
            continue;
        }

        try {
            const player = ns.getPlayer();
            const resetInfo = ns.getResetInfo();
            const cash = ns.getServerMoneyAvailable("home");
            const hackingLevel = ns.getHackingLevel();
            const homeRam = ns.getServerMaxRam("home");

            const now = Date.now();
            if (lastTime > 0 && now > lastTime) {
                const dt = (now - lastTime) / 1000;
                const diff = cash - lastCash;
                if (dt > 0 && diff >= 0) {
                    const currentRate = diff / dt;
                    cashRate = cashRate === 0 ? currentRate : (cashRate * 0.7 + currentRate * 0.3);
                }
            }
            lastCash = cash;
            lastTime = now;

            // Everything below used to be a speculative ns.singularity / ns.gang /
            // ns.corporation call wrapped in try/catch. Bitburner charges that RAM
            // STATICALLY whether or not the Source File exists, and multiplies
            // Singularity costs by 16 without SF4 level 3 - so a coordinator that
            // runs on every save was paying hundreds of GB for calls that always
            // threw. Those services publish their own state; ns.read is free.
            const singState = readJson(ns, `${STATE_DIR}/singularity.txt`, {});
            const gangState = readJson(ns, `${STATE_DIR}/gang.txt`, {});
            const corpState = readJson(ns, `${STATE_DIR}/corporation.txt`, {});
            const stockState = readJson(ns, `${STATE_DIR}/stock.txt`, {});

            // Home RAM price comes from Bitburner's own formula, not an API.
            const homeRamUpgradeCost = homeRamCost(homeRam);

            const hasTor = Boolean(singState.hasTor);
            const missingPrograms = Array.isArray(singState.missingPrograms) ? singState.missingPrograms : [];
            const programCosts = Number(singState.programCosts ?? 0);
            const queuedAugs = Number(singState.queuedAugs ?? 0);
            const hasRedPill = Boolean(singState.hasRedPill);

            const targetAugName = singState.goal?.augmentation ?? "";
            const targetAugFaction = singState.goal?.faction ?? "";
            const targetAugPrice = Number(singState.goal?.price ?? 0);
            const redPillRep = targetAugFaction === "Daedalus" ? Number(singState.goal?.rep ?? 0) : 0;

            const stockPortfolioValue = Number(stockState.exposure ?? 0);
            const has4S = Boolean(stockState.fourS);

            // "locked" is what gang.js / corporation.js write when the Source File
            // or the seed money is not there yet.
            const hasGang = gangState.status === "online";
            const hasCorp = corpState.status === "online" || corpState.status === "building";

            let worldDaemonRooted = false;
            let worldDaemonReqLevel = 3000;
            try {
                worldDaemonRooted = ns.hasRootAccess(WORLD_DAEMON);
                worldDaemonReqLevel = ns.getServerRequiredHackingLevel(WORLD_DAEMON);
            } catch {}

            const data = {
                cash, cashRate, hackingLevel, karma: player.karma, homeRam, homeRamUpgradeCost,
                hasTor, missingPrograms, programCosts, resetInfo, factions: player.factions,
                queuedAugs, targetAugPrice, targetAugName, targetAugFaction,
                stockPortfolioValue, worldDaemonRooted, worldDaemonReqLevel,
                hasGang, hasCorp, has4S, hasRedPill,
                redPillRep, redPillReqRep: 2_500_000,
            };

            const result = evaluateObjective(data);
            const plan = planDirectives({ ...data, objective: result });

            await writeJson(ns, COORDINATOR_STATE, {
                service: "coordinator",
                updated: Date.now(),
                ...result,
            });

            await writeJson(ns, DIRECTIVES_STATE, {
                service: "coordinator",
                updated: Date.now(),
                phase: plan.phase,
                objectiveId: plan.objectiveId,
                directives: plan.directives,
                budgets: plan.budgets,
                liquidateStocks: result.liquidateStocks,
            });

            await writeState(ns, "coordinator", {
                status: "online",
                objective: result.id,
                title: result.title,
                reason: result.reason,
                liquidateStocks: result.liquidateStocks,
                milestone: result.milestone,
                nextStep: result.nextStep,
                etaStr: result.etaStr,
                phase: plan.phase,
                directives: plan.directives,
            });
        } catch (e) {
            await writeState(ns, "coordinator", { status: "error", error: String(e) });
        }

        await ns.sleep(5000);
    }
}
