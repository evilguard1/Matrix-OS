import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {readControl,submitControl,finishControl,controlCheckpoint,CONTROL_FILE} from '../matrix/lib/control-state.js';
import {config} from '../matrix/lib/common.js';
async function load(file){
 const b=await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'game',setup(b){b.onResolve({filter:/^\/matrix\//},a=>({path:path.resolve(a.path.slice(1))}));}}]});
 return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
}
const engine=await load('matrix/control-engine.js'),player=await load('matrix/workers/control-stop-player.js'),hacking=await load('matrix/services/hacking.js');
function fixture(){
 const files=new Map([['/matrix/manifest.json',JSON.stringify({files:[{path:'matrix/services/hacking.js'},{path:'matrix/workers/hack.js'},{path:'matrix/worm/drone.js'}]})]]);
 const processes=[],kills=[],spawns=[];let work={type:'FACTION',factionName:'CyberSec',factionWorkType:'hacking'},stops=0;
 const ns={pid:1,args:['p1'],read:p=>files.get(p)??'',write:(p,v)=>files.set(p,v),clearPort(){},writePort(){},ps:()=>processes,
  scan:()=>[],ui:{closeTail(){}},kill(pid){kills.push(pid);const i=processes.findIndex(p=>p.pid===pid);if(i>=0)processes.splice(i,1);return true;},
  spawn:(...args)=>spawns.push(args),getScriptRam:()=>6,getServerMaxRam:()=>32,getServerUsedRam:()=>6,disableLog(){},sleep(){throw new Error('end-test');},
  getResetInfo:()=>({currentNode:4,lastNodeReset:1,lastAugReset:2,ownedSF:new Map()}),
  singularity:{getCurrentWork:()=>work,stopAction(){stops++;work=null;return true;}}};
 files.set('/matrix/state/player-activity.txt',JSON.stringify({resetEpoch:'4:1:2',owner:'singularity',faction:'CyberSec',workType:'hacking'}));
 return {ns,files,processes,kills,spawns,stops:()=>stops};
}
async function onePass(f){try{await engine.main(f.ns);}catch(e){if(e.message!=='end-test')throw e;}}
{
 const f=fixture();submitControl(f.ns,'pause','p1');assert.equal(config(f.ns).masterEnabled,false);
 assert.equal(submitControl(f.ns,'pause','p1').replay,true);assert.throws(()=>submitControl(f.ns,'resume','p1'),/conflict/);
 submitControl(f.ns,'resume','r1');assert.equal(readControl(f.ns).receipts[0].status,'cancelled');
 await player.main(f.ns);assert.equal(f.stops(),0,'cancelled pause cannot stop an activity');
 await onePass(f);assert.equal(f.spawns.at(-1)[0],'/matrix/kernel.js');assert.equal(readControl(f.ns).active.phase,'starting');
 assert.equal(controlCheckpoint(f.ns,'early'),false);assert.equal(readControl(f.ns).receipts.at(-1).scope,'stage-started');
 assert.equal(submitControl(f.ns,'resume','r1').replay,true);
}
{
 const f=fixture();submitControl(f.ns,'pause','p1');await player.main(f.ns);assert.equal(f.stops(),1);
 await onePass(f);assert.equal(readControl(f.ns).receipts.at(-1).status,'succeeded');
 await onePass(f);assert.equal(JSON.parse(f.files.get('/matrix/state/control-status.txt')).status,'paused');
}
{
 const f=fixture();f.files.set(CONTROL_FILE,JSON.stringify({schemaVersion:1,revision:1,desired:'paused',active:null,receipts:[]}));
 await onePass(f);assert.equal(JSON.parse(f.files.get('/matrix/state/control-status.txt')).status,'partial');
}
{
 const f=fixture();submitControl(f.ns,'pause','p1');f.files.delete('/matrix/state/player-activity.txt');await player.main(f.ns);
 assert.equal(f.stops(),0);assert.equal(JSON.parse(f.files.get('/matrix/state/control-player.txt')).status,'manual-preserved');
}
{
 const f=fixture();f.processes.push({pid:2,filename:'matrix/services/hacking.js'},{pid:3,filename:'matrix/workers/hack.js'},
 {pid:4,filename:'foreign.js'},{pid:5,filename:'matrix/custom.js'});
 const pass=engine.drainPass(f.ns);assert.deepEqual(f.kills,[2]);assert.deepEqual(pass.remaining.map(p=>p.pid),[3]);assert.deepEqual(pass.foreign.map(p=>p.pid),[4,5]);
 submitControl(f.ns,'resume','r1');await onePass(f);assert.equal(f.spawns.length,0);assert.equal(readControl(f.ns).desired,'paused');
}
{
 const f=fixture();submitControl(f.ns,'resume','old',Date.now()-120001);await onePass(f);
 assert.equal(readControl(f.ns).receipts.at(-1).status,'expired');assert.equal(f.spawns.length,0);assert.equal(config(f.ns).masterEnabled,false);
}
for(const value of ['bad',JSON.stringify({schemaVersion:1,revision:0,desired:'running',receipts:[{id:'x',action:'pause',status:'succeeded'},{id:'x',action:'pause',status:'succeeded'}]})]){
 const f=fixture();f.files.set(CONTROL_FILE,value);assert.throws(()=>submitControl(f.ns,'resume','r1'));assert.equal(config(f.ns).masterEnabled,false);
}
{
 const f=fixture();f.ns.write=()=>{};assert.throws(()=>submitControl(f.ns,'pause','p1'),/write-failed/);
}
{
 let copies=0,exists=true;const ns={fileExists:()=>exists,scp:async()=>{copies++;exists=true;return true;}};
 await hacking.ensureScript(ns,'/matrix/workers/share.js','n00dles');await hacking.ensureScript(ns,'/matrix/workers/share.js','n00dles');assert.equal(copies,1);
 exists=false;await hacking.ensureScript(ns,'/matrix/workers/share.js','n00dles');assert.equal(copies,2);
}
// Every delivered loop/one-shot worker must refuse a new operation at the barrier.
for(const file of ['hack','grow','weaken','share','early','stanek-charge']){
 const m=await load(`matrix/workers/${file}.js`);await m.main({args:[],peek:()=> 'MATRIX:PAUSED'});
}
for(const file of ['drone','spread']){const m=await load(`matrix/worm/${file}.js`);await m.main({args:[],peek:()=> 'MATRIX:PAUSED'});}
console.log('Control passed: pause/resume/replay, cancelled player stop, strict partial status, foreign preservation, drain before resume, corrupt state, failed writes and worker admission.');
