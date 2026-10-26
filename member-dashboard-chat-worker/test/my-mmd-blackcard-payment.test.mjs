import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { myMmdBlackCardPaymentPage } from '../src/my-mmd-blackcard-payment.js';
import worker from '../src/my-mmd-lovable-app-front-gate.js';
import { PERSONAL_MAINS } from '../../shared/personal-main-catalog.mjs';

const base={ok:true,package_code:'black_card',amount_thb:35000,entitlement_granted:false,companions:PERSONAL_MAINS,companion:null};
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
async function ui(handler) {
  const response=myMmdBlackCardPaymentPage(new Request('https://www.mmdbkk.com/my-mmd/payments/blackcard'));
  const html=await response.text();let calls=[];
  const dom=new JSDOM(html,{url:'https://www.mmdbkk.com/my-mmd/payments/blackcard',runScripts:'dangerously',beforeParse(window){window.fetch=async(url,init)=>{calls.push({url,init});return handler(url,init,window);};window.HTMLElement.prototype.scrollIntoView=function(){};}});
  await tick();return{dom,calls,doc:dom.window.document,click:id=>dom.window.document.getElementById(id).click()};
}
const response=(data,status=200)=>Response.json(data,{status});

test('LIFF return carries only bounded Black Card view, never an arbitrary redirect or payment token',async()=>{
  const env={MEMBER_PAGES_WORKER:{fetch:async()=>new Response('<html><head></head><body><script nonce="test">const target = "/member/payments";</script></body></html>',{headers:{'content-type':'text/html'}})}};
  const result=await worker.fetch(new Request('https://www.mmdbkk.com/member/liff?liff.state=%3Fintent%3Dcontinue_payment%26view%3Dblackcard'),env);
  assert.equal(result.headers.get('x-mmd-liff-return-target'),'/my-mmd/payments/blackcard');assert.match(await result.text(),/const target = "\/my-mmd\/payments\/blackcard"/);
  const hostile=await worker.fetch(new Request('https://www.mmdbkk.com/member/liff?intent=continue_payment&view=https://evil.test'),env);
  assert.equal(hostile.headers.get('x-mmd-liff-return-target'),'/my-mmd/payments');
});

test('deployed front-gate route serves Worker-native payment page without Lovable fetch',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('unexpected external presentation request');};
  try{const res=await worker.fetch(new Request('https://www.mmdbkk.com/my-mmd/payments/blackcard'));assert.equal(res.status,200);assert.equal(res.headers.get('x-mmd-ui-source'),'mmd-workers-blackcard');assert.match(await res.text(),/ส่งหลักฐานและเลือก Companion/);}finally{globalThis.fetch=original;}
});
test('missing LINE session shows LIFF payment login with bounded return to Black Card',async()=>{
  const page=await ui(()=>response({ok:false,auth_required:true},401));
  assert.equal(page.doc.getElementById('login').hidden,false);const url=new URL(page.doc.getElementById('login').href);assert.equal(url.hostname,'miniapp.line.me');assert.equal(url.searchParams.get('intent'),'continue_payment');assert.equal(url.searchParams.get('view'),'blackcard');assert.equal(page.doc.getElementById('pay').hidden,true);page.dom.window.close();
});
test('new account starts explicitly, offers the fixed PayPal CTA, and hides account numbers',async()=>{
  const page=await ui(url=>response(url.endsWith('/state')?{...base,status:'not_started'}:url.endsWith('/purchase')?{...base,status:'awaiting_payment'}:{...base,status:'awaiting_payment',instructions:{bank_transfer:{enabled:true,bank_name_th:'ธนาคารทดสอบ',account_name_th:'ชื่อทดสอบ',account_number:'123-test'},promptpay:{enabled:false}}}));
  assert.equal(page.calls.length,1);assert.equal(page.doc.getElementById('new').hidden,false);page.click('start');await tick();assert.equal(page.doc.getElementById('pay').hidden,false);assert.match(page.doc.getElementById('bank').textContent,/ชื่อทดสอบ/);assert.doesNotMatch(page.doc.getElementById('bank').textContent,/123-test/);assert.equal(new URL(page.doc.getElementById('paypal').href).href,'https://www.paypal.com/ncp/payment/M697T7AW2QZZJ');assert.equal(page.doc.getElementById('paypal').target,'_blank');assert.equal(page.calls.filter(c=>c.url.endsWith('/purchase')).length,1);page.dom.window.close();
});
test('pending proof immediately opens Companion; saved selection is restored on refresh',async()=>{
  const page=await ui(()=>response({...base,status:'pending_verification',can_choose_companion:true,companion:PERSONAL_MAINS[2]}));
  assert.equal(page.doc.getElementById('companion').hidden,false);assert.equal(page.doc.getElementById('pay').hidden,true);assert.equal(page.doc.querySelector('input:checked').value,'hiro');assert.match(page.doc.getElementById('selection').textContent,/HIRO/);assert.equal(page.doc.getElementById('cards').children.length,4);assert.equal(page.doc.querySelector('img[alt="Hiro"]').src,PERSONAL_MAINS[2].image);page.dom.window.close();
});
test('verified payment swaps the four standard portraits for same-origin exclusive media',async()=>{
  const page=await ui(()=>response({...base,status:'verified',can_choose_companion:true}));
  assert.deepEqual([...page.doc.querySelectorAll('#cards img')].map(img=>new URL(img.src).pathname),PERSONAL_MAINS.map(item=>'/member/api/liff/blackcard/exclusive/'+item.id));
  page.dom.window.close();
});
test('failed save never displays success and retry can save; double submit is disabled while pending',async()=>{
  let release,failed=true;
  const page=await ui(url=>url.endsWith('/state')?response({...base,status:'pending_verification',can_choose_companion:true}):new Promise(resolve=>{release=()=>resolve(failed?response({ok:false},503):response({...base,status:'pending_verification',can_choose_companion:true,companion:PERSONAL_MAINS[0]}));}));
  page.doc.querySelector('input[value=hito]').checked=true;
  const submit=()=>page.doc.getElementById('choice').dispatchEvent(new page.dom.window.Event('submit',{cancelable:true}));submit();submit();await tick();assert.equal(page.calls.filter(c=>c.url.endsWith('/companion')).length,1);assert.doesNotMatch(page.doc.getElementById('selection').textContent,/บันทึกตัวเลือกแล้ว/);release();await tick();assert.match(page.doc.getElementById('status').textContent,/ยังทำรายการไม่สำเร็จ/);assert.doesNotMatch(page.doc.getElementById('selection').textContent,/บันทึกตัวเลือกแล้ว/);failed=false;submit();await tick();release();await tick();assert.match(page.doc.getElementById('selection').textContent,/บันทึกตัวเลือกแล้ว · HITO/);page.dom.window.close();
});

test('expired LINE session clears private companion UI and returns to a neutral login step',async()=>{
  let authenticated=true;
  const page=await ui(()=>authenticated?response({...base,status:'verified',can_choose_companion:true}):response({ok:false},401));
  assert.equal(page.doc.querySelectorAll('#cards img').length,4);
  authenticated=false;page.click('retry');await tick();
  assert.equal(page.doc.getElementById('login').hidden,false);
  assert.equal(page.doc.getElementById('companion').hidden,true);
  assert.equal(page.doc.querySelectorAll('#cards img').length,0);
  assert.equal(page.doc.getElementById('status').classList.contains('error'),false);
  assert.equal(page.doc.getElementById('step-1').getAttribute('aria-current'),'step');
  page.dom.window.close();
});
