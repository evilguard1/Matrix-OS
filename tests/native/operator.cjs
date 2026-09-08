const {chromium}=require(process.env.MATRIX_PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 process.env.MATRIX_GATEWAY_TOKEN=crypto.randomUUID();
 const {setRemoteApi,startGateway}=await import('../../tools/bridge-recovery/gateway.mjs');
 const browser=await chromium.launch({channel:'msedge',headless:true});let server,page;
 try{
  page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8092/')?r.continue():r.abort());
  await page.goto('http://127.0.0.1:8092/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{try{return globalThis.__ghostHarness?.ready();}catch{return false;}},{},{timeout:60000});
  const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
  const source=Object.fromEntries(manifest.files.map(f=>[f.path,fs.readFileSync(f.path,'utf8').replace(/\r\n/g,'\n')]));
  source['cloud/agent.js']=fs.readFileSync('tools/bridge-recovery/servers/home/cloud/agent.js','utf8');
  await page.evaluate(f=>globalThis.__ghostHarness.load(f),{...source,'matrix/manifest.json':JSON.stringify(manifest),'matrix/state/installed-stage.txt':'full',
   'matrix/config.json':JSON.stringify({masterEnabled:true,progression:{autoBackdoors:false,autoInstallAugmentations:false}})});
  await page.evaluate(()=>{globalThis.__ghostHarness.configure(64,1000,4,0);globalThis.__ghostHarness.factions(['CyberSec']);globalThis.__ghostHarness.prepareBackdoor();globalThis.__ghostHarness.run('run /matrix/kernel.js');});
  const states=['cloud/heartbeat.txt','cloud/agent-journal.txt','cloud/commands.json','matrix/state/briefing.txt','matrix/state/control-journal.txt','matrix/state/objective-journal.txt','matrix/state/singularity.txt','matrix/state/overview.txt'];
  const nativeRead=filename=>page.evaluate(p=>globalThis.__ghostHarness.read(p.replace(/^\/+/,'')),filename);
  setRemoteApi({connection:{connected:true},
   getFile:async({filename})=>({result:await nativeRead(filename)}),
   getFileNames:async()=>({result:await page.evaluate(paths=>paths.filter(p=>globalThis.__ghostHarness.read(p)),states)}),
   // The fixture's load writes native game files and reassigns the unchanged 64GB.
   pushFile:async({filename,content})=>{await page.evaluate(({filename,content})=>globalThis.__ghostHarness.load({[filename.replace(/^\/+/, '')]:content}),{filename,content});return {result:true};},
   calculateRAM:async({filename})=>({result:await page.evaluate(p=>globalThis.__ghostHarness.ram().find(r=>r.file===p.replace(/^\/+/, ''))?.ram??0,filename)})});
  server=await startGateway({port:0});const base=`http://127.0.0.1:${server.address().port}`;
  async function call(path,body){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'X-Matrix-Token':process.env.MATRIX_GATEWAY_TOKEN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();if(!response.ok)throw new Error(`${response.status}: ${JSON.stringify(value)}`);return value;}
  async function until(fn,ms=45000){const deadline=Date.now()+ms;let last;while(Date.now()<deadline){try{const value=await fn();if(value)return value;}catch(e){last=e;}await new Promise(r=>setTimeout(r,500));}throw new Error('Native operator wait timed out '+(last?.message??''));}
  const offer=await until(async()=>{const b=await call('/v1/operator/briefing');return b.options.find(o=>o.action==='faction-reputation');});
  const submitted=await call('/v1/operator/commands',{ticket:offer.ticket});assert.equal(submitted.completed,false);
  const receipt=()=>call(`/v1/operator/receipt?id=${submitted.id}&resetEpoch=${submitted.resetEpoch}`);
  const working=await until(async()=>{const r=await receipt();return ['working','observing'].includes(r.status)&&r;});
  assert.equal(working.completed,false);assert.equal(working.objectiveReceipt.faction,offer.params.faction);
  const replay=await call('/v1/operator/commands',{ticket:offer.ticket});assert.equal(replay.id,submitted.id);assert.equal(replay.replay,true);
  // Set only a near-target starting reputation. Native faction work supplies
  // the final increment and the worker observes the actual postcondition.
  await page.evaluate(({faction,targetRep})=>globalThis.__ghostHarness.factionRep(faction,targetRep-1),offer.params);
  const completed=await until(async()=>{const r=await receipt();return r.completed&&r;},60000);
  assert.equal(completed.scope,'faction-reputation-threshold');assert.ok(completed.objectiveReceipt.currentRep>=offer.params.targetRep);
  const journal=JSON.parse(await nativeRead('matrix/state/objective-journal.txt'));
  assert.equal(journal.receipts.filter(r=>r.id===submitted.id).length,1);
  const agent=JSON.parse(await nativeRead('cloud/agent-journal.txt'));
  assert.equal(agent.receipts.filter(r=>r.id===submitted.id).length,1);
  const nextOffer=await until(async()=>{const b=await call('/v1/operator/briefing');return b.options.find(o=>o.action==='faction-reputation' && o.params.targetRep>completed.objectiveReceipt.currentRep);});
  const next=await call('/v1/operator/commands',{ticket:nextOffer.ticket});
  const autoOffer=await until(async()=>{const b=await call('/v1/operator/briefing');return b.options.find(o=>o.action==='automatic-policy');});
  const auto=await call('/v1/operator/commands',{ticket:autoOffer.ticket});
  const restored=await until(async()=>{const r=await call(`/v1/operator/receipt?id=${auto.id}&resetEpoch=${auto.resetEpoch}`);return r.completed&&r;});
  assert.equal(restored.scope,'automatic-policy-restored');
  const cancelled=await call(`/v1/operator/receipt?id=${next.id}&resetEpoch=${next.resetEpoch}`);
  assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.completed,false);
  const autoReplay=await call('/v1/operator/commands',{ticket:autoOffer.ticket});assert.equal(autoReplay.replay,true);
  assert.equal(JSON.parse(await nativeRead('cloud/agent-journal.txt')).receipts.filter(r=>r.id===auto.id).length,1);
  assert.equal(errors.length,0);
  const paths=['tools/bridge-recovery/operator.mjs','tools/bridge-recovery/objective-options.mjs','tools/bridge-recovery/gateway.mjs','tools/bridge-recovery/job-protocol.mjs','tests/native/operator.cjs'];
  const hashes=Object.fromEntries([...Object.entries(source),...paths.map(p=>[p,fs.readFileSync(p,'utf8')])].map(([p,s])=>[p,crypto.createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex')]));
  fs.mkdirSync('docs/rp/evidence/operator',{recursive:true});
  fs.writeFileSync('docs/rp/evidence/operator/native.json',JSON.stringify({status:'passed',observedAt:new Date().toISOString(),gameSha:'3162fd2590e221eadd0c0fbd46151913f7c4c41c',scope:'Isolated official 3.0.1; synthetic BN4/64GB/CyberSec/XP/root. Real gateway HTTP -> native file queue -> real agent -> objective script -> real faction work and threshold receipt. Reputation seeded at target minus one. Second goal cancelled by auto policy, scoped receipt and replay verified. No Steam save or real GPT. Remote API transport replaced by test harness file adapter.',target:offer.params,submitted,working,completed,restored,cancelled,replayed:true,agentExecutionsPerCommand:1,errors,hashes},null,2));
  console.log(JSON.stringify({status:'passed',target:offer.params,completedRep:completed.objectiveReceipt.currentRep,agentExecutions:1}));
 }catch(e){if(page)try{console.error(JSON.stringify(await page.evaluate(()=>globalThis.__ghostHarness?.report())));}catch{}throw e;}
 finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
