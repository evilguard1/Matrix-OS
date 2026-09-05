const { chromium } = require(process.env.MATRIX_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const root=process.cwd(), sha='b'.repeat(40);
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const results=[];
  for(const homeRam of [8,16,64,128,256]) {
   const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>{
    const url=r.request().url();
    if(url.startsWith('http://127.0.0.1:8092/'))return r.continue();
    const prefix=`https://raw.githubusercontent.com/evilguard1/Matrix-OS/${sha}/`;
    if(url.startsWith(prefix)){
     const file=url.slice(prefix.length).split('?')[0];
     if(file.includes('..'))return r.abort();
     return r.fulfill({status:200,contentType:'text/plain',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n')});
    }
    return r.abort();
   });
   await page.goto('http://127.0.0.1:8092/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>{try{return globalThis.__ghostHarness?.ready();}catch{return false;}},{},{timeout:60000});
   await page.evaluate(f=>globalThis.__ghostHarness.load(f),{'rp-install.js':fs.readFileSync(path.join(root,'install.js'),'utf8'),'matrix/config.json':'{"customNativeTest":true}'});
   await page.evaluate(r=>globalThis.__ghostHarness.configure(r,1000,4,0),homeRam);
   const ram=await page.evaluate(()=>globalThis.__ghostHarness.ram());
   const installRam=ram.find(x=>x.file==='rp-install.js'); assert.equal(installRam.error,null);assert.ok(installRam.ram<=8);
   await page.evaluate(s=>globalThis.__ghostHarness.run(`run /rp-install.js --no-start --release ${s}`),sha);
   await page.waitForFunction(()=>Boolean(globalThis.__ghostHarness.read('matrix/release.json')),{},{timeout:60000});
   const profile=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/release.json')));
   const journal=JSON.parse(await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/state/install-transaction.json')));
   const config=await page.evaluate(()=>globalThis.__ghostHarness.read('matrix/config.json'));
   const scripts=await page.evaluate(()=>globalThis.__ghostHarness.ram());
   assert.equal(profile.installedSha,sha);assert.equal(profile.channel,'rp/ghost-node-war');assert.equal(journal.phase,'installed');
   assert.equal(config,'{"customNativeTest":true}');assert.equal(scripts.filter(x=>x.error).length,0);assert.equal(errors.length,0);
   results.push({homeRam,installerRam:installRam.ram,installedScripts:scripts.length,profile,phase:journal.phase,errors});
   console.log(JSON.stringify(results.at(-1))); await page.close();
  }
  const report={status:'passed',scope:'Official 3.0.1 isolated BN4 engine. Synthetic RAM. Native wget/write/hash/promotion with intercepted immutable repository payload; no real GitHub availability test, no Steam save, no post-start health certification.',gameSha:'3162fd2590e221eadd0c0fbd46151913f7c4c41c',installerSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'install.js'),'utf8').replace(/\r\n/g,'\n')).digest('hex'),results};
  fs.mkdirSync(path.join(root,'docs/rp/evidence/rp02'),{recursive:true});fs.writeFileSync(path.join(root,'docs/rp/evidence/rp02/native.json'),JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
