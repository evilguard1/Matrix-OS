const {chromium}=require(process.env.MATRIX_PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
  const source=Object.fromEntries(manifest.files.map(f=>[f.path,fs.readFileSync(f.path,'utf8').replace(/\r\n/g,'\n')]));
  const results=[];
  for(const homeRam of [32,64]) {
   const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8092/')?r.continue():r.abort());
   await page.goto('http://127.0.0.1:8092/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>{try{return globalThis.__ghostHarness?.ready();}catch{return false;}},{},{timeout:60000});
   await page.evaluate(f=>globalThis.__ghostHarness.load(f),{...source,'matrix/manifest.json':JSON.stringify(manifest),'matrix/state/installed-stage.txt':homeRam===32?'early':'full',
    'matrix/config.json':JSON.stringify({masterEnabled:true,progression:{autoBackdoors:false,autoInstallAugmentations:false}})});
   await page.evaluate(r=>{globalThis.__ghostHarness.configure(r,1000,4,0);globalThis.__ghostHarness.factions(r===64?['CyberSec']:[]);},homeRam);
   const costs=await page.evaluate(()=>globalThis.__ghostHarness.ram());assert.equal(costs.filter(r=>r.error).length,0);
   const cost=costs.find(r=>r.file==='matrix/briefing.js').ram;assert.ok(cost<=3.5);
   await page.evaluate(()=>globalThis.__ghostHarness.run('run /matrix/kernel.js'));
   await page.waitForFunction(r=>{try{const state=JSON.parse(globalThis.__ghostHarness.read(r===32?'matrix/state/early-progression.txt':'matrix/state/coordinator.txt'));return ['active','online'].includes(state.status);}catch{return false;}},homeRam,{timeout:40000});
   async function readBrief(json=true){
    await page.waitForFunction(c=>{const r=globalThis.__ghostHarness.report();return r.homeRam-r.usedRam>=c;},cost,{timeout:30000});
    const old=await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/briefing.txt'));
    await page.evaluate(json=>globalThis.__ghostHarness.run(`run /matrix/briefing.js${json?' --json':''}`),json);
    await page.waitForFunction(prior=>{const raw=globalThis.__ghostHarness.read('matrix/state/briefing.txt');return raw && raw!==prior;},old,{timeout:10000});
    return JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/briefing.txt')));
   }
   const active=await readBrief(false);assert.equal(active.status,'running');assert.equal(active.nodeProgress,null);assert.ok(active.objective);
   assert.equal(active.home.maxRam,homeRam);assert.ok(active.options.some(o=>o.id==='pause'));
   assert.equal(active.expiresAt-active.updated,15000);
   // Stop the owner without editing its recent objective file: it must not be
   // presented as an active goal merely because that file is still fresh.
   await page.evaluate(r=>globalThis.__ghostHarness.run(`kill /matrix/${r===32?'early-progression.js':'start.js'}`),homeRam);
   const stopped=await readBrief();assert.equal(stopped.objective,null);assert.equal(stopped.status,'offline-or-transitioning');
   assert.equal(stopped.options.length,0);assert.equal(errors.length,0);
   results.push({homeRam,ram:cost,active,stopped,errors});await page.close();
   console.log(JSON.stringify({homeRam,ram:cost,active:active.status,objective:active.objective.id,stopped:stopped.status}));
  }
  fs.mkdirSync('docs/rp/evidence/briefing',{recursive:true});
  fs.writeFileSync('docs/rp/evidence/briefing/native.json',JSON.stringify({status:'passed',gameSha:'3162fd2590e221eadd0c0fbd46151913f7c4c41c',
   scope:'Official isolated Bitburner 3.0.1, synthetic BN4 RAM/cash and CyberSec membership at 64GB. Real stage/goal writers, live observations, report file and dead-owner rejection. No Steam save, GPT connection or full-node score.',results,
   hashes:Object.fromEntries(Object.entries(source).map(([p,s])=>[p,crypto.createHash('sha256').update(s).digest('hex')]))},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
