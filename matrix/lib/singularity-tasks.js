import { baselineReserveMoney, config, writeJson, writeState, event, getDirectives, STATE_DIR } from "/matrix/lib/common.js";
import { spendMoney, spendingAllowance } from "/matrix/lib/budget-ledger.js";
import { stateEnvelope, resetEpoch, freshState } from "/matrix/lib/state.js";
const NFG="NeuroFlux Governor", RED="The Red Pill";
const CITY_FACTIONS = new Set(["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volhaven"]);
const SPENDING_RESERVE = "/matrix/state/spending-reserve.txt";

export function active(ns) {
    const cfg=config(ns), reset=ns.getResetInfo();
    return cfg.masterEnabled !== false && cfg.automation?.singularity !== false &&
        (reset.currentNode === 4 || (reset.ownedSF?.get?.(4) ?? 0) > 0);
}
export function readCycle(ns, name) {
    let value; try { value=JSON.parse(ns.read(`/matrix/state/singularity-${name}.txt`)); } catch { return null; }
    return value.cycle === ns.args[0] && freshState(value, {epoch:resetEpoch(ns.getResetInfo())}) ? value : null;
}
export function saveCycle(ns, name, data) {
    ns.write(`/matrix/state/singularity-${name}.txt`,JSON.stringify({...data,...stateEnvelope(ns.getResetInfo(),Date.now()),cycle:ns.args[0]}),"w");
}
export async function task(ns, name, action) {
    try {
        if (!active(ns)) { saveCycle(ns,"receipt",{task:name,status:"paused"}); return; }
        await action();
        saveCycle(ns,"receipt",{task:name,status:"done"});
    } catch(error) { saveCycle(ns,"receipt",{task:name,status:"error",error:String(error)}); }
}
function candidates(ns) {
    const valuation=readCycle(ns,"valuation");
    if(!valuation) throw new Error("missing-fresh-valuation");
    const owned=ns.singularity.getOwnedAugmentations(true);
    return valuation.list.filter(x=>!owned.includes(x.aug)).map(x=>({...x,price:ns.singularity.getAugmentationPrice(x.aug),factionRep:ns.singularity.getFactionRep(x.faction)}));
}
export function scoreAug(stats,name) {
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

export function queued(ns) {
    return ns.singularity.getOwnedAugmentations(true).length-ns.singularity.getOwnedAugmentations(false).length;
}

export function buyPrograms(ns,cfg){
    try { if (!ns.hasTorRouter()) spendMoney(ns, { owner: "programs", target: "TOR", quote: () => 200_000, execute: () => ns.singularity.purchaseTor() }); } catch {}
    let programs=[];try{programs=ns.singularity.getDarkwebPrograms();}catch{}
    for(const p of programs){
        const c=ns.singularity.getDarkwebProgramCost(p);
        if (c > 0) spendMoney(ns, { owner: "programs", target: p, quote: () => ns.singularity.getDarkwebProgramCost(p), execute: () => ns.singularity.purchaseProgram(p) });
    }
}

export function choosePurchase(list, cash, reserve) {
    return list
        .filter(x=>x.aug!==NFG&&x.score>0&&x.factionRep>=x.rep&&x.price<=cash-reserve)
        // Augmentation prices increase after every purchase, so buy expensive
        // high-value augmentations before their later price multiplier applies.
        .sort((a,b)=>b.price-a.price || b.score-a.score)[0]??null;
}

export function buyAugs(ns,cfg){
    let count=0;
    for(let i=0;i<50;i++){
        const list = candidates(ns).filter(x => x.price <= spendingAllowance(ns, "augmentations", x.aug, cfg));
        const next = choosePurchase(list, ns.getServerMoneyAvailable("home"), 0);
        if(!next)break;
        const receipt = spendMoney(ns, { owner: "augmentations", target: next.aug, allowFree: true,
            quote: () => ns.singularity.getAugmentationPrice(next.aug),
            execute: () => ns.singularity.purchaseAugmentation(next.faction, next.aug) });
        if(receipt.status !== "spent")break;
        count++;
    }
    return count;
}

export function bestRepGoal(ns){
    const list=candidates(ns).filter(x=>x.aug!==NFG&&x.score>0&&x.factionRep<x.rep);
    // Prefer a high-impact augmentation that is close enough to finish soon.
    list.sort((a,b)=>(b.score/(1+b.rep-b.factionRep))-(a.score/(1+a.rep-a.factionRep)) || b.price-a.price);
    return list[0]??null;
}

export function workGoal(ns,goal){
    if(!goal)return false;
    const current=ns.singularity.getCurrentWork();
    if(current?.type === "FACTION" && current.factionName === goal.faction)return true;
    let lease;try{lease=JSON.parse(ns.read("/matrix/state/player-activity.txt"));}catch{}
    const own=lease?.resetEpoch===resetEpoch(ns.getResetInfo()) && lease?.owner==="singularity" &&
        current?.type==="FACTION" && current.factionName===lease.faction && typeof lease.workType === "string" && current.factionWorkType===lease.workType;
    if(current && !own)return false;
    const types=ns.singularity.getFactionWorkTypes(goal.faction);
    const type=types.find(x=>String(x).toLowerCase().includes("hack"))??types[0];
    if(!type || !ns.singularity.workForFaction(goal.faction,type,false))return false;
    ns.write("/matrix/state/player-activity.txt",JSON.stringify({...stateEnvelope(ns.getResetInfo(),Date.now()),owner:"singularity",faction:goal.faction,workType:type}),"w");
    return true;
}

export function joinInvitations(ns) {
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

export function donateForGoal(ns,cfg,goal) {
    if(!goal || goal.factionRep>=goal.rep) return 0;
    const threshold=cfg.progression?.donationFavorThreshold??150;
    if(goal.favor<threshold) return 0;
    const cash=ns.getServerMoneyAvailable("home");
    const free=spendingAllowance(ns,"donations",goal.aug,cfg);
    const fraction=cfg.progression?.donationBudgetFraction??0.05;
    const amount=Math.floor(Math.max(0,free*Math.max(0,Math.min(0.25,fraction))));
    if(amount<=0) return 0;
    try {
        const receipt = spendMoney(ns, { owner: "donations", target: goal.aug, quote: () => amount, execute: () => ns.singularity.donateToFaction(goal.faction, amount) });
        return receipt.status === "spent" ? amount : 0;
    } catch { return 0; }
}

export async function publishReserve(ns,cfg,goal) {
    const base=baselineReserveMoney(ns,cfg);
    // This does not spend money. It prevents the independent economy services
    // from taking funds already needed for the next deliberate augmentation.
    const amount=goal ? Math.max(base,goal.price+base) : base;
    await writeJson(ns,SPENDING_RESERVE,{...stateEnvelope(ns.getResetInfo(), Date.now()),amount,goal:goal?goal.aug:null});
}

export function shouldReset(ns,cfg){
    const q=queued(ns),p=cfg.progression??{};
    if(ns.singularity.getOwnedAugmentations(true).includes(RED)&&!ns.singularity.getOwnedAugmentations(false).includes(RED))return true;
    if(q>=(p.forceResetAtQueuedAugs??10))return true;
    if(q<(p.minQueuedAugsForReset??5))return false;
    return Date.now()-ns.getResetInfo().lastAugReset >= (p.minMinutesBetweenResets??35)*60000;
}
