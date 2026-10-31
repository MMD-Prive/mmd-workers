import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const dir=new URL('../webflow/internal/admin/mmd-review/',import.meta.url);
const html=await readFile(new URL('review.html',dir),'utf8'), js=await readFile(new URL('review.js',dir),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,15));
async function setup({failure,broken=false,offscreen=false,fileFailure=false,forceQueues=false}={}) {
 const dom=new JSDOM(html,{url:'https://example.test/internal/admin/mmd-review',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window, requests=[],revoked=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 if(offscreen) w.IntersectionObserver=class {observe(){} unobserve(){} disconnect(){}};
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=u=>revoked.push(u);
 const items=[{id:'one',model_id:'recTest',model_name:'Test',name:'public.jpg',kind:'public_pic',audience:'public',status:'pending_review',reviewable:true}, {id:'two',model_id:'recTest',model_name:'Test',name:'private.jpg',kind:'private_pic',audience:'private',teaser_safe:true,status:'pending_review',reviewable:true}, {id:'clip',model_id:'recTest',name:'clip.mp4',kind:'private_clip',audience:'private',status:'pending_review',reviewable:true}];
 if(offscreen) items.splice(0,1,...Array.from({length:6},(_,i)=>({...items[0],id:'public'+i,name:'public'+i+'.jpg'})));
 w.fetch=async(url,opts)=>{const body=opts.body?JSON.parse(opts.body):null; requests.push({url,body});
 if(url.endsWith('/decision'))return {ok:body.media_asset_id===failure?false:true,status:409,json:async()=>({ok:true})};
 if(url.endsWith('/file') && fileFailure)return {ok:false,status:503};
 if(url.endsWith('/file'))return {ok:true,headers:{get:()=>broken?'':'a'.repeat(64)},blob:async()=>({type:'image/jpeg',size:100})};
 return {ok:true,json:async()=>({ok:true,items,next_cursor:null})};};
 // Test-only adapter bypasses the UI serialization guard, leaving response handling unchanged.
 w.eval(forceQueues?js.replace('  load(false);\n}());', "  window.forceQueue = function (status, more) { loading = false; q('filter').value = status; return load(more); };\n  load(false);\n}());"):js);await tick();
 w.document.querySelectorAll('.mr-thumbnail img').forEach(img=>img.dispatchEvent(new w.Event('load')));await tick();
 return {w,requests,revoked,close:()=>w.close()};
}
async function selectAll(w){for(const b of w.document.querySelectorAll('.mr-group-heading button')){b.click();await tick();}}
function confirm(w){const c=w.document.querySelector('#mr-batch-confirm');c.checked=true;c.dispatchEvent(new w.Event('change'));}
test('grid preview never writes decisions; group selection preserves separate public/private and requires confirmation',async()=>{
 const t=await setup();try{
 assert.equal(t.w.document.querySelectorAll('.mr-thumbnail img').length,2);
 assert.equal(t.w.document.querySelectorAll('.mr-group').length,2);
 assert.equal(t.requests.filter(r=>r.url.endsWith('/decision')).length,0);
 await selectAll(t.w);assert.equal(t.w.document.querySelector('#mr-batch-approve').disabled,true);
 confirm(t.w);t.w.document.querySelector('#mr-batch-approve').click();t.w.document.querySelector('#mr-batch-approve').click();await tick();
 const calls=t.requests.filter(r=>r.url.endsWith('/decision'));
 assert.equal(calls.length,2);assert.equal(calls[0].body.teaser_safe,false);assert.equal(calls[1].body.teaser_safe,true);
 assert(calls.every(r=>r.body.expected_status==='pending_review' && r.body.media_sha256==='a'.repeat(64)));
 assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,0);
 }finally{t.close();}
});
test('partial failure retains only failed selection, invalidates hash and prevents blind retry',async()=>{
 const t=await setup({failure:'two'});try{await selectAll(t.w);confirm(t.w);t.w.document.querySelector('#mr-batch-approve').click();await tick();
 assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,1);
 confirm(t.w);assert.equal(t.w.document.querySelector('#mr-batch-approve').disabled,true);
 assert.match(t.w.document.querySelector('#mr-status').textContent,/ยังยืนยันไม่ได้/);
 }finally{t.close();}
});
test('missing digest never enables batch selection',async()=>{const t=await setup({broken:true});try{await selectAll(t.w);assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,0);}finally{t.close();}});
test('hiding page removes thumbnails, selections and object URLs',async()=>{const t=await setup();try{await selectAll(t.w);t.w.dispatchEvent(new t.w.Event('pagehide'));assert.equal(t.w.document.querySelectorAll('.mr-thumbnail img').length,0);assert.equal(t.revoked.length,2);assert.equal(t.w.document.querySelector('#mr-batch').hidden,true);}finally{t.close();}});

test('closing a full-size preview preserves grid and batch selection',async()=>{const t=await setup();try{await selectAll(t.w);t.w.document.querySelector('.mr-card button').click();await tick();t.w.document.querySelector('#mr-close').click();assert.equal(t.w.document.querySelectorAll('.mr-card').length,3);assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,2);}finally{t.close();}});

