import test from 'node:test';
import assert from 'node:assert/strict';
import {entryTopicCommand} from '../src/kenji-entry-topics.mjs';
import {isExplicitCategoryCommand,categoryReplyTransportAllowed} from '../src/kenji-reply-category-gate.mjs';
import {runApprovedCategoryTurn} from '../src/kenji-category-turn.mjs';
import {currentProfileQuery} from '../src/kenji-profile-link.mjs';
import {readRecentProfileAnchor} from '../src/kenji-line-conversation-history.mjs';
const env={KENJI_LINE_REPLY_CATEGORY_MODE:'approved_qa_promo',KENJI_LINE_APPROVED_PROMO_ENABLED:'true',LINE_AUTO_REPLY_ENABLED:'true',LINE_KENJI_AI_ENABLED:'true',LINE_KENJI_MODEL_ENABLED:'false'};
const runtime={ok:true,controls:{model_keyword_auto_reply:true}};
const now=Date.parse('2026-11-05T12:00:00+07:00');
const event=text=>({type:'message',mode:'active',timestamp:now,replyToken:'synthetic',source:{type:'user',userId:'U'+'1'.repeat(32)},message:{type:'text',text}});
test('profile navigation reads only current exact names or explicit requests and stays behind both runtime guards',async()=>{
 const calls=[];let outcome={ok:true,status:'profile_link',destination:'public'}, status=200;
 const e={...env,LINE_KENJI_MODEL_ACCESS_ENABLED:'true',INTERNAL_TOKEN:'fixture',ADMIN_WORKER:{fetch:async req=>{
  assert.equal(req.redirect,'manual');
  const body=await req.json();calls.push(body);
  return Response.json(body.query==='Hiro'?outcome:{ok:true,status:'silent'}, {status,headers:{location:'https://redirect.invalid/'}});
 }}};
 const clear={ok:true,controls:{}};
 const run=(text,initial=clear,fresh=clear)=>runApprovedCategoryTurn(e,event(text),initial,io({runtime:async()=>fresh}));
 assert.equal(currentProfileQuery(event('เมื่อวานคุยเรื่อง Hiro')),null);
 assert.equal((await run('เมื่อวานคุยเรื่อง Hiro')).delivered,false);assert.equal(calls.length,0);
 assert.equal((await run('ขอถามเรื่องเดิม')).delivered,false);calls.length=0;
 assert.match((await run('Hiro')).decision.text,/mmdbkk\.com\/profiles/);
 assert.deepEqual(calls[0],{line_user_id:event('').source.userId,query:'Hiro',purpose:'profile_link'});
 outcome={ok:true,status:'profile_link',destination:'ems',url:'https://evil.invalid/'};
 const allowed=await run('ขอดูโปรไฟล์ Hiro ครับ');
 assert.equal(calls.at(-1).query,'Hiro');assert.equal(allowed.delivered,true);
 assert.match(allowed.decision.text,/mmdbkk\.com\/my-mmd\/ems/);assert.doesNotMatch(allowed.decision.text,/evil|จองสำเร็จ/);
 assert.equal(allowed.decision.model_attempted,false);
 outcome={ok:true,status:'clarification'};
 assert.doesNotMatch((await run('Hiro')).decision.text,/https?:/);
 outcome={ok:true,status:'silent'};
 assert.equal((await run('Hiro')).delivered,false);
 assert.match((await run('ขอดู Hiro')).decision.text,/mmdbkk\.com\/profiles/);
 const before=calls.length;
 assert.equal((await run('Hiro',runtime)).delivered,false);assert.equal(calls.length,before);
 outcome={ok:true,status:'profile_link',destination:'ems'};
 assert.equal((await run('Hiro',clear,runtime)).delivered,false);
 status=302;
 const beforeRedirect=calls.length;
 assert.equal((await run('Hiro')).delivered,false);
 assert.equal(calls.length,beforeRedirect+1);
 assert.doesNotMatch((await run('ขอดู Hiro')).decision.text,/my-mmd\/ems|redirect\.invalid/);
});
function io(overrides={}){const sent=[];return {now,sent,continuity:async()=>({available:true,matrix:{last_customer_intent:'booking',payload_json:{model_name:'Hiro'}}}),runtime:async()=>runtime,owner:async()=>({ok:true,active:false}),send:async(e,t,text,button)=>{assert(categoryReplyTransportAllowed(e,t,text,button));sent.push(text);return {ok:true,status:200};},...overrides};}
test('profile follow-up requires latest same-user inbound and confirmed named-profile delivery, then rechecks access',async()=>{
 const ev={...event('ขอดูเพิ่ม'),message:{...event('ขอดูเพิ่ม').message,id:'msg-current'}};
 const user=ev.source.userId;
 const iso=ms=>new Date(now+ms).toISOString();
 const inbound=(id,when,raw='')=>({fields:{source:'line',line_user_id:user,line_id:id,inbox_id:`line_${id}`,created_at:iso(when),
  payload_json:JSON.stringify({source_user_id:user,source_message_id:id,received_at:iso(when),raw_text:raw})}});
 const previous=inbound('msg-previous',-2000,'ขอดู Hiro');
 const current=inbound('msg-current',100,'ขอดูเพิ่ม');
 const receipt={fields:{event_id:'kai_line_msg-previous',linked_console_inbox_id:'line_msg-previous',channel:'LINE_OFC',final_status:'sent',created_at:iso(-1000),
  payload_json:JSON.stringify({reply_source:'category_profile_link',cta_type:'profile_anchor',line_delivery_succeeded:true})}};
 let rows=[current,previous], receipts=[receipt], rpc=[], redirectStage='';
 const clear={ok:true,controls:{}};
 const e={...env,AIRTABLE_BASE_ID:'fixture',AIRTABLE_API_KEY:'fixture',LINE_KENJI_MODEL_ACCESS_ENABLED:'true',INTERNAL_TOKEN:'fixture',
  ADMIN_WORKER:{fetch:async req=>{rpc.push(await req.json());return Response.json({ok:true,status:'profile_link',destination:'public'});}}};
 const read=(env,event,now)=>readRecentProfileAnchor(env,event,now,async (url,options)=>{
  assert.equal(options.redirect,'manual');
  const filter=new URL(url).searchParams.get('filterByFormula');
  assert(filter.includes(user)||filter.includes('kai_line_'));
  const stage=filter.includes('kai_line_')?'receipt':'inbox';
  return Response.json({records:stage==='receipt'?receipts:rows},
    redirectStage===stage?{status:307,headers:{location:'https://redirect.invalid/'}}:{});
 });
 const run=()=>runApprovedCategoryTurn(e,ev,clear,io({runtime:async()=>clear,readProfileAnchor:read}));
 const resolved=await run();assert.match(resolved.decision.text,/mmdbkk\.com\/profiles/);
 assert.equal(resolved.decision.cta_type,undefined);assert.equal(rpc[0].query,'Hiro');
 assert.equal(rpc[0].line_user_id,user);assert.equal(resolved.delivered,true);
 e.ADMIN_WORKER.fetch=async req=>{rpc.push(await req.json());return Response.json({ok:true,status:'silent'});};
 assert.doesNotMatch((await run()).decision.text,/https?:/);assert.equal(rpc.length,2);
 for (const stage of ['inbox','receipt']) {
  redirectStage=stage;
  assert.match((await run()).decision.text,/หมายถึงนายแบบคนไหน/);
  assert.equal(rpc.length,2);
 }
 redirectStage='';
 for(const [history,delivery] of [
  [[current,inbound('msg-topic',-100,'โปรเดือนนี้'),previous],[receipt]],
  [[current,inbound('msg-previous',-301000,'Hiro')],[receipt]],
  [[current,previous],[]],
  [[current,previous],[receipt,receipt]],
  [[current,{fields:{...previous.fields,line_user_id:'U'+'2'.repeat(32)}}],[receipt]],
  [[current,inbound('msg-previous',-2000,'คนนี้')],[receipt]],
 ]){
  rows=history;receipts=delivery;
  const result=await run();assert.match(result.decision.text,/หมายถึงนายแบบคนไหน/);assert.doesNotMatch(result.decision.text,/Hiro|https?:/);
 }
 assert.equal(rpc.length,2);
});
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
 for(const text of ['My Status','package','regis','apply','ดูแพ็กเกจสมาชิก','สมัครสมาชิก','สมัครเป็นนายแบบ']) {
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

for (const [command, existingCommand] of [
  ['Promotion', 'โปรเดือนนี้'],
  ['Find Model', 'น้องมาใหม่'],
  ['Apply Job', 'สนใจสมัครงาน'],
]) {
  test(`English Greeting command reuses the existing reply: ${command}`, async () => {
    const english = io();
    const thai = io();
    assert(isExplicitCategoryCommand(event(command), env));
    const result = await runApprovedCategoryTurn(env, event(command), runtime, english);
    const expected = await runApprovedCategoryTurn(env, event(existingCommand), runtime, thai);
    assert.equal(result.delivered, true);
    assert.equal(english.sent.length, 1);
    assert.deepEqual(result, expected);
    assert.deepEqual(english.sent, thai.sent);
    assert.equal(entryTopicCommand(event(`${command} please`)), '');
    assert.equal(entryTopicCommand({...event(command), source: {type: 'group'}}), '');
  });
}

test('explicit model requests route to the right authenticated MY MMD view', async () => {
 const booking = /miniapp\.line\.me\/2010862595-yT4DCEMc\/\?intent=status&view=jobs/;
 const request = /miniapp\.line\.me\/2010862595-yT4DCEMc\/\?intent=status&view=my-requests/;
 for (const [message, source, routes] of [
  ['คนในรูปคือใครครับ', 'category_model_request_clarify', [booking, request]],
  ['อยากให้ช่วยหาคนนี้', 'category_model_request_external', [request]],
  ['พร้อมส่งคำขอจอง', 'category_model_request_booking', [booking]],
 ]) {
  const x = io();
  const result = await runApprovedCategoryTurn(env, event(message), runtime, x);
  assert.equal(result.decision.reply_source, source);
  assert.equal(result.delivered, true);
  assert.equal(x.sent.length, 1);
  for (const route of routes) assert.match(x.sent[0], route);
  assert.equal(booking.test(x.sent[0]), routes.includes(booking));
  assert.equal(request.test(x.sent[0]), routes.includes(request));
 }
 const image = {...event(''), message:{type:'image', id:'fixture'}};
 const x = io();
 assert.equal((await runApprovedCategoryTurn(env, image, runtime, x)).attempted, false);
 assert.equal(x.sent.length, 0);
});

test('My Status answers in chat without Points or a link', async () => {
 const r = await runApprovedCategoryTurn(env, event('My Status'), runtime, io());
 assert.equal(r.delivered, true);
 assert.equal(r.decision.reply_source, 'category_my_status');
 assert.match(r.decision.text, /สถานะสมาชิก:.*\nวันหมดอายุ:/);
 assert.doesNotMatch(r.decision.text, /https?:|Points/i);
 assert.equal((await runApprovedCategoryTurn(env, event('Checkpts'), runtime, io())).delivered, false);
});
