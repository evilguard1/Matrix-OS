import { config, writeState } from "/matrix/lib/common.js";

export async function main(ns) {
    ns.disableLog("ALL");
    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled===false || cfg.automation?.sleeves===false) {
            await writeState(ns,"sleeves",{status:"paused"}); await ns.sleep(5000); continue;
        }
        try {
            const n = ns.sleeve.getNumSleeves();
            const data = [];
            const player = ns.getPlayer();
            for (let i=0;i<n;i++) {
                const s = ns.sleeve.getSleeve(i);
                let assignment = "idle";
                if (s.shock > 15) {
                    ns.sleeve.setToShockRecovery(i); assignment="shock recovery";
                } else if (s.sync < 100) {
                    ns.sleeve.setToSynchronize(i); assignment="synchronize";
                } else if (player.karma > -54000) {
                    ns.sleeve.setToCommitCrime(i,ns.enums.CrimeType.homicide); assignment="homicide";
                } else {
                    const studying = ns.sleeve.setToUniversityCourse(i,"Rothman University",ns.enums.UniversityClassType.algorithms);
                    if (studying) assignment="Algorithms";
                    else {
                        ns.sleeve.setToCommitCrime(i,ns.enums.CrimeType.homicide);
                        assignment="homicide";
                    }
                }

                let budget = ns.getServerMoneyAvailable("home") * 0.005;
                for (const aug of ns.sleeve.getSleevePurchasableAugs(i).sort((a,b)=>a.cost-b.cost)) {
                    if (aug.cost > budget) break;
                    if (ns.sleeve.purchaseSleeveAug(i,aug.name)) budget -= aug.cost;
                }
                data.push({i,shock:s.shock,sync:s.sync,assignment});
            }
            await writeState(ns,"sleeves",{status:"online",count:n,sleeves:data});
        } catch(e) {
            await writeState(ns,"sleeves",{status:"error",error:String(e)});
        }
        await ns.sleep(10000);
    }
}
