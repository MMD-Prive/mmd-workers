import test from "node:test";
import assert from "node:assert/strict";
import { handleLiffRenewalCard, isLiffRenewalCardPath, LIFF_RENEWAL_CARD_INTERNALS } from "../src/liff-renewal-card.js";

class MemoryKv {
  constructor() { this.map = new Map(); }
  async get(key, type) { const v = this.map.get(key); return v == null ? null : type === "json" ? JSON.parse(v) : v; }
  async put(key, value) { this.map.set(key, String(value)); }
}
async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const UID = "U1234567890abcdef1234567890abcdef";
const OFFER = "https://mmdbkk.com/member/api/liff/renewal/offer";
const BUY = "https://mmdbkk.com/member/api/liff/renewal/purchase";

async function fixture({ tier = "Standard", expires, paymentUrl = "https://mmdbkk.com/pay/checkout?t=signed_renew", flag = "true", memberExists = true } = {}) {
  const secret = "test-liff-renewal-card-secret-1234567890";
  const token = "renewal-card-cookie";
  const kv = new MemoryKv();
  const key = "liff:session:" + await hmacHex(secret, "session:" + token);
  kv.map.set(key, JSON.stringify({
    line_user_id: UID, expires_at: Date.now() + 600000, member_exists: memberExists, member_id: "mem_1",
    member_profile: { tier, membership_expires_at: expires },
  }));
  const calls = [];
  const env = {
    LIFF_RENEWAL_CARD_ENABLED: flag, LIFF_SESSION_SECRET: secret, LIFF_IDENTITY_KV: kv,
    PAYMENTS_WORKER: { async fetch(request) {
      const body = await request.json(); calls.push(body);
      return Response.json({ ok: true, payment_ref: "pay_renew_1", session_id: body.session_id, customer_payment_url: paymentUrl, unified_payment_flow: "v1" });
    } },
  };
  const headers = { origin: "https://mmdbkk.com", cookie: "__Host-mmd_liff_session=" + token, "content-type": "application/json" };
  return { env, calls, kv, key, headers };
}
const future = () => new Date(Date.now() + 120 * 86400000).toISOString();
const post = (fx, body) => handleLiffRenewalCard(new Request(BUY, { method: "POST", headers: fx.headers, body: JSON.stringify(body) }), fx.env);
const get = (fx) => handleLiffRenewalCard(new Request(OFFER, { headers: fx.headers }), fx.env);

test("routes are explicit", () => {
  assert.equal(isLiffRenewalCardPath(OFFER), true);
  assert.equal(isLiffRenewalCardPath(BUY), true);
  assert.equal(isLiffRenewalCardPath("https://mmdbkk.com/member/api/liff/payment-intent"), false);
});

test("disabled by default: both routes 404 and never call payments", async () => {
  const fx = await fixture({ expires: future(), flag: "" });
  assert.equal((await get(fx)).status, 404);
  assert.equal((await post(fx, { package_code: "standard" })).status, 404);
  assert.equal(fx.calls.length, 0);
});

test("offer requires a verified LINE session", async () => {
  const response = await handleLiffRenewalCard(new Request(OFFER), { LIFF_RENEWAL_CARD_ENABLED: "true" });
  assert.equal(response.status, 401);
});

test("advance renewal offer: fixed price, starts at the future expiry, server-computed new expiry", async () => {
  const expires = future();
  const fx = await fixture({ expires });
  const payload = await (await get(fx)).json();
  assert.equal(payload.status, "ready");
  assert.equal(payload.package_code, "standard");
  assert.equal(payload.amount_thb, 1000);
  assert.equal(payload.price_rule, "active_advance_standard");
  assert.equal(payload.renewal_starts_at, new Date(expires).toISOString());
  assert.ok(Date.parse(payload.new_expires_at) > Date.parse(expires) + 364 * 86400000);
  assert.equal(payload.entitlement_granted, false);
  assert.equal(payload.official_verification_required, true);
});

test("Premium offer is 2,500", async () => {
  const fx = await fixture({ tier: "Premium", expires: future() });
  const payload = await (await get(fx)).json();
  assert.equal(payload.amount_thb, 2500);
  assert.equal(payload.package_label, "Premium");
});

test("expired less than one year (grace included) is still offered at the base price", async () => {
  const fx = await fixture({ expires: new Date(Date.now() - 5 * 86400000).toISOString() });
  const payload = await (await get(fx)).json();
  assert.equal(payload.status, "ready");
  assert.equal(payload.price_rule, "expired_less_than_one_year_standard");
  assert.equal(payload.amount_thb, 1000);
});

