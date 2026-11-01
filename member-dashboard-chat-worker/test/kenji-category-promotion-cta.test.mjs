import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedCategoryReply} from '../src/kenji-reply-category-gate.mjs';
import {careBackOctoberReply} from '../src/kenji-care-back-october.mjs';
const env={KENJI_LINE_REPLY_CATEGORY_MODE:'approved_qa_promo',KENJI_LINE_APPROVED_PROMO_ENABLED:'true'};
const event=text=>({type:'message',source:{type:'user'},message:{type:'text',text}});
const now=Date.parse('2026-11-15T12:00:00+07:00');
test('public overview preserves exact canonical copy and URI without personal classification',()=>{
 const canonical=careBackOctoberReply('care_back_overview','โปร',now);
 assert.equal(approvedCategoryReply(event('โปร'),env,{careBackOctoberReply,now}).text,`${canonical.text}\n${canonical.label} → ${canonical.route}`);
});
test('missing, unsafe and oversized CTA adapters fail closed',()=>{
 for(const reply of [null,{text:'x'}, {text:'x',label:'go',route:'https://evil.invalid/'},{text:'x'.repeat(4501),label:'go',route:'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=overview'}]){
  assert.equal(approvedCategoryReply(event('โปร'),env,{now,careBackOctoberReply:()=>reply}),null);
 }
});
test('personal claims, payment, Q&A and unknown do not become public promotion truth',()=>{
 for(const text of ['โปรของผมได้สิทธิ์ไหม','ส่งสลิปแล้ว','ชำระเงินอย่างไร','GWs คืออะไร','สวัสดี','จอง','ไม่ทราบ'])assert.equal(approvedCategoryReply(event(text),env,{careBackOctoberReply,now}),null);
});
