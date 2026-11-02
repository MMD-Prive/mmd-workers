import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {renderMemberBooking,createMemberBookingUI} from '../src/liff-member-booking.js';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const model='recEligible0000001';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(api,returnModel="",seed={}){
 const dom=new JSDOM(renderMemberBooking(),{url:'https://mmdbkk.com/member/liff?view=jobs',runScripts:'outside-only'});
 for(const [k,v] of Object.entries(seed))dom.window.sessionStorage.setItem(k,v);
 let account='account_a';
 const ui=runInNewContext('('+createMemberBookingUI.toString()+')',{sessionStorage:dom.window.sessionStorage,crypto}).call(null,dom.window.document.querySelector('section'),api,()=>account,returnModel);
 return {dom,d:dom.window.document,ui,storage:()=>Object.fromEntries(Object.entries(dom.window.sessionStorage)),switchAccount:()=>{account='account_b';ui.reset();}};
}
test('search, select, submit once and readback render customer-safe text; changing model does not submit',async()=>{
 let posts=0;const f=fixture(async(path,init={},isCurrent)=>{
  assert.equal(isCurrent(),true);
  if(path.includes('/search'))return Response.json({ok:true,items:[{model_id:model,display_name:'<script>fixture</script>'}]});
  if(init.method==='POST'){posts++;return Response.json({ok:true,request_ref:'fixture_reference',status:'request_pending_admin_review'});}
  return Response.json({ok:true,items:[{request_ref:'fixture_reference',date:'2099-01-01',time:'18:00'}]});
 });
 try{
 const search=f.d.querySelector('[data-booking-search]');search.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));await tick();
 assert.equal(f.d.querySelectorAll('script').length,0);f.d.querySelector('[data-booking-results] button').click();
 f.d.querySelector('[data-booking-change]').click();assert.equal(f.d.querySelector('[data-booking-details]').hidden,true);assert.equal(posts,0);
 f.d.querySelector('[data-booking-results] button').click();const details=f.d.querySelector('[data-booking-details]');Object.assign(details.elements.date,{value:'2099-01-01'});details.elements.time.value='18:00';details.elements.area.value='Bangkok';
 details.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));details.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));await tick();await tick();
 assert.equal(posts,1);assert.match(f.d.querySelector('[data-booking-list]').textContent,/fixture_reference/);assert.match(f.d.querySelector('[data-booking-message]').textContent,/ยังไม่ใช่การยืนยันงาน/);
 }finally{f.dom.window.close();}
});
test('stale account search response cannot restore models or old account details',async()=>{
 let release;const f=fixture(()=>new Promise(resolve=>release=resolve));
 try{f.d.querySelector('[data-booking-search]').dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));f.switchAccount();release(Response.json({ok:true,items:[{model_id:model,display_name:'Account A'}]}));await tick();assert.equal(f.d.querySelector('[data-booking-results]').children.length,0);assert.equal(f.d.querySelector('[data-booking-details]').hidden,true);}finally{f.dom.window.close();}
});
test('search failure and no results remain distinct and no synthetic percent appears',async()=>{
 let good=false;const f=fixture(async()=>good?Response.json({ok:true,items:[]}):Response.json({ok:false},{status:503}));
 try{const form=f.d.querySelector('[data-booking-search]');form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));await tick();assert.match(f.d.querySelector('[data-booking-message]').textContent,/ยังค้นหาไม่ได้/);good=true;form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));await tick();assert.match(f.d.querySelector('[data-booking-message]').textContent,/ยังไม่พบ/);assert.doesNotMatch(f.d.body.textContent,/%/);}finally{f.dom.window.close();}
});

test('approved model selector resumes after authentication and remains subject to search visibility',async()=>{
 for(const allowed of [true,false]){
  const f=fixture(async path=>Response.json(path.includes('/search')?{ok:true,items:allowed?[{model_id:model,display_name:'Resumed'}]:[]}:{ok:true,items:[]}),model);
  try{await f.ui.load();assert.equal(f.d.querySelector('[data-booking-details]').hidden,!allowed);if(allowed)assert.match(f.d.querySelector('[data-booking-selected]').textContent,/Resumed/);}finally{f.dom.window.close();}
 }
});

