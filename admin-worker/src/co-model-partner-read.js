import {CO_MODEL_PATH,CO_MODEL_SCOPE_PATH} from '../../shared/co-model-service.mjs';
import {readCoModelEvidence} from '../../shared/co-model-evidence.mjs';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store, private'}});
export async function handlePartnerCoModelRead(request,env){
 const u=new URL(request.url);
 if(u.hostname!=='admin-worker.internal'||u.pathname!==CO_MODEL_PATH)return reply({ok:false,error:'forbidden'},403);
 if(request.method!=='GET')return reply({ok:false,error:'read_only'},405);
 const token=request.headers.get('x-mmd-partner-token'),recordId=u.searchParams.get('session_record_id'),sessionId=u.searchParams.get('session_id');
 if(!token||token.length>4096||!/^rec[A-Za-z0-9]{14,24}$/.test(recordId||'')||!sessionId||sessionId.length>159||[...u.searchParams.keys()].some(k=>!['session_record_id','session_id'].includes(k)))return reply({ok:false,error:'invalid_request'},400);
 if(!env.PARTNERS_WORKER?.fetch)return reply({ok:false,error:'scope_unavailable'},503);
 let first;
 const authorize=async()=>{
   const target=new URL('https://partners-worker.internal'+CO_MODEL_SCOPE_PATH);
   target.searchParams.set('session_record_id',recordId);target.searchParams.set('session_id',sessionId);
   const r=await env.PARTNERS_WORKER.fetch(new Request(target,{headers:{'x-mmd-partner-token':token},redirect:'manual',signal:AbortSignal.timeout(8000)}));
   if(!r.ok)throw Object.assign(Error('scope_denied'),{status:r.status===401||r.status===403?403:503});
   const p=await r.json();
   if(p.ok!==true||p.session_id!==sessionId||p.session_record_id!==recordId||!/^[a-f0-9]{64}$/.test(p.scope_revision||''))throw Object.assign(Error('scope_unavailable'),{status:503});
   if(first&&first!==p.scope_revision)throw Object.assign(Error('scope_changed'),{status:403});first=p.scope_revision;
 };
 try{
   const evidence=await readCoModelEvidence(env,{role:'partner',sessionId,recordId,authorize});
   return reply({ok:true,session_id:sessionId,session_record_id:recordId,evidence});
 }catch(e){return reply({ok:false,error:e.status===403?'scope_denied':'scope_unavailable'},e.status===403?403:503);}
}
