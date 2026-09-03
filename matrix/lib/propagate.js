/**
 * Keeping the network's copy of MATRIX current.
 *
 * The bug this fixes: every deploy site copied a worker only when it was
 * MISSING - `if (!ns.fileExists(script, host)) scp(...)`. So the first time a
 * server was used it received whatever version was current, and then kept that
 * copy forever. After an update, home ran the new code and ninety-odd servers
 * ran the old one, indefinitely and invisibly.
 *
 * Detection is the hard part, not the copying: ns.scp is instant, so there is
 * nothing to gain from spreading in a tree - the same number of instant calls
 * happen either way. What was missing was knowing WHICH hosts are behind.
 *
 * The trick is a version-stamped filename. Home writes /matrix/build-<v>.txt and
 * ships it with every push; a host is current if and only if that exact file
 * exists on it. That makes the check a single fileExists per host, needs no way
 * to read a remote file's contents (there isn't one), and self-corrects when a
 * server is deleted and repurchased.
 *
 * Pure functions - no ns - so the sweep policy is testable.
 */

/** The marker whose presence means "this host has build <version>". */
export function stampFile(version) {
    const clean = String(version ?? "").trim().replace(/[^\w.\-]/g, "") || "unknown";
    return `/matrix/build-${clean}.txt`;
}

/**
 * Files that must exist on a worker host. Long-running ones are listed with
 * `resident: true` because a running script keeps the code it started with -
 * copying over it changes nothing until the process is restarted.
 */
export const REMOTE_FILES = [
    { path: "/matrix/workers/hack.js", resident: false },
    { path: "/matrix/workers/grow.js", resident: false },
    { path: "/matrix/workers/weaken.js", resident: false },
    { path: "/matrix/workers/share.js", resident: true },
    { path: "/matrix/workers/early.js", resident: true },
    { path: "/matrix/lib/earlyloop.js", resident: false },
    { path: "/matrix/worm/spread.js", resident: true },
    { path: "/matrix/worm/drone.js", resident: true },
];

/** Long-running scripts that have to be killed to pick up a new build. */
export function residentScripts() {
    return REMOTE_FILES.filter(file => file.resident).map(file => file.path);
}

/**
 * Which hosts to refresh this cycle.
 *
 * `isCurrent(host)` is supplied by the caller and is the fileExists check. The
 * sweep is bounded per cycle: refreshing hundreds of hosts in one pass would
 * stall the supervisor loop for no benefit, because a host that waits one cycle
 * is simply current a few seconds later.
 */
export function staleHosts(hosts = [], isCurrent, options = {}) {
    const { limit = 12, skip = ["home"] } = options ?? {};
    if (typeof isCurrent !== "function") return [];
    const skipped = new Set(Array.isArray(skip) ? skip : []);
    const out = [];
    for (const host of Array.isArray(hosts) ? hosts : []) {
        if (typeof host !== "string" || !host || skipped.has(host)) continue;
        let current = true;
        try { current = Boolean(isCurrent(host)); } catch { current = true; }
        if (current) continue;
        out.push(host);
        if (out.length >= Math.max(1, limit)) break;
    }
    return out;
}

/**
 * Whether a full network sweep is even needed: if the build has not changed
 * since the last completed sweep, every host is current and the per-host
 * fileExists calls are pure waste.
 */
export function sweepNeeded(currentVersion, sweptVersion) {
    const now = String(currentVersion ?? "").trim();
    if (!now) return false;
    return now !== String(sweptVersion ?? "").trim();
}
