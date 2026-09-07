import { controlCheckpoint } from "/matrix/lib/control-state.js";
import { stageScriptForRam } from "/matrix/lib/stages.js";

export function stageForRam(homeRam) {
    return stageScriptForRam(homeRam);
}

// The dashboard is included: a kernel relaunch that left the old deck running
// is how "multiple overlapping dashboard tails" comes back.
const STAGE_SCRIPTS = ["/matrix/bootstrap.js", "/matrix/early.js", "/matrix/early-progression.js", "/matrix/start.js", "/matrix/dashboard.jsx"];
const SEED = "/matrix/worm/seed.js";

export function startExistingBridge(ns, next) {
    const file = '/cloud/agent.js';
    if (ns.getServerMaxRam('home') < 32 || !ns.fileExists(file, 'home')) return;
    if (ns.ps('home').some(p => String(p.filename).replace(/^\/+/, '') === 'cloud/agent.js')) return;
    const cost = ns.getScriptRam(file, 'home');
    // Leave room for the next owner and its small command entry point. The
    // external bridge is optional and must never prevent early income startup.
    const reserve = Math.max(ns.getScriptRam(next, 'home'), ns.getScriptRam('/matrix/early-progression.js', 'home')) + 2;
    const free = ns.getServerMaxRam('home') - ns.getServerUsedRam('home');
    if (cost > 0 && free >= cost && free + ns.getScriptRam('/matrix/kernel.js', 'home') >= cost + reserve)
        ns.run(file, {threads:1, preventDuplicates:true});
}

export async function main(ns) {
    ns.disableLog("ALL");
    if(controlCheckpoint(ns,null))return;
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

    startExistingBridge(ns, next);

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
