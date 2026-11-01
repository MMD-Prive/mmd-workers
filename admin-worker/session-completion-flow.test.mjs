import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOwnerJobAction, OWNER_OPS_FIELDS as F } from './src/job-orchestrator-owner-ops-runtime.js';
import { deliverPayoutJournal, readVerifiedPayoutDestination, sendOwnerPayoutInstructions } from './src/model-payout-destination.js';
import { memoryR2 } from '../shared/test/payment-memory-r2.mjs';
import { withSessionCompletionLock } from '../shared/session-completion.mjs';
import { augmentDashboardPayload } from './src/job-orchestrator-owner-ops-runtime.js';
import {drainOwnerPayoutInstructions} from './src/model-payout-destination.js';
import {listNotificationReviews,resolveNotificationReview} from './src/notification-manual-review.js';

function setup(t) {
  const at='2026-10-30T12:00:00Z', sid='fixture-session';
  const session={id:'recSession',fields:{[F.session.sessionId]:sid,[F.session.state]:'under_review',
    [F.session.modelPayout]:5000,[F.session.completion]:'pending_review',fldrXQAyOMPCvbOaY:['recModel'],
    fldj3m3CxELpYZO4f:at,fldflz9XwR9vAQIBZ:JSON.stringify({schema:'mmd_customer_completion_v1',session_id:sid,approved_at:at})}};
  const model={id:'recModel',fields:{payout_dest_type:'bank_account',payout_dest_bank:'Fixture Bank',
    payout_dest_name:'Synthetic Model',payout_dest_ref:'0000000000',payout_dest_status:'verified',payout_dest_verified_by:'fixture-owner',payout_dest_verified_at:at}};
  const payments=[{id:'recPay',fields:{[F.payment.sessionId]:sid,[F.payment.verification]:'verified',[F.payment.stage]:'final'}}];
  const payouts=[],sent=[],writes=[];
  const tables={tblC98mKWbzmPuNzX:[session],tblWGGJJOx5eBvBZJ:payments,tblMvsl7qYozD05e5:payouts,tbltWzMBhWev4JR13:[]};
  const env={AIRTABLE_BASE_ID:'fixture',AIRTABLE_API_KEY:'fixture',PRIVATE_MODEL_MEDIA:memoryR2(),
    MODEL_RECONFIRM_OWNER_CHAT_ID:'12345',AUTH_SERVICE_STUDIO_TO_TELEGRAM:'fixture',TELEGRAM_INTERNAL_SEND_URL:'https://telegram.test/send'};
  t.mock.method(globalThis,'fetch',async(input,init={})=>{
    const req=input instanceof Request?input:new Request(input,init),u=new URL(req.url);
    if(u.hostname==='telegram.test'){sent.push(await req.json());return Response.json({telegram:{ok:true}});}
    assert.equal(u.hostname,'api.airtable.com');
    const [, , ,table,id]=u.pathname.split('/');
    if(table==='tblI4B0bI446vp9GX')return Response.json(model);
    if(req.method==='GET' && id){const r=structuredClone(tables[table].find(r=>r.id===id));if(table==='tblC98mKWbzmPuNzX' && !u.searchParams.has('returnFieldsByFieldId')){
      const f=r.fields;r.fields={session_id:f[F.session.sessionId],model_session_state:f[F.session.state],pay_model_thb:f[F.session.modelPayout],
        completion_review_status:f[F.session.completion],completion_reviewed_at:f[F.session.reviewedAt],payout_hold_reason:f[F.session.holdReason],
        'Canonical Model':f.fldrXQAyOMPCvbOaY,customer_completed_at:f.fldj3m3CxELpYZO4f,customer_aftercare_json:f.fldflz9XwR9vAQIBZ};}return Response.json(r);}
    if(req.method==='GET')return Response.json({records:tables[table]});
    const body=await req.json();writes.push({table,fields:body.fields});
    if(req.method==='POST'){const r={id:'recPayout',fields:body.fields};tables[table].push(r);return Response.json(r);}
    const r=tables[table].find(r=>r.id===id);Object.assign(r.fields,body.fields);return Response.json(r);
  });
  return {env,session,model,payments,payouts,sent,writes,tables,sid};
}
const actor={id:'fixture-owner',role:'owner'};

