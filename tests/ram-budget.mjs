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

export const RAM_COSTS = {
    // free
    args: 0, pid: 0, enums: 0, sleep: 0, print: 0, tprint: 0, printf: 0,
    clearLog: 0, disableLog: 0, enableLog: 0, read: 0, write: 0, wget: 0,
    getResetInfo: 0, atExit: 0, tprintf: 0,
    // netscript ports are free, which is what makes worm -> home telemetry
    // affordable on servers that cannot spare a tenth of a gigabyte
    writePort: 0, readPort: 0, clearPort: 0, peek: 0, getPortHandle: 0,
    nextPortWrite: 0, tail: 0,
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
};

// Namespaces that are free or handled as a whole.
const FREE_NAMESPACES = new Set(["ui", "format"]);

export function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/**
 * @returns {{ram:number, used:string[], unknown:string[]}}
 */
export function scriptRam(source) {
    const code = stripComments(source);
    const used = new Set();
    const unknown = new Set();

    for (const match of code.matchAll(/\bns\.([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?/g)) {
        const [, first, second] = match;
        if (FREE_NAMESPACES.has(first)) continue;
        const name = second && !(first in RAM_COSTS) ? `${first}.${second}` : first;
        if (name in RAM_COSTS) used.add(name);
        else unknown.add(name);
    }

    let ram = BASE_COST;
    for (const name of used) ram += RAM_COSTS[name];
    return { ram: Math.round(ram * 100) / 100, used: [...used].sort(), unknown: [...unknown].sort() };
}
