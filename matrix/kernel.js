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

    // Below 16 GB home cannot afford to orchestrate a botnet itself (scp 0.6 +
    // exec 1.3 do not fit alongside the bootstrap controller), so hand off to
    // the one-shot worm seeder first. It plants the self-propagating worm on
    // the biggest rootable server and then spawns the real stage, leaving home
    // with zero resident botnet cost. From 16 GB early.js distributes workers
    // directly and the worm is retired by the installer's process sweep.
    if (ns.getServerMaxRam("home") < 16 && ns.fileExists(SEED, "home")) {
        ns.spawn(SEED, { threads: 1, spawnDelay: 0 }, next);
        return;
    }

    ns.spawn(next, { threads: 1, spawnDelay: 0 });
}
