const UI_STAGE_RAM = Object.freeze({ early: 16, full: 64, operations: 128, advanced: 256 });

/**
 * What MATRIX can automate right now, and what the player still has to do.
 * Runtime stage ownership is centralized in /matrix/lib/stages.js; these pure
 * constants only keep low-RAM player-facing guidance aligned without adding an
 * import dependency to this early-game library.
 */
const HOME_RAM_BASE_COST = 32000;
const SERVER_COST_PER_GB = 55000;
export const TOR_COST = 200_000;

export const PORT_PROGRAMS = [
    { file: "BruteSSH.exe",  level: 50,  price: 500_000 },
    { file: "FTPCrack.exe",  level: 100, price: 1_500_000 },
    { file: "relaySMTP.exe", level: 250, price: 5_000_000 },
    { file: "HTTPWorm.exe",  level: 500, price: 30_000_000 },
    { file: "SQLInject.exe", level: 750, price: 250_000_000 },
];

export function homeRamUpgradeCost(currentRam) {
    if (!Number.isFinite(currentRam) || currentRam <= 0) return Infinity;
    return currentRam * HOME_RAM_BASE_COST * Math.pow(1.58, Math.log2(currentRam));
}

export function serverCost(ram) { return ram * SERVER_COST_PER_GB; }

export function bestServerBuy(spendable, workerRam = 2.4, ramLimit = 1_048_576) {
    const worker = Number(workerRam) > 0 ? Number(workerRam) : 2.4;
    const cap = Number(ramLimit) > 0 ? Number(ramLimit) : 1_048_576;
    const budget = Number(spendable);
    if (!Number.isFinite(budget) || budget <= 0) return 0;
    const floor = Math.max(2, Math.pow(2, Math.ceil(Math.log2(worker * 2))));
    let best = 0;
    for (let ram = floor; ram <= cap; ram *= 2) {
        if (serverCost(ram) <= budget) best = ram;
        else break;
    }
    return best;
}

export function serverPurchasePlan(options = {}) {
    const {
        budget = 0, owned = [], limit = 25, workerRam = 2.4,
        ramLimit = 1_048_576, upgradeMultiple = 4,
    } = options ?? {};
    const spendable = Math.max(0, Number(budget) || 0);
    const fleet = (Array.isArray(owned) ? owned : [])
        .map(server => ({ host: String(server?.host ?? ""), ram: Number(server?.ram) || 0 }))
        .filter(server => server.host);
    const affordable = bestServerBuy(spendable, workerRam, ramLimit);
    if (affordable <= 0) return { action: "wait", reason: "budget below the smallest useful server" };
    if (fleet.length < Math.max(0, limit)) return { action: "buy", ram: affordable, cost: serverCost(affordable) };
    const weakest = fleet.reduce((worst, server) => server.ram < worst.ram ? server : worst, fleet[0]);
    if (affordable >= weakest.ram * upgradeMultiple) {
        return { action: "replace", host: weakest.host, from: weakest.ram, ram: affordable, cost: serverCost(affordable) };
    }
    return { action: "wait", reason: `fleet full; next upgrade needs ${upgradeMultiple}x the smallest (${weakest.ram} GB)` };
}

/** Singularity capability from reset state. getResetInfo costs 1 GB in v3.0.1. */
export function singularityReady(reset) {
    return reset?.currentNode === 4 || (reset?.ownedSF?.get?.(4) ?? 0) > 0;
}

export function nextPortProgram(owned, hackingLevel) {
    const have = Array.isArray(owned) ? owned : [];
    const level = Number(hackingLevel) || 0;
    const missing = PORT_PROGRAMS.find(program => !have.includes(program.file));
    if (!missing) return null;
    return { ...missing, canCreate: level >= missing.level, levelsToGo: Math.max(0, missing.level - level) };
}

