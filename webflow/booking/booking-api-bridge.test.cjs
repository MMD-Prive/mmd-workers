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
    assert.equal(bodies[0].booking_ref,bodies[1].booking_ref);
    assert.equal(bodies[1].selected_model_id,'public1');assert.equal(bodies[1].lane,'public');assert.equal(bodies[1].private_allowed,false);
    assert.equal(bodies[1].service_context,'Dinner');assert.equal(bodies[1].city,'Bangkok');
    assert.match(bodies[1].client_notes,/2026-11-01/);
    assert.equal(bodies[1].source_path,'/booking');assert.equal(bodies[1].request_status,'draft');
    assert.equal(d.querySelector('.bk-api-private').href,'https://sigil.mmdbkk.com/sigil/booking?scope=private&mode=booking');
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
