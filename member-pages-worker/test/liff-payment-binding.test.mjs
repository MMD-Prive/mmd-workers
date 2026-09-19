import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { completeValidatedLiffPaymentIntent } from "../src/liff-payment-binding.js";

class MemoryKv {
  constructor() { this.map = new Map(); }
  async get(key, type) {
    const value = this.map.get(key);
    if (value == null) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.map.set(key, String(value)); }
}

class MemoryGatewayStore {
  constructor() { this.upserts = []; }
  async upsertSession(session, recordId = "") {
    this.upserts.push({ session: { ...session }, recordId });
    return { record_id: recordId || "rec_liff_1" };
  }
  async recordDecision() {}
  async loadScreen() { return null; }
  async resolvePackage() { return null; }
  async hasHallAudienceInventory() { return false; }
}

function paymentsWorker(payload, status = 200) {
  const calls = [];
  return {
    calls,
    async fetch(request) {
      calls.push({ url: request.url, body: await request.json(), source: request.headers.get("x-mmd-source") });
      return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
    },
  };
}

async function keyedDigest(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fixture({ upstreamUrl = "https://mmdbkk.com/sigil/pay?t=signed_token_123" } = {}) {
  const secret = "test-only-liff-session-secret-1234567890";
  const token = "rotated_token_1234567890";
  const kv = new MemoryKv();
  const gateway = new MemoryGatewayStore();
  const payment = paymentsWorker({
    ok: true,
    payment_ref: "pay_1234567890abcdef",
    session_id: "liff-session-123",
    customer_payment_url: upstreamUrl,
    unified_payment_flow: "v1",
  });
  const key = `liff:session:${await keyedDigest(secret, `session:${token}`)}`;
  kv.map.set(key, JSON.stringify({
    session_id: "liff-session-123",
    expires_at: Date.now() + 10 * 60 * 1000,
    gateway_record_id: "rec_liff_1",
    liff_intent: "renew",
    member_exists: true,
    line_user_id: "U1234567890abcdef1234567890abcdef",
    member_profile: { tier: "Premium" },
    selected_package: {
      package_code: "premium",
      amount_thb: 2500,
      requires_manual_review: false,
    },
    payment_binding_status: "contract_unavailable",
    route_after_liff: null,
    next_screen_key: "payment_unavailable",
  }));

  const env = {
    LIFF_SESSION_SECRET: secret,
    LIFF_IDENTITY_KV: kv,
    LIFF_GATEWAY_STORE: gateway,
    PAYMENTS_WORKER: payment,
    RENEWAL_OFFER_RESOLVER: {
      async resolve() {
        return {
          status: "ready",
          package_code: "premium",
          amount_thb: 1999,
          service_spend_365_thb: 25000,
          price_rule: "private_premium_spend_20000",
          membership_years: 2,
          history_status: "verified",
          discount_verified: true,
        };
      },
    },
  };
  const request = new Request("https://mmdbkk.com/member/api/liff/payment-intent", {
    method: "POST",
    headers: { origin: "https://mmdbkk.com", "content-type": "application/json" },
    body: JSON.stringify({ package_code: "premium", payment_stage: "renewal" }),
  });
  const guardedResponse = new Response(JSON.stringify({
    ok: false,
    data: {
      next_screen_key: "payment_unavailable",
      route_after_liff: null,
      payment_binding_status: "contract_unavailable",
      grants: { membership: false, points: false, payment_status: false, private_access: false },
    },
    error: { code: "PAYMENT_TOKEN_CONTRACT_UNAVAILABLE", message: "Payment setup is not available yet." },
  }), {
    status: 503,
    headers: {
      "content-type": "application/json",
      "set-cookie": `__Host-mmd_liff_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900`,
    },
  });
  return { env, request, guardedResponse, key, kv, gateway, payment };
}

describe("LIFF payments-worker binding", () => {
  it("derives the renewal amount server-side and returns one signed /sigil/pay handoff", async () => {
    const fx = await fixture();
    const response = await completeValidatedLiffPaymentIntent(fx.request, fx.guardedResponse, fx.env);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.payment_ref, "pay_1234567890abcdef");
    assert.equal(payload.data.payment_binding_status, "canonical_pending");
    assert.equal(payload.data.redirect_to, "https://mmdbkk.com/sigil/pay?t=signed_token_123");
    assert.equal(payload.data.route_after_liff, "/member/payments");
    assert.equal(payload.data.payment_summary.payment_stage, "membership");
    assert.equal(payload.data.payment_summary.amount_thb, 1999);
    assert.equal(payload.data.payment_summary.renewal_price_rule, "private_premium_spend_20000");
    assert.equal(payload.data.payment_summary.verification_status, "pending");
    assert.deepEqual(payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });

    assert.equal(fx.payment.calls.length, 1);
    assert.equal(fx.payment.calls[0].url, "https://payments.internal/v1/pay/verify");
    assert.equal(fx.payment.calls[0].source, "member-pages-worker");
    assert.deepEqual(fx.payment.calls[0].body, {
      session_id: "liff-session-123",
      payment_stage: "membership",
      amount: 1999,
      package_code: "premium",
      payment_method: "promptpay",
      notes: "source=line_liff;intent=renew;requested_stage=renewal;renewal_price_rule=private_premium_spend_20000;service_spend_365_thb=25000",
    });

    assert.equal(fx.gateway.upserts.length, 1);
    assert.deepEqual(fx.gateway.upserts[0], {
      session: {
        session_id: "liff-session-123",
        payment_intent_session_id: "liff-session-123",
        requested_package: "premium",
        renewal_amount_thb: 1999,
      },
      recordId: "rec_liff_1",
    });

    const stored = JSON.parse(fx.kv.map.get(fx.key));
    assert.equal(stored.payment_intent_session_id, "liff-session-123");
    assert.equal(stored.payment_binding_status, "canonical_pending");
    assert.equal(stored.payment_ref, "pay_1234567890abcdef");
    assert.equal(stored.payment_stage, "membership");
    assert.equal(stored.payment_package_code, "premium");
    assert.equal(stored.payment_amount_thb, 1999);
    assert.equal(stored.customer_payment_url, "https://mmdbkk.com/sigil/pay?t=signed_token_123");
    assert.ok(Date.parse(stored.payment_intent_created_at));
    assert.equal(stored.route_after_liff, "/member/payments");
    assert.equal(stored.renewal_offer.amount_thb, 1999);
  });

  it("fails closed when payments-worker does not return the canonical mmdbkk.com /sigil/pay URL", async () => {
    const fx = await fixture({ upstreamUrl: "https://evil.example/sigil/pay?t=stolen" });
    const response = await completeValidatedLiffPaymentIntent(fx.request, fx.guardedResponse, fx.env);
    const payload = await response.json();

    assert.equal(response.status, 502);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "PAYMENTS_WORKER_CONTRACT_INVALID");
    assert.deepEqual(payload.grants, { membership: false, points: false, payment_status: false, private_access: false });
    assert.equal(fx.gateway.upserts.length, 0);
    const stored = JSON.parse(fx.kv.map.get(fx.key));
    assert.equal(stored.payment_binding_status, "contract_unavailable");
  });

  it("does not bypass any foundation rejection other than the explicit contract-unavailable state", async () => {
    const fx = await fixture();
    const rejected = new Response(JSON.stringify({ ok: false, error: { code: "PAYMENT_INTENT_STALE_PACKAGE" } }), {
      status: 409,
      headers: { "content-type": "application/json" },
    });
    const response = await completeValidatedLiffPaymentIntent(fx.request, rejected, fx.env);
    const payload = await response.json();

    assert.equal(response.status, 409);
    assert.equal(payload.error.code, "PAYMENT_INTENT_STALE_PACKAGE");
    assert.equal(fx.payment.calls.length, 0);
    assert.equal(fx.gateway.upserts.length, 0);
  });
});
