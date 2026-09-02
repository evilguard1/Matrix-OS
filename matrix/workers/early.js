import { nextAction } from "/matrix/lib/earlyloop.js";

/**
 * The early-game worker. One decision, taken thousands of times a second across
 * every rooted box, so the policy lives in a tested library rather than here.
 */
export async function main(ns) {
    const target = String(ns.args[0] ?? "n00dles");
    while (true) {
        const action = nextAction({
            security: ns.getServerSecurityLevel(target),
            minSecurity: ns.getServerMinSecurityLevel(target),
            money: ns.getServerMoneyAvailable(target),
            maxMoney: ns.getServerMaxMoney(target),
        });
        if (action === "weaken") await ns.weaken(target);
        else if (action === "grow") await ns.grow(target);
        else await ns.hack(target);
    }
}
