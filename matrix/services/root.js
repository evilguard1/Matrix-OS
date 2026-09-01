import { config, event, writeState } from "/matrix/lib/common.js";
import { scanAll, tryRoot } from "/matrix/lib/network.js";

const WORKERS = [
    "/matrix/workers/hack.js",
    "/matrix/workers/grow.js",
    "/matrix/workers/weaken.js",
];

export async function main(ns) {
    ns.disableLog("ALL");
    let lastRooted = 0;
    while (true) {
        const cfg = config(ns);
        const { hosts } = scanAll(ns);
        let rooted = 0;
        let newly = 0;
        for (const host of hosts) {
            const had = ns.hasRootAccess(host);
            if (cfg.masterEnabled !== false && cfg.automation?.rooting !== false) tryRoot(ns, host);
            const has = ns.hasRootAccess(host);
            if (has) {
                rooted++;
                if (!had) {
                    newly++;
                    await event(ns, "root", `ROOT ACCESS: ${host}`, "success");
                }
                if (ns.getServerMaxRam(host) > 0 && host !== "home") {
                    try { await ns.scp(WORKERS, host, "home"); } catch {}
                }
            }
        }
        if (rooted !== lastRooted || newly) lastRooted = rooted;
        await writeState(ns, "root", {
            status: "online",
            discovered: hosts.length,
            rooted,
            newlyRooted: newly,
            crackingPrograms: [
                "BruteSSH.exe","FTPCrack.exe","relaySMTP.exe","HTTPWorm.exe","SQLInject.exe"
            ].filter(x => ns.fileExists(x, "home")).length
        });
        await ns.sleep(15_000);
    }
}
