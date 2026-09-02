import { config, writeState, writeJson, STATE_DIR } from "/matrix/lib/common.js";

const COORDINATOR_STATE = `${STATE_DIR}/coordinator.txt`;
const WORLD_DAEMON = "w0r1d_d43m0n";
const RED_PILL = "The Red Pill";
const TOR_COST = 200_000;
const DAEDALUS_CASH = 100_000_000_000;
const CORP_CASH = 150_000_000_000;

export function evaluateObjective(data) {
    const {
        cash = 0,
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

    // 1. World Daemon / BitNode completion
    if (worldDaemonRooted && hackingLevel >= worldDaemonReqLevel) {
        return {
            id: "W0R1D_D43M0N",
            title: "Destroy World Daemon",
            reason: `Hacking level ${hackingLevel}/${worldDaemonReqLevel} reached on ${WORLD_DAEMON}`,
            liquidateStocks: true,
            budgets: { augmentationReserve: 0, milestoneReserve: 0, discretionaryFraction: 0 },
            milestone: { name: "BitNode Exit", current: hackingLevel, required: worldDaemonReqLevel, pct: 100 },
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
        };
    }

    // 7. Port programs acquisition
    if (!hasTor && cash >= TOR_COST) {
        return {
            id: "BUY_PROGRAMS",
            title: "Purchase TOR Router",
            reason: "Buying TOR Router to unlock Darkweb port-opening programs",
            liquidateStocks: false,
            budgets: { augmentationReserve: 0, milestoneReserve: TOR_COST, discretionaryFraction: 0.10 },
            milestone: { name: "TOR Router", current: cash, required: TOR_COST, pct: Math.min(100, (cash / TOR_COST) * 100) },
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
        };
    }

    // 9. Home RAM expansion
    if (homeRam < 64 && Number.isFinite(homeRamUpgradeCost) && homeRamUpgradeCost > 0 && cash >= homeRamUpgradeCost) {
        return {
            id: "EXPAND_RAM",
            title: `Upgrade Home RAM (${homeRam * 2}GB)`,
            reason: `Expanding Home RAM from ${homeRam}GB to ${homeRam * 2}GB`,
            liquidateStocks: false,
            budgets: { augmentationReserve: 0, milestoneReserve: homeRamUpgradeCost, discretionaryFraction: 0.15 },
            milestone: { name: "Home RAM Upgrade", current: cash, required: homeRamUpgradeCost, pct: 100 },
        };
    }

    // Default: Bootstrap / Growth Hacking
    return {
        id: "BOOTSTRAP_INCOME",
        title: "Network Expansion & Hacking Income",
        reason: `Building cash reserve and hacking skill (lvl ${hackingLevel})`,
        liquidateStocks: false,
        budgets: { augmentationReserve: 0, milestoneReserve: 0, discretionaryFraction: 0.25 },
        milestone: { name: "Hacking Skill", current: hackingLevel, required: 100, pct: Math.min(100, (hackingLevel / 100) * 100) },
    };
}

export async function main(ns) {
    ns.disableLog("ALL");
    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled === false || cfg.automation?.progression === false) {
            await writeState(ns, "coordinator", { status: "paused" });
            await ns.sleep(5000);
            continue;
        }

        try {
            const player = ns.getPlayer();
            const resetInfo = ns.getResetInfo();
            const cash = ns.getServerMoneyAvailable("home");
            const hackingLevel = ns.getHackingLevel();
            const homeRam = ns.getServerMaxRam("home");

            let homeRamUpgradeCost = Infinity;
            try { homeRamUpgradeCost = ns.singularity.getUpgradeHomeRamCost(); } catch {}

            let hasTor = false;
            let missingPrograms = [];
            let programCosts = 0;
            try {
                const programs = ns.singularity.getDarkwebPrograms();
                for (const p of programs) {
                    const c = ns.singularity.getDarkwebProgramCost(p);
                    if (c > 0) {
                        missingPrograms.push(p);
                        programCosts += c;
                    }
                }
                hasTor = true;
            } catch {}

            let queuedAugs = 0;
            let ownedAugs = [];
            try {
                ownedAugs = ns.singularity.getOwnedAugmentations(true);
                const installed = ns.singularity.getOwnedAugmentations(false);
                queuedAugs = ownedAugs.length - installed.length;
            } catch {}

            let targetAugPrice = 0;
            let targetAugName = "";
            let targetAugFaction = "";
            let redPillRep = 0;

            const singState = ns.read(`${STATE_DIR}/singularity.txt`);
            if (singState) {
                try {
                    const parsed = JSON.parse(singState);
                    if (parsed.goal?.augmentation) {
                        targetAugName = parsed.goal.augmentation;
                        targetAugFaction = parsed.goal.faction;
                        try { targetAugPrice = ns.singularity.getAugmentationPrice(targetAugName); } catch {}
                    }
                    if (parsed.goal?.faction === "Daedalus") {
                        try { redPillRep = ns.singularity.getFactionRep("Daedalus"); } catch {}
                    }
                } catch {}
            }

            let stockPortfolioValue = 0;
            let has4S = false;
            const stockState = ns.read(`${STATE_DIR}/stock.txt`);
            if (stockState) {
                try {
                    const parsed = JSON.parse(stockState);
                    stockPortfolioValue = Number(parsed.exposure ?? 0);
                    has4S = Boolean(parsed.fourS);
                } catch {}
            }

            let worldDaemonRooted = false;
            let worldDaemonReqLevel = 3000;
            try {
                worldDaemonRooted = ns.hasRootAccess(WORLD_DAEMON);
                worldDaemonReqLevel = ns.getServerRequiredHackingLevel(WORLD_DAEMON);
            } catch {}

            let hasGang = false;
            try { hasGang = ns.gang.inGang(); } catch {}

            let hasCorp = false;
            try { hasCorp = Boolean(ns.corporation.getCorporation()); } catch {}

            const data = {
                cash, hackingLevel, karma: player.karma, homeRam, homeRamUpgradeCost,
                hasTor, missingPrograms, programCosts, resetInfo, factions: player.factions,
                queuedAugs, targetAugPrice, targetAugName, targetAugFaction,
                stockPortfolioValue, worldDaemonRooted, worldDaemonReqLevel,
                hasGang, hasCorp, has4S, hasRedPill: ownedAugs.includes(RED_PILL),
                redPillRep, redPillReqRep: 2_500_000,
            };

            const result = evaluateObjective(data);

            await writeJson(ns, COORDINATOR_STATE, {
                service: "coordinator",
                updated: Date.now(),
                ...result,
            });

            await writeState(ns, "coordinator", {
                status: "online",
                objective: result.id,
                title: result.title,
                reason: result.reason,
                liquidateStocks: result.liquidateStocks,
                milestone: result.milestone,
            });
        } catch (e) {
            await writeState(ns, "coordinator", { status: "error", error: String(e) });
        }

        await ns.sleep(5000);
    }
}
