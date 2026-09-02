import fs from "node:fs";
import path from "node:path";

/**
 * Static Netscript RAM cost analyser.
 *
 * Bitburner charges a script the sum of every NS function it *mentions*, plus a
 * 1.6 GB base, whether or not the call executes. Exceeding a server's RAM makes
 * the script silently fail to launch, which is how the previous attempt at an
 * 8 GB distributed bootstrap was lost. This lets the test suite fail loudly at
 * commit time instead.
 *
 * Costs mirror Bitburner v3.0.1 RamCostConstants. Only functions the RAM-
 * critical worm scripts are allowed to use are listed; anything else is
 * reported as unknown so an expensive call can never slip in unnoticed.
 */
export const BASE_COST = 1.6;

// Referencing window or document costs 25 GB (RamCostConstants Dom: 25). This is
// charged STATICALLY on the identifier, so a single window.innerWidth in a
// decorative canvas silently made the command deck unlaunchable at 32 GB.
export const DOM_COST = 25;
// Bitburner walks the parsed script and charges for REFERENCING window or
// document, not for calling a method on one - so requiring a trailing dot
// missed `typeof document`, a bare `document` returned from a guard, and
// anything passed around by name. Matching the bare word instead over-charges,
// because prose in a comment or JSX text ("leaves a dead window on screen") is
// not an identifier. So the word must be followed by something only real code
// puts there: a member access, a call, or an operator.
export const DOM_IDENTIFIERS = /(?:^|[^\w$.])(?:window|document)\s*(?:[.[(),;?:=&|!]|$)/g;

export const RAM_COSTS = {
    // free
    args: 0, pid: 0, enums: 0, sleep: 0, print: 0, tprint: 0, printf: 0,
    clearLog: 0, disableLog: 0, enableLog: 0, read: 0, write: 0, wget: 0,
    getResetInfo: 0, atExit: 0, tprintf: 0,
    // netscript ports are free, which is what makes worm -> home telemetry
    // affordable on servers that cannot spare a tenth of a gigabyte
    writePort: 0, readPort: 0, clearPort: 0, peek: 0, getPortHandle: 0,
    nextPortWrite: 0, tail: 0, printRaw: 0, alert: 0, toast: 0,
    // cheap server queries
    hasRootAccess: 0.05, getHostname: 0.05, getHackingLevel: 0.05,
    getServerMaxRam: 0.05, getServerUsedRam: 0.05,
    getHackTime: 0.05, getGrowTime: 0.05, getWeakenTime: 0.05,
    nuke: 0.05, brutessh: 0.05, ftpcrack: 0.05, relaysmtp: 0.05,
    httpworm: 0.05, sqlinject: 0.05,
    getServerMoneyAvailable: 0.1, getServerMaxMoney: 0.1,
    getServerSecurityLevel: 0.1, getServerMinSecurityLevel: 0.1,
    getServerRequiredHackingLevel: 0.1, getServerNumPortsRequired: 0.1,
    getServerGrowth: 0.1, fileExists: 0.1, getScriptRam: 0.1, isRunning: 0.1,
    // actions
    hack: 0.1, grow: 0.15, weaken: 0.15, share: 2.4,
    // process / file control
    scan: 0.2, ls: 0.2, ps: 0.2, kill: 0.5, killall: 0.5, scriptKill: 0.5,
    scp: 0.6, run: 1.0, rm: 1.0, exec: 1.3, spawn: 2.0,
    // expensive analysis (listed so a mistake is priced, not unknown)
    hackAnalyze: 1.0, hackAnalyzeChance: 1.0, hackAnalyzeThreads: 1.0,
    hackAnalyzeSecurity: 1.0, growthAnalyze: 1.0, growthAnalyzeSecurity: 1.0,
    weakenAnalyze: 1.0, getPlayer: 0.5, getServer: 2.0, getMoneySources: 1.0,
    getScriptIncome: 0.1, getScriptExpGain: 0.1, getRunningScript: 0.3,
    // stock market (WSE) - 2.0 per function
    "stock.getSymbols": 2.0, "stock.getPrice": 2.0, "stock.getAskPrice": 2.0,
    "stock.getBidPrice": 2.0, "stock.getPosition": 2.0, "stock.getMaxShares": 2.0,
    "stock.buyStock": 2.5, "stock.sellStock": 2.5, "stock.buyShort": 2.5,
    "stock.sellShort": 2.5, "stock.getForecast": 2.0, "stock.getVolatility": 2.0,
    "stock.purchaseWseAccount": 2.5, "stock.purchaseTixApi": 2.5,
    "stock.purchase4SMarketDataTixApi": 2.5, "stock.has4SDataTixApi": 0.05,
    "stock.hasWseAccount": 0.05, "stock.hasTixApiAccess": 0.05,
    "stock.getConstants": 0, "stock.nextUpdate": 0,
    // coding contracts
    "codingcontract.attempt": 10, "codingcontract.getData": 5,
    "codingcontract.getContractType": 5, "codingcontract.getDescription": 5,
    "codingcontract.getNumTriesRemaining": 2,
    // purchased servers (v3 cloud namespace)
    "cloud.purchaseServer": 2.25, "cloud.deleteServer": 2.25,
    "cloud.getServerNames": 1.05, "cloud.getServerLimit": 0.05,
    "cloud.getRamLimit": 0.05, "cloud.getServerCost": 0.25,
    "cloud.getServerUpgradeCost": 0.1, "cloud.upgradeServer": 0.1,
};

// --- Source-File gated namespaces -------------------------------------------
// Verified against bitburner-src/src/Netscript/RamCostGenerator.ts.

const SING_1 = 2, SING_2 = 3, SING_3 = 5;
const GANG = 4, SLEEVE = 4, BLADE = 4;
const CORP_INFO = 10, CORP_ACTION = 20;

// Singularity functions by tier. SF4Cost() multiplies these by 16 at SF4 level
// 0-1, by 4 at level 2, and by 1 at level 3+ or inside BitNode 4. A script that
// merely MENTIONS one pays the multiplied price, which is why a service must
// never touch Singularity speculatively.
export const SINGULARITY_COSTS = {
    universityCourse: SING_1, gymWorkout: SING_1, travelToCity: SING_1,
    purchaseTor: SING_1, purchaseProgram: SING_1, getCurrentServer: SING_1,
    connect: SING_1, manualHack: SING_1, installBackdoor: SING_1, cat: SING_1,
    getDarkwebProgramCost: SING_1, getDarkwebPrograms: SING_1,
    hospitalize: SING_1, isBusy: SING_1, getCompanyPositions: SING_1,
    getCompanyPositionInfo: SING_1,

    upgradeHomeRam: SING_2, upgradeHomeCores: SING_2,
    getUpgradeHomeRamCost: SING_2, getUpgradeHomeCoresCost: SING_2,
    workForCompany: SING_2, applyToCompany: SING_2, quitJob: SING_2,
    getCompanyRep: SING_2, getCompanyFavor: SING_2, getCompanyFavorGain: SING_2,
    getFactionInviteRequirements: SING_2, getFactionEnemies: SING_2,
    checkFactionInvitations: SING_2, joinFaction: SING_2, workForFaction: SING_2,
    getFactionWorkTypes: SING_2, getFactionRep: SING_2, getFactionFavor: SING_2,
    getFactionFavorGain: SING_2,

    goToLocation: SING_3, commitCrime: SING_3, getCrimeChance: SING_3,
    getCrimeStats: SING_3, getOwnedAugmentations: SING_3,
    getOwnedSourceFiles: SING_3, getAugmentationFactions: SING_3,
    getAugmentationsFromFaction: SING_3, getAugmentationPrereq: SING_3,
    getAugmentationPrice: SING_3, getAugmentationBasePrice: SING_3,
    getAugmentationRepReq: SING_3, getAugmentationStats: SING_3,
    purchaseAugmentation: SING_3, softReset: SING_3,
    installAugmentations: SING_3, createProgram: SING_3,
    getHackingLevelRequirementOfProgram: SING_3, donateToFaction: SING_3,
    destroyW0r1dD43m0n: SING_3, getUnlockedAchievements: SING_3,

    stopAction: 2.5, getCurrentWork: 0.5, isFocused: 0.1, setFocus: 0.1,
    getSaveData: 1, exportGame: 1, b1tflum3: 16,
};

/** SF4Cost(): level 0-1 -> x16, level 2 -> x4, level 3+ / BitNode 4 -> x1. */
export function sf4Multiplier(sf4Level) {
    if (sf4Level <= 1) return 16;
    if (sf4Level === 2) return 4;
    return 1;
}

// Corporation: every query is 10, every mutation is 20. A handful are free.
const CORP_FREE = new Set(["hasCorporation", "canCreateCorporation", "getConstants", "getBonusTime", "nextUpdate"]);
const CORP_QUERY = /^(get|has|find)/;

// IPvGO. Chains and liberties cost 16 GB each and getValidMoves 8, but all
// three are derivable from the 4 GB board state with a flood fill in plain JS -
// so MATRIX pays for the board and computes the rest itself.
const GO_COSTS = {
    makeMove: 4, getBoardState: 4, setTestingBoardState: 4,
    getValidMoves: 8, getChains: 16, getLiberties: 16, getControlledEmptyNodes: 16,
    getCheatSuccessChance: 1, getCheatCount: 1,
    removeRouter: 8, playTwoMoves: 8, repairOfflineNode: 8, destroyNode: 8,
};

export const NAMESPACE_COST = {
    gang: () => GANG,
    sleeve: () => SLEEVE,
    bladeburner: () => BLADE,
    hacknet: () => 0.5,
    corporation: fn => CORP_FREE.has(fn) ? 0 : (CORP_QUERY.test(fn) ? CORP_INFO : CORP_ACTION),
    codingcontract: fn => ({
        attempt: 10, getContract: 10, getContractType: 5, getData: 5,
        getDescription: 5, getNumTriesRemaining: 2, createDummyContract: 2,
        getContractTypes: 0,
    }[fn] ?? 10),
    stock: fn => /^(buy|sell|purchase)/.test(fn) ? 2.5
        : /^(has|nextUpdate|getConstants)/.test(fn) ? 0 : 2.0,
    // passTurn, getMoveHistory, getCurrentPlayer, getGameState, getOpponent,
    // opponentNextTurn, resetBoardState and getStats are all free - the old
    // catch-all charged them 4 GB each and overstated any Go script.
    go: fn => GO_COSTS[fn] ?? 0,
    stanek: fn => /^(place|acceptGift)/.test(fn) ? 5 : 0.4,
    formulas: () => 0,
    ui: () => 0,
    format: () => 0,
    enums: () => 0,
};

export function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/**
 * @returns {{ram:number, used:string[], unknown:string[], runtime:string[], exact:boolean}}
 */
// Bitburner charges an imported file's RAM to the IMPORTER, so a static cost is
// only correct if it follows /matrix/... imports and unions their NS usage.
// Each unique function is billed once no matter how many modules mention it.
function collectSources(source, { root, seen = new Set() } = {}) {
    const out = [source];
    if (!root) return out;
    for (const match of source.matchAll(/from\s+["'](\/matrix\/[^"']+)["']/g)) {
        const spec = match[1];
        if (seen.has(spec)) continue;
        seen.add(spec);
        try {
            const nested = fs.readFileSync(path.join(root, spec.replace(/^\//, "")), "utf8");
            out.push(...collectSources(nested, { root, seen }));
        } catch {}
    }
    return out;
}

export function scriptRam(source, { sf4 = 0, root = null } = {}) {
    source = collectSources(source, { root }).join(String.fromCharCode(10));
    const code = stripComments(source);
    const used = new Map();
    const unknown = new Set();
    const sf4Mult = sf4Multiplier(sf4);

    for (const match of code.matchAll(/\bns\.([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?/g)) {
        const [, first, second] = match;

        if (first === "singularity" && second) {
            const base = SINGULARITY_COSTS[second];
            if (base === undefined) { unknown.add(`singularity.${second}`); continue; }
            used.set(`singularity.${second}`, base * sf4Mult);
            continue;
        }
        if (first in NAMESPACE_COST && second) {
            used.set(`${first}.${second}`, NAMESPACE_COST[first](second));
            continue;
        }
        if (first in NAMESPACE_COST) continue;
        if (first in RAM_COSTS) { used.set(first, RAM_COSTS[first]); continue; }
        const dotted = second ? `${first}.${second}` : first;
        if (dotted in RAM_COSTS) { used.set(dotted, RAM_COSTS[dotted]); continue; }
        unknown.add(dotted);
    }

    let ram = BASE_COST;
    for (const cost of used.values()) ram += cost;
    const usesDom = DOM_IDENTIFIERS.test(code);
    DOM_IDENTIFIERS.lastIndex = 0;
    if (usesDom) { ram += DOM_COST; used.set("<dom>", DOM_COST); }
    return {
        ram: Math.round(ram * 100) / 100,
        used: [...used.keys()].sort(),
        unknown: [...unknown].sort(),
        exact: unknown.size === 0,
    };
}
