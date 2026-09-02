/**
 * Coding-contract dispatch, shared by the 16 GB stage and the full supervisor.
 *
 * Contracts are among the best income in the game - CodingContractBaseMoneyGain
 * is $75m scaled by difficulty - but the API to solve one costs 20 GB
 * (getContractType 5 + getData 5 + attempt 10). Keeping that resident on home
 * would put the whole capability behind a 128 GB home.
 *
 * So finding is cheap (ls is 0.2 GB) and solving is a one-shot worker sent out
 * to any rooted host with room. early.js already owns scp and exec, so it picks
 * this up for the price of ls alone.
 */
export const CONTRACT_SOLVER = "/matrix/workers/contract.js";
export const CONTRACT_SOLVERS_LIB = "/matrix/lib/solvers.js";
const DRONE = "/matrix/worm/drone.js";

/** Rooted host with the most free RAM, excluding home. */
export function solverHost(ns, hosts, need) {
    let best = null;
    let bestFree = 0;
    for (const host of hosts) {
        if (host === "home" || !ns.hasRootAccess(host)) continue;
        const free = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
        if (free >= need && free > bestFree) { best = host; bestFree = free; }
    }
    return best;
}

/**
 * Nothing has room, because the worm keeps the network saturated. Evict drones
 * from the largest capable host so the solver can land; the worm refills it on
 * its next cycle. A contract pays $75m x difficulty - a few seconds of drone
 * time is not a real cost.
 */
export function makeRoom(ns, hosts, need) {
    let best = null;
    let bestRam = 0;
    for (const host of hosts) {
        if (host === "home" || !ns.hasRootAccess(host)) continue;
        const max = ns.getServerMaxRam(host);
        if (max >= need && max > bestRam) { best = host; bestRam = max; }
    }
    if (!best) return null;
    try { ns.scriptKill(DRONE, best); } catch {}
    return ns.getServerMaxRam(best) - ns.getServerUsedRam(best) >= need ? best : null;
}

/**
 * Find every .cct on the network and send one solver per contract.
 * `dispatched` is a caller-owned Set so a contract is never attempted twice.
 * @returns {{found:number, sent:number, waiting:number, need:number}}
 */
export function dispatchContracts(ns, hosts, dispatched) {
    let found = 0, sent = 0, waiting = 0;
    const need = ns.getScriptRam(CONTRACT_SOLVER, "home");

    for (const host of hosts) {
        for (const file of ns.ls(host, ".cct")) {
            found++;
            const key = `${host}/${file}`;
            if (dispatched.has(key)) continue;

            const runner = solverHost(ns, hosts, need) ?? makeRoom(ns, hosts, need);
            if (!runner) { waiting++; continue; }
            if (!ns.scp([CONTRACT_SOLVER, CONTRACT_SOLVERS_LIB], runner, "home")) continue;
            // preventDuplicates keys on the args, so one contract is solved once.
            if (ns.exec(CONTRACT_SOLVER, runner, { threads: 1, preventDuplicates: true }, host, file)) {
                dispatched.add(key);
                sent++;
            }
        }
    }

    // Forget contracts that are gone so the set cannot grow without bound.
    for (const key of [...dispatched]) {
        const split = key.lastIndexOf("/");
        const host = key.slice(0, split);
        const file = key.slice(split + 1);
        try { if (!ns.ls(host, ".cct").includes(file)) dispatched.delete(key); } catch { dispatched.delete(key); }
    }

    return { found, sent, waiting, need };
}
