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
  const html = await response.text();
  assert.match(html, /เปิดหลักฐาน/);
  assert.match(html, /เทียบยอดและลูกค้า\/งาน/);
  assert.match(html, /การรับสลิปเข้าคิวเป็นเพียงการรับหลักฐาน/);
  assert.match(html, /searchParams\.set\('mmd_worker_view','existing'\)/);
  assert.match(html, /review-queue\?limit=100&include_context=1/);
  assert.match(html, /credentials:'include',cache:'no-store'/);
  assert.match(html, /เปิดตรวจ/);
  assert.match(html, /Proof ID ที่ระบุไม่อยู่ในคิวที่โหลด/);
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
  const ids = ["q-status", "q-list", "search", "status-filter", "stage-filter", "channel-filter", "refresh"];
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
    fetch: async (...args) => { calls.push(args); return { ok: true, json: async () => response }; },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/v1/admin/payments/review-queue?limit=100&include_context=1");
  assert.equal(calls[0][1].credentials, "include");
  assert.equal(calls[0][1].cache, "no-store");
  const link = elements["q-list"].children[0];
  assert.equal(link.tagName, "a");
  assert.equal(link.href, "/internal/admin/payments?proof_id=proof_fixture_1&session_id=session_fixture_1&mmd_worker_view=existing");
  assert.ok(link.textContent.includes(malicious));
  assert.equal(link.children[0].children[0].textContent, malicious);
  assert.match(elements["q-status"].textContent, /พบ Proof ID/);
});

test("HEAD returns headers without a page body", async () => {
  const response = handleMoneyControlWorkerHome(new Request("https://mmdbkk.com/internal/admin/payments", { method: "HEAD" }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});
