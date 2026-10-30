import assert from 'node:assert/strict';
import {test} from 'node:test';
import worker,{resolveKenjiLineReply,createLineSignature} from '../src/index.js';
import {EMS_ALBUM_URL,isEmsAlbumCommand} from '../../shared/ems-album-navigation.mjs';
// The configured entry re-exports this fetch implementation; its separate
// Cloudflare WorkerEntrypoint RPC class is verified by the Worker bundle build.
import publicOwner from '../src/my-mms-customer-front-gate-entry.js';
import {handleLiffMemberShell} from '../../member-pages-worker/src/liff-member-shell.js';
const event=text=>({type:'message',mode:'active',source:{type:'user',userId:'U'+'1'.repeat(32)},replyToken:'fixture-reply',message:{id:'fixture-message',type:'text',text}});

test('collection requests navigate directly while individual codes, rates and GWs keep their old handlers',async()=>{
 for(const text of ['ขอดูอัลบั้ม EMs','ดู EMs ครับ','EMs albums','EMS']){assert.ok(isEmsAlbumCommand(text));const reply=await resolveKenjiLineReply(event(text));assert.equal(reply.reply_source,'ems_album_navigation_v1');assert.doesNotMatch(reply.text,/EMs\d|ได้สิทธิ์ทั้งหมด|20,000/);}
 for(const text of ['EMs04','ขอเรท EMs','อัลบั้ม GWs','ดู EMs04','EMs https://evil.example'])assert.equal(isEmsAlbumCommand(text),false,text);
});

test('signed webhook emits the album URI button only through existing enabled reply gates',async()=>{
 const original=globalThis.fetch,replies=[];
 globalThis.fetch=async(url,init)=>{assert.equal(String(url),'https://api.line.me/v2/bot/message/reply');replies.push(JSON.parse(init.body));return Response.json({});};
 try{
  for(const [enabled,mode,kill,count]of [['true','active',false,1],['false','active',false,0],['true','standby',false,0],['true','active',true,0]]){
   const env={INTERNAL_TOKEN:'fixture-internal',LINE_CHANNEL_SECRET:'fixture-secret',LINE_CHANNEL_ACCESS_TOKEN:'fixture-token',LINE_KENJI_AI_ENABLED:'true',LINE_AUTO_REPLY_ENABLED:enabled,ADMIN_WORKER:{fetch:async()=>Response.json({ok:true,controls:{line_oa_auto_reply:kill,model_keyword_auto_reply:false,all_kenji_mutations:false}})}};
   const body=JSON.stringify({events:[{...event('ขอดูอัลบั้ม EMs'),mode}]});const before=replies.length;
   const response=await worker.fetch(new Request('https://worker/webhooks/line',{method:'POST',body,headers:{'content-type':'application/json','x-line-signature':await createLineSignature(body,env.LINE_CHANNEL_SECRET)}}),env);
   assert.equal(response.status,200);assert.equal(replies.length-before,count);
   if(count){const action=replies.at(-1).messages[0].quickReply.items[0].action;assert.deepEqual(action,{type:'uri',label:'ดูอัลบั้ม EMs',uri:EMS_ALBUM_URL});}
  }
 }finally{globalThis.fetch=original;}
});

test('configured public route owner forwards album paths and preserves the LIFF album return hint',async()=>{
 const calls=[],env={MEMBER_PAGES_WORKER:{fetch:async request=>{
  calls.push({path:new URL(request.url).pathname,cookie:request.headers.get('cookie')});
  return new URL(request.url).pathname==='/member/liff'
   ?handleLiffMemberShell(request,{LINE_LIFF_ID:'fixture'})
   :Response.json({ok:true,items:[]},{headers:{'cache-control':'private, no-store'}});
 }}};
 for(const path of ['/api/member/app/albums/ems','/api/member/app/albums/ems/EMs04','/api/member/app/albums/ems/EMs04/photos/media_album-a']){
  const response=await publicOwner.fetch(new Request('https://www.mmdbkk.com'+path,{headers:{cookie:'fixture-session'}}),env);
  assert.equal(response.status,200);assert.equal(calls.at(-1).path,path);assert.equal(calls.at(-1).cookie,'fixture-session');assert.match(response.headers.get('cache-control'),/no-store/);
 }
 const response=await publicOwner.fetch(new Request('https://www.mmdbkk.com/member/liff?intent=status&return_to=albums_ems'),env);
 assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes('"returnTo":"/my-mmd/albums/ems"'));
});

test('album collection, detail and menu SSR links stay under MY MMD before hydration',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response('<html><head></head><body><a href="/albums/ems">Albums</a><a href="/albums/ems/EMs04">Model</a><a href="/menu">Menu</a><a href="/services">Other</a></body></html>',{headers:{'content-type':'text/html'}});
 try{
  const response=await publicOwner.fetch(new Request('https://www.mmdbkk.com/my-mmd/albums/ems'),{});
  const html=await response.text();
  for(const href of ['/my-mmd/albums/ems','/my-mmd/albums/ems/EMs04','/my-mmd/menu','/services'])assert.ok(html.includes(`href="${href}"`),href);
 }finally{globalThis.fetch=original;}
});
