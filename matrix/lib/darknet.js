export const DARKNET_WORKER = "/matrix/workers/darknet-node.js";
export const DARKNET_PORT = 19;
export const DARKNET_STATE = "/matrix/state/darknet.txt";
export const DARKNET_KNOWLEDGE_STATE = "/matrix/state/darknet-knowledge.txt";
export const DARKNET_NAVIGATOR = "DarkscapeNavigator.exe";

const COMMON_PASSWORDS = [
    "password", "123456", "12345678", "qwerty", "admin", "root", "letmein",
    "welcome", "guest", "default", "changeme", "1234", "0000", "passw0rd",
];

const EU_COUNTRIES = [
    "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark",
    "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Ireland",
    "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland",
    "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden",
];

const DOG_NAMES = [
    "Laika", "Lassie", "Buddy", "Max", "Bella", "Charlie", "Lucy", "Cooper",
    "Daisy", "Milo", "Luna", "Rocky", "Bailey", "Tucker", "Bear", "Molly",
];

function clean(value) {
    return String(value ?? "").trim();
}

function uniq(values) {
    return [...new Set(values.map(clean).filter(value => value.length <= 100))];
}

function hintedStrings(details = {}) {
    const text = `${details.passwordHint ?? ""} ${details.data ?? ""}`;
    const quoted = [...text.matchAll(/["'`]([^"'`]{1,64})["'`]/g)].map(match => match[1]);
    const assignments = [...text.matchAll(/(?:password|pass|pwd|token)\s*[:=]\s*([^\s,;]{1,64})/gi)].map(match => match[1]);
    return uniq([...quoted, ...assignments]);
}

export function hasDarknetAccess(ns) {
    try { return ns.fileExists(DARKNET_NAVIGATOR, "home"); } catch { return false; }
}

/**
 * Conservative first-pass candidate generation. This intentionally solves only
 * models with a cheap deterministic exploit or small public dictionary. Models
 * requiring interactive feedback are reported to the controller for later
 * specialised solvers instead of brute-forcing the unstable network.
 */
export function easyPasswordCandidates(details = {}) {
    const model = clean(details.modelId);
    const length = Math.max(0, Math.floor(Number(details.passwordLength) || 0));
    const hinted = hintedStrings(details);

    if (model === "ZeroLogon") return [""];
    if (model === "Pr0verFl0" && length > 0) {
        // Buffer-overflow model compares two adjacent password-length buffers.
        // Overwrite both halves with the same bytes to make them equal.
        return ["A".repeat(Math.min(100, length * 2))];
    }
    if (model === "FreshInstall_1.0") {
        return uniq([...hinted, ...COMMON_PASSWORDS]);
    }
    if (model === "TopPass") {
        return uniq([...hinted, ...COMMON_PASSWORDS]);
    }
    if (model === "EuroZone Free") {
        return uniq([...hinted, ...EU_COUNTRIES, ...EU_COUNTRIES.map(value => value.toLowerCase())]);
    }
    if (model === "Laika4") {
        return uniq([...hinted, ...DOG_NAMES, ...DOG_NAMES.map(value => value.toLowerCase())]);
    }

    return hinted;
}

export function summarizeDetails(host, details = {}) {
    return {
        host,
        modelId: details.modelId ?? null,
        passwordHint: details.passwordHint ?? null,
        data: details.data ?? null,
        passwordLength: Number(details.passwordLength ?? -1),
        passwordFormat: details.passwordFormat ?? null,
        difficulty: Number(details.difficulty ?? 0),
        requiredCharismaSkill: Number(details.requiredCharismaSkill ?? 0),
        depth: Number(details.depth ?? -1),
        blockedRam: Number(details.blockedRam ?? 0),
        isStationary: Boolean(details.isStationary),
        hasSession: Boolean(details.hasSession),
        isConnectedToCurrentServer: Boolean(details.isConnectedToCurrentServer),
    };
}

export function parseWorkerMessage(raw) {
    if (raw == null || raw === "NULL PORT DATA") return null;
    if (typeof raw === "object") return raw;
    try {
        const value = JSON.parse(String(raw));
        return value && typeof value === "object" ? value : null;
    } catch {
        return null;
    }
}

export function mergeDarknetMessage(state = {}, message = {}, now = Date.now()) {
    const out = {
        nodes: { ...(state.nodes ?? {}) },
        events: Array.isArray(state.events) ? [...state.events] : [],
        cacheOpened: Number(state.cacheOpened ?? 0),
        authenticated: Number(state.authenticated ?? 0),
        updated: now,
    };
    const host = clean(message.host);
    if (host) {
        const prior = out.nodes[host] ?? {};
        out.nodes[host] = { ...prior, ...message, lastSeen: Number(message.at ?? now) };
        if (message.type === "auth-success" && !prior.authenticated) out.authenticated += 1;
        if (message.type === "cache-opened") out.cacheOpened += 1;
    }
    out.events.push({ ...message, at: Number(message.at ?? now) });
    if (out.events.length > 80) out.events.splice(0, out.events.length - 80);
    return out;
}
