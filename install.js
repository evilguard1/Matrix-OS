/**
 * MATRIX-OS manifest installer for Bitburner Steam v3.0.1.
 *
 * First install:
 *   wget https://raw.githubusercontent.com/evilguard1/Matrix-OS/rp/ghost-node-war/install.js install.js
 *   run install.js --fresh
 *
 * Later updates:
 *   run /matrix/update.js
 */
const RAW_ROOT = "https://raw.githubusercontent.com/evilguard1/Matrix-OS/";
const COMMIT_API = "https://api.github.com/repos/evilguard1/Matrix-OS/commits/";
const RELEASE_PROFILE = "/matrix/release.json";
const DEFAULT_CHANNEL = "rp/ghost-node-war";
const MANIFEST_FILE = "/matrix/manifest.json";
const MANIFEST_TEMP = "/matrix/state/manifest.download.txt";
const RELEASE_TEMP = "/matrix/state/release-metadata.txt";
const INSTALLED_STAGE = "/matrix/state/installed-stage.txt";
const CONFIG_FILE = "/matrix/config.json";
const LEGACY_CONFIG = "/matrix/config.txt";

// The worm is deliberately NOT listed: it must survive stage transitions so a
// 32 GB upgrade does not silently trade a continuously-earning botnet for a
// batcher that idles between waves. spread.js yields RAM to HWGW instead.
const MATRIX_PROGRAMS = new Set([
    "matrix/bootstrap.js",
    "matrix/early.js",
    "matrix/kernel.js",
    "matrix/start.js",
    "matrix/dashboard.jsx",
    "matrix/services/coordinator.js",
    "matrix/services/go.js",
    "matrix/services/stanek.js",
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
    "matrix/workers/share.js",
    "matrix/workers/contract.js",
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
        if (JSON.stringify(value.stages.map(s => [s?.id, s?.minHomeRam])) !==
            JSON.stringify([["bootstrap",8],["early",16],["full",64],["operations",128],["advanced",256]])) return null;
        if (value.files.some(entry => !entry || typeof entry.path !== "string" || typeof entry.stage !== "string" || !ownedPath(`/${normalize(entry.path)}`) || !/^[a-f0-9]{64}$/.test(entry.sha256))) return null;
        if (new Set(value.files.map(e => normalize(e.path))).size !== value.files.length) return null;
        if (value.files.some(e => !value.stages.some(s => s.id === e.stage) ||
            normalize(e.path).startsWith("matrix/state/") ||
            ["matrix/release.json", "matrix/manifest.json"].includes(normalize(e.path)))) return null;
        return value;
    } catch {
        return null;
    }
}

