/**
 * Stanek's Gift - charge policy.
 *
 * A placed fragment does nothing until it is charged, and each fragment's charge
 * has diminishing returns, so the right policy is to keep every fragment level
 * rather than pouring everything into the strongest one. Pure functions: no ns,
 * so the policy is testable without a Gift.
 */

/** The fragment most in need of charge, ignoring malformed entries. */
export function weakestFragment(fragments = []) {
    fragments = fragments ?? [];
    // Number(null) is 0, which is finite - so a null coordinate would sail
    // through a bare isFinite check and get handed to chargeFragment.
    const coord = value => value != null && value !== "" && Number.isFinite(Number(value));
    const usable = (Array.isArray(fragments) ? fragments : [])
        .filter(f => f && coord(f.x) && coord(f.y));
    if (!usable.length) return null;
    return usable.reduce((worst, f) =>
        Number(f.numCharge ?? 0) < Number(worst.numCharge ?? 0) ? f : worst, usable[0]);
}

/**
 * Hosts that can run a charge pass, biggest first. chargeFragment() scales with
 * threads, so one wide host beats several narrow ones.
 */
export function chargeHosts(hosts = [], scriptRam = 2.0) {
    hosts = hosts ?? [];
    const ram = Number(scriptRam) > 0 ? Number(scriptRam) : 2.0;
    return (Array.isArray(hosts) ? hosts : [])
        .filter(h => h && typeof h.host === "string")
        .map(h => ({ host: h.host, threads: Math.floor(Math.max(0, Number(h.free) || 0) / ram) }))
        .filter(h => h.threads > 0)
        .sort((a, b) => b.threads - a.threads || a.host.localeCompare(b.host));
}
