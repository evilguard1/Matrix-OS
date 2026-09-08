import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createOperator} from '../operator.mjs';
let now=100000, files, jobs;
const epoch='4:1:2',secret=randomUUID();
const journalPath='/matrix/state/objective-journal.txt';
function reset(){
  jobs=[];now=100000;
  files={
    '/matrix/state/briefing.txt':{schemaVersion:1,resetEpoch:epoch,updated:now,expiresAt:now+15000,status:'running',home:{maxRam:64},stage:{observed:'full'},capabilities:[{id:'progression',state:'observed'}],options:[{id:'pause'}]},
    '/cloud/heartbeat.txt':{schemaVersion:2,resetEpoch:epoch,updated:now,status:'online',receiptCount:0,homeRam:64,usedRam:40,processes:[{filename:'matrix/services/singularity.js'}]},
    '/cloud/agent-journal.txt':{schemaVersion:2,resetEpoch:epoch,receipts:[]},
    [journalPath]:{schemaVersion:1,revision:0,active:null,receipts:[]},
    '/matrix/state/singularity.txt':{schemaVersion:1,resetEpoch:epoch,updated:now,status:'online',goal:{faction:'CyberSec',rep:99,need:100}},
    '/matrix/state/overview.txt':{updated:now,reset:{currentNode:4,lastNodeReset:1,lastAugReset:2},player:{factions:['CyberSec']}},
    '/cloud/commands.json':[],
  };
}
const api=createOperator({secret,clock:()=>now,readRam:async()=>3,readJson:async(p,fallback)=>structuredClone(files[p]??fallback),enqueue:async job=>{jobs.push(job);files['/cloud/commands.json'].push(job);}});
reset();let report=await api.briefing();const option=report.options.find(o=>o.action==='faction-reputation');assert.ok(option);
const operation=await api.submit({ticket:option.ticket});assert.match(operation.id,/^rp-goal:/);
assert.deepEqual(jobs[0].args,['faction','CyberSec',100,operation.id]);assert.equal(jobs[0].script,'/matrix/objective.js');
const receipt={id:operation.id,action:'faction',faction:'CyberSec',targetRep:100,resetEpoch:epoch,requestedAt:now,status:'working',updated:now,currentRep:99};
files[journalPath]={schemaVersion:1,revision:1,active:{...receipt},receipts:[receipt]};
assert.equal((await api.receipt(operation.id,epoch)).completed,false);
report=await api.briefing();assert.equal(report.options.some(o=>o.action==='faction-reputation'),false);
const auto=report.options.find(o=>o.action==='automatic-policy');assert.ok(auto);
const restore=await api.submit({ticket:auto.ticket});assert.deepEqual(jobs[1].args,['auto',restore.id]);
files[journalPath].active=null;Object.assign(receipt,{status:'succeeded',scope:'faction-reputation-threshold',currentRep:99});
await assert.rejects(()=>api.receipt(operation.id,epoch),/postcondition/);
receipt.currentRep=100;
assert.equal((await api.receipt(operation.id,epoch)).completed,true);
now+=16000;files['/cloud/heartbeat.txt'].updated=now;assert.equal((await api.submit({ticket:option.ticket})).replay,true);assert.equal(jobs.length,2);
for(const mutate of [
 ()=>files['/matrix/state/overview.txt'].player.factions=[],
 ()=>files['/matrix/state/overview.txt'].updated=1,
 ()=>files['/matrix/state/singularity.txt'].goal.need=1e13,
 ()=>files['/matrix/state/singularity.txt'].resetEpoch='4:0:1',
 ()=>files['/matrix/state/singularity.txt'].goal.rep=100,
 ()=>files['/cloud/heartbeat.txt'].processes=[],
 ()=>files['/matrix/state/briefing.txt'].home.maxRam=32,
 ()=>files[journalPath]={schemaVersion:1,receipts:[]},
]){
 reset();const old=(await api.briefing()).options.find(o=>o.action==='faction-reputation');mutate();
 assert.equal((await api.briefing()).options.some(o=>o.action==='faction-reputation'),false);
 await assert.rejects(()=>api.submit({ticket:old.ticket}));assert.equal(jobs.length,0);
}
reset();const old=(await api.briefing()).options.find(o=>o.action==='faction-reputation');files['/matrix/state/singularity.txt'].goal.need=200;
await assert.rejects(()=>api.submit({ticket:old.ticket}),/no longer available/);
assert.equal(jobs.length,0);
console.log('PASS: observed faction objective, native postcondition gate, auto-policy dispatch, replay, stale membership, changed target, low RAM tier, corrupt journal');
