import { config, writeState, getDirectives, writeJson, STATE_DIR, event } from "/matrix/lib/common.js";
import { stateEnvelope } from "/matrix/lib/state.js";
import { task, readCycle, saveCycle, queued } from "/matrix/lib/singularity-tasks.js";
export async function main(ns) {
 await task(ns,"observe",async()=>{
    const owned=ns.singularity.getOwnedAugmentations(true),installed=ns.singularity.getOwnedAugmentations(false);
    const goal=readCycle(ns,"goal")?.goal??null, purchase=readCycle(ns,"purchase"), infrastructure=readCycle(ns,"infrastructure");
    const missingPrograms=[],hasTor=ns.hasTorRouter();let programCosts=0;
    if(hasTor) for(const p of ns.singularity.getDarkwebPrograms()) {
        const cost=ns.singularity.getDarkwebProgramCost(p);if(cost>0){missingPrograms.push(p);programCosts+=cost;}
    }
    const rep={};for(const f of ns.getPlayer().factions)rep[f]=ns.singularity.getFactionRep(f);
    await writeJson(ns,`${STATE_DIR}/faction-rep.txt`,rep);
    await writeState(ns,"singularity",{...stateEnvelope(ns.getResetInfo(),Date.now()),status:"online",cycle:ns.args[0],
        queuedAugs:owned.length-installed.length,installedCount:installed.length,
        daedalusAugsRequirement:ns.singularity.getFactionInviteRequirements("Daedalus").find(r=>r.type==="numAugmentations")?.numAugmentations??null,
        redPillPrice:ns.singularity.getAugmentationPrice("The Red Pill"),redPillReqRep:ns.singularity.getAugmentationRepReq("The Red Pill"),redPillRep:rep.Daedalus??0,
        goal:goal?{faction:goal.faction,augmentation:goal.aug,rep:rep[goal.faction],need:goal.rep,price:ns.singularity.getAugmentationPrice(goal.aug),favor:goal.favor}:null,
        currentWork:ns.singularity.getCurrentWork(),hasTor,missingPrograms,programCosts,ramUpgradeCost:ns.singularity.getUpgradeHomeRamCost(),
        hasRedPill:installed.includes("The Red Pill"),redPillQueued:owned.includes("The Red Pill")&&!installed.includes("The Red Pill"),
        invitations:infrastructure?.invitations??0,purchased:purchase?.purchased??0,donated:purchase?.donated??0});
 });
}
