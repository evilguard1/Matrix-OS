import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const proof=JSON.parse(fs.readFileSync('docs/rp/evidence/operator/native.json','utf8'));
assert.equal(proof.status,'passed');
assert.equal(proof.gameSha,'3162fd2590e221eadd0c0fbd46151913f7c4c41c');
assert.equal(proof.completed.completed,true);
assert.equal(proof.completed.scope,'faction-reputation-threshold');
assert.ok(proof.completed.objectiveReceipt.currentRep>=proof.target.targetRep);
assert.equal(proof.restored.scope,'automatic-policy-restored');
assert.equal(proof.cancelled.status,'cancelled');
assert.equal(proof.replayed,true);assert.deepEqual(proof.errors,[]);
for (const required of ['tools/bridge-recovery/operator.mjs','tools/bridge-recovery/objective-options.mjs','tools/bridge-recovery/gateway.mjs','tests/native/operator.cjs','matrix/objective.js','matrix/lib/objective-state.js','cloud/agent.js']) assert.ok(proof.hashes[required],required);
for (const [file,expected] of Object.entries(proof.hashes)) {
 const path=file==='cloud/agent.js'?'tools/bridge-recovery/servers/home/cloud/agent.js':file;
 assert.ok(!path.includes('..')&&!path.startsWith('/'),path);
 const actual=createHash('sha256').update(fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n')).digest('hex');
 assert.equal(actual,expected,`Native operator proof stale: ${file}; rerun tests/native/operator.cjs`);
}
console.log('PASS: native operator postconditions and executed source hashes; isolated test, not real GPT certification');
