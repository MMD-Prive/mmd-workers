import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMembershipStatusReply} from '../src/kenji-membership-status-reply.mjs';
import {runApprovedCategoryTurn} from '../src/kenji-category-turn.mjs';
const truth=(level='private_premium',lifecycle='active')=>({ok:true,authority:'my_mmd_entitlement_resolver_v1',identity_status:'resolved',membership:{level,lifecycle,expire_at:'2027-01-01'},points:{status:'unavailable',active_points:null}});
for(const state of ['active','expiring_soon','expired','grace'])test(`canonical ${state} membership and CTA do not require Points`,()=>{
  const result=resolveMembershipStatusReply(truth('private_standard',state));
  assert.equal(result.live_truth_verified,true);assert.match(result.text,/Standard|2027-01-01/);
  assert.doesNotMatch(result.text,/Points|Hiro|31 ต.ค.|สมัครสำเร็จ|ชำระสำเร็จ/);
  assert.equal(new URL(result.cta_route).searchParams.get('intent'),['expired','grace'].includes(state)?'renew':'status');
});
for(const level of ['vip','svip','black_card','red_card'])test(`${level} never gets generic renewal or signup`,()=>{
  const r=resolveMembershipStatusReply(truth(level,'expired'));
  assert.equal(r.handoff_required,true);assert.equal(new URL(r.cta_route).searchParams.get('intent'),'status');
  assert.match(r.text,/เปอร์/);assert.doesNotMatch(r.text,/intent=renew|intent=signup|ไม่มีวันหมดอายุ/);
});
for(const lifecycle of ['blocked','revoked','pending','inactive'])test(`${lifecycle} does not offer renewal`,()=>{
  const r=resolveMembershipStatusReply(truth('private_premium',lifecycle));
  assert.equal(r.handoff_required,true);assert.doesNotMatch(r.cta_route,/intent=renew|intent=signup/);
});
test('blocked flag overrides active membership and cannot offer renewal',()=>{
  const t=truth();t.membership.member_blocked=true;
  const r=resolveMembershipStatusReply(t);assert.match(r.text,/ระงับใช้งาน/);assert.doesNotMatch(r.text,/สถานะสมาชิก: ใช้งานอยู่/);assert.equal(r.handoff_required,true);
});
test('unresolved, foreign, historical or incomplete truth never asserts status or starts signup',()=>{
  for(const t of [{ok:false,status:'identity_unresolved'},{ok:false,status:'no_entitlement'},
    {...truth(),authority:'foreign'},{...truth(),identity_status:'owner_oa_linked'},
    {...truth(),membership:{}},{...truth(),membership:{level:'svip',lifecycle:'unknown'}}]){
    const r=resolveMembershipStatusReply(t);assert.equal(r.live_truth_verified,false);assert.equal(r.handoff_required,true);
    assert.match(r.text,/ยังตรวจยืนยันสถานะสมาชิก/);assert.doesNotMatch(r.text,/Points|intent=signup|intent=renew/);
  }
});
test('category makes one membership-only canonical request and preserves fresh pause',async()=>{
  let calls=0,sends=0,reads=0;
  const env={KENJI_LINE_REPLY_CATEGORY_MODE:'approved_qa_promo',LINE_AUTO_REPLY_ENABLED:'true',LINE_KENJI_AI_ENABLED:'true',LINE_KENJI_MODEL_ENABLED:'false',MEMBER_PAGES_WORKER:{fetch:async request=>{
    calls++;assert.equal((await request.json()).intent,'membership_status');
    return Response.json(truth('svip'));
  }}};
  const e={type:'message',mode:'active',timestamp:Date.now(),replyToken:'fixture',source:{type:'user',userId:'U'+'a'.repeat(32)},message:{type:'text',text:'My Status'}};
  const initial={ok:true,controls:{}};
  const r=await runApprovedCategoryTurn(env,e,initial,{
    continuity:async()=>({available:true,matrix:{payload_json:{booking_draft_v1:{model_name:'Hiro'}}}}),
    runtime:async()=>({ok:true,controls:{line_oa_auto_reply:++reads>1}}),owner:async()=>({ok:true,active:false}),send:async()=>{sends++;return {ok:true,status:200}},
  });
  assert.equal(calls,1);assert.equal(sends,0);assert.equal(r.delivered,false);
  assert.equal(r.decision.truth_status,'verified');assert.doesNotMatch(r.decision.text,/Points|Hiro/);
});
