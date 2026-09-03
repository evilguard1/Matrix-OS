import { stageScriptForRam } from "/matrix/lib/stages.js";

export function stageForRam(homeRam) {
    return stageScriptForRam(homeRam);
}

// The dashboard is included: a kernel relaunch that left the old deck running
// is how "multiple overlapping dashboard tails" comes back.
const STAGE_SCRIPTS = ["/matrix/bootstrap.js", "/matrix/early.js", "/matrix/start.js", "/matrix/dashboard.jsx"];
const SEED = "/matrix/worm/seed.js";

export async function main(ns) {
    ns.disableLog("ALL");
    const next = stageForRam(ns.getServerMaxRam("home"));

    // Kill ALL stale stage processes so preventDuplicates can't silently no-op
    for (const script of STAGE_SCRIPTS) {
        for (const proc of ns.ps("home")) {
            if (String(proc.filename).replace(/^\/+/, "") === script.replace(/^\/+/, "") && proc.pid !== ns.pid) {
                try { ns.ui.closeTail(proc.pid); } catch {}
                try { ns.kill(proc.pid); } catch {}
            }
        }
    }

    // Also clear the lock file so bootstrap doesn't see a stale lock
    ns.rm("/matrix/state/bootstrap-lock.txt", "home");

    await ns.sleep(200);
    ns.tprint(`MATRIX-OS // LAUNCHING ${next}`);

    // Always hand off to the one-shot worm seeder first. It plants the
    // self-propagating worm on the biggest rootable server and then spawns the
    // real stage, leaving home with zero resident botnet cost.
    //
    // The worm survives every stage for rooting and propagation. Below 64 GB
    // its drones own the botnet economy. From 64 GB the rolling HWGW scheduler
    // owns all money-making H/G/W work, so spread.js kills/withholds autonomous
    // drones instead of competing with coordinated batches.
    if (ns.fileExists(SEED, "home")) {
        ns.spawn(SEED, { threads: 1, spawnDelay: 0 }, next);
        return;
    }

    ns.spawn(next, { threads: 1, spawnDelay: 0 });
}
