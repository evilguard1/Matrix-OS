const LOCK = "/matrix/state/bootstrap-lock.txt";
const STATE = "/matrix/state/bootstrap.txt";
const UPDATE_REQUEST = "/matrix/state/update-request.txt";
const INSTALLER = "/matrix/remote-install.js";
const INSTALLED_STAGE = "/matrix/state/installed-stage.txt";
const COMMIT_API = "https://api.github.com/repos/evilguard1/Matrix-OS/commits/main";
const RELEASE_META = "/matrix/state/release-metadata.txt";

export function scanNetwork(ns) {
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

export function tryRoot(ns, host) {
    if (host === "home" || ns.hasRootAccess(host)) return true;
    const files = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"];
    if (files.filter(file => ns.fileExists(file, "home")).length < ns.getServerNumPortsRequired(host)) return false;
    if (ns.fileExists("BruteSSH.exe", "home")) try { ns.brutessh(host); } catch {}
    if (ns.fileExists("FTPCrack.exe", "home")) try { ns.ftpcrack(host); } catch {}
    if (ns.fileExists("relaySMTP.exe", "home")) try { ns.relaysmtp(host); } catch {}
    if (ns.fileExists("HTTPWorm.exe", "home")) try { ns.httpworm(host); } catch {}
    if (ns.fileExists("SQLInject.exe", "home")) try { ns.sqlinject(host); } catch {}
    try { ns.nuke(host); } catch {}
    return ns.hasRootAccess(host);
}

export function chooseTarget(ns, hosts) {
    const level = ns.getHackingLevel();
    const candidates = hosts.filter(host =>
        host !== "home" && ns.hasRootAccess(host) && ns.getServerMaxMoney(host) > 0 &&
        ns.getServerRequiredHackingLevel(host) <= level
    );
    candidates.sort((a, b) => {
        const scoreA = ns.getServerMaxMoney(a) / Math.max(1, ns.getServerRequiredHackingLevel(a));
        const scoreB = ns.getServerMaxMoney(b) / Math.max(1, ns.getServerRequiredHackingLevel(b));
        return scoreB - scoreA;
    });
    return candidates[0] ?? "n00dles";
}

function draw(ns, state) {
    ns.clearLog();
    ns.print("MATRIX // FRESH-SAVE KERNEL");
    ns.print("========================================");
    ns.print("PHASE       : BOOTSTRAP / 8 GB");
    ns.print(`STATUS      : ${state.action.toUpperCase()}`);
    ns.print(`TARGET      : ${state.target}`);
    ns.print(`MONEY       : ${ns.format.number(ns.getServerMoneyAvailable("home"), 2)}`);
    ns.print(`NETWORK     : ${state.rooted}/${state.discovered} ROOTED`);
    ns.print(`HOME RAM    : ${ns.format.ram(ns.getServerMaxRam("home"))}`);
    ns.print(`HACK LEVEL  : ${ns.getHackingLevel()}`);
    ns.print("----------------------------------------");
    ns.print("MATRIX is actively hacking while this window is open.");
    ns.print("16 GB unlocks distributed workers; 32 GB unlocks full MATRIX.");
}

async function handoffInstaller(ns, requested) {
    if (!requested) return false;
    const stamp = Date.now();
    if (!await ns.wget(`${COMMIT_API}?t=${stamp}`, RELEASE_META, "home")) return false;
    let sha = "";
    try { sha = String(JSON.parse(ns.read(RELEASE_META)).sha ?? ""); } catch {}
    if (!/^[a-f0-9]{40}$/i.test(sha)) return false;
    if (!await ns.wget(`https://raw.githubusercontent.com/evilguard1/Matrix-OS/${sha}/install.js`, INSTALLER, "home")) return false;
    ns.rm(UPDATE_REQUEST, "home");
    ns.ui.closeTail();
    ns.spawn(INSTALLER, { threads: 1, spawnDelay: 0 }, "--stage");
    return true;
}

export async function main(ns) {
    ns.disableLog("ALL");
    const lockPid = Number(ns.read(LOCK));
    if (lockPid && lockPid !== ns.pid && ns.isRunning(lockPid)) return;
    await ns.write(LOCK, String(ns.pid), "w");
    try { ns.ui.setTailTitle("MATRIX // FRESH-SAVE KERNEL"); } catch {}
    try { ns.ui.resizeTail(620, 390); } catch {}
    try { ns.ui.openTail(); } catch {}

    while (true) {
        try {
            if (await handoffInstaller(ns, ns.fileExists(UPDATE_REQUEST, "home"))) return;
            if (ns.getServerMaxRam("home") < 16 && ns.read(INSTALLED_STAGE) !== "bootstrap") {
                if (await handoffInstaller(ns, true)) return;
            }
            if (ns.getServerMaxRam("home") >= 16) {
                if (await handoffInstaller(ns, true)) return;
            }
            const hosts = scanNetwork(ns);
            let rooted = 0;
            for (const host of hosts) {
                tryRoot(ns, host);
                if (ns.hasRootAccess(host)) rooted++;
            }
            const target = chooseTarget(ns, hosts);
            const security = ns.getServerSecurityLevel(target);
            const minSecurity = ns.getServerMinSecurityLevel(target);
            const money = ns.getServerMoneyAvailable(target);
            const maxMoney = ns.getServerMaxMoney(target);
            let action = "hack";
            if (security > minSecurity + 5) action = "weaken";
            else if (maxMoney > 0 && money < maxMoney * 0.80) action = "grow";
            const state = {
                status: "online", phase: "bootstrap", action, target,
                discovered: hosts.length, rooted, homeRam: ns.getServerMaxRam("home"), updated: Date.now(),
            };
            await ns.write(STATE, JSON.stringify(state), "w");
            draw(ns, state);
            if (action === "weaken") await ns.weaken(target);
            else if (action === "grow") await ns.grow(target);
            else await ns.hack(target);
        } catch (error) {
            const state = { status: "error", phase: "bootstrap", error: String(error), updated: Date.now() };
            await ns.write(STATE, JSON.stringify(state), "w");
            ns.clearLog();
            ns.print("MATRIX // BOOTSTRAP RECOVERING");
            ns.print(String(error));
            await ns.sleep(2000);
        }
    }
}
