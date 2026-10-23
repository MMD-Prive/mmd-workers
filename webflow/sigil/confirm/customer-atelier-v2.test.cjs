const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(require.resolve('jsdom', { paths: [process.env.MMD_UI_TEST_MODULES || process.cwd()] }));
const source = fs.readFileSync(path.join(__dirname, 'customer-atelier-v2.js'), 'utf8');
const token = 'opaque-fixture-value';
const sample = () => ({ok:true, role:'customer', confirmation_revision:'revision-2', model_name:'Test Model', pricing:{net_price_thb:17100,deposit_due_thb:5130,deposit_received_thb:5400,balance_thb:11700},payment:{amount_due_thb:11700,stage:'balance'}});
const settle = () => new Promise(r => setTimeout(r, 25));
async function setup(data=sample(), query='?t='+token+'&lang=en') {
  const dom = new JSDOM('<!doctype html><body><div data-mmd-confirm-mount="customer"></div><script data-mmd-customer-session-tracker="test"></script></body>',{url:'https://www.mmdbkk.com/sigil/confirm/job-confirmation'+query,runScripts:'outside-only'});
  const calls=[]; let current=data; let acknowledged=false;
  dom.window.matchMedia=()=>({matches:true});
  dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
  dom.window.fetch=async (url,options)=>{calls.push({url,options,body:JSON.parse(options.body)}); const endpoint=new URL(url).pathname;
    if(endpoint.endsWith('/ack')){acknowledged=true;return {ok:true,text:async()=>JSON.stringify({ok:true})};}
    if(endpoint.endsWith('/context')) return {ok:true,text:async()=>JSON.stringify({ok:true,confirmation:{acknowledged_at:acknowledged?'2026-10-18T09:00:00Z':null}})};
    if(current instanceof Error) throw current;
    return {ok:current.ok!==false,status:current.ok===false?403:200,text:async()=>JSON.stringify(current)};
  };
  dom.window.eval(source); await settle();
  return {dom,calls,setData:v=>{current=v},q:s=>dom.window.document.querySelector(s),close:()=>dom.window.close()};
}
test('one primary CTA carries exact opaque token and allowed language to LIFF',async()=>{const t=await setup();try{const a=t.q('[data-c-paycta-link]');assert.equal(a.hidden,false);const u=new URL(a.href);assert.equal(u.origin+u.pathname,'https://miniapp.line.me/2010830159-0n1O3ANK');assert.equal(u.searchParams.get('t'),token);assert.equal(u.searchParams.get('lang'),'en');assert.equal(a.referrerPolicy,'no-referrer');assert.equal(t.q('[data-c-methods]'),null);assert.equal(t.q('[data-c-deposit]').textContent,'฿5,400');assert.ok(!t.dom.window.document.body.textContent.includes(token));}finally{t.close()}});
for(const [name,mutate] of [
 ['verified',d=>d.payment.verified=true],['proof received',d=>d.payment.proof_received=true],['cancelled',d=>d.session_status='cancelled'],['expired',d=>d.payment.status='expired'],['refunded',d=>d.payment.status='refunded'],['zero',d=>d.payment.amount_due_thb=0],['negative',d=>d.payment.amount_due_thb=-5],['missing',d=>delete d.payment],['invalid amount',d=>d.payment.amount_due_thb='bad'],['not accepting',d=>d.payment.accepting_payment=false],['wrong role',d=>d.role='model']
]) test(name+' suppresses new payment',async()=>{const d=sample();mutate(d);const t=await setup(d);try{assert.equal(t.q('[data-c-paycta-link]').hidden,true);assert.equal(t.q('[data-c-paycta-link]').hasAttribute('href'),false);if(name==='proof received'){assert.equal(t.q('[data-c-paycta-proof]').hidden,false);assert.equal(new URL(t.q('[data-c-paycta-check]').href).searchParams.get('t'),token);}}finally{t.close()}});
test('missing and duplicate tokens fail closed without API requests or demo',async()=>{for(const qs of ['', '?t=one&t=two']){const t=await setup(sample(),qs);try{assert.equal(t.calls.length,0);assert.equal(t.q('[data-c-confirm]').disabled,true);assert.equal(t.q('[data-c-paycta-link]').hidden,true);}finally{t.close()}}});
test('API failure has retry and no payment action',async()=>{const t=await setup(new Error('offline'));try{assert.equal(t.q('[data-c-retry]').hidden,false);assert.equal(t.q('[data-c-paycta-link]').hidden,true);assert.equal(t.q('[data-c-confirm]').disabled,true);}finally{t.close()}});
test('ACK sends current revision and is distinct from payment',async()=>{const t=await setup();try{const check=t.q('[data-c-check]');check.checked=true;check.dispatchEvent(new t.dom.window.Event('change'));t.q('[data-c-confirm]').click();await settle();const ack=t.calls.find(c=>c.url.endsWith('/ack'));assert.equal(ack.body.confirmation_revision,'revision-2');assert.equal(ack.body.expected_role,'customer');assert.equal(t.q('[data-c-confirm]').disabled,true);assert.equal(t.q('[data-c-success]').hidden,false);}finally{t.close()}});
test('returning from LIFF refreshes proof state and removes stale pay CTA',async()=>{const t=await setup();try{const d=sample();d.payment.proof_received=true;t.setData(d);t.dom.window.dispatchEvent(new t.dom.window.Event('focus'));await settle();assert.equal(t.q('[data-c-paycta-link]').hidden,true);assert.equal(t.q('[data-c-paycta-proof]').hidden,false);}finally{t.close()}});
test('pending revision blocks ACK',async()=>{const d=sample();d.confirmation_change_pending=true;const t=await setup(d);try{t.q('[data-c-check]').checked=true;t.q('[data-c-check]').dispatchEvent(new t.dom.window.Event('change'));assert.equal(t.q('[data-c-confirm]').disabled,true);}finally{t.close()}});

