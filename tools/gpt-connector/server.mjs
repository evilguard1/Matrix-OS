import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {openApi,VERSION} from './openapi.mjs';

const routes=new Set(['GET /v1/status','GET /v1/operator/briefing','POST /v1/operator/commands','GET /v1/operator/receipt']);
function reply(response,status,value){response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(value));}
export async function startConnector({operatorToken,gatewayToken,publicOrigin,port=31338,gatewayOrigin='http://127.0.0.1:31337',timeoutMs=20000,requestsPerMinute=60}) {
 if(typeof operatorToken!=='string'||operatorToken.length<32||typeof gatewayToken!=='string'||gatewayToken.length<32||operatorToken===gatewayToken)throw new Error('Two distinct private credentials of at least 32 characters are required');
 const upstream=new URL(gatewayOrigin),publicUrl=new URL(publicOrigin);
 if(upstream.protocol!=='http:'||upstream.hostname!=='127.0.0.1'||upstream.username||upstream.password||upstream.pathname!=='/'||upstream.search||upstream.hash)throw new Error('Gateway must be a loopback HTTP origin');
 if(publicUrl.protocol!=='https:'||publicUrl.username||publicUrl.password||publicUrl.pathname!=='/'||publicUrl.search||publicUrl.hash||publicUrl.port)throw new Error('Public URL must be an HTTPS origin on port 443');
 const expected=Buffer.from(operatorToken);let windowStart=Date.now(),count=0;
 const server=createServer(async(request,response)=>{
  try{
   const url=new URL(request.url,'http://127.0.0.1');
   if(request.method==='GET'&&url.pathname==='/openapi.json'&&!url.search)return reply(response,200,openApi(publicUrl.origin));
   const value=request.headers.authorization;
   const received=Buffer.from(typeof value==='string'&&value.startsWith('Bearer ')?value.slice(7):'');
   if(received.length!==expected.length||!timingSafeEqual(received,expected))return reply(response,401,{error:'Operator Bearer key required'});
   if(!routes.has(`${request.method} ${url.pathname}`))return reply(response,404,{error:'Unknown operator endpoint'});
   if(Date.now()-windowStart>=60000){windowStart=Date.now();count=0;}
   if(++count>requestsPerMinute)return reply(response,429,{error:'Retry later',retryAfterSeconds:60});
   const query=new URLSearchParams();
   if(url.pathname==='/v1/operator/receipt'){
    if([...url.searchParams].length!==2||url.searchParams.getAll('id').length!==1||url.searchParams.getAll('resetEpoch').length!==1||
      !/^rp(?:-goal)?:[a-f0-9]{64}$/.test(url.searchParams.get('id')??'')||!/^\d+:\d+:\d+$/.test(url.searchParams.get('resetEpoch')??''))return reply(response,400,{error:'Invalid operation identity'});
    query.set('id',url.searchParams.get('id'));query.set('resetEpoch',url.searchParams.get('resetEpoch'));
   }else if(url.search)return reply(response,400,{error:'Unexpected query parameters'});
   let body;
   if(request.method==='POST'){
    const chunks=[];let size=0;
    for await(const chunk of request){size+=chunk.length;if(size>4096)return reply(response,413,{error:'Request too large'});chunks.push(chunk);}
    let parsed;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(response,400,{error:'Invalid JSON'});}
    if(!parsed||Array.isArray(parsed)||Object.keys(parsed).length!==1||typeof parsed.ticket!=='string'||parsed.ticket.length>2048)return reply(response,400,{error:'Exactly one ticket is required'});
    body=JSON.stringify({ticket:parsed.ticket});
   }
   const target=upstream.origin+url.pathname+(query.size?'?'+query:'');
   const result=await fetch(target,{method:request.method,redirect:'error',signal:AbortSignal.timeout(timeoutMs),
    headers:{Authorization:'Bearer '+gatewayToken,'Content-Type':'application/json'},...(body?{body}:{})});
   const chunks=[];let bytes=0;
   for await(const chunk of result.body){bytes+=chunk.length;if(bytes>80000)throw new Error('Response too large');chunks.push(chunk);}
   reply(response,result.status,JSON.parse(Buffer.concat(chunks).toString('utf8')));
  }catch{if(!response.headersSent)reply(response,502,{error:'Operator bridge unavailable; a POST result may be ambiguous. Retry the identical ticket.'});}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;server.timeout=25000;
 await new Promise((resolve,reject)=>server.once('error',reject).listen(port,'127.0.0.1',resolve));
 console.log(`Matrix GPT connector ${VERSION} listening on loopback port ${server.address().port}`);
 return server;
}
