const {chromium}=require(process.env.MATRIX_PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8092/')?r.continue():r.abort());
  await page.goto('http://127.0.0.1:8092/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{try{return globalThis.__ghostHarness?.ready();}catch{return false;}},{},{timeout:60000});
  const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8')),files={};
  for(const f of manifest.files)files[f.path]=fs.readFileSync(f.path,'utf8').replace(/\r\n/g,'\n');
  const hashes=Object.fromEntries(Object.entries(files).map(([p,s])=>[p,crypto.createHash('sha256').update(s).digest('hex')]));
  files['matrix/config.json']=JSON.stringify({masterEnabled:true,progression:{autoInstallAugmentations:false},economy:{cashReserve:0,reserveFraction:0}});
  files['matrix/state/installed-stage.txt']='full';
  await page.evaluate(f=>globalThis.__ghostHarness.load(f),files);
  const preparation=await page.evaluate(()=>{globalThis.__ghostHarness.configure(64,1000,4,0);globalThis.__ghostHarness.factions([]);return globalThis.__ghostHarness.prepareBackdoor();});
  const costs=await page.evaluate(()=>globalThis.__ghostHarness.ram());assert.equal(costs.filter(x=>x.error).length,0);
  const workerRam=costs.find(x=>x.file==='matrix/workers/singularity/backdoors.js').ram;
  assert.ok(workerRam+costs.find(x=>x.file==='matrix/workers/backdoor-install.js').ram<24);
  // Interrupt a real native promise, with the terminal already returned home.
  await page.evaluate(()=>globalThis.__ghostHarness.run('run /matrix/workers/singularity/backdoors.js interrupted'));
  await page.waitForFunction(()=>{try{return JSON.parse(globalThis.__ghostHarness.read('matrix/state/backdoor-install.txt')).status==='installing' && globalThis.__ghostHarness.backdoorState().currentServer==='home';}catch{return false;}},{},{timeout:20000});
  const pending=await page.evaluate(()=>({state:globalThis.__ghostHarness.backdoorState(),report:globalThis.__ghostHarness.report()}));
  assert.equal(pending.state.currentServer,'home');assert.equal(pending.state.installed,false);
  const pid=pending.report.running.find(p=>p.filename==='matrix/workers/backdoor-install.js').pid;
  await page.evaluate(p=>globalThis.__ghostHarness.run(`kill ${p}`),pid);
  await page.waitForFunction(()=>!globalThis.__ghostHarness.report().running.some(s=>['matrix/workers/singularity/backdoors.js','matrix/workers/backdoor-install.js'].includes(s.filename)),{},{timeout:5000});
  assert.equal((await page.evaluate(()=>globalThis.__ghostHarness.backdoorState())).installed,false);
  await page.evaluate(()=>globalThis.__ghostHarness.run('run /matrix/start.js'));
  try{
   await page.waitForFunction(()=>{try{const s=JSON.parse(globalThis.__ghostHarness.read('matrix/state/singularity.txt'));return globalThis.__ghostHarness.backdoorState().factions.includes('CyberSec') && s.currentWork?.factionName==='CyberSec';}catch{return false;}},{},{timeout:90000});
   const state=await page.evaluate(()=>globalThis.__ghostHarness.backdoorState());
   const route=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/backdoor-route.txt')));
   const singularity=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/singularity.txt')));
   const report=await page.evaluate(()=>globalThis.__ghostHarness.report());
   assert.equal(state.installed,true);assert.equal(state.currentServer,'home');assert.ok(state.factions.includes('CyberSec'));
   assert.ok(['succeeded','blocked'].includes(route.status));assert.equal(route.routes.find(r=>r.target==='CSEC').status,'installed');
   assert.ok(report.running.some(p=>p.filename==='matrix/dashboard.jsx'));assert.ok(report.usedRam<=64);assert.equal(errors.length,0);
   const result={status:'passed',gameSha:'3162fd2590e221eadd0c0fbd46151913f7c4c41c',scope:'Isolated official 3.0.1. Synthetic BN4/64GB/$1000, hacking XP and CSEC root/security. Real native backdoor interrupted then restarted; CyberSec invitation/join and faction work are not injected. No player Steam save or complete node route.',preparation,workerRam,childRam:costs.find(x=>x.file==='matrix/workers/backdoor-install.js').ram,interruptedPid:pid,pending:pending.state,state,route,singularity,report,errors,hashes};
   fs.mkdirSync('docs/rp/evidence/backdoors',{recursive:true});fs.writeFileSync('docs/rp/evidence/backdoors/native.json',JSON.stringify(result,null,2));
   console.log(JSON.stringify({status:result.status,workerRam,state,work:singularity.currentWork,usedRam:report.usedRam}));
  }catch(e){console.error(await page.evaluate(()=>({report:globalThis.__ghostHarness.report(),route:globalThis.__ghostHarness.read('matrix/state/backdoor-route.txt'),dispatch:globalThis.__ghostHarness.read('matrix/state/singularity-dispatch.txt')})));throw e;}
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
