import { spendMoney } from "/matrix/lib/budget-ledger.js";
import { config, writeState, getDirectives, writeJson, STATE_DIR, event } from "/matrix/lib/common.js";
import { stateEnvelope } from "/matrix/lib/state.js";
import { task, readCycle, saveCycle, active } from "/matrix/lib/singularity-tasks.js";
export async function main(ns) {
 await task(ns,"home",async()=>{
    const receipt=spendMoney(ns,{owner:"homeRam",quote:()=>ns.singularity.getUpgradeHomeRamCost(),execute:()=>ns.singularity.upgradeHomeRam()});
    saveCycle(ns,"home",{receipt});
 });
}
