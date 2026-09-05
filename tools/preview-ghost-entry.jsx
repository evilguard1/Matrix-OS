import React from "react";
import ReactDOM from "react-dom";
globalThis.React=React;
(async()=>{
// Dynamic import ensures the game's global React exists before the boundary class loads.
const deck=await import("../matrix/dashboard.jsx");
const now=Date.now();
const targets=[
 ["joesguns",38,.98,.04,138], ["foodnstuff",31,1,0,95], ["sigma-cosmetics",29,.96,.06,112],
 ["phantasy",34,.99,.02,164], ["omega-net",28,.94,.08,180], ["silver-helix",27,.99,.01,151]
].map(([target,activeBatches,liveMoneyFraction,liveSecurityExcess,time],i)=>({target,rank:i+1,state:"active",activeBatches,liveMoneyFraction,liveSecurityExcess,pipelineDepth:42,planningBatchRam:78.5+i*5,planningRequestedHackFraction:.1+i*.025,liveWeakenTime:time*1000}));
const data={preview:true,updated:now,game:{version:"3.0.1"},player:{money:64.28e9,city:"Sector-12",skills:{hacking:1732},factions:["CyberSec","NiteSec"],karma:-180},reset:{currentNode:1,lastAugReset:now-3600e3,lastNodeReset:now-9e6,sourceFiles:[]},network:{rooted:61,discovered:72,maxRam:131072,usedRam:112722,ramPct:112722/131072},income:{hacking:87.4e9,hacknet:34e6},singularity:false,
 services:{hacking:{updated:now,status:"batching",phase:"HWGW-ROLLING",target:"joesguns",activeBatches:187,readyTargets:6,preppingTargets:4,targetScheduler:targets,successfulBatchLaunches:2354,inflightHwgwRam:90200,prepRam:14800,intentionallyReservedRam:4096,usableIdleRam:9720},coordinator:{updated:now,status:"online",title:"Ouvrir la porte de Daedalus.",reason:"Consolider le capital et le niveau de hacking. Chaque ressource sert la prochaine étape.",nextStep:"Atteindre le seuil de capital publié par le coordinateur.",milestone:{name:"Capital · objectif 100 G$",pct:64.28}},root:{updated:now,status:"online",reason:"Reconnaissance des hôtes accessibles."},cloud:{updated:now,status:"online",servers:8,totalRam:131008},contracts:{updated:now,status:"online",reason:"Solveurs disponibles ; attente de nouveaux contrats."},hacknet:{updated:now,status:"online",nodes:8},stock:{updated:now,status:"locked",reason:"Accès TIX absent dans ce scénario."},singularity:{updated:now,status:"locked",reason:"BN1 sans SF4 dans ce scénario."}},
 manual:[{id:"backdoor",label:"Une porte attend ton intervention.",detail:"Installer le backdoor sur CSEC après vérification du chemin en jeu.",ready:true}],directives:[],
 events:[{t:now-1000,service:"hacking",level:"info",message:"187 lots admis. Les échéances des six cibles sont suivies."},{t:now-7000,service:"coordinator",level:"info",message:"Objectif publié : capital pour Daedalus."},{t:now-15000,service:"stock",level:"warn",message:"Accès TIX absent ; aucune opération de trading admise."},{t:now-22000,service:"root",level:"success",message:"Scan terminé : 61 hôtes rootés sur 72 découverts."}],augmentations:{ready:[],blocked:[],total:0},factions:{joined:["CyberSec","NiteSec"],eligible:[],pending:[]}};
const config={masterEnabled:true,automation:{rooting:true,hacking:true,cloud:true,hacknet:true,contracts:true,stock:false,progression:true},ui:{refreshMs:750}};
let scenario="active";
const files={"/matrix/config.json":JSON.stringify(config)};
const mock={read:file=>files[file] ?? "",write:async(file,value)=>{files[file]=value;return true;},getServerMoneyAvailable:()=>0};
function update(){
 const snapshot=JSON.parse(JSON.stringify(data));
 snapshot.updated=scenario==="stale"?now-120000:Date.now();
 for(const service of Object.values(snapshot.services))service.updated=snapshot.updated;
 if(scenario==="bn4")snapshot.reset.currentNode=4;
 files["/matrix/state/overview.txt"]=JSON.stringify(scenario==="empty"?{preview:true,updated:0}:snapshot);
 deck.publish(mock);
 if(scenario!=="empty"){
  deck.store.history=Array.from({length:61},(_,i)=>({t:Date.now()-(60-i)*1000,money:60.3e9+i*64e6+Math.sin(i*.27)*.13e9}));
  deck.store.publish({...deck.store.snapshot,history:deck.store.history});
 }
}
update();ReactDOM.render(<deck.App/>,document.getElementById("ghost-preview-root"));
document.getElementById("preview-scenario").addEventListener("change",e=>{scenario=e.target.value;deck.store.commandLog=[];deck.store.history=[];update();});
setInterval(async()=>{await deck.applyCommands(mock);update();},1000);
})();
