import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHmac,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import TOML from '@iarna/toml';
import {build} from 'esbuild';
import {Miniflare,Log,LogLevel,Request as RRequest,Response as RResponse} from 'miniflare';
import {checkoutFixture,CLIENT,UID,SID,JOB,CLAIMS} from '../../../../payments-worker/test-fixtures/double-moment-checkout.mjs';
const repo=fileURLToPath(new URL('../../../../',import.meta.url)),origin='https://mmdbkk.com',scripts={},configs={};
for(const name of ['member-pages','payments']){configs[name]=TOML.parse(fs.readFileSync(path.join(repo,name+'-worker',name==='payments'?'wrangler.merged.toml':'wrangler.toml'),'utf8'));scripts[name]=(await build({entryPoints:[path.join(repo,name+'-worker',configs[name].main)],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:*','node:*'],logLevel:'silent'})).outputFiles[0].text;}
export const runtimeBuildHash=createHash('sha256').update(JSON.stringify(scripts)).digest('hex');
export async function createCheckoutRuntime(t,{lineLogin=false,reportFieldIds=null,ownerReport=false}={}){
 const f=checkoutFixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'mmd-customer-credit-')),secret='synthetic-member-session-secret-over-32-chars';let external=0;
 const options={log:new Log(LogLevel.ERROR),durableObjectsPersist:path.join(dir,'do'),kvPersist:path.join(dir,'kv'),workers:[
  {name:'member',script:scripts['member-pages'],modules:true,compatibilityDate:configs['member-pages'].compatibility_date,bindings:{LIFF_SESSION_SECRET:secret,AUTH_SERVICE_MEMBER_TO_PAYMENTS:'fixture-member'},kvNamespaces:['LIFF_IDENTITY_KV'],serviceBindings:{PAYMENTS_WORKER:'payments'},outboundService:()=>{external++;return new RResponse('Blocked',{status:503});}},
  {name:'payments',script:scripts.payments,modules:true,compatibilityDate:configs.payments.compatibility_date,bindings:{ALLOWED_ORIGINS:configs.payments.vars.ALLOWED_ORIGINS,AUTH_SERVICE_MEMBER_TO_PAYMENTS:'fixture-member',AUTH_SERVICE_ADMIN_TO_PAYMENTS:'fixture-admin',AIRTABLE_BASE_ID:'fixture',AIRTABLE_API_KEY:'fixture-only',PAYMENT_CONFIRMATION_SIGNING_SECRET:'synthetic-signing-key',DOUBLE_MOMENT_PURCHASE_ENABLED:'false'},kvNamespaces:['PAY_SESSIONS_KV'],durableObjects:{DOUBLE_MOMENT_COORDINATOR:{className:'DoubleMomentCoordinator',useSQLite:true},SESSION_PAID_PROJECTION_COORDINATOR:{className:'SessionPaidProjectionCoordinator',useSQLite:true}},serviceBindings:{AIRTABLE_HTTP:async r=>{const res=await f.fetch(r);return new RResponse(await res.text(),{status:res.status,headers:res.headers});}},outboundService:()=>{external++;return new RResponse('Blocked',{status:503});}},
 ]};
 if(reportFieldIds)Object.assign(options.workers[1].bindings,{SESSION_REPORT_PROJECTION_ENABLED:'true',SESSION_REPORT_FIELD_IDS:JSON.stringify(reportFieldIds)});
 if(ownerReport){
  const config=TOML.parse(fs.readFileSync(path.join(repo,'admin-worker/wrangler.toml'),'utf8'));
  const script=(await build({entryPoints:[path.join(repo,'admin-worker',config.main)],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:*','node:*'],logLevel:'silent'})).outputFiles[0].text;
  options.workers.push({name:'admin',script,modules:true,compatibilityDate:config.compatibility_date,bindings:{ADMIN_LOGIN_CREDENTIAL:'synthetic-owner',ADMIN_SESSION_SECRET:'synthetic-session',AUTH_SERVICE_ADMIN_TO_PAYMENTS:'fixture-admin'},serviceBindings:{PAYMENTS_WORKER:'payments'},routes:['https://mmdbkk.com/internal/admin/*','https://mmdbkk.com/v1/admin/double-moment/*'],outboundService:()=>{external++;return new RResponse('Blocked',{status:503});}});
 }
 const loginEvidence={verified:0,resolved:0,gatewayWrites:0,emptyAirtableReads:0};
 if(lineLogin){
  Object.assign(options.workers[0].bindings,{LINE_LOGIN_CHANNEL_ID:'1234567890',LINE_LIFF_ID:'fixture-liff',MEMBER_STATUS_RESOLVER_SECRET:'synthetic-resolver-secret-over-32-chars',AIRTABLE_BASE_ID:'fixture',AIRTABLE_API_KEY:'fixture-only'});
  options.workers[0].serviceBindings.LINE_ID_TOKEN_VERIFIER=async req=>{const form=new URLSearchParams(await req.text());loginEvidence.verified++;const token=form.get('id_token');return RResponse.json(token==='invalid'?{error:'invalid'}:{sub:token==='other-account'?'U99999999999999999999999999999999':UID,aud:form.get('client_id'),exp:Math.floor(Date.now()/1000)+600},{status:token==='invalid'?400:200});};
  options.workers[0].serviceBindings.MEMBER_STATUS_RESOLVER=async req=>{assert.equal(req.headers.get('x-mmd-member-resolver-secret'),'synthetic-resolver-secret-over-32-chars');loginEvidence.resolved++;const b=await req.json();assert.ok([UID,'U99999999999999999999999999999999'].includes(b.line_user_id));return RResponse.json({ok:true,data:{member_exists:true,member_id:'member_synthetic',profile:{display_name:'Synthetic customer',tier:'Standard',membership_status:'active',membership_expires_at:'2030-01-01'}}});};
  options.workers[0].outboundService=async req=>{const u=new URL(req.url);if(u.hostname==='api.airtable.com'&&u.pathname.startsWith('/v0/fixture/')){if(req.method==='GET'){loginEvidence.emptyAirtableReads++;return RResponse.json({records:[]});}if(u.pathname.startsWith('/v0/fixture/tblXjQFwo0A2cHseh')&&['POST','PATCH'].includes(req.method)){loginEvidence.gatewayWrites++;const b=await req.json();assert.equal(b.fields.verified_at,undefined);return RResponse.json({id:'recLoginFixture01',fields:b.fields});}}external++;return new RResponse('Blocked',{status:503});};
 }
 options.workers[1].routes=['https://mmdbkk.com/v1/confirm/*'];
 let runtime=new Miniflare(options);t?.after(async()=>{await runtime.dispose();assert.equal(external,0);});
 const actor=async body=>{const ns=await runtime.getDurableObjectNamespace('DOUBLE_MOMENT_COORDINATOR','payments');return ns.get(ns.idFromName(CLIENT)).fetch(new RRequest('https://coordinator.internal/run',{method:'POST',headers:{'x-internal-token':'fixture-admin'},body:JSON.stringify(body)}));};
 for(let i=0;i<4;i++){const r=await actor({action:'activate',claim_id:CLAIMS[i],payment_ref:'synthetic_purchase_'+i});assert.equal(r.status,200,await r.clone().text());}
 const evidence=await (await actor({action:'approval-context',client_record_id:CLIENT,job_id:JOB})).json();
 const approve=await actor({action:'approve-job',client_record_id:CLIENT,job_id:JOB,session_id:SID,snapshot_hash:evidence.snapshot_hash,actor_id:'per',approval_id:'synthetic-job-approval',evidence_ref:'synthetic-source',expires_at:'2030-01-01T00:00:00Z',service_amount_thb:25000,promotion_ids:[],coupon_ids:[],service_amount_excludes_tips_and_membership:true});assert.equal(approve.status,200,await approve.clone().text());
 const hash=token=>createHmac('sha256',secret).update('session:'+token).digest('hex');
 const kv=await runtime.getKVNamespace('LIFF_IDENTITY_KV','member');
 const session={line_user_id:UID,member_id:'member_synthetic',member_exists:true,expires_at:Date.now()+600000,member_profile:{tier:'standard',membership_status:'active',membership_expires_at:'2030-01-01'},session_id:SID};
 if(!lineLogin){await kv.put('liff:session:'+hash('customer'),JSON.stringify(session));await kv.put('liff:session:'+hash('other'),JSON.stringify({...session,line_user_id:'U99999999999999999999999999999999'}));}
 const send=(body,token='customer',headers={})=>runtime.dispatchFetch(origin+'/member/api/liff/promotions/double-moment/checkout',{method:'POST',headers:{origin,cookie:'__Host-mmd_liff_session='+token,'content-type':'application/json',...headers},body:JSON.stringify(body)});
 const read=(token='customer',sid=SID)=>runtime.dispatchFetch(origin+'/member/api/liff/promotions/double-moment/context?session_id='+sid,{headers:{cookie:'__Host-mmd_liff_session='+token}});
 return {f,actor,send,read,loginEvidence,async internalBalance(body={session_id:SID},token='fixture-admin'){return (await runtime.getWorker('payments')).fetch('https://payments.internal/v1/internal/payments/balance',{method:'POST',headers:{'x-internal-token':token,'content-type':'application/json'},body:JSON.stringify(body)});},dispatch:(url,options)=>runtime.dispatchFetch(url,options),async payment(path,body){return runtime.dispatchFetch(origin+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});},dispose:()=>runtime.dispose(),body:{session_id:SID,claim_id:CLAIMS[1]},async snapshot(){return JSON.parse(await (await runtime.getKVNamespace('LIFF_IDENTITY_KV','member')).get('liff:session:'+hash('customer')));},async restart(){await runtime.dispose();runtime=new Miniflare(options);},async cache(){const ns=await runtime.getDurableObjectNamespace('SESSION_PAID_PROJECTION_COORDINATOR','payments');return (await ns.get(ns.idFromName('session:'+SID)).fetch(new RRequest('https://projection.internal/reconcile',{method:'POST',body:JSON.stringify({session_id:SID})}))).json();}};
}
