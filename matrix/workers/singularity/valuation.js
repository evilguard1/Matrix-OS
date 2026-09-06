import { config, writeState, getDirectives, writeJson, STATE_DIR, event } from "/matrix/lib/common.js";
import { stateEnvelope } from "/matrix/lib/state.js";
import { task, readCycle, saveCycle, bestRepGoal, publishReserve } from "/matrix/lib/singularity-tasks.js";
export async function main(ns) {
 await task(ns,"valuation",async()=>{
    const catalog=readCycle(ns,"catalog");if(!catalog)throw new Error("missing-fresh-catalog");
    const list=catalog.list.map(x=>({...x,price:ns.singularity.getAugmentationPrice(x.aug),rep:ns.singularity.getAugmentationRepReq(x.aug),factionRep:ns.singularity.getFactionRep(x.faction),favor:ns.singularity.getFactionFavor(x.faction)}));
    saveCycle(ns,"valuation",{list});
    const goal=bestRepGoal(ns);saveCycle(ns,"goal",{goal});await publishReserve(ns,config(ns),goal);
 });
}
