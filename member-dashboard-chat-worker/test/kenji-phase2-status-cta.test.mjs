import test from 'node:test';
import assert from 'node:assert/strict';
import {phase2MyStatusReply, membershipUriButton, withCategoryReplyGrant, categoryReplyTransportAllowed} from '../src/kenji-reply-category-gate.mjs';
const env={KENJI_LINE_REPLY_CATEGORY_MODE:'approved_qa_promo',KENJI_LINE_APPROVED_PROMO_ENABLED:'true'};
const event=text=>({type:'message',message:{type:'text',text},source:{type:'user'}});
const now=Date.parse('2026-11-30T23:59:59.999+07:00');
const url='https://www.mmdbkk.com/member/liff?intent=status&world=public';
for(const cmd of ['CARE BACK','โปรเดือนนี้','โปรสมาชิก']) test(cmd+' sends one exact CTA',()=>{
  const d=phase2MyStatusReply(event(cmd),env,now);
  const but=membershipUriButton(d);
  assert.deepEqual(but,{label:'เช็กสิทธิ์และต่ออายุ',uri:url});
  assert.equal(d.text.split('\n').at(-1),url);
  assert.doesNotMatch(d.text,/\+90|\+180/);
  const scoped=withCategoryReplyGrant(env,'mock-only',d);
  assert.equal(categoryReplyTransportAllowed(scoped,'mock-only',d.text,but),true);
  assert.equal(categoryReplyTransportAllowed(scoped,'mock-only',d.text,{...but,uri:'https://example.com'}),false);
  assert.equal(categoryReplyTransportAllowed(scoped,'mock-only',d.text,null),false);
});
test('time, intent, flags and non-user controls are preserved',()=>{
  assert.ok(phase2MyStatusReply(event('care back'),env,Date.parse('2026-11-27T00:00:00+07:00')));
  assert.equal(phase2MyStatusReply(event('care back'),env,Date.parse('2026-11-26T23:59:59.999+07:00')),null);
  assert.equal(phase2MyStatusReply(event('care back'),env,now+1),null);
  assert.equal(phase2MyStatusReply(event('care back ของฉัน'),env,now),null);
  assert.equal(phase2MyStatusReply(event('โปรสมาชิก'),{...env,KENJI_LINE_APPROVED_PROMO_ENABLED:'false'},now),null);
  assert.equal(phase2MyStatusReply({...event('care back'),source:{type:'group'}},env,now),null);
  assert.equal(membershipUriButton({reply_source:'care_back_canonical_public',intent:'approved_promotion',cta_route:url,text:url+'\nOther copy'}),null);
});

test('actual category turn sends once and respects current owner control', async()=>{
  const {runApprovedCategoryTurn}=await import('../src/kenji-category-turn.mjs');
  const sendEnv={...env,LINE_AUTO_REPLY_ENABLED:'true',LINE_KENJI_AI_ENABLED:'true'};
  const runtime={ok:true,controls:{}};
  const ev={...event('โปรเดือนนี้'),source:{type:'user',userId:'U'+'a'.repeat(32)},timestamp:now,replyToken:'mock-only',mode:'active'};
  let calls=0;
  const io={now,continuity:async()=>({available:true}),runtime:async()=>runtime,owner:async()=>({ok:true,active:false}),
    send:async(grant,token,text,button)=>{calls++;assert.equal(categoryReplyTransportAllowed(grant,token,text,button),true);
      assert.equal(text.split('\n').at(-1),url);assert.equal(button.uri,url);return {ok:true,status:200};}};
  assert.equal((await runApprovedCategoryTurn(sendEnv,ev,runtime,io)).delivered,true);
  assert.equal((await runApprovedCategoryTurn(sendEnv,ev,runtime,{...io,owner:async()=>({ok:true,active:true})})).attempted,false);
  assert.equal((await runApprovedCategoryTurn(sendEnv,{...ev,deliveryContext:{isRedelivery:true}},runtime,io)).attempted,false);
  assert.equal(calls,1);
});
