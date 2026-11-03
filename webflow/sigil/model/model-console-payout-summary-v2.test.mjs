import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./model-console-payout-summary-v2.html", import.meta.url), "utf8");

test("payout summary accepts canonical model payout and terms", () => {
  assert.match(source, /expected_payout_thb\?\?session\.pay_model_thb/);
  assert.match(source, /session&&session\.payout_terms/);
  assert.match(source, /smcv3-payout-only__label">ยอดเงินถึงตัวคุณ<\/span>/);
  assert.match(source, /ยอดนี้คือค่าตัวที่คุณได้รับตามงานนี้ ไม่ใช่ราคาที่ลูกค้าจ่าย/);
  assert.match(source, /เวลาจบที่ MMD ยืนยัน/);
});

test("payout summary distinguishes Public and Private money systems", () => {
  assert.match(source, /PUBLIC MONEY · PACKAGE \/ SESSION/);
  assert.match(source, /PRIVATE MONEY · CASE LOCKED/);
  assert.match(source, /ไม่ใช้ราคา Package, OT หรือ After Midnight Matrix ของ Public โดยอัตโนมัติ/);
  assert.match(source, /MMD ออกเรท Private ของเคสใหม่และยืนยันก่อน/);
});

test("payout summary explains official extension boundary", () => {
  assert.match(source, /MY MMD → คุณกด Approve ใน MY MODEL → MMD ยืนยัน/);
  assert.match(source, /OT หลัง 00:00/);
  assert.match(source, /OT หลัง 03:00/);
});

test("payout summary does not expose customer pricing or MMD margin", () => {
  assert.doesNotMatch(source, /customer_sell_rate_thb|customer_amount_due_thb|margin_thb|commission_thb/);
});

// Execute the existing embed with a local fetch mock; never contact a backend.
async function extensionFixture(sessionId = 'sess_displayed', failure = false, expected = '', postHandler, recovery) {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<section id="sigil-model-console-v3"><div class="smcv3-summary"></div></section>', {
    url: 'https://fixture.invalid/sigil/model/console?t=fixture_signed_reference' + (expected ? '&session_id=' + encodeURIComponent(expected) : ''), runScripts: 'outside-only',
  });
  const win = dom.window;
  if (win.document.readyState === 'loading') await new Promise(resolve => win.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  if(recovery)win.sessionStorage.setItem('mmd_console_extension_operations_v1',recovery);
  const session = { session_id: sessionId, expected_payout_thb: 10000 };
  const extension = {request_id:'extension_displayed',status:'requested',requested_minutes:30,model_payout_thb:1000,original_end_at:'2099-01-01T12:00:00Z',requested_end_at:'2099-01-01T12:30:00Z'};
  const posts = [];
  let reads = 0;
  win.fetch = async (_url, options = {}) => {
    if (options.method === 'POST') {
      posts.push(JSON.parse(options.body));
      if(postHandler)return postHandler(options);
      return { ok: !failure, json: async () => failure ? { ok: false, error: 'session_context_changed' } : { ok: true } };
    }
    reads++;
    return { ok: true, json: async () => ({ ok: true, session, extension_request: extension }) };
  };
  const script = source.match(/<script id="smcv3-payout-only-js">([\s\S]*?)<\/script>/)[1];
  win.eval(script);
  await new Promise(resolve => setImmediate(resolve));
  return { dom, session, extension, posts, reads: () => reads };
}

for (const [selector, action] of [['data-ext-approve', 'approve_extension'], ['data-ext-decline', 'decline_extension']]) {
  test(`${action} sends the rendered session snapshot and preserves the extension reference`, async () => {
    const fixture = await extensionFixture();
    try {
      const button = fixture.dom.window.document.querySelector(`[${selector}]`);
      assert.ok(button);
      // A later mutation must not retarget a decision from the already rendered card.
      fixture.session.session_id = 'sess_different';
      button.click();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(fixture.posts, [{
        t: 'fixture_signed_reference', action, session_id: 'sess_displayed', extension_request_id: 'extension_displayed',
      }]);
      assert.equal(fixture.reads(), 2, 'success refreshes the current backend state');
    } finally { fixture.dom.window.close(); }
  });
}

test('extension decisions stay unavailable without a valid displayed session', async () => {
  for (const sessionId of [undefined, null, '', '  ', 5]) {
    const fixture = await extensionFixture(sessionId === undefined ? null : sessionId);
    try {
      assert.equal(fixture.dom.window.document.querySelector('[data-model-extension-request]'), null);
      assert.equal(fixture.posts.length, 0);
    } finally { fixture.dom.window.close(); }
  }
});