test('Private confirmation uses SIGIL mark and PN + MK while Public remains MMD',async()=>{
  for(const [lane,name] of [['private_model','SĪGIL'],['public_model','MMD PRIVÉ']]){
    const d=sample();d.model_work_lane=lane;d.job_type='private:standard:pn:mk';
    const t=await setup(d);try{
      assert.equal(t.q('.mjc16__brand').textContent,name);
      assert.equal(!!t.q('.mjc16__sigil-mark'),lane==='private_model');
      assert.match(t.q('[data-c-type]').textContent,/PN.*MK/);
      assert.equal(t.q('#mmd-job-confirm-v16').dataset.workLane,lane);
    }finally{t.close()}
  }
});
test('canonical final LIFF link carries the original signed token, never client amount query',async()=>{
  const d=sample();d.pricing={net_price_thb:13000,deposit_received_thb:4000,balance_thb:9000};
  d.payment={stage:'final',amount_due_thb:9000,liff_url:'https://miniapp.line.me/2010830159-0n1O3ANK?t='+token};
  const t=await setup(d);try{const a=t.q('[data-c-paycta-link]');assert.equal(a.hidden,false);assert.match(a.textContent,/9,000/);assert.equal(new URL(a.href).searchParams.has('amount'),false);}finally{t.close()}
});
test('wrong final amount or unrelated LIFF target cannot produce a payable CTA',async()=>{
  for(const bad of ['amount','target']){
    const d=sample();d.pricing.balance_thb=9000;d.payment={stage:'final',amount_due_thb:bad==='amount'?4000:9000,
      liff_url:bad==='target'?'https://example.com/?t='+token:'https://miniapp.line.me/2010830159-0n1O3ANK?t='+token};
    const t=await setup(d);try{assert.equal(t.q('[data-c-paycta-link]').hidden,true);}finally{t.close()}
  }
});
test('customer itemization shows original, discount and travel exactly once without model rates',async()=>{
  const d=sample();d.billing={schema:'customer_billing_breakdown_v1',original_price_thb:15000,discount_thb:2000,travel_fee_thb:500,travel_treatment:'included',breakdown_status:'complete',service_items:[{label:'PN',amount_thb:13000},{label:'MK',amount_thb:2000}]};
  const t=await setup(d);try{assert.equal(t.q('[data-c-full]').textContent,'฿15,000');assert.match(t.q('[data-c-discount]').textContent,/2,000/);assert.match(t.q('[data-c-travel-label]').textContent,/รวมในยอดสุทธิแล้ว/);assert.equal(t.q('[data-c-travel-row]').hidden,false);assert.equal(t.q('[data-c-service-items]').children.length,2);assert.doesNotMatch(t.dom.window.document.body.textContent,/model_payout/);}finally{t.close()}
});
