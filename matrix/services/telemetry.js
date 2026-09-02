import { config, readJson, writeJson, STATE_DIR, EVENTS } from "/matrix/lib/common.js";
import { scanAll, routeTo } from "/matrix/lib/network.js";
import { manualActions, singularityReady, PORT_PROGRAMS } from "/matrix/lib/capabilities.js";
import { factionDirectives, factionPlan, BACKDOOR_FACTIONS } from "/matrix/lib/factions.js";
import { narrate, moduleDirectives } from "/matrix/lib/voice.js";
import { augmentationPlan, augmentationDirectives, bestFactionToGrind } from "/matrix/lib/augmentations.js";

const SERVICES=["bootstrap","early","root","hacking","cloud","hacknet","contracts","stock","progression","coordinator","singularity","gang","sleeves","bladeburner","corporation"];

// Which faction-gating servers the player can backdoor RIGHT NOW. Reading the
// actual backdoor flag needs ns.getServer at 2 GB, which does not fit the 32 GB
// stage - and is not needed: a backdoor produces an invitation immediately, so
// "rooted, in level range, faction not joined" is the same instruction. Treating
// an already-joined faction's server as done keeps it from nagging.
function backdoorable(ns){
    const out=[];
    for(const host of Object.keys(BACKDOOR_FACTIONS)){
        try{
            if(ns.hasRootAccess(host)&&ns.getServerRequiredHackingLevel(host)<=ns.getHackingLevel())out.push(host);
        }catch{}
    }
    return out;
}

// installBackdoor() is Singularity, so below SF4 the player has to type it. The
// least MATRIX can do is say exactly what is blocking each one and hand over the
// full connect path - every input here is already paid for by this service.
function backdoorDetail(ns,parent,crackers){
    const out={};
    for(const host of Object.keys(BACKDOOR_FACTIONS)){
        try{
            out[host]={
                level:ns.getServerRequiredHackingLevel(host),
                have:ns.getHackingLevel(),
                ports:ns.getServerNumPortsRequired(host),
                crackers,
                rooted:ns.hasRootAccess(host),
                // routeTo omits "home"; the hops are what the player types.
                path:routeTo(parent,host).filter(h=>h!=="home"),
            };
        }catch{}
    }
    return out;
}

// A backdoor produces its faction invitation immediately, so a joined faction
// is proof its backdoor is done - without paying 2 GB for ns.getServer.
function backdoorsDone(joined){
    return Object.entries(BACKDOOR_FACTIONS).filter(([,f])=>joined.includes(f)).map(([host])=>host);
}

function eventLines(ns){
    const raw=ns.read(EVENTS);
    if(!raw)return[];
    return raw.trim().split("\n").slice(-80).map(x=>{try{return JSON.parse(x)}catch{return null}}).filter(Boolean).reverse();
}

export async function main(ns){
    ns.disableLog("ALL");
    while(true){
        try{
            const cfg=config(ns);
            const player=ns.getPlayer();
            const reset=ns.getResetInfo();
            const {hosts,parent}=scanAll(ns);
            const rooted=hosts.filter(h=>ns.hasRootAccess(h)).length;
            const maxRam=hosts.reduce((s,h)=>s+(ns.hasRootAccess(h)?ns.getServerMaxRam(h):0),0);
            const usedRam=hosts.reduce((s,h)=>s+(ns.hasRootAccess(h)?ns.getServerUsedRam(h):0),0);
            const serviceState={};
            for(const name of SERVICES)serviceState[name]=readJson(ns,`${STATE_DIR}/${name}.txt`,null);

            let income=null;
            try{income=ns.getMoneySources().sinceInstall;}catch{}
            let game={version:"3.x"};
            try{game=ns.ui.getGameInfo();}catch{}

            // Single writer: telemetry computes what the player still has to do by
            // hand so every UI renders the same list instead of each recomputing it.
            const singularity=singularityReady(reset);
            const owned=PORT_PROGRAMS.filter(p=>ns.fileExists(p.file,"home")).map(p=>p.file);
            const manual=manualActions({
                homeRam:ns.getServerMaxRam("home"),
                cash:player.money,
                hackingLevel:player.skills?.hacking??1,
                ownedPrograms:owned,
                singularity,
                // From 32 GB the cloud service buys servers itself.
                cloudAutomated:ns.getServerMaxRam("home")>=32&&cfg.automation?.cloud!==false,
            });

            // Faction guidance. Joining needs Singularity, but KNOWING what each
            // faction wants does not - so the deck can always point at the next
            // real move even when the game will not let a script take it.
            const factionInput={
                skills:player.skills,money:player.money,city:player.city,karma:player.karma,
                kills:player.numPeopleKilled,factions:player.factions,jobs:player.jobs,
                backdoors:backdoorsDone(player.factions??[]),
                reachable:backdoorable(ns),
                backdoorInfo:backdoorDetail(ns,parent,owned.length),
                augs:(player.augmentations??[]).length,
                hacknet:serviceState.hacknet?.totals??{levels:0,ram:0,cores:0},
            };
            let factions=null,directives=[],augs=null,grind=null,augState=null;
            try{
                factions=factionPlan(factionInput,{singularity});
                // Order is the message: what you can do now, then what MATRIX is
                // holding in reserve and which BitNode releases it.
                // Faction rep needs Singularity to read, so before SF4 it is
                // absent and every implant reports as "needs rep" - which names
                // the requirement instead of hiding the implant.
                augState={
                    owned:(player.augmentations??[]).map(a=>typeof a==="string"?a:a?.name).filter(Boolean),
                    factions:player.factions??[],
                    factionRep:readJson(ns,`${STATE_DIR}/faction-rep.txt`,{}),
                    money:player.money,
                };
                augs=augmentationPlan(augState);
                grind=bestFactionToGrind(augState);
                directives=narrate([
                    ...factionDirectives(factionInput,{singularity}),
                    ...augmentationDirectives(augState,{singularity}),
                    ...moduleDirectives([...(reset.ownedSF?.entries?.()??[])]),
                ]);
            }catch{}

            await writeJson(ns,`${STATE_DIR}/overview.txt`,{
                updated:Date.now(),config:cfg,game,
                player:{money:player.money,city:player.city,karma:player.karma,skills:player.skills,factions:player.factions},
                reset:{currentNode:reset.currentNode,lastAugReset:reset.lastAugReset,lastNodeReset:reset.lastNodeReset,
                    sourceFiles:[...(reset.ownedSF?.entries?.()??[])]},
                network:{discovered:hosts.length,rooted,maxRam,usedRam,ramPct:maxRam?usedRam/maxRam:0},
                income,
                singularity,manual,ownedPrograms:owned,
                factions:factions?{
                    joined:factions.joined.map(f=>f.name),
                    eligible:factions.eligible.map(f=>({name:f.name,how:f.how})),
                    pending:factions.pending.slice(0,8).map(f=>({name:f.name,missing:f.missing,how:f.how})),
                }:null,
                directives,
                augmentations:augs?{
                    ready:augs.ready.map(a=>({name:a.name,faction:a.faction,money:a.money,value:a.value})),
                    blocked:augs.blocked.map(a=>({name:a.name,faction:a.faction,repShort:a.repShort,moneyShort:a.moneyShort})),
                    total:augs.total,
                }:null,
                grind,
                services:serviceState,
                events:eventLines(ns)
            });
        }catch{}
        await ns.sleep(1000);
    }
}
