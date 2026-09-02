/**
 * Shared terminal-tail renderer for the lite MATRIX stages.
 *
 * The tail font renders emoji two columns wide but padEnd() counts code points,
 * which is why an unguarded box drifts open on the right. Everything here pads
 * and clips on DISPLAY WIDTH instead.
 *
 * matrix/bootstrap.js deliberately keeps its own copy of these helpers: it must
 * stay import-free to survive on an 8 GB home, because Bitburner bills an
 * import's RAM to the importer.
 */
export const WIDTH = 58;

export function cols(text) {
    let n = 0;
    for (const ch of String(text)) {
        const cp = ch.codePointAt(0);
        if (cp === 0xFE0F || cp === 0x200D) continue;
        n += (cp >= 0x1F300 && cp <= 0x1FAFF)
            || (cp >= 0x2600 && cp <= 0x27BF)
            || (cp >= 0x23E9 && cp <= 0x23FA)
            || (cp >= 0x2B00 && cp <= 0x2BFF) ? 2 : 1;
    }
    return n;
}

export function clip(text, max) {
    let out = "";
    let n = 0;
    for (const ch of String(text)) {
        const w = cols(ch);
        if (n + w > max) break;
        out += ch;
        n += w;
    }
    return out;
}

export function row(icon, label, value) {
    const prefix = `  ${icon} ${String(label).padEnd(11)} : `;
    const body = prefix + clip(value, WIDTH - cols(prefix));
    return `║${body}${" ".repeat(Math.max(0, WIDTH - cols(body)))}║`;
}

export function center(text) {
    const pad = WIDTH - cols(text);
    const left = Math.floor(pad / 2);
    return `║${" ".repeat(Math.max(0, left))}${text}${" ".repeat(Math.max(0, pad - left))}║`;
}

export function rule(title) {
    if (!title) return `╠${"═".repeat(WIDTH)}╣`;
    const pad = WIDTH - cols(title) - 2;
    const left = Math.floor(pad / 2);
    return `╠${"═".repeat(Math.max(0, left))} ${title} ${"═".repeat(Math.max(0, pad - left))}╣`;
}

export const top = () => `╔${"═".repeat(WIDTH)}╗`;
export const bottom = () => `╚${"═".repeat(WIDTH)}╝`;

export function bar(fraction, size = 16) {
    const fill = Math.max(0, Math.min(size, Math.floor((Number(fraction) || 0) * size)));
    return "█".repeat(fill) + "░".repeat(size - fill);
}

/** Read the worm's botnet report from netscript port 1 (0 GB). */
export function readWorm(ns, port = 1, maxAgeMs = 90_000) {
    try {
        const raw = ns.peek(port);
        if (!raw || raw === "NULL PORT DATA") return null;
        const parsed = JSON.parse(raw);
        return Date.now() - Number(parsed.updated ?? 0) < maxAgeMs ? parsed : null;
    } catch {
        return null;
    }
}
