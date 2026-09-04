import { config, sfLevel, event, fetchLatestInstaller, writeState } from "/matrix/lib/common.js";
import { top, bottom, rule, row, center, readWorm } from "/matrix/lib/hud.js";
import { holdSingleton } from "/matrix/lib/singleton.js";
import { scanAll } from "/matrix/lib/network.js";
import { stampFile, staleHosts, sweepNeeded, residentScripts, REMOTE_FILES } from "/matrix/lib/propagate.js";
import { FULL_ENGINE_HOME_RAM, stageIdForRam } from "/matrix/lib/stages.js";

const VERSION_FILE = "/matrix/VERSION.txt";
// Bounded per cycle: refreshing the whole network in one pass would stall the
// supervisor, and a host that waits a cycle is current a few seconds later.
const SWEEP_LIMIT = 12;
const UPDATE_REQUEST = "/matrix/state/update-request.txt";
const INSTALLER = "/matrix/remote-install.js";
const DASHBOARD = "/matrix/dashboard.jsx";
const INSTALLED_STAGE = "/matrix/state/installed-stage.txt";
const UPDATE_SCRIPT = "/matrix/update.js";
const STAGE_ATTEMPT = "/matrix/state/stage-attempt.txt";
const DECK_BEAT = "/matrix/state/dashboard.txt";

// ns.ps-based liveness has already failed once in this project: bootstrap.js had
// to move to a lock file (8cb272a), and preventDuplicates was found to silently
// no-op (90f757a). The supervisor reported the deck "started" with a new PID
// every cycle while every other service stayed "running", which is the same
// signature. So the deck's liveness comes from the heartbeat it writes, not from
// ns.ps - exactly the pattern bootstrap.js already uses.
function deckAlive(ns) {
    try {
        const raw = ns.read(DECK_BEAT);
        if (!raw) return false;
        const beat = JSON.parse(raw);
        return beat.phase === "alive" && Date.now() - Number(beat.updated ?? 0) < 8000;
    } catch {
        return false;
    }
}
// A stage transition restarts the whole system. If it does not take, retrying
// every 5s is an infinite restart loop that spawns a command deck each time.
const STAGE_RETRY_MS = 300_000;

// Every managed service. minRam is an eligibility floor for that individual
// service, not a promise that every service sharing that number fits together.
// ensureOne() remains the final authority: it asks Bitburner for live script RAM
// and preserves enough free Home RAM to launch the updater.
export const SERVICES = [
    // Core services are only orchestrated once start.js itself owns Home at 64 GB.
    // Hacking/coordinator individually fit below 64, so their floors remain 32;
    // the stage ownership boundary, not this table, prevents premature launch.
    { file: "/matrix/services/hacking.js", key: "hacking", minRam: 32 },
    { file: DASHBOARD, ui: true, minRam: 64 },
    { file: "/matrix/services/telemetry.js", minRam: 64 },
    { file: "/matrix/services/coordinator.js", key: "progression", minRam: 32 },

    // 64 GB priority set. With the measured 1.8.1 costs these coexist with the
    // rolling core and updater reserve. Rooting is already supplied by the worm.
    { file: "/matrix/services/hacknet.js", key: "hacknet", minRam: 64 },
    { file: "/matrix/services/cloud.js", key: "cloud", minRam: 64 },
    // IPvGO needs no Source-File and grants permanent global multipliers.
    { file: "/matrix/services/go.js", key: "go", minRam: 64 },

    // 128 GB operations tier: add deferred convenience/throughput services.
    { file: "/matrix/services/root.js", key: "rooting", minRam: 128 },
    { file: "/matrix/services/contracts.js", key: "contracts", minRam: 128 },
    { file: "/matrix/services/stock.js", key: "stock", minRam: 128 },
    { file: "/matrix/services/darknet.js", key: "darknet", minRam: 128, requiresFile: "DarkscapeNavigator.exe" },
    { file: "/matrix/services/progression.js", key: "progression", minRam: 128, sf: 4 },

    // Capability-gated expansion. The nominal floor only makes a service
    // eligible; actual SF-adjusted getScriptRam() still decides whether it runs.
    { file: "/matrix/services/sleeves.js", key: "sleeves", minRam: 256, sf: 10 },
    { file: "/matrix/services/gang.js", key: "gang", minRam: 256, sf: 2 },
    { file: "/matrix/services/stanek.js", key: "stanek", minRam: 256, sf: 13 },
    { file: "/matrix/services/bladeburner.js", key: "bladeburner", minRam: 512, sf: [6, 7] },
    { file: "/matrix/services/singularity.js", key: "singularity", minRam: 512, sf: 4, sf4Level3: true },
    { file: "/matrix/services/corporation.js", key: "corporation", minRam: 1024, sf: 3 },
];

