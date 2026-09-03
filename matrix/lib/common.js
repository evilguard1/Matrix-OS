export const ROOT = "/matrix";
export const CONFIG = `${ROOT}/config.json`;
export const STATE_DIR = `${ROOT}/state`;
export const EVENTS = `${STATE_DIR}/events.txt`;
export const DIRECTIVES = `${STATE_DIR}/directives.txt`;

const COMMIT_API = "https://api.github.com/repos/evilguard1/Matrix-OS/commits/main";
const RELEASE_META = `${STATE_DIR}/release-metadata.txt`;

const DEFAULT_CONFIG = {
    version: "1.8.0",
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
    // Pin `opponent` to chase a specific bonus; null climbs the ladder by
    // results, which is what actually maximises node power.
    go: { opponent: null, boardSize: 5 },
    hacking: {
        homeReserveGb: 2, fullEngineHomeRam: 32, batchGapMs: 120,
        prepSecurityMargin: 0.5, prepMoneyFraction: 0.985,
        minHackFraction: 0.05, maxHackFraction: 0.4, maxBatches: null,   // no ceiling: the batch schedule decides
        minTargetMoney: 1_000_000,
        // maxBatches is a ceiling, not the working limit - the schedule decides.
        // These are ceilings, not working limits: allocateWave stops as soon as
        // the RAM runs out, so a generous cap simply lets RAM be the constraint
        // instead of an arbitrary number. At 804 TB a cap of 12 held the network
        // to ~37% - it was the whole reason utilisation plateaued there.
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
 * Config migrations.
 *
 * matrix/config.json is a protected file: the updater preserves it so the
 * player's settings survive. The cost is that a value which was only ever a
 * DEFAULT gets frozen at whatever it was the day the file was written, and then
 * silently overrides every later default.
 *
 * That is not hypothetical. A live save carried `hacking.maxBatches: 24` from
 * version 0.3.0. Every improvement to the wave allocator since was capped by it:
 * an 800 TB network ran at 5.7% because each target was pinned to 24 batches
 * regardless of what its schedule allowed. Removing it took the same save from
 * 168 batches to 790.
 *
 * A migration therefore only fires when the saved value still EQUALS the old
 * default - meaning the player never chose it. A value they actually changed is
 * theirs and is left alone.
 */
export const CONFIG_MIGRATIONS = [
    {
        path: ["hacking", "maxBatches"],
        stale: 24,
        next: null,
        why: "a flat 24-batch cap per target held a large network at a fraction of its capacity; the schedule decides now",
    },
];

/**
 * Applies migrations to a SAVED config object, returning the new object and what
 * changed. Operates on the saved file rather than the merged result, because
 * only the saved file tells us what the player actually wrote down.
 */
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
        // Only a value the player never changed may be migrated.
        if (node[key] !== migration.stale) continue;
        node[key] = migration.next;
        applied.push({ path: path.join("."), from: migration.stale, to: migration.next, why: migration.why });
    }
    return { config: out, applied };
}

export function config(ns) {
    const saved = readJson(ns, CONFIG, readJson(ns, `${ROOT}/config.txt`, {}));
    // Stale defaults in a protected file would otherwise override every later
    // improvement; a value the player actually changed is left untouched.
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

/**
 * The flat cash reserve protects whatever milestone the coordinator is saving
 * for. Applied literally it reserves $10m from a player who owns $1m, which
 * zeroes every infrastructure budget for the entire early game - exactly when
 * infrastructure compounds hardest. A $440k purchased server pays for itself in
 * minutes and then keeps paying, and under the old rule MATRIX could not buy one
 * until $50m of cash.
 *
 * So the flat floor scales in: hold a fraction of the balance early, and only
 * honour the full flat reserve once it is small relative to what you have.
 */
export function reserveFloor(cash, cfg = {}) {
    const econ = cfg.economy ?? {};
    const balance = Math.max(0, Number(cash) || 0);
    const flat = Math.max(0, Number(econ.cashReserve ?? 10_000_000) || 0);
    const fraction = Math.max(0, Number(econ.reserveFraction ?? 0.15) || 0);
    // Never hold more than a quarter of the balance as the flat component.
    const scaled = Math.min(flat, balance * 0.25);
    return Math.max(scaled, balance * fraction);
}

/**
 * How much of the spendable balance a manager may use.
 *
 * Below `fullEngineHomeRam` there is nothing worth saving for that beats more
 * worker RAM, so the cloud manager is allowed most of the balance. The
 * conservative configured fractions take over once home is large enough to run
 * the real engine, and an explicit coordinator directive always wins.
 */
export function managerFraction(name, { configured = 0, homeRam = 8, directive = null, aggressiveBelowRam = 128 } = {}) {
    // Number(null) is 0 and 0 is finite, so testing the coercion alone would
    // treat "no directive" as "spend nothing" and zero every budget.
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

    // Singularity publishes a target augmentation budget here. Economy managers
    // honour it, while the singularity service itself uses the baseline reserve.
    const progression = readJson(ns, `${STATE_DIR}/spending-reserve.txt`, {});
    const target = Number(progression.amount ?? 0);
    const fresh = Date.now() - Number(progression.updated ?? 0) < 30_000;
    return fresh && Number.isFinite(target) ? Math.max(baseline, target) : baseline;
}

export function baselineReserveMoney(ns, cfg = config(ns)) {
    return reserveFloor(ns.getServerMoneyAvailable("home"), cfg);
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
