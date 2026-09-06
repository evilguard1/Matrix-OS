import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
import {readObjective,submitObjective,updateObjective,objectivePending} from '../matrix/lib/objective-state.js';
async function load(file){const b=await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'game',setup(b){b.onResolve({filter:/^\/matrix\//},a=>({path:path.resolve(a.path.slice(1))}));}}]});return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));}
const worker=await load('matrix/lib/faction-objective.js'),resetWorker=await load('matrix/workers/singularity/reset.js'),workWorker=await load('matrix/workers/singularity/work.js'),brief=await load('matrix/briefing.js');
const progression=await load('matrix/services/progression.js');
function fixture(){
 const files=new Map(),reset={currentNode:4,lastNodeReset:1,lastAugReset:2,ownedSF:new Map()};let rep=40,work=null,effects=0;
 const ns={pid:2,args:['cycle'],getResetInfo:()=>reset,getPlayer:()=>({factions:['CyberSec']}),read:p=>files.get(p)??'',write:(p,v)=>files.set(p,v),
 singularity:{getFactionRep:()=>rep,getCurrentWork:()=>work,getFactionWorkTypes:()=>['hacking'],workForFaction:f=>{effects++;work={type:'FACTION',factionName:f,factionWorkType:'hacking'};return true;},getOwnedAugmentations(){throw new Error('reset must be blocked before checking purchases');}}};
 return {ns,files,reset,setRep:r=>rep=r,setWork:w=>work=w,effects:()=>effects};
}
const request={action:'faction',id:'goal-1',faction:'CyberSec',targetRep:100};
{
 const f=fixture();assert.equal(submitObjective(f.ns,request).status,'accepted');assert.equal(objectivePending(f.ns),true);
 assert.equal(submitObjective(f.ns,request).replay,true);assert.throws(()=>submitObjective(f.ns,{...request,targetRep:200}),/conflict/);
 assert.throws(()=>submitObjective(f.ns,{...request,id:'other'}),/busy/);
 worker.advanceFactionObjective(f.ns);assert.equal(readObjective(f.ns).active.status,'working');assert.equal(f.effects(),1);
 worker.advanceFactionObjective(f.ns);assert.equal(f.effects(),1,'same work must not restart on every observation');
 assert.throws(()=>updateObjective(f.ns,'goal-1',{status:'succeeded',currentRep:99}),/postcondition/);
 f.setRep(100);worker.advanceFactionObjective(f.ns);assert.equal(readObjective(f.ns).active,null);
 assert.equal(readObjective(f.ns).receipts[0].status,'succeeded');assert.equal(submitObjective(f.ns,request).status,'succeeded');
}
{
 const f=fixture();submitObjective(f.ns,request);f.setWork({type:'CRIME'});worker.advanceFactionObjective(f.ns);
 assert.equal(f.effects(),0);assert.equal(readObjective(f.ns).active.reason,'manual-activity-preserved');
 f.setWork({type:'FACTION',factionName:'CyberSec',factionWorkType:'hacking'});worker.advanceFactionObjective(f.ns);
 assert.equal(readObjective(f.ns).active.status,'observing');assert.equal(f.effects(),0);
}
{
 const f=fixture();submitObjective(f.ns,request);f.reset.lastAugReset=3;worker.advanceFactionObjective(f.ns);
 assert.equal(readObjective(f.ns).active,null);assert.equal(readObjective(f.ns).receipts[0].status,'reset-interrupted');assert.equal(f.effects(),0);
 assert.equal(submitObjective(f.ns,request).status,'reset-interrupted','same id cannot re-arm the goal after reset');
}
{
 const f=fixture();submitObjective(f.ns,request);const automatic={action:'auto',id:'return-auto'};
 assert.equal(submitObjective(f.ns,automatic).scope,'automatic-policy-restored');assert.equal(readObjective(f.ns).receipts[0].status,'cancelled');
 assert.equal(worker.advanceFactionObjective(f.ns),false);assert.equal(submitObjective(f.ns,automatic).replay,true);
}
{
 const f=fixture();submitObjective(f.ns,request);f.ns.write=()=>{};
 assert.throws(()=>worker.advanceFactionObjective(f.ns),/write-failed/);assert.equal(f.effects(),0,'durable intent must precede native work');
}
{
 const f=fixture();submitObjective(f.ns,request);await resetWorker.main(f.ns);
 assert.equal(JSON.parse(f.files.get('/matrix/state/singularity-receipt.txt')).status,'done');
 f.files.set('/matrix/state/objective-journal.txt','{broken');assert.equal(objectivePending(f.ns),true);await resetWorker.main(f.ns);
 assert.equal(JSON.parse(f.files.get('/matrix/state/singularity-receipt.txt')).status,'done');
}
{
 const f=fixture();submitObjective(f.ns,request);f.files.set('/matrix/config.json','{"masterEnabled":false}');await workWorker.main(f.ns);
 assert.equal(f.effects(),0);assert.equal(readObjective(f.ns).active.status,'accepted');
}
for(const targetRep of [0,-1,Infinity,NaN,1e13,'100'])assert.throws(()=>submitObjective(fixture().ns,{...request,targetRep}),/invalid/);
{
 const f=fixture();assert.throws(()=>submitObjective(f.ns,{...request,faction:'Unknown'}),/not-joined/);
 submitObjective(f.ns,request);const s=readObjective(f.ns);s.active.targetRep=99;f.files.set('/matrix/state/objective-journal.txt',JSON.stringify(s));assert.throws(()=>readObjective(f.ns),/invalid/);
}
{
 const f=fixture();submitObjective(f.ns,request);worker.advanceFactionObjective(f.ns);
 Object.assign(f.ns,{scan:()=>[],ps:()=>[{pid:3,filename:'matrix/start.js'},{pid:4,filename:'matrix/services/singularity.js'}],fileExists:()=>true,getScriptRam:()=>4,getServerMaxRam:()=>64,getServerUsedRam:()=>40,getServerMoneyAvailable:()=>1000});
 const r=brief.collectBriefing(f.ns);assert.equal(r.objective.source,'operator');assert.equal(r.objective.metric.percent,40);assert.equal(r.nodeProgress,null);
 f.reset.lastAugReset=3;assert.equal(brief.collectBriefing(f.ns).objective,null);
}
console.log('Objective passed: durable intent, idempotence/conflicts, verified threshold, restart, manual activity, pause, reset interruption, auto policy and briefing attribution.');
{
 const f=fixture();submitObjective(f.ns,request);
 f.files.set('/matrix/config.json',JSON.stringify({progression:{autoDestroyWorldDaemon:true}}));
 f.files.set('/matrix/state/singularity.txt',JSON.stringify({schemaVersion:1,resetEpoch:'4:1:2',updated:Date.now(),hasRedPill:true}));
 Object.assign(f.ns,{disableLog(){},getServerRequiredHackingLevel:()=>1,hasRootAccess:()=>true,getHackingLevel:()=>315,sleep:async()=>{throw new Error('end-test');}});
 f.ns.singularity.destroyW0r1dD43m0n=()=>{throw new Error('objective must block node exit');};
 await assert.rejects(()=>progression.main(f.ns),/end-test/);
 assert.equal(JSON.parse(f.files.get('/matrix/state/progression.txt')).objectiveBlocked,true);
}
