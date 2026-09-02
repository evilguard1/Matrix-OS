import { config, sfLevel, event, fetchLatestInstaller, writeState } from "/matrix/lib/common.js";

const UPDATE_REQUEST = "/matrix/state/update-request.txt";
const INSTALLER = "/matrix/remote-install.js";
const DASHBOARD = "/matrix/dashboard.jsx";
const INSTALLED_STAGE = "/matrix/state/installed-stage.txt";
const UPDATE_SCRIPT = "/matrix/update.js";

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

export async function main(ns) {
    ns.disableLog("ALL");
    if (ns.getServerMaxRam("home") < 32) {
        ns.spawn(ns.getServerMaxRam("home") < 16 ? "/matrix/bootstrap.js" : "/matrix/early.js", {
            threads: 1, preventDuplicates: true, spawnDelay: 0,
        });
        return;
    }

    const self = ns.pid;
    if (ns.ps("home").some(process => sameScript(process.filename, "/matrix/start.js") && process.pid < self)) return;
    await event(ns, "system", "MATRIX full supervisor online", "success");

    while (true) {
        if (await handoffUpdate(ns)) return;
        const cfg = config(ns);
        const homeRam = ns.getServerMaxRam("home");
        if (ns.read(INSTALLED_STAGE) !== expectedStage(homeRam)) {
            if (!await fetchLatestInstaller(ns, INSTALLER)) {
                await event(ns, "system", "Stage download failed: installer unavailable", "error");
            } else {
                ns.spawn(INSTALLER, { threads: 1, spawnDelay: 0 }, "--stage");
                return;
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
        await writeState(ns, "supervisor", { status: "online", homeRam, services: report });

        await ns.sleep(5000);
    }
}
