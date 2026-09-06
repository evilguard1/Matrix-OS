import { submitControl, readControl } from "/matrix/lib/control-state.js";

export async function main(ns) {
    if(ns.getHostname()!=="home") {ns.tprint("MATRIX // CONTROL MUST RUN ON HOME");return;}
    const [action="status", suppliedId]=ns.args;
    try {
        if(action==="status") {
            ns.tprint(JSON.stringify({journal:readControl(ns),observed:JSON.parse(ns.read("/matrix/state/control-status.txt")||"null")},null,2));return;
        }
        const result=submitControl(ns,action,suppliedId??`${Date.now()}:${ns.pid}`);
        ns.tprint(`MATRIX // ${result.action.toUpperCase()} ${result.status} // ${result.id}${result.replay?" (replay)":""}`);
        ns.tprint("MATRIX // run /matrix/control.js status FOR THE OBSERVED RESULT. If no stage is active, run /matrix/kernel.js.");
    } catch(error) {ns.tprint(`MATRIX // CONTROL REJECTED: ${String(error)}`);}
}
