// Behavioral regression tests for /sigil/confirm/job-model (EMs16 silent failure).
// Runs the mirrored Webflow runtime inside a vm with a minimal fake DOM.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const RUNTIME = readFileSync(new URL("./job-model-v15-i18n.js", import.meta.url), "utf8");
const GATE = readFileSync(new URL("./model-direct-first-job-gate-v1.js", import.meta.url), "utf8");

function b64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
const TOKEN = `${b64url({ kind: "model_confirm", role: "model", session_id: "sess_test_a97c529604a34602", payment_ref: "pay_x", payment_type: "deposit", iat: 1, exp: 9999999999 })}.sig`;

class FakeEl {
  constructor(tag = "div", attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.textContent = "";
    this.className = "";
    this.style = {};
    this._classes = new Set();
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      toggle: (c, on) => { const v = on === undefined ? !this._classes.has(c) : Boolean(on); v ? this._classes.add(c) : this._classes.delete(c); return v; },
      contains: (c) => this._classes.has(c),
    };
    for (const [k, v] of Object.entries(attrs)) this.setAttribute(k, v);
  }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  async click() {
    if (this.disabled) return;
    for (const fn of this.listeners.click || []) await fn({ preventDefault() {}, target: this });
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...kids) { kids.forEach((k) => this.appendChild(k)); }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  insertBefore(child, ref) {
    child.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(child); else this.children.splice(i, 0, child);
    return child;
  }
  closest() { return null; }
  focus() { this.focused = true; }
  querySelector(sel) { return this.find(sel)[0] || null; }
  querySelectorAll(sel) { return this.find(sel); }
  find(sel) {
    const out = [];
    const m = /^\[([a-z0-9-]+)\]$/i.exec(sel);
    const walk = (n) => n.children.forEach((c) => { if (m && c.hasAttribute(m[1])) out.push(c); walk(c); });
    walk(this);
    return out;
  }
  get allText() { return [this.textContent, ...this.children.map((c) => c.allText)].join(" "); }
}

function buildRoot() {
  const root = new FakeEl("section", { id: "mmd-model-confirm-v15" });
  const names = ["data-m-pill", "data-m-status", "data-m-retry", "data-m-client", "data-m-type", "data-m-date", "data-m-time", "data-m-location", "data-m-vip-row", "data-m-vip", "data-m-map", "data-m-payout-card", "data-m-payout", "data-m-check", "data-m-confirm", "data-m-success"];
  const el = {};
  for (const name of names) {
    const tag = name === "data-m-check" ? "input" : name === "data-m-confirm" || name === "data-m-retry" ? "button" : "div";
    el[name] = root.appendChild(new FakeEl(tag, { [name]: "" }));
  }
  el["data-m-success"].hidden = true;
  el["data-m-retry"].hidden = true;
  return { root, el };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body };
}

