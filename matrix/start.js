import { config, sfLevel, event } from "/matrix/lib/common.js";

const CORE=[
    "/matrix/services/root.js",
    "/matrix/services/hacking.js",
    "/matrix/services/cloud.js",
    "/matrix/services/hacknet.js",
    "/matrix/services/contracts.js",
    "/matrix/services/telemetry.js",
];

function can(reset,n){return reset.currentNode===n||sfLevel(reset,n)>0;}

function ensure(ns,file){
    if(!ns.fileExists(file,"home"))return 0;
    if(ns.isRunning(file,"home"))return 0;
    const need=ns.getScriptRam(file,"home");
    const free=ns.getServerMaxRam("home")-ns.getServerUsedRam("home");
    if(free<need)return 0;
    return ns.run(file,{threads:1,preventDuplicates:true});
}

export async function main(ns){
    ns.disableLog("ALL");
    const cfg=config(ns);
    const phase2=ns.args.includes("--phase2");
    if(ns.getServerMaxRam("home")<(cfg.hacking?.fullEngineHomeRam??32)&&!phase2){
        if(!ns.isRunning("/matrix/bootstrap.js","home"))ns.run("/matrix/bootstrap.js",{threads:1,preventDuplicates:true});
        if(cfg.ui?.autoOpen!==false&&!ns.isRunning("/matrix/dashboard.jsx","home"))ns.run("/matrix/dashboard.jsx",{threads:1,preventDuplicates:true});
        return;
    }

    if(ns.isRunning("/matrix/bootstrap.js","home"))ns.scriptKill("/matrix/bootstrap.js","home");
    for(const f of CORE) if(cfg.automation?.[f.split("/").pop().replace(".js","")]!==false) ensure(ns,f);

    const reset=ns.getResetInfo();
    if(cfg.automation?.stock!==false&&ns.getServerMaxRam("home")>=64)ensure(ns,"/matrix/services/stock.js");
    if(cfg.automation?.singularity!==false&&can(reset,4))ensure(ns,"/matrix/services/singularity.js");
    if(cfg.automation?.gang!==false&&can(reset,2))ensure(ns,"/matrix/services/gang.js");
    if(cfg.automation?.sleeves!==false&&can(reset,10))ensure(ns,"/matrix/services/sleeves.js");
    if(cfg.automation?.bladeburner!==false&&(can(reset,6)||can(reset,7)))ensure(ns,"/matrix/services/bladeburner.js");
    if(cfg.automation?.corporation!==false&&can(reset,3))ensure(ns,"/matrix/services/corporation.js");

    if(cfg.ui?.autoOpen!==false&&!ns.isRunning("/matrix/dashboard.jsx","home"))ensure(ns,"/matrix/dashboard.jsx");
    await event(ns,"system","MATRIX autonomous control system online","success");
}
