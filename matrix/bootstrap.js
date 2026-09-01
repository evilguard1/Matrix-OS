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
        const scoreA = ns.getServerMoneyAvailable(a) / Math.max(1, ns.getServerRequiredHackingLevel(a));
        const scoreB = ns.getServerMoneyAvailable(b) / Math.max(1, ns.getServerRequiredHackingLevel(b));
        return scoreB - scoreA;
    });
    return candidates[0] ?? "n00dles";
}

export function chooseStarterAction(money, maxMoney, security, minSecurity) {
    if (maxMoney > 0 && money <= maxMoney * 0.005) return "grow";
    if (security >= 95 && security > minSecurity + 5) return "weaken";
    return "hack";
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let tick = 0;
let lastCash = 0;
let lastTime = 0;
let cashRate = 0;


function draw(ns, state) {
    ns.clearLog();
    const spin = SPINNER[(tick++) % SPINNER.length];
    const currentCash = ns.getServerMoneyAvailable("home");
    const moneyStr = ns.format.number(currentCash, 2);
    const maxRam = ns.format.ram(ns.getServerMaxRam("home"));
    const hackLvl = ns.getHackingLevel();
    const rootPct = Math.floor((state.rooted / Math.max(1, state.discovered)) * 16);
    const bar = "█".repeat(rootPct) + "░".repeat(16 - rootPct);

    const now = Date.now();
    if (lastTime > 0 && now > lastTime) {
        const dt = (now - lastTime) / 1000;
        const diff = currentCash - lastCash;
        if (dt > 0 && diff >= 0) {
            const currentRate = diff / dt;
            cashRate = cashRate === 0 ? currentRate : (cashRate * 0.7 + currentRate * 0.3);
        }
    }
    lastCash = currentCash;
    lastTime = now;

    let targetCash = 1_000_000;
    let nextStep = "16 GB RAM Upgrade";
    if (currentCash >= 1_000_000) {
        targetCash = 3_000_000;
        nextStep = "32 GB Full Deck Upgrade";
    }

    let etaStr = "READY";
    if (currentCash < targetCash) {
        if (cashRate > 0) {
            const secs = Math.ceil((targetCash - currentCash) / cashRate);
            etaStr = secs < 60 ? `~${secs}s` : `~${Math.floor(secs / 60)}m ${secs % 60}s`;
        } else {
            etaStr = "CALCULATING...";
        }
    }

    const nextLine = `Reaching $${ns.format.number(targetCash, 2)} for ${nextStep}`;

    const CRACKERS = [
        { file: "BruteSSH.exe", lvl: 50 },
        { file: "FTPCrack.exe", lvl: 100 },
        { file: "relaySMTP.exe", lvl: 250 },
        { file: "HTTPWorm.exe", lvl: 500 },
        { file: "SQLInject.exe", lvl: 750 },
    ];
    const ports = CRACKERS.filter(c => ns.fileExists(c.file, "home")).length;
    const nextCracker = CRACKERS.find(c => !ns.fileExists(c.file, "home"));
    const crackerStr = nextCracker
        ? (hackLvl >= nextCracker.lvl ? `CREATE ${nextCracker.file} NOW!` : `${nextCracker.file} @ Hack ${nextCracker.lvl} (${nextCracker.lvl - hackLvl} to go)`)
        : "ALL PORT CRACKERS OWNED";

    ns.print(`╔══════════════════════════════════════════════════════════╗`);
    ns.print(`║  M A T R I X  //  F R E S H - S A V E   K E R N E L      ║`);
    ns.print(`╠══════════════════════════════════════════════════════════╣`);
    ns.print(`║  ${spin} STAGE       : BOOTSTRAP / 8 GB                         ║`);
    ns.print(`║  🎯 TARGET      : ${state.target.padEnd(20)}                   ║`);
    ns.print(`║  ${spin} ACTION      : ${state.action.toUpperCase().padEnd(38)} ║`);
    ns.print(`║  💵 CAPITAL     : $${moneyStr.padEnd(19)}                   ║`);
    ns.print(`║  🌐 NETWORK     : [${bar}] ${String(state.rooted).padStart(2)}/${String(state.discovered).padEnd(2)} ║`);
    ns.print(`║  💻 HOME RAM    : ${maxRam.padEnd(8)}  │  HACK SKILL: ${String(hackLvl).padEnd(6)}  ║`);
    ns.print(`║  🔓 PORTS       : ${String(ports)}/5 crackers  │  ${crackerStr.slice(0, 26).padEnd(26)} ║`);
    ns.print(`╠══════════════════════════════════════════════════════════╣`);
    ns.print(`║  ⏱️ NEXT STEP   : ${nextLine.slice(0, 38).padEnd(38)} ║`);
    ns.print(`║  ⏳ EST. TIME   : ${etaStr.padEnd(38)} ║`);
    ns.print(`╚══════════════════════════════════════════════════════════╝`);
}


async function handoffInstaller(ns, requested) {
    if (!requested) return false;
    const stamp = Date.now();
    let sha = "main";
    if (await ns.wget(`${COMMIT_API}?t=${stamp}`, RELEASE_META, "home")) {
        try {
            const parsed = String(JSON.parse(ns.read(RELEASE_META)).sha ?? "");
            if (/^[a-f0-9]{40}$/i.test(parsed)) sha = parsed;
        } catch {}
    }
    const installerUrl = `https://raw.githubusercontent.com/evilguard1/Matrix-OS/${sha}/install.js`;
    if (!await ns.wget(installerUrl, INSTALLER, "home")) return false;
    ns.rm(UPDATE_REQUEST, "home");
    ns.ui.closeTail();
    ns.spawn(INSTALLER, { threads: 1, spawnDelay: 0 }, "--stage");
    return true;
}

export async function main(ns) {
    ns.disableLog("ALL");
    // Validate the lock PID is actually running THIS script, not just any process
    const lockPid = Number(ns.read(LOCK));
    if (lockPid && lockPid !== ns.pid) {
        const isBootstrap = ns.ps("home").some(p => p.pid === lockPid && String(p.filename).includes("bootstrap"));
        if (isBootstrap) return;
    }
    await ns.write(LOCK, String(ns.pid), "w");
    try { ns.tail(); } catch {}
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
            const action = chooseStarterAction(money, maxMoney, security, minSecurity);
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
