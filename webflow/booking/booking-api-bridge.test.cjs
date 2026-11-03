const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const source = name => fs.readFileSync(__dirname + '/' + name,'utf8');
const mediaId = 'media_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function setup(handler) {
  const dom = new JSDOM(source('booking-webflow-base.html'),{url:'https://mmdprive.webflow.io/booking',runScripts:'outside-only',pretendToBeVisual:true});
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = ()=>{}; w.scrollTo = ()=>{};
  w.IntersectionObserver = class {observe(){} unobserve(){} disconnect(){}};
  w.matchMedia = () => ({matches:true,addEventListener(){},removeEventListener(){}});
  w.fetch = handler; w.AbortSignal.timeout = ()=>undefined;
  for(const node of w.document.querySelectorAll('script')) w.eval(node.textContent);
  const footer = source('booking-webflow-footer.html');
  for(const match of footer.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) w.eval(match[1]);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.eval(source('booking-api-bridge.js'));
  w.document.querySelector('[name=budget_thb]').value='6200';
  return {dom,w,d:w.document};
}
const pause = () => new Promise(r=>setTimeout(r,30));
test('public search filters scope, safely renders media, sends reviewed details, retries with one reference',async()=>{
  const calls=[]; let posts=0;
  const {dom,w,d}=setup(async(url,opt={})=>{
    calls.push({url,opt});
    if(!opt.method) return {ok:true,json:async()=>({ok:true,discovery_scope:'public',visibility_enforced:true,items:[
      {model_id:'public1',display_name:'Public One',scope:'public',media_source:'mmd_model_media_assets',cover_url:'https://storage.invalid/leak.jpg',gallery_media:[{media_id:mediaId,media_source:'mmd_model_media_assets',kind:'photo'}]},
      {model_id:'private1',display_name:'Private Hidden',scope:'private'}
    ]})};
    posts++;
    const body=JSON.parse(opt.body);
    if(posts===1) throw new Error('network timeout after acceptance');
    return {ok:true,json:async()=>({ok:true,booking_ref:body.booking_ref})};
  });
  try {
    d.querySelector('[data-public-search]').click(); await pause();
    assert.equal(calls[0].opt.credentials,'include','public search must carry the verified discovery session');
    assert.match(calls[0].url,/scope=public/); assert.equal(d.querySelectorAll('[data-model-id]').length,1);
    assert.doesNotMatch(d.querySelector('.bk-api-results').textContent,/Private Hidden/);
    assert.equal(d.querySelector('.bk-api-model img'),null,'gallery is not promoted to cover');
    d.querySelector('[data-model-id]').click();
    assert.equal(d.querySelector('.bk-api-gallery img').src,'https://sigil.mmdbkk.com/sigil/api/models/media/'+mediaId);
    const f=d.querySelector('[data-form]');
    f.elements.consent.checked=true;
    for(const [key,v] of Object.entries({name:'QA',contact:'qa@example.test',date:'2026-11-01',time:'19:00',place:'Bangkok',note:'API mock only'}))f.elements[key].value=v;
    d.querySelector('[data-service="Dinner"]').click();
    f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})); await pause();
    assert.match(d.querySelector('[data-summary]').textContent,/Public One/);
    const send=d.querySelector('[data-copy]'); send.click();send.click(); await pause();
    assert.equal(posts,1);assert.equal(send.disabled,false);assert.match(d.querySelector('[data-status]').textContent,/ยังยืนยัน/);
    send.click(); await pause();
    assert.equal(posts,2);assert.equal(send.disabled,true);assert.match(d.querySelector('[data-status]').textContent,/ส่งคำขอแล้ว/);
    const bodies=calls.filter(c=>c.opt.method).map(c=>JSON.parse(c.opt.body));
    assert.ok(calls.every(c=>c.opt.credentials==='include'),'retries and intake retain the same session transport');
    assert.equal(bodies[0].booking_ref,bodies[1].booking_ref);
    assert.equal(bodies[1].selected_model_id,'public1');assert.equal(bodies[1].lane,'public');assert.equal(bodies[1].private_allowed,false);
    assert.equal(bodies[1].budget_thb,6200);
    assert.equal(bodies[1].service_context,'Dinner');assert.equal(bodies[1].city,'Bangkok');
    assert.match(bodies[1].client_notes,/2026-11-01/);
    assert.equal(bodies[1].source_path,'/booking');assert.equal(bodies[1].request_status,'draft');
    assert.equal(d.querySelector('a[href*="scope=private"]'),null,'Public must not expose private booking');
  } finally {dom.window.close();}
});
test('unverified discovery and false intake success fail closed',async()=>{
  const {dom,d,w}=setup(async(url,opt={})=>({ok:true,json:async()=>opt.method?{ok:false}:{ok:true,items:[{scope:'public',display_name:'Unverified'}]}}));
  try {
    d.querySelector('[data-public-search]').click();await pause();assert.equal(d.querySelectorAll('[data-model-id]').length,0);
    const f=d.querySelector('[data-form]');f.elements.consent.checked=true;for(const [key,v] of Object.entries({name:'QA',contact:'qa@example.test',date:'2026-11-01',time:'19:00',place:'Bangkok'}))f.elements[key].value=v;
    d.querySelector('[data-service="Dinner"]').click();f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause();
    d.querySelector('[data-copy]').click();await pause();assert.match(d.querySelector('[data-status]').textContent,/ยังยืนยัน/);assert.equal(d.querySelector('[data-copy]').disabled,false);
  } finally {dom.window.close();}
});

