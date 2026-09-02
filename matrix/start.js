import { config, sfLevel, event, fetchLatestInstaller, writeState } from "/matrix/lib/common.js";
import { top, bottom, rule, row, center, readWorm } from "/matrix/lib/hud.js";
import { holdSingleton } from "/matrix/lib/singleton.js";

const UPDATE_REQUEST = "/matrix/state/update-request.txt";
const INSTALLER = "/matrix/remote-install.js";
const DASHBOARD = "/matrix/dashboard.jsx";
const INSTALLED_STAGE = "/matrix/state/installed-stage.txt";
const UPDATE_SCRIPT = "/matrix/update.js";
const STAGE_ATTEMPT = "/matrix/state/stage-attempt.txt";
// A stage transition restarts the whole system. If it does not take, retrying
// every 5s is an infinite restart loop that spawns a command deck each time.
const STAGE_RETRY_MS = 300_000;

// Every managed service, with the Home RAM it genuinely needs.
//
// minRam values are DERIVED FROM MEASURED COST, not chosen. `npm test` asserts
// each one still exceeds the script's real static RAM plus the update reserve,
// so this table cannot drift away from reality.
//
// Costs verified against bitburner-src RamCostGenerator.ts. The headline is
// Singularity: SF4Cost() multiplies every call by 16 below SF4 level 3, so
// singularity.js is 1242 GB without it and 80 GB with it. sf4Level3 marks the
// services that are only realistically reachable at SF4 level 3 - ensureOne()
// still checks the true runtime cost, this table just avoids pointless retries.
export const SERVICES = [
    // 32 GB: 6.7 + 12.75 + 4.05 + 1.9 + 2.45 = 27.85, + 1.6 reserve = 29.45.
    // Import RAM is billed to the importer, so these include their libs.
    { file: "/matrix/services/hacking.js", key: "hacking", minRam: 32 },
    { file: DASHBOARD, ui: true, minRam: 32 },

    { file: "/matrix/services/telemetry.js", minRam: 32 },
    { file: "/matrix/services/coordinator.js", key: "progression", minRam: 32 },
    // 64 GB: + 8.6 + 5.5
    // 64 GB: the worm already roots continuously, so root.js is redundant below here
    { file: "/matrix/services/root.js", key: "rooting", minRam: 64 },
    { file: "/matrix/services/hacknet.js", key: "hacknet", minRam: 64 },
    { file: "/matrix/services/cloud.js", key: "cloud", minRam: 64 },
    // 128 GB: + 21.8 + 33.2
    { file: "/matrix/services/contracts.js", key: "contracts", minRam: 64 },
    { file: "/matrix/services/stock.js", key: "stock", minRam: 128 },
    { file: "/matrix/services/progression.js", key: "progression", minRam: 128, sf: 4 },
    // 256 GB: + 38.2 + 66.1
    { file: "/matrix/services/sleeves.js", key: "sleeves", minRam: 256, sf: 10 },
    { file: "/matrix/services/gang.js", key: "gang", minRam: 256, sf: 2 },
    // 512 GB: + 77.6 + 79.7 (singularity only fits at SF4 level 3)
    { file: "/matrix/services/bladeburner.js", key: "bladeburner", minRam: 512, sf: [6, 7] },
    { file: "/matrix/services/singularity.js", key: "singularity", minRam: 512, sf: 4, sf4Level3: true },
    // 1024 GB: corporation is 341.6 GB of CorporationAction calls
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
function ensureOne(ns, file, report) {
    const matches = processes(ns, file);
    for (const process of matches.slice(1)) {
        try { ns.ui.closeTail(process.pid); } catch {}
        try { ns.kill(process.pid); } catch {}
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

function expectedStage(homeRam) {
    if (homeRam >= 128) return "advanced";
    if (homeRam >= 64) return "operations";
    return "full";
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
            : entry.state === "needs-sf4-level-3" ? "needs SF4 level 3 (16x RAM below it)"
            : entry.state === "not-installed" ? "not downloaded"
            : entry.state === "launch-failed" ? "LAUNCH REFUSED by the game"
            : entry.state.toUpperCase();
        ns.print(row(icon, name.slice(0, 11), detail));
    }
    ns.print(bottom());
}

export async function main(ns) {
    ns.disableLog("ALL");
    if (ns.getServerMaxRam("home") < 32) {
        ns.spawn(ns.getServerMaxRam("home") < 16 ? "/matrix/bootstrap.js" : "/matrix/early.js", {
            threads: 1, preventDuplicates: true, spawnDelay: 0,
        });
        return;
    }

    // Duplicate supervisors are what produced duplicate command decks: each one
    // launched its own. Lowest PID wins and evicts the rest.
    if (!holdSingleton(ns, "/matrix/start.js")) return;
    await event(ns, "system", "MATRIX full supervisor online", "success");
    let tailOpen = false;

    while (true) {
        if (!holdSingleton(ns, "/matrix/start.js")) return;
        if (await handoffUpdate(ns)) return;
        const cfg = config(ns);
        const homeRam = ns.getServerMaxRam("home");
        // A stage change restarts everything, so it must be rate-limited. Left
        // unguarded, a transition that never "takes" relaunches the supervisor
        // every cycle and leaves a new command deck behind each time.
        const wantStage = expectedStage(homeRam);
        const haveStage = ns.read(INSTALLED_STAGE);
        let stageStuck = false;
        if (haveStage !== wantStage) {
            const lastAttempt = Number(ns.read(STAGE_ATTEMPT) || 0);
            if (Date.now() - lastAttempt > STAGE_RETRY_MS) {
                await ns.write(STAGE_ATTEMPT, String(Date.now()), "w");
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

        const reset = ns.getResetInfo();
        const report = [];
        for (const service of SERVICES) {
            if (service.key && cfg.automation?.[service.key] === false) {
                report.push({ file: service.file, state: "disabled" });
                continue;
            }
            if (service.ui && cfg.ui?.autoOpen === false) continue;
            if (service.sf !== undefined && !hasSourceFile(reset, service.sf)) {
                report.push({ file: service.file, state: "needs-source-file", sf: service.sf });
                continue;
            }
            if (service.sf4Level3 && sfLevel(reset, 4) < 3 && reset.currentNode !== 4) {
                // 16x Singularity cost below SF4 level 3 puts this out of reach.
                report.push({ file: service.file, state: "needs-sf4-level-3" });
                continue;
            }
            if (homeRam < service.minRam) {
                report.push({ file: service.file, state: "needs-home-ram", minRam: service.minRam });
                continue;
            }
            ensureOne(ns, service.file, report);
        }
        await writeState(ns, "supervisor", {
            status: "online", homeRam, services: report,
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