test('a rejected extension decision keeps the card and does not retry the action', async () => {
  const fixture = await extensionFixture('sess_displayed', true);
  try {
    const doc = fixture.dom.window.document;
    doc.querySelector('[data-ext-approve]').click();
    await new Promise(resolve => setImmediate(resolve));
    const card = doc.querySelector('[data-model-extension-request]');
    assert.ok(card);
    assert.match(card.querySelector('p:last-of-type').textContent, /ยังยืนยันผลการส่งคำตอบไม่ได้/);
    assert.ok([...card.querySelectorAll('button')].every(button => button.disabled));
    assert.equal(fixture.posts.length, 1);
    assert.equal(fixture.reads(), 1);
  } finally { fixture.dom.window.close(); }
});

test('extension card cannot expose B inside the pinned A Console', async () => {
 const f=await extensionFixture('sess_B',false,'sess_A');
 try {
  assert.equal(f.dom.window.document.querySelector('[data-model-extension-request]'),null);
  assert.equal(f.dom.window.document.querySelector('[data-model-payout-card]'),null);
  assert.equal(f.posts.length,0);
 } finally {f.dom.window.close();}
});
test('extension BFCache reopen clears A, rejects B and ignores stale completion without sending a decision', async()=>{
 const f=await extensionFixture('sess_A',false,'sess_A'),w=f.dom.window,doc=w.document;
 try {
  assert.ok(doc.querySelector('[data-ext-approve]'));
  let finish;
  w.fetch=()=>new Promise(resolve=>{finish=resolve;});
  w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));
  assert.equal(doc.querySelector('[data-model-extension-request]'),null);
  w.dispatchEvent(new w.PageTransitionEvent('pagehide'));
  w.fetch=async()=>({ok:true,json:async()=>({ok:true,session:{session_id:'sess_B',expected_payout_thb:10000}})});
  w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));await new Promise(setImmediate);
  finish({ok:true,json:async()=>({ok:true,session:{session_id:'sess_A',expected_payout_thb:10000},extension_request:{request_id:'stale',status:'requested'}})});
  await new Promise(setImmediate);
  assert.equal(doc.querySelector('[data-model-extension-request]'),null);
  assert.equal(doc.querySelector('[data-model-payout-card]'),null);assert.equal(f.posts.length,0);
 } finally {w.close();}
});

for(const outcome of ['success','network','ambiguous','timeout'])test(`extension ${outcome} remains locked across card recreation and reload recovery`,async()=>{
 let finish,reject,expire;
 const f=await extensionFixture('sess_A',false,'',options=>new Promise((resolve,fail)=>{finish=resolve;reject=fail;options.signal.addEventListener('abort',()=>fail(new Error('AbortError')))}));
 const w=f.dom.window,doc=w.document;
 if(outcome==='timeout'){const schedule=w.setTimeout.bind(w);w.setTimeout=(callback,ms,...args)=>ms===12000?(expire=callback,0):schedule(callback,ms,...args)}
 try{
  doc.querySelector('[data-ext-approve]').click();
  // Both choices are locked synchronously before the pending response.
  doc.querySelector('[data-ext-decline]').click();assert.equal(f.posts.length,1);
  w.dispatchEvent(new w.PageTransitionEvent('pagehide'));
  w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));await new Promise(setImmediate);
  const card=doc.querySelector('[data-model-extension-request]');assert.ok(card);
  assert.ok([...card.querySelectorAll('button')].every(b=>b.disabled));
  // Programmatic dispatch also cannot bypass the per-request lock.
  card.querySelector('[data-ext-decline]').dispatchEvent(new w.Event('click'));assert.equal(f.posts.length,1);
  if(outcome==='success')finish({ok:true,json:async()=>({ok:true})});
  else if(outcome==='ambiguous')finish({ok:true,json:async()=>({})});
  else if(outcome==='timeout')expire();
  else reject(new Error('offline'));
  await new Promise(setImmediate);
  assert.equal(doc.querySelector('[data-model-extension-request]'),card);
  assert.ok([...card.querySelectorAll('button')].every(b=>b.disabled));
  const recovery=w.sessionStorage.getItem('mmd_console_extension_operations_v1');
  assert.match(card.querySelector('p:last-of-type').textContent,/ยังยืนยันผล/);
  assert.deepEqual(JSON.parse(recovery),[['sess_A','extension_displayed','unknown']]);
  assert.doesNotMatch(recovery,/fixture_signed_reference|10000|1000|approve/);
  const reopened=await extensionFixture('sess_A',false,'',undefined,recovery);
  try{assert.ok([...reopened.dom.window.document.querySelectorAll('[data-model-extension-request] button')].every(b=>b.disabled));assert.equal(reopened.posts.length,0)}finally{reopened.dom.window.close()}
 }finally{w.close()}
});
test('late extension response for A cannot refresh or change a pending B card',async()=>{
 let finishA,finishB;
 const f=await extensionFixture('sess_A',false,'',options=>new Promise(resolve=>{if(JSON.parse(options.body).session_id==='sess_A')finishA=resolve;else finishB=resolve}));
 const w=f.dom.window,doc=w.document;
 try{
  doc.querySelector('[data-ext-approve]').click();
  f.session.session_id='sess_B';
  w.dispatchEvent(new w.PageTransitionEvent('pagehide'));w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));await new Promise(setImmediate);
  const card=doc.querySelector('[data-model-extension-request]');
  assert.ok([...card.querySelectorAll('button')].every(b=>!b.disabled));
  card.querySelector('[data-ext-decline]').click();const reads=f.reads();
  finishA({ok:true,json:async()=>({ok:true})});await new Promise(setImmediate);
  assert.equal(f.reads(),reads);assert.equal(doc.querySelector('[data-model-extension-request]'),card);
  assert.ok([...card.querySelectorAll('button')].every(b=>b.disabled));
  finishB({ok:false,json:async()=>({ok:false})});await new Promise(setImmediate);
  assert.equal(f.posts.length,2);assert.match(card.querySelector('p:last-of-type').textContent,/ยังยืนยันผล/);
 }finally{w.close()}
});

