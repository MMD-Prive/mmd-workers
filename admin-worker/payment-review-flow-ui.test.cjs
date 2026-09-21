const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.env.MMD_UI_TEST_MODULES ? path.join(process.env.MMD_UI_TEST_MODULES, 'jsdom') : 'jsdom');
const html = fs.readFileSync(path.join(__dirname, '../webflow/internal/admin/payments/payment-review-simple.html'), 'utf8');
const proof = { proof_id:'proof-a', customer_name:'คิว - SVIP -', customer_aliases:['Que'], model_name:'J Dye', model_aliases:['EMs21'], payment_ref:'pay-a', session_id:'sess-a', job_date:'2026-10-04', payment_stage:'full', evidence_amount_thb:30000, expected_amount_thb:30000, context_loaded:true, can_approve:true, context_issues:[], evidence_preview_url:'/v1/admin/payments/evidence?proof_id=proof-a' };
const confirmation={ok:true,session_id:'sess-a',payment_ref:'pay-a',payment_stage:'full',money_truth_changed:false,confirmation:{delivery_status:'pending',retry_available:true,retry_queued:true,dispatched:false,customer_line_sent:true,customer_acknowledged_at:'2026-09-21T09:00:00Z',model_acknowledged_at:null}};
const job = { ...proof, session_record_id:'rec-a', payments:[{payment_ref:'pay-a',payment_stage:'full',expected_amount_thb:30000,state:'proof_pending',proof_ids:['proof-a']}] };
const waiting = { ...job, session_record_id:'rec-b', session_id:'sess-b', customer_name:'เชน - SVIP -',customer_aliases:['shane'],model_name:'Model B',model_aliases:['MODEL02'], payments:[{payment_ref:'pay-b',payment_stage:'deposit',expected_amount_thb:7500,state:'waiting_proof',proof_ids:[]}] };
const tick = () => new Promise(resolve=>setImmediate(resolve));
function setup(options={}) {
  const calls=[];
  const dom=new JSDOM(html,{url:'https://example.test/internal/admin/payments',runScripts:'dangerously',beforeParse(w){
    w.matchMedia=()=>({matches:options.mobile===true});w.HTMLElement.prototype.scrollIntoView=function(){};
    w.fetch=async(url,opts={})=>{calls.push({url,opts});if(options.fetch){const override=await options.fetch(url,opts);if(override)return override;}
      const data=url.includes('view=confirmation')?confirmation:url.includes('view=recent_jobs')?{ok:true,items:[],jobs:options.jobs||[job,waiting]}:url.includes('proof_id=')?{ok:true,items:options.exact??[proof]}:{ok:true,items:options.items??[proof]};
      return {ok:true,status:200,json:async()=>data};
    };
  }});
  const q=s=>dom.window.document.querySelector(s),qa=s=>[...dom.window.document.querySelectorAll(s)];
  const search=value=>{q('[data-pf-search]').value=value;q('[data-pf-search]').dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
  const open=async()=>{q('[data-pf-select]').click();await tick();await tick();};
  const image=()=>{const img=q('[data-pf-evidence] img');Object.defineProperty(img,'naturalWidth',{value:100});img.onload();};
  return {dom,calls,q,qa,search,open,image};
}

test('one search finds Per Rename, original names, models, and jobs without slips without changing tabs', async()=>{
 const h=setup();try{await tick();await tick();assert.equal(h.qa('[data-pf-select]').length,1,'proof and job are deduplicated');
 for(const value of ['คิว','Que','J-dye','EMs21']){h.search(value);assert.equal(h.qa('[data-pf-select]').length,1,value)}
 h.search('shane');assert.equal(h.qa('[data-pf-select]').length,1);await h.open();assert.match(h.q('[data-pf-work]').textContent,/ขั้นต่อไป: รับสลิป/);assert.equal(h.q('[data-pf-approve]'),null);
 h.search('not found');assert.equal(h.qa('[data-pf-select]').length,0);assert.match(h.q('[data-pf-list]').textContent,/ไม่พบชื่อนี้/);
 }finally{h.dom.window.close()}
});

test('exact proof reload, image and both checks are mandatory before approval',async()=>{
 const h=setup({items:[]});try{await tick();await tick();await h.open();assert.ok(h.calls.some(x=>x.url.includes('proof_id=proof-a')));assert.equal(h.q('[data-pf-approve]').disabled,true);h.image();h.q('[data-pf-match]').click();assert.equal(h.q('[data-pf-approve]').disabled,true);h.q('[data-pf-bank]').click();assert.equal(h.q('[data-pf-approve]').disabled,false);h.q('[data-pf-evidence] img').onerror();assert.equal(h.q('[data-pf-approve]').disabled,true);assert.equal(h.calls.filter(x=>x.opts.method==='POST').length,0);
 }finally{h.dom.window.close()}
});

test('uncertain approval survives leaving/reopening and retries only the identical request; failed delivery is separate from paid',async()=>{
 let writes=0;const h=setup({fetch:async(_url,opts)=>{if(opts.method==='POST'){if(JSON.parse(opts.body).action==='retry_confirmation')return{ok:true,status:200,json:async()=>confirmation};if(++writes===1)throw Error('network');return{ok:true,status:200,json:async()=>({ok:true,money_truth_changed:true,payment_stage:'full',job_link_dispatch:{dispatched:false,retry_queued:true}})}}}});
 try{await tick();await tick();await h.open();h.image();h.q('[data-pf-match]').click();h.q('[data-pf-bank]').click();h.q('[data-pf-approve]').click();await tick();assert.equal(writes,1);assert.equal(h.q('[data-pf-uncertain]').hidden,false);h.q('[data-pf-back]').click();await h.open();assert.equal(h.q('[data-pf-approve]').disabled,true);h.q('[data-pf-retry]').click();await tick();const posts=h.calls.filter(x=>x.opts.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].opts.body,posts[1].opts.body);assert.equal(posts[0].opts.headers['Idempotency-Key'],posts[1].opts.headers['Idempotency-Key']);assert.match(h.q('[data-pf-receipt]').textContent,/รับเงิน 30,000 บาท แล้ว/);await tick();assert.match(h.q('[data-pf-confirm]').textContent,/มีรายการรอส่งซ้ำ/);assert.equal(h.q('[data-pf-approve]'),null);h.q('[data-pf-delivery-retry]').click();await tick();assert.equal(JSON.parse(h.calls.filter(x=>x.opts.method==='POST')[2].opts.body).action,'retry_confirmation');
 }finally{h.dom.window.close()}
});

