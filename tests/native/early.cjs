const {chromium}=require(process.env.MATRIX_PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha='c'.repeat(40),manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const results=[];
  for(const initialRam of [16,32]) {
   const page=await browser.newPage(),errors=[],downloads=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>{
    const url=r.request().url(),prefix=`https://raw.githubusercontent.com/evilguard1/Matrix-OS/${sha}/`;
    if(url.startsWith('http://127.0.0.1:8092/'))return r.continue();
    if(url.startsWith(prefix)){
     const file=url.slice(prefix.length).split('?')[0];if(file.includes('..'))return r.abort();
     downloads.push(file);return r.fulfill({status:200,contentType:'text/plain',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(path.resolve(file),'utf8').replace(/\r\n/g,'\n')});
    }
    return r.abort();
   });
   await page.goto('http://127.0.0.1:8092/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>{try{return globalThis.__ghostHarness?.ready();}catch{return false;}},{},{timeout:60000});
   const files={};
   for(const f of manifest.files.filter(f=>['bootstrap','early'].includes(f.stage)))files[f.path]=fs.readFileSync(f.path,'utf8').replace(/\r\n/g,'\n');
   files['matrix/config.json']=JSON.stringify({masterEnabled:true,earlyAutomation:{buyPrograms:initialRam===32},progression:{autoInstallAugmentations:false},economy:{cashReserve:0,reserveFraction:0}});
   files['matrix/state/installed-stage.txt']='early';
   files['matrix/release.json']=JSON.stringify({schemaVersion:1,channel:'rp/ghost-node-war',installedSha:sha});
   assert.equal(files['matrix/start.js'],undefined,'full stage must not be preinstalled');
   await page.evaluate(f=>globalThis.__ghostHarness.load(f),files);
   await page.evaluate(r=>globalThis.__ghostHarness.configure(r,1000,4,0),initialRam);
   const ram=await page.evaluate(()=>globalThis.__ghostHarness.ram());
   assert.equal(ram.filter(x=>x.error).length,0);
   const controllerRam=ram.find(x=>x.file==='matrix/early-progression.js').ram;assert.ok(controllerRam<=16);
   await page.evaluate(()=>globalThis.__ghostHarness.run('run /matrix/kernel.js'));
   try {
    await page.waitForFunction(()=>{try{return JSON.parse(globalThis.__ghostHarness.read('matrix/state/early-progression.txt')).status==='active';}catch{return false;}},{},{timeout:35000});
    const start=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/early-progression.txt')));
    assert.ok(start.plan.saving);assert.equal(start.homeRam,initialRam);
    const seeded=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/early.txt')));
    assert.ok(seeded.worm || seeded.threads>0,'income must be deployed before controller handoff');
    if(initialRam===32){
     await page.evaluate(()=>globalThis.__ghostHarness.configure(32,200001,4,0));
     await page.waitForFunction(()=>{try{return JSON.parse(globalThis.__ghostHarness.read('matrix/state/early-progression.txt')).hasTor===true;}catch{return false;}},{},{timeout:25000});
     const program=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/early-progression.txt')));
     assert.equal(program.nextProgram,'BruteSSH.exe');assert.ok(program.programCost>0);
     await page.evaluate(c=>globalThis.__ghostHarness.configure(32,c,4,0),program.programCost+1);
     await page.waitForFunction(()=>{try{const s=JSON.parse(globalThis.__ghostHarness.read('matrix/state/early-progression.txt'));return s.hasTor && s.nextProgram==='FTPCrack.exe';}catch{return false;}},{},{timeout:25000});
    }
    const quotes=[];
    for(let expected=initialRam;expected<64;expected*=2){
     await page.waitForFunction(r=>{try{const s=JSON.parse(globalThis.__ghostHarness.read('matrix/state/early-progression.txt'));return s.homeRam===r && s.nextRam===r*2;}catch{return false;}},expected,{timeout:20000});
     const state=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/early-progression.txt')));
     quotes.push(state.homeCost);
     // Synthetic funding accelerates the test; the real native upgrade must debit it.
     await page.evaluate(({ram,cash})=>globalThis.__ghostHarness.configure(ram,cash,4,0),{ram:expected,cash:state.homeCost+1});
     await page.waitForFunction(r=>globalThis.__ghostHarness.report().homeRam===r,expected*2,{timeout:20000});
    }
    await page.waitForFunction(()=>{try{const r=globalThis.__ghostHarness.report();return r.running.some(p=>p.filename==='matrix/start.js') && r.running.some(p=>p.filename==='matrix/dashboard.jsx') && JSON.parse(globalThis.__ghostHarness.read('matrix/state/supervisor.txt')).status==='online';}catch{return false;}},{},{timeout:60000});
    const report=await page.evaluate(()=>globalThis.__ghostHarness.report());
    const profile=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/release.json')));
    const ledger=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/budget-ledger.txt')));
    const receipts=ledger.receipts.filter(x=>x.owner==='homeRam');
    const programReceipts=ledger.receipts.filter(x=>x.owner==='programs');
    if(initialRam===32){assert.deepEqual(programReceipts.map(x=>x.target),['TOR','BruteSSH.exe']);assert.ok(programReceipts.every(x=>x.status==='spent'));}
    assert.equal(receipts.length,quotes.length);assert.ok(receipts.every((x,i)=>x.status==='spent'&&x.cost===quotes[i]&&Math.abs(x.debit-x.cost)<0.001));
    assert.equal(profile.installedSha,sha);assert.ok(downloads.includes('matrix/start.js'));
    assert.ok(!report.running.some(p=>p.filename==='matrix/early-progression.js'));assert.equal(errors.length,0);
    results.push({initialRam,controllerRam,seededIncome:seeded.worm?'worm':'workers',quotes,receipts,programReceipts,profile,report,downloads,errors});
    console.log(JSON.stringify({initialRam,controllerRam,homeRam:report.homeRam,upgrades:receipts.length,fullStage:true}));
   }catch(e){console.error(await page.evaluate(()=>({report:globalThis.__ghostHarness.report(),early:globalThis.__ghostHarness.read('matrix/state/early-progression.txt'),stage:globalThis.__ghostHarness.read('matrix/state/early.txt'),supervisor:globalThis.__ghostHarness.read('matrix/state/supervisor.txt')})));throw e;}
   await page.close();
  }
  const hashes={};for(const f of manifest.files)hashes[f.path]=crypto.createHash('sha256').update(fs.readFileSync(f.path,'utf8').replace(/\r\n/g,'\n')).digest('hex');
  fs.mkdirSync('docs/rp/evidence/early',{recursive:true});
  fs.writeFileSync('docs/rp/evidence/early/native.json',JSON.stringify({status:'passed',gameSha:'3162fd2590e221eadd0c0fbd46151913f7c4c41c',scope:'Official isolated Bitburner 3.0.1 engine; synthetic BN4 RAM and funds. Programs disabled at 16GB; native TOR and BruteSSH purchases at 32GB. Real seeded income processes, native RAM purchases and automatic pinned stage install/start. No measured time to earn funds, no user Steam save.',results,hashes},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
