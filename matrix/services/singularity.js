import { config, reserveMoney, writeState, event } from "/matrix/lib/common.js";

const NFG="NeuroFlux Governor";
const RED="The Red Pill";
const CITY_SKIP = new Set(["Chongqing","New Tokyo","Ishima","Volhaven"]);

function scoreAug(stats,name) {
    if(name===RED) return 1e12;
    if(name===NFG) return -1;
    let score=0;
    for(const [k,v] of Object.entries(stats??{})){
        if(typeof v!=="number"||!Number.isFinite(v)||v===1) continue;
        let w=/hacking/i.test(k)?10:/faction.*rep/i.test(k)?8:/bladeburner/i.test(k)?5:/company.*rep/i.test(k)?3:/crime/i.test(k)?2:1;
        score += v>1 ? w*Math.log(v) : (/cost|price/i.test(k)?w*-Math.log(v):0);
    }
    return score;
}

function candidates(ns) {
    const player=ns.getPlayer();
    const owned=new Set(ns.singularity.getOwnedAugmentations(true));
    const out=[];
    for(const faction of player.factions){
        let augs=[]; try{augs=ns.singularity.getAugmentationsFromFaction(faction);}catch{}
        for(const aug of augs){
            if(aug!==NFG&&owned.has(aug))continue;
            let prereq=[];try{prereq=ns.singularity.getAugmentationPrereq(aug);}catch{}
            if(!prereq.every(x=>owned.has(x)))continue;
            let stats={};try{stats=ns.singularity.getAugmentationStats(aug);}catch{}
            out.push({
                faction,aug,score:scoreAug(stats,aug),
                price:ns.singularity.getAugmentationPrice(aug),
                rep:ns.singularity.getAugmentationRepReq(aug),
                factionRep:ns.singularity.getFactionRep(faction)
            });
        }
    }
    return out;
}

function queued(ns) {
    return ns.singularity.getOwnedAugmentations(true).length-ns.singularity.getOwnedAugmentations(false).length;
}

function buyPrograms(ns,cfg){
    try{ if(ns.getServerMoneyAvailable("home")>300000) ns.singularity.purchaseTor(); }catch{}
    let programs=[];try{programs=ns.singularity.getDarkwebPrograms();}catch{}
    for(const p of programs){
        const c=ns.singularity.getDarkwebProgramCost(p);
        if(c>0&&ns.getServerMoneyAvailable("home")-c>reserveMoney(ns,cfg))ns.singularity.purchaseProgram(p);
    }
}

function buyAugs(ns,cfg){
    let count=0;
    for(let i=0;i<50;i++){
        const list=candidates(ns).filter(x=>x.aug!==NFG&&x.score>0&&x.factionRep>=x.rep)
            .sort((a,b)=>b.price-a.price);
        const cash=ns.getServerMoneyAvailable("home"),res=reserveMoney(ns,cfg);
        const next=list.find(x=>x.price<=cash-res);
        if(!next)break;
        if(!ns.singularity.purchaseAugmentation(next.faction,next.aug))break;
        count++;
    }
    return count;
}

function bestRepGoal(ns){
    const list=candidates(ns).filter(x=>x.aug!==NFG&&x.score>0&&x.factionRep<x.rep);
    list.sort((a,b)=>(b.score/(1+b.rep-b.factionRep))-(a.score/(1+a.rep-a.factionRep)));
    return list[0]??null;
}

function workGoal(ns,goal){
    if(!goal)return false;
    let types=[];try{types=ns.singularity.getFactionWorkTypes(goal.faction);}catch{}
    const type=types.find(x=>String(x).toLowerCase().includes("hack"))??types[0];
    return type ? ns.singularity.workForFaction(goal.faction,type,false) : false;
}

function shouldReset(ns,cfg){
    const q=queued(ns),p=cfg.progression??{};
    if(q>=(p.forceResetAtQueuedAugs??10))return true;
    if(q<(p.minQueuedAugsForReset??5))return false;
    return Date.now()-ns.getResetInfo().lastAugReset >= (p.minMinutesBetweenResets??35)*60000;
}

export async function main(ns){
    ns.disableLog("ALL");
    let lastGoal="";
    while(true){
        const cfg=config(ns);
        if(cfg.masterEnabled===false||cfg.automation?.singularity===false){await writeState(ns,"singularity",{status:"paused"});await ns.sleep(5000);continue;}
        try{
            buyPrograms(ns,cfg);
            for(const f of ns.singularity.checkFactionInvitations()){
                if (CITY_SKIP.has(f)) continue;
                try{ns.singularity.joinFaction(f);}catch{}
            }
            buyAugs(ns,cfg);

            const goal=bestRepGoal(ns);
            const key=goal?`${goal.faction}/${goal.aug}`:"";
            if(goal&&key!==lastGoal){if(workGoal(ns,goal))lastGoal=key;}

            try{
                const cash=ns.getServerMoneyAvailable("home");
                const ramCost=ns.singularity.getUpgradeHomeRamCost();
                if(ramCost>0&&ramCost<cash*0.10&&cash-ramCost>reserveMoney(ns,cfg))ns.singularity.upgradeHomeRam();
            }catch{}

            const q=queued(ns);
            await writeState(ns,"singularity",{
                status:"online",queuedAugs:q,goal:goal?{faction:goal.faction,augmentation:goal.aug,rep:goal.factionRep,need:goal.rep}:null,
                currentWork:ns.singularity.getCurrentWork()
            });

            if(cfg.progression?.autoInstallAugmentations!==false&&shouldReset(ns,cfg)){
                await event(ns,"singularity",`Installing ${q} augmentation(s)`,"success");
                ns.singularity.installAugmentations("/matrix/kernel.js");
                return;
            }
        }catch(e){await writeState(ns,"singularity",{status:"error",error:String(e)});}
        await ns.sleep(10000);
    }
}