async function uncertainPayout(t){
  const h=setup(t),original=globalThis.fetch;h.accepted=0;h.loseResponse=true;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    if(new URL(input instanceof Request?input.url:input).hostname==='telegram.test'){
      h.accepted++;if(h.loseResponse)throw new Error('synthetic accepted; response lost');
    }
    return original(input,init);
  });
  await applyOwnerJobAction(h.env,{session_id:h.sid,action:'clear_completion_review'},actor);
  await applyOwnerJobAction(h.env,{session_id:h.sid,action:'mark_payout_ready'},actor);
  h.item=(await listNotificationReviews(h.env)).items[0];
  h.review=(decision='not_received',extra={})=>resolveNotificationReview(h.env,{lane:h.item.lane,id:h.item.id,snapshot:h.item.snapshot,decision,note:'Checked synthetic Telegram history',...extra},actor);
  return h;
}

test('manual received closes review without another Telegram send',async t=>{
  const h=await uncertainPayout(t);assert.equal(h.item.can_resend,true);
  assert.equal(JSON.stringify(h.item).includes('0000000000'),false);
  assert.equal((await h.review('received')).message_sent,false);
  await assert.rejects(h.review(),/review_already_resolved/);
  await drainOwnerPayoutInstructions(h.env,Date.now()+360000);assert.equal(h.accepted,1);
});

test('manual not-received authorizes one revalidated send and preserves uncertain receipt',async t=>{
  const h=await uncertainPayout(t);h.loseResponse=false;
  const writes=h.writes.length;
  const outcomes=await Promise.allSettled([h.review(),h.review()]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(h.accepted,2);assert.equal(h.writes.length,writes);
  await drainOwnerPayoutInstructions(h.env,Date.now()+360000);assert.equal(h.accepted,2);
  assert.equal((await listNotificationReviews(h.env)).items[0].resolution,'not_received');
});

test('manual resend resumes same authorization after child enqueue storage failure',async t=>{
  const h=await uncertainPayout(t);h.loseResponse=false;
  const bucket=h.env.PRIVATE_MODEL_MEDIA,put=bucket.put.bind(bucket);let fail=true;
  bucket.put=async(key,value,options)=>{
    if(fail&&key.includes('/records/')&&JSON.parse(value).attempts===0){fail=false;throw Error('synthetic storage interruption');}
    return put(key,value,options);
  };
  await assert.rejects(h.review(),/synthetic storage interruption/);assert.equal(h.accepted,1);
  const item=(await listNotificationReviews(h.env)).items[0];assert.equal(item.can_resend,true);
  assert.equal((await h.review()).delivered,true);assert.equal(h.accepted,2);
  await assert.rejects(h.review(),/review_already_resolved/);assert.equal(h.accepted,2);
});

for(const change of ['hold','account','recipient','duplicate','stale_snapshot'])test(`manual resend blocks changed ${change}`,async t=>{
  const h=await uncertainPayout(t);h.loseResponse=false;
  if(change==='hold')h.session.fields[F.session.holdReason]='synthetic hold';
  if(change==='account')h.model.fields.payout_dest_ref='1111111111';
  if(change==='recipient')h.env.MODEL_RECONFIRM_OWNER_CHAT_ID='67890';
  if(change==='duplicate')h.payouts.push({...structuredClone(h.payouts[0]),id:'recDuplicate'});
  await assert.rejects(h.review('not_received',change==='stale_snapshot'?{snapshot:'stale'}:{}));
  assert.equal(h.accepted,1);
  assert.equal((await listNotificationReviews(h.env)).items[0].resolution,null);
});

test('manual resend requires inspection evidence and owner identity',async t=>{
  const h=await uncertainPayout(t);
  await assert.rejects(h.review('not_received',{note:''}),/review_evidence_required/);
  await assert.rejects(resolveNotificationReview(h.env,{lane:h.item.lane,id:h.item.id,decision:'received',note:'synthetic evidence'},{id:'model',role:'model'}),/owner_admin_session_required/);
  assert.equal(h.accepted,1);
});

test('payout accepted with lost response never sends again on drain or owner replay',async t=>{
  const h=setup(t),original=globalThis.fetch;let accepted=0;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    if(new URL(input instanceof Request?input.url:input).hostname==='telegram.test'){accepted++;throw new Error('synthetic response lost after acceptance');}
    return original(input,init);
  });
  await applyOwnerJobAction(h.env,{session_id:h.sid,action:'clear_completion_review'},actor);
  const ready=await applyOwnerJobAction(h.env,{session_id:h.sid,action:'mark_payout_ready'},actor);
  assert.equal(ready.owner_notification.status,'manual_review');
  await drainOwnerPayoutInstructions(h.env,Date.now()+360000);
  await applyOwnerJobAction(h.env,{session_id:h.sid,action:'mark_payout_ready'},actor);
  assert.equal(accepted,1);
});

