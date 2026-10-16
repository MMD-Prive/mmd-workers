import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMemberUpdates,projectPublishedUpdates} from '../src/member-updates.js';
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
