/**
 * MATRIX-OS manifest installer for Bitburner Steam v3.0.1.
 *
 * First install:
 *   wget https://raw.githubusercontent.com/evilguard1/Matrix-OS/main/install.js install.js
 *   run install.js --fresh
 *
 * Later updates:
 *   run /matrix/update.js
 */
const RAW_ROOT = "https://raw.githubusercontent.com/evilguard1/Matrix-OS/";
const COMMIT_API = "https://api.github.com/repos/evilguard1/Matrix-OS/commits/main";
const MANIFEST_FILE = "/matrix/manifest.json";
const MANIFEST_TEMP = "/matrix/state/manifest.download.txt";
const RELEASE_TEMP = "/matrix/state/release-metadata.txt";
const INSTALLED_STAGE = "/matrix/state/installed-stage.txt";
const CONFIG_FILE = "/matrix/config.json";
const LEGACY_CONFIG = "/matrix/config.txt";

const MATRIX_PROGRAMS = new Set([
    "matrix/bootstrap.js",
    "matrix/early.js",
    "matrix/kernel.js",
    "matrix/start.js",
    "matrix/dashboard.jsx",
    "matrix/services/root.js",
    "matrix/services/hacking.js",
    "matrix/services/cloud.js",
    "matrix/services/hacknet.js",
    "matrix/services/contracts.js",
    "matrix/services/telemetry.js",
    "matrix/services/stock.js",
    "matrix/services/progression.js",
    "matrix/services/singularity.js",
    "matrix/services/gang.js",
    "matrix/services/sleeves.js",
    "matrix/services/bladeburner.js",
    "matrix/services/corporation.js",
    "matrix/workers/early.js",
    "matrix/workers/hack.js",
    "matrix/workers/grow.js",
    "matrix/workers/weaken.js",
]);

function normalize(path) {
    return String(path).replace(/^\/+/, "");
}

function allHosts(ns) {
    const seen = new Set(["home"]);
    const queue = ["home"];
    while (queue.length) {
        const host = queue.shift();
        for (const next of ns.scan(host)) {
            if (seen.has(next)) continue;
            seen.add(next);
            queue.push(next);
        }
    }
    return [...seen];
}

function stopMatrix(ns) {
    let stopped = 0;
    for (const host of allHosts(ns)) {
        for (const process of ns.ps(host)) {
            if (!MATRIX_PROGRAMS.has(normalize(process.filename))) continue;
            if (host === "home") {
                try { ns.ui.closeTail(process.pid); } catch {}
            }
            try {
                if (ns.kill(process.pid)) stopped++;
            } catch {}
        }
    }
    return stopped;
}

function parseManifest(ns) {
    try {
        const value = JSON.parse(ns.read(MANIFEST_TEMP));
        if (!value || typeof value.version !== "string" || !Array.isArray(value.files)) return null;
        if (!Array.isArray(value.stages) || typeof value.baseUrl !== "string") return null;
        if (value.files.some(entry => !entry || typeof entry.path !== "string" || typeof entry.stage !== "string")) return null;
        return value;
    } catch {
        return null;
    }
}

async function resolveRelease(ns, stamp) {
    if (!await ns.wget(`${COMMIT_API}?t=${stamp}`, RELEASE_TEMP, "home")) return null;
    try {
        const sha = String(JSON.parse(ns.read(RELEASE_TEMP)).sha ?? "");
        return /^[a-f0-9]{40}$/i.test(sha) ? sha : null;
    } catch {
        return null;
    }
}

export function stageLimit(manifest, homeRam) {
    const stages = [...manifest.stages].sort((a, b) => Number(a.minHomeRam) - Number(b.minHomeRam));
    let index = 0;
    for (let i = 0; i < stages.length; i++) {
        if (homeRam + 1e-9 >= Number(stages[i].minHomeRam)) index = i;
    }
    return { stages, index };
}

export function eligibleFiles(manifest, homeRam) {
    const { stages, index } = stageLimit(manifest, homeRam);
    const allowed = new Set(stages.slice(0, index + 1).map(stage => stage.id));
    return manifest.files.filter(entry => allowed.has(entry.stage));
}

function migrateLegacyConfig(ns) {
    if (ns.fileExists(CONFIG_FILE, "home") || !ns.fileExists(LEGACY_CONFIG, "home")) return false;
    try {
        const raw = ns.read(LEGACY_CONFIG);
        JSON.parse(raw);
        ns.write(CONFIG_FILE, raw, "w");
        return true;
    } catch {
        return false;
    }
}

