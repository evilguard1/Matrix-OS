export const ROOT = "/matrix";
export const CONFIG = `${ROOT}/config.json`;
export const STATE_DIR = `${ROOT}/state`;
export const EVENTS = `${STATE_DIR}/events.txt`;
export const DIRECTIVES = `${STATE_DIR}/directives.txt`;

const COMMIT_API = "https://api.github.com/repos/evilguard1/Matrix-OS/commits/main";
const RELEASE_META = `${STATE_DIR}/release-metadata.txt`;

const DEFAULT_CONFIG = {
    version: "1.8.2",
    masterEnabled: true,
    mode: "balanced",
    ui: { refreshMs: 750, autoOpen: true, matrixRain: true },
    automation: {
        rooting: true, hacking: true, cloud: true, hacknet: true,
        contracts: true, stock: true, singularity: true, gang: true, go: true, stanek: true,
        sleeves: true, bladeburner: true, corporation: true, progression: true,
    },
    economy: {
        cashReserve: 10_000_000, reserveFraction: 0.15,
        cloudBudgetFraction: 0.12, hacknetBudgetFraction: 0.04, stockBudgetFraction: 0.25,
    },
    go: { opponent: null, boardSize: 5 },
    hacking: {
        // Compatibility/display value only. Runtime stage ownership is centralized
        // in /matrix/lib/stages.js so a protected config cannot strand an old
        // handoff threshold after an update.
        homeReserveGb: 2, fullEngineHomeRam: 64, batchGapMs: 120,
        prepSecurityMargin: 0.5, prepMoneyFraction: 0.985,
        minHackFraction: 0.05, maxHackFraction: 0.4, maxBatches: null,
        minTargetMoney: 1_000_000,
        maxTargets: 32, waveReserveFraction: 0.05, maxPrepTargets: 20,
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

/**
 * Config migrations for values that were historical defaults rather than user
 * choices. Protected config survives updates, so stale defaults need an explicit
 * compatibility path when architecture changes.
 */
export const CONFIG_MIGRATIONS = [
    {
        path: ["hacking", "maxBatches"],
        stale: 24,
        next: null,
        why: "a flat 24-batch cap per target held a large network at a fraction of its capacity; the schedule decides now",
    },
    {
        path: ["hacking", "fullEngineHomeRam"],
        stale: 32,
        next: 64,
        why: "live Bitburner RAM accounting proved the complete rolling engine cannot own the network safely before 64 GB",
    },
];

export function migrateConfig(saved, migrations = CONFIG_MIGRATIONS) {
    const source = saved && typeof saved === "object" ? saved : {};
    const out = JSON.parse(JSON.stringify(source));
    const applied = [];
    for (const migration of Array.isArray(migrations) ? migrations : []) {
        const path = Array.isArray(migration?.path) ? migration.path : [];
        if (!path.length) continue;
        let node = out;
        for (let i = 0; i < path.length - 1; i++) {
            if (!node || typeof node !== "object") { node = null; break; }
            node = node[path[i]];
        }
        if (!node || typeof node !== "object") continue;
        const key = path[path.length - 1];
        if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
        if (node[key] !== migration.stale) continue;
        node[key] = migration.next;
        applied.push({ path: path.join("."), from: migration.stale, to: migration.next, why: migration.why });
    }
    return { config: out, applied };
}

export function config(ns) {
    const saved = readJson(ns, CONFIG, readJson(ns, `${ROOT}/config.txt`, {}));
    return merge(DEFAULT_CONFIG, migrateConfig(saved).config);
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

export function reserveFloor(cash, cfg = {}) {
    const econ = cfg.economy ?? {};
    const balance = Math.max(0, Number(cash) || 0);
    const flat = Math.max(0, Number(econ.cashReserve ?? 10_000_000) || 0);
    const fraction = Math.max(0, Number(econ.reserveFraction ?? 0.15) || 0);
    const scaled = Math.min(flat, balance * 0.25);
    return Math.max(scaled, balance * fraction);
}

/** How much of spendable cash a manager may use. */
export function managerFraction(name, { configured = 0, homeRam = 8, directive = null, aggressiveBelowRam = 128 } = {}) {
    if (directive != null && directive !== "") {
        const override = Number(directive);
        if (Number.isFinite(override)) return Math.max(0, override);
    }
    const base = Math.max(0, Number(configured) || 0);
    if (name !== "cloud") return base;
    return Number(homeRam) < aggressiveBelowRam ? Math.max(base, 0.75) : base;
}

export function reserveMoney(ns, cfg = config(ns)) {
    const cash = ns.getServerMoneyAvailable("home");
    const baseline = reserveFloor(cash, cfg);

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

    const progression = readJson(ns, `${STATE_DIR}/spending-reserve.txt`, {});
    const target = Number(progression.amount ?? 0);
    const fresh = Date.now() - Number(progression.updated ?? 0) < 30_000;
    return fresh && Number.isFinite(target) ? Math.max(baseline, target) : baseline;
}

export function baselineReserveMoney(ns, cfg = config(ns)) {
    return reserveFloor(ns.getServerMoneyAvailable("home"), cfg);
}

export function getDirectives(ns) {
    const raw = readJson(ns, DIRECTIVES, null);
    if (!raw || Date.now() - Number(raw.updated ?? 0) > 30_000) return null;
    return raw;
}

export function managerBudget(ns, name, cfg = config(ns)) {
    const cash = ns.getServerMoneyAvailable("home");
    const reserve = reserveMoney(ns, cfg);
    const econKey = {
        hacknet: "hacknetBudgetFraction",
        cloud: "cloudBudgetFraction",
        stock: "stockBudgetFraction",
    }[name];
    const dir = getDirectives(ns);
    const fraction = managerFraction(name, {
        configured: econKey ? cfg.economy?.[econKey] : 0,
        homeRam: ns.getServerMaxRam("home"),
        directive: dir?.budgets?.[name],
        aggressiveBelowRam: cfg.economy?.aggressiveCloudBelowRam ?? 128,
    });
    return Math.max(0, Math.min(cash - reserve, cash * fraction));
}

export async function writeState(ns, name, state) {
    await writeJson(ns, `${STATE_DIR}/${name}.txt`, {
        service: name,
        updated: Date.now(),
        ...state,
    });
}
