/**
 * MATRIX-OS worm seeder.
 *
 * One-shot. Launched by the kernel on low-RAM saves, it plants the worm on the
 * largest server it can root and then hands home straight back to the normal
 * stage script. Nothing of this stays resident, so home's steady-state cost for
 * the entire botnet is zero.
 *
 * On a fresh save foodnstuff / sigma-cosmetics / joesguns are 16 GB and need
 * zero open ports, so the botnet starts on the first cycle.
 *
 * RAM budget: 6.70 GB one-shot  (computed and enforced by tests/validate.mjs)
 *   1.60 base + 0.20 scan + 0.05 hasRootAccess + 0.10 getServerNumPortsRequired
 * + 0.25 five crackers + 0.05 nuke + 0.60 scp + 1.30 exec
 * + 0.50 scriptKill + 0.05 getServerMaxRam + 2.00 spawn
 *
 * args: [stageScript]  the stage to hand control back to.
 */
const SPREAD = "/matrix/worm/spread.js";
const DRONE = "/matrix/worm/drone.js";
const SPREAD_RAM = 5.05;

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

export async function main(ns) {
    ns.disableLog("ALL");
    const stage = String(ns.args[0] ?? "/matrix/bootstrap.js");

    const rooted = [];
    let best = null;
    let bestRam = 0;
    for (const host of scanAll(ns)) {
        if (!tryRoot(ns, host)) continue;
        rooted.push(host);
        const ram = ns.getServerMaxRam(host);
        if (ram >= SPREAD_RAM && ram > bestRam) { best = host; bestRam = ram; }
    }

    // Reconcile the resident worm as one generation. A running script keeps the
    // source it started with, so simply copying a new spread.js is not an update.
    // Kill every old propagator first, then every old drone, before seeding one
    // fresh propagator from Home. This also prevents stale propagators from
    // racing the new rolling-HWGW handoff policy back onto refreshed hosts.
    for (const host of rooted) {
        try { ns.scriptKill(SPREAD, host); } catch {}
    }
    for (const host of rooted) {
        try { ns.scriptKill(DRONE, host); } catch {}
    }

    if (best) {
        try {
            if (ns.scp([SPREAD, DRONE], best, "home")) {
                const pid = ns.exec(SPREAD, best, { threads: 1, preventDuplicates: true });
                ns.tprint(pid
                    ? `MATRIX-OS // WORM SEEDED ON ${best} (${bestRam}GB) - BOTNET SELF-PROPAGATING`
                    : `MATRIX-OS // WORM ALREADY LIVE ON ${best}`);
            }
        } catch {}
    } else {
        ns.tprint("MATRIX-OS // NO SEEDABLE HOST YET - RETRYING ON NEXT KERNEL LAUNCH");
    }

    ns.spawn(stage, { threads: 1, spawnDelay: 0 });
}
