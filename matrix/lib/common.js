export const ROOT = "/matrix";
export const CONFIG = `${ROOT}/config.json`;
export const STATE_DIR = `${ROOT}/state`;
export const EVENTS = `${STATE_DIR}/events.txt`;
export const DIRECTIVES = `${STATE_DIR}/directives.txt`;

const COMMIT_API = "https://api.github.com/repos/evilguard1/Matrix-OS/commits/main";
const RELEASE_META = `${STATE_DIR}/release-metadata.txt`;

const DEFAULT_CONFIG = {
    version: "0.8.3",
    masterEnabled: true,
    mode: "balanced",
    ui: { refreshMs: 750, autoOpen: true, matrixRain: true },
    automation: {
        rooting: true, hacking: true, cloud: true, hacknet: true,
        contracts: true, stock: true, singularity: true, gang: true,
        sleeves: true, bladeburner: true, corporation: true, progression: true,
    },
    economy: {
        cashReserve: 10_000_000, reserveFraction: 0.15,
        cloudBudgetFraction: 0.12, hacknetBudgetFraction: 0.04, stockBudgetFraction: 0.25,
    },
    hacking: {
        homeReserveGb: 2, fullEngineHomeRam: 32, batchGapMs: 120,
        prepSecurityMargin: 0.5, prepMoneyFraction: 0.985,
        minHackFraction: 0.05, maxHackFraction: 0.4, maxBatches: 24,
        minTargetMoney: 1_000_000,
    },
    progression: {
        autoInstallAugmentations: true, minQueuedAugsForReset: 5,
        forceResetAtQueuedAugs: 10, minMinutesBetweenResets: 35,
        autoDestroyWorldDaemon: false,
        donationFavorThreshold: 150, donationBudgetFraction: 0.05,
    },
};

function merge(base, override) {
    const out = { ...base };
    for (const [key, value] of Object.entries(override ?? {})) {
        if (value && typeof value === "object" && !Array.isArray(value) && typeof base?.[key] === "object") {
            out[key] = merge(base[key], value);
        } else {
            out[key] = value;
        }
    }
    return out;
}

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
    const saved = readJson(ns, CONFIG, readJson(ns, `${ROOT}/config.txt`, {}));
    return merge(DEFAULT_CONFIG, saved);
}

export async function fetchLatestInstaller(ns, destination = `${ROOT}/remote-install.js`) {
    const stamp = Date.now();
    let sha = "main";
    if (await ns.wget(`${COMMIT_API}?t=${stamp}`, RELEASE_META, "home")) {
        try {
            const parsed = String(JSON.parse(ns.read(RELEASE_META)).sha ?? "");
            if (/^[a-f0-9]{40}$/i.test(parsed)) sha = parsed;
        } catch {}
    }
    const url = `https://raw.githubusercontent.com/evilguard1/Matrix-OS/${sha}/install.js`;
    return await ns.wget(url, destination, "home") ? sha : null;
}

export function getCoordinatorState(ns) {
    const raw = readJson(ns, `${STATE_DIR}/coordinator.txt`, null);
    if (!raw || Date.now() - Number(raw.updated ?? 0) > 30_000) return null;
    return raw;
}

export function reserveMoney(ns, cfg = config(ns)) {
    const cash = ns.getServerMoneyAvailable("home");
    const econ = cfg.economy ?? {};
    const baseline = Math.max(econ.cashReserve ?? 10_000_000, cash * (econ.reserveFraction ?? 0.15));

    const coord = getCoordinatorState(ns);
    if (coord && coord.budgets) {
        const coordTarget = Math.max(
            Number(coord.budgets.augmentationReserve ?? 0),
            Number(coord.budgets.milestoneReserve ?? 0)
        );
        if (Number.isFinite(coordTarget) && coordTarget > 0) {
            return Math.max(baseline, coordTarget);
        }
    }

    // Singularity publishes a target augmentation budget here. Economy managers
    // honour it, while the singularity service itself uses the baseline reserve.
    const progression = readJson(ns, `${STATE_DIR}/spending-reserve.txt`, {});
    const target = Number(progression.amount ?? 0);
    const fresh = Date.now() - Number(progression.updated ?? 0) < 30_000;
    return fresh && Number.isFinite(target) ? Math.max(baseline, target) : baseline;
}

export function baselineReserveMoney(ns, cfg = config(ns)) {
    const cash = ns.getServerMoneyAvailable("home");
    const econ = cfg.economy ?? {};
    return Math.max(econ.cashReserve ?? 10_000_000, cash * (econ.reserveFraction ?? 0.15));
}

// Live per-manager directive protocol published by the coordinator. Returns null
// when there is no fresh coordinator (fresh save, coordinator paused, or a
// crashed coordinator) so every consumer falls back to its own local defaults.
export function getDirectives(ns) {
    const raw = readJson(ns, DIRECTIVES, null);
    if (!raw || Date.now() - Number(raw.updated ?? 0) > 30_000) return null;
    return raw;
}

// Discretionary spend ceiling for an infrastructure manager ("hacknet", "cloud",
// "stock"). The coordinator can shrink the fraction to zero during
// reserve-heavy phases; without a live coordinator the static config fraction
// applies exactly as before this protocol existed.
export function managerBudget(ns, name, cfg = config(ns)) {
    const cash = ns.getServerMoneyAvailable("home");
    const reserve = reserveMoney(ns, cfg);
    const econKey = {
        hacknet: "hacknetBudgetFraction",
        cloud: "cloudBudgetFraction",
        stock: "stockBudgetFraction",
    }[name];
    let fraction = econKey ? Number(cfg.economy?.[econKey] ?? 0) : 0;
    const dir = getDirectives(ns);
    const override = Number(dir?.budgets?.[name]);
    if (Number.isFinite(override)) fraction = override;
    if (!Number.isFinite(fraction) || fraction < 0) fraction = 0;
    return Math.max(0, Math.min(cash - reserve, cash * fraction));
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

export function plannedNextBitNode(reset, plan) {
    const required = new Map();
    for (const value of plan ?? []) {
        const node = Number(value);
        if (!Number.isInteger(node) || node < 1 || node > 13) continue;
        const targetLevel = (required.get(node) ?? 0) + 1;
        required.set(node, targetLevel);
        const completingCurrent = reset?.currentNode === node ? 1 : 0;
        if (sfLevel(reset, node) + completingCurrent < targetLevel) return node;
    }
    return 1;
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
