/**
 * What MATRIX can automate right now, and what the player still has to do.
 *
 * Bitburner hard-gates a large slice of automation behind Singularity
 * (Source-File 4, or being inside BitNode 4): buying Home RAM, buying or
 * creating programs, travel, faction/company work, crime, backdoors, and
 * augmentation installs. On a save without SF4 no script can do those, so the
 * honest thing is to detect that and tell the player exactly what to click.
 *
 * Every cost here is computed from Bitburner's own formulas rather than read
 * through an API, because the Singularity getters cost 5 GB each and the whole
 * point is to run this on an 8-16 GB home.
 */

// Bitburner: currentRam * 32000 * 1.58^log2(currentRam)
const HOME_RAM_BASE_COST = 32000;
// Bitburner: ram * 55000, flat forever
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

export function serverCost(ram) {
    return ram * SERVER_COST_PER_GB;
}

/**
 * Largest power-of-two server that fits the spendable budget and is actually
 * worth owning. A server smaller than two workers is dead weight: MATRIX's
 * worker is 2.4 GB, so a 2 GB server cannot run a single one.
 */
export function bestServerBuy(spendable, workerRam = 2.4, ramLimit = 1_048_576) {
    // ns.getScriptRam returns 0 when the file is not on that host, and
    // Math.log2(0) is -Infinity, so the floor became 0 and `ram *= 2` never
    // advanced past it - an infinite loop inside a live service.
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

/**
 * What to buy with the cloud budget, given the fleet already owned.
 *
 * Early on the correct answer is almost always "another server, now": a
 * purchased server is pure worker RAM, it pays for itself within minutes of
 * hacking, and every one bought raises the rate at which the next is afforded.
 * Waiting to afford a bigger one costs more than it gains, so this buys the
 * largest size the budget allows and buys again next cycle.
 *
 * Once the fleet is full, the only way forward is replacing the smallest server
 * with a bigger one - and that is only worth doing when the upgrade is a real
 * multiple, not a marginal step.
 */
export function serverPurchasePlan(options = {}) {
    // Destructuring an argument defaults only on undefined, so a null caller
    // would throw here rather than degrade.
    const {
        budget = 0,
        owned = [],
        limit = 25,
        workerRam = 2.4,
        ramLimit = 1_048_576,
        upgradeMultiple = 4,
    } = options ?? {};
    const spendable = Math.max(0, Number(budget) || 0);
    const fleet = (Array.isArray(owned) ? owned : [])
        .map(server => ({ host: String(server?.host ?? ""), ram: Number(server?.ram) || 0 }))
        .filter(server => server.host);
    const affordable = bestServerBuy(spendable, workerRam, ramLimit);
    if (affordable <= 0) return { action: "wait", reason: "budget below the smallest useful server" };

    if (fleet.length < Math.max(0, limit)) {
        return { action: "buy", ram: affordable, cost: serverCost(affordable) };
    }

    // Fleet is full: the only gain left is replacing the weakest machine, and
    // only when the replacement is worth the disruption of killing its work.
    const weakest = fleet.reduce((worst, server) => server.ram < worst.ram ? server : worst, fleet[0]);
    if (affordable >= weakest.ram * upgradeMultiple) {
        return { action: "replace", host: weakest.host, from: weakest.ram, ram: affordable, cost: serverCost(affordable) };
    }
    return { action: "wait", reason: `fleet full; next upgrade needs ${upgradeMultiple}x the smallest (${weakest.ram} GB)` };
}

/** Singularity is free to detect through getResetInfo(), which costs 0 GB. */
export function singularityReady(reset) {
    return reset?.currentNode === 4 || (reset?.ownedSF?.get?.(4) ?? 0) > 0;
}

/** The next port cracker the player does not own yet. */
export function nextPortProgram(owned, hackingLevel) {
    const have = Array.isArray(owned) ? owned : [];
    const level = Number(hackingLevel) || 0;
    const missing = PORT_PROGRAMS.find(program => !have.includes(program.file));
    if (!missing) return null;
    return {
        ...missing,
        canCreate: level >= missing.level,
        levelsToGo: Math.max(0, missing.level - level),
    };
}

/**
 * Actions the human still has to perform, most valuable first. Returns
 * [] once Singularity is available, because at that point MATRIX does all of it.
 *
 * @returns {{id:string,label:string,detail:string,cost:number,where:string,ready:boolean}[]}
 */
export function manualActions(options = {}) {
    // A parameter default fires only on undefined; state files supply null.
    const {
    homeRam = 8,
    cash = 0,
    hackingLevel = 1,
    ownedPrograms = [],
    singularity = false,
    cloudAutomated = false,
    workerRam = 2.4,
} = options ?? {};
    if (singularity) return [];
    const out = [];

    const program = nextPortProgram(ownedPrograms, hackingLevel);
    if (program) {
        out.push(program.canCreate ? {
            id: "CREATE_PROGRAM",
            tag: "CREATE",
            label: `Create ${program.file}`,
            short: `${program.file} - free, do it now`,
            detail: `free at Hacking ${program.level} - you qualify now`,
            cost: 0,
            where: "Create Program tab",
            ready: true,
        } : {
            id: "GET_PROGRAM",
            tag: "PROGRAM",
            label: `Get ${program.file}`,
            short: `${program.file} @ terminal`,
            detail: `create free at Hacking ${program.level} (${program.levelsToGo} to go), or buy now`,
            cost: program.price,
            where: `terminal: buy ${program.file}`,
            ready: cash >= program.price,
        });
    }

    if (!cloudAutomated) {
        const server = bestServerBuy(cash, workerRam);
        const floorRam = Math.pow(2, Math.ceil(Math.log2(workerRam * 2)));
        out.push({
            id: "BUY_SERVER",
            tag: "BUY SERVER",
            label: server ? `Buy ${server}GB cloud server` : `Buy ${floorRam}GB cloud server`,
            short: `${server || floorRam}GB @ Alpha Ent.`,
            detail: server
                ? `${Math.floor(server / workerRam)} more workers - cheapest RAM in the game`
                : `need ${fmt(serverCost(floorRam))}; anything smaller cannot host a worker`,
            cost: serverCost(server || floorRam),
            where: "Alpha Ent. (Sector-12)",
            ready: Boolean(server),
        });
    }

    const ramCost = homeRamUpgradeCost(homeRam);
    out.push({
        id: "UPGRADE_HOME_RAM",
        tag: "HOME RAM",
        label: `Upgrade Home RAM ${homeRam} -> ${homeRam * 2}GB`,
        short: `${homeRam}->${homeRam * 2}GB @ Alpha Ent.`,
        detail: nextStageNote(homeRam * 2),
        cost: ramCost,
        where: "Alpha Ent. (Sector-12)",
        ready: cash >= ramCost,
    });

    return out.sort((a, b) => (b.ready ? 1 : 0) - (a.ready ? 1 : 0) || a.cost - b.cost);
}

function nextStageNote(ram) {
    if (ram >= 128) return "unlocks the advanced Source-File managers";
    if (ram >= 64) return "unlocks purchased-server upgrades and stock trading";
    if (ram >= 32) return "unlocks the full command deck, HWGW batcher and auto-buying";
    if (ram >= 16) return "unlocks the distributed early engine";
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
