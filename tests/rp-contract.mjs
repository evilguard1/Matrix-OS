// Integrity of the delivery contract, not gameplay readiness.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const read = name => JSON.parse(fs.readFileSync(`docs/rp/${name}`, 'utf8'));
const { tasks } = read('backlog.json');
const { capabilities } = read('capability-catalog.json');
const { scenarios } = read('scenarios.json');
const release = read('release-status.json');
const unique = (items, label) => {
  assert.equal(new Set(items.map(x => x.id)).size, items.length, `duplicate ${label}`);
  return new Map(items.map(x => [x.id, x]));
};
const taskMap = unique(tasks, 'task'), caps = unique(capabilities, 'capability');
unique(scenarios, 'scenario'); unique(release.releaseGates, 'gate');
const visited = new Set(), visiting = new Set();
function visit(id) {
  assert.ok(taskMap.has(id), `unknown dependency ${id}`);
  if (visited.has(id)) return;
  assert.ok(!visiting.has(id), `cyclic dependency ${id}`);
  visiting.add(id);
  for (const dep of taskMap.get(id).dependsOn) visit(dep);
  visiting.delete(id); visited.add(id);
}
for (const task of tasks) {
  visit(task.id);
  for (const key of ['implementation', 'acceptance', 'rollback']) assert.ok(task[key]?.length > 20);
}
const covered = new Set();
for (const scenario of scenarios) {
  for (const command of scenario.commands) {
    assert.ok(caps.has(command), `unknown scenario command ${command}`);
    covered.add(command);
  }
}
for (const cap of capabilities) {
  assert.ok(taskMap.has(cap.deliveryTask), `unknown delivery task for ${cap.id}`);
  assert.ok(cap.postcondition.length > 20, `missing postcondition ${cap.id}`);
  if (cap.requiredForBN4) assert.ok(covered.has(cap.id), `no acceptance scenario for ${cap.id}`);
  if (!release.allControlAdaptersImplemented) assert.equal(cap.exposedToGPT, false,
    'A design catalog must not pretend to activate GPT tools');
}
if (release.rpReady) {
  assert.equal(release.allControlAdaptersImplemented, true);
  for (const gate of release.releaseGates) {
    assert.equal(gate.status, 'passed', `unmet ${gate.id}`);
    assert.ok(gate.evidence.length, `no evidence for ${gate.id}`);
    for (const evidence of gate.evidence) assert.ok(fs.existsSync(evidence), `missing ${evidence}`);
  }
  for (const s of scenarios) assert.equal(s.status, 'passed', `unexecuted ${s.id}`);
}
const native = read('evidence/native-checks.json');
const binding = read('evidence/source-binding.json');
const source = fs.readFileSync('matrix/dashboard.jsx', 'utf8').replace(/\r\n/g, '\n');
assert.equal(binding.nativeDashboardSha256, native.dashboardSha256);
assert.equal(createHash('sha256').update(source).digest('hex'), binding.gitLfDashboardSha256,
  'Ghost source changed: refresh the native proof before claiming this evidence');
