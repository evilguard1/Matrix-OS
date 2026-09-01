export function stageForRam(homeRam) {
    if (homeRam < 16) return "/matrix/bootstrap.js";
    if (homeRam < 32) return "/matrix/early.js";
    return "/matrix/start.js";
}

export async function main(ns) {
    ns.disableLog("ALL");
    const next = stageForRam(ns.getServerMaxRam("home"));
    ns.spawn(next, { threads: 1, preventDuplicates: true, spawnDelay: 0 });
}
