import {scope} from './context.mjs';
import {SOURCE,ADMIN_HOST,PARTNER_HOST} from './constants.mjs';
import {createFixtures,fixtureToken} from './fixtures.mjs';
import {applyCredentialBoundAdminGate,handleCredentialBoundAdminLogin,handleCredentialBoundAdminLogout} from '../admin-worker/src/admin-login-hero-worker-core.js';
import {readCredentialBoundAdminActor} from '../admin-worker/src/credential-bound-admin-session.js';
import {renderAdminConsolePage} from '../admin-worker/src/admin-console-page.js';
import {handleOwnerJobEdit} from '../admin-worker/src/owner-job-edit.js';
import {handlePartnerCoModelRead} from '../admin-worker/src/co-model-partner-read.js';
import {allowAdminConsoleFrame} from '../webflow/global/admin-console-views.mjs';
import partner from '../partners-worker/src/public-index.ts';
const role=STAGING_ROLE;
const json=(error,status)=>Response.json({ok:false,error,fixture:true},{status});
export default {async fetch(request,env,ctx){
 const u=new URL(request.url),host=role==='admin'?ADMIN_HOST:PARTNER_HOST;
 const internal=role==='admin'?'admin-worker.internal':'partners-worker.internal';
 if(![host,internal].includes(u.hostname))return json('staging_host_required',403);
 if(!env.ADMIN_LOGIN_CREDENTIAL||!env.ADMIN_SESSION_SECRET||role==='partner'&&(!env.TOKEN_SECRET||env.TOKEN_SECRET.length<32))return json('staging_secrets_required',503);
 const f=await createFixtures(role==='partner'?env.TOKEN_SECRET:null);
 // Explicit environment allowlist: no production bindings, Airtable credentials or senders inherited.
 const runtime={...f.env,ADMIN_LOGIN_CREDENTIAL:env.ADMIN_LOGIN_CREDENTIAL,ADMIN_SESSION_SECRET:env.ADMIN_SESSION_SECRET,
  ...(role==='admin'?{PRIVATE_MODEL_MEDIA:f.storage,PARTNERS_WORKER:env.PARTNERS_WORKER}:{TOKEN_SECRET:env.TOKEN_SECRET,ADMIN_CO_MODEL:env.ADMIN_CO_MODEL,ALLOWED_ORIGINS:'https://'+host})};
 const response=await scope.run(f.http,async()=>{
  if(u.hostname===internal){
   if(role==='admin'&&u.pathname==='/__internal/partner/co-model')return handlePartnerCoModelRead(request,runtime);
   if(role==='partner'&&u.pathname==='/__internal/co-model/scope')return partner.fetch(request,runtime,ctx);
   return json('internal_path_denied',403);
  }
  if(u.pathname.startsWith('/__internal/'))return json('internal_path_denied',403);
  const login='/internal/admin/login',loginSession=login+'/session';
  if(u.pathname===loginSession){
   if(request.headers.get('origin')!==u.origin)return json('origin_required',403);
   if(request.method==='DELETE')return handleCredentialBoundAdminLogout(request);
   if(request.method!=='POST')return json('method_denied',405);
   const copy=request.clone();let data;try{data=request.headers.get('content-type')?.includes('json')?await copy.json():Object.fromEntries(await copy.formData());}catch{return json('invalid_login',400);}
   if(data.action!=='owner_login')return json('fixture_login_only',403);
   return handleCredentialBoundAdminLogin(request,runtime);
  }
  if(!['GET','HEAD'].includes(request.method))return json('staging_read_only',405);
  if(u.pathname===login)return (await applyCredentialBoundAdminGate(request,runtime,login,request.method)).response;
  if(role==='partner'&&['/partner/dashboard','/v1/partner/dashboard','/v1/partner/jobs/detail'].includes(u.pathname))return partner.fetch(request,runtime,ctx);
  const actor=await readCredentialBoundAdminActor(request,runtime);
  if(actor?.role!=='owner')return json('owner_required',401);
  if(role==='partner'&&u.pathname==='/qa/partners')return new Response('<!doctype html><meta charset="utf-8"><h1>Staging fixtures</h1>'+await Promise.all(['A','B'].map(async lane=>'<p><a href="/partner/dashboard?t='+encodeURIComponent(await fixtureToken(env.TOKEN_SECRET,lane))+'">Partner '+lane+'</a></p>')).then(x=>x.join('')),{headers:{'content-type':'text/html;charset=utf-8'}});
  if(role==='admin'){
   if(['/internal/admin','/internal/admin/console'].includes(u.pathname))return renderAdminConsolePage(request);
   if(['/internal/admin/jobs/edit','/v1/admin/jobs/edit'].includes(u.pathname)&&u.searchParams.get('view')==='co-model')return allowAdminConsoleFrame(request,await handleOwnerJobEdit(request,runtime));
   if(u.pathname==='/qa/owner')return new Response('<!doctype html><meta charset="utf-8"><h1>Owner staging fixtures</h1>'+['A','B'].map(lane=>'<p><a href="/internal/admin/console?view=edit-job&tool_view=co-model&session_id=sess_fixture_'+lane+'">งาน '+lane+'</a></p>').join(''),{headers:{'content-type':'text/html;charset=utf-8'}});
  }
  return json('staging_path_denied',403);
 });
 const headers=new Headers(response.headers);headers.set('X-MMD-Staging-Source',SOURCE);headers.set('X-MMD-Fixture','co-model-v1');headers.set('Cache-Control','private, no-store');headers.set('Referrer-Policy','no-referrer');headers.set('X-Robots-Tag','noindex, nofollow');
 return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
}};
