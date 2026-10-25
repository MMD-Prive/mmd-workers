import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBlackCardMemberPayment } from './blackcard-member-payment.js';
import { handleUnifiedPaymentIntent, stablePaymentRef } from './unified-payment-proof.js';
import { parseStored } from './blackcard-companion-preference.js';
import { handleBlackCardPayment } from '../member-pages-worker/src/blackcard-payment.js';

const LINE='U1234567890abcdef1234567890abcdef';
const OTHER='Uabcdef1234567890abcdef1234567890';
const CLIENT='recCLIENT00000001';
const F={id:'fldLTq2kZbyRv22IA',ref:'fldojgjSQLaO0uQLX',note:'fldEcDkF7CH9VixWM'};
const clone=v=>JSON.parse(JSON.stringify(v));

export function fixture() {
  const db={clients:[],sessions:[],payments:[],proofs:[]},kv=new Map(),leases=new Map(),calls=[];
  const tableNames={clients:'tblVv58TCbwh5j1fS',sessions:'tblC98mKWbzmPuNzX',payments:'tblWGGJJOx5eBvBZJ',proofs:'tblfJfM4Sqag9zrLi'};
  const options={falseEvidence:false,failWrite:false,intents:0};
  const env={AUTH_SERVICE_MEMBER_TO_PAYMENTS:'test-member-service-secret',AIRTABLE_BASE_ID:'appTest',AIRTABLE_API_KEY:'test-airtable',PAYMENT_CONFIRMATION_SIGNING_SECRET:'test-confirmation-secret-only',
    PAY_SESSIONS_KV:{put:async(k,v)=>kv.set(k,v)},
    PAYMENT_SLIP_EVIDENCE:{
      async get(key){const item=leases.get(key);return item?{etag:item.etag,text:async()=>item.value}:null;},
      async put(key,value,{onlyIf}){const old=leases.get(key);if((onlyIf.etagDoesNotMatch==='*'&&old)||(onlyIf.etagMatches&&old?.etag!==onlyIf.etagMatches))return null;const etag=crypto.randomUUID();leases.set(key,{value,etag});return{etag};},
    },
    AIRTABLE_HTTP:{async fetch(request){
      const url=new URL(request.url);const [, ,table,id]=url.pathname.split('/').filter(Boolean);const kind=Object.keys(tableNames).find(k=>tableNames[k]===table);assert.ok(kind,'known Airtable table '+table);
      const data=request.method==='GET'?null:await request.json();calls.push({kind,method:request.method,data});
      if(request.method==='GET'){
        const filter=url.searchParams.get('filterByFormula')||'';
        let records=db[kind];
        if(kind==='clients')records=records.filter(r=>filter.includes(r.fields.line_user_id));
        if(kind==='sessions')records=records.filter(r=>filter.includes(r.fields[F.id]));
        if(kind==='payments'&&!filter.startsWith('OR('))records=records.filter(r=>filter.includes(r.fields['Payment Reference']));
        if(kind==='proofs')records=records.filter(r=>filter.includes(r.fields.payment_ref));
        return Response.json({records:clone(records)});
      }
      if(options.failWrite)return Response.json({error:'unavailable'},{status:503});
      if(id){const row=db[kind].find(r=>r.id===id);Object.assign(row.fields,data.fields);return Response.json(clone(row));}
      const fields=data.records[0].fields;
      let row={id:kind==='clients'?CLIENT:'recSESSION0000001',fields:clone(fields)};db[kind].push(row);return Response.json({records:[clone(row)]});
    }},
  };
  const adapters={
    intent:request=>handleUnifiedPaymentIntent(request,env,async req=>{const b=await req.json();options.intents++;const record={id:'recPAYMENT0000001',fields:{'Payment Reference':b.payment_ref,session_id:b.session_id,'Package Code':b.package_code,payment_stage:b.payment_stage,Amount:b.amount,'Payment Status':'Pending','Verification Status':'pending_review'}};db.payments.push(record);return Response.json({ok:true,payment_ref:b.payment_ref,session_id:b.session_id,payment_stage:b.payment_stage});}),
    instructions:async request=>{const b=await request.json();assert.ok(b.t.includes('.'));return Response.json({ok:true,available:true,amount_due_thb:35000,instructions:{promptpay:{enabled:true,qr_url:'https://example.test/qr.png'},bank_transfer:{enabled:true,account_number:'test-account'}}});},
    evidence:async request=>{const f=await request.formData();assert.ok(f.get('t').includes('.'));assert.equal(f.get('source_page'),'member_payments');if(options.falseEvidence)return Response.json({ok:true});const ref=db.payments[0].fields['Payment Reference'];db.proofs.push({id:'recPROOF00000001',fields:{payment_ref:ref,status:'submitted'}});return Response.json({ok:true,evidence_submitted:true,proof_id:'proof_test',unified_payment_flow:'v1'});},
  };
  async function call(action,extra={},line=LINE){let body,headers={'x-internal-token':env.AUTH_SERVICE_MEMBER_TO_PAYMENTS};if(action==='evidence'){body=new FormData();body.set('file',new Blob(['fake-slip'],{type:'image/png'}),'test.png');body.set('action',action);body.set('line_user_id',line);}else{headers['content-type']='application/json';body=JSON.stringify({line_user_id:line,action,...extra});}const response=await handleBlackCardMemberPayment(new Request('https://payments.internal/v1/internal/blackcard/member',{method:'POST',headers,body}),env,adapters);return {status:response.status,body:await response.json()};}
  return {env,db,call,options,adapters,calls};
}