export function manualActions(options = {}) {
    const {
        homeRam = 8, cash = 0, hackingLevel = 1, ownedPrograms = [],
        singularity = false, cloudAutomated = false, workerRam = 2.4,
    } = options ?? {};
    if (singularity) return [];
    const out = [];

    const program = nextPortProgram(ownedPrograms, hackingLevel);
    if (program) {
        out.push(program.canCreate ? {
            id: "CREATE_PROGRAM", tag: "CREATE", label: `Create ${program.file}`,
            short: `${program.file} - free, do it now`,
            detail: `free at Hacking ${program.level} - you qualify now`,
            cost: 0, where: "Create Program tab", ready: true,
        } : {
            id: "GET_PROGRAM", tag: "PROGRAM", label: `Get ${program.file}`,
            short: `${program.file} @ terminal`,
            detail: `create free at Hacking ${program.level} (${program.levelsToGo} to go), or buy now`,
            cost: program.price, where: `terminal: buy ${program.file}`, ready: cash >= program.price,
        });
    }

    if (!cloudAutomated) {
        const server = bestServerBuy(cash, workerRam);
        const floorRam = Math.pow(2, Math.ceil(Math.log2(workerRam * 2)));
        out.push({
            id: "BUY_SERVER", tag: "BUY SERVER",
            label: server ? `Buy ${server}GB cloud server` : `Buy ${floorRam}GB cloud server`,
            short: `${server || floorRam}GB @ Alpha Ent.`,
            detail: server
                ? `${Math.floor(server / workerRam)} more workers - cheapest RAM in the game`
                : `need ${fmt(serverCost(floorRam))}; anything smaller cannot host a worker`,
            cost: serverCost(server || floorRam), where: "Alpha Ent. (Sector-12)", ready: Boolean(server),
        });
    }

    const ramCost = homeRamUpgradeCost(homeRam);
    out.push({
        id: "UPGRADE_HOME_RAM", tag: "HOME RAM", label: `Upgrade Home RAM ${homeRam} -> ${homeRam * 2}GB`,
        short: `${homeRam}->${homeRam * 2}GB @ Alpha Ent.`, detail: nextStageNote(homeRam * 2),
        cost: ramCost, where: "Alpha Ent. (Sector-12)", ready: cash >= ramCost,
    });
    return out.sort((a, b) => (b.ready ? 1 : 0) - (a.ready ? 1 : 0) || a.cost - b.cost);
}

function nextStageNote(ram) {
    if (ram >= UI_STAGE_RAM.advanced) return "unlocks advanced capability managers";
    if (ram >= UI_STAGE_RAM.operations) return "unlocks contracts, stock and broader operations";
    if (ram >= UI_STAGE_RAM.full) return "unlocks the full command deck, rolling HWGW and automated infrastructure";
    if (ram >= UI_STAGE_RAM.early) return "unlocks the distributed early engine";
    return "more RAM for MATRIX itself";
}

function fmt(n) {
    if (!Number.isFinite(n)) return "--";
    const a = Math.abs(n);
    for (const [suffix, size] of [["b", 1e9], ["m", 1e6], ["k", 1e3]]) {
        if (a >= size) return `$${(a / size).toFixed(2)}${suffix}`;
    }
    return `$${Math.round(a)}`;
}
export { fmt as formatCost };

export function ramExpansionAdvice(options = {}) {
    const { homeRam = 8, ownedServers = [], serverLimit = 25, ramLimit = 1_048_576 } = options ?? {};
    const home = Math.max(1, Number(homeRam) || 1);
    const homeCost = homeRamUpgradeCost(home);
    const homeGain = home;
    const homePerGb = homeGain > 0 && Number.isFinite(homeCost) ? homeCost / homeGain : Infinity;
    const fleet = (Array.isArray(ownedServers) ? ownedServers : [])
        .map(s => ({ host: String(s?.host ?? ""), ram: Number(s?.ram) || 0 })).filter(s => s.host);
    const limit = Math.max(0, Number(serverLimit) || 0);
    const cap = Math.max(0, Number(ramLimit) || 0);
    const slotsLeft = Math.max(0, limit - fleet.length);
    const upgradable = fleet.filter(s => s.ram < cap).length;
    const serverRoom = slotsLeft > 0 || upgradable > 0;
    const serverPerGb = serverCost(1);
    const stageThreshold = Number(options?.stageThreshold ?? UI_STAGE_RAM.advanced);
    const homeIsCapability = home < stageThreshold;
    return {
        homePerGb, serverPerGb, homeCost, homeGain, slotsLeft, upgradable, homeIsCapability,
        better: homeIsCapability ? "home" : serverRoom && serverPerGb < homePerGb ? "servers" : "home",
        reason: homeIsCapability
            ? `home is below ${stageThreshold} GB - upgrading it unlocks modules, which no server can do`
            : !serverRoom ? "the purchased fleet is full and maxed, so home is the only way left to grow"
            : "servers are pure worker RAM and far cheaper per gigabyte at this scale",
        multiple: serverPerGb > 0 && Number.isFinite(homePerGb) ? homePerGb / serverPerGb : 1,
        equivalentServerGb: serverPerGb > 0 && Number.isFinite(homeCost) ? Math.floor(homeCost / serverPerGb) : 0,
    };
}

export function homeReserveFor(homeRam, cfg = {}) {
    const configured = Math.max(0, Number(cfg?.hacking?.homeReserveGb ?? 24) || 24);
    const home = Math.max(0, Number(homeRam) || 0);
    const scaled = home * 0.02;
    return Math.min(Math.max(configured, scaled), Math.max(configured, 512));
}