for(const status of ['model_approved','model_declined'])test(`authoritative ${status} for the exact request clears only its recovery marker`,async()=>{
 let finish;
 const other=['other_session','other_request','unknown'];
 const recovery=JSON.stringify([other]);
 const f=await extensionFixture('sess_A',false,'',()=>new Promise(resolve=>{finish=resolve}),recovery);
 const w=f.dom.window;
 try{
  w.document.querySelector('[data-ext-approve]').click();
  f.extension.status=status;
  finish({ok:true,json:async()=>({ok:true})});await new Promise(setImmediate);
  assert.equal(f.reads(),2);
  assert.equal(w.document.querySelector('[data-model-extension-request]'),null);
  assert.deepEqual(JSON.parse(w.sessionStorage.getItem('mmd_console_extension_operations_v1')),[other,['sess_A','extension_displayed','resolved']]);
 }finally{w.close()}
});
test('a late action response cannot resurrect an operation after terminal reconciliation',async()=>{
 let finish;
 const f=await extensionFixture('sess_A',false,'',()=>new Promise(resolve=>{finish=resolve}));
 const w=f.dom.window;
 try{
  w.document.querySelector('[data-ext-approve]').click();
  f.extension.status='model_approved';
  w.dispatchEvent(new w.PageTransitionEvent('pagehide'));
  w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));await new Promise(setImmediate);
  const key='mmd_console_extension_operations_v1';
  assert.deepEqual(JSON.parse(w.sessionStorage.getItem(key)),[['sess_A','extension_displayed','resolved']]);
  finish({ok:true,json:async()=>({ok:true})});await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(w.sessionStorage.getItem(key)),[['sess_A','extension_displayed','resolved']]);
  assert.equal(w.document.querySelector('[data-model-extension-request]'),null);
  const reopened=await extensionFixture('sess_A',false,'',undefined,w.sessionStorage.getItem(key));
  try{assert.equal(reopened.dom.window.document.querySelector('[data-model-extension-request]'),null);assert.equal(reopened.posts.length,0)}finally{reopened.dom.window.close()}
 }finally{w.close()}
});
for(const responseCase of ['requested','different_request','missing_request','malformed_status','missing_ok','error'])test(`reconciliation preserves uncertain operation on ${responseCase}`,async()=>{
 const f=await extensionFixture('sess_A');const w=f.dom.window;
 try{
  w.document.querySelector('[data-ext-approve]').click();await new Promise(setImmediate);
  const extension=responseCase==='missing_request'?undefined:{request_id:responseCase==='different_request'?'another_request':'extension_displayed',status:responseCase==='requested'?'requested':responseCase==='malformed_status'?{}:'model_approved'};
  w.fetch=async()=>({ok:responseCase!=='error',json:async()=>({...(responseCase==='missing_ok'?{}:{ok:responseCase!=='error'}),session:f.session,extension_request:extension})});
  w.dispatchEvent(new w.PageTransitionEvent('pagehide'));w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(w.sessionStorage.getItem('mmd_console_extension_operations_v1')),[['sess_A','extension_displayed','unknown']]);
 }finally{w.close()}
});