assert.equal(native.scope.includes('not user Steam save'), true);
const findings = read('findings.json').findings;
unique(findings, 'finding'); assert.equal(findings.length, 24);
assert.equal(read('reference/compendium-registry.json').length, 106);
assert.equal(read('reference/implementation-backlog.json').tasks.length, 21);
assert.equal(read('reference/ui-backlog.json').tasks.length, 4);
assert.equal(fs.existsSync('docs/rp/reference/Ghost-Node-War-COFFRE-GM.md'), false);
const purchaseProof = read('evidence/rp01/native.json');
const installProof = read('evidence/rp02/native.json');
assert.equal(purchaseProof.status, 'passed');
for (const [file, hash] of Object.entries(purchaseProof.hashes)) {
  if (file === 'matrix/config.json') continue; // Explicit synthetic purchase policy.
  assert.equal(createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g,'\n')).digest('hex'), hash,
    `Native purchase/RAM proof no longer matches ${file}; refresh or explicitly archive this proof.`);
}
assert.equal(createHash('sha256').update(fs.readFileSync('install.js', 'utf8').replace(/\r\n/g,'\n')).digest('hex'), installProof.installerSha256);
assert.deepEqual(installProof.results.map(x => x.homeRam), [8,16,64,128,256]);
assert.ok(installProof.results.every(x => x.installerRam <= 8 && x.phase === 'installed' && x.errors.length === 0));
const progressionProof = read('evidence/rp05/native.json');
const controlProof=read('evidence/control/native.json');
const briefingProof=read('evidence/briefing/native.json');
const objectiveProof=read('evidence/objective/native.json');
assert.equal(objectiveProof.status,'passed');
assert.equal(objectiveProof.commandRam,3.3);assert.equal(objectiveProof.workerRam,8.6);
assert.equal(objectiveProof.briefing.objective.id,'native-goal');assert.equal(objectiveProof.briefing.objective.source,'operator');assert.equal(objectiveProof.briefing.nodeProgress,null);
assert.equal(objectiveProof.working.active.id,'native-goal');assert.equal(objectiveProof.resumed.active.id,'native-goal');
assert.equal(objectiveProof.completed.active,null);assert.equal(objectiveProof.completed.receipts[0].status,'succeeded');
assert.ok(objectiveProof.completed.receipts[0].currentRep>=100);assert.equal(objectiveProof.replay.receipts.length,1);assert.equal(objectiveProof.replay.active,null);
for(const [file,hash] of Object.entries(objectiveProof.hashes)) {
 assert.equal(createHash('sha256').update(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')).digest('hex'),hash,`Objective native proof no longer matches ${file}`);
}
assert.equal(briefingProof.status,'passed');
assert.deepEqual(briefingProof.results.map(r=>r.homeRam),[32,64]);
for(const r of briefingProof.results) {
 assert.equal(r.ram,3.45);assert.equal(r.active.status,'running');assert.ok(r.active.objective);
 assert.equal(r.active.nodeProgress,null);assert.equal(r.active.expiresAt-r.active.updated,15000);
 assert.equal(r.stopped.objective,null);assert.equal(r.stopped.status,'offline-or-transitioning');
 assert.deepEqual(r.stopped.options,[]);assert.deepEqual(r.errors,[]);
}
for(const [file,hash] of Object.entries(briefingProof.hashes)) {
 assert.equal(createHash('sha256').update(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')).digest('hex'),hash,`Briefing native proof no longer matches ${file}`);
}
assert.equal(controlProof.status,'passed');
assert.deepEqual(controlProof.results.map(r=>r.homeRam),[8,32,64]);
for(const result of controlProof.results) {
 assert.equal(result.paused.status.status,'paused');
 assert.equal(result.paused.status.remaining.length,0);
 assert.equal(result.resumed.journal.desired,'running');
 assert.equal(result.resumed.journal.receipts.find(r=>r.id==='native-resume').scope,'stage-started');
 assert.equal(result.resumed.journal.receipts.filter(r=>r.id==='native-pause').length,1);
 assert.equal(result.errors.length,0);
 assert.equal(result.commandRam,1.65);
 if(result.homeRam>8) {
  const foreign=result.before.processes.find(p=>p.filename==='foreign-loop.js');assert.ok(foreign);
  assert.ok(result.paused.processes.some(p=>p.pid===foreign.pid));
  assert.ok(result.resumed.processes.some(p=>p.pid===foreign.pid));
 }
}
assert.equal(controlProof.results[2].paused.work,null);
assert.equal(controlProof.results[2].paused.status.player.status,'stopped');
for(const [file,hash] of Object.entries(controlProof.hashes)) {
 assert.equal(createHash('sha256').update(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')).digest('hex'),hash,`Control native proof no longer matches ${file}`);
}
const backdoorProof = read('evidence/backdoors/native.json');
assert.equal(backdoorProof.status,'passed');
assert.equal(backdoorProof.pending.installed,false);
assert.equal(backdoorProof.state.installed,true);
assert.ok(backdoorProof.state.factions.includes('CyberSec'));
assert.equal(backdoorProof.singularity.currentWork.factionName,'CyberSec');
assert.ok(backdoorProof.workerRam + backdoorProof.childRam < 24);
for(const [file,hash] of Object.entries(backdoorProof.hashes)) {
 assert.equal(createHash('sha256').update(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')).digest('hex'),hash,`Backdoor native proof no longer matches ${file}`);
}
const earlyProof=read('evidence/early/native.json');
assert.equal(earlyProof.status,'passed');
assert.deepEqual(earlyProof.results.map(x=>x.initialRam),[16,32]);
assert.ok(earlyProof.results.every(x=>x.controllerRam<=16 && x.report.homeRam===64 && x.errors.length===0));
assert.deepEqual(earlyProof.results[1].programReceipts.map(x=>x.target),['TOR','BruteSSH.exe']);
for(const [file,hash] of Object.entries(earlyProof.hashes)){
 assert.equal(createHash('sha256').update(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')).digest('hex'),hash,`Early native proof no longer matches ${file}`);
}
assert.equal(progressionProof.status,'passed');
assert.ok(progressionProof.completedCycles >= 2);
assert.ok(progressionProof.workers.every(w => w.ram < 24 && !w.error));
assert.equal(progressionProof.redPill.receipt.cost,0);
assert.equal(progressionProof.redPill.receipt.status,'spent');
assert.equal(progressionProof.redPill.state.hasRedPill,false);
assert.equal(progressionProof.redPill.state.redPillQueued,true);
for (const [file, hash] of Object.entries(progressionProof.hashes)) {
  if(file === 'matrix/config.json')continue; // Native fixture disables augmentation installation.
  assert.equal(createHash('sha256').update(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')).digest('hex'),hash,
    `Native BN4 proof no longer matches ${file}`);
}
console.log(`RP delivery contract passed: ${tasks.length} tasks, ${capabilities.length} capabilities, ${scenarios.length} scenarios; rpReady=${release.rpReady}. This is not a runtime certification.`);
