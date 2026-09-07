import {randomUUID} from 'node:crypto';
const testToken=randomUUID();process.env.MATRIX_GATEWAY_TOKEN=testToken;
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeJob } from "../job-protocol.mjs";
import { setRemoteApi, startGateway } from "../gateway.mjs";
const source=fs.readFileSync(new URL("../servers/home/cloud/agent.js",import.meta.url),"utf8");
const {main}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const epoch="4:1:2", now=Date.now();
const job=(id,extra={})=>({schemaVersion:2,id,resetEpoch:epoch,expiresAt:Date.now()+59000,action:"run",script:"/test.js",server:"home",threads:1,args:[],...extra});
async function simulate(commands,journal=null,throws=false){
 const files=new Map([["/cloud/commands.json",JSON.stringify(commands)]]);if(journal)files.set("/cloud/agent-journal.txt",JSON.stringify(journal));
 let execs=0,ticks=0;
 const ns={pid:7,args:[],disableLog(){},tprint(){},getHostname:()=>"home",ps:()=>[],getResetInfo:()=>({currentNode:4,lastNodeReset:1,lastAugReset:2}),getServerMaxRam:()=>128,getServerUsedRam:()=>40,
 read:p=>files.get(p)||"",write:async(p,v)=>files.set(p,v),exec(){execs++;if(throws && execs===1)throw new Error("bad script");return 77;},async sleep(){if(++ticks===2)throw new Error("test-end");}};
 try{await main(ns)}catch(e){if(e.message!=="test-end")throw e}
 return {execs,journal:JSON.parse(files.get("/cloud/agent-journal.txt")),heartbeat:JSON.parse(files.get("/cloud/heartbeat.txt"))};
}
assert.equal((await simulate(Array.from({length:100},(_,i)=>({id:String(i),action:"run",script:"old.js"})))).execs,0);
assert.equal((await simulate([job("new"),job("new")])).execs,1);
assert.equal((await simulate([job("stale",{expiresAt:now-1}),job("reset",{resetEpoch:"old"})])).execs,0);
const fail=await simulate([job("bad"),job("next")],null,true);assert.equal(fail.execs,2);assert.deepEqual(fail.journal.receipts.map(r=>r.status),["failed","started"]);
const interrupted=await simulate([job("pending")],{schemaVersion:2,resetEpoch:epoch,receipts:[],pending:{id:"pending"}});assert.equal(interrupted.execs,0);assert.equal(interrupted.journal.receipts[0].status,"unknown-after-interruption");
const full=await simulate([job("overflow")],{schemaVersion:2,resetEpoch:epoch,receipts:Array.from({length:4096},(_,i)=>({id:"done"+i})),pending:null});assert.equal(full.execs,0);assert.equal(full.heartbeat.status,"degraded");
for(const bad of [{action:"killall"},{action:"run",script:"x.js",id:"injected"},{action:"run",script:"x.js",args:[{}]}])assert.throws(()=>normalizeJob(bad,{schemaVersion:2,resetEpoch:epoch,updated:Date.now()}));
const files={"/cloud/heartbeat.txt":JSON.stringify({schemaVersion:2,updated:Date.now(),resetEpoch:epoch}),"/cloud/commands.json":"[]"};
let ramCalls=0;
setRemoteApi({connection:{connected:true},getFileNames:async()=>({result:Object.keys(files)}),getFile:async({filename})=>({result:files[filename]}),pushFile:async({filename,content})=>{files[filename]=content;return {result:true}},calculateRAM:async()=>{ramCalls++;return {result:4.75}}});
const server=await startGateway({port:0});const base=`http://127.0.0.1:${server.address().port}`;
const token=testToken;
const headers={"X-Matrix-Token":token,"Content-Type":"application/json"};
try{
 assert.equal((await fetch(base+"/v1/status",{headers:{"X-Matrix-Token":"wrong"}})).status,401);
 const ram=await fetch(base+"/v1/ram?path=cloud/agent.js",{headers});assert.equal(ram.status,200);assert.equal((await ram.json()).ram,4.75);assert.equal(ramCalls,1);
 const body=JSON.stringify({action:"run",script:"/test.js",idempotencyKey:"test"});
 const a=await (await fetch(base+"/v1/jobs",{method:"POST",headers,body})).json();
 const b=await (await fetch(base+"/v1/jobs",{method:"POST",headers,body})).json();assert.equal(a.id,b.id);assert.equal(JSON.parse(files["/cloud/commands.json"]).length,1);
 assert.equal((await fetch(base+"/v1/jobs",{method:"POST",headers,body:JSON.stringify({action:"kill",script:"/test.js",idempotencyKey:"test"})})).status,400);
 files["/matrix/state/briefing.txt"]=JSON.stringify({expiresAt:Date.now()-1});assert.equal((await fetch(base+"/v1/briefing",{headers})).status,409);
 console.log("PASS: native RAM dispatch, auth, idempotency conflict, stale briefing, legacy replay, duplicate, expiry, reset, exception recovery, crash ambiguity, capacity");
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
