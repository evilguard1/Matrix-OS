export const DARKNET_WORKER = "/matrix/workers/darknet-node.js";
export const DARKNET_PORT = 19;
export const DARKNET_STATE = "/matrix/state/darknet.txt";
export const DARKNET_KNOWLEDGE_STATE = "/matrix/state/darknet-knowledge.txt";
export const DARKNET_NAVIGATOR = "DarkscapeNavigator.exe";
export const DARKNET_MAX_AUTO_CANDIDATES = 12;

const DEFAULT_PASSWORDS = ["admin", "password", "0000", "12345"];
const DOG_NAMES = ["fido", "spot", "rover", "max"];
const EU_COUNTRIES = [
    "Austria", "Belgium", "Bulgaria", "Croatia", "Republic of Cyprus", "Czech Republic",
    "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Ireland",
    "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland",
    "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden",
];
const COMMON_PASSWORDS = [
    "123456", "password", "12345678", "qwerty", "123456789", "12345", "1234",
    "111111", "1234567", "dragon", "123123", "baseball", "abc123", "football",
    "monkey", "letmein", "696969", "shadow", "master", "666666", "qwertyuiop",
    "123321", "mustang", "1234567890", "michael", "654321", "superman", "1qaz2wsx",
];

function clean(value) {
    return String(value ?? "").trim();
}

function uniq(values) {
    return [...new Set(values.map(value => String(value ?? "")).filter(value => value.length <= 100))];
}

