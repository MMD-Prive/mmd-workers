import test from 'node:test';
import assert from 'node:assert/strict';
import {entryTopicCommand} from '../src/kenji-entry-topics.mjs';
import {isExplicitCategoryCommand,categoryReplyTransportAllowed} from '../src/kenji-reply-category-gate.mjs';
import {runApprovedCategoryTurn} from '../src/kenji-category-turn.mjs';
const env={KENJI_LINE_REPLY_CATEGORY_MODE:'approved_qa_promo',KENJI_LINE_APPROVED_PROMO_ENABLED:'true',LINE_AUTO_REPLY_ENABLED:'true',LINE_KENJI_AI_ENABLED:'true',LINE_KENJI_MODEL_ENABLED:'false'};
const runtime={ok:true,controls:{model_keyword_auto_reply:true}};
const now=Date.parse('2026-11-05T12:00:00+07:00');
const event=text=>({type:'message',mode:'active',timestamp:now,replyToken:'synthetic',source:{type:'user',userId:'U'+'1'.repeat(32)},message:{type:'text',text}});
function io(overrides={}){const sent=[];return {now,sent,continuity:async()=>({available:true,matrix:{last_customer_intent:'booking',payload_json:{model_name:'Hiro'}}}),runtime:async()=>runtime,owner:async()=>({ok:true,active:false}),send:async(e,t,text,button)=>{assert(categoryReplyTransportAllowed(e,t,text,button));sent.push(text);return {ok:true,status:200};},...overrides};}
for(const text of ['รู้จัก MMD / สมาชิก','โปรเดือนนี้','น้องมาใหม่','สนใจสมัครงาน','โปรสมาชิก'])test(`exact Thai entry bypasses old booking and replies once: ${text}`,async()=>{
 assert(isExplicitCategoryCommand(event(text),env));const x=io();const r=await runApprovedCategoryTurn(env,event(text),runtime,x);
 assert.equal(r.delivered,true);assert.equal(x.sent.length,1);assert.doesNotMatch(r.decision.text,/Hiro|รับ.*ไว้แล้ว|ต้องการวันไหน/);
 assert.equal(env.LINE_KENJI_MODEL_ENABLED,'false');
});
test('greeting, native Q&A, vague followups and forged commands remain silent',async()=>{
 for(const text of ['สวัสดี','MMD คืออะไร','มีบริการอะไรบ้าง','รู้จัก MMD / สมาชิก จองเลย','สนใจครับ','โปรสมาชิก ของคนอื่น']) {
  assert.equal(entryTopicCommand(event(text)),'');const x=io();const r=await runApprovedCategoryTurn(env,event(text),runtime,x);assert.equal(r.delivered,false);assert.equal(x.sent.length,0);
 }
 assert.equal(entryTopicCommand({...event('โปรสมาชิก'),source:{type:'group'}}),'');
});
test('new and existing member CTAs are separate and promotional dates stay canonical',async()=>{
 const x=io();const r=await runApprovedCategoryTurn(env,event('โปรสมาชิก'),runtime,x);
 assert.match(r.decision.text,/สำหรับคนใหม่/);assert.match(r.decision.text,/สำหรับสมาชิกเดิม/);
 assert.match(r.decision.text,/intent=signup&view=signup&world=private/);assert.match(r.decision.text,/intent=status&view=overview/);
 assert.match(r.decision.text,/30 พ.ย. 2569/);assert.doesNotMatch(r.decision.text,/31 ต.ค.|คุณได้รับสิทธิ์แล้ว|ชำระสำเร็จ/);
 assert.match(r.decision.text,/เงื่อนไขแคมเปญอีกครั้ง/);
});
test('Thai status CTA calls canonical membership resolver only; never classifies missing truth as new',async()=>{
 let calls=0;const e={...env,MEMBER_PAGES_WORKER:{fetch:async req=>{calls++;const body=await req.json();assert.equal(body.intent,'membership_status');return Response.json({ok:false},{status:503});}}};
 const r=await runApprovedCategoryTurn(e,event('เช็กสิทธิ์โปรของฉัน'),runtime,io());
 assert(calls>0);assert.equal(r.decision.reply_source,'category_checkpts');assert.match(r.decision.text,/ยังตรวจยืนยันสถานะสมาชิก/);assert.doesNotMatch(r.decision.text,/ไม่พบสมาชิก|ได้รับสิทธิ์|Points/);
});
test('existing legacy commands and application CTA still work without a model',async()=>{
 for(const text of ['checkpts','package','regis','apply','ดูแพ็กเกจสมาชิก','สมัครสมาชิก','สมัครเป็นนายแบบ']) {
  const x=io();assert.equal((await runApprovedCategoryTurn(env,event(text),runtime,x)).delivered,true);assert.equal(x.sent.length,1);
 }
});
test('pause, takeover, redelivery and unavailable runtime cannot be bypassed by new entries',async()=>{
 for(const text of ['รู้จัก MMD / สมาชิก','โปรเดือนนี้','น้องมาใหม่','สนใจสมัครงาน','โปรสมาชิก']) {
  for(const [e,ev,rt,x] of [
   [{...env,LINE_AUTO_REPLY_ENABLED:'false'},event(text),runtime,io()],
   [env,event(text),{ok:true,controls:{line_oa_auto_reply:true}},io()],
   [env,event(text),runtime,io({owner:async()=>({ok:true,active:true})})],
   [env,event(text),runtime,io({runtime:async()=>({ok:false})})],
   [env,{...event(text),deliveryContext:{isRedelivery:true}},runtime,io()],
  ]){assert.equal((await runApprovedCategoryTurn(e,ev,rt,x)).delivered,false);assert.equal(x.sent.length,0);}
 }
 assert.equal((await runApprovedCategoryTurn({...env,KENJI_LINE_APPROVED_PROMO_ENABLED:'false'},event('โปรสมาชิก'),runtime,io())).delivered,false);
});
test('no stale promotion claims after campaign boundary and no invented new profiles',async()=>{
 const later=Date.parse('2026-12-01T00:00:00+07:00');const r=await runApprovedCategoryTurn(env,{...event('โปรสมาชิก'),timestamp:later},runtime,io({now:later}));assert.doesNotMatch(r.decision.text,/30 พ.ย.|เพิ่ม 6 เดือน|วันสุดท้าย/);
 const models=await runApprovedCategoryTurn(env,event('น้องมาใหม่'),runtime,io());assert.match(models.decision.text,/ยังไม่ได้ยืนยันรายชื่อ/);assert.match(models.decision.text,/https:\/\/mmdbkk.com\/profiles/);
});