test("expired one year or more is sent to signup, with no payment", async () => {
  const fx = await fixture({ expires: new Date(Date.now() - 400 * 86400000).toISOString() });
  const payload = await (await get(fx)).json();
  assert.equal(payload.status, "signup_instead");
  assert.equal(payload.payment_available, false);
  assert.equal((await post(fx, { package_code: "standard" })).status, 409);
  assert.equal(fx.calls.length, 0);
});

test("VIP / unsupported tiers are routed to the owner, with no payment", async () => {
  const fx = await fixture({ tier: "VIP", expires: future() });
  const payload = await (await get(fx)).json();
  assert.equal(payload.status, "contact_owner");
  assert.equal(payload.payment_available, false);
  assert.equal((await post(fx, { package_code: "standard" })).status, 409);
  assert.equal(fx.calls.length, 0);
});

test("unknown expiry never offers a price", async () => {
  const fx = await fixture({ expires: undefined });
  assert.equal((await (await get(fx)).json()).payment_available, false);
});

test("browser cannot send amount or any field except package_code", async () => {
  const fx = await fixture({ expires: future() });
  const response = await post(fx, { package_code: "standard", amount: 1 });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "BROWSER_PAYMENT_AUTHORITY_REJECTED");
  assert.equal(fx.calls.length, 0);
});

test("package change is refused (must use the membership flow)", async () => {
  const fx = await fixture({ expires: future() });
  const response = await post(fx, { package_code: "premium" });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "LIFF_RENEWAL_PACKAGE_CHANGE_REQUIRES_MEMBERSHIP_FLOW");
  assert.equal(fx.calls.length, 0);
});

test("purchase derives the amount server-side, returns only the signed checkout URL and grants nothing", async () => {
  const fx = await fixture({ expires: future() });
  const response = await post(fx, { package_code: "standard" });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.redirect_to, "https://mmdbkk.com/pay/checkout?t=signed_renew");
  assert.equal(payload.entitlement_granted, false);
  assert.equal(payload.official_verification_required, true);
  assert.equal(fx.calls.length, 1);
  assert.equal(fx.calls[0].amount, 1000);
  assert.equal(fx.calls[0].package_code, "standard");
  assert.equal(fx.calls[0].payment_stage, "membership");
  assert.match(fx.calls[0].notes, /intent=renew;requested_stage=renewal;renewal_price_rule=active_advance_standard/);
  assert.match(fx.calls[0].session_id, /^liffrenew_standard_[0-9a-f]{24}$/);
  const stored = JSON.parse(fx.kv.map.get(fx.key));
  assert.equal(stored.payment_ref, "pay_renew_1");
  assert.equal(stored.payment_amount_thb, 1000);
  assert.equal(stored.customer_payment_url, "https://mmdbkk.com/pay/checkout?t=signed_renew");
});

test("retry resumes the same payment session; a moved expiry gets a new one", async () => {
  const a = await fixture({ expires: "2027-03-01T00:00:00.000Z" });
  const s1 = (await (await post(a, { package_code: "standard" })).json()).session_id;
  const s2 = (await (await post(a, { package_code: "standard" })).json()).session_id;
  assert.equal(s1, s2);
  const b = await fixture({ expires: "2028-08-26T00:00:00.000Z" });
  assert.notEqual((await (await post(b, { package_code: "standard" })).json()).session_id, s1);
});

test("a non-checkout payment URL fails closed", async () => {
  for (const paymentUrl of ["https://mmdbkk.com/sigil/pay?t=x", "https://evil.example/pay/checkout?t=x", "https://mmdbkk.com/pay/checkout?t=x&amount=1"]) {
    const fx = await fixture({ expires: future(), paymentUrl });
    const response = await post(fx, { package_code: "standard" });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, "payments_worker_public_surface_contract_invalid");
  }
});

test("promotion label and expiry helper", () => {
  assert.equal(LIFF_RENEWAL_CARD_INTERNALS.promoLabel(null), "");
  assert.equal(LIFF_RENEWAL_CARD_INTERNALS.promoLabel({ bonus_days: 180 }), "โปรต่ออายุ: เพิ่ม 180 วัน");
  assert.equal(LIFF_RENEWAL_CARD_INTERNALS.promoLabel({ bonus_years: 1 }), "โปรต่ออายุ: เพิ่ม 1 ปี");
  assert.equal(LIFF_RENEWAL_CARD_INTERNALS.expiryAfter({ membership_start_at: "bad", membership_years: 1 }), null);
});

test("Premium advance renewal card shows two years from the current expiry (1 purchased + 1 promo)", async () => {
  const fx = await fixture({ tier: "Premium", expires: "2027-02-28T16:59:59.999Z" });
  const payload = await (await get(fx)).json();
  assert.equal(payload.amount_thb, 2500);
  assert.equal(payload.new_expires_at.slice(0, 10), "2029-02-28");
});
