import { readControl } from "/matrix/lib/control-state.js";
export async function main(ns) {
    const id=String(ns.args[0]),state=readControl(ns);
    if(state.desired!=="paused" || state.active?.id!==id || state.active.action!=="pause")return;
    const reset=ns.getResetInfo();
    if(reset.currentNode===4 || reset.ownedSF?.get?.(4)>0) {
        const file="/matrix/workers/control-stop-player.js",need=ns.getScriptRam(file,"home");
        if(need>0 && need<=ns.getServerMaxRam("home")-ns.getServerUsedRam("home")+ns.getScriptRam("/matrix/control-player.js","home")) {
            ns.spawn(file,{threads:1,spawnDelay:0},id);return;
        }
        ns.write("/matrix/state/control-player.txt",JSON.stringify({id,status:"ram-blocked",need,updated:Date.now()}),"w");
    } else {
        ns.write("/matrix/state/control-player.txt",JSON.stringify({id,status:"locked",updated:Date.now()}),"w");
    }
    ns.spawn("/matrix/control-engine.js",{threads:1,spawnDelay:0});
}
