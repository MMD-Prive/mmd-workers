import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMemberUpdates,listMmdNowItems,projectPublishedUpdates} from '../src/member-updates.js';
const published={id:'p',isDraft:false,isArchived:false,lastPublished:'2026-10-16T00:00:00Z',fieldData:{name:'News','short-summary':'Hello','news-content':'<script>bad()</script>','cover-image':{url:'https://cdn.prod.website-files.com/a.png'},'button-label':'Open','button-link':'javascript:alert(1)'}};
test('only live AND currently non-draft/non-archived published items are projected; rich text and unsafe CTA absent',()=>{
 const live=[published,{...published,id:'draft'},{...published,id:'archive'},{...published,id:'withdrawn'}];
 const staged=[published,{...published,id:'draft',isDraft:true},{...published,id:'archive',isArchived:true}];
 const result=projectPublishedUpdates(live,staged,10);assert.equal(result.length,1);assert.equal(result[0].id,'p');assert.ok(result[0].image_url);assert.equal(result[0].cta,undefined);assert.ok(!JSON.stringify(result).includes('<script>'));
 assert.deepEqual(projectPublishedUpdates(live,[],10),[]);
});
test('session required before CMS access and errors never become empty successful feed',async()=>{
 let calls=0;const env={WEBFLOW_CMS_TOKEN:'fixture',WEBFLOW_CMS_HTTP:{fetch:async()=>{calls++;return Response.json({items:[published],pagination:{total:1}})}}};
 const req=new Request('https://mmdbkk.com/api/v1/member/updates/list');
 assert.equal((await handleMemberUpdates(req,env,async()=>null)).status,401);assert.equal(calls,0);
 const session=async()=>({lineUserId:'verified',memberId:'M1',memberExists:true});
 let r=await handleMemberUpdates(req,env,session);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal((await r.json()).items.length,1);
 env.WEBFLOW_CMS_HTTP.fetch=async()=>Response.json({items:[]});r=await handleMemberUpdates(req,env,session);assert.equal(r.status,503);
});
test('binding-only fixture is accepted by list helper but handler stays fail-closed without token',async()=>{
 let calls=0;const binding={fetch:async()=>{calls++;return Response.json({items:[published],pagination:{total:1}})}};
 const req=new Request('https://mmdbkk.com/api/v1/member/updates/list');
 const session=async()=>({lineUserId:'verified',memberId:'M1',memberExists:true});
 assert.deepEqual(await listMmdNowItems({WEBFLOW_CMS_HTTP:binding},true),[published]);assert.equal(calls,1);
 calls=0;const response=await handleMemberUpdates(req,{WEBFLOW_CMS_HTTP:binding},session);
 assert.equal(response.status,503);assert.equal((await response.json()).error.code,'CMS_NOT_CONFIGURED');assert.equal(calls,0);
});
test('missing or invalid CMS capability is not treated as a configured upstream',async()=>{
 const req=new Request('https://mmdbkk.com/api/v1/member/updates/list');
 const session=async()=>({lineUserId:'verified',memberId:'M1',memberExists:true});
 for(const env of [{},{WEBFLOW_CMS_HTTP:{}},{WEBFLOW_CMS_HTTP:{fetch:true}}]) {
  await assert.rejects(listMmdNowItems(env,true));
  const response=await handleMemberUpdates(req,env,session);
  assert.equal(response.status,503);assert.equal((await response.json()).error.code,'CMS_NOT_CONFIGURED');
 }
});
test('malformed empty feed and upstream HTTP failures remain unavailable',async()=>{
 const req=new Request('https://mmdbkk.com/api/v1/member/updates/list');
 const session=async()=>({lineUserId:'verified',memberId:'M1',memberExists:true});
 for(const fetch of [async()=>Response.json({items:[]}),async()=>new Response('upstream error',{status:502})]) {
  const response=await handleMemberUpdates(req,{WEBFLOW_CMS_TOKEN:'fixture',WEBFLOW_CMS_HTTP:{fetch}},session);
  assert.equal(response.status,503);assert.equal((await response.json()).error.code,'CMS_UNAVAILABLE');
 }
});
test('valid empty published feed succeeds without inventing content',async()=>{
 const response=await handleMemberUpdates(new Request('https://mmdbkk.com/api/v1/member/updates/list'),
  {WEBFLOW_CMS_TOKEN:'fixture',WEBFLOW_CMS_HTTP:{fetch:async()=>Response.json({items:[],pagination:{total:0}})}},
  async()=>({lineUserId:'verified',memberId:'M1',memberExists:true}));
 assert.equal(response.status,200);assert.deepEqual((await response.json()).items,[]);
});
test('CMS uses manual redirect mode and rejects 3xx without following Location',async()=>{
 for(const status of [301,302,303,307,308]){
  let calls=0;
  await assert.rejects(listMmdNowItems({WEBFLOW_CMS_TOKEN:'fixture',WEBFLOW_CMS_HTTP:{fetch:async request=>{
   calls++;assert.equal(request.redirect,'manual');assert.equal(new URL(request.url).hostname,'api.webflow.com');
   return new Response(null,{status,headers:{location:'https://untrusted.invalid/private'}});
  }}},true),/cms_unavailable/);
  assert.equal(calls,1);
 }
});
test('read diagnostics contain only status and fixed outcome, never identity or upstream exception',async()=>{
 const original=console.info,logs=[];console.info=(...args)=>logs.push(args);
 try {
  const req=new Request('https://mmdbkk.com/api/v1/member/updates/list');
  const session=async()=>({lineUserId:'private-subject',memberId:'private-member',memberExists:true});
  await handleMemberUpdates(req,{},session);
  await handleMemberUpdates(req,{WEBFLOW_CMS_TOKEN:'private-token',WEBFLOW_CMS_HTTP:{fetch:async()=>{throw Error('private-upstream-payload');}}},session);
  assert.deepEqual(logs,[['member_updates_read',{status:503,outcome:'CMS_NOT_CONFIGURED'}],['member_updates_read',{status:503,outcome:'CMS_UNAVAILABLE'}]]);
 } finally {console.info=original;}
});
