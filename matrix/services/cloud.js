import { config, managerBudget, writeState, event } from "/matrix/lib/common.js";
import { spendMoney } from "/matrix/lib/budget-ledger.js";

// Largest MATRIX worker (matrix/workers/early.js and matrix/worm/drone.js).
const WORKER_RAM = 2.4;

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
            let spendable = managerBudget(ns, "cloud", cfg);
            const limit = ns.cloud.getServerLimit();
            const ramLimit = ns.cloud.getRamLimit();
            let names = ns.cloud.getServerNames();
            let action = "hold";

            if (spendable > 0 && names.length < limit) {
                // Never buy a server too small to host a worker. MATRIX's worker is
                // 2.4 GB, so anything under 8 GB is dead weight bought at full price.
                // Pace the spend across the remaining server slots.
                const slots = Math.max(1, Math.min(4, limit - names.length));
                let chosen = 0;
                for (let ram = 8; ram <= ramLimit; ram *= 2) {
                    const price = ns.cloud.getServerCost(ram);
                    if (Number.isFinite(price) && price > 0 && price <= spendable / slots) chosen = ram;
                    else break;
                }
                if (chosen > 0) {
                    const cost = ns.cloud.getServerCost(chosen);
                    let host = "";
                    const receipt = spendMoney(ns, { owner: "cloud", limit: spendable / slots,
                        quote: () => ns.cloud.getServerCost(chosen), execute: () => host = ns.cloud.purchaseServer("mx-node", chosen) });
                    if (receipt.status === "spent") {
                        spendable = Math.max(0, spendable - cost);
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
                        const receipt = spendMoney(ns, { owner: "cloud", limit: spendable,
                            quote: () => ns.cloud.getServerUpgradeCost(weakest.h, next),
                            execute: () => ns.cloud.upgradeServer(weakest.h, next) });
                        if (receipt.status === "spent") {
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