function harness({ routes = {}, token = TOKEN, ua = "Mozilla/5.0 Line/14.0.0", withRoot = true, readyState = "complete", sessionStore = new Map(), withGate = false }) {
  const calls = [];
  const { root, el } = buildRoot();
  const body = new FakeEl("body");
  const head = new FakeEl("head");
  const docListeners = {};
  const replaced = [];
  const document = {
    readyState,
    body,
    head,
    documentElement: { lang: "th" },
    getElementById: (id) => (withRoot && id === "mmd-model-confirm-v15" ? root : null),
    querySelector: (sel) => {
      if (sel === "[data-mmd-direct-first-job-gate]") return body.children.find((c) => c.hasAttribute("data-mmd-direct-first-job-gate")) || null;
      if (sel === "[data-mmd-model-confirm-fallback]") return body.children.find((c) => c.hasAttribute("data-mmd-model-confirm-fallback")) || null;
      return null;
    },
    createElement: (tag) => new FakeEl(tag),
    addEventListener: (type, fn) => (docListeners[type] ||= []).push(fn),
  };
  const href = `https://mmdbkk.com/sigil/confirm/job-model?t=${encodeURIComponent(token)}`;
  const location = { href, pathname: "/sigil/confirm/job-model", search: `?t=${encodeURIComponent(token)}`, replace: (u) => replaced.push(u) };
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, href);
    const payload = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: url.pathname, payload, credentials: init.credentials });
    const route = routes[url.pathname];
    const next = Array.isArray(route) ? route.shift() : route;
    if (!next) throw new TypeError("Failed to fetch");
    if (next === "hang") return new Promise(() => {});
    if (next instanceof Error) throw next;
    return jsonResponse(next.status, next.body);
  };
  const warnings = [];
  const context = {
    document, location, navigator: { userAgent: ua }, fetch, URL, URLSearchParams, AbortController, TextDecoder, Uint8Array, Intl, Date, Promise, JSON, Number, String, Boolean, Array, Object, Set, Map, Math, RegExp, Error, TypeError,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    setTimeout: (fn, ms) => setTimeout(fn, ms >= 1000 ? 5 : ms),
    clearTimeout,
    console: { warn: (...a) => warnings.push(a), log() {}, error() {} },
    CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i?.detail; } },
    history: { state: null, replaceState() {} },
    localStorage: { getItem: () => "", setItem() {} },
    sessionStorage: { getItem: (k) => sessionStore.get(k) ?? null, setItem: (k, v) => sessionStore.set(k, v) },
  };
  context.window = context;
  context.Request = class { constructor(u) { this.url = u; } };
  vm.createContext(context);
  if (withGate) vm.runInContext(GATE, context);
  vm.runInContext(RUNTIME, context);
  const fireReady = async () => { for (const fn of docListeners.DOMContentLoaded || []) fn(); await settle(); };
  return { root, el, body, calls, replaced, warnings, fireReady, sessionStore };
}

const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const DETAILS_OK = { status: 200, body: { ok: true, role: "model", client_name: "คุณ A", job_type: "private", job_date: "2026-10-02", start_time: "19:00", end_time: "21:00", location_name: "Hotel", model_payout_thb: 5000, confirmation_revision: "rev123", already_confirmed: false, model_acknowledged_at: null } };
const feedback = (h) => h.root.querySelector("[data-m-confirm-feedback]");
const diag = (h) => h.root.querySelector("[data-m-diag]");
const status = (h) => h.el["data-m-status"];

test("valid model confirm: unticked tap gives visible feedback, ticked tap shows loading then success and sends revision", async () => {
  const h = harness({ routes: { "/v1/confirm/details": DETAILS_OK, "/v1/confirm/ack": { status: 200, body: { ok: true, idempotent: false } } } });
  await settle();
  assert.equal(h.root.dataset.mmdState, "ready");
  const confirm = h.el["data-m-confirm"];
  assert.equal(confirm.disabled, false, "button must stay tappable so a tap always gets feedback");
  assert.equal(confirm.getAttribute("aria-disabled"), "true");

  await confirm.click();
  assert.equal(h.calls.filter((c) => c.path === "/v1/confirm/ack").length, 0);
  assert.equal(feedback(h).hidden, false);
  assert.match(feedback(h).textContent, /ติ๊ก/);
  assert.equal(h.root.dataset.mmdState, "needs_check");

  h.el["data-m-check"].checked = true;
  const pending = confirm.click();
  assert.equal(confirm.textContent, "กำลังยืนยัน…");
  assert.equal(confirm.getAttribute("aria-busy"), "true");
  await pending;
  await settle();
  const ack = h.calls.find((c) => c.path === "/v1/confirm/ack");
  assert.deepEqual(ack.payload, { t: TOKEN, expected_role: "model", confirmation_revision: "rev123" });
  assert.equal(h.root.dataset.mmdState, "confirmed");
  assert.equal(h.el["data-m-success"].hidden, false);
  assert.equal(confirm.textContent, "ยืนยันแล้ว");
});

test("expired token shows model-safe expiry copy, no retry, and owner-safe reference", async () => {
  const h = harness({ routes: { "/v1/confirm/details": { status: 410, body: { ok: false, error: "confirmation_token_expired" } } } });
  await settle();
  assert.equal(h.root.dataset.mmdState, "load_failed");
  assert.match(status(h).textContent, /หมดอายุ/);
  assert.equal(h.el["data-m-retry"].hidden, true);
  assert.match(diag(h).textContent, /MC-D410-confirmation_token_expired-a34602-\d{4}/);
});