function sameScript(a, b) {
    return String(a).replace(/^\/+/, "") === String(b).replace(/^\/+/, "");
}

function processes(ns, file) {
    return ns.ps("home").filter(process => sameScript(process.filename, file));
}

// Records why every service is or is not running. A service that silently fails
// to launch is the single most confusing failure mode in this system: the deck
// just shows OFFLINE with no reason. ns.getScriptRam() is the authority on cost
// (it knows the real Source-File multipliers a static analyser cannot), so
// report its answer rather than discarding it.
function ensureOne(ns, file, report, { kill = true } = {}) {
    const matches = processes(ns, file);
    // NEVER kill a script that owns a window. A killed script cannot run its own
    // closeTail(), so every kill leaves an orphaned tail behind - and ns.ps order
    // is not guaranteed to be PID-ordered, so this killed a DIFFERENT deck each
    // cycle. That, not any ownership rule, is what produced a dead deck every ten
    // seconds. Windowed services stand down voluntarily through their lease.
    if (kill) {
        for (const process of matches.slice(1)) {
            try { ns.ui.closeTail(process.pid); } catch {}
            try { ns.kill(process.pid); } catch {}
        }
    }
    if (matches.length) {
        report?.push({ file, state: "running", pid: matches[0].pid });
        return matches[0].pid;
    }
    if (!ns.fileExists(file, "home")) {
        report?.push({ file, state: "not-installed" });
        return 0;
    }
    const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
    const updateReserve = ns.fileExists(UPDATE_SCRIPT, "home") ? ns.getScriptRam(UPDATE_SCRIPT, "home") : 1.6;
    const need = ns.getScriptRam(file, "home") + updateReserve;
    if (free + 1e-9 < need) {
        report?.push({ file, state: "ram-blocked", need: Math.round(need * 100) / 100, free: Math.round(free * 100) / 100 });
        return 0;
    }
    const pid = ns.run(file, { threads: 1, preventDuplicates: true });
    report?.push({ file, state: pid ? "started" : "launch-failed", pid });
    return pid;
}

function hasSourceFile(reset, number) {
    if (Array.isArray(number)) return number.some(n => hasSourceFile(reset, n));
    return reset.currentNode === number || sfLevel(reset, number) > 0;
}

export function expectedStage(homeRam) {
    return stageIdForRam(homeRam);
}

// A representative file for each installed stage. Runtime service admission is
// separate from file installation; these probes only answer whether that stage's
// payload has actually arrived on Home.
const STAGE_PROBE = {
    full: DASHBOARD,
    operations: "/matrix/services/stock.js",
    advanced: "/matrix/services/stanek.js",
};

export function stageInstalled(ns, stage) {
    const probe = STAGE_PROBE[stage];
    return !probe || ns.fileExists(probe, "home");
}

async function handoffUpdate(ns) {
    if (!ns.fileExists(UPDATE_REQUEST, "home")) return false;
    if (!await fetchLatestInstaller(ns, INSTALLER)) {
        await event(ns, "system", "Update failed: installer download failed", "error");
        return false;
    }
    ns.rm(UPDATE_REQUEST, "home");
    ns.spawn(INSTALLER, { threads: 1, spawnDelay: 0 });
    return true;
}

