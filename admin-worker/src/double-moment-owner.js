import {readCredentialBoundAdminActor} from './credential-bound-admin-session.js';
import {renderDoubleMomentOwnerPage} from './double-moment-owner-page.js';
import {sessionBalanceView} from '../../shared/session-balance-view.mjs';
import {appendSessionReportPanel} from './session-report-panel.js';

const PATH='/v1/admin/double-moment/extend';
const PAGE='/internal/admin/double-moment';
const CLAIMS='/v1/admin/double-moment/claims',CONTEXT='/v1/admin/double-moment/context';
const origins=new Set(['https://mmdbkk.com','https://www.mmdbkk.com']);
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store, private'}});
export const isDoubleMomentOwnerRequest=request=>[PATH,PAGE,CLAIMS,CONTEXT].includes(new URL(request.url).pathname);

export async function handleDoubleMomentOwnerRequest(request,env){
  const url=new URL(request.url),page=url.pathname===PAGE,read=[CLAIMS,CONTEXT].includes(url.pathname),origin=url.origin;
  if(request.method!==(page||read?'GET':'POST'))return json({ok:false,error:'method_not_allowed'},405);
  if(!origins.has(origin)||(!page&&!read&&request.headers.get('origin')!==origin)||(request.headers.has('origin')&&request.headers.get('origin')!==origin)||request.headers.get('sec-fetch-site')==='cross-site'||request.headers.has('authorization')||request.headers.has('x-internal-token'))return json({ok:false,error:'forbidden'},403);
  const actor=await readCredentialBoundAdminActor(request,env);
  if(!actor)return page?Response.redirect(new URL('/internal/admin/login?next='+encodeURIComponent(PAGE),url),302):json({ok:false,error:'unauthorized'},401);
  if(actor.role!=='owner'||actor.id!=='per')return json({ok:false,error:'owner_only'},403);
  if(page)return new Response(appendSessionReportPanel(renderDoubleMomentOwnerPage()),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store, private','referrer-policy':'no-referrer'}});
  const raw=read?'':await request.text();
  if(raw.length>2000)return json({ok:false,error:'invalid_extension'},400);
  let body;try{body=read?Object.fromEntries(url.searchParams):JSON.parse(raw);}catch{return json({ok:false,error:'invalid_extension'},400);}
  if(url.pathname===CONTEXT&&Object.hasOwn(body,'session_id')){
    if(Object.keys(body).length!==1||url.searchParams.getAll('session_id').length!==1||!/^sess[-_][A-Za-z0-9_-]{1,210}$/.test(body.session_id))return json({ok:false,error:'invalid_report',balance:null},400);
    try{
      if(!env.PAYMENTS_WORKER?.fetch||!env.AUTH_SERVICE_ADMIN_TO_PAYMENTS)throw Error();
      const r=await env.PAYMENTS_WORKER.fetch(new Request('https://payments.internal/v1/internal/payments/report',{method:'POST',headers:{'content-type':'application/json','x-internal-token':env.AUTH_SERVICE_ADMIN_TO_PAYMENTS},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)}));
      const d=await r.json();if(!r.ok||d.ok!==true||d.authority!=='payments-worker')throw Error();
      return json({ok:true,balance:sessionBalanceView(d.balance,body.session_id)});
    }catch{return json({ok:false,error:'report_unavailable',balance:null},503);}
  }
  const allowed=url.pathname===CLAIMS?['q','cursor']:url.pathname===CONTEXT?['client_record_id','claim_id']:['client_record_id','claim_id','request_id','expected_expires_at','expires_at','reason'];
  if(!body||Array.isArray(body)||(!read&&Object.keys(body).length!==allowed.length)||Object.keys(body).some(k=>!allowed.includes(k))||read&&[...url.searchParams.keys()].length!==Object.keys(body).length)return json({ok:false,error:'invalid_extension'},400);
  if(!env.PAYMENTS_WORKER?.fetch||!env.AUTH_SERVICE_ADMIN_TO_PAYMENTS)return json({ok:false,error:'extension_unavailable'},503);
  try{
    const action=url.pathname===CLAIMS?'owner-claims':url.pathname===CONTEXT?'extension-context':'extend';
    const result=await env.PAYMENTS_WORKER.fetch(new Request('https://payments.internal/v1/confirm/double-moment/'+action,{method:'POST',headers:{'content-type':'application/json','x-internal-token':env.AUTH_SERVICE_ADMIN_TO_PAYMENTS},body:JSON.stringify(read?body:{...body,actor_id:actor.id}),signal:AbortSignal.timeout(8000)}));
    const data=await result.json();
    if(read&&result.ok&&data.ok===true)return json(data);
    if(result.ok&&data.ok===true&&data.claim_id===body.claim_id&&data.request_id===body.request_id)return json({ok:true,claim_id:data.claim_id,request_id:data.request_id,expires_at:data.expires_at,maximum_expires_at:data.maximum_expires_at,replayed:data.replayed===true});
    const error=typeof data.error==='string'&&/^[a-z0-9_]{1,100}$/.test(data.error)?data.error:'extension_unavailable';
    return json({ok:false,error},[400,401,403,409,422,503].includes(result.status)?result.status:503);
  }catch{return json({ok:false,error:'extension_result_unknown_retry_same_request'},503);}
}
