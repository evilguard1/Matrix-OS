export const BOOST_TYPE = "reputation-boost";
export const BOOST_MODE_NORMAL = "normal";
export const BOOST_MODE_MAX = "max";
export const BOOST_REQUEST_STATE = "/matrix/state/boost-request.txt";
export const SHARE_SCRIPT = "/matrix/workers/share.js";
export const BOOST_ARG = "--boost";
export const BOOST_END_ARG = "--ends";
export const BOOST_SLOT_ARG = "--slot";

function objectValue(value) {
    return value && typeof value === "object" ? value : {};
}

function finite(value, fallback = 0) {
    if (value == null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeMode(mode) {
    const value = String(mode ?? "").trim().toLowerCase();
    if (value === BOOST_MODE_NORMAL || value === "rep") return BOOST_MODE_NORMAL;
    if (value === BOOST_MODE_MAX || value === "max-rep" || value === "maxrep") return BOOST_MODE_MAX;
    return null;
}

// Bitburner's process table may drop a leading slash and normalize separators.
// Share ownership and legacy H/G/W drain reconstruction must therefore compare
// normalized script identities rather than raw ns.ps().filename strings.
export function normalizeScriptPath(value) {
    return String(value ?? "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+/, "");
}

export function sameScriptPath(a, b) {
    return normalizeScriptPath(a) === normalizeScriptPath(b);
}

export function isShareScriptPath(value) {
    return sameScriptPath(value, SHARE_SCRIPT);
}

export function parseDuration(value) {
    const raw = (Array.isArray(value) ? value.join(" ") : String(value ?? ""))
        .trim()
        .toLowerCase();
    if (!raw) return null;

    const units = {
        ms: 1, millisecond: 1, milliseconds: 1,
        s: 1_000, sec: 1_000, secs: 1_000, second: 1_000, seconds: 1_000,
        m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
        h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000,
        d: 86_400_000, day: 86_400_000, days: 86_400_000,
    };
    const re = /(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|secs?|sec|s|minutes?|mins?|min|m|hours?|hrs?|hr|h|days?|d)/g;
    let total = 0;
    let matched = false;
    let end = 0;
    let match;
    while ((match = re.exec(raw)) !== null) {
        if (raw.slice(end, match.index).trim()) return null;
        const amount = Number(match[1]);
        const multiplier = units[match[2]];
        if (!Number.isFinite(amount) || amount <= 0 || !multiplier) return null;
        total += amount * multiplier;
        matched = true;
        end = re.lastIndex;
    }
    if (!matched || raw.slice(end).trim() || !Number.isFinite(total) || total <= 0) return null;
    return Math.max(1, Math.round(total));
}

export function makeBoostRequest(mode, durationMs, now = Date.now(), boostId = "") {
    const normalizedMode = normalizeMode(mode);
    const duration = finite(durationMs, 0);
    const requestedAt = finite(now, Date.now());
    if (!normalizedMode || duration <= 0) return null;
    const id = String(boostId ?? "").trim() || `boost-${Math.floor(requestedAt).toString(36)}`;
    const deferred = normalizedMode === BOOST_MODE_MAX;
    return {
        type: BOOST_TYPE,
        status: "requested",
        mode: normalizedMode,
        boostId: id,
        requestedAt,
        startedAt: deferred ? null : requestedAt,
        durationMs: duration,
        endsAt: deferred ? null : requestedAt + duration,
    };
}

export function activateMaxBoostRequest(raw, now = Date.now()) {
    const source = objectValue(raw);
    const boostId = String(source.boostId ?? "").trim();
    const durationMs = finite(source.durationMs, 0);
    const startedAt = finite(now, Date.now());
    const requestedAt = finite(source.requestedAt, finite(source.startedAt, startedAt));
    if (source.type !== BOOST_TYPE || normalizeMode(source.mode) !== BOOST_MODE_MAX || !boostId || durationMs <= 0) {
        return null;
    }
    return {
        type: BOOST_TYPE,
        status: "active",
        mode: BOOST_MODE_MAX,
        boostId,
        requestedAt,
        startedAt,
        shareStartedAt: startedAt,
        durationMs,
        endsAt: startedAt + durationMs,
    };
}

export function makeCancelRequest(previous, now = Date.now()) {
    const prior = objectValue(previous);
    return {
        type: BOOST_TYPE,
        status: "cancelled",
        mode: normalizeMode(prior.mode),
        boostId: String(prior.boostId ?? "") || null,
        cancelledAt: finite(now, Date.now()),
    };
}

export function normalizeBoostRequest(raw, now = Date.now()) {
    const source = objectValue(raw);
    if (source.type !== BOOST_TYPE) return null;
    const requestStatus = String(source.status ?? "requested").trim().toLowerCase();
    if (["cancelled", "canceled", "completed"].includes(requestStatus)) return null;

    const mode = normalizeMode(source.mode);
    const boostId = String(source.boostId ?? "").trim();
    const observedAt = finite(now, Date.now());
    const durationMs = finite(source.durationMs, 0);
    const requestedAt = finite(source.requestedAt, finite(source.startedAt, NaN));
    if (!mode || !boostId || durationMs <= 0 || !Number.isFinite(requestedAt)) return null;

    if (mode === BOOST_MODE_MAX && requestStatus !== "active") {
        return {
            type: BOOST_TYPE,
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

    const startedAt = finite(source.startedAt, NaN);
    const endsAt = finite(source.endsAt, NaN);
    if (!Number.isFinite(startedAt) || !Number.isFinite(endsAt) || endsAt <= observedAt) return null;
    return {
        type: BOOST_TYPE,
        status: "active",
        mode,
        boostId,
        requestedAt,
        startedAt,
        shareStartedAt: finite(source.shareStartedAt, startedAt),
        durationMs,
        endsAt,
        remainingMs: Math.max(0, endsAt - observedAt),
    };
}

export function shareArgs(boost, slot = 0) {
    const source = objectValue(boost);
    return [
        BOOST_ARG,
        String(source.boostId ?? ""),
        BOOST_END_ARG,
        String(finite(source.endsAt, 0)),
        BOOST_SLOT_ARG,
        String(Math.max(0, Math.floor(finite(slot, 0)))),
    ];
}

export function shareProcessMeta(proc) {
    const source = objectValue(proc);
    if (!isShareScriptPath(source.filename)) return null;
    const args = Array.isArray(source.args) ? source.args.map(value => String(value)) : [];
    const valueAfter = key => {
        const index = args.indexOf(key);
        return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
    };
    const boostId = String(valueAfter(BOOST_ARG) ?? "").trim();
    if (!boostId) return null;
    const endsAt = finite(valueAfter(BOOST_END_ARG), 0);
    const slot = Math.max(0, Math.floor(finite(valueAfter(BOOST_SLOT_ARG), 0)));
    return { boostId, endsAt, slot };
}

export function isOwnedShareProcess(proc, boostId) {
    const id = String(boostId ?? "").trim();
    if (!id) return false;
    const meta = shareProcessMeta(proc);
    return Boolean(meta && meta.boostId === id);
}

export function shareCapacityThreads(input) {
    const source = objectValue(input);
    const maxRam = Math.max(0, finite(source.maxRam, 0));
    const usedRam = Math.max(0, finite(source.usedRam, 0));
    const reserveRam = Math.max(0, finite(source.reserveRam, 0));
    const ownedRam = Math.max(0, finite(source.ownedRam, 0));
    const scriptRam = Math.max(0, finite(source.scriptRam, 0));
    if (scriptRam <= 0) return 0;
    return Math.max(0, Math.floor(Math.max(0, maxRam - usedRam - reserveRam + ownedRam) / scriptRam));
}

export function normalShareBudget(schedulableFreeRam, reserveFraction = 0) {
    const free = Math.max(0, finite(schedulableFreeRam, 0));
    const reserve = Math.min(0.9, Math.max(0, finite(reserveFraction, 0)));
    return Math.max(0, free * (1 - reserve));
}

export function planShareThreads(hosts, budgetRam, scriptRam) {
    const list = Array.isArray(hosts) ? hosts : [];
    const ram = Math.max(0, finite(scriptRam, 0));
    if (ram <= 0) return [];
    let remaining = Math.max(0, finite(budgetRam, 0));
    const out = [];
    for (const raw of list) {
        if (remaining < ram) break;
        const host = objectValue(raw);
        const availableRam = Math.max(0, finite(host.availableRam, 0));
        const threads = Math.max(0, Math.floor(Math.min(availableRam, remaining) / ram));
        if (threads <= 0) continue;
        const allocatedRam = threads * ram;
        out.push({ host: String(host.host ?? ""), threads, ram: allocatedRam });
        remaining = Math.max(0, remaining - allocatedRam);
    }
    return out;
}

export function maxBoostReady(state) {
    const source = objectValue(state);
    return Math.max(0, finite(source.activeBatches, 0)) === 0 &&
        Math.max(0, finite(source.activePrep, 0)) === 0 &&
        Math.max(0, finite(source.legacyWorkers, 0)) === 0;
}