test("missing session shows not-found copy with reference", async () => {
  const h = harness({ routes: { "/v1/confirm/details": { status: 404, body: { ok: false, error: "session_not_found" } } } });
  await settle();
  assert.match(status(h).textContent, /ไม่พบงานนี้/);
  assert.match(diag(h).textContent, /MC-D404-session_not_found/);
});

test("missing payment_ref (invalid subject) shows bad-link copy with reference", async () => {
  const h = harness({ routes: { "/v1/confirm/details": { status: 401, body: { ok: false, error: "invalid_confirmation_token_subject" } } } });
  await settle();
  assert.match(status(h).textContent, /ลิงก์นี้ไม่สมบูรณ์/);
  assert.match(diag(h).textContent, /MC-D401-invalid_confirmation_token_subject/);
});

test("replaced / inactive link is explained instead of a generic failure", async () => {
  const h = harness({ routes: { "/v1/confirm/details": { status: 401, body: { ok: false, error: "confirmation_token_not_active" } } } });
  await settle();
  assert.match(status(h).textContent, /ลิงก์ล่าสุด/);
});

test("already confirmed shows รับทราบแล้ว and never posts ack", async () => {
  const h = harness({ routes: { "/v1/confirm/details": { status: 200, body: { ...DETAILS_OK.body, already_confirmed: true, model_acknowledged_at: "2026-09-24T11:31:39.146Z" } } } });
  await settle();
  assert.equal(h.root.dataset.mmdState, "already_confirmed");
  assert.equal(h.el["data-m-pill"].textContent, "รับทราบแล้ว");
  assert.equal(h.el["data-m-success"].hidden, false);
  assert.equal(h.el["data-m-confirm"].disabled, true);
  await h.el["data-m-confirm"].click();
  assert.equal(h.calls.filter((c) => c.path === "/v1/confirm/ack").length, 0);
});

test("confirm POST failure shows a visible error next to the button with a reference code", async () => {
  const h = harness({ routes: { "/v1/confirm/details": DETAILS_OK, "/v1/confirm/ack": { status: 503, body: { ok: false, error: "airtable_request_failed" } } } });
  await settle();
  h.el["data-m-check"].checked = true;
  await h.el["data-m-confirm"].click();
  await settle();
  assert.equal(h.root.dataset.mmdState, "confirm_failed");
  assert.equal(feedback(h).hidden, false);
  assert.ok(feedback(h).classList.contains("is-error"));
  assert.match(feedback(h).textContent, /ขัดข้องชั่วคราว/);
  assert.match(diag(h).textContent, /MC-A503-airtable_request_failed/);
  assert.equal(h.el["data-m-confirm"].textContent, "ยืนยันรับงาน");
  assert.equal(h.el["data-m-confirm"].disabled, false, "model can retry the confirm");
});

test("confirm network failure is visible, not silent", async () => {
  const h = harness({ routes: { "/v1/confirm/details": DETAILS_OK } });
  await settle();
  h.el["data-m-check"].checked = true;
  await h.el["data-m-confirm"].click();
  await settle();
  assert.match(feedback(h).textContent, /เชื่อมต่อไม่ได้/);
  assert.match(diag(h).textContent, /MC-A000-network_error/);
});

test("details changed on ack reloads details and asks the model to confirm again", async () => {
  const h = harness({ routes: {
    "/v1/confirm/details": [DETAILS_OK, { status: 200, body: { ...DETAILS_OK.body, confirmation_revision: "rev456" } }],
    "/v1/confirm/ack": { status: 409, body: { ok: false, error: "confirmation_details_changed_reload_required" } },
  } });
  await settle();
  h.el["data-m-check"].checked = true;
  await h.el["data-m-confirm"].click();
  await settle();
  assert.equal(h.calls.filter((c) => c.path === "/v1/confirm/details").length, 2);
  assert.equal(h.root.dataset.mmdState, "ready");
  assert.match(status(h).textContent, /เพิ่งถูกอัปเดต/);
});

test("a hanging details request ends in a visible timeout with retry", async () => {
  const h = harness({ routes: { "/v1/confirm/details": ["hang", DETAILS_OK] } });
  await settle(80);
  assert.equal(h.root.dataset.mmdState, "load_failed");
  assert.match(status(h).textContent, /ตอบช้า/);
  assert.equal(h.el["data-m-retry"].hidden, false);
  await h.el["data-m-retry"].click();
  await settle();
  assert.equal(h.root.dataset.mmdState, "ready");
});

