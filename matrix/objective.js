import { readObjective, submitObjective } from "/matrix/lib/objective-state.js";
export async function main(ns) {
    if(ns.getHostname()!=="home"){ns.tprint("MATRIX // OBJECTIVE MUST RUN ON HOME");return;}
    try {
        const [action="status",a,b,c]=ns.args;
        if(action==="status" && ns.args.length<=1){ns.tprint(JSON.stringify(readObjective(ns),null,2));return;}
        if((action!=="faction" && action!=="auto") || (action==="faction" && ![3,4].includes(ns.args.length)) || (action==="auto" && ns.args.length>2))
            throw new Error('Usage: faction "Faction" targetRep [id] | auto [id] | status');
        if(action==="faction") {
            const reset=ns.getResetInfo();
            if(reset.currentNode!==4 && !(reset.ownedSF?.get?.(4)>0))throw new Error("Singularity unavailable");
            if(ns.getServerMaxRam("home")<64 || !(ns.getScriptRam("/matrix/workers/singularity/work.js","home")>0))throw new Error("full-progression-not-installed");
        }
        const result=submitObjective(ns,{action,id:(action==="faction"?c:a)??`${Date.now()}:${ns.pid}`,faction:action==="faction"?a:null,targetRep:action==="faction"?Number(b):null});
        ns.tprint(`MATRIX // OBJECTIVE ${result.status} // ${result.id}${result.replay?" (replay)":""}`);
        ns.tprint("MATRIX // run /matrix/objective.js status FOR THE JOURNAL. Acceptance is not completion; the full Singularity worker executes the goal.");
    }catch(error){ns.tprint(`MATRIX // OBJECTIVE REJECTED: ${String(error)}`);}
}
