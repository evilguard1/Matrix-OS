const {chromium}=require(process.env.MATRIX_PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8092/')?r.continue():r.abort());
  await page.goto('http://127.0.0.1:8092/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{try{return globalThis.__ghostHarness?.ready();}catch{return false;}},{},{timeout:60000});
  const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
  const source=Object.fromEntries(manifest.files.map(f=>[f.path,fs.readFileSync(f.path,'utf8').replace(/\r\n/g,'\n')]));
  await page.evaluate(f=>globalThis.__ghostHarness.load(f),{...source,'matrix/manifest.json':JSON.stringify(manifest),'matrix/state/installed-stage.txt':'full',
   'matrix/config.json':JSON.stringify({masterEnabled:true,progression:{autoBackdoors:false,autoInstallAugmentations:false}})});
  await page.evaluate(()=>{globalThis.__ghostHarness.configure(64,1000,4,0);globalThis.__ghostHarness.factions(['CyberSec']);globalThis.__ghostHarness.prepareBackdoor();});
  const ram=await page.evaluate(()=>globalThis.__ghostHarness.ram());assert.equal(ram.filter(r=>r.error).length,0);
  const commandRam=ram.find(r=>r.file==='matrix/objective.js').ram,workerRam=ram.find(r=>r.file==='matrix/workers/singularity/work.js').ram;
  assert.ok(commandRam<4 && workerRam<24);
  await page.evaluate(()=>globalThis.__ghostHarness.run('run /matrix/objective.js faction CyberSec 100 native-goal'));
  await page.waitForFunction(()=>globalThis.__ghostHarness.read('matrix/state/objective-journal.txt'));
  await page.evaluate(()=>globalThis.__ghostHarness.run('run /matrix/kernel.js'));
  async function journal(){return JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/objective-journal.txt')));}
  await page.waitForFunction(()=>{try{return JSON.parse(globalThis.__ghostHarness.read('matrix/state/objective-journal.txt')).active?.status==='working';}catch{return false;}},{},{timeout:40000});
  const working=await journal();assert.ok(working.active.currentRep<100);
  const briefingRam=ram.find(r=>r.file==='matrix/briefing.js').ram;
  await page.waitForFunction(cost=>{const r=globalThis.__ghostHarness.report();return r.homeRam-r.usedRam>=cost;},briefingRam,{timeout:20000});
  await page.evaluate(()=>globalThis.__ghostHarness.run('run /matrix/briefing.js --json'));
  await page.waitForFunction(()=>globalThis.__ghostHarness.read('matrix/state/briefing.txt'));
  const briefing=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/briefing.txt')));
  assert.equal(briefing.objective?.id,'native-goal');assert.equal(briefing.objective.source,'operator');assert.equal(briefing.nodeProgress,null);
  const before=await page.evaluate(()=>globalThis.__ghostHarness.report());
  const dispatcher=before.running.find(p=>p.filename==='matrix/services/singularity.js');assert.ok(dispatcher);
  await page.evaluate(()=>globalThis.__ghostHarness.run('kill /matrix/services/singularity.js'));
  // The ordinary supervisor, not the fixture, relaunches the interrupted owner.
  await page.waitForFunction(pid=>globalThis.__ghostHarness.report().running.some(p=>p.filename==='matrix/services/singularity.js' && p.pid!==pid),dispatcher.pid,{timeout:25000});
  await page.waitForFunction(old=>{try{return JSON.parse(globalThis.__ghostHarness.read('matrix/state/objective-journal.txt')).revision>old;}catch{return false;}},working.revision,{timeout:30000});
  const resumed=await journal();assert.equal(resumed.active?.id,'native-goal');
  // Accelerate only the starting point near the target. The last increment and
  // the completion observation come from real faction work and the real worker.
  await page.evaluate(()=>globalThis.__ghostHarness.factionRep('CyberSec',99));
  await page.waitForFunction(()=>{try{return JSON.parse(globalThis.__ghostHarness.read('matrix/state/objective-journal.txt')).receipts.some(r=>r.id==='native-goal' && r.status==='succeeded');}catch{return false;}},{},{timeout:60000});
  const completed=await journal(),receipt=completed.receipts.find(r=>r.id==='native-goal');assert.ok(receipt.currentRep>=100);assert.equal(completed.active,null);
  await page.waitForFunction(cost=>{const r=globalThis.__ghostHarness.report();return r.homeRam-r.usedRam>=cost;},commandRam,{timeout:20000});
  await page.evaluate(()=>globalThis.__ghostHarness.run('run /matrix/objective.js faction CyberSec 100 native-goal'));
  await page.waitForTimeout(300);const replay=await journal();assert.equal(replay.receipts.length,1);assert.equal(replay.active,null);
  assert.equal(errors.length,0);
  fs.mkdirSync('docs/rp/evidence/objective',{recursive:true});
  fs.writeFileSync('docs/rp/evidence/objective/native.json',JSON.stringify({status:'passed',gameSha:'3162fd2590e221eadd0c0fbd46151913f7c4c41c',scope:'Official isolated 3.0.1. Synthetic BN4, 64GB, CyberSec membership, XP/root and reputation set to 99 after restart. Real faction work crosses 100, native observer confirms completion; ordinary supervisor restarts interrupted dispatcher. No Steam save, full-route timing or GPT connection.',commandRam,workerRam,working,briefing,resumed,completed,replay,errors,hashes:Object.fromEntries(Object.entries(source).map(([p,s])=>[p,crypto.createHash('sha256').update(s).digest('hex')]))},null,2));
  console.log(JSON.stringify({status:'passed',commandRam,workerRam,completedRep:receipt.currentRep,replayed:true,restarted:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
