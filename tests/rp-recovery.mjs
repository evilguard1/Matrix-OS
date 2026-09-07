import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {moduleDirectives} from '../matrix/lib/voice.js';
const source=fs.readFileSync('matrix/services/hacking.js','utf8')+'\nexport {batchShape, capturePlanningSnapshot, rankTargets};';
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'recovery-test.js'},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'game',setup(b){b.onResolve({filter:/^\/matrix\//},a=>({path:path.resolve(a.path.slice(1))}));}}]});
const {batchShape,capturePlanningSnapshot,rankTargets}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const ns={getServerMaxMoney:()=>6500000,hackAnalyzeChance:()=>1,getScriptRam:p=>p.endsWith('/hack.js')?1.7:1.75,
 getHackTime:()=>8000,getGrowTime:()=>25600,getWeakenTime:()=>32000,weakenAnalyze:()=>0.05,
 hackAnalyzeThreads:(_h,m)=>m/6500000/0.001,hackAnalyze:()=>0.001,growthAnalyze:(_h,f)=>Math.log(f)*2500,
 hackAnalyzeSecurity:t=>t*0.002,growthAnalyzeSecurity:t=>t*0.004,getServerMoneyAvailable:h=>h==='home'?1262:6500000,
 getServerMinSecurityLevel:()=>1,getServerSecurityLevel:()=>1,getHackingLevel:()=>184,hasRootAccess:()=>true};
const cfg={hacking:{minHackFraction:0.05,maxHackFraction:0.4}};
assert.ok(batchShape(ns,'sigma',cfg).ram>128,'reproduces the unaffordable lot');
const pool=[{host:'home',free:30},{host:'a',free:16},{host:'b',free:16}];
const shape=batchShape(ns,'sigma',cfg,pool);
assert.ok(shape && shape.ram<=62 && shape.f<0.05);
assert.ok(shape.wt1>=1 && shape.wt2>=1 && shape.gt>=1 && shape.ht>=1);
assert.equal(batchShape(ns,'sigma',cfg,[{host:'tiny',free:1}]),null);
const snapshot=capturePlanningSnapshot(ns,'sigma',cfg,120,100,{kind:'native'},null,null,pool);
assert.ok(snapshot.shape.ram<=62,'capture uses the available pool');
ns.getServerRequiredHackingLevel=()=>1;ns.getServerMoneyAvailable=h=>h==='home'?1262:1;
assert.deepEqual(rankTargets(ns,['n00dles','sigma'],cfg),['n00dles']);
ns.getServerMoneyAvailable=h=>h==='home'?1262:6500000;ns.getServerRequiredHackingLevel=()=>1;
assert.equal(rankTargets(ns,['n00dles','sigma'],cfg).length,2,'ready larger targets escape cold-start focus');
assert.ok(!moduleDirectives(new Map(),{currentNode:4}).some(d=>d.id?.includes('singularity')));
console.log('RP recovery: constrained native HWGW, complete repairs, capture and cold-start routing passed.');

{
 const bundle=await build({entryPoints:['matrix/kernel.js'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'game',setup(b){b.onResolve({filter:/^\/matrix\//},a=>({path:path.resolve(a.path.slice(1))}));}}]});
 const {startExistingBridge}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 let ram=16,used=6,present=true,processes=[],runs=0;
 const ns={getServerMaxRam:()=>ram,getServerUsedRam:()=>used,fileExists:()=>present,ps:()=>processes,
 getScriptRam:p=>p==='/cloud/agent.js'?5.75:p==='/matrix/kernel.js'?6.05:14.15,run:()=>++runs};
 startExistingBridge(ns,'/matrix/early.js');assert.equal(runs,0);
 ram=32;startExistingBridge(ns,'/matrix/early.js');assert.equal(runs,1);
 processes=[{filename:'cloud/agent.js'}];startExistingBridge(ns,'/matrix/early.js');assert.equal(runs,1);
 processes=[];used=28;startExistingBridge(ns,'/matrix/early.js');assert.equal(runs,1);
 used=6;present=false;startExistingBridge(ns,'/matrix/early.js');assert.equal(runs,1);
 console.log('Bridge boot: 16GB deferral, 32GB startup, singleton, RAM reserve and optional file passed.');
}
