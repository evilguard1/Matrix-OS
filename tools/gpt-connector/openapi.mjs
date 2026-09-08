export const VERSION='0.1.0';
export function openApi(origin) {
 const result={type:'object',additionalProperties:true,properties:{error:{type:'string'},status:{type:'string'},id:{type:'string'},resetEpoch:{type:'string'},
  completed:{type:'boolean'},scope:{type:['string','null']},progressFresh:{type:'boolean'},rpReady:{type:'boolean'},
  options:{type:'array',items:{type:'object',additionalProperties:true,properties:{action:{type:'string'},ticket:{type:'string'},expiresAt:{type:'number'},effect:{type:'string'}}}},
  observation:{type:'object',additionalProperties:true,properties:{status:{type:'string'}}}}};
 const response=description=>({description,content:{'application/json':{schema:result}}});
 const replies={'200':response('Operational facts or durable receipt'),'400':response('Invalid request'),'401':response('Authentication required'),'409':response('Expired evidence, changed option or reset'),'429':response('Rate limited'),'502':response('Bridge unavailable')};
 return {openapi:'3.1.0',info:{title:'MatrixOS Operator',version:VERSION,description:'Observe and control one Bitburner game through the existing operator adapters.'},servers:[{url:origin}],
  components:{schemas:{},securitySchemes:{OperatorKey:{type:'http',scheme:'bearer'}}},security:[{OperatorKey:[]}],paths:{
   '/v1/status':{get:{operationId:'getMatrixStatus',summary:'Check game connectivity',responses:replies}},
   '/v1/operator/briefing':{get:{operationId:'getMatrixBriefing',summary:'Read current facts, available choices, their effects, signed tickets and expiration times',responses:replies}},
   '/v1/operator/commands':{post:{operationId:'submitMatrixChoice',summary:'Submit the exact selected ticket; keep the same ticket when retrying an ambiguous request','x-openai-isConsequential':false,
    requestBody:{required:true,content:{'application/json':{schema:{type:'object',additionalProperties:false,required:['ticket'],properties:{ticket:{type:'string',maxLength:2048,description:'Unmodified ticket from a fresh briefing option.'}}}}}},responses:{...replies,'202':response('Queued or replayed. Not proof of completion. Preserve id and resetEpoch.')}}},
   '/v1/operator/receipt':{get:{operationId:'getMatrixReceipt',summary:'Read the last recorded status and scoped postcondition for a submitted choice',parameters:[
    {name:'id',in:'query',required:true,schema:{type:'string',pattern:'^rp(?:-goal)?:[a-f0-9]{64}$'}},
    {name:'resetEpoch',in:'query',required:true,schema:{type:'string',pattern:'^[0-9]+:[0-9]+:[0-9]+$'}}],responses:replies}}
  }};
}
