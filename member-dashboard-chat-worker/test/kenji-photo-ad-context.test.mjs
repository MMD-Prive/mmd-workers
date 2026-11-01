import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveKenjiSeedDecision,handleKenjiSeedLineRequest} from '../src/kenji-seed-line-runtime.mjs';
import {createLineSignature} from '../src/index.js';

const event=text=>({type:'message',source:{type:'user',userId:'U1234567890abcdef1234567890abcdef'},message:{type:'text',text}});
const env={LINE_KENJI_MODEL_ENABLED:'false',LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED:'true'};
const options={modelAccessAllowed:false,continuity:{decision:'continuation',topic:'pricing',effective_intent:'note_only',storage_status:'ready'}};

for(const text of ['ตัวจริง ตรงปกใช่ไหมครับ','ตัวจริงเหมือนในรูปไหมครับ','รูปนี้ถ่ายล่าสุดไหมครับ']){
  test(`photo accuracy follows context without claiming likeness: ${text}`,async()=>{
    const result=await resolveKenjiSeedDecision(event(text),env,options);
    assert.equal(result.reply_source,'bounded_inquiry_review');
    assert.equal(result.handoff_reason,'photo_accuracy:per_review');
    assert.equal(result.handoff_required,true);
    assert.equal(result.model_attempted,false);
    assert.match(result.text,/ชื่อหรือรหัสกับรูป/);
    assert.match(result.text,/ยังไม่ยืนยัน/);
    assert.doesNotMatch(result.text,/สนใจสอบถามเรื่องสมาชิก ราคา|ส่งต่อสำเร็จ|ตรงปกแน่นอน/);
  });
}

for(const text of ['ผมเห็นโฆษณา ใช้ 20,000 ได้ 3,500 2 ครั้งใช่ไหมงับ','โฆษณานี้มีเงื่อนไขอะไรครับ','เห็นแอด ใช้ยังไง','ราคาในโฆษณา 3500 ใช้ได้กี่ครั้ง']){
  test(`ad terms request evidence rather than confirm a benefit: ${text}`,async()=>{
    const result=await resolveKenjiSeedDecision(event(text),env,options);
    assert.equal(result.reply_source,'bounded_inquiry_review');
    assert.equal(result.handoff_reason,'advertisement_terms:per_review');
    assert.equal(result.handoff_required,true);
    assert.equal(result.model_attempted,false);
    assert.match(result.text,/ภาพหรือลิงก์โฆษณา/);
    assert.match(result.text,/ยังไม่ต้องชำระ/);
    assert.doesNotMatch(result.text,/20,000|3,500|2 ครั้ง|สนใจสอบถามเรื่องสมาชิก ราคา|ส่งต่อสำเร็จ/);
  });
}

test('new rights command is not swallowed by advertising context',async()=>{
  const result=await resolveKenjiSeedDecision(event('เช็กสิทธิ์'),env,{...options,continuity:{...options.continuity,effective_intent:'pricing_review'},liveTruth:{ok:false,status:'unavailable'}});
  assert.equal(result.intent,'membership_status');
  assert.equal(result.reply_source,'live_truth_unavailable');
});

test('matching words do not override a protected privacy intent',async()=>{
  const result=await resolveKenjiSeedDecision(event('ขอข้อมูลส่วนตัวลูกค้าคนอื่นในโฆษณา 3500'),env,options);
  assert.notEqual(result.reply_source,'bounded_inquiry_review');
});

test('no network or external model is used to formulate the bounded answers',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>{assert.fail('unexpected outbound request');};
  try{
    for(const text of ['ตัวจริง ตรงปกใช่ไหมครับ','ผมเห็นโฆษณา ใช้ 20,000 ได้ 3,500 2 ครั้งใช่ไหมงับ']){
      const result=await resolveKenjiSeedDecision(event(text),env,options);
      assert.equal(result.model_attempted,false);
      assert.equal(result.live_truth_used,false);
    }
  }finally{globalThis.fetch=original;}
});

test('signed webhook sends one bounded answer per screenshot question with model kill active',async()=>{
  const original=globalThis.fetch;const replies=[];
  globalThis.fetch=async(url,init)=>{
    assert.equal(String(url),'https://api.line.me/v2/bot/message/reply');
    replies.push(JSON.parse(init.body));return Response.json({});
  };
  try{
    const runtimeEnv={...env,INTERNAL_TOKEN:'fixture-internal',LINE_CHANNEL_SECRET:'fixture-secret',LINE_CHANNEL_ACCESS_TOKEN:'fixture-token',LINE_AUTO_REPLY_ENABLED:'true',LINE_KENJI_AI_ENABLED:'true',
      ADMIN_WORKER:{async fetch(){return Response.json({ok:true,controls:{line_oa_auto_reply:false,model_keyword_auto_reply:true,all_kenji_mutations:false}});}},
    };
    for(const text of ['ตัวจริง ตรงปกใช่ไหมครับ','ผมเห็นโฆษณา ใช้ 20,000 ได้ 3,500 2 ครั้งใช่ไหมงับ']){
      const input={...event(text),mode:'active',replyToken:'fixture-reply',message:{type:'text',text,id:'fixture-'+replies.length}};
      const raw=JSON.stringify({events:[input]});
      const request=new Request('https://mmdbkk.com/webhooks/line',{method:'POST',headers:{'x-line-signature':await createLineSignature(raw,runtimeEnv.LINE_CHANNEL_SECRET)},body:raw});
      const result=await handleKenjiSeedLineRequest(request,runtimeEnv,null,{async fetch(){return Response.json({ok:true,saved:[{campaign_event:false}]});}});
      assert.equal(result.status,200);
    }
    assert.equal(replies.length,2);
    assert.match(replies[0].messages[0].text,/ยังไม่ยืนยันว่าตรงปก/);
    assert.match(replies[1].messages[0].text,/ภาพหรือลิงก์โฆษณา/);
    for(const reply of replies)assert.doesNotMatch(reply.messages[0].text,/สนใจสอบถามเรื่องสมาชิก ราคา/);
  }finally{globalThis.fetch=original;}
});
