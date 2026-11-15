export const CO_MODEL_PATH='/__internal/partner/co-model';
export const CO_MODEL_SCOPE_PATH='/__internal/co-model/scope';
const unavailable=()=>({status:'unavailable',timeline:[],submissions:null,images:null,unique_images:null});
export async function fetchPartnerCoModel(env,{token,recordId,sessionId}) {
  if(!env.ADMIN_CO_MODEL?.fetch)return unavailable();
  const url=new URL('https://admin-worker.internal'+CO_MODEL_PATH);
  url.searchParams.set('session_record_id',recordId);url.searchParams.set('session_id',sessionId);
  try {
    const r=await env.ADMIN_CO_MODEL.fetch(new Request(url,{headers:{'x-mmd-partner-token':token},redirect:'manual',signal:AbortSignal.timeout(10000)}));
    if(!r.ok)return unavailable();
    const p=await r.json();
    if(p.ok!==true||p.session_id!==sessionId||p.session_record_id!==recordId)return unavailable();
    return p.evidence;
  }catch{return unavailable();}
}
