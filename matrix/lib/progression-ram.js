export const SINGULARITY_TASKS = ["backdoors", "infrastructure", "catalog", "valuation", "purchase", "work", "home", "observe", "reset"];
export const singularityWorker = name => `/matrix/workers/singularity/${name}.js`;
const cache = new WeakMap();

// Hacking can start before the dispatcher. Reserve its measured launch cost as
// well as the child slot until it is resident, or new H/G/W jobs can starve it.
export function progressionAdmissionRam(ns) {
    const child = progressionRam(ns);
    if (!child) return 0;
    const running = ns.ps("home").some(p => String(p.filename).replace(/^\/+/, "") === "matrix/services/singularity.js");
    return child + (running ? 0 : Math.max(0, ns.getScriptRam("/matrix/services/singularity.js", "home")));
}

export function progressionRam(ns) {
    const reset = ns.getResetInfo();
    const home = ns.getServerMaxRam("home"), level = reset.ownedSF?.get?.(4) ?? 0;
    if (home < 64 || (reset.currentNode !== 4 && !level)) return 0;
    const key = `${reset.currentNode}:${level}:${home}:${reset.lastAugReset}`;
    const saved = cache.get(ns), now = Date.now();
    if (saved?.key === key && now - saved.updated < 1000) return saved.ram;
    const costs = SINGULARITY_TASKS.map(name => ns.getScriptRam(singularityWorker(name), "home"));
    const child = ns.getScriptRam("/matrix/workers/backdoor-install.js", "home");
    if (!Number.isFinite(child) || child <= 0) return 0;
    if (costs.some(x => !Number.isFinite(x) || x <= 0)) return 0;
    const need = Math.max(...costs, costs[0] + child);
    const ram = need + 40 <= home ? need : 0;
    cache.set(ns,{key,updated:now,ram});
    return ram;
}
