const { chromium } = require(process.env.MATRIX_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const root = process.cwd();
const helper = `import { spendMoney } from '/matrix/lib/budget-ledger.js';
import { stateEnvelope } from '/matrix/lib/state.js';
export async function main(ns) {
 const coord = { ...stateEnvelope(ns.getResetInfo(), 1), status:'online', budgets:{milestoneReserve:1700000}, spendOwner:null };
 ns.write('/matrix/state/coordinator.txt',JSON.stringify(coord),'w');
 const quote=()=>ns.cloud.getServerCost(8);
 let executeCalls=0;
 const execute=()=>{executeCalls++; return ns.cloud.purchaseServer('rp-native',8);};
 const blocked=spendMoney(ns,{owner:'cloud',quote,execute});
 coord.budgets.milestoneReserve=0;
 ns.write('/matrix/state/coordinator.txt',JSON.stringify(coord),'w');
 const first=spendMoney(ns,{owner:'cloud',quote,execute,key:'native-one'});
 const replay=spendMoney(ns,{owner:'cloud',quote,execute,key:'native-one'});
 const data={blocked,first,replay,executeCalls,cash:ns.getServerMoneyAvailable('home'),servers:ns.cloud.getServerNames(),ledger:JSON.parse(ns.read('/matrix/state/budget-ledger.txt'))};
 ns.write('/matrix/state/native-rp01.txt',JSON.stringify(data),'w');
}`;
(async () => {
 const browser = await chromium.launch({ channel:'msedge', headless:true });
 try {
  const page = await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8092/')?r.continue():r.abort());
  await page.goto('http://127.0.0.1:8092/', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{try{return globalThis.__ghostHarness?.ready();}catch{return false;}}, {}, {timeout:60000});
  const files={}; const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  for(const entry of manifest.files) files[entry.path]=fs.readFileSync(path.join(root,entry.path),'utf8');
  files['matrix/config.json']=JSON.stringify({masterEnabled:true,economy:{cashReserve:0,reserveFraction:0,cloudBudgetFraction:1}});
  files['native-rp01.js']=helper;
  await page.evaluate(f=>globalThis.__ghostHarness.load(f),files);
  const costs=[];
  for(const [node,sf4] of [[1,0],[4,0],[1,1],[1,2],[1,3]]) {
   await page.evaluate(([n,s])=>globalThis.__ghostHarness.configure(64,2000000,n,s),[node,sf4]);
   const ram=await page.evaluate(()=>globalThis.__ghostHarness.ram());
   assert.equal(ram.filter(x=>x.error).length,0,JSON.stringify(ram.filter(x=>x.error)));
   costs.push({node,sf4,scripts:ram});
  }
  await page.evaluate(()=>globalThis.__ghostHarness.configure(64,2000000,1,0));
  await page.evaluate(()=>globalThis.__ghostHarness.run('run /native-rp01.js'));
  await page.waitForFunction(()=>Boolean(globalThis.__ghostHarness.read('matrix/state/native-rp01.txt')),{}, {timeout:10000});
  const result=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/native-rp01.txt')));
  assert.equal(result.blocked.reason,'budget'); assert.equal(result.first.status,'spent'); assert.equal(result.replay.replay,true);
  assert.equal(result.executeCalls,1);assert.equal(result.servers.length,1);assert.equal(result.cash,1560000);
  assert.equal(result.ledger.active,null);assert.equal(errors.length,0);
  const hashes={};for(const [name,content] of Object.entries(files))if(manifest.files.some(x=>x.path===name))hashes[name]=crypto.createHash('sha256').update(content.replace(/\r\n/g,'\n')).digest('hex');
  const report={status:'passed',scope:'Official 3.0.1 isolated engine, synthetic starting cash/node/SF contexts; native purchased server and cash debit. Not user Steam save or complete BN4 playthrough.',gameSha:'3162fd2590e221eadd0c0fbd46151913f7c4c41c',result,costs,hashes,errors};
  fs.mkdirSync(path.join(root,'docs/rp/evidence/rp01'),{recursive:true});
  fs.writeFileSync(path.join(root,'docs/rp/evidence/rp01/native.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,first:result.first,contexts:costs.map(x=>({node:x.node,sf4:x.sf4,early:x.scripts.find(s=>s.file==='matrix/early.js')?.ram,stock:x.scripts.find(s=>s.file==='matrix/services/stock.js')?.ram,singularity:x.scripts.find(s=>s.file==='matrix/services/singularity.js')?.ram}))}));
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
