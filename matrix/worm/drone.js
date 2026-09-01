/**
 * MATRIX-OS worm drone.
 *
 * The earner. Runs on an infected host and works one target forever.
 * Deliberately tiny so that even a 4 GB node (n00dles) can carry one.
 *
 * RAM budget: 2.40 GB  (enforced by tests/validate.mjs)
 *   1.60 base + 0.10 getServerMaxMoney + 0.10 getServerMoneyAvailable
 * + 0.10 getServerSecurityLevel + 0.10 getServerMinSecurityLevel
 * + 0.10 hack + 0.15 grow + 0.15 weaken
 *
 * args: [target]
 */
export async function main(ns) {
    const target = String(ns.args[0] ?? "n00dles");
    const maxMoney = ns.getServerMaxMoney(target);
    const minSecurity = ns.getServerMinSecurityLevel(target);

    while (true) {
        const security = ns.getServerSecurityLevel(target);
        const money = ns.getServerMoneyAvailable(target);

        // Keep the server near minimum security and near maximum money, then
        // harvest. Thresholds are loose because a drone has no coordination
        // with the other drones hitting the same target.
        if (security > minSecurity + 5) await ns.weaken(target);
        else if (maxMoney > 0 && money < maxMoney * 0.75) await ns.grow(target);
        else await ns.hack(target);
    }
}
