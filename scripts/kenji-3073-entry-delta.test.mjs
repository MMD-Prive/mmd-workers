import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {buildEntryDelta,BASELINE_HASH,sha} from './kenji-3073-entry-delta.mjs';
const path=process.env.KENJI_ENTRY_BASELINE;
test('exact source/baseline delta is reversible and syntax valid',{skip:!path},()=>{
 const bytes=fs.readFileSync(path);assert.equal(sha(bytes),BASELINE_HASH);const r=buildEntryDelta(bytes);
 execFileSync(process.execPath,['--input-type=module','--check'],{input:r.candidate,stdio:['pipe','pipe','pipe']});
 assert.equal(r.manifest.patches.length,4);assert.equal(r.manifest.release_ready,false);
 assert.equal(sha(r.candidate),'6e29bbf1bba44739749a8f5e4ee950b61dc640a85d653f4626feaa72f857ae47');
 assert.throws(()=>buildEntryDelta(Buffer.concat([bytes,Buffer.from(' ')])),/baseline drift/);
});
test('full candidate loads in workerd; actual patched functions retain controls and single transport grant',{skip:!path},async()=>{
 const {Miniflare}=await import('../member-pages-worker/test-runtime/node_modules/miniflare/dist/src/index.js');
 const bytes=buildEntryDelta(fs.readFileSync(path)).candidate.toString();
 const entry=`import {runApprovedCategoryTurn,isExplicitCategoryCommand,categoryReplyTransportAllowed} from './worker.js';
 export default {async fetch(request){const input=await request.json();const now=Date.parse('2026-11-05T12:00:00+07:00');
 const env={KENJI_LINE_REPLY_CATEGORY_MODE:'approved_qa_promo',KENJI_LINE_APPROVED_PROMO_ENABLED:'true',LINE_AUTO_REPLY_ENABLED:'true',LINE_KENJI_AI_ENABLED:'true',LINE_KENJI_MODEL_ENABLED:'false'};
 const runtime={ok:true,controls:{model_keyword_auto_reply:true,...(input.pause?{line_oa_auto_reply:true}:{})}};
 const event={type:'message',mode:'active',timestamp:now,replyToken:'fixture',source:{type:'user',userId:'U'+'1'.repeat(32)},message:{type:'text',text:input.text}};
 const sent=[];const io={now,continuity:async()=>({available:true,matrix:{last_customer_intent:'booking',payload_json:{model_name:'Hiro'}}}),runtime:async()=>runtime,owner:async()=>({ok:true,active:!!input.takeover}),send:async(e,t,text,button)=>{if(!categoryReplyTransportAllowed(e,t,text,button))throw Error('grant failed');sent.push(text);return {ok:true,status:200};}};
 const r=await runApprovedCategoryTurn(env,event,runtime,io);return Response.json({explicit:isExplicitCategoryCommand(event,env),delivered:r.delivered,text:r.decision.text,sent:sent.length});}};`;
 let external=0;const mf=new Miniflare({workers:[{config:{name:'fixture',type:'worker',compatibilityDate:'2026-07-02',compatibilityFlags:[],manifest:{mainModule:'entry.mjs',modulesRoot:'/private/tmp',modules:{'entry.mjs':{type:'esm',contents:entry},'worker.js':{type:'esm',contents:bytes+'\nexport {runApprovedCategoryTurn,isExplicitCategoryCommand,categoryReplyTransportAllowed};'}}}},dev:{outboundService:{type:'fetcher',handler:()=>{external++;throw Error('external forbidden');}}}}]});
 const call=async body=>{const r=await mf.dispatchFetch('https://fixture.invalid/test',{method:'POST',body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
 try{
 for(const text of ['รู้จัก MMD / สมาชิก','โปรเดือนนี้','น้องมาใหม่','สนใจสมัครงาน','โปรสมาชิก','checkpts','package','regis','apply','เช็กสมาชิกของฉัน']) {
  const r=await call({text});assert.equal(r.explicit,true);assert.equal(r.delivered,true);assert.equal(r.sent,1);assert(!r.text.includes('Hiro'));
  assert.equal((await call({text,pause:true})).sent,0);assert.equal((await call({text,takeover:true})).sent,0);
 }
 for(const text of ['สวัสดี','MMD คืออะไร','จอง','Hiro']) assert.equal((await call({text})).sent,0);
 assert.equal(external,0);
 }finally{await mf.dispose();}
});
