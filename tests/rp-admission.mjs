import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formulaBatchShapeAtFraction, formulaBatchFrontier } from '../matrix/lib/hacking-planner.js';
const ns = { getServerMaxMoney: () => 1e9, getServerMinSecurityLevel: () => 1, getServerRequiredHackingLevel: () => 1,
    getServerGrowth: () => 50, getScriptRam: () => 1.75, weakenAnalyze: () => 0.05,
    hackAnalyzeSecurity: n => n * 0.002, growthAnalyzeSecurity: n => n * 0.004,
    formulas: { mockServer: () => ({}), hacking: { hackChance: () => 1, hackPercent: () => 0.6,
        hackTime: () => 1000, growTime: () => 3200, weakenTime: () => 4000, growThreads: () => 10 } } };
const cfg = { hacking: { minHackFraction: 0.05, maxHackFraction: 0.4 } }, context = { kind: 'formulas', player: {} };
assert.equal(formulaBatchShapeAtFraction(ns, 'test', cfg, context, 0.4), null);
assert.equal(formulaBatchFrontier(ns, 'test', cfg, context).length, 0);
ns.formulas.hacking.hackPercent = () => 0.13;
assert.ok(formulaBatchShapeAtFraction(ns, 'test', cfg, context, 0.4).f <= 0.4);
assert.ok(formulaBatchFrontier(ns, 'test', cfg, context).every(x => x.f <= 0.4));
assert.ok(formulaBatchFrontier(ns, 'test', { hacking: { minHackFraction: 0.6, maxHackFraction: 0.4 } }, context).every(x => x.f <= 0.4));

// Execute the production admission prefix up to dispatch. Mock resource reads
// and placement, so the test distinguishes global stop from per-target skip.
const source = fs.readFileSync('matrix/services/hacking.js', 'utf8').replace(/\r\n/g, '\n');
const begin = source.indexOf('        fill:\n');
const end = source.indexOf('                let baseFinish =', begin);
assert.ok(begin > 0 && end > begin);
const prefix = source.slice(begin, end);
const run = new Function('ready', 'placement', `
const selected=[],ns={},hosts=[],cfg={},boost={},activeCounts=new Map(),reserveFraction=0,DEFERRAL_RING=16;
let batchAdmissionDeferrals=0,batchAdmissionDeferredThreads=0,batchAdmissionDeferredRam=0;
const recentAdmissionDeferrals=[],liveRam=()=>({schedulableFree:10}),schedulablePool=()=>[{host:'home',free:10}];
const batchComponents=(_,shape)=>shape,planBatchPlacement=(_,shape)=>placement(shape),pushBounded=(arr,x)=>arr.push(x);
${prefix}
selected.push(host); break;
}}
return {selected,deferrals:batchAdmissionDeferrals};`);
const entries = [100, 5].map((ram, i) => ({ host: i ? 'small' : 'large', snapshot: { depth: 1, shape: { ram, tag: i } } }));
assert.deepEqual(run(entries, () => ({ ok: true })).selected, ['small']);
entries[0].snapshot.shape.ram = 8;
const fragmented = run(entries, shape => shape.tag === 0 ? ({ ok: false, failed: { missingThreads: 1, missingRam: 1 } }) : ({ ok: true }));
assert.deepEqual(fragmented.selected, ['small']);assert.equal(fragmented.deferrals,1);
console.log('RP admission passed: strict actual hack cap, integer rounding, contradictory bounds, later target after RAM/placement refusal.');