test('leaving the view invalidates a queued submit before network execution',async()=>{
 let submitGuard,release;const f=fixture(async(path,init={},valid)=>{
  if(path.includes('/search'))return Response.json({ok:true,items:[{model_id:model,display_name:'Fixture'}]});
  if(init.method==='POST'){submitGuard=valid;return new Promise(resolve=>release=resolve);}
  return Response.json({ok:true,items:[]});
 });
 try{
  f.d.querySelector('[data-booking-search]').dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));await tick();f.d.querySelector('[data-booking-results] button').click();
  const form=f.d.querySelector('[data-booking-details]');form.elements.date.value='2099-01-01';form.elements.time.value='18:00';form.elements.area.value='Bangkok';
  form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));assert.equal(submitGuard(),true);f.ui.leave();assert.equal(submitGuard(),false);
  release(Response.json({ok:true,request_ref:'stale'}));await tick();assert.doesNotMatch(f.d.querySelector('[data-booking-message]').textContent,/รับคำขอแล้ว/);
 }finally{f.dom.window.close();}
});

test('reload reconciles the exact previous request, permits explicit new only after owned readback, and renders closed status',async()=>{
 const ref='mmdreq_'+'e'.repeat(64);let token='';
 const api=async(path,init={})=>{if(path.includes('/context'))return Response.json({ok:true,scopes:['public']});if(path.includes('/search'))return Response.json({ok:true,items:[{model_id:model,display_name:'Fixture'}]});if(init.method==='POST'){token=JSON.parse(init.body).request_id;return Response.json({ok:true,request_ref:ref});}return Response.json({ok:true,active_request_ref:ref,items:[{request_ref:ref,status:'closed'}]});};
 const f=fixture(api);let seed;
 try{f.d.querySelector('[data-booking-search]').dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));await tick();f.d.querySelector('[data-booking-results] button').click();const form=f.d.querySelector('[data-booking-details]');form.elements.date.value='2099-01-01';form.elements.time.value='18:00';form.elements.area.value='Bangkok';form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));await tick();await tick();seed=f.storage();assert.ok(Object.values(seed).includes(token));}finally{f.dom.window.close();}
 const reloaded=fixture(api,'',seed);try{await reloaded.ui.load();assert.equal(reloaded.d.querySelector('[data-booking-new]').hidden,false);assert.match(reloaded.d.querySelector('[data-booking-list]').textContent,/ปิดคำขอแล้ว/);reloaded.d.querySelector('[data-booking-new]').click();await tick();assert.deepEqual(reloaded.storage(),{});}finally{reloaded.dom.window.close();}
 const wrong=fixture(async()=>Response.json({ok:true,scopes:['public'],active_request_ref:ref,items:[{request_ref:'other',status:'closed'}]}),'',seed);try{await wrong.ui.load();assert.equal(wrong.d.querySelector('[data-booking-new]').hidden,true);}finally{wrong.dom.window.close();}
});
test('definite no-write rejection clears only that attempt and allows corrected retry',async()=>{
 const bodies=[];const f=fixture(async(path,init={})=>{if(path.includes('/search'))return Response.json({ok:true,items:[{model_id:model,display_name:'Fixture'}]});if(init.method==='POST'){bodies.push(JSON.parse(init.body));return Response.json({ok:false,error:'selected_model_unavailable',outcome:'not_started'},{status:422});}return Response.json({ok:true,items:[]});});
 try{f.d.querySelector('[data-booking-search]').dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));await tick();f.d.querySelector('[data-booking-results] button').click();const form=f.d.querySelector('[data-booking-details]');form.elements.date.value='2099-01-01';form.elements.time.value='18:00';form.elements.area.value='Bangkok';for(let i=0;i<2;i++){form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));await tick();}assert.equal(bodies.length,2);assert.notEqual(bodies[0].request_id,bodies[1].request_id);assert.deepEqual(f.storage(),{});}finally{f.dom.window.close();}
});
test('Private selector comes only from backend context and disappears when access is revoked',async()=>{
 let allowed=true;const f=fixture(async path=>Response.json(path.includes('/context')?{ok:true,scopes:allowed?['public','private']:['public']}:{ok:true,items:[]}));
 try{assert.equal(f.d.querySelector('option[value=private]'),null);await f.ui.load();assert.ok(f.d.querySelector('option[value=private]'));const scope=f.d.querySelector('select[name=scope]');scope.value='private';scope.dispatchEvent(new f.dom.window.Event('change'));assert.match(f.d.querySelector('[data-booking-scope-copy]').textContent,/^SĪGIL Models/);allowed=false;await f.ui.load();assert.equal(f.d.querySelector('option[value=private]'),null);assert.equal(f.d.querySelector('[data-booking-scope]').hidden,true);assert.match(f.d.querySelector('[data-booking-scope-copy]').textContent,/^Public Models/);f.ui.reset();assert.match(f.d.querySelector('[data-booking-scope-copy]').textContent,/^Public Models/);}finally{f.dom.window.close();}
});
