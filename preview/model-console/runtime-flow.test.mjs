import test from 'node:test';
import assert from 'node:assert/strict';
import * as runtime from './server.mjs';
import {BALANCE_FIELDS as B} from '../../payments-worker/verified-session-balance.js';
import {drainOwnerPayoutInstructions} from '../../admin-worker/src/model-payout-destination.js';
import {meetingBinding} from '../../shared/model-travel-store.mjs';
import {jpeg} from '../../shared/model-travel-fixtures.mjs';

const sid='PREVIEW-SESSION-001';
async function call(path,body={},method='POST',headers={}){
  const response=await runtime.api({method,headers},body,path,Buffer.from(JSON.stringify(body)));
  return {status:response.status,data:await response.json()};
}
const model=action=>call('/v1/model/session/action',{action,session_id:sid,t:'preview-only-not-a-token'});
const owner=action=>call('/v1/admin/jobs/owner-actions',{action,session_id:sid});
async function separated(){
  runtime.setStep(0);
  const notice=await runtime.runModelReconfirmSweep(runtime.env,{now:Date.parse(runtime.fixture.session.fields.reconfirm_required_at)+1000});
  assert.equal(notice.notified,1);
  assert.equal((await model('acknowledge_reconfirm')).status,200);
  assert.ok(runtime.fixture.session.fields.reconfirm_acknowledged_at);
  const current=(await call('/v1/model/session/current',{},'GET')).data.session;
  assert.equal(current.normalized_state,'confirmed');assert.equal(current.customer_payment.status,'deposit_paid');
  assert.equal((await model('start_travel')).status,200);
  runtime.armTelegramResponseLoss('model_wrong_location_owner');
  const report=await call('/v1/model/session/action',{action:'report_wrong_location',session_id:sid,context_binding:await meetingBinding(runtime.env,runtime.fixture.session),report:{current_place:'Synthetic wrong lobby',eta_minutes:18,transport_mode:'grab_taxi',report_id:crypto.randomUUID()}});
  assert.equal(report.status,200);assert.match(runtime.fixture.job.fields.events_json,/18/);
  const alert=(await call('/v1/admin/jobs/notification-review?lane=model-travel-owner',{},'GET')).data.items[0];
  assert.equal((await resolve(alert,'received')).status,200);assert.equal(runtime.deliveryProof().calls,1);
  assert.equal((await call('/v1/model/session/action',{action:'send_eta',session_id:sid,eta_minutes:20})).status,200);
  const sha256=Buffer.from(await crypto.subtle.digest('SHA-256',jpeg)).toString('hex');
  for(const role of ['model','customer']){
   const path=role==='model'?'/v1/model/session/travel':'/api/member/app/session/travel';
   const headers=role==='customer'?{authorization:'Bearer preview-only-not-a-token'}:{};
   const photos=role==='model'?[{type:'image/jpeg',size:jpeg.length,sha256}]:[];
   const draft=await call(path,{action:'prepare',session_id:sid,key:'continuous-'+role,text:role==='model'?'At original lobby, photo attached':'Confirmed, please wait at original lobby',photos},'POST',headers);
   assert.equal(draft.status,200);
   if(photos.length){
    const uploaded=await runtime.api({method:'PUT',headers:{'content-type':'image/jpeg'}},{},path+'?session_id='+sid+'&id='+draft.data.id+'&index=0',jpeg);
    assert.equal(uploaded.status,200);
   }
   for(let device=0;device<2;device++)assert.equal((await call(path,{action:'commit',session_id:sid,id:draft.data.id},'POST',headers)).status,200);
  }
  const conversation=(await call('/v1/model/session/travel?session_id='+sid,{},'GET')).data;
  assert.equal(conversation.submissions.length,2);assert.equal(conversation.submissions.filter(x=>x.photos.length).length,1);
  assert.equal((await call('/v1/model/session/travel?session_id=OTHER',{},'GET')).status,404);
  for(const action of ['mark_arrived','mark_met_customer'])assert.equal((await model(action)).status,200,action);
  assert.equal(runtime.fixture.payments.filter(r=>r.fields[B.stage]==='final').length,1);
  assert.equal(runtime.fixture.payments.find(r=>r.fields[B.stage]==='final').fields[B.verification],'pending_review');
  assert.equal((await model('start_work')).status,409);
  const reviewed=await runtime.reviewFinalPayment();assert.equal(reviewed.status,200,await reviewed.clone().text());
  assert.equal(runtime.fixture.session.fields.model_session_state,'final_payment_confirmed');
  const payment=runtime.fixture.payments.find(r=>r.fields[B.stage]==='final');
  payment.fields[B.verification]='pending_review';
  assert.equal((await model('start_work')).status,403);
  assert.equal(runtime.fixture.session.fields.model_session_state,'final_payment_confirmed');
  payment.fields[B.verification]='verified';
  for(const action of ['start_work','mark_work_finished','confirm_separated'])assert.equal((await model(action)).status,200,action);
  assert.equal(runtime.fixture.session.fields.model_session_state,'separated');
}
async function ready(){
  await separated();
  const denied=await call('/v1/customer/session/aftercare',{t:'invalid',action:'approve_completion',confirm_completed:true});
  assert.notEqual(denied.status,200);
  const approved=await call('/v1/customer/session/aftercare',{t:'preview-only-not-a-token',action:'approve_completion',confirm_completed:true,idempotency_key:'synthetic-completion'});
  assert.equal(approved.status,201,JSON.stringify(approved.data));
  assert.equal((await call('/v1/customer/session/aftercare',{t:'preview-only-not-a-token',action:'submit_review',rating:5,rating_scale:5,private_mmd_message:'Synthetic real-runtime flow review',idempotency_key:'synthetic-review'})).status,201);
  assert.equal((await owner('clear_completion_review')).status,200);
  runtime.armTelegramResponseLoss('model_payout_instructions');
  const result=await owner('mark_payout_ready');assert.equal(result.data.owner_notification.status,'manual_review');
  const listing=await call('/v1/admin/jobs/notification-review',{},'GET');
  return listing.data.items[0];
}
async function resolve(item,decision='not_received'){
  return call('/v1/admin/jobs/notification-review',{lane:item.lane,id:item.id,snapshot:item.snapshot,decision,note:'Synthetic owner inspected message history'});
}
test('real handlers: lifecycle, final activation/review/live gate, customer approval/review, owner manual resend and close',async()=>{
  const item=await ready();assert.equal(item.can_resend,true);
  assert.equal((await resolve(item)).data.delivered,true);
  assert.equal((await resolve(item)).status,409);
  await drainOwnerPayoutInstructions(runtime.env,Date.now()+360000);
  assert.equal(runtime.deliveryProof().calls,2);
  const closed=await call('/v1/admin/jobs/owner-actions',{action:'mark_payout_paid',session_id:sid,transfer_ref:'SIMULATED-NO-MONEY-TRANSFER'});
  assert.equal(closed.data.state,'closed');
  const snapshot=JSON.stringify(runtime.fixture.payouts);
  for(let i=0;i<2;i++){
   const read=await call('/v1/model/session/current',{},'GET');assert.equal(read.status,200);
   assert.equal(read.data.session.payout.status,'paid');assert.equal(read.data.session.payout.verified,true);
   assert.equal(read.data.session.payout.amount_thb,5000);
   assert.equal(read.data.session.customer_payment.status,'fully_paid');
   assert.doesNotMatch(JSON.stringify(read.data.session.payout),/SIMULATED|notes|slip|bank|owner_transfer_ref/);
  }
  assert.equal(JSON.stringify(runtime.fixture.payouts),snapshot);
});
test('real owner manual-review handler records received without another send',async()=>{
  const item=await ready();assert.equal((await resolve(item,'received')).status,200);
  await drainOwnerPayoutInstructions(runtime.env,Date.now()+360000);assert.equal(runtime.deliveryProof().calls,1);
});
for(const change of ['hold','account'])test(`real runtime manual-review rejects ${change} after screen opened`,async()=>{
  const item=await ready();
  if(change==='hold')assert.equal((await call('/v1/admin/jobs/owner-actions',{action:'hold_completion_review',session_id:sid,reason:'Synthetic dispute HOLD'})).status,200);
  else runtime.fixture.model.fields.payout_dest_ref='1111111111';
  assert.equal((await resolve(item)).status,409);
  assert.equal(runtime.deliveryProof().calls,1);
});

