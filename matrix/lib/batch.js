/**
 * Pure rolling-HWGW scheduling helpers.
 *
 * Keep this library free of Netscript calls so its scheduling and placement
 * arithmetic can be exercised outside the game.
 */

/**
 * Stable in-flight pipeline depth for one target.
 *
 * A batch occupies four finish slots, each `gapMs` apart. The stable planning
 * weaken time therefore describes how many whole four-slot batches can be in
 * flight before the finish schedule wraps into itself.
 */
export function pipelineDepth(options = {}) {
    const {
        weakenTimeMs = 0,
        gapMs = 120,
        configuredMax = Infinity,
    } = options ?? {};

    const gap = Math.max(1, Number(gapMs) || 120);
    const weaken = Math.max(0, Number(weakenTimeMs) || 0);
    const bySchedule = weaken > 0
        ? Math.max(1, Math.floor(weaken / (gap * 4)))
        : 1;

    const ceiling = Number(configuredMax);
    const byConfig = Number.isFinite(ceiling) && ceiling > 0
        ? Math.max(1, Math.floor(ceiling))
        : Infinity;

    return Math.max(1, Math.min(bySchedule, byConfig));
}

/**
 * Compatibility helper retained for callers/tests that still ask "how many
 * batches fit by RAM and schedule". The rolling runtime uses pipelineDepth()
 * as the in-flight limit and live schedulability as the admission test.
 */
export function batchCapacity(options = {}) {
    const {
        freeRam = 0,
        batchRam = 0,
        weakenTimeMs = 0,
        gapMs = 120,
        configuredMax = Infinity,
    } = options ?? {};

    const ram = Math.max(0, Number(freeRam) || 0);
    const perBatch = Number(batchRam) || 0;
    if (perBatch <= 0 || ram < perBatch) return 0;

    const byRam = Math.floor(ram / perBatch);
    return Math.max(0, Math.min(
        byRam,
        pipelineDepth({ weakenTimeMs, gapMs, configuredMax }),
    ));
}

/**
 * Legacy compatibility allocator. The live hacking service no longer runs
 * finite waves, but keeping this pure helper avoids breaking tooling that still
 * imports it while the repository transitions.
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
    const reserve = Math.min(0.9, Math.max(0, Number(reserveFraction) || 0));
    const total = Math.max(0, Number(freeRam) || 0);
    const usable = Math.max(0, total * (1 - reserve));

    const plan = [];
    let remaining = usable;
    for (const entry of list.slice(0, Math.max(1, Math.floor(Number(maxTargets) || 1)))) {
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
    return {
        plan,
        used: usable - remaining,
        reserved: total - usable,
        remaining,
    };
}

/** Legacy pure helper retained for compatibility only. */
export function mergeWave(plan = [], makeEvents) {
    if (typeof makeEvents !== "function") return [];
    const events = [];
    for (const entry of Array.isArray(plan) ? plan : []) {
        if (!entry || !entry.host) continue;
        const produced = makeEvents(entry.host, entry.shape, entry.batches);
        if (Array.isArray(produced)) events.push(...produced.filter(Boolean));
    }
    return events.sort((a, b) =>
        (Number(a.finish) - Number(a.duration)) -
        (Number(b.finish) - Number(b.duration)));
}

/**
 * Allocate prep threads against a scalar RAM budget. Partial prep is useful, so
 * unlike HWGW admission this intentionally allows a partial target operation.
 */
export function allocatePrep(needs = [], options = {}) {
    const { freeRam = 0, maxTargets = 8, minThreads = 1 } = options ?? {};
    let remaining = Math.max(0, Number(freeRam) || 0);
    const plan = [];

    for (const need of (Array.isArray(needs) ? needs : [])
        .slice(0, Math.max(0, Math.floor(Number(maxTargets) || 0)))) {
        if (!need || !need.host) continue;
        const perThread = Number(need.ram) || 0;
        const wanted = Math.floor(Number(need.threads) || 0);
        if (perThread <= 0 || wanted < 1) continue;

        const threads = Math.min(wanted, Math.floor(remaining / perThread));
        if (threads < Math.max(1, Math.floor(Number(minThreads) || 1))) continue;

        plan.push({
            host: need.host,
            op: need.op,
            threads,
            ram: threads * perThread,
        });
        remaining -= threads * perThread;
        if (remaining <= 0) break;
    }

    return {
        plan,
        used: Math.max(0, (Number(freeRam) || 0) - remaining),
        remaining,
    };
}

