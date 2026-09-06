import { config, writeState, getDirectives, writeJson, STATE_DIR, event } from "/matrix/lib/common.js";
import { stateEnvelope } from "/matrix/lib/state.js";
import { task, readCycle, saveCycle, buyAugs, donateForGoal } from "/matrix/lib/singularity-tasks.js";
export async function main(ns) {
 await task(ns,"purchase",async()=>{
    const goal=readCycle(ns,"goal");if(!goal)throw new Error("missing-fresh-goal");
    const cfg=config(ns),dir=getDirectives(ns)?.directives?.singularity;
    const purchased=dir==="programs"?0:buyAugs(ns,cfg);
    const donated=dir==="programs"?0:donateForGoal(ns,cfg,goal.goal);
    saveCycle(ns,"purchase",{purchased,donated});
 });
}
