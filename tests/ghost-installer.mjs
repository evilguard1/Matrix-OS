import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const target="/matrix/dashboard.jsx",backup="/matrix/backups/dashboard.pre-ghost-01.jsx",candidate="/matrix/state/ghost-candidate.jsx";
const old=execFileSync('git',['show','681045f8c45963e4569db1aed221e598c7cf50f6:matrix/dashboard.jsx'],{encoding:'utf8'});
const next=fs.readFileSync('matrix/dashboard.jsx','utf8');
function fingerprint(source){const s=source.replace(/\r\n/g,'\n');let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619)>>>0;return `${s.length}:${h.toString(16)}`;}
const source=fs.readFileSync('tools/ghost-installer-template.js','utf8').replace('"__GHOST_SOURCE__"',()=>JSON.stringify(next)).replace('"__EXPECTED_BASE__"',()=>JSON.stringify(fingerprint(old)));
const installer=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function fixture(){const files={[target]:old,'/matrix/lib/common.js':'common','/matrix/lib/singleton.js':'singleton'},killed=[],log=[];let processes=[{pid:10,filename:target,threads:1},{pid:11,filename:'/matrix/services/hacking.js',threads:1}];return {files,killed,log,ns:{args:[],disableLog(){},getHostname:()=>"home",tprint:x=>log.push(x),read:p=>files[p] ?? '',fileExists:p=>Object.hasOwn(files,p),write:async(p,v)=>{files[p]=v;return true;},getScriptRam:()=>1.7,getServerMaxRam:()=>64,getServerUsedRam:()=>50,ps:()=>processes,kill:pid=>{killed.push(pid);processes=processes.filter(p=>p.pid!==pid);return true;},rm:p=>{delete files[p];return true;},run:(filename)=>{processes.push({pid:99,filename,threads:1});return 99;}}};}
let f=fixture();await installer.main(f.ns);assert.equal(f.files[target],next);assert.equal(f.files[backup],old);assert.deepEqual(f.killed,[10]);assert.ok(!f.files[candidate]);
f.ns.args=['--restore'];await installer.main(f.ns);assert.equal(f.files[target],old);assert.ok(!f.killed.includes(11));
f=fixture();f.files[target]='unknown local change';await installer.main(f.ns);assert.equal(f.files[target],'unknown local change');assert.equal(f.killed.length,0);
f=fixture();f.files[backup]='important other backup';await installer.main(f.ns);assert.equal(f.files[backup],'important other backup');assert.equal(f.files[target],old);
f=fixture();f.files[candidate]='existing file';await installer.main(f.ns);assert.equal(f.files[candidate],'existing file');assert.equal(f.files[target],old);
f=fixture();f.ns.getServerUsedRam=()=>64;f.ns.getScriptRam=p=>p===candidate?3:1.7;await installer.main(f.ns);assert.equal(f.files[target],old);assert.equal(f.killed.length,0);
f=fixture();f.ns.getScriptRam=()=>0;await installer.main(f.ns);assert.equal(f.files[target],old);assert.equal(f.killed.length,0);
f=fixture();f.ns.run=()=>0;await installer.main(f.ns);assert.equal(f.files[target],old);assert.ok(f.log.some(x=>x.includes('restauré')));
f=fixture();const write=f.ns.write;f.ns.write=async(p,v)=>p===backup?false:write(p,v);await installer.main(f.ns);assert.equal(f.files[target],old);assert.equal(f.killed.length,0);
f=fixture();f.files[target]=next;await installer.main(f.ns);assert.equal(f.killed.length,0);assert.equal(f.files[backup],undefined);
console.log('Ghost installer passed: install/restore, original fingerprint, occupied paths, RAM refusal, verified backup, launch rollback, foreign PID preservation and idempotence.');