test('stale proof and mismatched canonical payment never enable a review action',async()=>{
 for(const exact of [[],[{...proof,payment_ref:'wrong-pay'}],[{...proof,session_id:'wrong-session'}]]){const h=setup({exact});try{await tick();await tick();await h.open();assert.equal(h.q('[data-pf-approve]'),null);assert.match(h.q('[data-pf-review]').textContent,/ไม่อยู่ในคิว|ไม่ตรงกัน/);}finally{h.dom.window.close()}}
});

test('multiple proofs require an explicit choice, and a late proof response cannot replace a newly selected job',async()=>{
 let resolveProof;const multi={...job,payments:[{...job.payments[0],proof_ids:['proof-a','proof-b']}]};const h=setup({jobs:[multi,waiting],fetch:async url=>{if(url.includes('proof_id='))return new Promise(resolve=>{resolveProof=resolve})}});
 try{await tick();await tick();await h.open();assert.equal(h.qa('[data-pf-proof]').length,2);assert.equal(h.q('[data-pf-approve]'),null);h.q('[data-pf-proof]').click();await tick();h.search('shane');h.q('[data-pf-select]').click();resolveProof({ok:true,status:200,json:async()=>({ok:true,items:[proof]})});await tick();assert.match(h.q('[data-pf-work]').textContent,/เชน/);assert.equal(h.q('[data-pf-approve]'),null);const before=h.calls.length;h.q('[data-pf-refresh]').click();await tick();assert.ok(h.calls.length>before,'old opening flag must not block refresh');
 }finally{h.dom.window.close()}
});

