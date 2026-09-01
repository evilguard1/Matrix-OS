import { config, writeState, getDirectives } from "/matrix/lib/common.js";

// Assign one sleeve according to the coordinator's directive. Shock and low
// synchronization always take priority because every other task is far less
// effective until they are cleared.
//   "karma"      -> homicide on every ready sleeve (fastest -54k karma for Gang)
//   "rep:<F>"    -> faction work for <F>, falling back through the work types
//   "money"      -> the legacy ladder: homicide early, study once karma is deep
function assignSleeve(ns, i, sleeve, directive, player) {
    const crime = ns.enums.CrimeType.homicide;
    if (sleeve.shock > 15) { ns.sleeve.setToShockRecovery(i); return "shock recovery"; }
    if (sleeve.sync < 100) { ns.sleeve.setToSynchronize(i); return "synchronize"; }

    if (directive === "karma") {
        ns.sleeve.setToCommitCrime(i, crime);
        return "homicide (karma)";
    }

    if (directive.startsWith("rep:")) {
        const faction = directive.slice(4);
        for (const type of ["hacking", "field", "security"]) {
            try { if (ns.sleeve.setToFactionWork(i, faction, type)) return `faction:${faction}`; } catch {}
        }
        ns.sleeve.setToCommitCrime(i, crime);
        return "homicide";
    }

    // "money" / default: preserve the previous behaviour exactly.
    if (player.karma > -54000) {
        ns.sleeve.setToCommitCrime(i, crime);
        return "homicide";
    }
    if (ns.sleeve.setToUniversityCourse(i, "Rothman University", ns.enums.UniversityClassType.algorithms)) {
        return "Algorithms";
    }
    ns.sleeve.setToCommitCrime(i, crime);
    return "homicide";
}

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
            const dir = getDirectives(ns);
            const directive = dir?.directives?.sleeves ?? "money";
            const augFraction = Number(dir?.budgets?.sleeveAugs);
            const augBudgetFraction = Number.isFinite(augFraction) ? augFraction : 0.005;

            for (let i=0;i<n;i++) {
                const s = ns.sleeve.getSleeve(i);
                const assignment = assignSleeve(ns, i, s, directive, player);

                let budget = ns.getServerMoneyAvailable("home") * augBudgetFraction;
                for (const aug of ns.sleeve.getSleevePurchasableAugs(i).sort((a,b)=>a.cost-b.cost)) {
                    if (aug.cost > budget) break;
                    if (ns.sleeve.purchaseSleeveAug(i,aug.name)) budget -= aug.cost;
                }
                data.push({i,shock:s.shock,sync:s.sync,assignment});
            }
            await writeState(ns,"sleeves",{status:"online",count:n,directive,sleeves:data});
        } catch(e) {
            await writeState(ns,"sleeves",{status:"error",error:String(e)});
        }
        await ns.sleep(10000);
    }
}
