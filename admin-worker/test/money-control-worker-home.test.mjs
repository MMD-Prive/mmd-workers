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
  const ids = ["q-status", "q-list", "search", "status-filter", "stage-filter", "channel-filter", "refresh", "proof-detail", "detail-grid", "evidence-view", "detail-title", "detail-note", "continue-review", "decision-reason", "decision-confirm", "decision-prompt", "decision-status", "confirm-decision", "cancel-decision", "log-issue", "reject-proof"];
  const elements = Object.fromEntries(ids.map(id => [id, new Element(id === "q-list" ? "div" : "input")]));
  const calls = [];
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
    fetch: async (...args) => { calls.push(args); return calls.length === 1 ? { ok: true, json: async () => response } : calls.length === 2 ? { ok: false } : { ok: true, json: async () => ({ ok: true, decision: "issue" }) }; },
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
});

test("HEAD returns headers without a page body", async () => {
  const response = handleMoneyControlWorkerHome(new Request("https://mmdbkk.com/internal/admin/payments", { method: "HEAD" }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});
