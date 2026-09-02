import { baselineReserveMoney, reserveMoney, config, writeJson, writeState, event, getDirectives, STATE_DIR } from "/matrix/lib/common.js";

const NFG="NeuroFlux Governor";
const RED="The Red Pill";
const CITY_FACTIONS = new Set(["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volhaven"]);
const SPENDING_RESERVE = "/matrix/state/spending-reserve.txt";

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
                factionRep:ns.singularity.getFactionRep(faction),
                favor:ns.singularity.getFactionFavor(faction),
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
        if(c>0&&ns.getServerMoneyAvailable("home")-c>baselineReserveMoney(ns,cfg))ns.singularity.purchaseProgram(p);
    }
}

function choosePurchase(list, cash, reserve) {
    return list
        .filter(x=>x.aug!==NFG&&x.score>0&&x.factionRep>=x.rep&&x.price<=cash-reserve)
        // Augmentation prices increase after every purchase, so buy expensive
        // high-value augmentations before their later price multiplier applies.
        .sort((a,b)=>b.price-a.price || b.score-a.score)[0]??null;
}

function buyAugs(ns,cfg){
    let count=0;
    for(let i=0;i<50;i++){
        const next=choosePurchase(candidates(ns),ns.getServerMoneyAvailable("home"),baselineReserveMoney(ns,cfg));
        if(!next)break;
        if(!ns.singularity.purchaseAugmentation(next.faction,next.aug))break;
        count++;
    }
    return count;
}

function bestRepGoal(ns){
    const list=candidates(ns).filter(x=>x.aug!==NFG&&x.score>0&&x.factionRep<x.rep);
    // Prefer a high-impact augmentation that is close enough to finish soon.
    list.sort((a,b)=>(b.score/(1+b.rep-b.factionRep))-(a.score/(1+a.rep-a.factionRep)) || b.price-a.price);
    return list[0]??null;
}

function workGoal(ns,goal){
    if(!goal)return false;
    let types=[];try{types=ns.singularity.getFactionWorkTypes(goal.faction);}catch{}
    const type=types.find(x=>String(x).toLowerCase().includes("hack"))??types[0];
    return type ? ns.singularity.workForFaction(goal.faction,type,false) : false;
}

function joinInvitations(ns) {
    const joined = new Set(ns.getPlayer().factions);
    let cityJoined = [...joined].some(f=>CITY_FACTIONS.has(f));
    let joinedCount=0;
    for(const faction of ns.singularity.checkFactionInvitations()) {
        // City factions are mutually exclusive. Joining the first offered city is
        // useful, but never block all of the other city paths by taking another.
        if(CITY_FACTIONS.has(faction) && cityJoined) continue;
        try {
            if(ns.singularity.joinFaction(faction)) {
                joined.add(faction); joinedCount++;
                if (CITY_FACTIONS.has(faction)) cityJoined = true;
            }
        } catch {}
    }
    return joinedCount;
}

function donateForGoal(ns,cfg,goal) {
    if(!goal || goal.factionRep>=goal.rep) return 0;
    const threshold=cfg.progression?.donationFavorThreshold??150;
    if(goal.favor<threshold) return 0;
    const cash=ns.getServerMoneyAvailable("home");
    const free=cash-baselineReserveMoney(ns,cfg);
    const fraction=cfg.progression?.donationBudgetFraction??0.05;
    const amount=Math.floor(Math.max(0,free*Math.max(0,Math.min(0.25,fraction))));
    if(amount<=0) return 0;
    try { return ns.singularity.donateToFaction(goal.faction,amount) ? amount : 0; } catch { return 0; }
}

