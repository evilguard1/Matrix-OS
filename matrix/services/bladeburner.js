import { config, writeState, event } from "/matrix/lib/common.js";

function chance(ns,type,name) {
    try {
        const c = ns.bladeburner.getActionEstimatedSuccessChance(type,name);
        return Array.isArray(c) ? (c[0]+c[1])/2 : Number(c);
    } catch { return 0; }
}

function chooseAction(ns) {
    const T = ns.enums.BladeburnerActionType;
    const [stamina,max] = ns.bladeburner.getStamina();
    if (max>0 && stamina/max < 0.52) return {type:T.General,name:"Hyperbolic Regeneration Chamber",reason:"stamina"};
    const city = ns.bladeburner.getCity();
    if (ns.bladeburner.getCityChaos(city) > 50) return {type:T.General,name:"Diplomacy",reason:"chaos"};

    const next = ns.bladeburner.getNextBlackOp();
    if (next && ns.bladeburner.getRank() >= next.rank) {
        const c = chance(ns,T.BlackOp,next.name);
        if (c >= 0.90) return {type:T.BlackOp,name:next.name,reason:"blackop",chance:c};
    }

    const actions = [];
    for (const name of ns.bladeburner.getOperationNames()) {
        const count = ns.bladeburner.getActionCountRemaining(T.Operation,name);
        if (count<=0) continue;
        const c = chance(ns,T.Operation,name);
        if (c<0.72) continue;
        const t = Math.max(1,ns.bladeburner.getActionTime(T.Operation,name));
        const rep = ns.bladeburner.getActionRepGain(T.Operation,name);
        actions.push({type:T.Operation,name,chance:c,score:c*rep/t});
    }
    for (const name of ns.bladeburner.getContractNames()) {
        const count = ns.bladeburner.getActionCountRemaining(T.Contract,name);
        if (count<=0) continue;
        const c = chance(ns,T.Contract,name);
        if (c<0.65) continue;
        const t = Math.max(1,ns.bladeburner.getActionTime(T.Contract,name));
        const rep = ns.bladeburner.getActionRepGain(T.Contract,name);
        actions.push({type:T.Contract,name,chance:c,score:c*rep/t});
    }
    actions.sort((a,b)=>b.score-a.score);
    return actions[0] ?? {type:T.General,name:"Field Analysis",reason:"analysis"};
}

function spendSkills(ns) {
    const priority = ["Overclock","Blade's Intuition","Digital Observer","Reaper","Evasive System","Cloak","Short-Circuit"];
    for (let loops=0;loops<100;loops++) {
        let best = null;
        for (const name of priority) {
            try {
                const cost = ns.bladeburner.getSkillUpgradeCost(name,1);
                if (cost <= ns.bladeburner.getSkillPoints() && (!best || cost<best.cost)) best={name,cost};
            } catch {}
        }
        if (!best || !ns.bladeburner.upgradeSkill(best.name,1)) break;
    }
}

export async function main(ns) {
    ns.disableLog("ALL");
    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled===false || cfg.automation?.bladeburner===false) {
            await writeState(ns,"bladeburner",{status:"paused"}); await ns.sleep(5000); continue;
        }
        try {
            if (!ns.bladeburner.inBladeburner()) {
                try { ns.bladeburner.joinBladeburnerDivision(); } catch {}
            }
            if (!ns.bladeburner.inBladeburner()) {
                await writeState(ns,"bladeburner",{status:"locked",reason:"Not eligible yet"});
                await ns.sleep(15000); continue;
            }

            spendSkills(ns);
            const pick = chooseAction(ns);
            const cur = ns.bladeburner.getCurrentAction();
            if (!cur || cur.name!==pick.name || cur.type!==pick.type) {
                if (ns.bladeburner.startAction(pick.type,pick.name)) {
                    await event(ns,"bladeburner",`Action → ${pick.type}: ${pick.name}`,"info");
                }
            }
            const [stamina,max] = ns.bladeburner.getStamina();
            await writeState(ns,"bladeburner",{
                status:"online",rank:ns.bladeburner.getRank(),skillPoints:ns.bladeburner.getSkillPoints(),
                stamina,maxStamina:max,city:ns.bladeburner.getCity(),action:pick
            });
            await ns.bladeburner.nextUpdate();
            continue;
        } catch(e) {
            await writeState(ns,"bladeburner",{status:"error",error:String(e)});
        }
        await ns.sleep(5000);
    }
}
