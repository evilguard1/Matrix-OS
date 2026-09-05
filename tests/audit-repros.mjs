// Read-only, synthetic reproductions against a supplied Matrix-OS checkout.
// Usage: node audit-repros.mjs /absolute/path/to/Matrix-OS
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2] || 'work/Matrix-OS');
async function load(file) {
  const source = fs.readFileSync(path.join(root,file),'utf8').replace(/from\s*["'](\/matrix\/[^"']+)["']/g,
    (_,p)=>`from "${pathToFileURL(path.join(root,p.slice(1))).href}"`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const results=[];
const c=await load('matrix/services/coordinator.js');
const common=await load('matrix/lib/common.js');
const planner=await load('matrix/lib/hacking-planner.js');
const base={cash:1e9,homeRam:64,hasTor:true,hackingLevel:500,karma:-100,
  resetInfo:{currentNode:1,ownedSF:new Map([[2,1]])},factions:[]};
const objective=c.evaluateObjective(base);
results.push({id:'karma-scale',observed:objective.id,defectObserved:objective.id!=='GANG_KARMA',
  expected:'GANG_KARMA for SF2 outside BN2, karma -100 > -54000'});
const files=new Map();
const stop=Symbol('stop');
const ns={disableLog(){},read:p=>files.get(p)||'',write:async(p,s)=>files.set(p,s),
  getPlayer:()=>({factions:[],karma:0}),getResetInfo:()=>({currentNode:1,ownedSF:new Map()}),
  getServerMoneyAvailable:()=>60e9,getHackingLevel:()=>1600,getServerMaxRam:()=>64,
  hasTorRouter:()=>true,fileExists:()=>true,hasRootAccess:()=>false,
  getServerRequiredHackingLevel:()=>3000,sleep:async()=>{throw stop;}};
try {await c.main(ns);}catch(e){if(e!==stop)throw e;}
const state=JSON.parse(files.get('/matrix/state/coordinator.txt'));
results.push({id:'reserve-overwrite',objective:state.objective,budgets:state.budgets??null,
  reserve:common.reserveMoney(ns),defectObserved:!state.budgets,expected:'milestoneReserve=100000000000 retained'});
const fns={getServerMaxMoney:()=>1e9,getServerMinSecurityLevel:()=>1,getServerRequiredHackingLevel:()=>1,
  getServerGrowth:()=>50,getScriptRam:()=>1.75,weakenAnalyze:()=>0.05,
  hackAnalyzeSecurity:n=>n*0.002,growthAnalyzeSecurity:n=>n*0.004,
  formulas:{mockServer:()=>({}),hacking:{hackChance:()=>1,hackPercent:()=>0.6,
    hackTime:()=>1000,growTime:()=>3200,weakenTime:()=>4000,growThreads:()=>10}}};
const shape=planner.formulaBatchShape(fns,'test',{hacking:{minHackFraction:0.05,maxHackFraction:0.4}},
  {kind:'formulas',player:{}});
results.push({id:'hack-fraction-cap',configured:0.4,actual:shape?.f,
  defectObserved:shape?.f>0.4,expected:'reject target if one thread already exceeds configured maximum'});
const stock=await load('matrix/services/stock.js');
let sold=0;const stockFiles=new Map([
  ['/matrix/state/coordinator.txt',JSON.stringify({updated:Date.now(),liquidateStocks:true})]
]);
const sns={disableLog(){},read:p=>stockFiles.get(p)||'',write:async(p,s)=>stockFiles.set(p,s),
  getServerMoneyAvailable:()=>0,sleep:async()=>{throw stop;},
  stock:{getConstants:()=>({TixApiCost:1e9,WseAccountCost:1e9,MarketDataTixApi4SCost:1e9}),
    hasTixApiAccess:()=>true,hasWseAccount:()=>true,has4SDataTixApi:()=>false,
    getSymbols:()=>['AAA'],getPosition:()=>[10,100,0,0],sellStock:()=>{sold++;return 100;}}};
try{await stock.main(sns);}catch(e){if(e!==stop)throw e;}
results.push({id:'pre4s-liquidation',soldCalls:sold,published:JSON.parse(stockFiles.get('/matrix/state/stock.txt')),
  defectObserved:sold===0,expected:'liquidate existing position even without 4S'});
console.log(JSON.stringify({kind:'synthetic-read-only-reproductions',root,results},null,2));
