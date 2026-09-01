export const ROOT = "/matrix";
export const CONFIG = `${ROOT}/config.json`;
export const STATE_DIR = `${ROOT}/state`;
export const EVENTS = `${STATE_DIR}/events.txt`;

const DEFAULT_CONFIG = {
    masterEnabled: true,
    ui: { refreshMs: 750, autoOpen: true, matrixRain: true },
    automation: {
        rooting: true, hacking: true, cloud: true, hacknet: true,
        contracts: true, stock: true, singularity: true, gang: true,
        sleeves: true, bladeburner: true, corporation: true,
    },
    economy: { cashReserve: 10_000_000, reserveFraction: 0.15 },
    hacking: {
        homeReserveGb: 2, fullEngineHomeRam: 32, batchGapMs: 120,
        prepSecurityMargin: 0.5, prepMoneyFraction: 0.985,
        minHackFraction: 0.05, maxHackFraction: 0.4, maxBatches: 24,
        minTargetMoney: 0,
    },
};

export function readJson(ns, file, fallback = {}) {
    try {
        const raw = ns.read(file);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

export async function writeJson(ns, file, value) {
    await ns.write(file, JSON.stringify(value), "w");
}

export function config(ns) {
    return { ...DEFAULT_CONFIG, ...readJson(ns, CONFIG, {}) };
}

export function reserveMoney(ns, cfg = config(ns)) {
    const cash = ns.getServerMoneyAvailable("home");
    const econ = cfg.economy ?? {};
    return Math.max(econ.cashReserve ?? 10_000_000, cash * (econ.reserveFraction ?? 0.15));
}

export async function writeState(ns, name, state) {
    await writeJson(ns, `${STATE_DIR}/${name}.txt`, {
        service: name,
        updated: Date.now(),
        ...state,
    });
}

export async function event(ns, service, message, level = "info") {
    const line = JSON.stringify({ t: Date.now(), service, level, message });
    await ns.write(EVENTS, `${line}\n`, "a");
}

export function sfLevel(reset, n) {
    return reset?.ownedSF?.get?.(n) ?? 0;
}

export function hasSF(reset, n) {
    return reset?.currentNode === n || sfLevel(reset, n) > 0;
}

export function formatMoney(n) {
    if (!Number.isFinite(n)) return "∞";
    const a = Math.abs(n);
    const units = [["q",1e15],["t",1e12],["b",1e9],["m",1e6],["k",1e3]];
    for (const [s,v] of units) if (a >= v) return `${n < 0 ? "-" : ""}$${(a/v).toFixed(a/v >= 100 ? 0 : a/v >= 10 ? 1 : 2)}${s}`;
    return `$${Math.round(n).toLocaleString()}`;
}

export function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
}

export function sleepUntil(ns, when) {
    return ns.sleep(Math.max(0, when - Date.now()));
}
