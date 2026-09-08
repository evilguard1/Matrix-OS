import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createOperator} from '../operator.mjs';

let now=100000, calls=0, ram=2;
const epoch='4:1:2', secret=randomUUID();
const paths={report:'/matrix/state/briefing.txt',beat:'/cloud/heartbeat.txt',agent:'/cloud/agent-journal.txt',control:'/matrix/state/control-journal.txt',queue:'/cloud/commands.json'};
let files;
function reset(){
  now=100000;ram=2;calls=0;
  files={
    [paths.report]:{schemaVersion:1,resetEpoch:epoch,updated:now,expiresAt:now+15000,options:[{id:'pause',effect:'Drain'},{id:'arbitrary',command:'evil.js'}],nodeProgress:null},
    [paths.beat]:{schemaVersion:2,resetEpoch:epoch,updated:now,homeRam:32,usedRam:25,status:'online',receiptCount:0},
    [paths.agent]:{schemaVersion:2,resetEpoch:epoch,receipts:[],pending:null},
    [paths.control]:{schemaVersion:1,receipts:[],active:null},[paths.queue]:[]};
}
const make=()=>createOperator({secret,clock:()=>now,readJson:async p=>structuredClone(files[p]),readRam:async()=>ram,
  enqueue:async job=>{if(!files[paths.queue].some(j=>j.id===job.id)){calls++;files[paths.queue].push(job);}}});
reset();let api=make();
let briefing=await api.briefing();
assert.equal(briefing.options.length,1);assert.equal(briefing.rpReady,false);assert.equal(briefing.nodeProgress,null);
const ticket=briefing.options[0].ticket;
await assert.rejects(()=>api.submit({ticket,script:'evil.js'}),/ticket only/);
await assert.rejects(()=>api.submit({ticket:ticket+'x'}),/signature/);
const first=await api.submit({ticket});assert.equal(first.completed,false);assert.equal(first.status,'queued');
await Promise.all(Array.from({length:10},()=>api.submit({ticket})));
assert.equal(calls,1);
const job=files[paths.queue][0];assert.deepEqual(job.args,['pause',first.id]);assert.equal(job.script,'/matrix/control.js');
assert.equal(job.expiresAt,115000);
files[paths.agent].receipts.push({id:first.id,status:'started',result:123});
files[paths.queue]=[];
let receipt=await api.receipt(first.id,epoch);assert.equal(receipt.status,'awaiting-control-receipt');assert.equal(receipt.completed,false);
now+=16000;files[paths.beat].updated=now;api=make();
assert.equal((await api.submit({ticket})).replay,true);assert.equal(calls,1);
files[paths.control].active={id:first.id,action:'pause',requestedAt:100001,status:'accepted'};
assert.equal((await api.receipt(first.id,epoch)).status,'accepted');
files[paths.control].active=null;
files[paths.control].receipts.push({id:first.id,requestedAt:100001,status:'succeeded',scope:'managed-scripts-and-owned-faction-work'});
receipt=await api.receipt(first.id,epoch);assert.equal(receipt.completed,true);assert.equal(receipt.scope,'managed-scripts-and-owned-faction-work');
files[paths.beat].resetEpoch='4:1:116000';
await assert.rejects(()=>api.submit({ticket}),/previous reset/);
await assert.rejects(()=>api.receipt(first.id,epoch),/previous reset/);

for(const mutate of [
 ()=>{now+=15000;files[paths.beat].updated=now;},
 ()=>{files[paths.report].options=[];},
 ()=>{files[paths.beat].usedRam=32;},
 ()=>{ram=0;},
 ()=>{files[paths.beat].updated=now-10001;},
 ()=>{files[paths.report].expiresAt=now+60000;},
 ()=>{files[paths.report].resetEpoch='old';},
 ()=>{files[paths.agent].resetEpoch='old';},
 ()=>{files[paths.control]={};},
 ()=>{files[paths.beat].status='degraded';},
 ()=>{files[paths.beat].receiptCount=4096;},
]){
 reset();api=make();const t=(await api.briefing()).options[0].ticket;mutate();
 await assert.rejects(()=>api.submit({ticket:t}));assert.equal(calls,0);
}
reset();api=make();const t=(await api.briefing()).options[0].ticket;
const operation=await api.submit({ticket:t});
now+=15000;files[paths.beat].updated=now;
assert.equal((await api.submit({ticket:t})).status,'expired-before-dispatch');assert.equal(calls,1);
files[paths.agent].receipts.push({id:operation.id,status:'unknown-after-interruption'});
assert.equal((await api.submit({ticket:t})).status,'unknown-after-interruption');assert.equal(calls,1);
reset();api=make();files[paths.report].options=[{id:'resume',effect:'Resume'}];
const resumed=await api.submit({ticket:(await api.briefing()).options[0].ticket});
files[paths.control].receipts.push({id:resumed.id,requestedAt:now,status:'succeeded',scope:'stage-started'});
assert.equal((await api.receipt(resumed.id,epoch)).scope,'stage-started');
console.log('PASS: operator tickets, whitelist, tampering, duplicate/restart replay, reset, TTL, RAM, stale/corrupt evidence, dispatch ambiguity, scoped completion');