test('new customer creates canonical client, one order, and repeated start resumes the same order',async()=>{
  const f=fixture();assert.equal((await f.call('read')).body.status,'not_started');assert.equal(f.db.clients.length,0);
  const first=await f.call('start');assert.equal(first.status,200);assert.equal(first.body.status,'awaiting_payment');assert.equal(first.body.entitlement_granted,false);
  const retry=await f.call('start');assert.equal(retry.body.payment_ref,first.body.payment_ref);assert.equal(f.options.intents,1);assert.equal(f.db.clients.length,1);assert.equal(f.db.sessions.length,1);assert.equal(f.db.payments.length,1);
  assert.equal(f.db.payments[0].fields['Package Code'],'blackcard','use the existing production select, not a new schema choice');
});
test('concurrent starts create one order and return resumable conflict for competing request',async()=>{
  const f=fixture();const results=await Promise.all([f.call('start'),f.call('start')]);assert.ok(results.some(r=>r.status===200));assert.ok(results.some(r=>r.status===409));assert.equal(f.options.intents,1);assert.equal((await f.call('start')).status,200);
});
test('evidence permits choice without activating membership; retry and refreshed read preserve choice',async()=>{
  const f=fixture();await f.call('start');assert.equal((await f.call('select',{companion_id:'hito'})).status,409);
  assert.equal((await f.call('evidence')).body.can_choose_companion,true);
  const saved=await f.call('select',{companion_id:'hito'});assert.equal(saved.body.companion.id,'hito');assert.equal(saved.body.entitlement_granted,false);assert.equal(saved.body.preference_status,'selected_pending_verification');
  await f.call('select',{companion_id:'hito'});assert.equal((await f.call('read')).body.companion.id,'hito');
  const note=f.db.sessions[0].fields[F.note];assert.equal(note.split('[MMD BLACK CARD COMPANION PREFERENCE V1]').length,2);assert.equal(parseStored(note).companion_id,'hito');
  await f.call('select',{companion_id:'hiro'});assert.equal(parseStored(f.db.sessions[0].fields[F.note]).companion_id,'hiro');
  await f.call('evidence');assert.equal(f.db.proofs.length,1);
});
test('HTTP 200 without evidence schema does not report success or unlock companion',async()=>{
  const f=fixture();await f.call('start');f.options.falseEvidence=true;assert.equal((await f.call('evidence')).status,503);assert.equal((await f.call('read')).body.can_choose_companion,false);
});
test('selection failure is visible and retry saves only after storage recovers',async()=>{
  const f=fixture();await f.call('start');await f.call('evidence');f.options.failWrite=true;assert.equal((await f.call('select',{companion_id:'hima'})).status,503);assert.equal((await f.call('read')).body.companion,null);f.options.failWrite=false;assert.equal((await f.call('select',{companion_id:'hima'})).body.companion.id,'hima');
});
test('payment and verification must both be official; no resubmission or new payment after verify',async()=>{
  const f=fixture();await f.call('start');f.db.payments[0].fields['Payment Status']='Paid';assert.equal((await f.call('read')).body.status,'awaiting_payment');f.db.payments[0].fields['Verification Status']='verified';const read=await f.call('read');assert.equal(read.body.status,'verified');assert.equal(read.body.entitlement_granted,false);assert.equal((await f.call('instructions')).body.instructions,undefined);await f.call('start');assert.equal(f.options.intents,1);
});
test('different LINE identity cannot read or select another customer order',async()=>{
  const f=fixture();await f.call('start');const result=await f.call('read',{},OTHER);assert.equal(result.body.status,'not_started');assert.equal(result.body.payment_ref,undefined);assert.equal(result.body.companion,null);
  f.db.clients.push({id:'recOTHER000000001',fields:{line_user_id:OTHER}});assert.equal((await f.call('select',{companion_id:'hito'},OTHER)).body.status,'not_started');
});
test('forged service credential, browser price/token/identity override and invalid companion fail closed',async()=>{
  const f=fixture();const response=await handleBlackCardMemberPayment(new Request('https://payments.internal/v1/internal/blackcard/member',{method:'POST',headers:{'x-internal-token':'forged'},body:'{}'}),f.env,f.adapters);assert.equal(response.status,401);
  assert.equal((await f.call('start',{amount:1})).status,400);assert.equal((await f.call('start',{t:'fake.booking.token'})).status,400);assert.equal((await f.call('select',{companion_id:'travel-model'})).status,400);assert.equal(f.options.intents,0);
});
test('existing backend issued Black Card reference is adopted instead of creating a second order',async()=>{
  const f=fixture();f.db.clients.push({id:CLIENT,fields:{line_user_id:LINE}});f.db.sessions.push({id:'recSESSION0000001',fields:{[F.id]:'existing_blackcard',[F.ref]:'existing_ref',[F.note]:'Existing Black Card',Client:[CLIENT]}});f.db.payments.push({id:'recPAYMENT0000001',fields:{'Payment Reference':'existing_ref',session_id:'existing_blackcard','Package Code':'black_card',payment_stage:'membership',Amount:35000,Client:[CLIENT]}});
  const result=await f.call('start');assert.equal(result.status,200);assert.equal(result.body.payment_ref,'existing_ref');assert.equal(f.options.intents,0);
  f.db.payments[0].fields.payment_stage='deposit';assert.equal((await f.call('read')).status,409);
});
test('owner mismatch or wrong product amount never enables payment/selection',async()=>{
  const f=fixture();await f.call('start');f.db.sessions[0].fields.Client=['recOTHER000000001'];assert.equal((await f.call('read')).status,403);f.db.sessions[0].fields.Client=[CLIENT];f.db.payments[0].fields.Amount=1;assert.equal((await f.call('read')).status,409);
});
test('signed-in BFF uses verified identity only and supports new sessions/devices',async()=>{
  const f=fixture();f.env.PAYMENTS_WORKER={fetch:req=>handleBlackCardMemberPayment(req,f.env,f.adapters)};
  const request=(suffix,body)=>new Request('https://mmdbkk.com/member/api/liff/blackcard/'+suffix,{method:body?'POST':'GET',headers:{origin:'https://mmdbkk.com','content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  const session=async()=>({lineUserId:LINE});assert.equal((await handleBlackCardPayment(request('purchase',{}),f.env,session)).status,200);
  const again=await handleBlackCardPayment(request('state'),f.env,async()=>({lineUserId:LINE}));assert.equal((await again.json()).payment_ref,f.db.payments[0].fields['Payment Reference']);
  assert.equal((await handleBlackCardPayment(request('purchase',{line_user_id:OTHER}),f.env,session)).status,400);assert.equal((await handleBlackCardPayment(request('purchase',{}),f.env,async()=>null)).status,401);
  assert.equal((await handleBlackCardPayment(new Request('https://mmdbkk.com/member/api/liff/blackcard/state?t=fake'),f.env,session)).status,403);
});