test('group button loads offscreen images with at most three requests at a time, then selects all successful images',async()=>{
 const t=await setup({offscreen:true});try{
  assert.equal(t.requests.filter(r=>r.url.endsWith('/file')).length,0);
  const button=t.w.document.querySelector('.mr-group-heading button');button.click();await tick();
  assert.equal(t.requests.filter(r=>r.url.endsWith('/file')).length,3);
  assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,0);
  t.w.document.querySelectorAll('.mr-thumbnail img').forEach(img=>img.dispatchEvent(new t.w.Event('load')));await tick();
  assert.equal(t.requests.filter(r=>r.url.endsWith('/file')).length,6);
  const images=[...t.w.document.querySelectorAll('.mr-thumbnail img')];
  images.slice(3).forEach((img,i)=>img.dispatchEvent(new t.w.Event(i===0?'error':'load')));await tick();
  assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,5);
  assert.match(t.w.document.querySelector('.mr-group [role=status]').textContent,/เปิดไม่ได้ 1/);
  assert.equal(t.w.document.querySelectorAll('.mr-thumbnail')[3].textContent,'โหลดรูปไม่สำเร็จ · ลองโหลดคิวใหม่');
  assert.equal(t.requests.filter(r=>r.url.endsWith('/decision')).length,0);
  button.click();await tick();assert.equal(t.requests.filter(r=>r.url.endsWith('/file')).length,6);
 }finally{t.close();}
});
test('clearing while group is loading cancels late selection',async()=>{
 const t=await setup({offscreen:true});try{
  t.w.document.querySelector('.mr-group-heading button').click();await tick();
  // The sticky selection bar is hidden until something is selected; refresh cancels a pending group too.
  t.w.document.querySelector('#mr-clear').click();
  for(let i=0;i<3;i++){t.w.document.querySelectorAll('.mr-thumbnail img').forEach(img=>img.dispatchEvent(new t.w.Event('load')));await tick();}
  assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,0);
  assert.equal(t.w.document.querySelector('#mr-batch-confirm').checked,false);
 }finally{t.close();}
});

test('HTTP preview failure replaces loading text and remains unselectable',async()=>{const t=await setup({fileFailure:true});try{await selectAll(t.w);assert.equal(t.w.document.querySelector('.mr-thumbnail').textContent,'โหลดรูปไม่สำเร็จ · ลองโหลดคิวใหม่');assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,0);assert.equal(t.requests.filter(r=>r.url.endsWith('/decision')).length,0);}finally{t.close();}});

function holdQueues(t) {
 const original=t.w.fetch, pending=[];
 t.w.fetch=(url,opts)=>{
  if(!url.includes('?')) return original(url,opts);
  return new Promise((resolve,reject)=>pending.push({resolve,reject,url}));
 };
 return pending;
}
function queueResponse(id, cursor=null) {
 return {ok:true,json:async()=>({ok:true,items:['public','private'].map(a=>({id:id+'-'+a,model_id:'recTest',model_name:'Test',name:id+'-'+a+'.jpg',kind:a+'_pic',audience:a,status:'pending_review',reviewable:true})),next_cursor:cursor})};
}
for(const order of ['latest-first','old-first','stale-error']) test('forced queue responses: '+order+' preserves latest queue, controls, cursor and cleared selection',async()=>{
 const t=await setup({forceQueues:true});try{
  await selectAll(t.w);assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,2);
  const pending=holdQueues(t);
  const a=t.w.forceQueue('approved'),b=t.w.forceQueue('pending_review');
  assert.equal(pending.length,2);
  assert.equal(t.w.document.querySelectorAll('.mr-card').length,0);
  if(order==='old-first'){
   pending[0].resolve(queueResponse('old','stale-cursor'));await a;
   assert.equal(t.w.document.querySelectorAll('.mr-card').length,0);
   assert.equal(t.w.document.querySelector('#mr-filter').disabled,true);
  }
  pending[1].resolve(queueResponse('latest','latest-cursor'));await b;await tick();
  // A selection made in the latest queue must also survive a stale completion.
  t.w.document.querySelectorAll('.mr-thumbnail img').forEach(img=>img.dispatchEvent(new t.w.Event('load')));await tick();
  await selectAll(t.w);
  if(order==='latest-first') pending[0].resolve(queueResponse('old','stale-cursor'));
  if(order==='stale-error') pending[0].reject(Object.assign(new Error('stale failure'),{status:401}));
  await a;await tick();
  assert.deepEqual([...t.w.document.querySelectorAll('.mr-card h3')].map(x=>x.textContent),['latest-public.jpg','latest-private.jpg']);
  assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,2);
  assert.equal(t.w.document.querySelector('#mr-filter').value,'pending_review');
  assert.equal(t.w.document.querySelector('#mr-filter').disabled,false);
  assert.match(t.w.document.querySelector('#mr-status').textContent,/แสดง 2 รายการ/);
  const more=t.w.forceQueue('pending_review',true);
  assert.equal(new URL(pending[2].url,'https://example.test').searchParams.get('cursor'),'latest-cursor');
  pending[2].resolve({ok:true,json:async()=>({items:[],next_cursor:null})});await more;
  assert.equal(t.requests.filter(r=>r.url.endsWith('/decision')).length,0);
 }finally{t.close();}
});
test('pagehide invalidates an outstanding metadata response and cannot restore old cards or selection',async()=>{
 const t=await setup({forceQueues:true});try{
  await selectAll(t.w);const pending=holdQueues(t),a=t.w.forceQueue('approved');
  t.w.dispatchEvent(new t.w.Event('pagehide'));
  pending[0].resolve(queueResponse('hidden'));await a;await tick();
  assert.equal(t.w.document.querySelectorAll('.mr-card').length,0);
  assert.equal(t.w.document.querySelectorAll('.mr-pick input:checked').length,0);
  assert.equal(t.requests.filter(r=>r.url.endsWith('/decision')).length,0);
 }finally{t.close();}
});
