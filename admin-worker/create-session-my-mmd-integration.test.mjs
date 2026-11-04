import test from 'node:test';
import assert from 'node:assert/strict';
import admin from './src/index.js';
import payments from '../payments-worker/index.slip-evidence-file-forward.js';
import {handleCanonicalLinkedJobCreate} from './src/create-session-canonical-link-runtime.js';
import {handleConfirmationAck} from '../payments-worker/confirmation-ack.js';
import {handleConfirmationReissue} from '../payments-worker/confirmation-link-reissue.js';
import {confirmationRevision} from '../shared/confirmation-revision.mjs';
import {handleMemberAppSessionApi} from '../member-pages-worker/src/member-app-session.js';

async function simulateBothParties({ canonicalLine = 'U11111111111111111111111111111111' } = {}){
 const CLIENT='recClient00000001',MODEL='recMekFixture0001',kv=new Map(),audit=[];
 const store={Clients:[{id:CLIENT,fields:{'Client Name':'Customer · SIMULATION',line_user_id:canonicalLine}}],Models:[{id:MODEL,fields:{working_name:'Mek',status:'active',can_work_public:true}}],Sessions:[],Payments:[],Jobs:[]};
 const aliases={Sessions:{fldLTq2kZbyRv22IA:'session_id',fldojgjSQLaO0uQLX:'payment_ref',fldTY5lE6m0kQf72n:'Payment Status'},Payments:{fldOO6SY49iDw8VBZ:'payment_ref',fld2wdhBvc8xrV6y5:'session_id',fldEJ1hmm7KwWuI6q:'Payment Status',fldJ7a0Ube9F0bmRy:'Verification Status',fldrr9g8ZZjqAbdKQ:'payment_stage'}};
 const assignFields=(row,patch,table)=>{Object.assign(row.fields,patch);if(table==='Payments'&&patch['Payment Reference'])row.fields.payment_ref=patch['Payment Reference'];for(const [id,name] of Object.entries(aliases[table]||{})){if(id in patch)row.fields[name]=patch[id];if(name in patch||name in row.fields)row.fields[id]=row.fields[name];}};
 const native=globalThis.fetch;
 const fetchLocal=async(input,init={})=>{
  const r=input instanceof Request?input:new Request(input,init),u=new URL(r.url);
  assert.equal(u.hostname,'api.airtable.com','External transmissions are blocked');
  const [,base,table,id]=u.pathname.split('/').filter(Boolean),rows=store[decodeURIComponent(table)]||[];
  audit.push({table,method:r.method});
  if(r.method==='GET'){
   if(id){const row=rows.find(x=>x.id===id);return Response.json(row||{error:'NOT_FOUND'},{status:row?200:404});}
   const formula=u.searchParams.get('filterByFormula')||'';
   const eq=[...formula.matchAll(/\{([^}]+)\}\s*=\s*['"]([^'"]+)['"]/g)];
   const filtered=eq.length?rows.filter(row=>eq.some(([,field,value])=>String(row.fields[field])===value)):rows;
   return Response.json({records:filtered});
  }
  const body=await r.json();
  if(r.method==='POST'){assert.ok(store[table],'Unknown table write blocked');const made=(body.records||[body]).map(item=>{const row={id:'recSim'+table+String(rows.length).padStart(8,'0'),fields:{},createdTime:new Date().toISOString()};assignFields(row,item.fields,table);rows.push(row);return row;});return Response.json(body.records?{records:made}:made[0]);}
  if(r.method==='PATCH'){const row=rows.find(x=>x.id===id);assert.ok(row,'Unknown record patch blocked');assignFields(row,body.fields,table);return Response.json(row);}
  throw Error('Unexpected method');
 };
 const env={INTERNAL_TOKEN:'LOCAL-ONLY-ADMIN-TEST',AUTH_SERVICE_ADMIN_TO_PAYMENTS:'LOCAL-ONLY-SERVICE-TEST',PAYMENT_CONFIRMATION_SIGNING_SECRET:'LOCAL-ONLY-CONFIRMATION-TEST-SECRET',CONFIRM_KEY:'LOCAL-ONLY-CONFIRMATION-TEST-SECRET',AIRTABLE_API_KEY:'local-fixture',AIRTABLE_BASE_ID:'local-fixture',AIRTABLE_TABLE_CLIENTS_ID:'Clients',AIRTABLE_TABLE_MODELS:'Models',AIRTABLE_TABLE_SESSIONS:'Sessions',AIRTABLE_TABLE_PAYMENTS:'Payments',AIRTABLE_TABLE_JOBS:'Jobs',ALLOWED_ORIGINS:'https://mmdbkk.com',WEB_BASE_URL:'https://mmdbkk.com',PAY_SESSIONS_KV:{put:async(k,v)=>kv.set(k,v),get:async k=>kv.get(k)||null},AIRTABLE_HTTP:{fetch:fetchLocal},AT_SESSIONS__PAYMENT_REF:'payment_ref',AT_SESSIONS__CUSTOMER_ACK_AT:'customer_ack_at',AT_SESSIONS__MODEL_ACK_AT:'model_ack_at',AT_SESSIONS__SESSION_STATUS:'Session Status',AT_SESSIONS__MODEL_SESSION_STATE:'model_session_state',AT_SESSIONS__MODEL_SESSION_STATE_UPDATED_AT:'model_session_state_updated_at'};
 env.PAYMENTS_WORKER={fetch:r=>payments.fetch(r,env,{waitUntil(){}})};
 globalThis.fetch=fetchLocal;
 try{
  const payload={client_name:'Customer · SIMULATION',model_name:'Mek',job_type:'public',job_visibility:'public',job_date:'2099-01-01',start_time:'18:30',end_time:'20:00',location_name:'Bangkok · SIMULATION ONLY',amount_thb:10000,service_amount_thb:10000,payment_type:'deposit',client_lineage:{client_id:CLIENT,line_user_id:'U11111111111111111111111111111111',lineage_source:'line_ofc'},line_identity:{line_user_id:'U11111111111111111111111111111111'},model:{model_id:MODEL,model_name:'Mek',source:'airtable_models'},note:'LOCAL SIMULATION ONLY — no real customer, model, price or booking'};
  const req=new Request('https://mmdbkk.com/v1/admin/job/create',{method:'POST',headers:{authorization:'Bearer '+env.INTERNAL_TOKEN,'content-type':'application/json'},body:JSON.stringify(payload)});
  const response=await handleCanonicalLinkedJobCreate(req,env,{},admin),created=await response.json();
  assert.equal(response.status,200,JSON.stringify({ok:created.ok,error:created.error,linkage:created.linkage}));
  assert.equal(store.Sessions.length,1);assert.equal(store.Jobs.length,1,JSON.stringify({linkage:created.linkage,audit}));
  const session=store.Sessions[0];
  const reissue=()=>handleConfirmationReissue(new Request('https://sigil.mmdbkk.com/v1/internal/confirm/reissue',{method:'POST',headers:{'x-internal-token':env.AUTH_SERVICE_ADMIN_TO_PAYMENTS,'content-type':'application/json'},body:JSON.stringify({session_id:created.session_id})}),env);
  assert.equal((await reissue()).status,409,'Confirmation release must wait for verified payment');
  // Explicitly simulated payment-review evidence in local storage only, never a production payment action.
  assignFields(session,{'Payment Status':'paid'},'Sessions');assignFields(store.Payments[0],{'Payment Status':'paid','Verification Status':'verified'},'Payments');
  const released=await reissue();assert.equal(released.status,200,JSON.stringify(await released.clone().json()));
  const acknowledgements=[];
  for(const role of ['customer','model']){
   const t=new URL(session.fields[role==='customer'?'fldi9ZdoiUXzSv1rI':'fld0mFma9J9yfEaKb']).searchParams.get('t');
   const revision=(await confirmationRevision(env,session,created.session_id)).confirmation_revision;
   const ack=()=>handleConfirmationAck(new Request('https://mmdbkk.com/v1/confirm/ack',{method:'POST',headers:{origin:'https://mmdbkk.com','content-type':'application/json'},body:JSON.stringify({t,expected_role:role,confirmation_revision:revision})}),env);
   const first=await ack(),firstBody=await first.json();assert.equal(first.status,200,JSON.stringify(firstBody));
   const count=audit.filter(x=>x.method==='PATCH').length;
   const repeated=await ack();assert.equal(repeated.status,200);assert.equal(audit.filter(x=>x.method==='PATCH').length,count);
   acknowledgements.push({role,status:first.status,repeated:'idempotent'});
  }
  assert.ok(session.fields.customer_ack_at);assert.ok(session.fields.model_ack_at);
  assert.equal(session.fields['Payment Status'],'paid','ACK preserves the simulated approved payment');
  const memberResponse=await handleMemberAppSessionApi(new Request('https://mmdbkk.com/api/member/app/session/current'),env,async()=>({lineUserId:'U11111111111111111111111111111111',memberId:'simulated_jo_member'}));
  const member=memberResponse.status===204?null:await memberResponse.json();
  const other=await handleMemberAppSessionApi(new Request('https://mmdbkk.com/api/member/app/session/current?session_id='+encodeURIComponent(created.session_id)),env,async()=>({lineUserId:'U22222222222222222222222222222222',memberId:'other_member'}));
  assert.equal(other.status,404,'Another customer must not read the Session');
  return {mode:'LOCAL ONLY',created:{sessionCount:store.Sessions.length,jobCount:store.Jobs.length,linkage:created.linkage?.status},acknowledgements,paymentStatus:session.fields['Payment Status'],paymentEvidence:'LOCAL FIXTURE ONLY — confirmation release denied before simulated review',memberStatus:memberResponse.status,otherAccountStatus:other.status,member,sessionFieldNames:Object.keys(session.fields),externalTransmissions:0,realWrites:0};
 }finally{globalThis.fetch=native;}
}


