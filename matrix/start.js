import { config, sfLevel, event, fetchLatestInstaller } from "/matrix/lib/common.js";

const UPDATE_REQUEST = "/matrix/state/update-request.txt";
const INSTALLER = "/matrix/remote-install.js";
const DASHBOARD = "/matrix/dashboard.jsx";
const INSTALLED_STAGE = "/matrix/state/installed-stage.txt";

const CORE = [
    { file: "/matrix/services/root.js", key: "rooting", minRam: 32 },
    { file: "/matrix/services/telemetry.js", minRam: 32 },
    { file: "/matrix/services/hacking.js", key: "hacking", minRam: 32 },
    { file: "/matrix/services/cloud.js", key: "cloud", minRam: 64 },
    { file: "/matrix/services/hacknet.js", key: "hacknet", minRam: 64 },
    { file: "/matrix/services/contracts.js", key: "contracts", minRam: 128 },
    { file: "/matrix/services/stock.js", key: "stock", minRam: 128 },
];

function sameScript(a, b) {
    return String(a).replace(/^\/+/, "") === String(b).replace(/^\/+/, "");
}

function processes(ns, file) {
    return ns.ps("home").filter(process => sameScript(process.filename, file));
}

function ensureOne(ns, file) {
    const matches = processes(ns, file);
    for (const process of matches.slice(1)) {
        try { ns.ui.closeTail(process.pid); } catch {}
        try { ns.kill(process.pid); } catch {}
    }
    if (matches.length) return matches[0].pid;
    if (!ns.fileExists(file, "home")) return 0;
    const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
    if (free + 1e-9 < ns.getScriptRam(file, "home")) return 0;
    return ns.run(file, { threads: 1, preventDuplicates: true });
}

function hasSourceFile(reset, number) {
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
        for (const service of CORE) {
            if (homeRam < service.minRam) continue;
            if (service.key && cfg.automation?.[service.key] === false) continue;
            if (service.file === "/matrix/services/hacking.js" && cfg.ui?.autoOpen !== false) ensureOne(ns, DASHBOARD);
            ensureOne(ns, service.file);
        }

        const reset = ns.getResetInfo();
        if (homeRam >= 128 && cfg.automation?.singularity !== false && hasSourceFile(reset, 4)) ensureOne(ns, "/matrix/services/singularity.js");
        if (homeRam >= 128 && cfg.automation?.progression !== false && hasSourceFile(reset, 4)) ensureOne(ns, "/matrix/services/progression.js");
        if (homeRam >= 128 && cfg.automation?.gang !== false && hasSourceFile(reset, 2)) ensureOne(ns, "/matrix/services/gang.js");
        if (homeRam >= 128 && cfg.automation?.sleeves !== false && hasSourceFile(reset, 10)) ensureOne(ns, "/matrix/services/sleeves.js");
        if (homeRam >= 128 && cfg.automation?.bladeburner !== false && (hasSourceFile(reset, 6) || hasSourceFile(reset, 7))) ensureOne(ns, "/matrix/services/bladeburner.js");
        if (homeRam >= 256 && cfg.automation?.corporation !== false && hasSourceFile(reset, 3)) ensureOne(ns, "/matrix/services/corporation.js");
        if (cfg.ui?.autoOpen !== false) ensureOne(ns, DASHBOARD);
        await ns.sleep(5000);
    }
}
