import { config, event, fetchLatestInstaller, writeState, getDirectives } from "/matrix/lib/common.js";
import { scanAll, tryRoot } from "/matrix/lib/network.js";

const EARLY = "/matrix/workers/early.js";
const UPDATE_REQUEST = "/matrix/state/update-request.txt";
const INSTALLER = "/matrix/remote-install.js";
const INSTALLED_STAGE = "/matrix/state/installed-stage.txt";

function scoreTarget(ns, host, mode = "money") {
    if (!ns.hasRootAccess(host) || ns.getServerMaxMoney(host) <= 0) return -1;
    if (ns.getServerRequiredHackingLevel(host) > ns.getHackingLevel()) return -1;
    const hackTime = Math.max(1, ns.getHackTime(host));
    if (mode === "xp") return ns.getServerRequiredHackingLevel(host) / hackTime;
    return ns.getServerMoneyAvailable(host) / hackTime;
}

function sameScript(a, b) {
    return String(a).replace(/^\/+/, "") === String(b).replace(/^\/+/, "");
}

async function deploy(ns, hosts, target) {
    const ram = ns.getScriptRam(EARLY, "home");
    let threads = 0;
    for (const host of hosts) {
        if (!ns.hasRootAccess(host)) continue;
        const max = ns.getServerMaxRam(host);
        if (max < ram) continue;
        if (host !== "home") await ns.scp(EARLY, host, "home");
        for (const process of ns.ps(host)) {
            if (sameScript(process.filename, EARLY) && String(process.args[0]) !== target) ns.kill(process.pid);
        }
        const existing = ns.ps(host).filter(process => sameScript(process.filename, EARLY) && String(process.args[0]) === target);
        if (existing.length) {
            threads += existing.reduce((sum, process) => sum + process.threads, 0);
            continue;
        }
        const reserve = host === "home" ? 2 : 0;
        const count = Math.floor((max - ns.getServerUsedRam(host) - reserve) / ram);
        if (count > 0 && ns.exec(EARLY, host, count, target)) threads += count;
    }
    return threads;
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

    const targetCash = 3_000_000;
    const nextStep = "32 GB RAM Full Deck Upgrade";
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

    ns.print(`╔══════════════════════════════════════════════════════════╗`);
    ns.print(`║  M A T R I X  //  E A R L Y   E N G I N E (1 6 G B)     ║`);
    ns.print(`╠══════════════════════════════════════════════════════════╣`);
    ns.print(`║  ${spin} STAGE       : DISTRIBUTED EARLY                        ║`);
    ns.print(`║  🎯 TARGET      : ${state.target.padEnd(20)}                   ║`);
    ns.print(`║  ⚙️ WORKERS     : ${String(state.threads).padEnd(6)} THREADS                    ║`);
    ns.print(`║  💵 CAPITAL     : $${moneyStr.padEnd(19)}                   ║`);
    ns.print(`║  🌐 BOTNET      : [${bar}] ${String(state.rooted).padStart(2)}/${String(state.discovered).padEnd(2)} ║`);
    ns.print(`║  💻 HOME RAM    : ${maxRam.padEnd(8)}                              ║`);
    ns.print(`╠══════════════════════════════════════════════════════════╣`);
    ns.print(`║  ⏱️ NEXT STEP   : ${nextLine.slice(0, 38).padEnd(38)} ║`);
    ns.print(`║  ⏳ EST. TIME   : ${etaStr.padEnd(38)} ║`);
    ns.print(`╚══════════════════════════════════════════════════════════╝`);
}

async function handoffInstaller(ns, requested) {
    if (!requested) return false;
    if (!await fetchLatestInstaller(ns, INSTALLER)) return false;
    ns.rm(UPDATE_REQUEST, "home");
    ns.ui.closeTail();
    ns.spawn(INSTALLER, { threads: 1, spawnDelay: 0 }, "--stage");
    return true;
}

export async function main(ns) {
    ns.disableLog("ALL");
    const older = ns.ps("home").some(process =>
        sameScript(process.filename, "/matrix/early.js") && process.pid !== ns.pid && process.pid < ns.pid
    );
    if (older) {
        try { ns.ui.closeTail(); } catch {}
        return;
    }
    try { ns.tail(); } catch {}
    try { ns.ui.setTailTitle("MATRIX // DISTRIBUTED EARLY ENGINE"); } catch {}
    try { ns.ui.resizeTail(620, 390); } catch {}
    try { ns.ui.openTail(); } catch {}
    await event(ns, "early", "Distributed early engine online", "success");

    while (true) {
        try {
            if (await handoffInstaller(ns, ns.fileExists(UPDATE_REQUEST, "home"))) return;
            const cfg = config(ns);
            if (ns.getServerMaxRam("home") < 32 && ns.read(INSTALLED_STAGE) !== "early") {
                if (await handoffInstaller(ns, true)) return;
            }
            if (ns.getServerMaxRam("home") >= 32) {
                if (await handoffInstaller(ns, true)) return;
            }
            const { hosts } = scanAll(ns);
            let rooted = 0;
            for (const host of hosts) {
                if (cfg.automation?.rooting !== false) tryRoot(ns, host);
                if (ns.hasRootAccess(host)) rooted++;
            }
            const mode = getDirectives(ns)?.directives?.hacking === "xp" ? "xp" : "money";
            const target = hosts.map(host => ({ host, score: scoreTarget(ns, host, mode) })).filter(item => item.score > 0)
                .sort((a, b) => b.score - a.score)[0]?.host ?? "n00dles";
            const threads = await deploy(ns, hosts, target);
            const state = { status: "online", phase: "early", target, threads, discovered: hosts.length, rooted };
            await writeState(ns, "early", state);
            draw(ns, state);
            await ns.sleep(5000);
        } catch (error) {
            await writeState(ns, "early", { status: "error", error: String(error) });
            ns.clearLog();
            ns.print("MATRIX // EARLY ENGINE RECOVERING");
            ns.print(String(error));
            await ns.sleep(2000);
        }
    }
}
