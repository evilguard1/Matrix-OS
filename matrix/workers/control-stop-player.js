import { resetEpoch } from "/matrix/lib/state.js";

export async function main(ns) {
    const id=String(ns.args[0]),reset=ns.getResetInfo();
    let command;try{command=JSON.parse(ns.read("/matrix/state/control-journal.txt"));}catch{return;}
    if(command?.schemaVersion!==1 || command.desired!=="paused" || command.active?.action!=="pause" || command.active.id!==id)return;
    let status="locked",work=null;
    if(reset.currentNode===4 || reset.ownedSF?.get?.(4)>0) {
        work=ns.singularity.getCurrentWork();
        let lease;try{lease=JSON.parse(ns.read("/matrix/state/player-activity.txt"));}catch{}
        const owned=lease?.resetEpoch===resetEpoch(reset) && lease.owner==="singularity" &&
            work?.type==="FACTION" && work.factionName===lease.faction && work.factionWorkType===lease.workType;
        status=!work?"idle":!owned?"manual-preserved":"stop-refused";
        if(owned && ns.singularity.stopAction())status=ns.singularity.getCurrentWork()===null?"stopped":"stop-not-confirmed";
    }
    const text=JSON.stringify({id,status,work,updated:Date.now()});
    ns.write("/matrix/state/control-player.txt",text,"w");
    if(ns.read("/matrix/state/control-player.txt")!==text)throw new Error("player-stop-receipt-not-verified");
    ns.spawn("/matrix/control-engine.js",{threads:1,spawnDelay:0});
}