test('real signed chat, Events ETA and owner wrong-location manual review share the same Session',async()=>{
  runtime.setStep(0);assert.equal((await model('start_travel')).status,200);
  runtime.armTelegramResponseLoss('model_wrong_location_owner');
  const report=await call('/v1/model/session/action',{action:'report_wrong_location',session_id:sid,context_binding:await meetingBinding(runtime.env,runtime.fixture.session),report:{current_place:'Synthetic wrong lobby',eta_minutes:18,transport_mode:'grab_taxi',report_id:crypto.randomUUID()}});
  assert.equal(report.status,200);
  assert.match(runtime.fixture.job.fields.events_json,/18/);
  const denied=await call('/v1/model/session/travel?session_id='+sid,{},'GET',{'x-preview-model-cookie':'mmd_model_session_v1=invalid'});
  assert.equal(denied.status,401);
  for(const role of ['model','customer']){
    const path=role==='model'?'/v1/model/session/travel':'/api/member/app/session/travel';
    const headers=role==='customer'?{authorization:'Bearer preview-only-not-a-token'}:{};
    const prepared=await call(path,{action:'prepare',session_id:sid,key:'synthetic-'+role+'-chat',text:'Confirm original lobby · '+role,photos:[]},'POST',headers);
    assert.equal(prepared.status,200,JSON.stringify(prepared.data));
    assert.equal((await call(path,{action:'commit',session_id:sid,id:prepared.data.id},'POST',headers)).status,200);
    const timeline=await call(path+'?session_id='+sid,{},'GET',headers);assert.equal(timeline.status,200);
  }
  const listing=await call('/v1/admin/jobs/notification-review?lane=model-travel-owner',{},'GET');
  assert.equal((await resolve(listing.data.items[0],'received')).status,200);
  assert.equal(runtime.deliveryProof().calls,1);
});

