import { config, writeState, getDirectives, writeJson, STATE_DIR, event } from "/matrix/lib/common.js";
import { stateEnvelope } from "/matrix/lib/state.js";
import { advanceFactionObjective } from "/matrix/lib/faction-objective.js";
import { task, readCycle, saveCycle, workGoal } from "/matrix/lib/singularity-tasks.js";
export async function main(ns) {
 await task(ns,"work",async()=>{
    if(advanceFactionObjective(ns)) {saveCycle(ns,"work",{source:"operator-objective",currentWork:ns.singularity.getCurrentWork()});return;}
    const goal=readCycle(ns,"goal");if(!goal)throw new Error("missing-fresh-goal");
    const dir=getDirectives(ns)?.directives?.singularity;
    const working=dir!=="augs"&&dir!=="programs" ? workGoal(ns,goal.goal) : false;
    saveCycle(ns,"work",{working,currentWork:ns.singularity.getCurrentWork()});
 });
}
