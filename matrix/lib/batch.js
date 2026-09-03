/**
 * How much of the network a wave should actually use.
 *
 * The batcher was leaving 98% of the network idle, for two compounding reasons:
 *
 *  1. A flat `maxBatches: 24` cap, unrelated to anything real. The true limit on
 *     concurrent batches against one target is the SCHEDULE: a batch occupies
 *     four launch slots spaced `gap` apart, and finishes a weaken-time later, so
 *     roughly weakenTime / (4 * gap) of them can be in flight before they start
 *     colliding. With a 60s weaken and a 120ms gap that is ~125, not 24.
 *
 *  2. One target. A single server's batch shape has a fixed size, so no matter
 *     how much RAM exists, one target can only absorb schedule-capacity worth of
 *     it. Reaching a 95-server, 800 TB network takes many targets at once.
 *
 * Pure functions on plain numbers - no ns - so the allocation is testable
 * without a game, which matters because this decides the whole income rate.
 */

/**
 * Concurrent batches one target can absorb.
 *
 * Bounded by three things at once: the RAM available, the schedule, and an
 * explicit configured ceiling if the player wants one.
 */
export function batchCapacity(options = {}) {
    const {
        freeRam = 0,
        batchRam = 0,
        weakenTimeMs = 0,
        gapMs = 120,
        configuredMax = Infinity,
    } = options ?? {};

    const ram = Number(freeRam) || 0;
    const perBatch = Number(batchRam) || 0;
    if (perBatch <= 0 || ram < perBatch) return 0;

    const byRam = Math.floor(ram / perBatch);
    const gap = Math.max(1, Number(gapMs) || 120);
    const weaken = Number(weakenTimeMs) || 0;
    // Four launches per batch, each `gap` apart, and the whole thing clears in a
    // weaken-time. Anything beyond this overlaps and fights itself.
    const bySchedule = weaken > 0 ? Math.max(1, Math.floor(weaken / (gap * 4))) : byRam;
    const ceiling = Number(configuredMax);
    const byConfig = Number.isFinite(ceiling) && ceiling > 0 ? ceiling : Infinity;

    return Math.max(0, Math.min(byRam, bySchedule, byConfig));
}

/**
 * Spread a wave across as many targets as the RAM supports.
 *
 * Targets arrive best-first. Each takes as much as its own schedule allows, and
 * whatever is left flows to the next one down - which is the only way a network
 * this size gets used. `reserveFraction` holds a slice back so a wave never
 * consumes the last byte and starves prep and the worm.
 */
export function allocateWave(targets = [], options = {}) {
    const {
        freeRam = 0,
        gapMs = 120,
        configuredMax = Infinity,
        maxTargets = 12,
        reserveFraction = 0.05,
    } = options ?? {};

    const list = (Array.isArray(targets) ? targets : [])
        .filter(entry => entry && entry.host && Number(entry.shape?.ram) > 0);
    const usable = Math.max(0, (Number(freeRam) || 0) * (1 - Math.min(0.9, Math.max(0, reserveFraction))));

    const plan = [];
    let remaining = usable;
    for (const entry of list.slice(0, Math.max(1, maxTargets))) {
        const batches = batchCapacity({
            freeRam: remaining,
            batchRam: entry.shape.ram,
            weakenTimeMs: entry.shape.wTime,
            gapMs,
            configuredMax,
        });
        if (batches < 1) continue;
        const ram = batches * entry.shape.ram;
        plan.push({ host: entry.host, shape: entry.shape, batches, ram });
        remaining -= ram;
        if (remaining < 1) break;
    }
    return { plan, used: usable - remaining, reserved: (Number(freeRam) || 0) - usable, remaining };
}

/**
 * Merge each target's batch events into one wave ordered by launch time, so a
 * single scheduling loop drives every target at once.
 *
 * `makeEvents(host, shape, batches)` is supplied by the caller, because building
 * an event needs the game's timings; this only orders the result.
 */
export function mergeWave(plan = [], makeEvents) {
    if (typeof makeEvents !== "function") return [];
    const events = [];
    for (const entry of Array.isArray(plan) ? plan : []) {
        if (!entry || !entry.host) continue;
        const produced = makeEvents(entry.host, entry.shape, entry.batches);
        if (Array.isArray(produced)) events.push(...produced.filter(Boolean));
    }
    // Launch order, not finish order: the loop sleeps until each launch moment.
    return events.sort((a, b) =>
        (Number(a.finish) - Number(a.duration)) - (Number(b.finish) - Number(b.duration)));
}

/**
 * What to do with the RAM a wave does not use.
 *
 * Hosts are only RAM - a weaken thread helps its target wherever it runs, so
 * spreading across 95 servers is already automatic. The limit is TARGETS: extra
 * weakens against a server already at minimum security do nothing at all.
 *
 * So the leftover goes into preparing the servers that are not yet batchable.
 * That is not idle time twice over: grow and weaken both pay hacking experience
 * while they run, and each server they finish joins the wave rotation and starts
 * paying money.
 *
 * `needs` arrives as [{ host, op, threads, ram }] - the caller works out how
 * many threads each server actually wants, because that needs the game's
 * formulas. This decides who gets them.
 */
export function allocatePrep(needs = [], options = {}) {
    const { freeRam = 0, maxTargets = 8, minThreads = 1 } = options ?? {};
    let remaining = Math.max(0, Number(freeRam) || 0);
    const plan = [];
    for (const need of (Array.isArray(needs) ? needs : []).slice(0, Math.max(0, maxTargets))) {
        if (!need || !need.host) continue;
        const perThread = Number(need.ram) || 0;
        const wanted = Math.floor(Number(need.threads) || 0);
        if (perThread <= 0 || wanted < 1) continue;
        // Take as much of the need as fits; a partial pass still lowers security
        // and still earns experience, so it is worth launching.
        const threads = Math.min(wanted, Math.floor(remaining / perThread));
        if (threads < minThreads) continue;
        plan.push({ host: need.host, op: need.op, threads, ram: threads * perThread });
        remaining -= threads * perThread;
        if (remaining <= 0) break;
    }
    return { plan, used: Math.max(0, (Number(freeRam) || 0) - remaining), remaining };
}
