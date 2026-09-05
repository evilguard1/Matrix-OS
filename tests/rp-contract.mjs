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
console.log(`RP delivery contract passed: ${tasks.length} tasks, ${capabilities.length} capabilities, ${scenarios.length} scenarios; rpReady=${release.rpReady}. This is not a runtime certification.`);
