import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {serializeCustomer360Profile} from '../../../member-pages-worker/src/customer-360-serializer.js';
import {prepareMyMmdLifetimePointsContext,applyMyMmdLifetimePointsResponse} from '../../../member-pages-worker/src/my-mmd-lifetime-points.js';
const source=readFileSync(new URL('./kenji-concierge-v3.js',import.meta.url),'utf8').replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');
const context={module:{exports:{}}};vm.runInNewContext(source,context);const {normalize,displayReply}=context.module.exports;
// The actual LIFF serializer, then actual payment-backed response guard. No nested dashboard mock.
async function contract({paid='Paid',verified='verified',amount=123400,duplicate=false,missing=false,expired=false,unconfigured=false}={}){
  const requests=[];
  const ledger={id:'rec-fixture-ledger',fields:{transaction_status:'posted',points:1234,amount_thb:123400,payment_ref:'pay-fixture',posted_at:new Date(Date.now()-(expired?400:1)*86400000).toISOString()}};
  const payment={id:'rec-fixture-payment',fields:{'Payment Reference':'pay-fixture','Payment Status':paid,'Verification Status':verified,Amount:amount}};
  const env=unconfigured?{}:{AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'app-fixture',LIFF_SESSION_SECRET:'s'.repeat(32),LIFF_IDENTITY_KV:{get:async key=>key.startsWith('liff:session:')?{expires_at:Date.now()+60000,line_user_id:'U'+'a'.repeat(32),member_id:'member-fixture',member_exists:true,member_profile:{tier:'Premium'}}:{state:'reconciled'}},AIRTABLE_HTTP:{fetch:async request=>{requests.push(request.method);const table=new URL(request.url).pathname.split('/').pop();return Response.json({records:table==='tblgWc5VRon5o8Mhk'?[{id:'rec-member',fields:{member_id:'member-fixture',email:'fixture@example.test'}}]:table==='tbl5dfnwjUFMLbnWL'?[ledger]:missing?[]:duplicate?[payment,payment]:[payment]})}}};
  const request=new Request('https://mmdbkk.com/member/api/liff/profile',{headers:{cookie:'__Host-mmd_liff_session=fixture'}});
  const raw={ok:true,data:serializeCustomer360Profile({display_name:'QA Member',tier:'Premium',membership_status:'active',membership_expires_at:'2027-08-31',points:61320,points_records_count:1})};
  const evidence=await prepareMyMmdLifetimePointsContext(request,env);
  const response=await applyMyMmdLifetimePointsResponse(request,Response.json(raw),evidence);
  return {payload:await response.json(),raw,requests};
}
test('actual LIFF serializer and money guard retain flat customer status and Kenji answer',async()=>{
  const {payload,raw,requests}=await contract();assert.equal(raw.data.membership,undefined);assert.equal(raw.data.points,61320);
  assert.equal(payload.data.points,1234);assert.equal(payload.data.customer_360.points.status,'verified');
  const value=normalize(payload,Date.now());assert.equal(value.tier,'Premium');assert.equal(value.expiry,'2027-08-31');assert.equal(value.points,1234);assert.equal(value.mode,'active');
  const answer={intent:'points_status',reply:'QA Member · Points ที่ระบบยืนยันตอนนี้ 1,234 แต้มครับ'};assert.equal(displayReply(answer,value.points),answer.reply);
  assert.ok(requests.length>0&&requests.every(method=>method==='GET'));
});
test('actual guard masks missing, invalid, duplicate and no-evidence balances instead of trusting old 61320',async()=>{
  for(const scenario of [{missing:true},{paid:'Pending'},{verified:'pending_review'},{amount:2000},{duplicate:true},{unconfigured:true}]){
    const {payload,requests}=await contract(scenario);assert.equal(payload.data.points,null);assert.equal(payload.data.customer_360.points.status,'checking');
    const value=normalize(payload,Date.now());assert.equal(value.points,null);assert.equal(value.tier,'Premium');assert.equal(value.expiry,'2027-08-31');
    assert.match(displayReply({intent:'points_status',reply:'Points 0 แต้ม'},value.points),/ยังยืนยันยอด Points ไม่ได้/);
    assert.ok(requests.every(method=>method==='GET'));
  }
});
test('real verified expired lots produce legitimate zero; raw serializer zero alone does not',async()=>{
  const {payload}=await contract({expired:true});assert.equal(payload.data.points,0);assert.equal(normalize(payload,Date.now()).points,0);
  assert.equal(normalize({ok:true,data:serializeCustomer360Profile({tier:'Premium',membership_status:'active',points:0,points_records_count:1})},Date.now()).points,null);
});
