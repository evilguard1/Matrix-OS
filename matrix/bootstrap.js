import { config, event, writeState } from "/matrix/lib/common.js";
import { scanAll, tryRoot } from "/matrix/lib/network.js";

const EARLY = "/matrix/workers/early.js";

function sameScript(a,b){
    return String(a).replace(/^\/+/,"")===String(b).replace(/^\/+/,"");
}

function scoreTarget(ns, host) {
    if (!ns.hasRootAccess(host)) return -1;
    const max = ns.getServerMaxMoney(host);
    if (max <= 0) return -1;
    if (ns.getServerRequiredHackingLevel(host) > ns.getHackingLevel()) return -1;
    const t = Math.max(1, ns.getHackTime(host));
    return max / t;
}

async function deploy(ns, hosts, target) {
    const ram = ns.getScriptRam(EARLY, "home");
    for (const host of hosts) {
        if (!ns.hasRootAccess(host)) continue;
        const max = ns.getServerMaxRam(host);
        if (max < ram) continue;
        if (host !== "home") await ns.scp(EARLY, host, "home");
        for (const p of ns.ps(host)) {
            if (sameScript(p.filename, EARLY) && String(p.args[0]) !== target) ns.kill(p.pid);
        }
        if (!ns.ps(host).some(p => sameScript(p.filename, EARLY) && String(p.args[0]) === target)) {
            const reserve = host === "home" ? 1 : 0;
            const threads = Math.floor((max - ns.getServerUsedRam(host) - reserve) / ram);
            if (threads > 0) ns.exec(EARLY, host, threads, target);
        }
    }
}

export async function main(ns) {
    ns.disableLog("ALL");
    const cfg = config(ns);
    await event(ns, "bootstrap", "Low-RAM bootstrap online");
    while (true) {
        const { hosts } = scanAll(ns);
        let rooted = 0;
        for (const host of hosts) {
            if (cfg.automation?.rooting !== false) tryRoot(ns, host);
            if (ns.hasRootAccess(host)) rooted++;
        }
        const targets = hosts.map(h => ({ h, s: scoreTarget(ns, h) })).filter(x => x.s > 0).sort((a,b) => b.s-a.s);
        const target = targets[0]?.h ?? "n00dles";
        if (cfg.masterEnabled !== false && cfg.automation?.hacking !== false) await deploy(ns, hosts, target);

        await writeState(ns, "bootstrap", {
            status: "online",
            phase: "bootstrap",
            target,
            discovered: hosts.length,
            rooted,
            homeRam: ns.getServerMaxRam("home"),
        });

        if (ns.getServerMaxRam("home") >= (cfg.hacking?.fullEngineHomeRam ?? 32)) {
            await event(ns, "bootstrap", "Transitioning to full MATRIX engine", "success");
            ns.spawn("/matrix/start.js", { threads: 1, spawnDelay: 2000 }, "--phase2");
            return;
        }
        await ns.sleep(12_000);
    }
}
