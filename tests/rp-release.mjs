import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as installer from '../install.js';
import * as common from '../matrix/lib/common.js';
import * as bootstrap from '../matrix/bootstrap.js';
const sha = 'a'.repeat(40), next = 'b'.repeat(40), profileFile = '/matrix/release.json';
const profile = { schemaVersion: 1, channel: 'rp/ghost-node-war', installedSha: sha };
function fixture() {
    const files = new Map([[profileFile, JSON.stringify(profile)], ['/matrix/kernel.js', 'old kernel'], ['/matrix/config.json', 'custom config']]);
    const calls = [], logs = [];
    const ns = { args: ['--no-start'], getHostname: () => 'home', getServerMaxRam: () => 64,
        disableLog() {}, tprint: x => logs.push(x), read: p => files.get(p) ?? '', fileExists: p => files.has(p),
        write(p,v) { files.set(p,v); }, rm: p => files.delete(p), scan: () => [], ps: () => [],
        async wget(url,p) { calls.push(url); files.set(p, url.includes('api.github') ? JSON.stringify({sha:next}) : 'installer'); return true; },
        spawn() { throw new Error('unexpected start'); } };
    return {ns,files,calls,logs};
}
// Independent digest oracle, including UTF-8, lone surrogates and padding boundaries.
for (const s of ['', 'abc', 'é👻\ud800', ...[55,56,63,64,65,10000].map(n => 'x'.repeat(n))]) {
    assert.equal(installer.sha256(s), createHash('sha256').update(s).digest('hex'));
}
for (const client of [common,bootstrap]) {
    let f=fixture(); assert.equal(await client.fetchLatestInstaller(f.ns, '/installer.js', true), sha);
    assert.equal(f.calls.length,1); assert.ok(f.calls[0].includes(`/${sha}/`));
    f=fixture(); assert.equal(await client.fetchLatestInstaller(f.ns), next);
    assert.ok(f.calls[0].includes('rp%2Fghost-node-war')); assert.ok(f.calls[1].includes(`/${next}/`));
    f=fixture(); f.ns.wget=async()=>false; assert.equal(await client.fetchLatestInstaller(f.ns),null);
    f=fixture(); f.files.set(profileFile,'broken'); assert.equal(await client.fetchLatestInstaller(f.ns),null); assert.equal(f.calls.length,0);
    f=fixture(); f.files.delete(profileFile); await client.fetchLatestInstaller(f.ns); assert.ok(f.calls[0].includes('rp%2Fghost-node-war'));
}
const content='export async function main(ns) { ns.tprint("new kernel"); }';
const manifest={version:'test',baseUrl:'ignored',protectedFiles:['matrix/config.json'],
    stages:[{id:'bootstrap',minHomeRam:8},{id:'early',minHomeRam:16},{id:'full',minHomeRam:64},{id:'operations',minHomeRam:128},{id:'advanced',minHomeRam:256}],
    files:[{path:'matrix/kernel.js',stage:'bootstrap',sha256:installer.sha256(content)},
        {path:'matrix/config.json',stage:'bootstrap',sha256:installer.sha256('{}')}]};
function installFixture(ram=64) {
    const f=fixture(); f.ns.getServerMaxRam=()=>ram;
    f.ns.wget=async(url,p)=> { f.calls.push(url); f.files.set(p,url.includes('api.github')?JSON.stringify({sha:next}):
        url.endsWith('manifest.json')?JSON.stringify(manifest):url.endsWith('kernel.js')?content:'{}'); return true; };
    return f;
}
for (const ram of [8,16,64,128,256]) {
    const f=installFixture(ram); f.ns.args.push('--release',next);
    await installer.main(f.ns);
    assert.equal(f.files.get('/matrix/kernel.js'),content); assert.equal(f.files.get('/matrix/config.json'),'custom config');
    assert.equal(JSON.parse(f.files.get(profileFile)).installedSha,next);
    assert.equal(JSON.parse(f.files.get(profileFile)).channel,profile.channel);
    assert.equal(JSON.parse(f.files.get(installer.TRANSACTION)).phase,'installed');
    assert.ok(f.calls.every(url=>url.includes(`/${next}/`)), 'explicit handoff SHA must not resolve a second commit');
    assert.equal(f.files.get('/matrix/state/installed-stage.txt'),manifest.stages.filter(s=>s.minHomeRam<=ram).at(-1).id);
}
{
    const f=installFixture(); f.ns.args.push('--stage'); await installer.main(f.ns);
    assert.ok(f.calls.every(url=>url.includes(`/${sha}/`)));
}
{
    const f=installFixture(); const wget=f.ns.wget; f.ns.wget=async(url,p)=>{await wget(url,p); if(url.endsWith('kernel.js'))f.files.set(p,'corrupt');return true;};
    await installer.main(f.ns); assert.equal(f.files.get('/matrix/kernel.js'),'old kernel'); assert.equal(f.files.has(installer.TRANSACTION),false);
}
// Fail every write boundary (intent, code, manifest, profile, stage, completion).
// The next installer invocation must be able to retry recovery after a cut.
for (let cut=1;cut<=6;cut++) {
    const f=fixture(); f.files.set('/staged.txt',content); const before=new Map(f.files);
    let count=0; const write=f.ns.write;
    f.ns.write=(p,v)=>{if(++count===cut)throw new Error('power cut');write(p,v);};
    assert.throws(()=>installer.promoteRelease(f.ns,[{local:'/matrix/kernel.js',temp:'/staged.txt',sha256:installer.sha256(content)}],manifest,{...profile,installedSha:next},'full'));
    f.ns.write=write; installer.restoreTransaction(f.ns);
    for(const [p,v] of before)assert.equal(f.files.get(p),v,`cut ${cut}, ${p}`);
    assert.equal(f.files.has('/matrix/manifest.json'),false); assert.equal(f.files.has('/matrix/state/installed-stage.txt'),false);
}
{
    const f=fixture(); f.files.set(installer.TRANSACTION,'broken');
    await installer.main(f.ns); assert.equal(f.calls.length,0); assert.equal(f.files.get('/matrix/kernel.js'),'old kernel');
}
console.log('RP release passed: pinned channel/stages, independent SHA-256 oracle, protected config, bad download, six interrupted writes, corrupt journal. Runtime health gate remains pending.');
