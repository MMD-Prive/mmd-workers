import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {phase2MyStatusReply,membershipUriButton,withCategoryReplyGrant,categoryReplyTransportAllowed,restrictedReplyCategories} from '../src/kenji-reply-category-gate.mjs';

const url='https://www.mmdbkk.com/member/liff?intent=status&world=public', label='เช็กสิทธิ์และต่ออายุ';
const old='https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=overview';
const ems='https://example.com/ems', gws='https://example.com/gws';
const source=readFileSync(new URL('../src/kenji-seed-line-runtime.mjs',import.meta.url),'utf8');
const start=source.indexOf('async function sendReply('), end=source.indexOf('\nasync function runLegacyShadow(',start);
assert.ok(start>=0 && end>start);
const env={KENJI_LINE_REPLY_CATEGORY_MODE:'approved_qa_promo',KENJI_LINE_APPROVED_PROMO_ENABLED:'true',LINE_CHANNEL_ACCESS_TOKEN:'fixture-only'};
const now=Date.parse('2026-11-30T23:59:59.999+07:00');
function fixture(){
  const posts=[];
  const send=runInNewContext('('+source.slice(start,end).trim()+')',{
    categoryReplyTransportAllowed,restrictedReplyCategories,text:v=>String(v??'').trim(),
    LINE_REPLY_URL:'https://api.line.me/v2/bot/message/reply',EMS_ALBUMS_URL:ems,GWS_ALBUMS_URL:gws,
    fetch:async(u,req)=>{ assert.equal(u,'https://api.line.me/v2/bot/message/reply');assert.equal(req.method,'POST');posts.push(JSON.parse(req.body));return {ok:true,status:200};},
  });
  return {send,posts};
}
for(const text of ['CARE BACK','โปรเดือนนี้','โปรสมาชิก'])test(text+' serializes exact LINE quick reply',async()=>{
  const {send,posts}=fixture();
  const d=phase2MyStatusReply({type:'message',message:{type:'text',text},source:{type:'user'}},env,now);
  const r=await send(withCategoryReplyGrant(env,'fixture',d),'fixture',d.text,membershipUriButton(d));
  assert.equal(r.ok,true);
  assert.equal(posts.length,1);assert.equal(posts[0].messages.length,1);
  const m=posts[0].messages[0];
  assert.equal(m.text.split('\n').at(-1),url);
  assert.deepEqual(m.quickReply.items,[{type:'action',action:{type:'uri',label,uri:url}}]);
  assert.doesNotMatch(m.text,/\+90|\+180/);
});
test('forged button or altered text does not send',async()=>{
  const {send,posts}=fixture();
  const d=phase2MyStatusReply({type:'message',message:{type:'text',text:'CARE BACK'},source:{type:'user'}},env,now);
  const granted=withCategoryReplyGrant(env,'fixture',d);
  for(const [text,button] of [[d.text,{label,uri:'https://example.com'}],[d.text+'\nextra',membershipUriButton(d)]]){
    const res=await send(granted,'fixture',text,button);
    assert.equal(res.suppressed,true);
  }
  assert.equal(posts.length,0);
});
test('existing My MMD and album buttons stay unchanged; new pair is restricted',async()=>{
  const {send,posts}=fixture();
  const d={text:'เปิด My MMD → '+old,intent:'approved_command',reply_source:'category_checkpts',cta_route:old};
  assert.equal((await send(withCategoryReplyGrant(env,'fixture',d),'fixture',d.text,membershipUriButton(d))).ok,true);
  assert.equal(posts[0].messages[0].quickReply.items[0].action.label,'เปิด My MMD');
  for(const [uri,label] of [[ems,'ดูอัลบั้ม EMs'],[gws,'ดูอัลบั้ม GWs']]){
    await send({LINE_CHANNEL_ACCESS_TOKEN:'fixture-only'},'fixture','Album',{uri,label});
    assert.deepEqual(posts.at(-1).messages[0].quickReply.items[0].action,{type:'uri',label,uri});
  }
  await send({LINE_CHANNEL_ACCESS_TOKEN:'fixture-only'},'fixture',url,{label,uri:url});
  assert.equal(posts.at(-1).messages[0].quickReply,undefined);
});