for (const duplicate of ['session','payout']) test(`queued payout rejects duplicate ${duplicate} before provider send`,async t=>{
  const h=setup(t),original=globalThis.fetch;let offline=true;
  t.mock.method(globalThis,'fetch',async(input,init)=>new URL(input instanceof Request?input.url:input).hostname==='telegram.test'&&offline?Response.json({telegram:{ok:false,error:{ok:false,error_code:429}}},{status:503}):original(input,init));
  await applyOwnerJobAction(h.env,{session_id:h.sid,action:'clear_completion_review'},actor);
  await applyOwnerJobAction(h.env,{session_id:h.sid,action:'mark_payout_ready'},actor);
  if(duplicate==='session')h.tables.tblC98mKWbzmPuNzX.push({...structuredClone(h.session),id:'recDuplicate'});
  else h.payouts.push({id:'recDuplicate',fields:{...h.payouts[0].fields,[F.payout.status]:'payout_paid'}});
  offline=false;const before=h.writes.length;
  const out=await drainOwnerPayoutInstructions(h.env,Date.now()+61000);
  assert.equal(out.manual_review,1);assert.equal(h.sent.length,0);assert.equal(h.writes.length,before);
});

test('old payout queue stays stopped after HOLD is cleared and only new authorization delivers',async t=>{
  const h=setup(t),original=globalThis.fetch;let offline=true;
  const fixedNow=Date.now();t.mock.method(Date,'now',()=>fixedNow);
  t.mock.method(globalThis,'fetch',async(input,init)=>new URL(input instanceof Request?input.url:input).hostname==='telegram.test'&&offline?Response.json({telegram:{ok:false,error:{ok:false,error_code:429}}},{status:503}):original(input,init));
  const run=(action,extra={})=>applyOwnerJobAction(h.env,{session_id:h.sid,action,...extra},actor);
  await run('clear_completion_review');await run('mark_payout_ready');
  const revision=h.session.fields[F.session.reviewedAt];
  await run('hold_completion_review',{reason:'synthetic hold'});
  await run('clear_completion_review',{reason:'synthetic resolved'});
  assert.notEqual(h.session.fields[F.session.reviewedAt],revision);
  await run('mark_payout_ready');offline=false;
  const before=h.writes.length,out=await drainOwnerPayoutInstructions(h.env,Date.now()+61000);
  assert.equal(out.manual_review,1);assert.equal(out.delivered,1);assert.equal(h.sent.length,1);assert.equal(h.writes.length,before);
  await drainOwnerPayoutInstructions(h.env,Date.now()+120000);assert.equal(h.sent.length,1);
});

test('legacy payout queue without review revision fails closed',async t=>{
  const h=setup(t);
  const out=await deliverPayoutJournal(h.env,{payload:{session_id:h.sid,record_id:h.session.id,amount:5000,owner_id:'12345',destination_digest:'synthetic'}});
  assert.equal(out.error,'payout_authorization_changed');assert.equal(out.retryable,false);
  assert.equal(h.sent.length,0);assert.equal(h.writes.length,0);
});

