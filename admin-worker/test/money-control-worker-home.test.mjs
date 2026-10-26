import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

import {
  handleMoneyControlWorkerHome,
  isMoneyControlWorkerHomeRequest,
} from "../src/money-control-worker-home.js";

test("Money Control task entrance is limited to its existing GET/HEAD page", () => {
  assert.equal(isMoneyControlWorkerHomeRequest("/internal/admin/payments", "GET"), true);
  assert.equal(isMoneyControlWorkerHomeRequest("/internal/admin/payments/", "HEAD"), true);
  assert.equal(isMoneyControlWorkerHomeRequest("/internal/admin/payments", "POST"), false);
  assert.equal(isMoneyControlWorkerHomeRequest("/internal/admin/payments/historical-backfill", "GET"), false);
  assert.equal(isMoneyControlWorkerHomeRequest("/v1/admin/payments/review", "GET"), false);
});

test("Worker page is private, self-contained, and states the operator payment boundary", async () => {
  const response = handleMoneyControlWorkerHome(new Request("https://mmdbkk.com/internal/admin/payments"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker-money-control-home");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
  assert.match(response.headers.get("content-security-policy"), /img-src 'self' data: blob:/);
  const html = await response.text();
  assert.match(html, /เปิดหลักฐาน/);
  assert.match(html, /เทียบยอดและลูกค้า\/งาน/);
  assert.match(html, /การรับสลิปเข้าคิวเป็นเพียงการรับหลักฐาน/);
  assert.match(html, /searchParams\.set\('mmd_worker_view','existing'\)/);
  assert.match(html, /review-queue/);
  assert.match(html, /proof-detail/);
  assert.match(html, /v1\/admin\/payments\/evidence\?proof_id=/);
  assert.match(html, /image\/\*,application\/pdf/);
  assert.match(html, /mmd_worker_view','existing'/);
  assert.match(html, /บันทึกปัญหาข้อมูล/);
  assert.match(html, /ปฏิเสธหลักฐาน/);
  assert.match(html, /v1\/admin\/payments\/review/);
  assert.match(html, /payments-worker/);
  assert.match(html, /credentials:'include',cache:'no-store'/);
  assert.match(html, /เปิดตรวจ/);
  assert.match(html, /Proof ID ที่ระบุไม่อยู่ในคิว/);
  assert.doesNotMatch(html, /\.innerHTML\s*=/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /<iframe\b|cdn\./i);
});

test("queue view safely renders backend values and deep-links into the existing review flow", async () => {
  class Element {
    constructor(tag = "div") { this.tagName = tag; this.children = []; this.dataset = {}; this.listeners = {}; this.value = ""; this.hidden = false; this.href = ""; this.className = ""; this._text = ""; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = [...children]; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
  }
  const ids = ["extract-slip", "extract-status","upload-panel", "upload-form", "upload-submit", "upload-status", "upload-file", "upload-source", "upload-stage", "upload-job", "queue-scope", "q-status", "q-list", "search", "status-filter", "stage-filter", "channel-filter", "refresh", "proof-detail", "detail-grid", "evidence-view", "detail-title", "detail-note", "continue-review", "decision-reason", "decision-confirm", "decision-prompt", "decision-status", "confirm-decision", "cancel-decision", "log-issue", "reject-proof"];
  const elements = Object.fromEntries(ids.map(id => [id, new Element(id === "q-list" ? "div" : "input")]));
  const calls = [];
  let extractionFails = false;
  const malicious = "<img src=x onerror=alert(1)>";
  const response = {
    ok: true,
    items: [{
      proof_id: "proof_fixture_1", client_display: malicious, status: "pending", payment_stage: "deposit",
      source_channel: "line_ofc", evidence_amount_thb: 2500, expected_amount_thb: 2500,
      session_id: "session_fixture_1", received_at: "2026-10-20T10:00:00Z", payment_ref: "ref_fixture_1",
    }],
  };
  const document = {
    getElementById(id) { return elements[id]; },
    createElement(tag) { return new Element(tag); },
  };
  class FakeOption extends Element { constructor(label, value) { super("option"); this.textContent = label; this.value = value; } }
  const html = await handleMoneyControlWorkerHome(new Request("https://mmdbkk.com/internal/admin/payments?proof_id=proof_fixture_1")).text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  vm.runInNewContext(script, {
    document,
    location: { href: "https://mmdbkk.com/internal/admin/payments?proof_id=proof_fixture_1", origin: "https://mmdbkk.com" },
    URL,
    Date,
    Set,
    Option: FakeOption,
    fetch: async (...args) => { calls.push(args); if(args[1]?.body && JSON.parse(args[1].body).action === 'extract_evidence') return {ok: !extractionFails, json: async()=>extractionFails?{ok:false,error:'payment_evidence_sha_mismatch'}:{ok:true,result:{amount_thb:12500,paid_at:'2026-10-25T13:07:00Z'},money_truth_changed:false}}; return calls.length === 1 ? { ok: true, json: async () => response } : calls.length === 2 ? { ok: false } : { ok: true, json: async () => ({ ok: true, decision: "issue" }) }; },
    crypto: { randomUUID: () => "fixture-idempotency-key" },
    addEventListener() {},
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], "/v1/admin/payments/review-queue?limit=100&include_context=1&proof_id=proof_fixture_1");
  assert.equal(calls[0][1].credentials, "include");
  assert.equal(calls[0][1].cache, "no-store");
  assert.equal(calls[1][0], "/v1/admin/payments/evidence?proof_id=proof_fixture_1");
  assert.equal(calls[1][1].credentials, "include");
  assert.equal(calls[1][1].cache, "no-store");
  const link = elements["q-list"].children[0];
  assert.equal(link.tagName, "a");
  assert.equal(link.href, "/internal/admin/payments?proof_id=proof_fixture_1&session_id=session_fixture_1");
  assert.ok(link.textContent.includes(malicious));
  assert.equal(link.children[0].children[0].textContent, malicious);
  assert.equal(elements["proof-detail"].hidden, false);
  assert.equal(elements["continue-review"].href, "/internal/admin/payments?proof_id=proof_fixture_1&session_id=session_fixture_1&mmd_worker_view=existing");
  assert.match(elements["detail-grid"].textContent, /2,500\.00 บาท/);
  assert.match(elements["q-status"].textContent, /แสดง 1 จาก 1/);
  elements["decision-reason"].value = "ยอดอ้างอิงไม่ตรง";
  elements["log-issue"].listeners.click();
  assert.equal(elements["decision-confirm"].hidden, false);
  await elements["confirm-decision"].listeners.click();
  assert.equal(calls[2][0], "/v1/admin/payments/review");
  assert.equal(calls[2][1].method, "POST");
  assert.equal(calls[2][1].headers["Idempotency-Key"], "fixture-idempotency-key");
  assert.deepEqual(JSON.parse(calls[2][1].body), { proof_id: "proof_fixture_1", decision: "issue", admin_reason: "เหตุผลผู้ดูแล: ยอดอ้างอิงไม่ตรง", idempotency_key: "fixture-idempotency-key" });
  assert.match(elements["decision-status"].textContent, /บันทึกปัญหาแล้ว/);
  await elements['extract-slip'].listeners.click();
  assert.deepEqual(JSON.parse(calls.at(-1)[1].body),{action:'extract_evidence',proof_id:'proof_fixture_1'});
  assert.match(elements['extract-status'].textContent,/12,500.00/);
  assert.match(elements['extract-status'].textContent,/ยังไม่ได้บันทึกหรือยืนยันเงินเข้า/);
  extractionFails=true;
  await elements['extract-slip'].listeners.click();
  assert.match(elements['extract-status'].textContent,/อ่านสลิปไม่สำเร็จ/);
  assert.doesNotMatch(elements['extract-status'].textContent,/12,500/);
  assert.equal(elements['extract-slip'].disabled,false);

});

test("HEAD returns headers without a page body", async () => {
  const response = handleMoneyControlWorkerHome(new Request("https://mmdbkk.com/internal/admin/payments", { method: "HEAD" }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

async function sessionUI(payload, code = 200) {
  const elements = new Map(), calls = [];
  class Element {
    constructor(){this.children=[];this.dataset={};this.listeners={};this.value='';this.hidden=false;this.textContent='';}
    append(...values){this.children.push(...values)}
    replaceChildren(...values){this.children=values}
    addEventListener(name,fn){this.listeners[name]=fn}
  }
  const document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id)},createElement(){return new Element()}};
  const html=await handleMoneyControlWorkerHome(new Request('https://mmdbkk.com/internal/admin/payments')).text();
  for(const match of html.matchAll(/id="([^"]+)"/g))document.getElementById(match[1]);
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{document,URL,Date,Set,FormData,Option:class extends Element{constructor(label,value){super();this.value=value}},location:{href:'https://mmdbkk.com/internal/admin/payments?session_id=sess_old',origin:'https://mmdbkk.com'},fetch:async(url,options)=>{calls.push({url,options});return {ok:code===200,status:code,json:async()=>payload}},addEventListener(){}});
  await new Promise(resolve=>setTimeout(resolve,0));
  return {elements,calls};
}
test('session page sends exact job filter and offers an upload only after complete lookup',async()=>{
  const f=await sessionUI({ok:true,scope:'session',session_id:'sess_old',items:[]});
  assert.equal(new URL(f.calls[0].url,'https://mmdbkk.com').searchParams.get('session_id'),'sess_old');
  assert.equal(f.elements.get('upload-panel').hidden,false);
  assert.match(f.elements.get('upload-job').textContent,/sess_old/);
  assert.match(f.elements.get('q-status').textContent,/ยังไม่มีสลิปที่รอตรวจ.*100%/);
  assert.equal(f.calls.length,1);
});
test('errors, invalid response and old API without session support never show false empty state',async()=>{
  for(const [payload,code] of [[null,200],[{ok:true},200],[{ok:true,items:[]},200],[{ok:false},503],[{ok:false},401]]){
    const f=await sessionUI(payload,code);
    assert.equal(f.elements.get('upload-panel').hidden,true);
    assert.equal(f.elements.get('q-status').dataset.kind,'error');
    const message=f.elements.get('q-status').textContent;
    f.elements.get('search').listeners.input();
    assert.equal(f.elements.get('q-status').textContent,message);
    assert.doesNotMatch(message,/ยังไม่มีสลิป/);
  }
});
test('upload preserves job context and uses existing authenticated intake without approving money',async()=>{
  const f=await sessionUI({ok:true,scope:'session',session_id:'sess_old',items:[],proof_id:'proof_uploaded'});
  f.elements.get('upload-file').files=[new Blob(['test'],{type:'image/png'})];
  f.elements.get('upload-source').value='line_ofc';f.elements.get('upload-stage').value='deposit';
  await f.elements.get('upload-form').listeners.submit({preventDefault(){}});
  const post=f.calls.find(c=>c.options.method==='POST');
  assert.equal(post.url,'/studio/api/payments/slip-intake');
  assert.equal(post.options.credentials,'include');
  assert.equal(post.options.body.get('session_id'),'sess_old');
  assert.equal(post.options.body.get('payment_stage'),'deposit');
  assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
});
