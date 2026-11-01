import test from 'node:test';
import assert from 'node:assert/strict';
import {runApprovedCategoryTurn} from '../src/kenji-category-turn.mjs';
import {categoryReplyTransportAllowed} from '../src/kenji-reply-category-gate.mjs';
import {handleKenjiSeedLineRequest} from '../src/kenji-seed-line-runtime.mjs';
import {createLineSignature} from '../src/index.js';
import {deliverLinePublicMenu} from '../src/index.js';
import {KENJI_LV5_LINE_REQUEST_INTERNALS} from '../src/kenji-lv5-line-operational-request.mjs';
import {KENJI_SVIP_PHOTO_REVEAL_INTERNALS} from '../src/kenji-svip-photo-reveal.mjs';
const env={KENJI_LINE_REPLY_CATEGORY_MODE:'approved_qa_promo',KENJI_LINE_APPROVED_QA_ENABLED:'true',KENJI_LINE_APPROVED_PROMO_ENABLED:'true',LINE_AUTO_REPLY_ENABLED:'true',LINE_KENJI_AI_ENABLED:'true'};
const runtime={ok:true,controls:{model_keyword_auto_reply:true}};
const event=text=>({type:'message',mode:'active',timestamp:Date.now(),replyToken:'fixture',source:{type:'user',userId:'U'+'1'.repeat(32)},message:{type:'text',text}});
function io(overrides={}){const sent=[];return {sent,continuity:async()=>({available:true}),runtime:async()=>runtime,owner:async()=>({ok:true,active:false}),send:async(e,t,s)=>{assert(categoryReplyTransportAllowed(e,t,s));sent.push(s);return {ok:true,status:200}},...overrides};}
for(const command of ['checkpts','package','regis','apply'])test(`exact command replies with model disabled: ${command}`,async()=>{
  const x=io();const r=await runApprovedCategoryTurn({...env,LINE_KENJI_MODEL_ENABLED:'false'},event(command),runtime,x);
  assert.equal(r.delivered,true);assert.equal(x.sent.length,1);assert.equal(r.decision.reply_source,`category_${command}`);
  if(command==='checkpts')assert.match(r.decision.text,/ยังยืนยันยอดไม่ได้/);
});
test('checkpts reads only signed identity from canonical binding, not historical context',async()=>{
  let calls=0;const e={...env,MEMBER_PAGES_WORKER:{fetch:async request=>{
    const body=await request.json();calls++;assert.equal(body.line_user_id,'U'+'1'.repeat(32));assert.equal(body.intent,'points_status');
    return Response.json({ok:true,authority:'my_mmd_entitlement_resolver_v1',identity_status:'resolved',membership:{level:'private_premium',label:'Premium',lifecycle:'active',expire_at:'2027-01-01'},points:{status:'verified',active_points:120}});
  }}};
  const x=io();const r=await runApprovedCategoryTurn(e,event('CHECKPTS'),runtime,x);assert.equal(calls,1);assert.equal(r.delivered,true);assert.match(r.decision.text,/120 Points/);assert.doesNotMatch(r.decision.text,/CTA:/);
});
test('package uses verified catalog and does not grant membership',async()=>{
  const e={...env,MEMBER_PAGES_WORKER:{fetch:async request=>{
    assert.equal((await request.json()).intent,'private_interest');
    return Response.json({ok:true,authority:'my_mmd_entitlement_resolver_v1',private_signup_catalog:{authority:'canonical_private_signup_catalog_v1',status:'verified',packages:[{code:'standard',base_years:1,price_thb:1199},{code:'premium',base_years:2,price_thb:2999}]}});
  }}};
  const r=await runApprovedCategoryTurn(e,event('package'),runtime,io());assert.equal(r.delivered,true);assert.match(r.decision.text,/1,199/);assert.match(r.decision.text,/2,999/);assert.doesNotMatch(r.decision.text,/สมัครสำเร็จ|เปิดสิทธิ์แล้ว/);
});
test('owner takeover after truth blocks delivery',async()=>{
  let ownerReads=0;const x=io({owner:async()=>({ok:true,active:++ownerReads>1})});
  assert.equal((await runApprovedCategoryTurn(env,event('checkpts'),runtime,x)).attempted,false);assert.equal(ownerReads,2);
});
test('auto reply OFF prevents command truth reads and replies',async()=>{
  const e={...env,LINE_AUTO_REPLY_ENABLED:'false',MEMBER_PAGES_WORKER:{fetch:()=>{throw Error('must not read')}}};
  for(const command of ['checkpts','package','regis','apply','โปร'])assert.equal((await runApprovedCategoryTurn(e,event(command),runtime,io())).attempted,false);
});
test('post announcement promo uses neutral approved navigation at Bangkok boundary',async()=>{
  for(const date of ['2026-12-01T00:00:00+07:00','2026-12-31T12:00:00+07:00']){
    const now=Date.parse(date);const x=io({now});const r=await runApprovedCategoryTurn(env,{...event('โปร'),timestamp:now},runtime,x);
    assert.equal(r.delivered,true);assert.match(r.decision.text,/ตรวจข้อเสนอและสิทธิ์ล่าสุด/);assert.doesNotMatch(r.decision.text,/31 ต.ค.|สิ้นสุด|วันสุดท้าย|เพิ่ม.*เดือน/);
  }
});
test('November category turn delivers canonical three-cohort announcement and CTA once',async()=>{
  for(const date of ['2026-11-01T00:00:00+07:00','2026-11-30T23:59:59.999+07:00']){
    const now=Date.parse(date),x=io({now});
    const r=await runApprovedCategoryTurn(env,{...event('มีโปรอะไร'),timestamp:now},runtime,x);
    assert.equal(r.delivered,true);assert.equal(x.sent.length,1);
    for(const group of ['สมาชิกปัจจุบัน','หมดอายุไม่เกิน 6 เดือน','หมดอายุเกิน 6 เดือน'])assert.ok(r.decision.text.includes(group));
    assert.match(r.decision.text,/30 พ.ย. 2569/);assert.match(r.decision.text,/ก่อนชำระ/);
    const url=new URL(r.decision.text.split(' → ').at(-1));
    assert.equal(url.origin,'https://miniapp.line.me');assert.equal(url.searchParams.get('intent'),'signup');
    assert.equal(url.searchParams.get('view'),'signup');assert.equal(url.searchParams.get('world'),'private');
    assert.doesNotMatch(r.decision.text,/วันนี้วันสุดท้าย|31 ต.ค.|คุณได้รับสิทธิ์แล้ว/);
  }
});
test('promo switch off stays silent without disabling explicit commands',async()=>{
  const e={...env,KENJI_LINE_APPROVED_PROMO_ENABLED:'false'};
  assert.equal((await runApprovedCategoryTurn(e,event('โปร'),runtime,io())).attempted,false);
  assert.equal((await runApprovedCategoryTurn(e,event('apply'),runtime,io())).delivered,true);
});
test('native OA owns service QA even when obsolete Worker QA flag is true',async()=>{const x=io();const r=await runApprovedCategoryTurn(env,event('มีบริการอะไรบ้าง'),runtime,x);assert.equal(r.delivered,false);assert.equal(x.sent.length,0)});
for(const text of ['GWs คืออะไร','Guest Who คืออะไร','EMs คืออะไร','Exclusive Models คืออะไร','สมัครสมาชิกแล้วได้อะไรบ้าง','สิทธิประโยชน์สมาชิก','Black Card คืออะไร','Black Card ราคาเท่าไหร่','MMD คืออะไร','MMD Privé คืออะไร','ชำระเงินอย่างไร','ชำระเงินยังไง','วิธีชำระเงิน','เช็กสิทธิ์','สวัสดี','จอง','ตรงปกไหม','ต่ออายุสมาชิก','checkpts ของคนอื่น'])test(`source silent: ${text}`,async()=>{const x=io();assert.equal((await runApprovedCategoryTurn(env,event(text),runtime,x)).delivered,false);assert.equal(x.sent.length,0)});
for(const [name,overrides] of [
  ['fresh pause',{runtime:async()=>({ok:true,controls:{line_oa_auto_reply:true}})}],
  ['global kill',{runtime:async()=>({ok:true,controls:{all_kenji_mutations:true}})}],
  ['runtime unavailable',{runtime:async()=>({ok:false})}],
  ['takeover',{owner:async()=>({ok:true,active:true})}],
  ['identity unavailable',{continuity:async()=>({available:false})}],
  ['RPC failure',{owner:async()=>{throw Error('offline')}}],
])test(`source fail closed: ${name}`,async()=>{const x=io(overrides);assert.equal((await runApprovedCategoryTurn(env,event('apply'),runtime,x)).attempted,false);assert.equal(x.sent.length,0)});
test('original env and controls unchanged',async()=>{const e=Object.freeze({...env});await runApprovedCategoryTurn(e,event('มีบริการอะไรบ้าง'),Object.freeze(runtime),io());assert.equal(Object.getOwnPropertySymbols(e).length,0)});
test('source outer public menu, booking and photo replies remain silent',async()=>{
  assert.equal((await deliverLinePublicMenu(env,'fixture',{trusted_event:true})).suppressed,true);
  assert.equal(KENJI_LV5_LINE_REQUEST_INTERNALS.isLineReplyAllowed(env,{}),false);
  assert.equal((await KENJI_SVIP_PHOTO_REVEAL_INTERNALS.sendLineReply(env,'fixture',[{type:'text',text:'model'}])).suppressed,true);
});
test('stale/redelivery/group events do not call reply adapters',async()=>{for(const e of [{...event('มีบริการอะไรบ้าง'),timestamp:0},{...event('มีบริการอะไรบ้าง'),deliveryContext:{isRedelivery:true}},{...event('มีบริการอะไรบ้าง'),source:{type:'group'}}]){const x=io();assert.equal((await runApprovedCategoryTurn(env,e,runtime,x)).attempted,false)}});
test('signed unknown webhook retains intake, emits no LINE/model requests',async()=>{
  const raw=JSON.stringify({events:[event('สวัสดี')]});const e={...env,LINE_CHANNEL_SECRET:'fixture-secret',ADMIN_WORKER:{fetch:async()=>Response.json(runtime)}};
  const signature=await createLineSignature(raw,e.LINE_CHANNEL_SECRET);let intake=0;
  const legacy={fetch:async()=>{intake++;return Response.json({ok:true,saved:[{}]})}};
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('no external calls')};
  try {const r=await handleKenjiSeedLineRequest(new Request('https://fixture.invalid/webhooks/line',{method:'POST',headers:{'x-line-signature':signature},body:raw}),e,null,legacy);assert.equal(r.status,200);assert.equal(intake,1);assert.equal((await r.json()).saved[0].replied,false);assert.equal(calls,0)}finally{globalThis.fetch=original}
});
test('invalid signature remains 401 and never reaches intake',async()=>{let calls=0;const r=await handleKenjiSeedLineRequest(new Request('https://fixture.invalid/webhooks/line',{method:'POST',body:'{}'}),{...env,LINE_CHANNEL_SECRET:'fixture'},null,{fetch:()=>{calls++}});assert.equal(r.status,401);assert.equal(calls,0)});