function hintedStrings(details = {}) {
    const text = `${details.passwordHint ?? ""} ${details.data ?? ""}`;
    const quoted = [...text.matchAll(/["'`]([^"'`]{1,64})["'`]/g)].map(match => match[1]);
    const assignments = [...text.matchAll(/(?:password|pass|pwd|token)\s*[:=]\s*([^\s,;]{1,64})/gi)].map(match => match[1]);
    return uniq([...quoted, ...assignments]);
}

function echoCandidate(details) {
    const hint = clean(details.passwordHint);
    const prefixes = ["The password is", "The PIN is", "Remember to use", "It's set to", "The key is", "The secret is"];
    for (const prefix of prefixes) {
        if (hint.startsWith(prefix)) return hint.slice(prefix.length).trim();
    }
    return "";
}

function captchaCandidate(data) {
    return String(data ?? "").replace(/\D/g, "");
}

function largestPrimeFactor(value) {
    let n = Math.floor(Math.abs(Number(value)));
    if (!Number.isSafeInteger(n) || n < 2) return null;
    let factor = 2;
    let largest = 1;
    while (factor * factor <= n) {
        if (n % factor === 0) {
            largest = factor;
            n /= factor;
        } else {
            factor += factor === 2 ? 1 : 2;
        }
    }
    if (n > 1) largest = n;
    return largest > 1 ? String(largest) : null;
}

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
function romanToDecimal(value) {
    const text = clean(value).toUpperCase();
    if (!text || /[^IVXLCDM]/.test(text)) return null;
    let total = 0;
    for (let i = 0; i < text.length; i++) {
        const here = ROMAN[text[i]] ?? 0;
        const next = ROMAN[text[i + 1]] ?? 0;
        total += here < next ? -here : here;
    }
    return total > 0 ? String(total) : null;
}

function binaryDecode(data) {
    const groups = clean(data).split(/\s+/).filter(Boolean);
    if (!groups.length || groups.some(group => !/^[01]{8}$/.test(group))) return null;
    return groups.map(group => String.fromCharCode(parseInt(group, 2))).join("");
}

function xorDecode(data) {
    const raw = String(data ?? "");
    const split = raw.indexOf(";");
    if (split < 0) return null;
    const encrypted = raw.slice(0, split);
    const masks = raw.slice(split + 1).trim().split(/\s+/).filter(Boolean);
    if (masks.length !== encrypted.length || masks.some(mask => !/^[01]{8}$/.test(mask))) return null;
    return encrypted.split("").map((char, index) =>
        String.fromCharCode(char.charCodeAt(0) ^ parseInt(masks[index], 2))).join("");
}

const BASE_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function decodeBaseN(baseRaw, encodedRaw) {
    const base = Number(baseRaw);
    const encoded = clean(encodedRaw).toUpperCase();
    if (!(base > 1) || !encoded) return null;
    const pieces = encoded.split(".");
    if (pieces.length > 2) return null;
    let result = 0;
    const chars = pieces.join("");
    let power = pieces[0].length - 1;
    for (const char of chars) {
        const digit = BASE_DIGITS.indexOf(char);
        if (digit < 0 || digit >= Math.ceil(base)) return null;
        result += digit * base ** power;
        power -= 1;
    }
    return Number.isFinite(result) ? String(result) : null;
}

function parseCoreExpression(input) {
    let text = String(input ?? "")
        .replaceAll("ҳ", "*")
        .replaceAll("÷", "/")
        .replaceAll("➕", "+")
        .replaceAll("➖", "-")
        .replace(/\s+/g, "");
    // The game can deliberately inject code-like text at high difficulty. Never
    // eval it; simply decline automatic solving if anything except arithmetic
    // syntax remains.
    if (!text || /[^0-9.+\-*/()]/.test(text)) return null;
    let index = 0;
    const number = () => {
        const start = index;
        if (text[index] === "+" || text[index] === "-") index++;
        while (/[0-9.]/.test(text[index] ?? "")) index++;
        const value = Number(text.slice(start, index));
        if (!Number.isFinite(value)) throw new Error("number");
        return value;
    };
    const factor = () => {
        if (text[index] === "(") {
            index++;
            const value = expression();
            if (text[index] !== ")") throw new Error("paren");
            index++;
            return value;
        }
        return number();
    };
    const term = () => {
        let value = factor();
        while (text[index] === "*" || text[index] === "/") {
            const op = text[index++];
            const rhs = factor();
            value = op === "*" ? value * rhs : value / rhs;
        }
        return value;
    };
    const expression = () => {
        let value = term();
        while (text[index] === "+" || text[index] === "-") {
            const op = text[index++];
            const rhs = term();
            value = op === "+" ? value + rhs : value - rhs;
        }
        return value;
    };
    try {
        const value = expression();
        if (index !== text.length || !Number.isFinite(value)) return null;
        return String(value);
    } catch {
        return null;
    }
}

export function hasDarknetAccess(ns) {
    try { return ns.fileExists(DARKNET_NAVIGATOR, "home"); } catch { return false; }
}

/**
 * Safe first-pass candidate generation. Deterministic clue/exploit models are
 * solved directly; small dictionaries are attempted in bounded order. Models
 * that require interactive feedback are left for specialised feedback solvers.
 */
export function easyPasswordCandidates(details = {}) {
    const model = clean(details.modelId);
    const length = Math.max(0, Math.floor(Number(details.passwordLength) || 0));
    const data = details.data ?? "";
    const hinted = hintedStrings(details);
    const direct = [];

    if (model === "ZeroLogon") direct.push("");
    if (model === "DeskMemo_3.1") direct.push(echoCandidate(details));
    if (model === "CloudBlare(tm)") direct.push(captchaCandidate(data));
    if (model === "Pr0verFl0" && length > 0) direct.push("A".repeat(Math.min(100, length * 2)));
    if (model === "PrimeTime 2") direct.push(largestPrimeFactor(data));
    if (model === "BellaCuore" && clean(data) && !String(data).includes(",")) direct.push(romanToDecimal(data));
    if (model === "110100100") direct.push(binaryDecode(data));
    if (model === "OctantVoxel") {
        const [base, encoded] = String(data).split(",", 2);
        direct.push(decodeBaseN(base, encoded));
    }
    if (model === "MathML") direct.push(parseCoreExpression(data));
    if (model === "OrdoXenos") direct.push(xorDecode(data));

    if (model === "FreshInstall_1.0") direct.push(...DEFAULT_PASSWORDS);
    if (model === "Laika4") direct.push(...DOG_NAMES);
    if (model === "EuroZone Free") direct.push(...EU_COUNTRIES);
    if (model === "TopPass") direct.push(...COMMON_PASSWORDS);

    return uniq([...direct.filter(value => value != null && String(value).length <= 100), ...hinted])
        .slice(0, DARKNET_MAX_AUTO_CANDIDATES);
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
        isOnline: details.isOnline !== false,
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
        const authenticated = Boolean(prior.authenticated || message.authenticated || message.type === "auth-success");
        out.nodes[host] = { ...prior, ...message, authenticated, lastSeen: Number(message.at ?? now) };
        if (message.type === "auth-success" && !prior.authenticated) out.authenticated += 1;
        if (message.type === "cache-opened") out.cacheOpened += 1;
    }
    out.events.push({ ...message, at: Number(message.at ?? now) });
    if (out.events.length > 80) out.events.splice(0, out.events.length - 80);
    return out;
}
