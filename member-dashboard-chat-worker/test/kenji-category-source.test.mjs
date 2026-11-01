import test from 'node:test';
import assert from 'node:assert/strict';
import {runApprovedCategoryTurn} from '../src/kenji-category-turn.mjs';
import {approvedPublicQa} from '../src/kenji-approved-public-qa.mjs';
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
test('readable source QA passes with model kill active; no model adapter',async()=>{const x=io();const r=await runApprovedCategoryTurn(env,event('มีบริการอะไรบ้าง'),runtime,x);assert.equal(r.delivered,true);assert.equal(x.sent.length,1);assert.equal(r.decision.text,approvedPublicQa('มีบริการอะไรบ้าง').text)});
for(const text of ['GWs คืออะไร','EMs คืออะไร','checkpts','เช็กสิทธิ์','สวัสดี','จอง','ตรงปกไหม','มีโปรอะไร','ต่ออายุสมาชิก'])test(`source silent: ${text}`,async()=>{const x=io();assert.equal((await runApprovedCategoryTurn(env,event(text),runtime,x)).delivered,false);assert.equal(x.sent.length,0)});
for(const [name,overrides] of [
  ['fresh pause',{runtime:async()=>({ok:true,controls:{line_oa_auto_reply:true}})}],
  ['global kill',{runtime:async()=>({ok:true,controls:{all_kenji_mutations:true}})}],
  ['runtime unavailable',{runtime:async()=>({ok:false})}],
  ['takeover',{owner:async()=>({ok:true,active:true})}],
  ['identity unavailable',{continuity:async()=>({available:false})}],
  ['RPC failure',{owner:async()=>{throw Error('offline')}}],
])test(`source fail closed: ${name}`,async()=>{const x=io(overrides);assert.equal((await runApprovedCategoryTurn(env,event('มีบริการอะไรบ้าง'),runtime,x)).attempted,false);assert.equal(x.sent.length,0)});
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
