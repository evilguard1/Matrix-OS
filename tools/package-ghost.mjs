import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const out=path.resolve(process.argv[2] ?? path.join(root,".preview/package"));
const baseline="681045f8c45963e4569db1aed221e598c7cf50f6";
const source=fs.readFileSync(path.join(root,"matrix/dashboard.jsx"),"utf8");
const old=execFileSync("git",["show",`${baseline}:matrix/dashboard.jsx`],{cwd:root,encoding:"utf8"});
function fingerprint(source){const s=source.replace(/\r\n/g,"\n");let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619)>>>0;return `${s.length}:${h.toString(16)}`;}
let installer=fs.readFileSync(path.join(root,"tools/ghost-installer-template.js"),"utf8");
installer=installer.replace('"__GHOST_SOURCE__"',()=>JSON.stringify(source)).replace('"__EXPECTED_BASE__"',()=>JSON.stringify(fingerprint(old)));
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,"matrix"),{recursive:true});
fs.writeFileSync(path.join(out,"install-ghost.js"),installer);
fs.writeFileSync(path.join(out,"matrix/dashboard.jsx"),source);
fs.writeFileSync(path.join(out,"dashboard-original-1.10.2.jsx"),old);
fs.writeFileSync(path.join(out,"ghost-dashboard.patch"),execFileSync("git",["diff","--binary",baseline,"--","matrix/dashboard.jsx","package.json","package-lock.json","tests/render-deck.mjs"],{cwd:root}));
for(const name of ['ghost-deck.mjs','ghost-installer.mjs']){fs.mkdirSync(path.join(out,'tests'),{recursive:true});fs.copyFileSync(path.join(root,'tests',name),path.join(out,'tests',name));}
for(const name of ['preview-ghost.mjs','preview-ghost-entry.jsx','package-ghost.mjs','ghost-installer-template.js']){fs.mkdirSync(path.join(out,'tools'),{recursive:true});fs.copyFileSync(path.join(root,'tools',name),path.join(out,'tools',name));}
const dashboardSha256=createHash('sha256').update(source).digest('hex');
const nativePath=path.join(out,'native-checks.json');
const native=fs.existsSync(nativePath)?JSON.parse(fs.readFileSync(nativePath,'utf8')):null;
const nativeEngineVerified=native?.status==='passed' && native?.dashboardSha256===dashboardSha256;
const installerSha256=createHash('sha256').update(installer).digest('hex');
const installCheckPath=path.join(out,'native-installer-checks.json');
const installCheck=fs.existsSync(installCheckPath)?JSON.parse(fs.readFileSync(installCheckPath,'utf8')):null;
const nativeInstallerVerified=installCheck?.status==='passed' && installCheck.dashboardSha256===dashboardSha256 && installCheck.installerSha256===installerSha256;
fs.writeFileSync(path.join(out,"release.json"),JSON.stringify({name:"MatrixOS Ghost Command Deck",edition:"01",baseline,baselineVersion:"1.10.2",gameVersion:"3.0.1",dashboardSha256,installerSha256,baselineFingerprint:fingerprint(old),staticRamGB:1.7,nativeEngineVerified,nativeRamGB:nativeEngineVerified?native.actualRamGB:null,nativeInstallerVerified,installerRamGB:nativeInstallerVerified?installCheck.installed.installerRam:null,userSteamSaveVerified:false,pushedToGitHub:false,installationScope:["dashboard source","dashboard backup","dashboard lease and process only"],note:"The patch contains tracked changes; new test and tool files are included separately. Native verification uses an isolated game with synthetic telemetry."},null,2));
console.log(`Ghost installable package: ${out}`);
