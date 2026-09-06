import { config, writeState, getDirectives, writeJson, STATE_DIR, event } from "/matrix/lib/common.js";
import { stateEnvelope } from "/matrix/lib/state.js";
import { task, readCycle, saveCycle, scoreAug } from "/matrix/lib/singularity-tasks.js";
export async function main(ns) {
 await task(ns,"catalog",async()=>{
    const owned=ns.singularity.getOwnedAugmentations(true), installed=ns.singularity.getOwnedAugmentations(false), list=[];
    for(const faction of ns.getPlayer().factions) for(const aug of ns.singularity.getAugmentationsFromFaction(faction)) {
        if(owned.includes(aug) || aug==="NeuroFlux Governor")continue;
        const prereq=ns.singularity.getAugmentationPrereq(aug);
        if(!prereq.every(x=>owned.includes(x)))continue;
        list.push({faction,aug,score:scoreAug(ns.singularity.getAugmentationStats(aug),aug)});
    }
    saveCycle(ns,"catalog",{list,owned,installed});
 });
}
