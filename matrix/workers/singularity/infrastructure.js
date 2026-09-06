import { config, writeState, getDirectives, writeJson, STATE_DIR, event } from "/matrix/lib/common.js";
import { stateEnvelope } from "/matrix/lib/state.js";
import { task, readCycle, saveCycle, buyPrograms, joinInvitations } from "/matrix/lib/singularity-tasks.js";
export async function main(ns) {
 await task(ns,"infrastructure",async()=>{
    buyPrograms(ns,config(ns));
    const invitations=joinInvitations(ns);
    saveCycle(ns,"infrastructure",{invitations});
 });
}