async function resolveRelease(ns, stamp, channel) {
    if (await ns.wget(`${COMMIT_API}${encodeURIComponent(channel)}?t=${stamp}`, RELEASE_TEMP, "home")) {
        try {
            const sha = String(JSON.parse(ns.read(RELEASE_TEMP)).sha ?? "");
            if (/^[a-f0-9]{40}$/i.test(sha)) return sha;
        } catch {}
    }
    return null;
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

    if (ns.getHostname() !== "home") { ns.tprint("MATRIX-OS // INSTALL FROM HOME ONLY"); return; }
    let profile, release, channel;
    try {
        if (restoreTransaction(ns)) { recover(ns, noStart); return; }
        const raw = ns.read(RELEASE_PROFILE);
        profile = raw ? JSON.parse(raw) : null;
        if (profile && (profile.schemaVersion !== 1 || !["main", DEFAULT_CHANNEL].includes(profile.channel) ||
            !/^[a-f0-9]{40}$/.test(profile.installedSha))) throw new Error("invalid-release-profile");
        const channelArg = ns.args.indexOf("--channel");
        channel = channelArg >= 0 ? ns.args[channelArg + 1] : profile?.channel ?? DEFAULT_CHANNEL;
        if (!["main", DEFAULT_CHANNEL].includes(channel)) throw new Error("invalid-channel");
        const releaseArg = ns.args.indexOf("--release");
        release = releaseArg >= 0 ? ns.args[releaseArg + 1] :
            ns.args.includes("--stage") && profile?.installedSha ? profile.installedSha : await resolveRelease(ns, stamp, channel);
        if (release != null && (typeof release !== "string" || !/^[a-f0-9]{40}$/.test(release))) throw new Error("invalid-release-sha");
    } catch (error) {
        ns.tprint(`MATRIX-OS // INSTALL BLOCKED: ${String(error)}`);
        return;
    }
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
    protectedFiles.add(CONFIG_FILE);
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
        if (await ns.wget(url, temp, "home") && ns.read(temp).length > 0 && sha256(ns.read(temp)) === entry.sha256) {
            downloads.push({ local, temp, sha256: entry.sha256 });
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

    try {
        promoteRelease(ns, downloads, manifest, {
            schemaVersion: 1, channel, installedSha: release, previousSha: profile?.installedSha ?? null,
            version: manifest.version, installedAt: Date.now(), runtimeHealth: "unverified",
        }, currentStage.stages[currentStage.index].id);
        updated = downloads.length;
        for (const download of downloads) ns.rm(download.temp, "home");
    } catch (error) {
        ns.tprint(`MATRIX-OS // PROMOTION FAILED: ${String(error)}`);
        try { restoreTransaction(ns); recover(ns, noStart); }
        catch (recoveryError) { ns.tprint(`MATRIX-OS // RECOVERY REQUIRED: ${String(recoveryError)}`); }
        return;
    }
    ns.tprint(`MATRIX-OS // ${updated} FILE(S) UPDATED, ${preserved} CONFIG FILE(S) PRESERVED`);

    if (noStart) {
        ns.tprint("MATRIX-OS // UPDATE COMPLETE (--no-start)");
        return;
    }

    ns.tprint("MATRIX-OS // STARTING THE RAM-APPROPRIATE STAGE");
    ns.spawn("/matrix/kernel.js", { threads: 1, spawnDelay: 0 });
}

export const TRANSACTION = "/matrix/state/install-transaction.json";

function verifiedWrite(ns, path, content) {
    const result = ns.write(path, content, "w");
    if (result?.then || ns.read(path) !== content) throw new Error(`write-not-verified: ${path}`);
}

function ownedPath(path) {
    return typeof path === "string" && /^\/matrix\/[A-Za-z0-9_./-]+\.(js|jsx|json|txt)$/.test(path) &&
        !path.split("/").some(p => p === ".." || p === ".") && path !== TRANSACTION;
}

// Backups and promotion are synchronous in the 3.0.1 engine. Persist the whole
// recovery record before stopping anything. Never restore an unvalidated record.
export function restoreTransaction(ns) {
    const raw = ns.read(TRANSACTION);
    if (!raw) return false;
    const journal = JSON.parse(raw);
    if (journal.schemaVersion !== 1 || !["prepared", "installed", "rolled-back"].includes(journal.phase) ||
        !Array.isArray(journal.backups) || journal.backups.some(b => !ownedPath(b.path) ||
            typeof b.existed !== "boolean" || typeof b.content !== "string" || sha256(b.content) !== b.sha256)) {
        throw new Error("invalid-install-journal");
    }
    if (journal.phase !== "prepared") return false;
    stopMatrix(ns);
    for (const backup of journal.backups) {
        if (backup.existed) verifiedWrite(ns, backup.path, backup.content);
        else {
            ns.rm(backup.path, "home");
            if (ns.fileExists(backup.path, "home")) throw new Error(`remove-not-verified: ${backup.path}`);
        }
    }
    journal.phase = "rolled-back";
    verifiedWrite(ns, TRANSACTION, JSON.stringify(journal));
    return true;
}

export function promoteRelease(ns, downloads, manifest, profile, stage) {
    const writes = downloads.map(d => ({ path: d.local, content: ns.read(d.temp), sha256: d.sha256 }));
    writes.push({ path: MANIFEST_FILE, content: JSON.stringify(manifest, null, 2) },
        { path: RELEASE_PROFILE, content: JSON.stringify(profile) },
        { path: INSTALLED_STAGE, content: stage });
    if (new Set(writes.map(w => w.path)).size !== writes.length || writes.some(w => !ownedPath(w.path) ||
        (w.sha256 && sha256(w.content) !== w.sha256))) throw new Error("invalid-promotion-payload");
    const backups = writes.map(w => {
        const content = ns.read(w.path);
        return { path: w.path, existed: ns.fileExists(w.path, "home"), content, sha256: sha256(content) };
    });
    const journal = { schemaVersion: 1, phase: "prepared", release: profile.installedSha, updated: Date.now(), backups };
    verifiedWrite(ns, TRANSACTION, JSON.stringify(journal));
    stopMatrix(ns);
    for (const w of writes) verifiedWrite(ns, w.path, w.content);
    journal.phase = "installed";
    // Installed means verified file promotion, not runtime health certification.
    verifiedWrite(ns, TRANSACTION, JSON.stringify(journal));
}

/** SHA-256 of UTF-8 source, with no DOM, crypto service or Netscript RAM cost. */
export function sha256(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    const length = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const high = Math.floor(length / 4294967296), low = length >>> 0;
    for (const word of [high, low]) for (let n = 24; n >= 0; n -= 8) bytes.push((word >>> n) & 255);
    const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let offset = 0; offset < bytes.length; offset += 64) {
        const w = new Array(64);
        for (let i = 0; i < 16; i++) w[i] = (bytes[offset+i*4]<<24)|(bytes[offset+i*4+1]<<16)|(bytes[offset+i*4+2]<<8)|bytes[offset+i*4+3];
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3);
            const s1 = rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);
            w[i] = (w[i-16]+s0+w[i-7]+s1)|0;
        }
        let [a,b,c,d,e,f,g,z] = h;
        for (let i = 0; i < 64; i++) {
            const t1 = (z+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0;
            const t2 = ((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))|0;
            z=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
        }
        [a,b,c,d,e,f,g,z].forEach((v,i) => h[i]=(h[i]+v)|0);
    }
    return h.map(x => (x>>>0).toString(16).padStart(8,"0")).join("");
}