function recover(ns, noStart) {
    if (noStart || !ns.fileExists("/matrix/kernel.js", "home")) return;
    ns.tprint("MATRIX-OS // KEEPING THE PREVIOUS WORKING VERSION ONLINE");
    ns.spawn("/matrix/kernel.js", { threads: 1, spawnDelay: 0 });
}

export async function main(ns) {
    ns.disableLog("ALL");
    const fresh = ns.args.includes("--fresh");
    const noStart = ns.args.includes("--no-start");
    const stamp = Date.now();

    ns.tprint("MATRIX-OS // MANIFEST INSTALLER ONLINE");
    ns.tprint(fresh ? "MATRIX-OS // FRESH INSTALL" : "MATRIX-OS // STAGED UPDATE (CONFIG PRESERVED)");

    const release = await resolveRelease(ns, stamp);
    if (!release) {
        ns.tprint("MATRIX-OS // ERROR: COULD NOT RESOLVE THE LATEST GITHUB COMMIT");
        recover(ns, noStart);
        return;
    }
    const releaseBase = `${RAW_ROOT}${release}/`;
    if (!await ns.wget(`${releaseBase}manifest.json`, MANIFEST_TEMP, "home")) {
        ns.tprint("MATRIX-OS // ERROR: COULD NOT DOWNLOAD manifest.json");
        recover(ns, noStart);
        return;
    }
    const manifest = parseManifest(ns);
    if (!manifest) {
        ns.tprint("MATRIX-OS // ERROR: DOWNLOADED MANIFEST IS INVALID");
        recover(ns, noStart);
        return;
    }

    if (!fresh && migrateLegacyConfig(ns)) {
        ns.tprint("MATRIX-OS // MIGRATED /matrix/config.txt TO /matrix/config.json");
    }

    const protectedFiles = new Set((manifest.protectedFiles ?? []).map(path => `/${normalize(path)}`));
    const currentStage = stageLimit(manifest, ns.getServerMaxRam("home"));
    const files = eligibleFiles(manifest, ns.getServerMaxRam("home"));
    const failed = [];
    const downloads = [];
    let updated = 0;
    let preserved = 0;

    for (let index = 0; index < files.length; index++) {
        const entry = files[index];
        const local = `/${normalize(entry.path)}`;
        if (!fresh && protectedFiles.has(local) && ns.fileExists(local, "home")) {
            preserved++;
            continue;
        }
        const url = `${releaseBase}${normalize(entry.path)}`;
        const temp = `/matrix/state/download-${stamp}-${index}.txt`;
        if (await ns.wget(url, temp, "home") && ns.read(temp).length > 0) {
            downloads.push({ local, temp });
        } else {
            failed.push(local);
        }
    }

    ns.tprint(`MATRIX-OS // VERSION ${manifest.version}`);
    ns.tprint(`MATRIX-OS // RELEASE ${release.slice(0, 12)}`);
    if (failed.length) {
        ns.tprint(`MATRIX-OS // ERROR: ${failed.length} DOWNLOAD(S) FAILED`);
        for (const file of failed) ns.tprint(`  ${file}`);
        for (const download of downloads) ns.rm(download.temp, "home");
        ns.tprint("MATRIX-OS // ABORTED WITHOUT REPLACING WORKING FILES");
        recover(ns, noStart);
        return;
    }

    const stopped = stopMatrix(ns);
    if (stopped) ns.tprint(`MATRIX-OS // STOPPED ${stopped} OLD MATRIX PROCESS(ES)`);
    await ns.sleep(100);
    ns.write(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "w");
    for (const download of downloads) {
        ns.write(download.local, ns.read(download.temp), "w");
        ns.rm(download.temp, "home");
        updated++;
    }
    ns.write(INSTALLED_STAGE, currentStage.stages[currentStage.index].id, "w");
    ns.tprint(`MATRIX-OS // ${updated} FILE(S) UPDATED, ${preserved} CONFIG FILE(S) PRESERVED`);

    if (noStart) {
        ns.tprint("MATRIX-OS // UPDATE COMPLETE (--no-start)");
        return;
    }

    ns.tprint("MATRIX-OS // STARTING THE RAM-APPROPRIATE STAGE");
    ns.spawn("/matrix/kernel.js", { threads: 1, spawnDelay: 0 });
}
