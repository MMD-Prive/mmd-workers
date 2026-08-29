import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./wish-submission.js", import.meta.url), "utf8");

function loadHooks(overrides = {}) {
  const listeners = new Map();
  const assigned = [];
  const dispatched = [];
  const context = {
    __MMD_WISH_TEST_MODE__: true,
    console,
    Date,
    Math,
    URL,
    crypto: { randomUUID: () => "12345678-1234-4234-8234-123456789abc" },
    document: {
      readyState: "loading",
      addEventListener: (name, listener) => listeners.set(name, listener),
      querySelector: () => null,
      dispatchEvent: (event) => dispatched.push(event),
      documentElement: { lang: "th" },
    },
    window: {
      location: {
        origin: "https://mmdbkk.com",
        assign: (value) => assigned.push(value),
      },
    },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    ...overrides,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return { ...context.__MMD_WISH_TEST__, context, assigned, dispatched };
}

test("Wish input validation blocks empty, hostile and oversized content", () => {
  const { validateWish } = loadHooks();
  assert.equal(validateWish("   ").reason, "empty");
  assert.equal(validateWish("<script>").reason, "invalid");
  assert.equal(validateWish("x".repeat(601)).reason, "tooLong");
  assert.equal(validateWish(" สุขสันต์วันเกิด MMD ครับ ").value, "สุขสันต์วันเกิด MMD ครับ");
});

test("Wish payload contains only the customer Wish and bounded idempotency key", () => {
  const { buildPayload, requestId } = loadHooks();
  const payload = buildPayload("สุขสันต์วันเกิดครับ");
  assert.deepEqual(Object.keys(payload), ["wish_text", "request_id"]);
  assert.equal(payload.wish_text, "สุขสันต์วันเกิดครับ");
  assert.match(payload.request_id, /^[A-Za-z0-9][A-Za-z0-9._~-]{15,127}$/);
  assert.match(requestId(), /^wish-/);
  assert.doesNotMatch(JSON.stringify(payload), /line_user_id|member_id|identity|payment|review|coupon|points|expiry/i);
});

test("Wish completion trusts only a safe bounded server message", () => {
  const { safeServerMessage } = loadHooks();
  assert.equal(safeServerMessage({ final_display: { message: "MMD ได้รับคำอวยพรแล้วครับ" } }), "MMD ได้รับคำอวยพรแล้วครับ");
  assert.equal(safeServerMessage({ final_display: { message: "<b>unsafe</b>" } }), "");
  assert.equal(safeServerMessage({ final_display: { message: "x".repeat(241) } }), "");
});

test("Browser bridge binds the CTA, posts same-origin and never renders raw HTML", () => {
  assert.match(source, /querySelectorAll\("\[data-start\]"\)/);
  assert.match(source, /addEventListener\("click"/);
  assert.match(source, /method:\s*"POST"/);
  assert.match(source, /credentials:\s*"same-origin"/);
  assert.match(source, /\/member\/api\/liff\/care-back\/wish/);
  assert.match(source, /payload\?\.state\s*!==\s*"completed"/);
  assert.match(source, /mmd:care-back:wish-completed/);
  assert.match(source, /2010862595-yT4DCEMc/);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|document\.write|localStorage|sessionStorage|getProfile\(/);
  assert.doesNotThrow(() => new Function(source));
});

test("Customer copy is TH, EN and ZH and Thai copy keeps Per Voice", () => {
  assert.match(source, /th:\s*\{/);
  assert.match(source, /en:\s*\{/);
  assert.match(source, /zh:\s*\{/);
  assert.match(source, /ผม/);
  assert.doesNotMatch(source, /ระบบ/);
});

function fakeForm(value = "สุขสันต์วันเกิด MMD ครับ") {
  return {
    pending: false,
    textarea: { value, disabled: false, focus() {} },
    submit: { disabled: false, hidden: false },
    status: { textContent: "", dataset: {} },
    copy: {
      empty: "empty", tooLong: "tooLong", invalid: "invalid", pending: "pending",
      unavailable: "unavailable", review: "review", signIn: "signIn",
    },
  };
}

test("duplicate submission while pending creates exactly one POST", async () => {
  let calls = 0;
  let release;
  const response = new Promise((resolve) => { release = resolve; });
  const fetch = async () => { calls += 1; return response; };
  const { submitWish } = loadHooks({ fetch });
  const form = fakeForm();
  const event = { preventDefault() {} };
  const first = submitWish(event, form);
  const second = submitWish(event, form);
  assert.equal(calls, 1);
  release({ ok: true, status: 200, json: async () => ({ ok: true, state: "completed", final_display: { message: "MMD ได้รับคำอวยพรแล้วครับ" } }) });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(form.textarea.disabled, true);
  assert.equal(form.submit.hidden, true);
});

test("missing session returns through the canonical LIFF", async () => {
  const fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { code: "LIFF_SESSION_REQUIRED" } }) });
  const hooks = loadHooks({ fetch });
  const form = fakeForm();
  await hooks.submitWish({ preventDefault() {} }, form);
  assert.equal(hooks.assigned.length, 1);
  assert.match(hooks.assigned[0], /2010862595-yT4DCEMc/);
  assert.match(hooks.assigned[0], /return_to=%2Fpromotion%2F6-years-care-back%2Fwish/);
});
