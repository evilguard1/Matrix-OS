import { config } from "/matrix/lib/common.js";
import { resetEpoch } from "/matrix/lib/state.js";
import { scanAll, routeTo, tryRoot } from "/matrix/lib/network.js";
import { HACKING_ROUTES, routeStatus } from "/matrix/lib/backdoor-route.js";
import { claimTerminal, releaseTerminal, terminalLease, attachTerminalChild, markTerminalReturned } from "/matrix/lib/terminal-lease.js";
import { task, active } from "/matrix/lib/singularity-tasks.js";

const STATE = "/matrix/state/backdoor-route.txt";
const CHILD = "/matrix/workers/backdoor-install.js";
function persist(ns, value) {
    const text = JSON.stringify({...value, schemaVersion:1, resetEpoch:resetEpoch(ns.getResetInfo()), updated:Date.now()});
    const result = ns.write(STATE, text, "w");
    if (result?.then || ns.read(STATE) !== text) throw new Error("route-journal-write-failed");
    return value;
}

export async function advanceBackdoors(ns) {
    const cfg = config(ns);
    if (!active(ns) || cfg.progression?.autoBackdoors === false) return persist(ns, {status:"paused"});
    const {hosts, parent} = scanAll(ns);
    const level = ns.getHackingLevel();
    const configured = cfg.progression?.maxBackdoorTimeMs ?? 120000;
    if (!Number.isFinite(configured) || configured <= 0) return persist(ns, {status:"invalid-duration-limit"});
    const limit = Math.min(120000, configured);
    const routes = HACKING_ROUTES.map(route => {
        let server = null, durationMs = null;
        if (hosts.includes(route.target)) {
            if (cfg.automation?.rooting !== false) tryRoot(ns, route.target);
            server = ns.getServer(route.target);
            durationMs = ns.getHackTime(route.target) / 4;
        }
        return {...route, requiredLevel:server?.requiredHackingSkill ?? null, level, durationMs,
            status:routeStatus(server, level, durationMs, limit)};
    });
    const next = routes.find(route => route.status === "ready");
    if (!next) return persist(ns, {status:routes.every(r=>r.status === "installed") ? "complete" : "blocked", routes});
    if (terminalLease(ns)) return persist(ns, {status:"terminal-busy", routes});
    // An interactive connection elsewhere is not ours to move. Player faction
    // work continues: installBackdoor in 3.0.1 does not replace that activity.
    if (ns.singularity.getCurrentServer() !== "home") return persist(ns, {status:"manual-connection", routes});
    const lease = claimTerminal(ns, next.target, next.durationMs);
    if (!lease) return persist(ns, {status:"terminal-busy", routes});
    let connected = "home";
    let childPid = 0;
    try {
        persist(ns, {status:"connecting", target:next.target, faction:next.faction, routes, lease:lease.token});
        const route = routeTo(parent, next.target);
        if (route[0] !== "home" || route.at(-1) !== next.target) throw new Error("no-network-route");
        for (const host of route.slice(1)) {
            if (!ns.singularity.connect(host)) throw new Error(`connect-refused:${host}`);
            connected = host;
        }
        if (!active(ns) || ns.singularity.getCurrentServer() !== next.target) throw new Error("precondition-changed");
        persist(ns, {status:"installing", target:next.target, faction:next.faction, routes, lease:lease.token});
        childPid = ns.run(CHILD, 1, next.target, lease.token, lease.resetEpoch);
        if (!childPid) throw new Error("backdoor-child-launch-refused");
        attachTerminalChild(ns, lease, childPid);
        const alive = () => ns.ps("home").some(p=>p.pid === childPid && String(p.filename).replace(/^\/+/, "") === CHILD.slice(1));
        while (alive()) {
            let receipt; try { receipt = JSON.parse(ns.read("/matrix/state/backdoor-install.txt")); } catch {}
            // The child has captured its native target before our next turn.
            if (receipt?.token === lease.token && receipt.status === "installing" && connected === next.target &&
                ns.singularity.getCurrentServer() === connected && ns.singularity.connect("home")) {
                connected = "home";
                markTerminalReturned(ns, lease);
            }
            await ns.sleep(50);
        }
        const receipt = JSON.parse(ns.read("/matrix/state/backdoor-install.txt") || "null");
        if (receipt?.token !== lease.token || receipt.pid !== childPid || receipt.status !== "succeeded") throw new Error("backdoor-child-missing-success");
        if (resetEpoch(ns.getResetInfo()) !== lease.resetEpoch) throw new Error("reset-during-backdoor");
        if (!ns.getServer(next.target).backdoorInstalled) throw new Error("backdoor-postcondition-failed");
        next.status = "installed";
        return persist(ns, {status:"succeeded", target:next.target, faction:next.faction, routes, lease:lease.token});
    } catch (error) {
        persist(ns, {status:"failed", target:next.target, routes, error:String(error)});
        throw error;
    } finally {
        // Preserve a manual connection made while the native promise was pending.
        try {
            if (resetEpoch(ns.getResetInfo()) === lease.resetEpoch && ns.singularity.getCurrentServer() === connected && connected !== "home") {
                if (!ns.singularity.connect("home")) throw new Error("return-home-refused");
            }
        } finally {
            // A crash/exception cannot release a still-running native effect.
            const childAlive = childPid && ns.ps("home").some(p=>p.pid === childPid && String(p.filename).replace(/^\/+/, "") === CHILD.slice(1));
            if (!childAlive) releaseTerminal(ns, lease);
        }
    }
}

export async function main(ns) {
    await task(ns, "backdoors", () => advanceBackdoors(ns));
}
