import test from 'node:test';
import assert from 'node:assert/strict';
import {handleKenjiMemberChat} from '../../../member-dashboard-chat-worker/src/kenji-member-app.js';
import {buildKenjiMemberChat} from '../../../ai-worker/src/services/kenji-member-chat.js';
const truth={ok:true,display_name:'QA Member',membership:{level:'premium',label:'Premium',lifecycle:'active',expire_at:'2027-01-01'},points:{status:'verified',active_points:1234},resolver_snapshot:{schema_version:'my_mmd_entitlement_resolver_v1',evaluated_at:'2026-10-03T00:00:00Z',fail_closed:true,member_blocked:false,capability_state:{active:['private_premium'],expiring_soon:[],grace:[],inactive:[],recognized:['private_premium']},access:{public_service_access:true,private_visibility_envelope:'premium'}}};
const request=(message='เช็ก Points',origin='https://mmdbkk.com')=>new Request('https://mmdbkk.com/api/member/kenji/chat',{method:'POST',headers:{'content-type':'application/json',origin,cookie:'__Host-mmd_member_session=QA_ONLY'},body:JSON.stringify({message})});
test('current Kenji BFF answers inline points using verified session and actual AI service logic',async()=>{
  const calls=[];
  const response=await handleKenjiMemberChat(request(),{
    MEMBER_PAGES_WORKER:{fetch:async req=>{calls.push('truth');assert.equal(req.headers.get('cookie'),'__Host-mmd_member_session=QA_ONLY');return Response.json(truth)}},
    AI_WORKER:{fetch:async req=>{calls.push('ai');const body=await req.json();assert.equal(body.member_truth.points.active_points,1234);return Response.json({ok:true,data:buildKenjiMemberChat(body)})}}
  });
  const payload=await response.json();assert.equal(response.status,200);assert.deepEqual(calls,['truth','ai']);assert.match(payload.reply,/1,234/);assert.equal(payload.action.url,'/my-mmd/points');assert.equal(payload.authority,'ai-worker');
});
test('expired identity stops before AI and retains existing verification flow',async()=>{
  let aiCalled=false;const response=await handleKenjiMemberChat(request(),{MEMBER_PAGES_WORKER:{fetch:async()=>Response.json({ok:false,error:'member_session_required'},{status:401})},AI_WORKER:{fetch:async()=>{aiCalled=true}}});
  assert.equal(response.status,401);assert.equal(aiCalled,false);assert.equal((await response.json()).verify_url,'/member/liff?intent=status');
});
test('origin boundary remains first-party',async()=>{assert.equal((await handleKenjiMemberChat(request('hello','https://evil.example'))).status,403)});
test('empty message does not query member truth',async()=>{assert.equal((await handleKenjiMemberChat(request('  '))).status,400)});
test('missing member binding and AI contract failure are unavailable, never success',async()=>{
  assert.equal((await handleKenjiMemberChat(request())).status,503);
  assert.equal((await handleKenjiMemberChat(request(),{MEMBER_PAGES_WORKER:{fetch:async()=>Response.json(truth)},AI_WORKER:{fetch:async()=>Response.json({ok:true,data:{reply:'wrong schema'}})}})).status,503);
});