// A supervisor with no visible output is a supervisor you cannot debug. The deck
// is the real UI, so this tail only appears when the deck is NOT running - which
// is exactly when you need to know why. Costs 0 GB: print/tail/ui are all free,
// and the report is already computed.
function drawSupervisor(ns, homeRam, report, reason, stuck) {
    ns.clearLog();
    const used = ns.getServerUsedRam("home");
    const worm = readWorm(ns);
    ns.print(top());
    ns.print(center("M A T R I X  //  S U P E R V I S O R"));
    ns.print(rule());
    ns.print(row("💻", "HOME RAM", `${ns.format.ram(homeRam)}  │  ${ns.format.ram(used)} used, ${ns.format.ram(homeRam - used)} free`));
    if (reason) ns.print(row("⚠️", "DECK", reason));
    if (stuck) ns.print(row("⛔", "STAGE", stuck));
    if (worm) ns.print(row("🐛", "BOTNET", `${worm.infected}/${worm.rooted} infected  │  ${worm.drones} drones`));
    ns.print(rule("S E R V I C E S"));
    for (const entry of report) {
        const name = entry.file.replace("/matrix/", "").replace("services/", "").replace(/\.jsx?$/, "");
        const icon = entry.state === "running" || entry.state === "started" ? "🟢"
            : entry.state === "ram-blocked" || entry.state === "launch-failed" ? "🔴" : "⚪";
        const detail = entry.state === "ram-blocked" ? `BLOCKED - needs ${entry.need}GB, ${entry.free}GB free`
            : entry.state === "needs-home-ram" ? `needs ${entry.minRam}GB home`
            : entry.state === "needs-source-file" ? `needs Source-File ${entry.sf}`
            : entry.state === "needs-program" ? `needs ${entry.program}`
            : entry.state === "needs-sf4-level-3" ? "needs SF4 level 3 (16x RAM below it)"
            : entry.state === "not-installed" ? "not downloaded"
            : entry.state === "gave-up" ? `KILLED REPEATEDLY - stopped after ${entry.launches} launches`
            : entry.state === "settling" ? "just launched, waiting for its lease"
            : entry.state === "restart-loop" ? `DIES ON START - gave up after ${entry.restarts} tries`
            : entry.state === "launch-failed" ? "LAUNCH REFUSED by the game"
            : entry.state.toUpperCase();
        ns.print(row(icon, name.slice(0, 11), detail));
    }
    ns.print(bottom());
}

// Push the current build out to the network.
//
// Every deploy site copied a worker only when it was missing, so a server kept
// whatever version it first received - forever. After an update home ran new
// code and ninety-odd servers ran old code, silently.
//
// ns.scp is instant, so there is nothing to gain from spreading in a tree: the
// same number of instant calls happen either way. The missing piece was knowing
// which hosts are behind, and a version-stamped marker file answers that with
// one fileExists per host - there is no API to read a remote file's contents.
async function sweepBuild(ns, hosts, version) {
    const stamp = stampFile(version);
    // Home carries the marker so it can be copied outward like any other file.
    if (!ns.fileExists(stamp, "home")) await ns.write(stamp, version, "w");

    const stale = staleHosts(hosts, host => ns.fileExists(stamp, host), {
        limit: SWEEP_LIMIT,
    });
    if (!stale.length) return { refreshed: 0, remaining: 0 };

    const payload = REMOTE_FILES.map(file => file.path).filter(path => ns.fileExists(path, "home"));
    const resident = residentScripts();
    let refreshed = 0;
    for (const host of stale) {
        if (!ns.hasRootAccess(host)) continue;
        try {
            if (!await ns.scp([...payload, stamp], host, "home")) continue;
            // A running script keeps the code it started with, so a long-running
            // worker has to be restarted to pick the new build up. One-shot
            // workers are left alone - killing those would waste a batch in
            // flight for no gain, and the next launch uses the new file anyway.
            for (const script of resident) {
                try { ns.scriptKill(script, host); } catch {}
            }
            refreshed++;
        } catch {}
    }
    return { refreshed, remaining: stale.length - refreshed };
}

