import { readControl, writeControl, finishControl, CONTROL_PORT, PAUSE_SIGNAL } from "/matrix/lib/control-state.js";
import { scanAll } from "/matrix/lib/network.js";
import { holdSingleton } from "/matrix/lib/singleton.js";

const KEEP=new Set(["matrix/briefing.js","matrix/control-engine.js","matrix/control.js","matrix/dashboard.jsx","matrix/services/telemetry.js"]);
const DRAIN=new Set(["matrix/workers/hack.js","matrix/workers/grow.js","matrix/workers/weaken.js","matrix/workers/early.js",
    "matrix/workers/share.js","matrix/worm/drone.js","matrix/workers/stanek-charge.js",
    "matrix/workers/backdoor-install.js","matrix/workers/singularity/backdoors.js"]);
const normal=p=>String(p).replace(/^\/+/,"");
function report(ns,value) {ns.write("/matrix/state/control-status.txt",JSON.stringify({...value,updated:Date.now()}),"w");}

export function drainPass(ns) {
    const manifest=JSON.parse(ns.read("/matrix/manifest.json")||"null");
    if(!Array.isArray(manifest?.files))throw new Error("missing-owned-file-manifest");
    const owned=new Set(manifest.files.filter(f=>/^matrix\/[\w./-]+\.(js|jsx)$/.test(f.path)&&!f.path.includes("..")).map(f=>f.path));
    owned.add("matrix/remote-install.js");
    const {hosts}=scanAll(ns),foreign=[];
    for(const host of hosts) for(const p of ns.ps(host)) {
        const file=normal(p.filename);
        if(KEEP.has(file)||p.pid===ns.pid)continue;
        if(!owned.has(file)){foreign.push({host,pid:p.pid,file});continue;}
        if(DRAIN.has(file))continue;
        try{ns.ui.closeTail(p.pid);}catch{}
        ns.kill(p.pid);
    }
    // Confirm kills and catch any owner that was started before the barrier.
    const remaining=[];
    for(const host of hosts)for(const p of ns.ps(host)) {
        const file=normal(p.filename);
        if(owned.has(file)&&!KEEP.has(file)&&p.pid!==ns.pid)remaining.push({host,pid:p.pid,file});
    }
    return {remaining,foreign};
}

export async function main(ns) {
    ns.disableLog("ALL");
    if(!holdSingleton(ns,"/matrix/control-engine.js"))return;
    while(holdSingleton(ns,"/matrix/control-engine.js")) {
        try {
            const state=readControl(ns),command=state.active;
            if(command?.action==="resume") {
                if(Date.now()-command.requestedAt>120000){finishControl(ns,command.id,"expired");continue;}
                const outstanding=drainPass(ns);
                if(outstanding.remaining.length) {
                    report(ns,{status:"draining-before-resume",id:command.id,...outstanding});
                    await ns.sleep(500);continue;
                }
                state.desired="running";state.active={...command,phase:"starting"};writeControl(ns,state);
                ns.clearPort(CONTROL_PORT);
                report(ns,{status:"starting",id:command.id,scope:"managed-scripts-and-owned-faction-work"});
                ns.spawn("/matrix/kernel.js",{threads:1,spawnDelay:0});return;
            }
            if(state.desired!=="paused")return;
            ns.clearPort(CONTROL_PORT);ns.writePort(CONTROL_PORT,PAUSE_SIGNAL);
            const snapshot=drainPass(ns);
            let player;try{player=JSON.parse(ns.read("/matrix/state/control-player.txt"));}catch{}
            if(!snapshot.remaining.length && command?.action==="pause" && player?.id!==command.id) {
                const need=ns.getScriptRam("/matrix/control-player.js","home");
                if(need>0 && need<=ns.getServerMaxRam("home")-ns.getServerUsedRam("home")+ns.getScriptRam("/matrix/control-engine.js","home")) {
                    ns.spawn("/matrix/control-player.js",{threads:1,spawnDelay:0},command.id);return;
                }
                player={status:"ram-blocked",need};
            }
            const last=state.receipts.at(-1);
            const pauseId=command?.action==="pause"?command.id:last?.action==="pause"&&last.status==="succeeded"?last.id:null;
            const playerOK=Boolean(pauseId && player?.id===pauseId && ["idle","stopped","manual-preserved","locked"].includes(player.status));
            const status=snapshot.remaining.length?"draining":playerOK?"paused":"partial";
            report(ns,{status,id:command?.id??null,...snapshot,player,scope:"managed-scripts-and-owned-faction-work",
                excluded:["manual-activities","sleeve-assignments","gang-assignments","bladeburner-action","corporation-simulation"]});
            if(status==="paused" && command)finishControl(ns,command.id,"succeeded",{scope:"managed-scripts-and-owned-faction-work",player});
        } catch(error) {report(ns,{status:"blocked",error:String(error)});}
        await ns.sleep(500);
    }
}
