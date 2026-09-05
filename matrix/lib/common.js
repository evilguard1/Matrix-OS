import { resetEpoch, freshState } from "./state.js";

export const ROOT = "/matrix";
export const CONFIG = `${ROOT}/config.json`;
export const STATE_DIR = `${ROOT}/state`;
export const EVENTS = `${STATE_DIR}/events.txt`;
export const DIRECTIVES = `${STATE_DIR}/directives.txt`;

const BOOST_REQUEST_STATE = `${STATE_DIR}/boost-request.txt`;
const REPUTATION_BOOST_TYPE = "reputation-boost";

const DEFAULT_CONFIG = {
    version: "1.11.0-rp.1",
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
        homeReserveGb: 2, fullEngineHomeRam: 64, batchGapMs: 120,
        prepSecurityMargin: 0.5, prepMoneyFraction: 0.985,
        minHackFraction: 0.05, maxHackFraction: 0.4, maxBatches: null,   // no ceiling: the batch schedule decides
        minTargetMoney: 1_000_000,
        // maxBatches is a ceiling, not the working limit - the schedule decides.
        // These are ceilings, not working limits: the rolling scheduler stops as
        // soon as RAM/schedulability runs out, so a generous target cap simply
        // lets ranked targets and RAM be the constraint instead of an arbitrary
        // small number. L00 proved the old cap of 32 pinned a 28 PB network to
        // exactly 14,813 batches and ~6.27% utilisation with zero deferrals.
        // RAM-aware shapes are an abundance overlay: they stay on the validated
        // RAM-efficiency baseline until every admitted target's baseline fits.
        maxTargets: 1024, ramAwareBatchShapes: true, waveReserveFraction: 0.05, maxPrepTargets: 20,
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
    {
        path: ["hacking", "maxTargets"],
        stale: 32,
        next: 1024,
        why: "live L00 accounting proved the old 32-target ceiling saturated every admitted pipeline while leaving about 94% of a 28 PB network idle",
    },
    {
        path: ["hacking", "fullEngineHomeRam"],
        stale: 32,
        next: 64,
        why: "live Bitburner RAM accounting proved the complete rolling engine cannot own the network safely before 64 GB",
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

const RELEASE_PROFILE = "/matrix/release.json";
const DEFAULT_CHANNEL = "rp/ghost-node-war";
const COMMIT_API = "https://api.github.com/repos/evilguard1/Matrix-OS/commits/";
const RELEASE_META = "/matrix/state/release-metadata.txt";

export function releaseProfile(ns) {
    const raw = ns.read(RELEASE_PROFILE);
    if (!raw) return { schemaVersion: 1, channel: DEFAULT_CHANNEL, installedSha: null };
    try {
        const value = JSON.parse(raw);
        if (value.schemaVersion !== 1 || !["main", DEFAULT_CHANNEL].includes(value.channel) ||
            !/^[a-f0-9]{40}$/.test(value.installedSha)) return null;
        return value;
    } catch { return null; }
}

export async function fetchLatestInstaller(ns, destination = "/matrix/remote-install.js", stageOnly = false) {
    const profile = releaseProfile(ns);
    if (!profile) return null;
    let sha = stageOnly ? profile.installedSha : null;
    if (!sha) {
        if (!await ns.wget(`${COMMIT_API}${encodeURIComponent(profile.channel)}?t=${Date.now()}`, RELEASE_META, "home")) return null;
        try { sha = JSON.parse(ns.read(RELEASE_META)).sha; } catch { return null; }
    }
    if (typeof sha !== "string" || !/^[a-f0-9]{40}$/.test(sha)) return null;
    const url = `https://raw.githubusercontent.com/evilguard1/Matrix-OS/${sha}/install.js`;
    return await ns.wget(url, destination, "home") && ns.read(destination).length > 0 ? sha : null;
}

export function getCoordinatorState(ns) {
    const raw = readJson(ns, `${STATE_DIR}/coordinator.txt`, null);
    let epoch = null;
    if (raw?.schemaVersion === 1) { try { epoch = resetEpoch(ns.getResetInfo()); } catch {} }
    if (!freshState(raw, { epoch })) return null;
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
 * Below the configured aggressive cloud threshold there is nothing worth
 * saving for that beats more worker RAM, so the cloud manager is allowed most
 * of the balance. The conservative configured fractions take over later, and an
 * explicit coordinator directive always wins.
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
    // A present but invalid/stale strategic policy is not permission to spend.
    if (ns.read(`${STATE_DIR}/coordinator.txt`) && !coord) return Math.max(baseline, cash);
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
    let epoch = null;
    if (progression.schemaVersion === 1) { try { epoch = resetEpoch(ns.getResetInfo()); } catch {} }
    const fresh = freshState(progression, { epoch });
    // N-1 legacy reserves retain their old expiry behavior; canonical reserves
    // fail closed until their owner republishes after reconnect/reset.
    if (progression.schemaVersion === 1 && !fresh) return Math.max(baseline, cash);
    return fresh && Number.isFinite(target) && target >= 0 ? Math.max(baseline, target) : baseline;
}

export function baselineReserveMoney(ns, cfg = config(ns)) {
    return reserveFloor(ns.getServerMoneyAvailable("home"), cfg);
}

// Minimal durable normalization for the command/control boundary. This mirrors
// reputation-boost.js without importing the full-stage helper into common.js,
// because common.js must still load during bootstrap/early stages where that
// helper is intentionally not installed yet.
export function durableReputationBoost(raw, now = Date.now()) {
    const source = raw && typeof raw === "object" ? raw : null;
    if (!source || source.type !== REPUTATION_BOOST_TYPE) return null;
    const status = String(source.status ?? "requested").trim().toLowerCase();
    if (["cancelled", "canceled", "completed"].includes(status)) return null;

    const modeRaw = String(source.mode ?? "").trim().toLowerCase();
    const mode = modeRaw === "rep" ? "normal" : modeRaw === "max-rep" || modeRaw === "maxrep" ? "max" : modeRaw;
    if (mode !== "normal" && mode !== "max") return null;
    const boostId = String(source.boostId ?? "").trim();
    const durationMs = Number(source.durationMs);
    const requestedAt = Number(source.requestedAt ?? source.startedAt);
    if (!boostId || !Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(requestedAt)) return null;

    if (mode === "max" && status !== "active") {
        return {
            type: REPUTATION_BOOST_TYPE,
            status: "requested",
            mode,
            boostId,
            requestedAt,
            startedAt: null,
            durationMs,
            endsAt: null,
            remainingMs: durationMs,
        };
    }

    const startedAt = Number(source.startedAt);
    const endsAt = Number(source.endsAt);
    if (!Number.isFinite(startedAt) || !Number.isFinite(endsAt) || endsAt <= now) return null;
    return {
        type: REPUTATION_BOOST_TYPE,
        status: "active",
        mode,
        boostId,
        requestedAt,
        startedAt,
        shareStartedAt: Number.isFinite(Number(source.shareStartedAt)) ? Number(source.shareStartedAt) : startedAt,
        durationMs,
        endsAt,
        remainingMs: Math.max(0, endsAt - now),
    };
}

// Live per-manager directive protocol published by the coordinator. Reputation
// boost commands are additionally overlaid from their durable request file. A
// coordinator restart or one stale/missing directive publication must not cancel
// a still-valid MAX drain. Explicit cancellation remains immediate because the
// durable request itself changes to a terminal status.
export function getDirectives(ns) {
    const now = Date.now();
    const coordinator = readJson(ns, DIRECTIVES, null);
    let epoch = null;
    if (coordinator?.schemaVersion === 1) { try { epoch = resetEpoch(ns.getResetInfo()); } catch {} }
    const canonical = coordinator?.schemaVersion === 1 ? getCoordinatorState(ns) : null;
    const coordinatorFresh = freshState(coordinator, { now, epoch }) &&
        (coordinator.schemaVersion !== 1 || canonical?.revision === coordinator.revision);

    const unreadable = {};
    const requestRecord = readJson(ns, BOOST_REQUEST_STATE, unreadable);
    const requestReadable = requestRecord !== unreadable;
    const durableBoost = requestReadable ? durableReputationBoost(requestRecord, now) : null;

    if (!coordinatorFresh && !durableBoost) return null;

    const out = coordinatorFresh
        ? { ...coordinator, directives: { ...(coordinator.directives ?? {}) } }
        : { service: "boost-command", updated: now, directives: {} };

    if (durableBoost) {
        out.directives.reputationBoost = durableBoost;
    } else if (requestReadable && requestRecord?.type === REPUTATION_BOOST_TYPE) {
        // A successfully-read terminal/invalid command revokes any stale mirror.
        delete out.directives.reputationBoost;
    }
    return out;
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
        sleeveAugs: "sleeveAugBudgetFraction",
    }[name];
    const dir = getDirectives(ns);
    const fraction = managerFraction(name, {
        configured: econKey ? cfg.economy?.[econKey] ?? (name === "sleeveAugs" ? 0.005 : 0) : 0,
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