export async function main(ns) {
    ns.disableLog("ALL");
    if (ns.getServerMaxRam("home") < FULL_ENGINE_HOME_RAM) {
        ns.spawn(ns.getServerMaxRam("home") < 16 ? "/matrix/bootstrap.js" : "/matrix/early.js", {
            threads: 1, preventDuplicates: true, spawnDelay: 0,
        });
        return;
    }

    // Duplicate supervisors are what produced duplicate command decks: each one
    // launched its own. Lowest PID wins and evicts the rest.
    if (!holdSingleton(ns, "/matrix/start.js")) {
        ns.tprint("MATRIX-OS // SUPERVISOR STANDING DOWN (another is older)");
        return;
    }
    await event(ns, "system", "MATRIX full supervisor online", "success");
    ns.tprint(`MATRIX-OS // SUPERVISOR ONLINE (pid ${ns.pid}, home ${ns.getServerMaxRam("home")}GB)`);
    let tailOpen = false;
    // A service that dies immediately and is respawned every cycle orphans a
    // tail window each time. Give up after a few tries and report it instead.
    let deckRestarts = 0;
    const DECK_RESTART_LIMIT = 3;
    // deckRestarts resets whenever the deck reports healthy, so a deck that comes
    // ONLINE and is then killed by something else never trips the limit - it just
    // churns forever. Count total launches, which never resets, so an unexplained
    // killer can cost at most a few windows before MATRIX stops feeding it.
    let deckLaunches = 0;
    const DECK_LAUNCH_BUDGET = 3;
    // early.js works because the kernel spawns it ONCE and then the kernel is
    // gone. The deck is the only thing launched from a loop that re-evaluates
    // every 5s, so it needs the same one-shot discipline imposed explicitly:
    // after launching, leave it alone long enough to take its lease.
    let lastDeckSpawn = 0;
    const DECK_SPAWN_COOLDOWN = 15_000;

    while (true) {
        if (!holdSingleton(ns, "/matrix/start.js")) {
            ns.tprint("MATRIX-OS // SUPERVISOR STANDING DOWN (another is older)");
            return;
        }
        // Announce every exit: an unexplained supervisor restart is what spawns a
        // command deck each cycle, and it was invisible in the event stream.
        if (await handoffUpdate(ns)) {
            ns.tprint("MATRIX-OS // SUPERVISOR RESTARTING: update requested");
            return;
        }
        const cfg = config(ns);
        const homeRam = ns.getServerMaxRam("home");
        // A stage change restarts everything, so it must be rate-limited. Left
        // unguarded, a transition that never "takes" relaunches the supervisor
        // every cycle and leaves a new command deck behind each time.
        const wantStage = expectedStage(homeRam);
        const haveStage = ns.read(INSTALLED_STAGE);
        let stageStuck = false;
        // Reality, not the marker: if the files are here, we are on this stage.
        if (!stageInstalled(ns, wantStage)) {
            const lastAttempt = Number(ns.read(STAGE_ATTEMPT) || 0);
            if (Date.now() - lastAttempt > STAGE_RETRY_MS) {
                await ns.write(STAGE_ATTEMPT, String(Date.now()), "w");
                ns.tprint(`MATRIX-OS // FETCHING STAGE "${wantStage}" (marker says "${haveStage || "none"}")`);
                if (await fetchLatestInstaller(ns, INSTALLER)) {
                    ns.spawn(INSTALLER, { threads: 1, spawnDelay: 0 }, "--stage");
                    return;
                }
                await event(ns, "system", "Stage download failed: installer unavailable", "error");
            } else {
                // Keep running the services we already have rather than spinning.
                stageStuck = true;
            }
        }

        // Keep the network on the build home is running.
        let sweep = null;
        try {
            // VERSION.txt reads like "MATRIX-OS 1.4.0"; take the number itself
            // rather than splitting on a newline.
            const version = (String(ns.read(VERSION_FILE) ?? "").match(/[0-9]+[.][0-9]+[.][0-9]+/) ?? [])[0] ?? "";
            if (version) {
                const { hosts } = scanAll(ns);
                sweep = await sweepBuild(ns, hosts, version);
                if (sweep.refreshed) {
                    await event(ns, "system", `Pushed build ${version} to ${sweep.refreshed} server(s)`, "success");
                }
            }
        } catch {}

        const reset = ns.getResetInfo();
        const report = [];
        for (const service of SERVICES) {
            if (service.key && cfg.automation?.[service.key] === false) {
                report.push({ file: service.file, state: "disabled" });
                continue;
            }
            if (service.ui && cfg.ui?.autoOpen === false) continue;
            // A live heartbeat means the deck is up even if ns.ps cannot see it.
            if (service.ui && deckAlive(ns)) {
                deckRestarts = 0;
                report.push({ file: service.file, state: "running", via: "heartbeat" });
                continue;
            }
            if (service.ui && deckLaunches >= DECK_LAUNCH_BUDGET) {
                report.push({ file: service.file, state: "gave-up", launches: deckLaunches });
                continue;
            }
            if (service.ui && deckRestarts >= DECK_RESTART_LIMIT) {
                report.push({ file: service.file, state: "restart-loop", restarts: deckRestarts });
                continue;
            }
            if (service.ui && Date.now() - lastDeckSpawn < DECK_SPAWN_COOLDOWN) {
                report.push({ file: service.file, state: "settling" });
                continue;
            }
            if (service.sf !== undefined && !hasSourceFile(reset, service.sf)) {
                report.push({ file: service.file, state: "needs-source-file", sf: service.sf });
                continue;
            }
            if (service.sf4Level3 && sfLevel(reset, 4) < 3 && reset.currentNode !== 4) {
                // 16x Singularity cost below SF4 level 3 puts this out of reach.
                report.push({ file: service.file, state: "needs-sf4-level-3" });
                continue;
            }
            if (service.requiresFile && !ns.fileExists(service.requiresFile, "home")) {
                report.push({ file: service.file, state: "needs-program", program: service.requiresFile });
                continue;
            }
            if (homeRam < service.minRam) {
                report.push({ file: service.file, state: "needs-home-ram", minRam: service.minRam });
                continue;
            }
            const launched = ensureOne(ns, service.file, report, { kill: !service.ui });
            if (service.ui && launched) { lastDeckSpawn = Date.now(); deckLaunches += 1; }
        }
        const deckEntry = report.find(entry => entry.file === DASHBOARD);
        if (deckEntry?.state === "started") deckRestarts++;
        else if (deckEntry?.state === "running") deckRestarts = 0;

        await writeState(ns, "supervisor", {
            status: "online", homeRam, services: report, deckRestarts,
            stage: haveStage, expectedStage: wantStage, stageStuck,
        });

        // The command deck is the real UI. If it is not up, show why rather than
        // leaving the player with no window at all - the state this stage used to
        // fail into silently.
        const deck = report.find(entry => entry.file === DASHBOARD);
        const deckUp = deck && (deck.state === "running" || deck.state === "started");
        if (deckUp) {
            if (tailOpen) { try { ns.ui.closeTail(); } catch {} tailOpen = false; }
        } else {
            const reason = !deck ? "not attempted"
                : deck.state === "ram-blocked" ? `needs ${deck.need}GB, only ${deck.free}GB free`
                : deck.state === "not-installed" ? "dashboard.jsx not downloaded"
                : deck.state === "gave-up" ? `killed repeatedly - stopped after ${deck.launches} launches. Set ui.autoOpen=false in /matrix/config.json to silence this.`
                : deck.state === "settling" ? "just launched, waiting for its lease"
                : deck.state === "restart-loop" ? `starts then dies immediately (${deck.restarts} tries)`
                : deck.state === "launch-failed" ? "the game refused to run it"
                : String(deck.state);
            if (!tailOpen) {
                try { ns.tail(); } catch {}
                try { ns.ui.setTailTitle("MATRIX // SUPERVISOR"); } catch {}
                try { ns.ui.resizeTail(640, 520); } catch {}
                try { ns.ui.openTail(); } catch {}
                await event(ns, "system", `Command deck unavailable: ${reason}`, "error");
                tailOpen = true;
            }
            drawSupervisor(ns, homeRam, report, reason,
                stageStuck ? `installed "${haveStage}" but expected "${wantStage}"` : null);
        }

        await ns.sleep(5000);
    }
}
