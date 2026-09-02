/**
 * Exactly-one-process enforcement, by voluntary stand-down.
 *
 * "Multiple overlapping dashboard tails" is a documented prior failure mode. The
 * obvious fix - have the owner kill the duplicates - makes it WORSE: ns.kill()
 * terminates the victim instantly, so the victim never runs its own closeTail(),
 * and closing another script's tail by PID is not reliable. The result is a dead
 * process behind a window nothing can close.
 *
 * So nobody kills anybody. Lowest PID wins; every other instance notices on its
 * next poll, closes ITS OWN tail - which always works - and returns. The rule is
 * total and stable, so this converges and cannot oscillate.
 *
 * Costs the caller ns.ps (0.2) only. ui.closeTail is free.
 */
export function isSingletonOwner(ns, script) {
    const normalise = value => String(value).replace(/^\/+/, "");
    const target = normalise(script);
    const self = ns.pid;
    return !ns.ps("home").some(entry =>
        normalise(entry.filename) === target && entry.pid !== self && entry.pid < self);
}

/**
 * Stand down if another instance owns this script.
 * @returns {boolean} true while this process should keep running.
 */
export function holdSingleton(ns, script) {
    if (isSingletonOwner(ns, script)) return true;
    try { ns.ui.closeTail(); } catch {}
    return false;
}

/**
 * Lease arbitration over a shared file.
 *
 * Every previous attempt had EVERY instance writing the lock every 2 s. That is
 * not a lock, it is a shared mutable variable with concurrent writers: whichever
 * process wrote last wins the next read, so ownership thrashes and instances
 * take turns standing down forever. Adding PID ordering did not help - it only
 * changed who won the race.
 *
 * bootstrap.js has always done it correctly and is the model here: a challenger
 * NEVER writes the lock. Only the holder renews it, and a lease is taken over
 * solely when it has gone stale.
 *
 * Pure, so the concurrent behaviour can be simulated rather than assumed.
 *
 * @returns {"claim"|"renew"|"stand-down"}
 */
export function leaseDecision(record, selfPid, now = Date.now(), maxAgeMs = 6000) {
    if (!record || !record.pid) return "claim";              // nobody holds it
    if (record.pid === selfPid) return "renew";              // we hold it
    if (now - Number(record.updated ?? 0) >= maxAgeMs) return "claim";  // holder is gone
    return "stand-down";                                     // someone else holds it
}