test('canonical Create Job → verified-payment fixture → customer/model ACK → owned MY MMD Session', async () => {
  const result = await simulateBothParties();
  assert.equal(result.created.sessionCount, 1);
  assert.equal(result.created.jobCount, 1);
  assert.equal(result.created.linkage, 'linked');
  assert.equal(result.memberStatus, 200);
  assert.equal(result.member.model.displayName, 'Mek');
  assert.equal(result.member.lifecycle, 'confirmed');
  assert.ok(result.member.acknowledgement.customerAckAt);
  assert.equal(result.member.acknowledgement.modelAcknowledged, true);
  assert.equal(result.member.missionReady, true);
  assert.equal(result.otherAccountStatus, 404);
  assert.equal(result.acknowledgements.length, 2);
  assert.ok(result.acknowledgements.every(item => item.status === 200 && item.repeated === 'idempotent'));
  assert.equal(result.realWrites, 0);
  assert.equal(result.externalTransmissions, 0);
});

test('missing canonical Client LINE cannot expose the created Session using a request identity hint', async () => {
  const result = await simulateBothParties({canonicalLine: ''});
  assert.equal(result.created.sessionCount, 1);
  assert.equal(result.created.jobCount, 1);
  assert.equal(result.created.linkage, 'linked');
  assert.equal(result.acknowledgements.length, 2);
  assert.equal(result.sessionFieldNames.includes('line_user_id'), false);
  assert.equal(result.memberStatus, 204);
  assert.equal(result.member, null);
  assert.equal(result.otherAccountStatus, 404);
  assert.equal(result.realWrites, 0);
  assert.equal(result.externalTransmissions, 0);
});
