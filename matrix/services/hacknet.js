import { config, reserveMoney, writeState, event } from "/matrix/lib/common.js";

function cheapestUpgrade(ns) {
    const options = [];
    const newCost = ns.hacknet.getPurchaseNodeCost();
    if (Number.isFinite(newCost)) options.push({ cost:newCost, kind:"node", i:-1 });
    for (let i=0;i<ns.hacknet.numNodes();i++) {
        options.push(
            { cost:ns.hacknet.getLevelUpgradeCost(i,1), kind:"level", i },
            { cost:ns.hacknet.getRamUpgradeCost(i,1), kind:"ram", i },
            { cost:ns.hacknet.getCoreUpgradeCost(i,1), kind:"core", i },
        );
    }
    return options.filter(x=>Number.isFinite(x.cost) && x.cost>0).sort((a,b)=>a.cost-b.cost)[0] ?? null;
}

function execute(ns, x) {
    if (!x) return false;
    if (x.kind==="node") return ns.hacknet.purchaseNode() >= 0;
    if (x.kind==="level") return ns.hacknet.upgradeLevel(x.i,1);
    if (x.kind==="ram") return ns.hacknet.upgradeRam(x.i,1);
    if (x.kind==="core") return ns.hacknet.upgradeCore(x.i,1);
    return false;
}

export async function main(ns) {
    ns.disableLog("ALL");
    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled === false || cfg.automation?.hacknet === false) {
            await writeState(ns, "hacknet", {status:"paused"});
            await ns.sleep(5000); continue;
        }

        try {
            const cash = ns.getServerMoneyAvailable("home");
            const reserve = reserveMoney(ns,cfg);
            const budget = Math.max(0, Math.min(cash-reserve, cash*(cfg.economy?.hacknetBudgetFraction ?? 0.04)));
            let bought = 0;
            for (let n=0;n<8;n++) {
                const x = cheapestUpgrade(ns);
                if (!x || x.cost > budget) break;
                if (!execute(ns,x)) break;
                bought++;
            }

            let production = 0;
            let capacity = null;
            let hashes = null;
            for (let i=0;i<ns.hacknet.numNodes();i++) production += ns.hacknet.getNodeStats(i).production ?? 0;
            try {
                hashes = ns.hacknet.numHashes();
                capacity = ns.hacknet.hashCapacity();
                if (capacity > 0 && hashes > capacity*0.80) {
                    const upgrades = ns.hacknet.getHashUpgrades();
                    if (upgrades.includes("Sell for Money")) {
                        for (let i=0;i<50 && ns.hacknet.numHashes() > capacity*0.50;i++) {
                            if (!ns.hacknet.spendHashes("Sell for Money")) break;
                        }
                    }
                }
            } catch {}

            if (bought) await event(ns,"hacknet",`Purchased ${bought} Hacknet upgrade(s)`,"success");
            await writeState(ns, "hacknet", {
                status:"online", nodes:ns.hacknet.numNodes(), production, hashes, capacity, upgrades:bought
            });
        } catch(e) {
            await writeState(ns,"hacknet",{status:"error",error:String(e)});
        }
        await ns.sleep(8000);
    }
}
