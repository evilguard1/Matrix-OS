import { config, baselineReserveMoney, writeState } from "/matrix/lib/common.js";
import { spendMoney } from "/matrix/lib/budget-ledger.js";
import { stateEnvelope } from "/matrix/lib/state.js";
import { readWorm } from "/matrix/lib/hud.js";

const PROGRAMS = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"];
const STATE = "/matrix/state/early-progression.txt";

export function chooseEarlyPurchase({cash, reserve, homeCost, hasTor, missingProgram, programCost, buyPrograms=true}) {
    if(!Number.isFinite(homeCost) || homeCost<=0 || !Number.isFinite(cash) || !Number.isFinite(reserve))
        throw new Error("Invalid early economy quote");
    const available = Math.max(0,cash-reserve);
    if(available>=homeCost)return {owner:"homeRam",target:"home",cost:homeCost};
    // Only cheap unlocks may delay the next home doubling. Expensive utilities
    // wait for full progression, and no fleet expansion consumes this savings.
    if(buyPrograms && !hasTor && available>=200000 && 200000<=homeCost/4)
        return {owner:"programs",target:"TOR",cost:200000};
    if(buyPrograms && hasTor && missingProgram && programCost>0 && programCost<=homeCost/4 && programCost<=available)
        return {owner:"programs",target:missingProgram,cost:programCost};
    return {owner:"homeRam",target:"home",cost:homeCost,saving:true};
}

export async function step(ns) {
    const cfg=config(ns), reset=ns.getResetInfo(), ram=ns.getServerMaxRam("home");
    if(ram>=64)return {status:"complete",homeRam:ram};
    if(cfg.masterEnabled===false || cfg.automation?.singularity===false || cfg.earlyAutomation?.enabled===false)
        return {status:"paused",homeRam:ram};
    if(reset.currentNode!==4 && !(reset.ownedSF?.get?.(4)>0))return {status:"locked",reason:"Singularity unavailable",homeRam:ram};
    const cash=ns.getServerMoneyAvailable("home"),reserve=baselineReserveMoney(ns,cfg);
    const homeCost=ns.singularity.getUpgradeHomeRamCost(),hasTor=ns.hasTorRouter();
    const missingProgram=PROGRAMS.find(p=>!ns.fileExists(p,"home"));
    const programCost=hasTor&&missingProgram?ns.singularity.getDarkwebProgramCost(missingProgram):null;
    const plan=chooseEarlyPurchase({cash,reserve,homeCost,hasTor,missingProgram,programCost,buyPrograms:cfg.earlyAutomation?.buyPrograms!==false});
    const policy={...stateEnvelope(reset,Date.now()),status:"active",owner:plan.owner,target:plan.target,
        homeRam:ram,nextRam:ram*2,cash,reserve,homeCost,hasTor,nextProgram:missingProgram??null,programCost,plan};
    // The bounded early policy supersedes obsolete post-reset strategic states.
    ns.write(STATE,JSON.stringify(policy),"w");
    let receipt=null;
    if(!plan.saving) {
        receipt=spendMoney(ns,{owner:plan.owner,target:plan.target,
            quote:()=>plan.owner==="homeRam"?ns.singularity.getUpgradeHomeRamCost():plan.target==="TOR"?200000:ns.singularity.getDarkwebProgramCost(plan.target),
            execute:()=>plan.owner==="homeRam"?ns.singularity.upgradeHomeRam():plan.target==="TOR"?ns.singularity.purchaseTor():ns.singularity.purchaseProgram(plan.target)});
    }
    const result={...policy,homeRam:ns.getServerMaxRam("home"),cash:ns.getServerMoneyAvailable("home"),receipt};
    await writeState(ns,"early-progression",result);
    return result;
}

export async function main(ns) {
    ns.disableLog("ALL");
    const owns=()=>!ns.ps("home").some(p=>String(p.filename).replace(/^\/+/,"")==="matrix/early-progression.js" && p.pid<ns.pid);
    if(!owns())return;
    let expectWorm=false;
    try{expectWorm=Boolean(JSON.parse(ns.read("/matrix/state/early.txt")).worm);}catch{}
    try{ns.ui.openTail();ns.ui.setTailTitle("MATRIX // EARLY PROGRESSION");}catch{}
    while(true) {
        if(!owns()){ns.ui.closeTail();return;}
        if(ns.read("/matrix/state/update-request.txt")) {
            ns.ui.closeTail();ns.spawn("/matrix/early.js",{threads:1,spawnDelay:0});return;
        }
        let result;
        try{result=await step(ns);}catch(error){result={status:"error",error:String(error)};await writeState(ns,"early-progression",result);}
        if(result.status==="complete" || result.homeRam>=64) {
            ns.tprint("MATRIX // HOME 64 GB REACHED - INSTALLING THE FULL STAGE");
            ns.ui.closeTail();
            // early.js already knows how to fetch the installed commit's next
            // stage. Its installation handshake preserves config and the worm.
            ns.spawn("/matrix/early.js",{threads:1,spawnDelay:0});return;
        }
        if(result.receipt?.status==="spent" && result.plan.owner==="programs") {
            ns.ui.closeTail();ns.spawn("/matrix/kernel.js",{threads:1,spawnDelay:0});return;
        }
        if(result.status==="active" && expectWorm && !readWorm(ns)) {
            ns.tprint("MATRIX // BOTNET HEARTBEAT EXPIRED - RESEEDING");
            ns.ui.closeTail();ns.spawn("/matrix/kernel.js",{threads:1,spawnDelay:0});return;
        }
        if(result.status!=="active")await writeState(ns,"early-progression",result);
        ns.clearLog();
        ns.print(`MATRIX // EARLY PROGRESSION // ${result.status}`);
        ns.print(`Home: ${result.homeRam??"?"} GB -> ${result.nextRam??"?"} GB`);
        if(result.homeCost)ns.print(`Upgrade: $${Math.ceil(result.homeCost)} | Cash: $${Math.floor(result.cash)} | Reserve: $${Math.ceil(result.reserve)}`);
        ns.print(result.receipt?`Purchase: ${result.receipt.status} (${result.plan.target})`:result.error??"Botnet earning; saving for home RAM.");
        await ns.sleep(5000);
    }
}
