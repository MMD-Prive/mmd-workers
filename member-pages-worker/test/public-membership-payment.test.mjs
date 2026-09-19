import test from "node:test";
import assert from "node:assert/strict";
import {
  handlePublicMembershipPayment,
  isPublicMembershipPaymentPath,
  PUBLIC_MEMBERSHIP_PAYMENT_INTERNALS,
} from "../src/public-membership-payment.js";

class MemoryKv {
  constructor() { this.map = new Map(); }
  async get(key, type) {
    const value = this.map.get(key);
    if (value == null) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.map.set(key, String(value)); }
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function envWithSession(options = {}) {
  const paymentUrl = options.paymentUrl || "https://mmdbkk.com/pay/checkout?t=signed_public";
  const secret = "test-public-membership-session-secret-123456";
  const token = "public-membership-cookie";
  const kv = new MemoryKv();
  const key = "liff:session:" + await hmacHex(secret, "session:" + token);
  kv.map.set(key, JSON.stringify({
    line_user_id: "U1234567890abcdef1234567890abcdef",
    expires_at: Date.now() + 600000,
    member_exists: false,
  }));
  const calls = [];
  const env = {
    LIFF_SESSION_SECRET: secret,
    LIFF_IDENTITY_KV: kv,
    PAYMENTS_WORKER: {
      async fetch(request) {
        const body = await request.json();
        calls.push(body);
        return Response.json({
          ok: true,
          payment_ref: "pay_public_1",
          session_id: body.session_id,
          customer_payment_url: paymentUrl,
          unified_payment_flow: "v1",
          payment_surface: "public",
        });
      },
    },
  };
  return { env, token, calls, kv, key };
}

test("public membership routes are explicit", () => {
  assert.equal(isPublicMembershipPaymentPath("https://mmdbkk.com/member/api/liff/public-membership/catalog"), true);
  assert.equal(isPublicMembershipPaymentPath("https://mmdbkk.com/member/api/liff/public-membership/purchase"), true);
  assert.equal(isPublicMembershipPaymentPath("https://mmdbkk.com/sigil/member/membership"), false);
});

test("public catalog is server-owned and contains Member, Elite and Red Card", async () => {
  const response = await handlePublicMembershipPayment(new Request("https://mmdbkk.com/member/api/liff/public-membership/catalog"), {});
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.packages.map((item) => [item.package_code, item.amount_thb, item.duration_days]), [
    ["mmd_member", 690, 365],
    ["elite", 4990, 730],
    ["red_card", 11499, 365],
  ]);
  assert.equal(payload.payment_surface, "/pay/checkout");
});

test("purchase requires verified LINE session", async () => {
  const response = await handlePublicMembershipPayment(new Request("https://mmdbkk.com/member/api/liff/public-membership/purchase", {
    method: "POST",
    headers: { origin: "https://mmdbkk.com", "content-type": "application/json" },
    body: JSON.stringify({ package_code: "mmd_member" }),
  }), {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "LINE_SESSION_REQUIRED");
});

test("browser cannot submit amount or payment destination authority", async () => {
  const fx = await envWithSession();
  const response = await handlePublicMembershipPayment(new Request("https://mmdbkk.com/member/api/liff/public-membership/purchase", {
    method: "POST",
    headers: {
      origin: "https://mmdbkk.com",
      cookie: "__Host-mmd_liff_session=" + fx.token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ package_code: "mmd_member", amount: 1 }),
  }), fx.env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "BROWSER_PAYMENT_AUTHORITY_REJECTED");
  assert.equal(fx.calls.length, 0);
});

test("purchase derives amount server-side and accepts only signed public checkout", async () => {
  const fx = await envWithSession();
  const response = await handlePublicMembershipPayment(new Request("https://mmdbkk.com/member/api/liff/public-membership/purchase", {
    method: "POST",
    headers: {
      origin: "https://mmdbkk.com",
      cookie: "__Host-mmd_liff_session=" + fx.token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ package_code: "elite" }),
  }), fx.env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.redirect_to, "https://mmdbkk.com/pay/checkout?t=signed_public");
  assert.equal(payload.package.amount_thb, 4990);
  assert.equal(payload.entitlement_granted, false);
  assert.equal(fx.calls[0].amount, 4990);
  assert.equal(fx.calls[0].package_code, "elite");
  assert.equal(fx.calls[0].payment_stage, "membership");

  const stored = JSON.parse(fx.kv.map.get(fx.key));
  assert.equal(stored.payment_ref, "pay_public_1");
  assert.equal(stored.payment_binding_status, "canonical_pending");
  assert.equal(stored.payment_package_code, "elite");
  assert.equal(stored.payment_amount_thb, 4990);
  assert.equal(stored.customer_payment_url, "https://mmdbkk.com/pay/checkout?t=signed_public");
  assert.equal(stored.route_after_liff, "/member/payments");
});

test("SIGIL payment URL fails closed for public membership purchase", async () => {
  const fx = await envWithSession({ paymentUrl: "https://mmdbkk.com/sigil/pay?t=wrong_surface" });
  const response = await handlePublicMembershipPayment(new Request("https://mmdbkk.com/member/api/liff/public-membership/purchase", {
    method: "POST",
    headers: {
      origin: "https://mmdbkk.com",
      cookie: "__Host-mmd_liff_session=" + fx.token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ package_code: "red_card" }),
  }), fx.env);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, "payments_worker_public_surface_contract_invalid");
});

test("public checkout validator rejects alternate hosts and extra query keys", () => {
  const validate = PUBLIC_MEMBERSHIP_PAYMENT_INTERNALS.canonicalPublicPaymentUrl;
  assert.equal(validate("https://mmdbkk.com/pay/checkout?t=x"), "https://mmdbkk.com/pay/checkout?t=x");
  assert.equal(validate("https://www.mmdbkk.com/pay/checkout?t=x"), "");
  assert.equal(validate("https://mmdbkk.com/pay/checkout?t=x&amount=690"), "");
});