async function publishReserve(ns,cfg,goal) {
    const base=baselineReserveMoney(ns,cfg);
    // This does not spend money. It prevents the independent economy services
    // from taking funds already needed for the next deliberate augmentation.
    const amount=goal ? Math.max(base,goal.price+base) : base;
    await writeJson(ns,SPENDING_RESERVE,{amount,goal:goal?goal.aug:null,updated:Date.now()});
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
        if(cfg.masterEnabled===false||cfg.automation?.singularity===false){
            await writeJson(ns,SPENDING_RESERVE,{amount:0,updated:Date.now()});
            await writeState(ns,"singularity",{status:"paused"});await ns.sleep(5000);continue;
        }
        try{
            // Coordinator directive: "programs" = spend only on TOR/port programs,
            // "augs" = stop faction work and just buy queued augs before a reset.
            const singDir=getDirectives(ns)?.directives?.singularity??"rep";

            buyPrograms(ns,cfg);
            const invitations=joinInvitations(ns);
            const purchased=singDir==="programs"?0:buyAugs(ns,cfg);

            const goal=bestRepGoal(ns);
            await publishReserve(ns,cfg,goal);
            const donated=singDir==="programs"?0:donateForGoal(ns,cfg,goal);
            const key=goal?`${goal.faction}/${goal.aug}`:"";
            if(singDir!=="augs"&&goal&&key!==lastGoal){if(workGoal(ns,goal))lastGoal=key;}

            try{
                const cash=ns.getServerMoneyAvailable("home");
                const ramCost=ns.singularity.getUpgradeHomeRamCost();
                // Home is a worker host (max RAM minus hacking.homeReserveGb), so
                // home RAM is a direct income multiplier, not a convenience. The
                // old rule needed 10x the price in cash, which past ~64 GB meant
                // it never fired again: at 1 TB the next upgrade costs billions,
                // so it demanded tens of billions idle. Buy it whenever it fits
                // above whatever the coordinator is actually reserving for -
                // reserveMoney() returns the augmentation/milestone reserve when
                // the coordinator is live, so augs still outrank RAM.
                //
                // Cores are deliberately NOT bought: they only scale grow/weaken
                // on home by 1+(cores-1)/16, so 1->2 is +6.25% on a subset of
                // threads, and it costs more than doubling home RAM.
                if(ramCost>0&&cash-ramCost>reserveMoney(ns,cfg))ns.singularity.upgradeHomeRam();
            }catch{}

            // Faction reputation is Singularity-only. Publishing it lets the
            // augmentation planner - which works from a static table without SF4 -
            // switch from "needs rep" to exact shortfalls once SF4 exists.
            try{
                const rep={};
                for(const faction of ns.getPlayer().factions) rep[faction]=ns.singularity.getFactionRep(faction);
                await writeJson(ns,`${STATE_DIR}/faction-rep.txt`,rep);
            }catch{}

            const q=queued(ns);
            // Publish everything the coordinator would otherwise call Singularity
            // for. Singularity RAM is charged statically and multiplied by 16
            // without SF4 level 3, so a speculative try/catch call in a service
            // that runs on every save is enormously expensive. State files are
            // ns.read, which is free.
            let hasTor=false,missingPrograms=[],programCosts=0;
            try{
                for(const p of ns.singularity.getDarkwebPrograms()){
                    const c=ns.singularity.getDarkwebProgramCost(p);
                    if(c>0){missingPrograms.push(p);programCosts+=c;}
                }
                hasTor=true;
            }catch{}
            let ramUpgradeCost=Infinity;
            try{ramUpgradeCost=ns.singularity.getUpgradeHomeRamCost();}catch{}
            await writeState(ns,"singularity",{
                status:"online",queuedAugs:q,
                goal:goal?{faction:goal.faction,augmentation:goal.aug,rep:goal.factionRep,need:goal.rep,price:goal.price,favor:goal.favor}:null,
                currentWork:ns.singularity.getCurrentWork(), invitations, purchased, donated,
                hasTor, missingPrograms, programCosts, ramUpgradeCost,
                hasRedPill:ns.singularity.getOwnedAugmentations(true).includes(RED),
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
