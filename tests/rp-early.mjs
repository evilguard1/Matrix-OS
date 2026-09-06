import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spendingAllowance} from '../matrix/lib/budget-ledger.js';
const source=fs.readFileSync('matrix/early-progression.js','utf8').replace(/from\s*["'](\/matrix\/[^"']+)["']/g,(_,p)=>`from "${pathToFileURL(path.resolve(p.slice(1))).href}"`);
const {chooseEarlyPurchase:choose,step,main}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const base={cash:2e6,reserve:0,homeCost:1e6,hasTor:false};
assert.equal(choose(base).owner,'homeRam');
assert.equal(choose({...base,cash:300000}).target,'TOR');
assert.equal(choose({...base,cash:300000,reserve:200000}).saving,true);
assert.equal(choose({...base,cash:300000,buyPrograms:false}).saving,true);
assert.equal(choose({...base,cash:300000,hasTor:true,missingProgram:'BruteSSH.exe',programCost:100000}).target,'BruteSSH.exe');
assert.equal(choose({...base,cash:500000,hasTor:true,missingProgram:'FTPCrack.exe',programCost:400000}).saving,true);
for(const homeCost of [NaN,Infinity,-1,0])assert.throws(()=>choose({...base,homeCost}));
function fixture(cash=2e6){
 const files=new Map([['/matrix/config.json',JSON.stringify({economy:{cashReserve:0,reserveFraction:0}})]]);
 let ram=32,calls=0;
 const reset={currentNode:4,lastNodeReset:1,lastAugReset:2,ownedSF:new Map()};
 const ns={pid:2,args:[],read:p=>files.get(p)??'',write(p,v,m){files.set(p,m==='a'?(files.get(p)??'')+v:v);},
  getResetInfo:()=>reset,getHostname:()=> 'home',getServerMaxRam:()=>ram,getServerMoneyAvailable:()=>cash,
  hasTorRouter:()=>false,fileExists:()=>false,singularity:{getUpgradeHomeRamCost:()=>1e6,upgradeHomeRam(){calls++;cash-=1e6;ram*=2;return true;}},
  disableLog(){},ps:()=>[],ui:{openTail(){},setTailTitle(){},closeTail(){}},tprint(){},clearLog(){},print(){},
  sleep(){throw new Error('unexpected loop');}};
 return {ns,files,reset,calls:()=>calls,setRam:r=>ram=r};
}
{
 const f=fixture();f.files.set('/matrix/state/coordinator.txt',JSON.stringify({schemaVersion:1,resetEpoch:'1:0:0',updated:Date.now(),reserveMoney:1e12}));
 const s=await step(f.ns);assert.equal(s.receipt.status,'spent');assert.equal(s.homeRam,64);assert.equal(f.calls(),1);
 assert.equal((await step(f.ns)).status,'complete');assert.equal(f.calls(),1);
}
{
 const f=fixture(1000);await step(f.ns);
 assert.equal(spendingAllowance(f.ns,'cloud'),0);assert.equal(spendingAllowance(f.ns,'programs','TOR'),0);
 assert.equal(spendingAllowance(f.ns,'homeRam','wrong-target'),0);assert.equal(spendingAllowance(f.ns,'homeRam','home'),1000);
 const p=JSON.parse(f.files.get('/matrix/state/early-progression.txt'));p.updated-=31000;
 f.files.set('/matrix/state/early-progression.txt',JSON.stringify(p));assert.ok(spendingAllowance(f.ns,'cloud')>0,'stale early policy must expire');
}
for(const cfg of [{masterEnabled:false},{automation:{singularity:false}},{earlyAutomation:{enabled:false}}]){
 const f=fixture();f.files.set('/matrix/config.json',JSON.stringify(cfg));
 f.ns.singularity.getUpgradeHomeRamCost=()=>{throw new Error('must not quote while paused');};
 assert.equal((await step(f.ns)).status,'paused');assert.equal(f.calls(),0);
}
{
 const f=fixture();f.reset.currentNode=1;assert.equal((await step(f.ns)).status,'locked');assert.equal(f.calls(),0);
 f.reset.ownedSF.set(4,3);assert.equal((await step(f.ns)).receipt.status,'spent');
}
{
 const f=fixture();f.ns.singularity.upgradeHomeRam=()=>false;
 const s=await step(f.ns);assert.equal(s.receipt.status,'failed');assert.equal(s.homeRam,32);
}
for(const reason of ['update','complete','program','duplicate','dead-worm']){
 const f=fixture(reason==='program'?300000:2e6),spawns=[];
 f.ns.spawn=(...args)=>spawns.push(args);
 if(reason==='update')f.files.set('/matrix/state/update-request.txt','requested');
 if(reason==='complete')f.setRam(64);
 if(reason==='program')f.ns.singularity.purchaseTor=()=>{f.ns.getServerMoneyAvailable=()=>100000;return true;};
 if(reason==='duplicate')f.ns.ps=()=>[{filename:'matrix/early-progression.js',pid:1}];
 if(reason==='dead-worm'){
  f.ns.getServerMoneyAvailable=()=>1000;
  f.files.set('/matrix/state/early.txt','{"worm":{"updated":1}}');
  f.ns.peek=()=>JSON.stringify({updated:Date.now()-91000});
 }
 await main(f.ns);
 assert.equal(spawns.length,reason==='duplicate'?0:1);
 if(spawns.length)assert.equal(spawns[0][0],['program','dead-worm'].includes(reason)?'/matrix/kernel.js':'/matrix/early.js');
}
console.log('Early autonomy passed: savings priority, reserve, bounded unlocks, purchase receipts, reset policy, pause/access gates and handoffs.');
