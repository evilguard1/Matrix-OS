import { config, reserveMoney, writeState, event } from "/matrix/lib/common.js";

function powersUpTo(limit) {
    const out = [];
    for (let r = 2; r <= limit; r *= 2) out.push(r);
    return out;
}

export async function main(ns) {
    ns.disableLog("ALL");
    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled === false || cfg.automation?.cloud === false) {
            await writeState(ns, "cloud", { status:"paused" });
            await ns.sleep(5000);
            continue;
        }

        try {
            const cash = ns.getServerMoneyAvailable("home");
            const reserve = reserveMoney(ns, cfg);
            const spendable = Math.max(0, Math.min(cash-reserve, cash*(cfg.economy?.cloudBudgetFraction ?? 0.12)));
            const limit = ns.cloud.getServerLimit();
            const ramLimit = ns.cloud.getRamLimit();
            let names = ns.cloud.getServerNames();
            let action = "hold";

            if (spendable > 0 && names.length < limit) {
                let chosen = 0;
                for (const ram of powersUpTo(ramLimit)) {
                    if (ns.cloud.getServerCost(ram) <= spendable / Math.max(1, Math.min(4, limit-names.length))) chosen = ram;
                }
                if (chosen >= 2) {
                    const host = ns.cloud.purchaseServer("mx-node", chosen);
                    if (host) {
                        action = `purchased ${host} ${chosen}GB`;
                        await event(ns, "cloud", action, "success");
                        names = ns.cloud.getServerNames();
                    }
                }
            }

            if (spendable > 0 && names.length) {
                const weakest = names.map(h => ({h, r:ns.getServerMaxRam(h)})).sort((a,b)=>a.r-b.r)[0];
                if (weakest && weakest.r < ramLimit) {
                    const next = Math.min(ramLimit, weakest.r*2);
                    const cost = ns.cloud.getServerUpgradeCost(weakest.h, next);
                    if (cost > 0 && cost <= spendable) {
                        if (ns.cloud.upgradeServer(weakest.h, next)) {
                            action = `upgraded ${weakest.h} ${weakest.r}→${next}GB`;
                            await event(ns, "cloud", action, "success");
                        }
                    }
                }
            }

            const totalRam = names.reduce((s,h)=>s+ns.getServerMaxRam(h),0);
            await writeState(ns, "cloud", {
                status:"online", servers:names.length, limit, totalRam, ramLimit, action
            });
        } catch (e) {
            await writeState(ns, "cloud", { status:"error", error:String(e) });
        }
        await ns.sleep(10_000);
    }
}
