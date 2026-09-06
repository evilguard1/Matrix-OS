import { readObjective, updateObjective } from "./objective-state.js";
import { resetEpoch } from "./state.js";
import { workGoal } from "./singularity-tasks.js";

// Called inside the existing sequential work slot, with no await between the
// durable intent, work selection and observation of its native postcondition.
export function advanceFactionObjective(ns) {
    const goal=readObjective(ns).active;if(!goal)return false;
    if(goal.resetEpoch!==resetEpoch(ns.getResetInfo())) {
        updateObjective(ns,goal.id,{status:"reset-interrupted",reason:"reset-changed"});return true;
    }
    if(!ns.getPlayer().factions.includes(goal.faction)) {
        updateObjective(ns,goal.id,{status:"blocked",reason:"faction-not-joined"});return true;
    }
    const rep=ns.singularity.getFactionRep(goal.faction);
    if(!Number.isFinite(rep)||rep<0)throw new Error("invalid-native-reputation");
    if(rep>=goal.targetRep) {
        updateObjective(ns,goal.id,{status:"succeeded",currentRep:rep});return true;
    }
    updateObjective(ns,goal.id,{status:"starting",currentRep:rep});
    const ok=workGoal(ns,{faction:goal.faction}),current=ns.singularity.getCurrentWork();
    let lease;try{lease=JSON.parse(ns.read("/matrix/state/player-activity.txt"));}catch{}
    const matching=ok && current?.type==="FACTION" && current.factionName===goal.faction;
    const owned=matching && lease?.owner==="singularity" && lease.resetEpoch===goal.resetEpoch && lease.faction===goal.faction && lease.workType===current.factionWorkType;
    updateObjective(ns,goal.id,{status:matching?(owned?"working":"observing"):"blocked",currentRep:rep,
        reason:matching?(owned?null:"existing-work-preserved"):current?"manual-activity-preserved":"work-not-started"});
    return true;
}
