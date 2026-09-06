import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {claimTerminal,releaseTerminal,terminalLease,attachTerminalChild,markTerminalReturned} from '../matrix/lib/terminal-lease.js';
import {routeStatus} from '../matrix/lib/backdoor-route.js';
async function load(file){
 const bundle=await build({entryPoints:[file],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'game-paths',setup(b){b.onResolve({filter:/^\/matrix\//},a=>({path:path.resolve(a.path.slice(1))}));}}]});
 const text=bundle.outputFiles[0].text;
 return import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
}
const {advanceBackdoors}=await load('matrix/workers/singularity/backdoors.js');
const childWorker=await load('matrix/workers/backdoor-install.js');
function fixture(){
 const files=new Map(),servers={CSEC:{hasAdminRights:true,requiredHackingSkill:50,backdoorInstalled:false}};
 const reset={currentNode:4,lastAugReset:2,lastNodeReset:1,ownedSF:new Map()};
 let current='home',effects=0,child=false,ticks=0,token='';
 const ns={pid:1,args:['test'],read:p=>files.get(p)??'',write:(p,v)=>{files.set(p,v);},getResetInfo:()=>reset,
  ps:()=>child?[{pid:2,filename:'matrix/workers/backdoor-install.js'}]:[],scan:h=>h==='home'?['CSEC']:['home'],getHackingLevel:()=>50,getServer:h=>servers[h],getHackTime:()=>4000,
  run(file,threads,target,t){assert.equal(current,'CSEC');child=true;token=t;return 2;},
  async sleep(){
   if(!ticks++){files.set('/matrix/state/backdoor-install.txt',JSON.stringify({token,pid:2,status:'installing'}));return;}
   await ns.singularity.installBackdoor();child=false;files.set('/matrix/state/backdoor-install.txt',JSON.stringify({token,pid:2,status:'succeeded'}));
  },
  hasRootAccess:h=>!!servers[h]?.hasAdminRights,singularity:{getCurrentServer:()=>current,connect:h=>{current=h;return true;},
   async installBackdoor(){effects++;assert.equal(current,'home','return home before native completion');servers.CSEC.backdoorInstalled=true;}}};
 return {ns,files,servers,reset,effects:()=>effects,setCurrent:h=>current=h,current:()=>current};
}
{
 const f=fixture(),lease=claimTerminal(f.ns,'CSEC',1000,100);
 assert.ok(lease);assert.equal(claimTerminal(f.ns,'I.I.I.I',1000,200),null);
 f.ns.ps=()=>[{pid:1,filename:'/matrix/workers/singularity/backdoors.js'}];assert.ok(terminalLease(f.ns,200000));
 f.ns.ps=()=>[];assert.equal(terminalLease(f.ns,200000),null);
 const replacement=claimTerminal(f.ns,'I.I.I.I',1000,200000);assert.equal(releaseTerminal(f.ns,lease),false);
 assert.equal(releaseTerminal(f.ns,replacement),true);
 f.files.set('/matrix/state/terminal-lease.txt','bad');assert.throws(()=>claimTerminal(f.ns,'CSEC',1000));
}
assert.equal(routeStatus({backdoorInstalled:true},0,0,1000),'installed');
assert.equal(routeStatus({hasAdminRights:false},50,200,1000),'needs-root');
assert.equal(routeStatus({hasAdminRights:true,requiredHackingSkill:51},50,200,1000),'needs-skill');
assert.equal(routeStatus({hasAdminRights:true,requiredHackingSkill:50},50,2000,1000),'waiting-faster-hacking');
{
 const f=fixture();assert.equal((await advanceBackdoors(f.ns)).status,'succeeded');assert.equal(f.effects(),1);
 assert.equal(f.current(),'home');await advanceBackdoors(f.ns);assert.equal(f.effects(),1,'postcondition prevents replay');
 assert.equal(terminalLease(f.ns),null);
}
for(const cfg of [{masterEnabled:false},{automation:{singularity:false}},{progression:{autoBackdoors:false}}]){
 const f=fixture();f.files.set('/matrix/config.json',JSON.stringify(cfg));assert.equal((await advanceBackdoors(f.ns)).status,'paused');assert.equal(f.effects(),0);
}
{
 const f=fixture();f.setCurrent('foodnstuff');assert.equal((await advanceBackdoors(f.ns)).status,'manual-connection');assert.equal(f.current(),'foodnstuff');assert.equal(f.effects(),0);
}
{
 const f=fixture();f.ns.singularity.installBackdoor=async()=>{};
 await assert.rejects(()=>advanceBackdoors(f.ns),/postcondition/);assert.equal(terminalLease(f.ns),null);
 assert.equal(JSON.parse(f.files.get('/matrix/state/backdoor-route.txt')).status,'failed');
}
{
 const f=fixture();f.ns.singularity.installBackdoor=async()=>{await Promise.resolve();f.setCurrent('foodnstuff');f.servers.CSEC.backdoorInstalled=true;};
 await advanceBackdoors(f.ns);assert.equal(f.current(),'foodnstuff','do not overwrite a later manual connection');
}
{
 const f=fixture();f.ns.singularity.connect=h=>h!=='CSEC';await assert.rejects(()=>advanceBackdoors(f.ns),/connect-refused/);assert.equal(f.effects(),0);assert.equal(terminalLease(f.ns),null);
}
{
 const f=fixture();f.ns.write=()=>{};await assert.rejects(()=>advanceBackdoors(f.ns),/lease-write/);assert.equal(f.effects(),0);
}
{
 const f=fixture();f.reset.currentNode=1;assert.equal((await advanceBackdoors(f.ns)).status,'paused');
}
console.log('Backdoors passed: eligibility, terminal lease contention/expiry, manual activity, verified postcondition, replay, pause, connection failure and failed durable intent.');
{
 const f=fixture(),lease=claimTerminal(f.ns,'CSEC',1000);
 attachTerminalChild(f.ns,lease,2);markTerminalReturned(f.ns,lease);
 f.ns.ps=()=>[{pid:2,filename:'matrix/workers/backdoor-install.js'}];
 assert.ok(terminalLease(f.ns,Date.now()+500000),'orphan native child retains lease after parent death and TTL');
 f.ns.pid=2;f.ns.args=['CSEC',lease.token,lease.resetEpoch];f.setCurrent('CSEC');
 f.ns.singularity.installBackdoor=async()=>{f.servers.CSEC.backdoorInstalled=true;};
 await childWorker.main(f.ns);
 assert.equal(f.current(),'CSEC','a manual reconnect to the target after home return must be preserved');
 assert.equal(JSON.parse(f.files.get('/matrix/state/backdoor-install.txt')).status,'succeeded');
}
{
 const f=fixture();f.ns.args=['w0r1d_d43m0n','fake','4:1:2'];
 await assert.rejects(()=>childWorker.main(f.ns),/unowned/);assert.equal(f.effects(),0);
}
{
 const f=fixture();f.ns.run=()=>0;await assert.rejects(()=>advanceBackdoors(f.ns),/launch-refused/);assert.equal(f.effects(),0);assert.equal(terminalLease(f.ns),null);
}