test('payout retry survives transport failure, rechecks live eligibility, and never resends after confirmed delivery',async t=>{
  const h=setup(t),original=globalThis.fetch;let offline=true;
  t.mock.method(globalThis,'fetch',async(input,init)=>{const url=new URL(input instanceof Request?input.url:input);if(url.hostname==='telegram.test'&&offline)return Response.json({telegram:{ok:false,error:{ok:false,error_code:429}}},{status:503});return original(input,init);});
  await applyOwnerJobAction(h.env,{session_id:h.sid,action:'clear_completion_review'},actor);
  const ready=await applyOwnerJobAction(h.env,{session_id:h.sid,action:'mark_payout_ready'},actor);assert.equal(ready.owner_notification.delivered,false);
  const before=h.writes.length;offline=false;
  const result=await drainOwnerPayoutInstructions(h.env,Date.now()+61000);assert.equal(result.delivered,1);assert.equal(h.sent.length,1);assert.equal(h.writes.length,before);
  await drainOwnerPayoutInstructions(h.env,Date.now()+120000);assert.equal(h.sent.length,1);
});

test('queued payout stops when the verified account or owner recipient changes',async t=>{
  const h=setup(t),original=globalThis.fetch;
  t.mock.method(globalThis,'fetch',async(input,init)=>new URL(input instanceof Request?input.url:input).hostname==='telegram.test'?Response.json({telegram:{ok:false,error:{ok:false,error_code:429}}},{status:503}):original(input,init));
  await applyOwnerJobAction(h.env,{session_id:h.sid,action:'clear_completion_review'},actor);
  await applyOwnerJobAction(h.env,{session_id:h.sid,action:'mark_payout_ready'},actor);
  h.model.fields.payout_dest_ref='1111111111';
  const result=await drainOwnerPayoutInstructions(h.env,Date.now()+61000);assert.equal(result.manual_review,1);assert.equal(h.sent.length,0);
});

test('approved customer -> owner review -> verified account instructions -> manual transfer -> closed',async t=>{
  const h=setup(t),run=action=>applyOwnerJobAction(h.env,{session_id:h.sid,action,transfer_ref:'fixture-transfer'},actor);
  assert.equal((await run('mark_payout_ready')).error,'completion_review_not_clear');
  assert.equal((await run('clear_completion_review')).ok,true);
  const ready=await run('mark_payout_ready');assert.equal(ready.ok,true);assert.equal(ready.owner_notification.delivered,true);
  assert.equal(h.sent.length,1);assert.equal(h.sent[0].chat_id,'12345');assert.match(h.sent[0].text,/0000000000/);
  assert.equal(JSON.stringify(ready).includes('0000000000'),false);
  assert.equal(JSON.stringify([...h.env.PRIVATE_MODEL_MEDIA.objects.values()]).includes('0000000000'),false);
  assert.equal((await run('mark_payout_ready')).ok,true);assert.equal(h.sent.length,1);assert.equal(h.payouts.length,1);
  const writesBeforeReplay=h.writes.length;
  assert.equal((await run('clear_completion_review')).state,'payout_pending');
  assert.equal(h.writes.length,writesBeforeReplay);
  assert.equal((await run('mark_payout_paid')).state,'closed');
});

test('completion and owner payout actions share the same cross-worker conditional lease',async t=>{
  const h=setup(t);
  await withSessionCompletionLock({SESSION_COMPLETION_STATE:h.env.PRIVATE_MODEL_MEDIA},h.sid,async()=>{
    await assert.rejects(applyOwnerJobAction(h.env,{session_id:h.sid,action:'clear_completion_review'},actor),/intake_in_progress/);
    assert.equal(h.writes.length,0);
  });
  assert.equal((await applyOwnerJobAction(h.env,{session_id:h.sid,action:'clear_completion_review'},actor)).ok,true);
});

test('general dashboard does not expose private customer review messages',()=>{
  const out=augmentDashboardPayload({}, {ok:true,counts:{},items:[{session_id:'fixture',customer_review:{private_mmd_message:'private-fixture'}}]});
  assert.equal(JSON.stringify(out).includes('private-fixture'),false);
});

test('verified final payment from another session never releases this payout',async t=>{
  const h=setup(t);h.payments[0].fields[F.payment.sessionId]='other-session';
  h.payments[0].fields[F.payment.paymentRef]='same-ref';h.session.fields[F.session.paymentRef]='same-ref';
  assert.equal((await applyOwnerJobAction(h.env,{session_id:h.sid,action:'clear_completion_review'},actor)).error,'final_payment_not_verified');
  assert.equal(h.writes.length,0);
});

