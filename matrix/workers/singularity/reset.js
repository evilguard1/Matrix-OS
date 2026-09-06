import { config, writeState, getDirectives, writeJson, STATE_DIR, event } from "/matrix/lib/common.js";
import { stateEnvelope } from "/matrix/lib/state.js";
import { terminalLease } from "/matrix/lib/terminal-lease.js";
import { task, readCycle, saveCycle, shouldReset, queued, active } from "/matrix/lib/singularity-tasks.js";
export async function main(ns) {
 await task(ns,"reset",async()=>{
    const cfg=config(ns);
    if(cfg.progression?.autoInstallAugmentations!==false && !terminalLease(ns) && shouldReset(ns,cfg)){
        await event(ns,"singularity",`Installing ${queued(ns)} augmentation(s)`,"success");
        if(!active(ns) || terminalLease(ns))return;
        const ok=ns.singularity.installAugmentations("/matrix/kernel.js");
        if(!ok)throw new Error("augmentation-install-refused");
    }
 });
}
