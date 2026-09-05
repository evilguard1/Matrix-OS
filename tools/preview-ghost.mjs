/** Build a portable preview from the REAL Netscript React component. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const destination=path.resolve(process.argv[2] ?? path.join(root,".preview/ghost.html"));
const entry=path.join(root,"tools/preview-ghost-entry.jsx");
const result=await build({entryPoints:[entry],bundle:true,write:false,minify:true,format:"iife",platform:"browser",target:"es2022",define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"netscript-paths",setup(builder){builder.onResolve({filter:/^\/matrix\//},args=>({path:path.join(root,args.path.slice(1))}));}}]});
const script=result.outputFiles[0].text.replaceAll("</script","<\\/script");
const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MatrixOS — Ghost Command Deck</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'"><style>html,body{margin:0;background:#080d13;color:#edf4f7;font-family:'Segoe UI',sans-serif}#preview-tools{padding:10px 20px;background:#172331;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:12px;border-bottom:1px solid #354959}#preview-tools select{padding:5px;color:#edf4f7;background:#0c1720;border:1px solid #577181;border-radius:4px;font:inherit}#preview-tools label{display:flex;align-items:center;gap:9px}#preview-tools span{color:#abbccb}</style></head><body><aside id="preview-tools"><label>Scénario simulé <select id="preview-scenario"><option value="active">BN1 · opérations actives</option><option value="empty">Démarrage · aucune télémétrie</option><option value="stale">Connexion perdue</option><option value="bn4">BN4 · campagne non connectée</option></select></label><span>Le composant est celui du dashboard installable. Aucun appel réseau.</span></aside><div id="ghost-preview-root"></div><script>${script}</script></body></html>`;
fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,html);console.log(`Ghost preview: ${destination} (${Buffer.byteLength(html)} bytes)`);
