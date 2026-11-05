import test from 'node:test';
import assert from 'node:assert/strict';
import {readModelPayout} from './src/model-payout-read.js';
import {OWNER_OPS_FIELDS as F} from './src/job-orchestrator-owner-ops-runtime.js';
const env={AIRTABLE_API_KEY:'synthetic-only',AIRTABLE_BASE_ID:'synthetic-base'};
function fixture(){const at='2026-01-01T00:00:00Z';return {
 session:{session_id:'s1',normalized_state:'closed',pay_model_thb:5000},
 record:{fields:{model_name:'MODEL-A',payment_ref:'p1',completion_review_status:'resolved'}},
 payout:{fields:{[F.payout.sessionId]:'s1',[F.payout.payoutRef]:'payout:s1:session_payout',[F.payout.modelName]:'MODEL-A',[F.payout.type]:'session_payout',[F.payout.amount]:5000,[F.payout.status]:'payout_paid',[F.payout.verification]:'verified',[F.payout.verifiedBy]:'owner',[F.payout.paidAt]:at,[F.payout.verifiedAt]:at,[F.payout.linkedPaymentRef]:'p1',[F.payout.notes]:'owner_transfer_ref=SYNTHETIC-REF; marked_by=owner',[F.payout.slipUrl]:'private-slip',[F.payout.privacy]:'admin_only'}}};}
async function run(f,result,fail=false){const old=globalThis.fetch;let calls=0;globalThis.fetch=async(url,init)=>{
 calls++;assert.equal(init.method,undefined);const q=new URL(url);assert.match(q.searchParams.get('filterByFormula'),/s1/);assert.equal(q.searchParams.get('returnFieldsByFieldId'),'true');
 if(fail)throw Error('offline');return Response.json(result??{records:[f.payout]});
 };try{return {view:await readModelPayout(env,f.record,f.session),calls};}finally{globalThis.fetch=old;}}
test('verified transfer is read-only and returns only model-safe proof',async()=>{
 const f=fixture(),before=JSON.stringify(f);const {view,calls}=await run(f);
 assert.equal(calls,1);assert.equal(view.status,'paid');assert.equal(view.amount_thb,5000);assert.equal(JSON.stringify(f),before);
 assert.doesNotMatch(JSON.stringify(view),/SYNTHETIC-REF|private-slip|MODEL-A|admin_only|notes|bank/);
});
for(const [label,change]of [
 ['other session',f=>f.payout.fields[F.payout.sessionId]='other'],['other model',f=>f.payout.fields[F.payout.modelName]='other'],
 ['wrong amount',f=>f.payout.fields[F.payout.amount]=6000],['wrong type',f=>f.payout.fields[F.payout.type]='tip'],
 ['wrong reference',f=>f.payout.fields[F.payout.payoutRef]='other'],['wrong payment',f=>f.payout.fields[F.payout.linkedPaymentRef]='other'],
 ['unverified',f=>f.payout.fields[F.payout.verification]='pending'],['no verifier',f=>delete f.payout.fields[F.payout.verifiedBy]],
 ['no date',f=>delete f.payout.fields[F.payout.paidAt]],['bad date',f=>f.payout.fields[F.payout.verifiedAt]='bad'],
 ['future date',f=>f.payout.fields[F.payout.paidAt]='2099-01-01'],['no transfer ref',f=>f.payout.fields[F.payout.notes]='no evidence'],
 ['closed only',f=>f.payout.fields[F.payout.status]='payout_pending'],['review not clear',f=>f.record.fields.completion_review_status='pending'],
 ['not closed',f=>f.session.normalized_state='under_review'],['field conflict',f=>f.record.fields[F.session.modelName]='different'],
 ])test(label+' never reports paid',async()=>{const f=fixture();change(f);assert.equal((await run(f)).view.verified,false);});
test('HOLD stops before reading payouts',async()=>{const f=fixture();f.record.fields.payout_hold_reason='review';const r=await run(f);assert.equal(r.calls,0);assert.equal(r.view.status,'hold');});
test('missing, duplicate, truncated or unavailable evidence fails closed',async()=>{
 const f=fixture();for(const result of [{records:[]},{records:[f.payout,f.payout]},{records:[f.payout],offset:'more'},{records:null}])assert.equal((await run(f,result)).view.verified,false);
 assert.equal((await run(f,null,true)).view.verified,false);
});
