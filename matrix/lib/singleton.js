/**
 * Exactly-one-process enforcement.
 *
 * "Multiple overlapping dashboard tails" is a documented prior failure mode of
 * this project, and a startup-only check cannot prevent it: two supervisors
 * restarting a second apart each see no other deck and both survive, and neither
 * ever re-checks.
 *
 * Lowest PID wins, deterministically. The owner actively kills newer duplicates;
 * a loser closes its tail and exits. Because the rule is total and stable, this
 * converges to one process and cannot oscillate.
 *
 * Costs the caller ns.ps (0.2) + ns.kill (0.5). ui.closeTail is free.
 */
export function claimSingleton(ns, script) {
    const normalise = value => String(value).replace(/^\/+/, "");
    const target = normalise(script);
    const self = ns.pid;

    const others = ns.ps("home").filter(entry => normalise(entry.filename) === target && entry.pid !== self);
    // Someone older owns it. We are the duplicate.
    if (others.some(entry => entry.pid < self)) return false;

    for (const entry of others) {
        try { ns.ui.closeTail(entry.pid); } catch {}
        try { ns.kill(entry.pid); } catch {}
    }
    return true;
}
