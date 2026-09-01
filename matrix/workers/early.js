export async function main(ns) {
    const target = String(ns.args[0] ?? "n00dles");
    while (true) {
        const sec = ns.getServerSecurityLevel(target);
        const min = ns.getServerMinSecurityLevel(target);
        const money = ns.getServerMoneyAvailable(target);
        const max = ns.getServerMaxMoney(target);
        if (sec > min + 5) await ns.weaken(target);
        else if (max > 0 && money < max * 0.80) await ns.grow(target);
        else await ns.hack(target);
    }
}
