import { config, writeState, event, getDirectives } from "/matrix/lib/common.js";

const NAMES = ["Neo","Trinity","Morpheus","Oracle","Switch","Dozer","Tank","Mouse","Cypher","Niobe","Ghost","Seraph"];

function bestTask(ns, mode, member) {
    const tasks = ns.gang.getTaskNames()
        .map(n=>({n,s:ns.gang.getTaskStats(n)}))
        .filter(x=>x.s && x.n!=="Unassigned");
    if (mode === "wanted") {
        return tasks.sort((a,b)=>(a.s.baseWanted??0)-(b.s.baseWanted??0))[0]?.n ?? "Vigilante Justice";
    }
    const hackingGang = ns.gang.getGangInformation().isHacking;
    const stat = hackingGang ? (member.hack ?? 1) : Math.max(1,(member.str+member.def+member.dex+member.agi)/4);
    const score = x => {
        const money = x.s.baseMoney ?? 0;
        const respect = x.s.baseRespect ?? 0;
        const wanted = x.s.baseWanted ?? 0;
        const weight = mode==="money" ? 3 : mode==="respect" ? 0.5 : 1.5;
        return stat * (money*weight + respect*1e6 - Math.max(0,wanted)*2e6);
    };
    return tasks.sort((a,b)=>score(b)-score(a))[0]?.n ?? "Train Combat";
}

function tryCreateGang(ns) {
    for (const faction of ns.getPlayer().factions) {
        try {
            if (ns.gang.createGang(faction)) return faction;
        } catch {}
    }
    return null;
}

export async function main(ns) {
    ns.disableLog("ALL");
    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled===false || cfg.automation?.gang===false) {
            await writeState(ns,"gang",{status:"paused"}); await ns.sleep(5000); continue;
        }
        try {
            if (!ns.gang.inGang()) {
                const faction = tryCreateGang(ns);
                if (faction) await event(ns,"gang",`Created gang for ${faction}`,"success");
            }
            if (!ns.gang.inGang()) {
                await writeState(ns,"gang",{status:"locked",reason:"Not in a gang"});
                await ns.sleep(15000); continue;
            }

            while (ns.gang.getRecruitsAvailable() > 0) {
                const existing = new Set(ns.gang.getMemberNames());
                const name = NAMES.find(x=>!existing.has(x)) ?? `Agent-${existing.size+1}`;
                if (!ns.gang.recruitMember(name)) break;
                await event(ns,"gang",`Recruited ${name}`,"success");
            }

            const info = ns.gang.getGangInformation();
            const members = ns.gang.getMemberNames();
            // Recovering from a wanted-level penalty always wins. Otherwise the
            // coordinator directive ("respect" / "money") overrides the static
            // config mode; with no live directive the config default applies.
            const gangDir = getDirectives(ns)?.directives?.gang;
            const mode = info.wantedPenalty < 0.95
                ? "wanted"
                : (gangDir === "respect" || gangDir === "money")
                    ? gangDir
                    : (cfg.mode==="money" ? "money" : "balanced");

            for (const name of members) {
                const m = ns.gang.getMemberInformation(name);
                const asc = ns.gang.getAscensionResult(name);
                if (asc) {
                    const values = [asc.hack, asc.str, asc.def, asc.dex, asc.agi, asc.cha]
                        .map(Number).filter(Number.isFinite);
                    if (values.length && Math.max(...values) >= 1.8) ns.gang.ascendMember(name);
                }
                ns.gang.setMemberTask(name,bestTask(ns,mode,m));
            }

            if (members.length >= 8) {
                const all = ns.gang.getAllGangInformation();
                const ours = info.faction;
                const chances = Object.keys(all)
                    .filter(other => other !== ours)
                    .map(other => {
                        try { return ns.gang.getChanceToWinClash(other); } catch { return null; }
                    })
                    .filter(x => Number.isFinite(x));
                const minChance = chances.length ? Math.min(...chances) : 0;
                ns.gang.setTerritoryWarfare(minChance > 0.62);
            }

            await writeState(ns,"gang",{
                status:"online",members:members.length,respect:info.respect,wanted:info.wantedLevel,
                territory:info.territory,power:info.power,wantedPenalty:info.wantedPenalty
            });
            await ns.gang.nextUpdate();
            continue;
        } catch(e) {
            await writeState(ns,"gang",{status:"error",error:String(e)});
        }
        await ns.sleep(5000);
    }
}
