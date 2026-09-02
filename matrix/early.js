import { config, event, fetchLatestInstaller, writeState } from "/matrix/lib/common.js";
import { scanAll, tryRoot } from "/matrix/lib/network.js";

const EARLY = "/matrix/workers/early.js";
const UPDATE_REQUEST = "/matrix/state/update-request.txt";
const INSTALLER = "/matrix/remote-install.js";
const INSTALLED_STAGE = "/matrix/state/installed-stage.txt";

function scoreTarget(ns, host) {
    if (!ns.hasRootAccess(host) || ns.getServerMaxMoney(host) <= 0) return -1;
    if (ns.getServerRequiredHackingLevel(host) > ns.getHackingLevel()) return -1;
    return ns.getServerMoneyAvailable(host) / Math.max(1, ns.getHackTime(host));
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

function draw(ns, state) {
    ns.clearLog();
    const spin = SPINNER[(tick++) % SPINNER.length];
    const moneyStr = ns.format.number(ns.getServerMoneyAvailable("home"), 2);
    const maxRam = ns.format.ram(ns.getServerMaxRam("home"));
    const rootPct = Math.floor((state.rooted / Math.max(1, state.discovered)) * 16);
    const bar = "█".repeat(rootPct) + "░".repeat(16 - rootPct);

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
    ns.print(`║  32 GB -> Unlocks HWGW Scheduler & React Command Deck     ║`);
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
            const target = hosts.map(host => ({ host, score: scoreTarget(ns, host) })).filter(item => item.score > 0)
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
