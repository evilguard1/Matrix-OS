import { config, managerBudget, writeState, event, readJson, STATE_DIR, hasSF } from "/matrix/lib/common.js";
import { hashPlan } from "/matrix/lib/hashes.js";

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

const UPGRADE_COUNT = `${STATE_DIR}/hacknet-server-upgrades.txt`;

export async function main(ns) {
    ns.disableLog("ALL");
    // The per-server hash upgrade cap is a lifetime count, not a per-run one, so
    // it has to survive restarts or MATRIX would buy past the cap and waste them.
    let serverUpgrades = Number(readJson(ns, UPGRADE_COUNT, {}).count ?? 0) || 0;
    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled === false || cfg.automation?.hacknet === false) {
            await writeState(ns, "hacknet", {status:"paused"});
            await ns.sleep(5000); continue;
        }

        try {
            const budget = managerBudget(ns, "hacknet", cfg);
            let remaining = budget;
            let bought = 0;
            for (let n=0;n<8;n++) {
                const x = cheapestUpgrade(ns);
                if (!x || x.cost > remaining) break;
                if (!execute(ns,x)) break;
                remaining -= x.cost;
                bought++;
            }

            const spent = [];
            let production = 0;
            let capacity = null;
            let hashes = null;
            for (let i=0;i<ns.hacknet.numNodes();i++) production += ns.hacknet.getNodeStats(i).production ?? 0;
            // Hashes are a compounding resource; selling them for cash spends
            // that compounding once. Improving the server the batcher already
            // farms pays out on every batch for the rest of the BitNode.
            try {
                hashes = ns.hacknet.numHashes();
                capacity = ns.hacknet.hashCapacity();
                const reset = ns.getResetInfo();
                const target = readJson(ns, `${STATE_DIR}/hacking.txt`, {})?.target ?? null;
                for (let i = 0; i < 40; i++) {
                    const plan = hashPlan({
                        hashes: ns.hacknet.numHashes(),
                        capacity,
                        available: ns.hacknet.getHashUpgrades(),
                        target,
                        serverUpgrades,
                        costOf: name => ns.hacknet.hashCost(name),
                        bladeburner: hasSF(reset, 6) || hasSF(reset, 7),
                        corporation: hasSF(reset, 3),
                    });
                    const next = plan[0];
                    if (!next) break;
                    if (!ns.hacknet.spendHashes(next.upgrade, next.target ?? undefined)) break;
                    if (next.target) serverUpgrades++;
                    spent.push(next);
                }
                hashes = ns.hacknet.numHashes();
            } catch {}
            if (spent.some(entry => entry.target)) {
                await ns.write(UPGRADE_COUNT, JSON.stringify({ count: serverUpgrades }), "w");
            }
            if (spent.length) {
                const first = spent[0];
                await event(ns, "hacknet",
                    `Spent hashes: ${spent.length}x - ${first.upgrade}${first.target ? ` on ${first.target}` : ""} (${first.why})`,
                    "success");
            }

            if (bought) await event(ns,"hacknet",`Purchased ${bought} Hacknet upgrade(s)`,"success");
            // Netburners wants total hacknet levels/RAM/cores. This service
            // already pays for the Hacknet API, so it publishes the totals and
            // telemetry reads them for free instead of buying the API again.
            const totals={levels:0,ram:0,cores:0};
            for(let i=0;i<ns.hacknet.numNodes();i++){
                const node=ns.hacknet.getNodeStats(i);
                totals.levels+=node.level??0; totals.ram+=node.ram??0; totals.cores+=node.cores??0;
            }
            await writeState(ns, "hacknet", {
                status:"online", nodes:ns.hacknet.numNodes(), production, hashes, capacity, upgrades:bought,
                hashSpends:spent.slice(0,4), serverUpgrades,
                totals
            });
        } catch(e) {
            await writeState(ns,"hacknet",{status:"error",error:String(e)});
        }
        await ns.sleep(8000);
    }
}