test('pre-job customer acknowledgement cannot replace completion approval',async t=>{
  const h=setup(t);delete h.session.fields.fldflz9XwR9vAQIBZ;h.session.fields[F.session.customerAckAt]='2026-10-29';
  const out=await applyOwnerJobAction(h.env,{session_id:h.sid,action:'clear_completion_review'},actor);
  assert.equal(out.error,'customer_completion_required');assert.equal(h.writes.length,0);
});

test('deposit only, unverified bank, and ambiguous Model all block ready-to-pay',async t=>{
  const h=setup(t);h.session.fields[F.session.completion]='clear';
  h.payments[0].fields[F.payment.stage]='deposit';
  assert.equal((await applyOwnerJobAction(h.env,{session_id:h.sid,action:'mark_payout_ready'},actor)).error,'final_payment_not_verified');
  h.payments[0].fields[F.payment.stage]='final';h.model.fields.payout_dest_status='pending';
  assert.equal((await applyOwnerJobAction(h.env,{session_id:h.sid,action:'mark_payout_ready'},actor)).error,'verified_payout_destination_required');
  h.model.fields.payout_dest_status='verified';h.session.fields.fldrXQAyOMPCvbOaY.push('recOther');
  await assert.rejects(readVerifiedPayoutDestination(h.env,h.session),/ambiguous/);assert.equal(h.sent.length,0);assert.equal(h.writes.length,0);
});

test('bank details never fall back to a group chat or generic Telegram destination',async t=>{
  const h=setup(t);h.env.MODEL_RECONFIRM_OWNER_CHAT_ID='-999';
  assert.equal((await sendOwnerPayoutInstructions(h.env,h.session,5000)).status,'owner_private_chat_required');
  assert.equal(h.sent.length,0);
});

test('delivery unavailable remains ready but never claims transferred or delivered',async t=>{
  const h=setup(t);h.session.fields[F.session.completion]='clear';h.env.MODEL_RECONFIRM_OWNER_CHAT_ID='-999';
  const out=await applyOwnerJobAction(h.env,{session_id:h.sid,action:'mark_payout_ready'},actor);
  assert.equal(out.ok,true);assert.equal(out.state,'payout_pending');assert.equal(out.owner_notification.delivered,false);
  assert.equal(h.session.fields[F.session.state],'payout_pending');assert.equal(h.payouts[0].fields[F.payout.status],'payout_pending');
  assert.equal(h.sent.length,0);
});

test('sensitive customer review requires explicit owner resolution',async t=>{
  const h=setup(t),e=JSON.parse(h.session.fields.fldflz9XwR9vAQIBZ);e.review={ts:'2026-10-30T12:01:00Z',private_care_recommended:true};
  h.session.fields.fldflz9XwR9vAQIBZ=JSON.stringify(e);
  const out=await applyOwnerJobAction(h.env,{session_id:h.sid,action:'clear_completion_review'},actor);
  assert.equal(out.error,'customer_review_resolution_required');assert.equal(h.writes.length,0);
});

test('owner hold requires explicit clear and ready reauthorization before manual payment',async t=>{
  const h=setup(t),run=(action,extra={})=>applyOwnerJobAction(h.env,{session_id:h.sid,action,...extra},actor);
  await run('clear_completion_review');await run('mark_payout_ready');
  await run('hold_completion_review',{reason:'fixture dispute check'});
  assert.equal(h.payouts[0].fields[F.payout.status],'payout_under_review');
  assert.equal((await run('mark_payout_paid',{transfer_ref:'fixture-transfer'})).ok,false);
  const cleared=await run('clear_completion_review',{reason:'fixture dispute resolved'});
  assert.equal(cleared.state,'under_review');
  assert.equal((await run('mark_payout_ready')).ok,true);
  assert.equal(h.payouts[0].fields[F.payout.status],'payout_pending');
  assert.equal((await run('mark_payout_paid',{transfer_ref:'fixture-transfer'})).state,'closed');
});

test('a remaining hold reason blocks payout even when review status says clear',async t=>{
  const h=setup(t);h.session.fields[F.session.completion]='clear';h.session.fields[F.session.holdReason]='fixture pending investigation';
  const out=await applyOwnerJobAction(h.env,{session_id:h.sid,action:'mark_payout_ready'},actor);
  assert.equal(out.error,'completion_review_not_clear');assert.equal(h.writes.length,0);assert.equal(h.sent.length,0);
});
