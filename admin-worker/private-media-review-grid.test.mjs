import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const dir=new URL('../webflow/internal/admin/mmd-review/',import.meta.url);
const html=await readFile(new URL('review.html',dir),'utf8'), js=await readFile(new URL('review.js',dir),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,15));
async function setup({failure,broken=false}={}) {
 const dom=new JSDOM(html,{url:'https://example.test/internal/admin/mmd-review',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window, requests=[],revoked=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=u=>revoked.push(u);
 const items=[{id:'one',model_id:'recTest',model_name:'Test',name:'public.jpg',kind:'public_pic',audience:'public',status:'pending_review',reviewable:true}, {id:'two',model_id:'recTest',model_name:'Test',name:'private.jpg',kind:'private_pic',audience:'private',teaser_safe:true,status:'pending_review',reviewable:true}, {id:'clip',model_id:'recTest',name:'clip.mp4',kind:'private_clip',audience:'private',status:'pending_review',reviewable:true}];
 w.fetch=async(url,opts)=>{const body=opts.body?JSON.parse(opts.body):null; requests.push({url,body});
 if(url.endsWith('/decision'))return {ok:body.media_asset_id===failure?false:true,status:409,json:async()=>({ok:true})};
 if(url.endsWith('/file'))return {ok:true,headers:{get:()=>broken?'':'a'.repeat(64)},blob:async()=>({type:'image/jpeg',size:100})};
 return {ok:true,json:async()=>({ok:true,items,next_cursor:null})};};
 w.eval(js);await tick();
 w.document.querySelectorAll('.mr-thumbnail img').forEach(img=>img.dispatchEvent(new w.Event('load')));await tick();
 return {w,requests,revoked,close:()=>w.close()};
}
function selectAll(w){w.document.querySelectorAll('.mr-group-heading button').forEach(b=>b.click());}
function confirm(w){const c=w.document.querySelector('#mr-batch-confirm');c.checked=true;c.dispatchEvent(new w.Event('change'));}
test('grid preview never writes decisions; group selection preserves separate public/private and requires confirmation',async()=>{
 const t=await setup();try{
 assert.equal(t.w.document.querySelectorAll('.mr-thumbnail img').length,2);
 assert.equal(t.w.document.querySelectorAll('.mr-group').length,2);
 assert.equal(t.requests.filter(r=>r.url.endsWith('/decision')).length,0);
 selectAll(t.w);assert.equal(t.w.document.querySelector('#mr-batch-approve').disabled,true);
 confirm(t.w);t.w.document.querySelector('#mr-batch-approve').click();t.w.document.querySelector('#mr-batch-approve').click();await tick();
 const calls=t.requests.filter(r=>r.url.endsWith('/decision'));
 assert.equal(calls.length,2);assert.equal(calls[0].body.teaser_safe,false);assert.equal(calls[1].body.teaser_safe,true);
 assert(calls.every(r=>r.body.expected_status==='pending_review' && r.body.media_sha256==='a'.repeat(64)));
 assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,0);
 }finally{t.close();}
});
test('partial failure retains only failed selection, invalidates hash and prevents blind retry',async()=>{
 const t=await setup({failure:'two'});try{selectAll(t.w);confirm(t.w);t.w.document.querySelector('#mr-batch-approve').click();await tick();
 assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,1);
 confirm(t.w);assert.equal(t.w.document.querySelector('#mr-batch-approve').disabled,true);
 assert.match(t.w.document.querySelector('#mr-status').textContent,/ยังยืนยันไม่ได้/);
 }finally{t.close();}
});
test('missing digest never enables batch selection',async()=>{const t=await setup({broken:true});try{selectAll(t.w);assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,0);}finally{t.close();}});
test('hiding page removes thumbnails, selections and object URLs',async()=>{const t=await setup();try{selectAll(t.w);t.w.dispatchEvent(new t.w.Event('pagehide'));assert.equal(t.w.document.querySelectorAll('.mr-thumbnail img').length,0);assert.equal(t.revoked.length,2);assert.equal(t.w.document.querySelector('#mr-batch').hidden,true);}finally{t.close();}});

test('closing a full-size preview preserves grid and batch selection',async()=>{const t=await setup();try{selectAll(t.w);t.w.document.querySelector('.mr-card button').click();await tick();t.w.document.querySelector('#mr-close').click();assert.equal(t.w.document.querySelectorAll('.mr-card').length,3);assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,2);}finally{t.close();}});
