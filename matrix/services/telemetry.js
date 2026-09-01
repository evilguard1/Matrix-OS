import { config, readJson, writeJson, STATE_DIR, EVENTS } from "/matrix/lib/common.js";
import { scanAll } from "/matrix/lib/network.js";

const SERVICES=["bootstrap","early","root","hacking","cloud","hacknet","contracts","stock","progression","singularity","gang","sleeves","bladeburner","corporation"];

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
            const {hosts}=scanAll(ns);
            const rooted=hosts.filter(h=>ns.hasRootAccess(h)).length;
            const maxRam=hosts.reduce((s,h)=>s+(ns.hasRootAccess(h)?ns.getServerMaxRam(h):0),0);
            const usedRam=hosts.reduce((s,h)=>s+(ns.hasRootAccess(h)?ns.getServerUsedRam(h):0),0);
            const serviceState={};
            for(const name of SERVICES)serviceState[name]=readJson(ns,`${STATE_DIR}/${name}.txt`,null);

            let income=null;
            try{income=ns.getMoneySources().sinceInstall;}catch{}
            let game={version:"3.x"};
            try{game=ns.ui.getGameInfo();}catch{}

            await writeJson(ns,`${STATE_DIR}/overview.txt`,{
                updated:Date.now(),config:cfg,game,
                player:{money:player.money,city:player.city,karma:player.karma,skills:player.skills,factions:player.factions},
                reset:{currentNode:reset.currentNode,lastAugReset:reset.lastAugReset,lastNodeReset:reset.lastNodeReset,
                    sourceFiles:[...(reset.ownedSF?.entries?.()??[])]},
                network:{discovered:hosts.length,rooted,maxRam,usedRam,ramPct:maxRam?usedRam/maxRam:0},
                income,
                services:serviceState,
                events:eventLines(ns)
            });
        }catch{}
        await ns.sleep(1000);
    }
}