test("no customer payment amount, rate, token or payment ref leaks into model-visible diagnostics", async () => {
  const h = harness({ routes: { "/v1/confirm/details": DETAILS_OK, "/v1/confirm/ack": { status: 500, body: { ok: false, error: "confirmation_ack_failed" } } } });
  await settle();
  h.el["data-m-check"].checked = true;
  await h.el["data-m-confirm"].click();
  await settle();
  const text = `${diag(h).textContent} ${JSON.stringify(h.warnings)} ${h.root.dataset.mmdDiag}`;
  assert.doesNotMatch(text, /5000|pay_|sig\b|THB|amount|price/i);
  assert.ok(!text.includes(TOKEN));
});

test("missing root never exits silently", async () => {
  const h = harness({ routes: {}, withRoot: false });
  await settle();
  const box = h.body.children.find((c) => c.hasAttribute("data-mmd-model-confirm-fallback"));
  assert.ok(box, "fallback notice rendered");
  assert.match(box.allText, /MC-ROOT/);
});

test("runtime pasted in <head> waits for DOMContentLoaded instead of exiting", async () => {
  const h = harness({ routes: { "/v1/confirm/details": DETAILS_OK }, readyState: "loading", withRoot: false });
  assert.equal(h.calls.length, 0);
  assert.equal(h.body.children.length, 0);
  await h.fireReady();
  assert.ok(h.body.children.find((c) => c.hasAttribute("data-mmd-model-confirm-fallback")), "after DOM ready it renders, never silent");
});

test("gate: first 401 redirects to LINE Mini App once; a bounce back within the window shows a manual screen instead of looping", async () => {
  const store = new Map();
  const unauth = { status: 401, body: { ok: false, error: "model_session_required" } };
  const h1 = harness({ withGate: true, sessionStore: store, routes: { "/v1/model/direct-job-gate/status": unauth } });
  await settle();
  assert.equal(h1.replaced.length, 1);
  assert.match(h1.replaced[0], /miniapp\.line\.me/);
  assert.equal(h1.root.dataset.mmdState, "reentry");
  assert.match(status(h1).textContent, /กำลังเปิดใน LINE/);

  const h2 = harness({ withGate: true, sessionStore: store, routes: { "/v1/model/direct-job-gate/status": unauth } });
  await settle();
  assert.equal(h2.replaced.length, 0, "no second automatic redirect");
  const overlay = h2.body.children.find((c) => c.hasAttribute("data-mmd-direct-first-job-gate"));
  assert.ok(overlay);
  assert.match(overlay.allText, /MC-G-model_session_required/);
  assert.match(overlay.allText, /เปิดใน MMD APP/);
  assert.equal(h2.root.dataset.mmdState, "gate");
});

test("gate: inside LIFF a missing session shows a manual screen, never an automatic loop", async () => {
  const h = harness({ withGate: true, ua: "Mozilla/5.0 Line/14.0.0 LIFF", routes: { "/v1/model/direct-job-gate/status": { status: 401, body: { ok: false, error: "model_session_expired" } } } });
  await settle();
  assert.equal(h.replaced.length, 0);
  assert.ok(h.body.children.find((c) => c.hasAttribute("data-mmd-direct-first-job-gate")));
});

test("gate: failed preflight is not cached, so retry can recover", async () => {
  const ok = { status: 200, body: { ok: true, applies: false, required: false } };
  const h = harness({ withGate: true, routes: { "/v1/model/direct-job-gate/status": [new TypeError("Failed to fetch"), ok], "/v1/confirm/details": DETAILS_OK } });
  await settle();
  const overlay = h.body.children.find((c) => c.hasAttribute("data-mmd-direct-first-job-gate"));
  assert.match(overlay.allText, /MC-G-direct_job_gate_network/);
  h.body.children.splice(h.body.children.indexOf(overlay), 1);
  await h.el["data-m-retry"].click();
  await settle();
  assert.equal(h.calls.filter((c) => c.path === "/v1/model/direct-job-gate/status").length, 2);
  assert.equal(h.root.dataset.mmdState, "ready");
});
