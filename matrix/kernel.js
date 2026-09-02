export function stageForRam(homeRam) {
    if (homeRam < 16) return "/matrix/bootstrap.js";
    if (homeRam < 32) return "/matrix/early.js";
    return "/matrix/start.js";
}

const STAGE_SCRIPTS = ["/matrix/bootstrap.js", "/matrix/early.js", "/matrix/start.js"];
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
    // The worm now survives every stage. Below 32 GB it owns the botnet
    // outright; from 32 GB it yields most of each host to the HWGW batcher and
    // only fills what the batcher leaves idle between waves. hacking.js drains
    // a whole wave before starting the next, so that idle RAM is real.
    if (ns.fileExists(SEED, "home")) {
        ns.spawn(SEED, { threads: 1, spawnDelay: 0 }, next);
        return;
    }

    ns.spawn(next, { threads: 1, spawnDelay: 0 });
}
