const {chromium}=require(process.env.MATRIX_PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=process.cwd();
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8092/')?r.continue():r.abort());
  await page.goto('http://127.0.0.1:8092/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{try{return globalThis.__ghostHarness?.ready();}catch{return false;}},{},{timeout:60000});
  const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8')),files={};
  for(const x of manifest.files)files[x.path]=fs.readFileSync(x.path,'utf8');
  files['matrix/config.json']=JSON.stringify({masterEnabled:true,ui:{autoOpen:true},progression:{autoInstallAugmentations:false},economy:{cashReserve:0,reserveFraction:0}});
  files['matrix/state/installed-stage.txt']='full';
  const hashes={};for(const entry of manifest.files)hashes[entry.path]=crypto.createHash('sha256').update(files[entry.path].replace(/\r\n/g,'\n')).digest('hex');
  await page.evaluate(f=>globalThis.__ghostHarness.load(f),files);
  await page.evaluate(()=>{globalThis.__ghostHarness.configure(64,1000,4,0);globalThis.__ghostHarness.factions(['CyberSec']);});
  const costs=await page.evaluate(()=>globalThis.__ghostHarness.ram());assert.equal(costs.filter(x=>x.error).length,0);
  await page.evaluate(()=>globalThis.__ghostHarness.run('run /matrix/start.js'));
  const samples=[],cycles=new Set();let state,dispatch;
  for(let i=0;i<160;i++){
   const sample=await page.evaluate(()=>({report:globalThis.__ghostHarness.report(),state:globalThis.__ghostHarness.read('matrix/state/singularity.txt'),dispatch:globalThis.__ghostHarness.read('matrix/state/singularity-dispatch.txt'),supervisor:globalThis.__ghostHarness.read('matrix/state/supervisor.txt')}));
   samples.push(sample.report);state=sample.state?JSON.parse(sample.state):null;dispatch=sample.dispatch?JSON.parse(sample.dispatch):null;
   if(dispatch?.status==='online'&&state?.status==='online')cycles.add(dispatch.cycle);
   if(cycles.size>=2&&state.goal)break;
   if(i===159)throw new Error(JSON.stringify(sample));
   await page.waitForTimeout(250);
  }
  assert.equal(dispatch.status,'online');assert.equal(state.currentWork?.type,'FACTION');assert.equal(state.currentWork.factionName,'CyberSec');
  assert.ok(state.currentWork.cyclesWorked>20,'the second cycle must preserve already accumulated faction work');
  assert.equal(state.installedCount,0);assert.equal(state.hasRedPill,false);
  const peak=Math.max(...samples.map(s=>s.usedRam));assert.ok(peak<=64);assert.ok(samples.every(s=>s.homeRam===64));
  assert.ok(samples.some(s=>s.running.some(p=>p.filename==='matrix/services/hacking.js')));
  assert.ok(samples.some(s=>s.running.some(p=>p.filename==='matrix/dashboard.jsx')));
  const workers=costs.filter(x=>x.file.startsWith('matrix/workers/singularity/'));
  assert.ok(Math.max(...workers.map(x=>x.ram))<24);
  await page.evaluate(()=>{globalThis.__ghostHarness.factions(['Daedalus']);globalThis.__ghostHarness.factionRep('Daedalus',2500000);});
  await page.waitForFunction(()=>{
   try{return JSON.parse(globalThis.__ghostHarness.read('matrix/state/singularity.txt')).redPillQueued===true;}catch{return false;}
  },{},{timeout:25000});
  const redPillState=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/singularity.txt')));
  const ledger=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/budget-ledger.txt')));
  const redPillReceipts=ledger.receipts.filter(x=>x.owner==='augmentations'&&x.target==='The Red Pill');
  assert.equal(redPillReceipts.length,1);assert.equal(redPillReceipts[0].status,'spent');assert.equal(redPillReceipts[0].cost,0);assert.equal(redPillReceipts[0].debit,0);
  assert.equal(redPillState.hasRedPill,false);assert.equal(redPillState.queuedAugs,1);
  assert.equal(errors.length,0);
  const result={status:'passed',scope:'Official isolated Bitburner 3.0.1 engine. Synthetic BN4, CyberSec membership, 64GB and $1000. Real supervisor, hacking, Ghost and all nine Singularity tasks over two cycles. No Steam save or actual BN1-to-BN4 transition. RAM peak is sampled, not continuous.',gameSha:'3162fd2590e221eadd0c0fbd46151913f7c4c41c',peakObservedRam:peak,pollingMs:250,completedCycles:cycles.size,dispatcherRam:costs.find(x=>x.file==='matrix/services/singularity.js').ram,workers,state,dispatch,errors,hashes};
  result.redPill={scope:'Synthetic Daedalus membership and 2.5M reputation, native free purchase, augmentation installation disabled by fixture.',state:redPillState,receipt:redPillReceipts[0]};
  fs.mkdirSync('docs/rp/evidence/rp05',{recursive:true});fs.writeFileSync('docs/rp/evidence/rp05/native.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:result.status,peakRam:peak,dispatcherRam:result.dispatcherRam,workers,currentWork:state.currentWork}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
