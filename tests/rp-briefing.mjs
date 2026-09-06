import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['matrix/briefing.js'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'game',setup(b){b.onResolve({filter:/^\/matrix\//},a=>({path:path.resolve(a.path.slice(1))}));}}]});
const {collectBriefing,main}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
function fixture(){
 const now=Date.now(),files=new Map(),prints=[],running=[{pid:2,filename:'matrix/early-progression.js'}];
 const put=(name,value)=>files.set('/matrix/'+name,JSON.stringify(value));
 put('manifest.json',{files:[{path:'matrix/early-progression.js'}]});
 put('state/early-progression.txt',{schemaVersion:1,resetEpoch:'4:1:2',updated:now,status:'active',homeRam:32,homeCost:1000,reserve:100});
 const ns={pid:1,args:[],getHostname:()=> 'home',getResetInfo:()=>({currentNode:4,lastNodeReset:1,lastAugReset:2,ownedSF:new Map()}),
  scan:()=>[],ps:()=>running,fileExists:()=>true,getScriptRam:p=>p.endsWith('briefing.js')?3.35:2,
  getServerMaxRam:()=>32,getServerUsedRam:()=>20,getServerMoneyAvailable:()=>500,
  read:p=>files.get(p)??'',write:(p,v)=>files.set(p,v),tprint:t=>prints.push(t)};
 return {now,ns,files,put,running,prints};
}
{
 const f=fixture(),r=collectBriefing(f.ns,f.now);
 assert.equal(r.nodeProgress,null);assert.equal(r.objective.metric.percent,40);assert.equal(r.objective.metric.scope,'local-milestone');
 assert.equal(r.status,'running');assert.deepEqual(r.options.map(o=>o.id),['pause']);
 await main(f.ns);assert.ok(f.files.has('/matrix/state/briefing.txt'));assert.match(f.prints[0],/pas progression du node/);
}
for(const change of [
 f=>{const s=JSON.parse(f.files.get('/matrix/state/early-progression.txt'));s.updated-=31000;f.put('state/early-progression.txt',s);},
 f=>f.put('state/early-progression.txt',{updated:f.now+1,status:'active'}),
 f=>f.ns.getResetInfo=()=>({currentNode:4,lastNodeReset:1,lastAugReset:f.now,ownedSF:new Map()}),
 f=>f.running.length=0,
 f=>f.ns.getServerMaxRam=()=>64,
 f=>f.put('config.json',{masterEnabled:false})]){
 const f=fixture();change(f);const r=collectBriefing(f.ns,f.now);assert.equal(r.objective,null);assert.equal(r.nodeProgress,null);
}
{
 const f=fixture();f.files.set('/matrix/state/control-journal.txt','{broken');const r=collectBriefing(f.ns,f.now);
 assert.equal(r.status,'blocked');assert.deepEqual(r.options,[]);assert.equal(r.objective,null);
}
{
 const f=fixture();f.files.set('/matrix/config.json','{broken');const r=collectBriefing(f.ns,f.now);
 assert.equal(r.status,'blocked');assert.equal(r.objective,null);
}
{
 const f=fixture();f.ns.getServerMaxRam=()=>64;f.running.splice(0,1,{pid:2,filename:'matrix/start.js'},{pid:3,filename:'matrix/services/coordinator.js'});
 f.put('state/coordinator.txt',{schemaVersion:1,resetEpoch:'4:1:2',status:'online',updated:f.now,objective:'THE_RED_PILL',title:'Free Red Pill',milestone:{name:'Purchase',current:500,required:0,pct:100}});
 const r=collectBriefing(f.ns,f.now);assert.equal(r.objective.metric,null,'zero cost is not node completion');
 f.running.pop();assert.equal(collectBriefing(f.ns,f.now).objective,null,'recent file with dead producer is not a current goal');
}
{
 const f=fixture();f.ns.getResetInfo=()=>({currentNode:1,lastNodeReset:1,lastAugReset:2,ownedSF:new Map()});
 const r=collectBriefing(f.ns,f.now);assert.equal(r.capabilities.find(c=>c.id==='progression').state,'locked');
 f.ns.fileExists=()=>false;assert.deepEqual(collectBriefing(f.ns,f.now).options,[]);
}
{
 const f=fixture();f.running.splice(0,1,{pid:4,filename:'matrix/control-engine.js'});
 f.put('state/control-journal.txt',{schemaVersion:1,revision:2,desired:'paused',active:null,receipts:[{id:'p',action:'pause',status:'succeeded'}]});
 f.put('state/control-status.txt',{updated:f.now,status:'paused',player:{id:'p',status:'idle'}});
 assert.equal(collectBriefing(f.ns,f.now).control.pauseConfirmed,true);
 f.running.push({pid:5,filename:'matrix/early-progression.js'});
 assert.equal(collectBriefing(f.ns,f.now).control.pauseConfirmed,false);
 f.running.pop();f.files.delete('/matrix/manifest.json');assert.equal(collectBriefing(f.ns,f.now).control.pauseConfirmed,false);
}
{
 const f=fixture();f.ns.write=()=>{};await main(f.ns);assert.match(f.prints[0],/UNAVAILABLE/);
 f.ns.args=['--unknown'];f.prints.length=0;await main(f.ns);assert.match(f.prints[0],/Usage/);
}
{
 const f=fixture();f.ns.getServerMoneyAvailable=()=>NaN;
 assert.throws(()=>collectBriefing(f.ns,f.now),/invalid-live-observation/);
 await main(f.ns);assert.match(f.prints[0],/UNAVAILABLE/);
 const r=JSON.parse(f.files.get('/matrix/state/briefing.txt'));assert.equal(r.status,'unavailable');assert.equal(r.expiresAt,r.updated);assert.deepEqual(r.options,[]);
}
console.log('Briefing passed: live stage ownership, scoped local metrics, stale/reset/corrupt evidence, locked APIs, dead producers, pause proof and verified output.');
