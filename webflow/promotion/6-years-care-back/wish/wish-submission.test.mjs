import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./wish-submission.js", import.meta.url), "utf8");

function loadHooks(overrides = {}) {
  const listeners = new Map();
  const dispatched = [];
  const storage = new Map();
  const context = {
    __MMD_WISH_TEST_MODE__: true,
    console,
    Date,
    Math,
    URL,
    crypto: { randomUUID: () => "12345678-1234-4234-8234-123456789abc" },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    document: {
      readyState: "loading",
      addEventListener: (name, listener) => listeners.set(name, listener),
      querySelector: () => null,
      querySelectorAll: () => [],
      dispatchEvent: (event) => dispatched.push(event),
      documentElement: { lang: "th" },
    },
    window: {
      location: { origin: "https://mmdbkk.com" },
      matchMedia: () => ({ matches: false }),
    },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    ...overrides,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return { ...context.__MMD_WISH_TEST__, context, dispatched, storage };
}

test("Wish input validation blocks empty, hostile and oversized content", () => {
  const { validateWish } = loadHooks();
  assert.equal(validateWish("   ").reason, "empty");
  assert.equal(validateWish("<script>").reason, "invalid");
  assert.equal(validateWish("x".repeat(601)).reason, "tooLong");
  assert.equal(validateWish(" สุขสันต์วันเกิด MMD ครับ ").value, "สุขสันต์วันเกิด MMD ครับ");
});

test("Public Wish payload contains no browser identity or benefit authority", () => {
  const { buildPayload, requestId } = loadHooks();
  const payload = buildPayload("สุขสันต์วันเกิดครับ");
  assert.deepEqual(Object.keys(payload), ["wish_text", "request_id", "language"]);
  assert.equal(payload.wish_text, "สุขสันต์วันเกิดครับ");
  assert.equal(payload.language, "th");
  assert.match(payload.request_id, /^[A-Za-z0-9][A-Za-z0-9._~-]{15,127}$/);
  assert.match(requestId(), /^wish-/);
  assert.doesNotMatch(JSON.stringify(payload), /line_user_id|member_id|identity|payment|review|coupon|points|expiry|claim/i);
});

test("Wish completion trusts only a safe bounded server message", () => {
  const { safeServerMessage } = loadHooks();
  assert.equal(safeServerMessage({ final_display: { message: "MMD ได้รับคำอวยพรแล้วครับ" } }), "MMD ได้รับคำอวยพรแล้วครับ");
  assert.equal(safeServerMessage({ final_display: { message: "<b>unsafe</b>" } }), "");
  assert.equal(safeServerMessage({ final_display: { message: "x".repeat(301) } }), "");
});

test("Browser bridge posts Public Wish and keeps benefit linking separate", () => {
  assert.match(source, /\/member\/api\/care-back\/public-wish/);
  assert.match(source, /\/member\/api\/care-back\/link-wish/);
  assert.doesNotMatch(source, /\/member\/api\/liff\/care-back\/wish/);
  assert.match(source, /fetch\(ENDPOINT,/);
  assert.match(source, /credentials:\s*"same-origin"/);
  assert.match(source, /payload\?\.state\s*!==\s*"completed"/);
  assert.match(source, /mmd:care-back:wish-completed/);
  assert.match(source, /benefitVerificationRequired:\s*true/);
  assert.doesNotMatch(source, /window\.location\.assign|LIFF_URL|getProfile\(/);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotThrow(() => new Function(source));
});

test("Customer copy says benefits are checked separately from the Wish", () => {
  assert.match(source, /คูปอง วันสมาชิก และ Points จะตรวจแยกผ่าน LINE/);
  assert.match(source, /Coupon, membership extension and Points are checked separately through LINE/);
  assert.match(source, /优惠券、会员期限和积分将通过 LINE 另行核验/);
});

test("link token accepts only opaque public Wish tokens", () => {
  const { validLinkToken } = loadHooks();
  assert.equal(validLinkToken(`pw_${"A".repeat(43)}`), true);
  assert.equal(validLinkToken("wish-plain-id"), false);
  assert.equal(validLinkToken("pw_<unsafe>"), false);
});
