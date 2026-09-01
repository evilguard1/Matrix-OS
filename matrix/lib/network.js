export function scanAll(ns, start = "home") {
    const seen = new Set([start]);
    const queue = [start];
    const parent = new Map([[start, null]]);
    while (queue.length) {
        const host = queue.shift();
        for (const next of ns.scan(host)) {
            if (seen.has(next)) continue;
            seen.add(next);
            parent.set(next, host);
            queue.push(next);
        }
    }
    return { hosts: [...seen], parent };
}

export function routeTo(parent, target) {
    if (!parent.has(target)) return [];
    const route = [];
    let cur = target;
    while (cur) {
        route.push(cur);
        cur = parent.get(cur);
    }
    return route.reverse();
}

export function availableOpeners(ns) {
    return [
        ["BruteSSH.exe", h => ns.brutessh(h)],
        ["FTPCrack.exe", h => ns.ftpcrack(h)],
        ["relaySMTP.exe", h => ns.relaysmtp(h)],
        ["HTTPWorm.exe", h => ns.httpworm(h)],
        ["SQLInject.exe", h => ns.sqlinject(h)],
    ].filter(([file]) => ns.fileExists(file, "home"));
}

export function tryRoot(ns, host) {
    if (host === "home" || ns.hasRootAccess(host)) return true;
    const need = ns.getServerNumPortsRequired(host);
    const openers = availableOpeners(ns);
    if (openers.length < need) return false;
    for (const [, open] of openers) {
        try { open(host); } catch {}
    }
    try { ns.nuke(host); } catch {}
    return ns.hasRootAccess(host);
}

export function workerHosts(ns, hosts, homeReserve = 24) {
    const out = [];
    for (const host of hosts) {
        if (!ns.hasRootAccess(host)) continue;
        const max = ns.getServerMaxRam(host);
        if (max <= 0) continue;
        const used = ns.getServerUsedRam(host);
        const reserve = host === "home" ? homeReserve : 0;
        const free = Math.max(0, max - used - reserve);
        if (free > 0) out.push({ host, max, used, free });
    }
    return out.sort((a,b) => b.free - a.free);
}

export function totalFreeRam(ns, hosts, homeReserve = 24) {
    return workerHosts(ns, hosts, homeReserve).reduce((s,h) => s + h.free, 0);
}
