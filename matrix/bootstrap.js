const LOCK = "/matrix/state/bootstrap-lock.txt";
const STATE = "/matrix/state/bootstrap.txt";
const UPDATE_REQUEST = "/matrix/state/update-request.txt";
const INSTALLER = "/matrix/remote-install.js";
const INSTALLED_STAGE = "/matrix/state/installed-stage.txt";
const COMMIT_API = "https://api.github.com/repos/evilguard1/Matrix-OS/commits/main";
const RELEASE_META = "/matrix/state/release-metadata.txt";
// Netscript port the worm publishes botnet status on (see matrix/worm/spread.js).
const WORM_PORT = 1;

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


// The tail renders emoji two columns wide, but padEnd() counts code points, so
// every emoji row used to overshoot the right border. Measure display width.
// The worm reports botnet status on netscript port 1. Ports cost 0 GB and are
// global across hosts, which is the only reason a worm running on foodnstuff
// can tell an 8 GB home what it is doing. No report, or one older than 90s,
// means the botnet is not up yet.
function readWorm(ns) {
    try {
        const raw = ns.peek(WORM_PORT);
        if (!raw || raw === "NULL PORT DATA") return null;
        const parsed = JSON.parse(raw);
        return Date.now() - Number(parsed.updated ?? 0) < 90_000 ? parsed : null;
    } catch {
        return null;
    }
}

// Duplicated from matrix/lib/capabilities.js on purpose: bootstrap must stay
// import-free because Bitburner bills an import's RAM to the importer, and
// this whole file has to fit an 8 GB home.
function homeRamUpgradeCost(ram) { return ram * 32000 * Math.pow(1.58, Math.log2(ram)); }
function serverCost(ram) { return ram * 55000; }
function money(n) {
    const a = Math.abs(n);
    for (const [s, v] of [["b", 1e9], ["m", 1e6], ["k", 1e3]]) if (a >= v) return `$${(a / v).toFixed(2)}${s}`;
    return `$${Math.round(a)}`;
}

const WIDTH = 58;
function cols(text) {
    let n = 0;
    for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp === 0xFE0F || cp === 0x200D) continue;
        n += (cp >= 0x1F300 && cp <= 0x1FAFF)
            || (cp >= 0x2600 && cp <= 0x27BF)
            || (cp >= 0x23E9 && cp <= 0x23FA)
            || (cp >= 0x2B00 && cp <= 0x2BFF) ? 2 : 1;
    }
    return n;
}
// Clip to display columns, never code points, so a long value can not punch a
// hole in the right border.
function clip(text, max) {
    let out = "";
    let n = 0;
    for (const ch of text) {
        const w = cols(ch);
        if (n + w > max) break;
        out += ch;
        n += w;
    }
    return out;
}
function row(icon, label, value) {
    const prefix = `  ${icon} ${label.padEnd(11)} : `;
    const body = prefix + clip(String(value), WIDTH - cols(prefix));
    return `║${body}${" ".repeat(Math.max(0, WIDTH - cols(body)))}║`;
}
function center(text) {
    const pad = WIDTH - cols(text);
    const left = Math.floor(pad / 2);
    return " ".repeat(left) + text + " ".repeat(pad - left);
}
function rule(title) {
    if (!title) return `╠${"═".repeat(WIDTH)}╣`;
    const pad = WIDTH - cols(title) - 2;
    const left = Math.floor(pad / 2);
    return `╠${"═".repeat(left)} ${title} ${"═".repeat(pad - left)}╣`;
}

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

    // Track the real Home RAM price, not a hardcoded round number, and say who
    // has to buy it. MATRIX cannot: that needs Singularity (Source-File 4).
    const targetCash = homeRamUpgradeCost(ns.getServerMaxRam("home"));
    const nextStep = `${ns.getServerMaxRam("home") * 2} GB Home RAM (manual)`;

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

    const worm = state.worm ?? null;
    const wormFill = worm ? Math.floor((worm.infected / Math.max(1, worm.rooted)) * 16) : 0;
    const wormBar = "█".repeat(wormFill) + "░".repeat(16 - wormFill);
    const wormCount = worm ? `${worm.infected}/${worm.rooted} INFECTED` : "SEEDING...";
    const droneStr = worm
        ? `${worm.drones} drones  │  ${ns.format.ram(worm.botnetUsed)} / ${ns.format.ram(worm.botnetRam)}`
        : "awaiting first worm report";
    const swarmStr = worm ? `${worm.target} via ${worm.nodes} relay node(s)` : "--";

    // Nothing on an 8 GB save can buy Home RAM or programs for you: those need
    // Singularity (Source-File 4). Say so plainly and give the exact price.
    const cash = ns.getServerMoneyAvailable("home");
    const homeRam = ns.getServerMaxRam("home");
    const ramCost = homeRamUpgradeCost(homeRam);
    const serverBuy = serverCost(8);
    const buyLine = `${money(serverBuy)}  8GB server @ Alpha Ent.`;
    const ramLine = `${money(ramCost)}  ${homeRam * 2}GB home @ Alpha Ent.`;
    const buyIcon = cash >= serverBuy ? "🟢" : "⚪";
    const ramIcon = cash >= ramCost ? "🟢" : "⚪";
    ns.print(`╔${"═".repeat(WIDTH)}╗`);
    ns.print(`║${center("M A T R I X  //  F R E S H - S A V E   K E R N E L")}║`);
    ns.print(rule());
    ns.print(row(spin, "STAGE", "BOOTSTRAP / 8 GB"));
    ns.print(row("🎯", "TARGET", state.target));
    ns.print(row(spin, "ACTION", state.action.toUpperCase()));
    ns.print(row("💵", "CAPITAL", `$${moneyStr}`));
    ns.print(row("🌐", "NETWORK", `[${bar}] ${state.rooted}/${state.discovered} rooted`));
    ns.print(row("💻", "HOME RAM", `${maxRam}  │  HACK SKILL: ${hackLvl}`));
    ns.print(row("🔓", "PORTS", `${ports}/5 port crackers owned`));
    ns.print(row("🔑", "NEXT CRACK", crackerStr));
    ns.print(rule("B O T N E T"));
    ns.print(row("🐛", "SPREAD", `[${wormBar}] ${wormCount}`));
    ns.print(row("🤖", "DRONES", droneStr));
    ns.print(row("🕸️", "SWARM TGT", swarmStr));
    ns.print(rule("M A N U A L   A C T I O N S"));
    ns.print(row(buyIcon, "BUY SERVER", buyLine));
    ns.print(row(ramIcon, "HOME RAM", ramLine));
    ns.print(rule());
    ns.print(row("⏱️", "NEXT STEP", nextLine));
    ns.print(row("⏳", "EST. TIME", etaStr));
    ns.print(`╚${"═".repeat(WIDTH)}╝`);
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
    try { ns.ui.resizeTail(640, 560); } catch {}
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
                worm: readWorm(ns),
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
