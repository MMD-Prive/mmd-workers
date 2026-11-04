import {recordModelResponse} from './model-response-journal.mjs';
import {projectConsoleSession,snapshotAuthority} from './model-response-session.mjs';
// readAuthority must resolve ownership, original offer revision and binding from
// server records. It must never trust those values from request JSON.
// withOfferFence must serialize every response/reissue/reassignment writer for
// this Session until callback finishes. An in-process mutex is test-only and is
// not a production implementation. Missing fence keeps this adapter closed.
export function createModelResponseAdapter({bucket,readAuthority,writer,withOfferFence}) {
 return async function handle(request,env) {
  let body;try{body=await request.clone().json();}catch{return Response.json({ok:false,error:'response_invalid'},{status:400});}
  if(!['accept_job','decline_job'].includes(body?.action))return writer(request,env);
  if(typeof withOfferFence!=='function') return Response.json({ok:false,error:'offer_fence_unavailable'},{status:503});
  let initial;
  const result=await recordModelResponse({bucket,input:body,
   authorize:async input=>(initial=snapshotAuthority(await readAuthority(request,env,input))),
   apply:async input=>withOfferFence({session_id:input.session_id,offer_revision:input.offer_revision},async()=>{
    // Recheck after claiming the journal and immediately before the old writer.
    const fresh=snapshotAuthority(await readAuthority(request,env,body));
    if(fresh?.ok!==true||fresh.allowed!==true||fresh.session_id!==input.session_id||fresh.offer_revision!==input.offer_revision) return {ok:false};
    if(fresh.model_id!==initial.model_id||fresh.binding!==initial.binding)return{ok:false};
    // Proposals live in the journal; the old writer receives only its original
    // action contract, avoiding the missing decline_reason Airtable field.
    const clean={...body};delete clean.reason;delete clean.availability_options;delete clean.operation_id;
    const headers=new Headers(request.headers);headers.delete('content-length');
    const response=await writer(new Request(request.url,{method:request.method,headers,body:JSON.stringify(clean)}),env);
    let payload;try{payload=await response.json();}catch{return{ok:false};}
    if(!response.ok||payload.ok!==true||payload.session?.session_id!==input.session_id)return{ok:false};
    const session=projectConsoleSession(payload.session,input.session_id);
    if(!session)return{ok:false};
    return{ok:true,session};
   })});
  return Response.json(result,{status:result.ok?200:result.receipt.outcome==='unknown'?503:409,headers:{'cache-control':'no-store'}});
 };
}