test('Public search pending state never fabricates time-based progress or exposes private booking',async()=>{
 let finish;const pending=new Promise(resolve=>finish=resolve);
 const {dom,d}=setup(()=>pending);
 try {
  assert.equal(d.querySelector('a[href*="scope=private"]'),null);
  d.querySelector('[data-public-search]').click();
  assert.equal(d.querySelector('.bk-api-models progress').hasAttribute('value'),false);
  assert.equal(d.querySelector('[data-search-status]').textContent,'กำลังค้นหา');
  finish({ok:true,json:async()=>({ok:true,discovery_scope:'public',visibility_enforced:true,items:[]})});
  await pause();assert.equal(d.querySelector('.bk-api-models progress').hidden,true);
 }finally{dom.window.close();}
});

for (const [code,httpStatus,label] of [['login_required',401,'เข้าสู่ระบบ'],['public_membership_required',403,'สมัครแพ็กเกจ Public'],['membership_status_unavailable',503,'ยังตรวจสถานะสมาชิกไม่ได้']]) {
 test(`${code} preserves draft and allows retry with the same reference`,async()=>{
  const bodies=[];let reject=true;
  const {dom,d,w}=setup(async(url,opt={})=>{
   if(opt.method)bodies.push(JSON.parse(opt.body));
   return reject?{ok:false,status:httpStatus,json:async()=>({ok:false,error:code})}:{ok:true,json:async()=>({ok:true,booking_ref:JSON.parse(opt.body).booking_ref})};
  });
  try {
   d.querySelector('[data-public-search]').click();await pause();
   assert.match(d.querySelector('[data-search-status]').textContent,new RegExp(label));
   const form=d.querySelector('[data-form]');form.elements.consent.checked=true;
   for(const [key,v] of Object.entries({name:'QA',contact:'qa@example.test',date:'2026-11-01',time:'19:00',place:'Bangkok',budget_thb:'7800'}))form.elements[key].value=v;
   d.querySelector('[data-service="Dinner"]').click();form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause();
   assert.match(d.querySelector('[data-summary]').textContent,/7,800/);
   d.querySelector('[data-copy]').click();await pause();
   assert.match(d.querySelector('[data-status]').textContent,new RegExp(label));
   const link=d.querySelector('[data-status] a');
   if(code==='membership_status_unavailable')assert.equal(link,null);
   else {assert.equal(link.target,'_blank');assert.match(link.href,code==='login_required'?/miniapp.line.me\/2010862595-yT4DCEMc/:/mmdbkk.com\/pay\/membership/);}
   assert.equal(form.elements.budget_thb.value,'7800');assert.equal(form.elements.contact.value,'qa@example.test');
   assert.equal(d.querySelector('[data-copy]').disabled,false);
   reject=false;d.querySelector('[data-copy]').click();await pause();
   assert.equal(bodies.length,2);assert.equal(bodies[0].booking_ref,bodies[1].booking_ref);assert.equal(bodies[1].budget_thb,7800);
  }finally{dom.window.close();}
 });
}
test('budget requires an explicit customer maximum of at least 4500 and embeds stay in sync',async()=>{
 let calls=0;const {dom,d}=setup(async()=>{calls++;throw Error('unexpected request');});
 try {
  const input=d.querySelector('[name=budget_thb]');assert.equal(input.min,'4500');assert.equal(input.required,true);
  for(const value of ['', '4499']){input.value=value;d.querySelector('[data-public-search]').click();await pause();assert.equal(calls,0);assert.equal(input.checkValidity(),false);}
  input.value='4500';assert.equal(input.checkValidity(),true);
  assert.ok(source('booking-webflow-head.html').includes(source('booking-api-bridge.js')));
 }finally{dom.window.close();}
});

test('SIGIL public membership failure keeps input and re-enables submit for retry',async()=>{
 const html=fs.readFileSync(__dirname+'/../sigil/booking/skb26/sigil-booking-footer.html','utf8');
 const dom=new JSDOM('<div data-skb25-root></div>',{url:'https://mmdbkk.com/sigil/booking?mode=booking',runScripts:'outside-only'});
 const {window:w}=dom;let posts=0;
 w.fetch=async(url,opt)=>{assert.equal(opt.credentials,'include');const intake=url.endsWith('/booking/intake');if(intake)posts++;const fail=intake&&posts===1;return {ok:!fail,text:async()=>JSON.stringify(fail?{error:'public_membership_required'}:{ok:true,booking_ref:'book_ui_retry',session_id:'session_ui'})};};
 try {
  w.eval(html.replace(/^<script>/,'').replace(/<\/script>\s*$/,''));
  const d=w.document,f=d.querySelector('form');
  for(const [name,val] of Object.entries({client_name:'QA',contact:'qa@example.test',budget_thb:'4500',date:'2027-01-01',time:'19:00',area:'Bangkok',duties:'Dinner'}))f.elements[name].value=val;
  d.querySelector('[data-filter=public_format]').click();
  f.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await pause();
  assert.equal(posts,1);assert.equal(d.querySelector('[data-skb26-submit]').disabled,false);
  assert.match(d.querySelector('[data-skb26-result]').textContent,/สมัครสมาชิก Public/);
  assert.equal(f.elements.budget_thb.value,'4500');assert.equal(f.elements.contact.value,'qa@example.test');
  f.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await pause();
  assert.equal(posts,2);assert.equal(d.querySelector('[data-skb26-submit]').disabled,true);
  assert.match(d.querySelector('[data-skb26-result]').textContent,/ส่ง SIGIL Booking แล้ว/);
 }finally{dom.window.close();}
});
