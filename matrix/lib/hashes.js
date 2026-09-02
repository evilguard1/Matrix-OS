/**
 * What to buy with hacknet hashes.
 *
 * Selling hashes for money is the obvious use and the worst one. Two upgrades
 * permanently improve the server the batcher is already farming - lowering its
 * minimum security makes every weaken cheaper, and raising its maximum money
 * raises the ceiling every hack draws from. Both compound with every batch for
 * the rest of the BitNode, which cash does not.
 *
 * Pure policy: no ns, so the ordering is testable without a hacknet.
 */

// Server upgrades are capped in game; past the cap the purchase silently wastes
// hashes, so the planner stops asking after enough of them.
export const SERVER_UPGRADE_LIMIT = 12;

/**
 * The spend plan, best first. Everything here is checked against what the game
 * actually offers - `available` comes from ns.hacknet.getHashUpgrades() - so an
 * upgrade absent from this BitNode is simply never proposed.
 */
export function hashPlan({
    hashes = 0,
    capacity = 0,
    available = [],
    target = null,
    serverUpgrades = 0,
    costOf = () => Infinity,
    wantContracts = true,
    bladeburner = false,
    corporation = false,
} = {}) {
    const offered = new Set(Array.isArray(available) ? available : []);
    const plan = [];
    const affordable = name => {
        if (!offered.has(name)) return false;
        const cost = Number(costOf(name));
        return Number.isFinite(cost) && cost > 0 && cost <= hashes;
    };

    // 1. Permanently improve the server the batcher already farms. These two are
    //    the only hash spends that raise income forever rather than once.
    if (target && serverUpgrades < SERVER_UPGRADE_LIMIT) {
        if (affordable("Reduce Minimum Security")) {
            plan.push({ upgrade: "Reduce Minimum Security", target, why: `cheaper weakens on ${target} forever` });
        }
        if (affordable("Increase Maximum Money")) {
            plan.push({ upgrade: "Increase Maximum Money", target, why: `raises the ceiling every hack draws from ${target}` });
        }
    }

    // 2. Source-File specific sinks that outvalue cash when they are available.
    if (bladeburner && affordable("Exchange for Bladeburner Rank")) {
        plan.push({ upgrade: "Exchange for Bladeburner Rank", target: null, why: "rank gates the black operations" });
    }
    if (bladeburner && affordable("Exchange for Bladeburner SP")) {
        plan.push({ upgrade: "Exchange for Bladeburner SP", target: null, why: "skill points compound" });
    }
    if (corporation && affordable("Exchange for Corporation Research")) {
        plan.push({ upgrade: "Exchange for Corporation Research", target: null, why: "research multiplies every division" });
    }

    // 3. A coding contract is worth far more than the hashes it costs, and
    //    MATRIX already solves 28 contract types automatically.
    if (wantContracts && affordable("Generate Coding Contract")) {
        plan.push({ upgrade: "Generate Coding Contract", target: null, why: "MATRIX solves these automatically" });
    }

    // 4. Only dump to cash when the pool is about to overflow and be wasted.
    if (capacity > 0 && hashes > capacity * 0.8 && affordable("Sell for Money")) {
        plan.push({ upgrade: "Sell for Money", target: null, why: "pool is near capacity - spend it before it is wasted" });
    }

    return plan;
}

/** The single next purchase, or null when nothing is worth buying yet. */
export function nextHashSpend(state) {
    return hashPlan(state)[0] ?? null;
}
