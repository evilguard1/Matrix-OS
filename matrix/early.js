import { config, event, fetchLatestInstaller, writeState, getDirectives } from "/matrix/lib/common.js";
import { scanAll, tryRoot } from "/matrix/lib/network.js";
import { top, bottom, rule, row, center, bar, readWorm } from "/matrix/lib/hud.js";
import { manualActions, singularityReady, nextPortProgram, formatCost, PORT_PROGRAMS } from "/matrix/lib/capabilities.js";
import { dispatchContracts } from "/matrix/lib/dispatch.js";

const EARLY = "/matrix/workers/early.js";
const UPDATE_REQUEST = "/matrix/state/update-request.txt";
const INSTALLER = "/matrix/remote-install.js";
const INSTALLED_STAGE = "/matrix/state/installed-stage.txt";

// Contracts already dispatched, so one is never attempted twice.
const dispatchedContracts = new Set();

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

function etaFor(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "CALCULATING...";
    if (seconds < 60) return `~${Math.ceil(seconds)}s`;
    if (seconds < 3600) return `~${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
    return `~${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function draw(ns, state) {
    ns.clearLog();
    const spin = SPINNER[(tick++) % SPINNER.length];
    const currentCash = ns.getServerMoneyAvailable("home");

    const now = Date.now();
    if (lastTime > 0 && now > lastTime) {
        const dt = (now - lastTime) / 1000;
        const diff = currentCash - lastCash;
        if (dt > 0 && diff >= 0) {
            const rate = diff / dt;
            cashRate = cashRate === 0 ? rate : (cashRate * 0.7 + rate * 0.3);
        }
    }
    lastCash = currentCash;
    lastTime = now;

    const worm = state.worm;
    const actions = state.actions ?? [];
    // The milestone is whatever the player has to buy next, so the countdown is
    // an ETA to an action they can actually take.
    const goal = actions.find(a => !a.ready) ?? actions[0] ?? null;
    const etaStr = !goal || currentCash >= goal.cost ? "READY"
        : cashRate > 0 ? etaFor((goal.cost - currentCash) / cashRate)
        : "CALCULATING...";

    ns.print(top());
    ns.print(center("M A T R I X  //  E A R L Y   E N G I N E"));
    ns.print(rule());
    ns.print(row(spin, "STAGE", state.wormOwned ? "DISTRIBUTED EARLY / WORM-FED" : "DISTRIBUTED EARLY"));
    ns.print(row("🎯", "TARGET", state.target));
    ns.print(row("💵", "CAPITAL", `$${ns.format.number(currentCash, 2)}`));
    ns.print(row("🌐", "NETWORK", `[${bar(state.rooted / Math.max(1, state.discovered))}] ${state.rooted}/${state.discovered} rooted`));
    ns.print(row("💻", "HOME RAM", `${ns.format.ram(ns.getServerMaxRam("home"))}  │  HACK SKILL: ${ns.getHackingLevel()}`));
    ns.print(row("🔑", "NEXT CRACK", state.crackerLine));
    ns.print(row("📜", "CONTRACTS", state.contracts?.found
        ? `${state.contracts.found} found  │  ${state.contracts.sent} solver(s) dispatched`
        : "none on the network right now"));
    ns.print(rule("B O T N E T"));
    if (worm) {
        ns.print(row("🐛", "SPREAD", `[${bar(worm.infected / Math.max(1, worm.rooted))}] ${worm.infected}/${worm.rooted} INFECTED`));
        ns.print(row("🤖", "DRONES", `${worm.drones} drones  │  ${ns.format.ram(worm.botnetUsed)} / ${ns.format.ram(worm.botnetRam)}`));
        ns.print(row("🕸️", "SWARM TGT", `${worm.target} via ${worm.nodes} relay node(s)`));
    } else {
        ns.print(row("⚙️", "WORKERS", `${state.threads} threads deployed from home`));
        ns.print(row("🐛", "SPREAD", "worm offline - home is orchestrating"));
        ns.print(row("🕸️", "SWARM TGT", state.target));
    }

    ns.print(rule(state.singularity ? "A U T O M A T E D" : "M A N U A L   A C T I O N S"));
    if (state.singularity) {
        ns.print(row("✅", "SINGULARITY", "available - MATRIX buys these itself"));
    } else if (!actions.length) {
        ns.print(row("✅", "NOTHING", "no player action outstanding"));
    } else {
        for (const action of actions.slice(0, 3)) {
            ns.print(row(action.ready ? "🟢" : "⚪", action.tag,
                `${action.cost > 0 ? formatCost(action.cost) + "  " : ""}${action.short}`));
        }
    }

    ns.print(rule());
    ns.print(row("⏱️", "NEXT STEP", goal ? `${goal.label} - ${goal.detail}` : "accumulating capital"));
    ns.print(row("⏳", "EST. TIME", etaStr));
    ns.print(bottom());
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
    // Same fragile pattern the dashboard suffered from - ns.ps liveness. Kept
    // here because early.js is spawned once by the kernel rather than polled
    // every 5s by a supervisor, so a missed detection cannot compound.
    const older = ns.ps("home").some(process =>
        sameScript(process.filename, "/matrix/early.js") && process.pid !== ns.pid && process.pid < ns.pid
    );
    if (older) {
        try { ns.ui.closeTail(); } catch {}
        return;
    }
    try { ns.tail(); } catch {}
    try { ns.ui.setTailTitle("MATRIX // DISTRIBUTED EARLY ENGINE"); } catch {}
    try { ns.ui.resizeTail(640, 520); } catch {}
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

            // The worm owns the botnet whenever it is alive: it places drones from
            // inside the network and costs home nothing. Home only orchestrates as a
            // fallback, so a dead worm can never mean dead income.
            const worm = readWorm(ns);
            const threads = worm ? 0 : await deploy(ns, hosts, target);

            // Coding contracts are among the best early income in the game and
            // this stage already owns scp and exec, so finding them costs only ls.
            // The 21.6 GB solver runs out on the network, never on home.
            let contracts = { found: 0, sent: 0 };
            if (cfg.automation?.contracts !== false) {
                try { contracts = dispatchContracts(ns, hosts, dispatchedContracts); } catch {}
                if (contracts.sent) await event(ns, "early", `Dispatched ${contracts.sent} contract solver(s)`, "success");
            }

            const singularity = singularityReady(ns.getResetInfo());
            const owned = PORT_PROGRAMS.filter(p => ns.fileExists(p.file, "home")).map(p => p.file);
            const hackingLevel = ns.getHackingLevel();
            const nextCracker = nextPortProgram(owned, hackingLevel);
            const crackerLine = !nextCracker ? "all port crackers owned"
                : nextCracker.canCreate ? `CREATE ${nextCracker.file} NOW (free)`
                : `${nextCracker.file} @ Hacking ${nextCracker.level} (${nextCracker.levelsToGo} to go)`;

            const actions = manualActions({
                homeRam: ns.getServerMaxRam("home"),
                cash: ns.getServerMoneyAvailable("home"),
                hackingLevel, ownedPrograms: owned, singularity, cloudAutomated: false,
            });

            const state = {
                status: "online", phase: "early", target, threads,
                discovered: hosts.length, rooted,
                worm, wormOwned: Boolean(worm), singularity, actions, crackerLine, contracts,
            };
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
