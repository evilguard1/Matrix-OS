/**
 * MATRIX-OS worm propagator.
 *
 * Resident agent that runs ON an infected host, never on home. Each cycle it
 * roots what it can reach, copies the worm onward, and fills every rooted host
 * with drones. Home pays nothing after the initial seed: this is the botnet
 * growing itself.
 *
 * RAM budget: 5.05 GB  (computed and enforced by tests/validate.mjs)
 *   1.60 base + 0.20 scan + 0.05 getHostname + 0.05 hasRootAccess
 * + 0.10 getServerNumPortsRequired + 0.25 five crackers + 0.05 nuke
 * + 0.60 scp + 1.30 exec + 0.50 scriptKill + 0.05 getServerMaxRam
 * + 0.05 getServerUsedRam + 0.10 getServerMaxMoney
 * + 0.10 getServerRequiredHackingLevel + 0.05 getHackingLevel
 *
 * At 8 GB a host runs the worm plus one drone; at 16 GB, four drones.
 *
 * Deliberately NOT importing /matrix/lib/*: every import is inlined into the
 * caller's RAM cost, and this script has to fit inside small early servers.
 */
const SPREAD = "/matrix/worm/spread.js";
const DRONE = "/matrix/worm/drone.js";

// Hardcoded because ns.getScriptRam() costs 0.10 GB we cannot spare. The test
// suite asserts these match the real computed cost of each file.
const SPREAD_RAM = 5.05;
const DRONE_RAM = 2.40;

// A host only becomes a propagation node if it can carry the worm AND still
// have meaningful room left for drones. Smaller hosts get drones only.
const PROPAGATE_MIN_RAM = 16;

const CYCLE_MS = 20_000;

// Netscript port the worm reports botnet status on. Ports are 0 GB and
// global across hosts, so this is telemetry the worm can actually afford.
const STATUS_PORT = 1;

function scanAll(ns) {
    const seen = new Set(["home"]);
    const queue = ["home"];
    while (queue.length) {
        for (const next of ns.scan(queue.shift())) {
            if (seen.has(next)) continue;
            seen.add(next);
            queue.push(next);
        }
    }
    seen.delete("home");
    return [...seen];
}

function tryRoot(ns, host) {
    if (ns.hasRootAccess(host)) return true;
    let opened = 0;
    try { ns.brutessh(host); opened++; } catch {}
    try { ns.ftpcrack(host); opened++; } catch {}
    try { ns.relaysmtp(host); opened++; } catch {}
    try { ns.httpworm(host); opened++; } catch {}
    try { ns.sqlinject(host); opened++; } catch {}
    if (opened < ns.getServerNumPortsRequired(host)) return false;
    try { ns.nuke(host); } catch {}
    return ns.hasRootAccess(host);
}

// Best server we are currently allowed to hack, by raw payout potential.
function chooseTarget(ns, hosts) {
    const level = ns.getHackingLevel();
    let best = "n00dles";
    let bestScore = -1;
    for (const host of hosts) {
        if (!ns.hasRootAccess(host)) continue;
        const money = ns.getServerMaxMoney(host);
        if (money <= 0) continue;
        const required = ns.getServerRequiredHackingLevel(host);
        if (required > level) continue;
        // Prefer big money that our level comfortably clears.
        const score = money / Math.max(1, required);
        if (score > bestScore) { bestScore = score; best = host; }
    }
    return best;
}

export async function main(ns) {
    ns.disableLog("ALL");
    const me = ns.getHostname();
    let lastTarget = "";

    while (true) {
        const hosts = scanAll(ns);
        const rooted = [];
        for (const host of hosts) {
            if (tryRoot(ns, host)) rooted.push(host);
        }

        const target = chooseTarget(ns, rooted);
        const retarget = target !== lastTarget;
        lastTarget = target;

        let botnetRam = 0;
        let botnetUsed = 0;
        let infected = 0;
        let nodes = 0;

        for (const host of rooted) {
            const maxRam = ns.getServerMaxRam(host);
            botnetRam += maxRam;
            if (maxRam < DRONE_RAM) continue;

            // Carry the worm onward. scp is idempotent and cheap.
            if (host !== me) {
                try { ns.scp([SPREAD, DRONE], host, me); } catch { continue; }
            }

            // A better target invalidates every drone on this host.
            if (retarget) {
                try { ns.scriptKill(DRONE, host); } catch {}
            }

            // Big enough hosts become propagation nodes themselves. Reserve the
            // worm's footprint whether or not it has started yet, so a restart
            // always has room to land.
            let reserved = 0;
            if (maxRam >= PROPAGATE_MIN_RAM) {
                nodes++;
                reserved = SPREAD_RAM;
                if (host !== me) {
                    try { ns.exec(SPREAD, host, { threads: 1, preventDuplicates: true }); } catch {}
                }
            }

            const used = ns.getServerUsedRam(host);
            botnetUsed += used;
            if (used > 0) infected++;

            const free = maxRam - used - (host === me ? 0 : reserved);
            const threads = Math.floor(free / DRONE_RAM);
            if (threads < 1) continue;
            try { ns.exec(DRONE, host, { threads, preventDuplicates: true }, target); } catch {}
        }

        // Report home. Netscript ports cost 0 GB and are global across every
        // host, so this is the only channel the worm can afford. Each spread
        // instance scans the whole network, so any single report is a complete
        // picture and last-writer-wins is correct.
        try {
            ns.clearPort(STATUS_PORT);
            ns.writePort(STATUS_PORT, JSON.stringify({
                updated: Date.now(),
                origin: me,
                discovered: hosts.length,
                rooted: rooted.length,
                infected,
                nodes,
                botnetRam,
                botnetUsed,
                drones: Math.floor(botnetUsed / DRONE_RAM),
                target,
            }));
        } catch {}

        await ns.sleep(CYCLE_MS);
    }
}
