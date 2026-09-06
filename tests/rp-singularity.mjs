import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {progressionRam,SINGULARITY_TASKS} from '../matrix/lib/progression-ram.js';
const load=async file=>{
 const s=fs.readFileSync(file,'utf8').replace(/from\s*["'](\/matrix\/[^"']+)["']/g,(_,p)=>`from "${pathToFileURL(path.resolve(p.slice(1))).href}"`);
 return import(`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`);
};
const driver=await load('matrix/services/singularity.js'), lib=await load('matrix/lib/singularity-tasks.js');
function fixture(){
 const files=new Map(),reset={currentNode:4,lastNodeReset:1,lastAugReset:2,ownedSF:new Map()},launched=[];
 const ns={pid:1,args:['cycle'],getResetInfo:()=>reset,getServerMaxRam:()=>64,getServerUsedRam:()=>39,
  getScriptRam:p=>p.includes('backdoor-install')?1:p.includes('backdoors.js')?10:23,read:p=>files.get(p)??'',write:(p,v)=>files.set(p,v),ps:()=>[],
  run(file,opts,cycle){launched.push(file);const name=file.split('/').at(-1).slice(0,-3);files.set('/matrix/state/singularity-receipt.txt',JSON.stringify({cycle,task:name,resetEpoch:'4:1:2',status:'done'}));return launched.length;}};
 return {ns,files,launched,reset};
}
{
 const f=fixture();assert.equal(progressionRam(f.ns),23);
 f.reset.currentNode=1;assert.equal(progressionRam(f.ns),0);
 f.reset.ownedSF.set(4,1);f.ns.getScriptRam=()=>320;assert.equal(progressionRam(f.ns),0);
 f.ns.getServerMaxRam=()=>1024;assert.equal(progressionRam(f.ns),640);
}
{
 const f=fixture();assert.equal((await driver.runCycle(f.ns,'cycle')).status,'online');assert.equal(f.launched.length,SINGULARITY_TASKS.length);
}
for(const [kind,change] of [
 ['paused',f=>f.files.set('/matrix/config.json','{"masterEnabled":false}')],
 ['ram-blocked',f=>f.ns.getServerUsedRam=()=>50],
 ['waiting-worker',f=>f.ns.ps=()=>[{pid:10,filename:'/matrix/workers/singularity/catalog.js'}]],
 ['launch-failed',f=>f.ns.run=()=>0],
 ['missing-receipt',f=>f.ns.run=()=>1],
 ['not-installed',f=>f.ns.getScriptRam=()=>0]]){
 const f=fixture();change(f);assert.equal((await driver.runCycle(f.ns,'cycle')).status,kind);
}
{
 const f=fixture();let calls=0;
 f.ns.singularity={getCurrentWork:()=>({type:'FACTION',factionName:'CyberSec',factionWorkType:'hacking'}),getFactionWorkTypes:()=>['hacking'],workForFaction:()=>{calls++;return true;}};
 assert.equal(lib.workGoal(f.ns,{faction:'CyberSec'}),true);assert.equal(calls,0,'same work must survive dispatcher restarts');
 assert.equal(lib.workGoal(f.ns,{faction:'NiteSec'}),false);assert.equal(calls,0,'unowned player work must be preserved');
 f.files.set('/matrix/state/player-activity.txt',JSON.stringify({resetEpoch:'4:1:2',owner:'singularity',faction:'CyberSec',workType:'hacking'}));
 assert.equal(lib.workGoal(f.ns,{faction:'NiteSec'}),true);assert.equal(calls,1);
 f.reset.lastAugReset=3;assert.equal(lib.workGoal(f.ns,{faction:'NiteSec'}),false);
}
{
 const f=fixture();lib.saveCycle(f.ns,'catalog',{list:[]});assert.ok(lib.readCycle(f.ns,'catalog'));
 f.ns.args=['new-cycle'];assert.equal(lib.readCycle(f.ns,'catalog'),null);
 let effects=0;f.files.set('/matrix/config.json','{"masterEnabled":false}');
 await lib.task(f.ns,'test',()=>effects++);assert.equal(effects,0);
}
console.log('RP Singularity passed: sequential receipts, RAM/capability admission, missing child, orphan wait, pause, reset epochs and preservation of existing player work.');
const coordinator=await load('matrix/services/coordinator.js'), progression=await load('matrix/services/progression.js');
const eligible={cash:60e9,hasTor:true,hackingLevel:2500,installedCount:30,daedalusAugsRequirement:30};
assert.match(coordinator.evaluateObjective(eligible).title,/Daedalus/);
for(const change of [{installedCount:29},{installedCount:null},{daedalusAugsRequirement:null},{hackingLevel:2499}]) {
 assert.doesNotMatch(coordinator.evaluateObjective({...eligible,...change}).title,/Daedalus/);
}
assert.match(coordinator.evaluateObjective({...eligible,hackingLevel:1,combatSkills:[1500,1500,1500,1500]}).title,/Daedalus/);
assert.notEqual(coordinator.evaluateObjective({worldDaemonRooted:true,hackingLevel:9000,worldDaemonReqLevel:3000}).id,'W0R1D_D43M0N');
assert.equal(coordinator.evaluateObjective({redPillQueued:true,queuedAugs:1}).id,'INSTALL_AUGMENTATIONS');
assert.equal(coordinator.evaluateObjective({factions:['Daedalus'],redPillRep:2500000,redPillPrice:0}).milestone.pct,100);
const f=fixture(),state={schemaVersion:1,resetEpoch:'4:1:2',updated:Date.now(),hasRedPill:true};
assert.equal(progression.daemonReady(f.reset,state,true,3000,3000),true);
assert.equal(progression.daemonReady(f.reset,{...state,hasRedPill:false},true,3000,3000),false);
assert.equal(progression.daemonReady(f.reset,{...state,resetEpoch:'4:1:1'},true,3000,3000),false);
assert.equal(progression.daemonReady(f.reset,state,true,3000,0),false);