/**
 * How many threads of one worker script fit in the current host fragments.
 */
export function placementCapacity(hosts = [], ramPerThread = 0) {
    const ram = Number(ramPerThread) || 0;
    if (ram <= 0) return 0;
    return (Array.isArray(hosts) ? hosts : []).reduce((sum, host) => {
        const free = Math.max(0, Number(host?.free) || 0);
        return sum + Math.floor(free / ram);
    }, 0);
}

/**
 * Pure atomic prospective placement for one H/W1/G/W2 batch.
 *
 * `hosts` is [{host, free}], normally already derived from workerHosts().
 * `components` is [{op, script, threads, ramPerThread, args?}].
 *
 * Placement deliberately mirrors the live executor's semantics: before each
 * component, sort by largest remaining free RAM and greedily consume hosts in
 * that order. If any component cannot fully fit, no caller-side execution
 * should occur.
 */
export function planBatchPlacement(hosts = [], components = []) {
    const virtual = (Array.isArray(hosts) ? hosts : [])
        .filter(h => h && h.host)
        .map(h => ({ host: h.host, free: Math.max(0, Number(h.free) || 0) }));

    const componentPlans = [];

    for (const component of Array.isArray(components) ? components : []) {
        const requested = Math.max(0, Math.floor(Number(component?.threads) || 0));
        const ram = Number(component?.ramPerThread) || 0;
        if (!component || !component.op || !component.script || requested < 1 || ram <= 0) {
            return {
                ok: false,
                failed: {
                    op: component?.op ?? null,
                    requestedThreads: requested,
                    placeableThreads: 0,
                    missingThreads: requested,
                    requestedRam: requested * Math.max(0, ram),
                    placeableRam: 0,
                    missingRam: requested * Math.max(0, ram),
                    nominalFreeRam: virtual.reduce((s, h) => s + h.free, 0),
                    schedulableRam: 0,
                    fragmentationRam: virtual.reduce((s, h) => s + h.free, 0),
                },
                components: componentPlans,
            };
        }

        virtual.sort((a, b) => b.free - a.free || a.host.localeCompare(b.host));

        const nominalFreeRam = virtual.reduce((s, h) => s + h.free, 0);
        const schedulableThreads = placementCapacity(virtual, ram);
        const schedulableRam = schedulableThreads * ram;
        const fragmentationRam = Math.max(0, nominalFreeRam - schedulableRam);

        let remaining = requested;
        const placements = [];

        for (const host of virtual) {
            if (remaining <= 0) break;
            const fit = Math.floor(host.free / ram);
            if (fit <= 0) continue;
            const use = Math.min(fit, remaining);
            placements.push({ host: host.host, threads: use });
            host.free -= use * ram;
            remaining -= use;
        }

        if (remaining > 0) {
            const placed = requested - remaining;
            return {
                ok: false,
                failed: {
                    op: component.op,
                    script: component.script,
                    requestedThreads: requested,
                    placeableThreads: placed,
                    missingThreads: remaining,
                    requestedRam: requested * ram,
                    placeableRam: placed * ram,
                    missingRam: remaining * ram,
                    nominalFreeRam,
                    schedulableRam,
                    fragmentationRam,
                },
                components: componentPlans,
            };
        }

        componentPlans.push({
            ...component,
            requestedThreads: requested,
            placements,
            requestedRam: requested * ram,
            nominalFreeRam,
            schedulableRam,
            fragmentationRam,
        });
    }

    return {
        ok: true,
        components: componentPlans,
        remainingHosts: virtual,
    };
}

/**
 * A unique trailing argument for every ns.exec call.
 */
let execSequence = 0;
export function execTag(now = Date.now()) {
    execSequence = (execSequence + 1) % Number.MAX_SAFE_INTEGER;
    return `${Number(now).toString(36)}.${execSequence.toString(36)}`;
}
