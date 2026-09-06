import { buildBriefing, renderBriefing } from "/matrix/lib/briefing.js";
import { readControl } from "/matrix/lib/control-state.js";
import { readObjective } from "/matrix/lib/objective-state.js";
import { scanAll } from "/matrix/lib/network.js";

const OUTPUT="/matrix/state/briefing.txt";
const STATE_FILES={bootstrap:"bootstrap",early:"early-progression",hacking:"hacking",coordinator:"coordinator",singularity:"singularity-dispatch",backdoors:"backdoor-route",dashboard:"dashboard",control:"control-status"};
const FILES=["bootstrap.js","early.js","early-progression.js","start.js","services/hacking.js","services/coordinator.js","services/singularity.js","workers/singularity/backdoors.js","dashboard.jsx","control.js","objective.js"];
const KEEP=new Set(["matrix/briefing.js","matrix/control.js","matrix/control-engine.js","matrix/services/telemetry.js","matrix/dashboard.jsx"]);
function json(ns,path) {const raw=ns.read(path);return raw?JSON.parse(raw):null;}

export function collectBriefing(ns,now=Date.now()) {
    const reset=ns.getResetInfo(),{hosts}=scanAll(ns);
    const processes=hosts.flatMap(host=>ns.ps(host).map(p=>({host,pid:p.pid,file:String(p.filename).replace(/^\/+/,"")})));
    const states=Object.fromEntries(Object.entries(STATE_FILES).map(([key,name])=>{
        try{return [key,json(ns,`/matrix/state/${name}.txt`)];}catch{return [key,{invalid:true}];}
    }));
    let control,controlError=null,configuration={},configurationError=null,manifest;
    let operatorJournal=null,objectiveError=null;
    try{operatorJournal=readObjective(ns);states.operator=operatorJournal.active;}catch(error){objectiveError=String(error);states.operator={invalid:true};}
    try{control=readControl(ns);}catch(error){controlError=String(error);}
    try{configuration=json(ns,"/matrix/config.json")??{};if(typeof configuration!=="object" || Array.isArray(configuration))throw new Error("invalid-config");}catch(error){configurationError=String(error);}
    try{manifest=json(ns,"/matrix/manifest.json");}catch{}
    const manifestValid=Array.isArray(manifest?.files) && manifest.files.length>0 && manifest.files.every(f=>typeof f?.path==="string" && /^matrix\/[\w./-]+$/.test(f.path) && !f.path.includes(".."));
    const owned=new Set(manifestValid?manifest.files.map(f=>f.path):[]);owned.add("matrix/remote-install.js");
    const files=Object.fromEntries(FILES.map(file=>{const path=`matrix/${file}`;return [path,{installed:ns.fileExists(`/${path}`,"home"),ram:ns.getScriptRam(`/${path}`,"home")}];}));
    return buildBriefing({now,reset:{...reset,sourceFiles:[...(reset.ownedSF?.entries?.()??[])]},states,files,processes,
        home:{maxRam:ns.getServerMaxRam("home"),usedRam:ns.getServerUsedRam("home"),cash:ns.getServerMoneyAvailable("home")},
        selfRam:ns.getScriptRam("/matrix/briefing.js","home"),control,controlError,configuration,configurationError,manifestValid,operatorJournal,objectiveError,
        remainingManaged:processes.filter(p=>owned.has(p.file) && !KEEP.has(p.file)).length});
}

export async function main(ns) {
    if(ns.getHostname()!=="home"){ns.tprint("MATRIX // BRIEFING MUST RUN ON HOME");return;}
    if(ns.args.length>1 || (ns.args.length===1 && ns.args[0]!=="--json")){ns.tprint("Usage: run /matrix/briefing.js [--json]");return;}
    try {
        const report=collectBriefing(ns),raw=JSON.stringify(report);
        ns.write(OUTPUT,raw,"w");if(ns.read(OUTPUT)!==raw)throw new Error("briefing-write-failed");
        ns.tprint(ns.args[0]==="--json"?raw:renderBriefing(report));
    }catch(error){
        // Revoke a previous snapshot when observation fails. If storage itself
        // fails, the client must still enforce the previous report's short TTL.
        const now=Date.now(),raw=JSON.stringify({schemaVersion:1,updated:now,expiresAt:now,status:"unavailable",nodeProgress:null,objective:null,options:[],error:String(error)});
        let revoked=false;try{ns.write(OUTPUT,raw,"w");revoked=ns.read(OUTPUT)===raw;}catch{}
        ns.tprint(`MATRIX // BRIEFING UNAVAILABLE: ${String(error)}. ${revoked?"Previous report revoked.":"Output storage unavailable; reject cached reports after their expiry."}`);
    }
}
