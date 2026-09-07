const {chromium}=require(process.env.MATRIX_PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const results=[],manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
  const source=Object.fromEntries(manifest.files.map(f=>[f.path,fs.readFileSync(f.path,'utf8').replace(/\r\n/g,'\n')]));
  for(const [homeRam,node] of [[8,1],[32,4],[64,4]]) {
   if(process.env.CONTROL_RAM && Number(process.env.CONTROL_RAM)!==homeRam)continue;
   const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8092/')?r.continue():r.abort());
   await page.goto('http://127.0.0.1:8092/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>{try{return globalThis.__ghostHarness?.ready();}catch{return false;}},{},{timeout:60000});
   const stage=homeRam<16?'bootstrap':homeRam<64?'early':'full';
   const files={...source,'matrix/manifest.json':JSON.stringify(manifest),'matrix/state/installed-stage.txt':stage,
    'foreign-loop.js':'export async function main(ns){while(true)await ns.sleep(1000);}',
    'matrix/config.json':JSON.stringify({masterEnabled:true,progression:{autoBackdoors:false,autoInstallAugmentations:false},economy:{cashReserve:0,reserveFraction:0}})};
   await page.evaluate(f=>globalThis.__ghostHarness.load(f),files);
   await page.evaluate(({homeRam,node})=>{globalThis.__ghostHarness.configure(homeRam,1000,node,0);globalThis.__ghostHarness.prepareBackdoor();globalThis.__ghostHarness.factions(homeRam===64?['CyberSec']:[]);},{homeRam,node});
   const ram=await page.evaluate(()=>globalThis.__ghostHarness.ram());assert.equal(ram.filter(r=>r.error).length,0);
   const commandRam=ram.find(r=>r.file==='matrix/control.js').ram;assert.ok(commandRam+ram.find(r=>r.file==='matrix/bootstrap.js').ram<=8);
   if(homeRam===32)await page.evaluate(()=>globalThis.__ghostHarness.run('run /foreign-loop.js'));
   await page.evaluate(()=>globalThis.__ghostHarness.run('run /matrix/kernel.js'));
   const owner=homeRam===8?'matrix/bootstrap.js':homeRam===32?'matrix/early-progression.js':'matrix/start.js';
   await page.waitForFunction(name=>globalThis.__ghostHarness.report().running.some(r=>r.filename===name),owner,{timeout:40000});
   if(homeRam===64)try{await page.waitForFunction(()=>globalThis.__ghostHarness.playerWork()?.factionName==='CyberSec',{},{timeout:40000});}
   catch(e){console.error(JSON.stringify(await page.evaluate(()=>({report:globalThis.__ghostHarness.report(),work:globalThis.__ghostHarness.playerWork(),dispatch:globalThis.__ghostHarness.read('matrix/state/singularity-dispatch.txt'),state:globalThis.__ghostHarness.read('matrix/state/singularity.txt'),supervisor:globalThis.__ghostHarness.read('matrix/state/supervisor.txt')})),null,2));throw e;}
   if(homeRam===64)await page.evaluate(()=>globalThis.__ghostHarness.run('run /foreign-loop.js'));
   const before=await page.evaluate(()=>({processes:globalThis.__ghostHarness.networkProcesses(),work:globalThis.__ghostHarness.playerWork()}));
   const foreignPid=before.processes.find(p=>p.filename==='foreign-loop.js')?.pid;
   if(homeRam>8)assert.ok(foreignPid,'foreign process must really be alive before pause');
   const pauseAt=Date.now();
   await page.evaluate(()=>globalThis.__ghostHarness.run('run /matrix/control.js pause native-pause'));
   try {
    await page.waitForFunction(()=>{try{return JSON.parse(globalThis.__ghostHarness.read('matrix/state/control-journal.txt')).receipts.some(r=>r.id==='native-pause'&&r.status==='succeeded');}catch{return false;}},{},{timeout:90000});
    const paused=await page.evaluate(()=>({journal:JSON.parse(globalThis.__ghostHarness.read('matrix/state/control-journal.txt')),status:JSON.parse(globalThis.__ghostHarness.read('matrix/state/control-status.txt')),processes:globalThis.__ghostHarness.networkProcesses(),work:globalThis.__ghostHarness.playerWork()}));
    assert.equal(paused.status.status,'paused');assert.equal(paused.status.remaining.length,0);
    const allowed=['matrix/briefing.js','matrix/control-engine.js','matrix/control.js','matrix/services/telemetry.js','matrix/dashboard.jsx'];
    assert.ok(paused.processes.every(p=>!p.filename.startsWith('matrix/') || allowed.includes(p.filename)),JSON.stringify(paused.processes));
    if(foreignPid)assert.ok(paused.processes.some(p=>p.pid===foreignPid));
    if(homeRam===64) {
     assert.equal(paused.work,null);
     const previous=await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/briefing.txt'));
     await page.waitForFunction(old=>{try{const raw=globalThis.__ghostHarness.read('matrix/state/briefing.txt');return raw!==old && JSON.parse(raw).status==='paused';}catch{return false;}},previous,{timeout:10000});
    }
    // A completed id must not create another pause or duplicate receipt.
    await page.evaluate(()=>globalThis.__ghostHarness.run('run /matrix/control.js pause native-pause'));
    await page.waitForTimeout(300);
    await page.evaluate(()=>globalThis.__ghostHarness.run('run /matrix/control.js resume native-resume'));
    await page.waitForFunction(()=>{try{return JSON.parse(globalThis.__ghostHarness.read('matrix/state/control-journal.txt')).receipts.some(r=>r.id==='native-resume'&&r.status==='succeeded');}catch{return false;}},{},{timeout:35000});
    const resumed=await page.evaluate(()=>({journal:JSON.parse(globalThis.__ghostHarness.read('matrix/state/control-journal.txt')),processes:globalThis.__ghostHarness.networkProcesses()}));
    assert.equal(resumed.journal.desired,'running');assert.equal(resumed.journal.receipts.filter(r=>r.id==='native-pause').length,1);
    assert.equal(resumed.processes.filter(p=>homeRam===32?['matrix/early.js','matrix/early-progression.js'].includes(p.filename):p.filename===owner).length,1);
    assert.ok(!resumed.processes.some(p=>p.filename==='matrix/control-engine.js'));
    if(foreignPid)assert.ok(resumed.processes.some(p=>p.pid===foreignPid));
    assert.equal(errors.length,0);
    results.push({homeRam,node,commandRam,engineRam:ram.find(r=>r.file==='matrix/control-engine.js').ram,pauseDurationMs:Date.now()-pauseAt,before,paused,resumed,errors});
    console.log(JSON.stringify({homeRam,node,commandRam,paused:true,resumed:true,player:paused.status.player?.status}));
   }catch(e){console.error(JSON.stringify(await page.evaluate(()=>({report:globalThis.__ghostHarness.report(),journal:globalThis.__ghostHarness.read('matrix/state/control-journal.txt'),status:globalThis.__ghostHarness.read('matrix/state/control-status.txt')})),null,2));throw e;}
   await page.close();
  }
  fs.mkdirSync('docs/rp/evidence/control',{recursive:true});
  fs.writeFileSync('docs/rp/evidence/control/native.json',JSON.stringify({status:'passed',gameSha:'3162fd2590e221eadd0c0fbd46151913f7c4c41c',scope:'Official isolated 3.0.1, synthetic RAM/node/skills and CyberSec membership at 64GB. Real scripts, network drainage, owned faction-work stop, foreign process preservation, replay and stage resume. No Steam save; excludes persistent sleeve/gang/Bladeburner/corporation activities.',results,hashes:Object.fromEntries(Object.entries(source).map(([p,s])=>[p,crypto.createHash('sha256').update(s).digest('hex')]))},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
