import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {startConnector} from './server.mjs';
const operatorToken=randomBytes(32).toString('hex'),gatewayToken=randomBytes(32).toString('hex');
const calls=[];
const upstream=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;calls.push({url:req.url,method:req.method,headers:req.headers,body});res.setHeader('Content-Type','application/json');res.statusCode=req.method==='POST'?202:200;res.end(JSON.stringify({status:'queued',completed:false}));});
await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const connector=await startConnector({operatorToken,gatewayToken,publicOrigin:'https://matrix.example.invalid',port:0,gatewayOrigin:`http://127.0.0.1:${upstream.address().port}`,requestsPerMinute:12});
const base=`http://127.0.0.1:${connector.address().port}`,headers={Authorization:'Bearer '+operatorToken};
try{
 const spec=await(await fetch(base+'/openapi.json')).json();assert.equal(Object.keys(spec.paths).length,4);assert.equal(spec.components.securitySchemes.OperatorKey.scheme,'bearer');
 for(const key of [undefined,gatewayToken,'wrong'])assert.equal((await fetch(base+'/v1/status',{headers:key?{Authorization:'Bearer '+key}:{}})).status,401);
 for(const path of ['/v1/file?server=home&path=x','/v1/jobs','/v1/servers','/v1/ram','/v1/operator/commands?script=x']){
  assert.equal((await fetch(base+path,{headers})).status,404);
 }
 assert.equal(calls.length,0);
 assert.equal((await fetch(base+'/v1/status?url=http://evil.test',{headers})).status,400);
 const status=await fetch(base+'/v1/status',{headers:{...headers,'X-Matrix-Token':'caller-injection'}});assert.equal(status.status,200);
 assert.equal(calls[0].headers.authorization,'Bearer '+gatewayToken);assert.equal(calls[0].headers['x-matrix-token'],undefined);
 const submitted=await fetch(base+'/v1/operator/commands',{method:'POST',headers,body:JSON.stringify({ticket:'signed'})});assert.equal(submitted.status,202);assert.equal((await submitted.json()).completed,false);
 assert.deepEqual(JSON.parse(calls[1].body),{ticket:'signed'});
 assert.equal((await fetch(base+'/v1/operator/commands',{method:'POST',headers,body:JSON.stringify({ticket:'signed',script:'evil.js'})})).status,400);
 assert.equal((await fetch(base+'/v1/operator/commands',{method:'POST',headers,body:'x'.repeat(5000)})).status,413);
 assert.equal((await fetch(base+'/v1/operator/receipt?id=rp:'+ 'a'.repeat(64)+'&resetEpoch=4:1:2&resetEpoch=4:1:3',{headers})).status,400);
 assert.equal((await fetch(base+'/v1/operator/receipt?id=rp:'+ 'a'.repeat(64)+'&resetEpoch=4:1:2',{headers})).status,200);
 for(let n=0;n<12;n++)await fetch(base+'/v1/status',{headers});
 assert.equal((await fetch(base+'/v1/status',{headers})).status,429);
 assert.ok(!JSON.stringify(spec).includes(operatorToken));assert.ok(!JSON.stringify(spec).includes(gatewayToken));
 console.log('PASS: distinct credentials, real route isolation, header replacement, bounded body, receipt validation, status preservation, rate limit, key-free schema');
}finally{for(const server of [connector,upstream]){server.closeAllConnections();await new Promise(r=>server.close(r));}}
