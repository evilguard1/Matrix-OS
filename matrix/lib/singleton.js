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