test('auth and partial data failures never masquerade as a complete empty queue',async()=>{
 const h=setup({fetch:async()=>({ok:false,status:401,json:async()=>({ok:false})})});try{await tick();await tick();assert.match(h.q('[data-pf-list]').textContent,/เข้าสู่ระบบแอดมิน/);assert.equal(h.q('[data-pf-approve]'),null);}finally{h.dom.window.close()}
 const p=setup({fetch:async url=>{if(url.includes('view=recent_jobs'))throw Error('offline')}});try{await tick();await tick();assert.equal(p.q('[data-pf-notice]').hidden,false);assert.match(p.q('[data-pf-notice]').textContent,/ผลค้นหาอาจไม่ครบ/);assert.equal(p.qa('[data-pf-select]').length,1);}finally{p.dom.window.close()}
});

test('issue/reject remain audit-only and do not show a paid receipt',async()=>{
 const h=setup({fetch:async(_url,opts)=>{if(opts.method==='POST')return{ok:true,status:200,json:async()=>({ok:true,money_truth_changed:false})}}});try{await tick();await tick();await h.open();h.q('[data-pf-note]').value='ขอหลักฐานที่ชัดเจน';h.q('[data-pf-decision="issue"]').click();await tick();assert.match(h.q('[data-pf-message]').textContent,/ยังไม่ยืนยันเงินเข้า/);assert.equal(h.q('[data-pf-receipt]').hidden,true);}finally{h.dom.window.close()}
});


test('mobile selection opens one task and back returns to the same search',async()=>{
 const h=setup({mobile:true});try{await tick();await tick();h.search('Que');await h.open();assert.equal(h.q('#mmd-payment-review').classList.contains('pf-has-selection'),true);h.q('[data-pf-back]').click();assert.equal(h.q('#mmd-payment-review').classList.contains('pf-has-selection'),false);assert.equal(h.q('[data-pf-search]').value,'Que');assert.equal(h.qa('[data-pf-select]').length,1);}finally{h.dom.window.close()}
});


test('reopened paid job loads persisted delivery and acknowledgement independently; refresh is read-only',async()=>{
 const paid={...job,payments:[{...job.payments[0],state:'paid',proof_ids:[]}]};const h=setup({items:[],jobs:[paid]});try{await tick();await tick();h.q('[data-pf-filter="paid"]').click();await h.open();assert.match(h.q('[data-pf-confirm]').textContent,/ส่งลิงก์แล้ว/);assert.match(h.q('[data-pf-confirm]').textContent,/ยืนยันงานแล้ว/);assert.match(h.q('[data-pf-confirm]').textContent,/รอกดยืนยันงาน/);assert.doesNotMatch(h.q('[data-pf-confirm]').textContent,/ทั้งสองฝ่ายยืนยันงานแล้ว/);assert.equal(h.q('[data-pf-approve]'),null);h.q('[data-pf-confirm-refresh]').click();await tick();assert.equal(h.calls.filter(x=>x.opts.method==='POST').length,0);
 }finally{h.dom.window.close()}
});

test('late confirmation result cannot appear on another job; failed status fetch cannot claim delivery',async()=>{
 let finish;const paid={...job,payments:[{...job.payments[0],state:'paid',proof_ids:[]}]};const h=setup({items:[],jobs:[paid,waiting],fetch:async url=>{if(url.includes('view=confirmation'))return new Promise(r=>{finish=r})}});try{await tick();await tick();h.search('Que');await h.open();h.search('shane');h.q('[data-pf-select]').click();finish({ok:true,status:200,json:async()=>confirmation});await tick();assert.match(h.q('[data-pf-work]').textContent,/เชน/);assert.equal(h.q('[data-pf-confirm]').hidden,true);
 }finally{h.dom.window.close()}
 for(const mode of ['missing','error','mismatch']){const k=setup({items:[],jobs:[paid],fetch:async url=>{if(url.includes('view=confirmation')){if(mode==='error')throw Error();return{ok:true,status:200,json:async()=>mode==='missing'?{...confirmation,confirmation:{delivery_status:'not_recorded'}}:{...confirmation,payment_ref:'another'}}}}});try{await tick();await tick();k.search('Que');await k.open();assert.equal(k.q('[data-pf-delivery-retry]'),null);assert.match(k.q('[data-pf-confirm]').textContent,mode==='missing'?/ไม่มีประวัติส่งอัตโนมัติ/:/ยังตรวจสถานะคอนเฟิร์มไม่ได้/);}finally{k.dom.window.close()}}
});
