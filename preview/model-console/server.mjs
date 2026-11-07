import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConsoleEmbed, buildConsoleDeclineEmbed } from '../../scripts/build-model-console-atelier-embed.mjs';
import { completionOwnerPage } from '../../admin-worker/src/session-completion-owner-page.js';
import {buildConfirmationTravel} from '../../scripts/build-customer-confirmation-travel.mjs';
import { ownerTravelResponse } from '../../admin-worker/src/model-travel-owner.js';
import { applyOwnerJobAction, listOwnerJobActions, OWNER_OPS_FIELDS as F } from '../../admin-worker/src/job-orchestrator-owner-ops-runtime.js';
import { handleCustomerAftercare } from '../../events-worker/src/customer-aftercare-v2.js';
import { memoryR2 } from '../../shared/test/payment-memory-r2.mjs';
import { buildBundle } from '../../scripts/build-my-model-workspace-bundle.mjs';
import { buildLovableSkinEmbed } from '../../scripts/build-my-model-lovable-skin-embed.mjs';
import { buildCustomerAftercareEmbed } from '../../scripts/build-customer-aftercare-embed.mjs';
import { handleModelReconfirmRequest,runModelReconfirmSweep,buildReconfirmSchedule } from '../../admin-worker/src/model-reconfirm-runtime.js';
import { TravelTestBucket } from '../../shared/model-travel-fixtures.mjs';
import { projectTravel } from '../../shared/model-travel-store.mjs';
import { travelClientBundle, travelClientCss } from '../../shared/model-travel-client-source.mjs';
import { handleMemberAppSessionApi } from '../../member-pages-worker/src/member-app-session.js';
import { handleModelTravelApi } from '../../admin-worker/src/model-travel-api.js';
import modelTravelWorker from '../../admin-worker/src/model-liff-worker-legacy.js';
import coreWorker from '../../admin-worker/src/index.js';
import eventsWorker from '../../events-worker/src/model-eta-wrapper.js';
import {createHmac} from 'node:crypto';
import {meetingBinding} from '../../shared/model-travel-store.mjs';
import {drainOwnerTravelAlerts} from '../../admin-worker/src/model-travel-owner.js';
import {drainOwnerPayoutInstructions} from '../../admin-worker/src/model-payout-destination.js';
import {listNotificationReviews,resolveNotificationReview} from '../../admin-worker/src/notification-manual-review.js';
import ownerWorker from '../../admin-worker/src/job-orchestrator-owner-ops-wrapper.js';
import ownerDelegate from '../../admin-worker/src/cancellation-credit-recovery.js';
import paymentsWorker from '../../payments-worker/index.review-wrapper.js';
import {signConfirmToken,createConfirmTokenRecord} from '../../payments-worker/index.js';
import {SESSION_FIELDS} from '../../payments-worker/confirmation-details.js';
import {buildModelNightlineSkin} from '../../scripts/build-model-nightline-skin.mjs';
import {BALANCE_FIELDS as B} from '../../payments-worker/verified-session-balance.js';
let retryDemo=null;
function armTelegramResponseLoss(intent){retryDemo={scenario:'runtime-flow',intent,offline:false,loseResponse:true,attempts:0,delivered:0,clock:0,log:[]};}
function deliveryProof(){return {calls:retryDemo?.attempts||0,accepted:retryDemo?.delivered||0};}
let customerCredential=null;
const originalOwnerFetch=ownerDelegate.fetch;
ownerDelegate.fetch=(request,env,ctx)=>new URL(request.url).pathname==='/v1/admin/auth/me'
  ?Response.json(request.headers.get('cookie')==='preview-owner=synthetic'?{authenticated:true,actor_id:'preview-owner',actor_role:'owner'}:{authenticated:false},{status:request.headers.get('cookie')==='preview-owner=synthetic'?200:401})
  :originalOwnerFetch(request,env,ctx);

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const source=p=>fs.readFileSync(path.join(repo,p),'utf8');
const sid='PREVIEW-SESSION-001';
const steps=[
  ['notice','D−1 · 12:00 แจ้งเตือน','confirmed','31 ต.ค. · 12:00'],
  ['ack','นายแบบรับทราบแล้ว','confirmed','31 ต.ค. · 18:15'],
  ['overdue','19:00 ยังไม่รับทราบ → แจ้งเปอร์','confirmed','31 ต.ค. · 19:00'],
  ['day','วันนัด · พร้อมออกเดินทาง','confirmed','1 พ.ย. · 18:10'],
  ['travel','วันนัด · เริ่มเดินทาง','en_route','1 พ.ย. · 18:15'],
  ['arrived','ถึงจุดนัด','arrived','1 พ.ย. · 18:50'],
  ['met','พบลูกค้า · รอตรวจยอด','met_customer','1 พ.ย. · 19:00'],
  ['payment','ยืนยันชำระแล้ว','final_payment_confirmed','1 พ.ย. · 19:05'],
  ['working','เริ่มงาน','work_started','1 พ.ย. · 19:10'],
  ['finished','งานเสร็จ · ยังไม่แยกย้าย','work_finished','1 พ.ย. · 21:10'],
  ['separated','แยกย้าย · รอลูกค้าอนุมัติ','separated','1 พ.ย. · 21:15'],
  ['approved','ลูกค้าอนุมัติจบงาน','under_review','1 พ.ย. · 21:20'],
  ['reviewed','ลูกค้าส่งรีวิวส่วนตัว','under_review','1 พ.ย. · 21:22'],
  ['cleared','เปอร์ตรวจจบงานผ่าน','under_review','1 พ.ย. · 21:25'],
  ['account','พร้อมจ่าย · ส่งบัญชีให้เปอร์','payout_pending','1 พ.ย. · 21:26'],
  ['paid','เปอร์โอนจริงและบันทึก → ปิดงาน','closed','1 พ.ย. · 21:30'],
  ['hold','รีวิวมีปัญหา → HOLD','under_review','1 พ.ย. · 21:22'],
  ['wrong_location','ไปผิดสถานที่ · ไปที่นัดเดิมต่อ','en_route','1 พ.ย. · 18:55'],
];
let fixture,env,messages=[],revision=0,stepIndex=0,lastPreviewError=null;
const fieldNames={...Object.fromEntries(Object.entries(F.session).map(([name,id])=>[id,({sessionId:'session_id',jobId:'job_id',modelName:'model_name',clientName:'client_name',paymentRef:'payment_ref',modelPayout:'pay_model_thb',state:'model_session_state',stateUpdatedAt:'model_session_state_updated_at',completion:'completion_review_status',reviewedAt:'completion_reviewed_at',holdReason:'payout_hold_reason'})[name]||name])),fldflz9XwR9vAQIBZ:'customer_aftercare_json',fldj3m3CxELpYZO4f:'customer_completed_at',fldrXQAyOMPCvbOaY:'Canonical Model'};
const fieldsById=fields=>Object.fromEntries(Object.entries(fields).map(([key,value])=>[Object.entries(fieldNames).find(([,name])=>name===key)?.[0]||key,value]));
Object.assign(fieldNames,Object.fromEntries(Object.entries(SESSION_FIELDS).map(([name,id])=>[id,({sessionId:'session_id',amountThb:'amount_thb',sessionStatus:'status',paymentRef:'payment_ref',modelName:'model_name',clientName:'client_name',jobType:'job_type',jobDate:'job_date',startTime:'start_time',endTime:'end_time',locationName:'location_name',payModelThb:'pay_model_thb'})[name]||name])));
const json=value=>Response.json(value);
function setStep(index){
  if(Number(index)!==0)throw Error('initial_fixture_only');
  customerCredential=null;retryDemo=null;
  stepIndex=Math.max(0,Math.min(steps.length-1,Number(index)||0));revision++;
  const [key,,state]=steps[stepIndex],at='2026-10-30T12:00:00.000Z';
  const approved=['approved','reviewed','cleared','account','paid','hold'].includes(key);
  const reviewed=['reviewed','cleared','account','paid','hold'].includes(key);
  const clear=['cleared','account','paid'].includes(key);
  const review=reviewed?{ts:at,rating:key==='hold'?2:5,rating_scale:5,quick_tags:['polite','good_care'],issue_tags:key==='hold'?['brief_mismatch']:[],private_model_message:'ขอบคุณที่ดูแลอย่างดีครับ (ข้อมูลจำลอง)',private_mmd_message:key==='hold'?'รายละเอียดบางส่วนไม่ตรงกับบรีฟ ขอให้เปอร์ช่วยตรวจสอบครับ (จำลอง)':'ตรงเวลาและดูแลดี อยากจองอีกครั้งครับ (ข้อมูลจำลอง)',private_care_recommended:key==='hold'}:null;
  fixture={session:{id:'recPreviewSession',fields:{session_id:sid,job_id:'PREVIEW-JOB-001',model_name:'ธีร์ · นายแบบจำลอง',client_name:'ลูกค้าทดสอบ',model_session_state:state,model_session_state_updated_at:at,pay_model_thb:5000,'Canonical Model':['recPreviewModel0001'],job_date:'2026-11-01',start_time:'19:00',end_time:'21:00',location_name:'สถานที่นัดหมายจำลอง · กรุงเทพฯ',completion_review_status:key==='hold'?'hold':clear?'clear':approved?'pending_review':'',payout_hold_reason:key==='hold'?'customer_review_requires_attention':'',...(clear?{completion_reviewed_at:at}:{}),...(approved?{customer_completed_at:at,customer_aftercare_json:JSON.stringify({schema:'mmd_customer_completion_v1',session_id:sid,approved_at:at,review})}:{})}},model:{id:'recPreviewModel0001',fields:{payout_dest_type:'bank_account',payout_dest_bank:'PREVIEW BANK · ไม่ใช่บัญชีจริง',payout_dest_name:'SYNTHETIC MODEL ONLY',payout_dest_ref:'0000000000',payout_dest_status:'verified',payout_dest_verified_by:'preview-owner',payout_dest_verified_at:at}},payments:[{id:'recPreviewPayment',fields:{[F.payment.sessionId]:sid,[F.payment.verification]:'verified',[F.payment.stage]:'final',[F.payment.paymentRef]:'PREVIEW-PAYMENT'}}],payouts:[],care:[]};
  Object.assign(fixture.session.fields,{reconfirm_status:['ack','day'].includes(key)?'acknowledged':'pending',reconfirm_required_at:'2026-10-31T18:00:00+07:00',reconfirm_reminder_at:'2026-10-31T18:00:00+07:00',reconfirm_overdue_at:'2026-10-31T19:00:00+07:00',reconfirm_notified_at:'2026-10-31T18:00:00+07:00',...(['ack','day'].includes(key)?{reconfirm_acknowledged_at:'2026-10-31T18:15:00+07:00'}:{})});
  fixture.travel=[];
  fixture.travelBucket=new TravelTestBucket();
  fixture.etaMinutes=35;fixture.etaUpdatedAt=new Date().toISOString();
  fixture.job={id:'recPreviewJob',fields:{session_id:sid,events_json:JSON.stringify([{event:'eta_update',eta_minutes:35,ts:fixture.etaUpdatedAt}])}};
  fixture.session.fields.line_user_id='U1234567890abcdef1234567890abcdef';
  Object.assign(fixture.session.fields,{amount_thb:9000,payment_ref:'PREVIEW-DEPOSIT',model_work_lane:'private_model'});
  const jobDate=new Date(Date.now()+7*3600000).toISOString().slice(0,10),schedule=buildReconfirmSchedule(jobDate);
  Object.assign(fixture.session.fields,{job_date:jobDate,start_time:jobDate+'T19:00:00+07:00',end_time:jobDate+'T21:00:00+07:00',job_type:'Private Session · ข้อมูลจำลอง',reconfirm_required_at:schedule.required_at,reconfirm_reminder_at:schedule.reminder_at,reconfirm_overdue_at:schedule.overdue_at});
  fixture.payments=[{id:'recPreviewDeposit',fields:{[B.ref]:'PREVIEW-DEPOSIT',[B.paymentSession]:sid,[B.amount]:3000,[B.stage]:'deposit',[B.type]:'deposit',[B.status]:'Paid',[B.verification]:'verified'}}];
  fixture.proofs=[];fixture.extra=[];
  fixture.model.fields.line_user_id='Uabcdef1234567890abcdef1234567890';
  if(key==='notice')delete fixture.session.fields.reconfirm_notified_at;
  if(['account','paid'].includes(key))fixture.payouts.push({id:'recPreviewPayout',fields:{[F.payout.sessionId]:sid,[F.payout.type]:'session_payout',[F.payout.status]:key==='paid'?'payout_paid':'payout_pending',[F.payout.amount]:5000}});
  env={AIRTABLE_BASE_ID:'local-preview',AIRTABLE_API_KEY:'synthetic-only',AIRTABLE_TABLE_SESSIONS:'Sessions',PRIVATE_MODEL_MEDIA:memoryR2(),MODEL_RECONFIRM_OWNER_CHAT_ID:'12345',AUTH_SERVICE_STUDIO_TO_TELEGRAM:'synthetic-only',TELEGRAM_INTERNAL_SEND_URL:'https://telegram.preview/send'};
  messages=[];
  env.AT_SESSIONS__STATE='model_session_state';env.AIRTABLE_TABLE_JOBS='Jobs';env.MODEL_SESSION_SIGNING_SECRET='synthetic-preview-model-signing-secret';env.AUTH_SERVICE_ADMIN_TO_EVENTS='synthetic-preview-events-auth';
  Object.assign(env,{AUTH_SERVICE_ADMIN_TO_PAYMENTS:'synthetic-admin-payments',INTERNAL_TOKEN:'synthetic-payment-internal',CONFIRM_KEY:'synthetic-confirmation-signing',ALLOWED_ORIGINS:'https://mmdbkk.com,https://www.mmdbkk.com',AIRTABLE_TABLE_PAYMENTS:'tblWGGJJOx5eBvBZJ',AIRTABLE_TABLE_PAYMENT_PROOFS:'tblfJfM4Sqag9zrLi',PAY_SESSIONS_KV:{values:new Map(),async get(key){return this.values.get(key)||null;},async put(key,value){this.values.set(key,value);}}});
  Object.assign(env,{LINE_CHANNEL_ACCESS_TOKEN:'synthetic-customer-line',MODEL_LINE_CHANNEL_ACCESS_TOKEN:'synthetic-model-line',MODEL_RECONFIRM_ENABLED:'true',AIRTABLE_TABLE_MODELS:'tblI4B0bI446vp9GX'});
  Object.assign(env,{AT_PAYMENTS__PAYMENT_REF:B.ref,AT_PAYMENTS__SESSION_ID:B.paymentSession,AT_PAYMENTS__AMOUNT:B.amount,AT_PAYMENTS__PAYMENT_STATUS:B.status,AT_PAYMENTS__VERIFICATION_STATUS:B.verification,AT_PAYMENTS__PAYMENT_STAGE:B.stage,AT_PAYMENTS__PAYMENT_TYPE:B.type});
  env.EVENTS_WORKER={fetch:request=>eventsWorker.fetch(request,env,{})};
  env.PAYMENTS_WORKER={fetch:paymentsRequest};env.PAYMENTS_HTTP={fetch:paymentsRequest};
  if(key==='overdue')messages.push({role:'owner',channel:'Telegram · จำลอง',text:'19:00 · ยังไม่มีหลักฐานการรับทราบรายละเอียดล่าสุดในระบบหลังส่งคำขอ reconfirm\nเปอร์ช่วยรีเชคนายแบบว่าเกิดอะไรขึ้น\nไม่เปลี่ยนงานเป็นยกเลิกอัตโนมัติ'});
  if(['travel','arrived','met','payment','working','finished'].includes(key))messages.push({role:'customer',channel:'LINE · จำลอง',text:({travel:'นายแบบเริ่มเดินทางแล้ว · คาดว่าจะถึงในอีก 35 นาที',arrived:'นายแบบถึงจุดนัดแล้ว',met:'พบลูกค้าแล้ว · รอระบบตรวจยืนยันการชำระ',payment:'ระบบตรวจยืนยันการชำระแล้ว',working:'Session เริ่มแล้ว',finished:'งานเสร็จแล้ว · ยังไม่เปิดอนุมัติจนแยกย้าย'})[key]});
  if(key==='separated')messages.push({role:'customer',channel:'LINE · จำลอง',text:'นายแบบแยกย้ายแล้วครับ\nเปิด MY MMD เพื่อยืนยันจบงานและให้รีวิวส่วนตัว'});
  if(approved)messages.push({role:'owner',channel:'Telegram · จำลอง',text:key==='hold'?'Customer review received\nHOLD: review requires attention':'Customer approved completion\nOwner completion/payment review is still required'});
  if(['account','paid'].includes(key))messages.push({role:'owner',channel:'Telegram ส่วนตัว · จำลอง',text:accountMessage()});
}
function accountMessage(){return 'MMD · READY TO PAY\nSession: '+sid+'\nAmount: 5,000.00 THB\nBank: PREVIEW BANK · ไม่ใช่บัญชีจริง\nAccount name: SYNTHETIC MODEL ONLY\nAccount: 0000000000\nเปอร์โอนเอง แล้วบันทึกเลขอ้างอิงหลังโอนจริง'};
const indexFor=key=>steps.findIndex(step=>step[0]===key);
function modelRequest(pathname,method='GET',body){
  const payload=Buffer.from(JSON.stringify({kind:'model_session',role:'model',session_id:sid,model_record_id:'recPreviewModel0001',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const t=payload+'.'+createHmac('sha256',env.MODEL_SESSION_SIGNING_SECRET).update(payload).digest('hex');
  const url=new URL(pathname,'https://mmdbkk.com');url.searchParams.set('t',t);
  const payloadBody=body?{...body}:null;if(payloadBody?.t==='preview-only-not-a-token')delete payloadBody.t;
  return new Request(url,{method,headers:{'content-type':'application/json',origin:'https://mmdbkk.com'},...(payloadBody?{body:JSON.stringify(payloadBody)}:{})});
}
async function paymentsRequest(request){
  const url=new URL(request.url);let forwarded=request,syntheticAlias=false;
  if(request.method==='POST'&&url.pathname.startsWith('/v1/confirm/')){
    const body=await request.clone().json();
    if(body.t==='preview-only-not-a-token'){
      syntheticAlias=true;
      if(!customerCredential){const iat=Math.floor(Date.now()/1000),claims={kind:'customer_confirm',role:'customer',session_id:sid,payment_ref:'PREVIEW-DEPOSIT',payment_type:'deposit',iat,exp:iat+3600};customerCredential=await signConfirmToken(claims,env.CONFIRM_KEY);await createConfirmTokenRecord(env,customerCredential,claims);}
      body.t=customerCredential;
    }
    forwarded=new Request(new URL(url.pathname,'https://mmdbkk.com'),{method:'POST',headers:{'content-type':'application/json',origin:'https://mmdbkk.com'},body:JSON.stringify(body)});
  }
  const response=await paymentsWorker.fetch(forwarded,env,{waitUntil:()=>{}});
  if(!syntheticAlias)return response;
  // Keep the local URL alias consistent without changing signed verification.
  const alias=value=>{
    if(Array.isArray(value))return value.map(alias);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,alias(item)]));
    if(typeof value==='string'&&/^https?:\/\//.test(value)){const link=new URL(value);if(link.searchParams.get('t')===customerCredential)link.searchParams.set('t','preview-only-not-a-token');return link.toString();}
    return value;
  };
  return new Response(JSON.stringify(alias(await response.json())),{status:response.status,headers:response.headers});
}
async function reviewFinalPayment(){
  const payment=fixture.payments.find(r=>r.fields[B.stage]==='final');
  if(!payment)return Response.json({ok:false,error:'final_intent_required'},{status:409});
  const proof={id:'recSyntheticProof',fields:{proof_id:'synthetic-final-proof',payment_ref:payment.fields[B.ref],amount_thb:6000,status:'pending'}};
  fixture.proofs=[proof];
  return paymentsRequest(new Request('https://payments-worker.internal/v1/internal/payments/reviewed-proof',{method:'POST',headers:{'content-type':'application/json','x-internal-token':env.AUTH_SERVICE_ADMIN_TO_PAYMENTS},body:JSON.stringify({source:'payment_review_console',decision:'approved',proof_id:proof.fields.proof_id,evidence_record_id:proof.id,payment_ref:payment.fields[B.ref],session_id:sid,payment_stage:'final',amount_thb:6000,review_actor:'preview-owner',review_reason:'Synthetic evidence checked in isolated local runtime'})}));
}

// This transport cannot reach Airtable or Telegram: every request is fulfilled in memory.
globalThis.fetch=async(input,init={})=>{
  const req=input instanceof Request?input:new Request(input,init),url=new URL(req.url);
  if(url.hostname==='api.line.me'&&url.pathname==='/v2/bot/message/push'){
    const body=await req.json();messages.push({role:body.to===fixture.model.fields.line_user_id?'model':'customer',channel:'LINE · จำลอง',text:body.messages.map(m=>m.text||m.altText||'').join('\n')});revision++;return json({});
  }
  if(url.hostname==='api.airtable.com'&&url.pathname.endsWith('/tblTPC2yV1P3CwbgU'))return json({records:[{id:'recSyntheticInstructions',fields:{Status:'active','Instruction ID':'mmd_job_v1',Methods:['bank_transfer'],'Account Number':'0000000000','Bank Name TH':'ธนาคารจำลอง ไม่รับโอนจริง','Account Name TH':'SYNTHETIC ONLY'}}]});
  if(url.hostname==='telegram.preview'){
    const body=await req.json();
    if(retryDemo&&body.intent===retryDemo.intent){retryDemo.attempts++;if(retryDemo.offline){retryDemo.log.push('ส่งครั้งที่ '+retryDemo.attempts+': Telegram 429 จำลอง');return Response.json({telegram:{ok:false,error:{ok:false,error_code:429}}});}retryDemo.delivered++;retryDemo.log.push('ส่งครั้งที่ '+retryDemo.attempts+': ปลายทางจำลองรับแล้ว');if(retryDemo.loseResponse){retryDemo.loseResponse=false;throw Error('synthetic_response_lost_after_acceptance');}}
    messages.push({role:'owner',channel:'Telegram ส่วนตัว · จำลอง',text:body.text});revision++;
    return json({ok:true,telegram:{ok:true}});
  }
  if(url.hostname!=='api.airtable.com')throw Error('preview_external_network_blocked');
  const parts=url.pathname.split('/'),table=parts[3],id=parts[4],byId=url.searchParams.get('returnFieldsByFieldId')==='true';
  if(table==='Jobs'){
    if(req.method==='GET')return json(id?structuredClone(fixture.job):{records:[structuredClone(fixture.job)]});
    if(req.method!=='PATCH')throw Error('preview_job_write_not_allowed');
    const data=await req.json();Object.assign(fixture.job.fields,data.fields);return json(structuredClone(fixture.job));
  }
  if(table==='tblI4B0bI446vp9GX')return json(structuredClone(fixture.model));
  const sessionTable=table==='Sessions'||table==='tblC98mKWbzmPuNzX';
  let rows=sessionTable?[fixture.session]:table==='tblWGGJJOx5eBvBZJ'?fixture.payments:table==='tblMvsl7qYozD05e5'?fixture.payouts:table==='tbltWzMBhWev4JR13'?fixture.care:table==='tblfJfM4Sqag9zrLi'?fixture.proofs:table==='Points_Ledger'?fixture.extra:null;
  if(table==='tblbIhMUXMAYlXmpi'&&req.method==='GET')return json({records:[]});
  if(table==='tblhQGfJc4GgiteZr'&&req.method==='GET')return json({records:[]});
  if(!rows)throw Error('preview_table_not_allowed:'+table);
  if(req.method==='GET'){
    const formula=url.searchParams.get('filterByFormula')||'';
    const ref=/\{(?:Payment Reference|payment_ref)\}='([^']*)'/.exec(formula)?.[1];
    if(ref)rows=rows.filter(r=>(r.fields[B.ref]||r.fields.payment_ref)===ref);
    if(formula.includes('OR({Payment Status}'))rows=rows.filter(r=>r.fields[B.verification]==='verified');
    const project=r=>({id:r.id,fields:sessionTable&&byId?fieldsById(r.fields):r.fields});
    return json(structuredClone(id?project(rows.find(r=>r.id===id)): {records:rows.map(project)}));
  }
  const data=await req.json();let fields=data.fields||data.records?.[0]?.fields;
  if(sessionTable)fields=Object.fromEntries(Object.entries(fields).map(([key,value])=>[fieldNames[key]||key,value]));
  const record=req.method==='POST'?{id:'recPreview'+(rows.length+1),fields:{}}:rows.find(r=>r.id===id);
  Object.assign(record.fields,fields);if(req.method==='POST')rows.push(record);revision++;
  const result={id:record.id,fields:sessionTable&&byId?fieldsById(record.fields):record.fields};return json(data.records?{records:[result]}:result);
};
setStep(0);
const adapter=fs.readFileSync(path.join(here,'adapter.js'),'utf8');
const consoleEmbed=buildConsoleDeclineEmbed()+buildConsoleEmbed();
const nightlineSkin=process.env.MMD_NIGHTLINE_SKIN==='1'?buildModelNightlineSkin():'';
const heroConcept=process.env.MMD_CONSOLE_HERO_DESIGN==='1'?'<style>'+source('webflow/sigil/model/model-console-hero-nightline.css')+'</style>':'';
function page(body,title='MMD Preview'){return '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>body{margin:0;font-family:system-ui}*,*:before,*:after{box-sizing:border-box}[hidden]{display:none!important}</style><script>'+adapter+'</script></head><body>'+body+'</body></html>';}
async function documentFor(role){
  if(role==='model-home')return page(buildBundle().replace(/<script src="https:\/\/static\.line-scdn\.net[^>]+><\/script>/,'')+buildLovableSkinEmbed()+nightlineSkin,'MY MODEL · Local Data');
  if(role==='model')return source('scripts/fixtures/model-lv15/console-shell.html').replace('<head>','<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden],.smcv3-hidden{display:none!important}.w-form-done,.w-form-fail{display:none}</style><script>'+adapter+'</script>').replace('</body>',consoleEmbed+nightlineSkin+heroConcept+'</body>');
  if(role==='owner')return (await completionOwnerPage().text()).replace('<script>','<style>header{gap:12px;flex-wrap:wrap}header h1{overflow-wrap:anywhere}p{overflow-wrap:anywhere}button{white-space:normal}</style><script>'+adapter+'</script><script>');
  if(role==='aftercare')return page(buildCustomerAftercareEmbed(),'Customer Aftercare · Source Bundle');
  return page('<script>'+source('webflow/sigil/confirm/customer-atelier-v2.js')+'</script>'+buildConfirmationTravel()+'<script>'+source('webflow/sigil/confirm/customer-session-tracker-v2.js')+'</script>','MY MMD Customer Preview');
}
async function api(req,body,pathWithQuery,bytes){
  const apiUrl=new URL(pathWithQuery,'http://127.0.0.1'),pathname=apiUrl.pathname;
  if(pathname.startsWith('/v1/confirm/'))return paymentsRequest(new Request('https://mmdbkk.com'+pathname,{method:'POST',headers:{'content-type':'application/json',origin:'https://mmdbkk.com'},body:JSON.stringify(body)}));
  if(pathname==='/v1/model/profile')return json({ok:true,model:{working_name:'ธีร์ · นายแบบจำลอง',readiness:{line_identity_verified:true},languages:['thai'],availability_status:'available',available_now:true,telegram_connected:true}});
  if(pathname==='/v1/model/media')return json({ok:true,media:[]});
  if(pathname==='/v1/model/session/current')return handleModelReconfirmRequest(modelRequest(pathname),env,{},coreWorker);
  if(pathname==='/v1/model/session/action'){
    if(body.action!=='send_eta'&&body.action!=='acknowledge_reconfirm'){
      const payload=Buffer.from(JSON.stringify({kind:'model_session',role:'model',session_id:sid,model_record_id:'recPreviewModel0001',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
      const t=payload+'.'+createHmac('sha256',env.MODEL_SESSION_SIGNING_SECRET).update(payload).digest('hex');
      const localBody={...body};if(localBody.t==='preview-only-not-a-token')delete localBody.t;
      const response=await coreWorker.fetch(new Request('https://mmdbkk.com/v1/model/session/action?t='+t,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(localBody)}),env);
      if(response.ok){const key=body.action==='report_wrong_location'?'wrong_location':({start_travel:'travel',mark_arrived:'arrived',mark_met_customer:'met',start_work:'working',mark_work_finished:'finished',confirm_separated:'separated'})[body.action];if(key)stepIndex=indexFor(key);revision++;}
      return response;
    }
    if(body.action==='send_eta'){
      if(!['en_route','nearby'].includes(fixture.session.fields.model_session_state)||!Number.isInteger(body.eta_minutes)||body.eta_minutes<1||body.eta_minutes>240)return Response.json({ok:false,error:'preview_eta_locked'},{status:409});
      const response=await env.EVENTS_WORKER.fetch(new Request('https://events-worker.internal/__internal/model/session/eta',{method:'POST',headers:{'content-type':'application/json','X-Internal-Token':env.AUTH_SERVICE_ADMIN_TO_EVENTS},body:JSON.stringify({session_id:sid,model_record_id:fixture.session.fields['Canonical Model'][0],eta_minutes:body.eta_minutes})}));
      if(!response.ok)return response;
      revision++;return coreWorker.fetch(modelRequest('/v1/model/session/current'),env,{});
    }
    if(body.action==='acknowledge_reconfirm'){
      const result=await handleModelReconfirmRequest(modelRequest(pathname,'POST',body),env,{},coreWorker);
      if(result.ok){stepIndex=indexFor('ack');revision++;}
      return result;
    }
    return Response.json({ok:false,error:'preview_action_not_supported'},{status:400});
  }
  if(['/v1/model/session/travel','/api/member/app/session/travel'].includes(pathname)||pathname.endsWith('/session/travel/photo')){
    const travelEnv={...env,PRIVATE_MODEL_MEDIA:fixture.travelBucket},record=fixture.session,modelId=record.fields['Canonical Model'][0];
    const role=pathname.startsWith('/v1/model')?'model':'customer';
    const request=new Request('https://mmdbkk.com'+pathname+apiUrl.search,{method:req.method,
      headers:{origin:'https://mmdbkk.com','content-type':req.headers['content-type']||'application/json',...(req.headers.authorization?{authorization:req.headers.authorization}:{})},
      ...(req.method==='POST'||req.method==='PUT'?{body:bytes}:{})});
    const response=role==='customer'
      ?await handleMemberAppSessionApi(request,travelEnv,async()=>null)
      :await modelTravelWorker.fetch(new Request(modelRequest(pathname+apiUrl.search).url,{method:req.method,headers:{...Object.fromEntries(request.headers),cookie:req.headers['x-preview-model-cookie']||'mmd_model_session_v1='+new URL(modelRequest(pathname).url).searchParams.get('t')},...(['POST','PUT'].includes(req.method)?{body:bytes}:{})}),travelEnv,{});
    if(response.ok&&req.method==='POST'&&body.action==='commit'){
      const result=await response.clone().json();
      if(!result.duplicate){
        const snapshot=await projectTravel(travelEnv,record,role),entry=snapshot.submissions.find(e=>e.id===body.id);
        messages.push({role:role==='customer'?'model':'customer',channel:'ข้อความใน '+(role==='customer'?'MODEL Console':'MY MMD')+' · จำลอง',text:entry.text+(entry.photos.length?'\n[ภาพจุดนัด '+entry.photos.length+' ภาพ · จำลอง]':'')});revision++;
      }
    }
    if(response.ok&&req.method==='POST'&&['save_meeting_details','save_transport'].includes(body.action))revision++;
    return response;
  }
  if(pathname==='/v1/customer/session/aftercare'){
    const result=await handleCustomerAftercare(new Request('https://events.preview/v1/customer/session/aftercare',{method:'POST',headers:{origin:'https://www.mmdbkk.com','content-type':'application/json'},body:JSON.stringify(body)}),env);
    if(result.ok){stepIndex=indexFor(body.action==='approve_completion'?'approved':body.rating<=2||body.issue_tags?.length?'hold':'reviewed');revision++;}
    return result;
  }
  if(pathname==='/v1/admin/jobs/travel')return ownerTravelResponse(new Request('https://mmdbkk.com'+pathname+apiUrl.search,{method:req.method}),env);
  if(pathname==='/v1/admin/jobs/notification-review'){
    return ownerWorker.fetch(new Request('https://mmdbkk.com'+pathname+apiUrl.search,{method:req.method,headers:{cookie:req.headers['x-preview-owner-cookie']||'preview-owner=synthetic',origin:'https://mmdbkk.com','content-type':'application/json'},...(req.method==='POST'?{body:JSON.stringify(body)}:{})}),env,{});
  }
  if(pathname==='/v1/admin/jobs/owner-actions'){
    const response=await ownerWorker.fetch(new Request('https://mmdbkk.com'+pathname,{method:req.method,headers:{cookie:req.headers['x-preview-owner-cookie']||'preview-owner=synthetic',origin:'https://mmdbkk.com','content-type':'application/json'},...(req.method==='POST'?{body:JSON.stringify(body)}:{})}),env,{});
    if(response.ok&&req.method==='POST'){stepIndex=indexFor(({clear_completion_review:'cleared',mark_payout_ready:'account',mark_payout_paid:'paid',hold_completion_review:'hold'})[body.action]);revision++;}
    return response;
  }
  return Response.json({ok:false,error:'preview_endpoint_not_enabled'},{status:404});
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1'),chunks=[];let size=0;
    for await(const part of req){size+=part.length;if(size>6*1024*1024)throw Error('preview_payload_too_large');chunks.push(part);}
    const bytes=Buffer.concat(chunks),body=bytes.length&&req.method!=='PUT'?JSON.parse(bytes.toString()):{};
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://cdn.prod.website-files.com https://s3.amazonaws.com; connect-src 'self'; frame-src 'self'; font-src 'self' data: https://cdn.prod.website-files.com https://fonts.gstatic.com; form-action 'self'");
    let response;
    if(url.pathname==='/__preview/payout-demo'){
      if(req.method!=='POST'||!['travel','arrived','payment','separated','review','pending','paid','missing','duplicate','hold'].includes(body.scenario))throw Error('invalid_payout_demo');
      setStep(0);
      const invoke=async(path,body)=>{
        const result=await api({method:'POST',headers:{}},body,path,Buffer.from(JSON.stringify(body)));
        if(!result.ok)throw Error('payout_demo_runtime_step_failed');
      };
      const stages=async()=>{
       for(const action of ['acknowledge_reconfirm','start_travel'])await invoke('/v1/model/session/action',{action,session_id:sid});
       if(body.scenario==='travel')return;
       await invoke('/v1/model/session/action',{action:'mark_arrived',session_id:sid});if(body.scenario==='arrived')return;
       await invoke('/v1/model/session/action',{action:'mark_met_customer',session_id:sid});if(body.scenario==='payment')return;
       if(!(await reviewFinalPayment()).ok)throw Error('payout_demo_payment_failed');
       for(const action of ['start_work','mark_work_finished','confirm_separated'])await invoke('/v1/model/session/action',{action,session_id:sid});
       if(body.scenario==='separated')return;
       await invoke('/v1/customer/session/aftercare',{t:'preview-only-not-a-token',action:'approve_completion',confirm_completed:true,idempotency_key:'payout-demo-complete'});
       await invoke('/v1/customer/session/aftercare',{t:'preview-only-not-a-token',action:'submit_review',rating:5,rating_scale:5,idempotency_key:'payout-demo-review'});
       if(body.scenario==='review')return;
       for(const action of ['clear_completion_review','mark_payout_ready'])await invoke('/v1/admin/jobs/owner-actions',{action,session_id:sid});
       if(body.scenario==='pending')return;
       await invoke('/v1/admin/jobs/owner-actions',{action:'mark_payout_paid',session_id:sid,transfer_ref:'SIMULATED-NO-REAL-TRANSFER'});
      };
      await stages();
      if(body.scenario==='missing')delete fixture.payouts[0].fields[F.payout.notes];
      if(body.scenario==='duplicate')fixture.payouts.push(structuredClone(fixture.payouts[0]));
      if(body.scenario==='hold')fixture.session.fields.payout_hold_reason='SYNTHETIC HOLD';
      response=json({ok:true,synthetic:true,scenario:body.scenario});
    }
    else if(url.pathname==='/payout-preview')response=new Response(fs.readFileSync(path.join(here,'payout-preview.html')),{headers:{'content-type':'text/html'}});
    else if(url.pathname==='/model-nightline-assets/tart-room.png'){
      response=new Response(fs.readFileSync(path.join(repo,'webflow/sigil/model/nightline/tart-room.png')),{headers:{'content-type':'image/png'}});
    }
    else if(url.pathname==='/__preview/fault'){
      if(req.method!=='POST')throw Error('preview_post_required');
      if(['arm-owner','arm-payout'].includes(body.action))armTelegramResponseLoss(body.action==='arm-owner'?'model_wrong_location_owner':'model_payout_instructions');
      else if(body.action==='change-account'){fixture.model.fields.payout_dest_ref='1111111111';revision++;}
      else if(body.action==='advance-day'){fixture.session.fields.job_date=new Date(Date.now()+7*3600000).toISOString().slice(0,10);stepIndex=indexFor('day');revision++;}
      else if(body.action==='reset'){setStep(0);}
      else if(body.action==='notice'){response=json(await runModelReconfirmSweep(env,{now:Date.parse(fixture.session.fields.reconfirm_required_at)+1000}));}
      else if(body.action==='review-payment'){const result=await reviewFinalPayment();if(!result.ok){response=result;}else{stepIndex=indexFor('payment');revision++;}}
      else if(body.action!=='proof')throw Error('invalid_preview_fault');
      const journals=[];for(const[key,item]of env.PRIVATE_MODEL_MEDIA.objects){if(!key.includes('/records/')&&!key.includes('/receipts/'))continue;const row=JSON.parse(item.value);journals.push({id:row.id,status:row.status,error:row.last_error,session_id:row.payload?.session_id,resolution:row.owner_review?.decision||null});}
      response ||=json({ok:true,state:fixture.session.fields.model_session_state,account_last4:fixture.model.fields.payout_dest_ref.slice(-4),attempts:retryDemo?.attempts||0,accepted:retryDemo?.delivered||0,journals});
    }
    else if(url.pathname==='/__preview/state')response=json({index:stepIndex,steps:steps.map(([id,label,state,time])=>({id,label,state,time})),state:fixture.session.fields.model_session_state,revision,messages,approved:Boolean(fixture.session.fields.customer_completed_at),last_error:lastPreviewError});
    else if(url.pathname==='/__preview/step'){
      if(Number(body.index)===indexFor('payment')&&fixture.session.fields.model_session_state==='met_customer'){
        const reviewed=await reviewFinalPayment();if(!reviewed.ok)response=reviewed;else{stepIndex=indexFor('payment');revision++;}
      }else if(Number(body.index)===0)setStep(0);
      else response=Response.json({ok:false,error:'runtime_transition_required'},{status:409});
      response ||=json({ok:true});
    }
    else if(url.pathname==='/__preview/retry-demo'){
      if(req.method!=='POST')response=Response.json({ok:false},{status:405});
      else{
        if(body.action!=='retry')throw Error('runtime_setup_required');
        if(body.action!=='retry'){
          if(!['owner','payout','hold','account','manual-owner','manual-payout'].includes(body.action))throw Error('invalid_demo');
          const owner=['owner','manual-owner'].includes(body.action);setStep(indexFor(owner?'travel':'cleared'));
          retryDemo={scenario:body.action,intent:owner?'model_wrong_location_owner':'model_payout_instructions',offline:true,attempts:0,delivered:0,clock:0,log:[]};
          if(body.action.startsWith('manual-')){retryDemo.offline=false;retryDemo.loseResponse=true;}
          if(owner){const report={current_place:'จุดจำลอง: ไปผิด Lobby อาคาร B',eta_minutes:18,transport_mode:'grab_taxi',report_id:crypto.randomUUID()};const payload={action:'report_wrong_location',session_id:sid,context_binding:await meetingBinding(env,fixture.session),report};const result=await api({method:'POST',headers:{}},payload,'/v1/model/session/action',Buffer.from(JSON.stringify(payload)));if(!result.ok)throw Error('demo_report_failed');}
          else{const ready=await applyOwnerJobAction(env,{session_id:sid,action:'mark_payout_ready'},{id:'preview-owner',role:'owner'});if(!ready.ok)throw Error('demo_payout_failed');stepIndex=indexFor('account');
            if(body.action==='hold'){await applyOwnerJobAction(env,{session_id:sid,action:'hold_completion_review',reason:'Synthetic HOLD before retry'},{id:'preview-owner',role:'owner'});retryDemo.log.push('ก่อน retry: บันทึก HOLD ผ่าน owner action จริง');}
            if(body.action==='account'){fixture.model.fields.payout_dest_ref='1111111111';retryDemo.log.push('ก่อน retry: เปลี่ยนบัญชีเฉพาะ fixture เป็นเลขจำลองใหม่');}
          }
          retryDemo.log.push('คิวค้าง: ยังไม่ยืนยันการส่งสำเร็จ');
        }else{
          if(!retryDemo)throw Error('choose_demo_first');retryDemo.offline=false;retryDemo.clock+=61000;
          retryDemo.result=await (retryDemo.intent==='model_wrong_location_owner'?drainOwnerTravelAlerts:drainOwnerPayoutInstructions)(env,Date.now()+retryDemo.clock);
          retryDemo.log.push('retry: '+JSON.stringify(retryDemo.result));
        }
        const journals=[];for(const [key,item]of env.PRIVATE_MODEL_MEDIA.objects){if(!key.includes('/records/')&&!key.includes('/receipts/'))continue;const row=JSON.parse(item.value);if(row.payload?.session_id===sid)journals.push({status:row.status,attempts:row.attempts,last_error:row.last_error||null});}
        revision++;response=json({ok:true,...retryDemo,offline:undefined,intent:undefined,journals});
      }
    }
    else if(url.pathname==='/__preview/api')response=await api(req,body,url.searchParams.get('path'),bytes);
    else if(url.pathname.endsWith('/session/travel/photo'))response=await api(req,body,url.pathname+url.search,bytes);
    else if(url.pathname==='/adapter.js')response=new Response(adapter,{headers:{'content-type':'text/javascript'}});
    else if(url.pathname==='/preview-only.css')response=new Response(fs.readFileSync(path.join(here,'preview-only.css')),{headers:{'content-type':'text/css'}});
    else if(url.pathname==='/sigil/model/console')response=new Response(await documentFor('model'),{headers:{'content-type':'text/html'}});
    else if(url.pathname==='/sigil/model/dashboard')response=new Response(await documentFor('model-home'),{headers:{'content-type':'text/html'}});
    else if(url.pathname==='/internal/admin/jobs/completion')response=new Response(await documentFor('owner'),{headers:{'content-type':'text/html'}});
    else if(url.pathname==='/aftercare')response=new Response(await documentFor('aftercare'),{headers:{'content-type':'text/html'}});
    else if(url.pathname==='/sigil/confirm/job-confirmation')response=new Response(await documentFor('customer'),{headers:{'content-type':'text/html'}});
    else if(url.pathname==='/mobile-preview')response=new Response(fs.readFileSync(path.join(here,'mobile-preview.html')),{headers:{'content-type':'text/html'}});
    else if(url.pathname==='/')response=new Response(fs.readFileSync(path.join(here,'index.html')),{headers:{'content-type':'text/html'}});
    else response=new Response('Local preview: destination not enabled',{status:404});
    res.statusCode=response.status;const type=response.headers.get('content-type')||'text/plain';res.setHeader('content-type',type.startsWith('text/')&&!type.includes('charset')?type+'; charset=utf-8':type);res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){lastPreviewError=error.code||error.message;res.statusCode=error.status||500;res.end(JSON.stringify({ok:false,error:lastPreviewError}));}
});
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||4189),'127.0.0.1',()=>console.log('Local runtime preview: http://127.0.0.1:'+server.address().port));
export {api,setStep,fixture,env,reviewFinalPayment,modelRequest,paymentsRequest,armTelegramResponseLoss,deliveryProof,runModelReconfirmSweep};