test('real Payments reviewed-proof rejects mismatched evidence without verifying or advancing lifecycle',async()=>{
  runtime.setStep(0);
  for(const action of ['start_travel','mark_arrived','mark_met_customer'])assert.equal((await model(action)).status,200);
  const payment=runtime.fixture.payments.find(r=>r.fields[B.stage]==='final');
  runtime.fixture.proofs=[{id:'recSyntheticProof',fields:{proof_id:'mismatched-proof',payment_ref:payment.fields[B.ref],amount_thb:1000,status:'pending'}}];
  const response=await runtime.paymentsRequest(new Request('https://payments-worker.internal/v1/internal/payments/reviewed-proof',{method:'POST',headers:{'content-type':'application/json','x-internal-token':runtime.env.AUTH_SERVICE_ADMIN_TO_PAYMENTS},body:JSON.stringify({source:'payment_review_console',decision:'approved',proof_id:'mismatched-proof',payment_ref:payment.fields[B.ref],session_id:sid,payment_stage:'final',amount_thb:6000,review_reason:'Synthetic mismatched evidence test'})}));
  assert.equal(response.status,409);assert.equal((await response.json()).error,'payment_proof_amount_mismatch');
  assert.equal(payment.fields[B.verification],'pending_review');
  assert.equal(runtime.fixture.session.fields.model_session_state,'met_customer');
});
