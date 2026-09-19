import assert from "node:assert/strict";
import test from "node:test";

import {
  handleMemberPaymentsBff,
  isMemberPaymentsBffPath,
  MEMBER_PAYMENTS_BFF_INTERNALS,
} from "../src/member-payments-bff.js";

function session(overrides = {}) {
  return {
    lineUserId: "U1234567890abcdef1234567890abcdef",
    memberExists: true,
    memberId: "MMD-TEST-01",
    memberProfile: {
      display_name: "คุณเปอร์",
      tier: "Premium",
      membership_status: "active",
    },
    paymentSnapshot: null,
    ...overrides,
  };
}

function delegate(profile = {}, status = 200) {
  const calls = [];
  return {
    calls,
    async fetch(request) {
      calls.push({ url: request.url, method: request.method, cookie: request.headers.get("cookie") });
      return Response.json(status < 400 ? { ok: true, data: profile } : { ok: false }, {
        status,
        headers: { "set-cookie": "__Host-mmd_liff_session=rotated; Secure; HttpOnly; Path=/; SameSite=Strict" },
      });
    },
  };
}

test("member payments BFF route is exact", () => {
  assert.equal(isMemberPaymentsBffPath("https://mmdbkk.com/v1/member/payments"), true);
  assert.equal(isMemberPaymentsBffPath("https://mmdbkk.com/v1/member/payments/"), true);
  assert.equal(isMemberPaymentsBffPath("https://mmdbkk.com/v1/member/payments/admin"), false);
});

test("member payments BFF requires a verified LIFF session", async () => {
  const response = await handleMemberPaymentsBff(
    new Request("https://mmdbkk.com/v1/member/payments"),
    {},
    delegate(),
    async () => null,
  );
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.error.code, "MEMBER_SESSION_REQUIRED");
  assert.equal(payload.auth_required, true);
});

test("member payments BFF combines fresh verified history with current backend-issued payment intent", async () => {
  const upstream = delegate({
    display_name: "คุณเปอร์",
    tier: "Premium",
    membership_status: "active",
    payment_status: "pending_review",
    payment_history: [
      { date: "2026-09-01", title: "Premium Membership", amount: 2999, status: "verified" },
    ],
  });
  const current = session({
    paymentSnapshot: {
      paymentRef: "pay_public_1",
      sessionId: "publicmem_elite_1",
      paymentStage: "membership",
      packageCode: "elite",
      amountThb: 4990,
      bindingStatus: "canonical_pending",
      customerPaymentUrl: "https://mmdbkk.com/pay/checkout?t=signed_public",
      createdAt: "2026-09-19T09:00:00.000Z",
    },
  });

  const response = await handleMemberPaymentsBff(
    new Request("https://mmdbkk.com/v1/member/payments", {
      headers: { cookie: "__Host-mmd_liff_session=current", origin: "https://mmdbkk.com" },
    }),
    {},
    upstream,
    async () => current,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-member-payments-bff"), "v1");
  assert.equal(response.headers.get("x-mmd-payment-authority"), "payments-worker");
  assert.match(response.headers.get("set-cookie") || "", /rotated/);
  assert.equal(payload.authority, "member-pages-worker");
  assert.equal(payload.money_authority, "payments-worker");
  assert.deepEqual(payload.member, {
    display_name: "คุณเปอร์",
    tier_label: "Premium",
    account_status: "active",
  });
  assert.equal(payload.records.length, 2);
  assert.equal(payload.records[0].payment_ref, "pay_public_1");
  assert.equal(payload.records[0].official_status, "pending_review");
  assert.equal("customer_payment_url" in payload.records[0], false);
  assert.equal(payload.records[1].verification_status, "verified");
  assert.equal(payload.records[1].amount_thb, 2999);
  assert.equal(upstream.calls[0].url, "https://mmdbkk.com/member/api/liff/profile");
});

test("awaiting payment exposes only the exact canonical signed handoff from the server session", async () => {
  for (const [url, visible] of [
    ["https://mmdbkk.com/pay/checkout?t=signed_public", true],
    ["https://mmdbkk.com/sigil/pay?t=signed_private", true],
    ["https://mmdbkk.com/pay/checkout?t=signed_public&amount=1", false],
    ["https://evil.example/pay/checkout?t=signed_public", false],
  ]) {
    const record = MEMBER_PAYMENTS_BFF_INTERNALS.currentRecord({
      paymentRef: "pay_1",
      paymentStage: "membership",
      packageCode: "mmd_member",
      amountThb: 690,
      bindingStatus: "canonical_pending",
      customerPaymentUrl: url,
      createdAt: "2026-09-19T09:00:00Z",
    }, "unavailable");

    assert.equal(record.official_status, "awaiting_payment");
    assert.equal(Boolean(record.customer_payment_url), visible);
  }
});

test("guest with a canonical pending Public Membership intent can read only that session-bound payment", async () => {
  let calls = 0;
  const current = session({
    memberExists: false,
    memberId: null,
    memberProfile: {},
    paymentSnapshot: {
      paymentRef: "pay_signup_1",
      sessionId: "publicmem_mmd_member_1",
      paymentStage: "membership",
      packageCode: "mmd_member",
      amountThb: 690,
      bindingStatus: "canonical_pending",
      customerPaymentUrl: "https://mmdbkk.com/pay/checkout?t=signed_signup",
      createdAt: "2026-09-19T09:00:00Z",
    },
  });
  const response = await handleMemberPaymentsBff(
    new Request("https://mmdbkk.com/v1/member/payments"),
    {},
    { async fetch() { calls += 1; return Response.json({}); } },
    async () => current,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls, 0);
  assert.equal(payload.records.length, 1);
  assert.equal(payload.records[0].amount_thb, 690);
  assert.equal(payload.records[0].customer_payment_url, "https://mmdbkk.com/pay/checkout?t=signed_signup");
});

test("member payments BFF rejects browser-selected payment context and remains read-only", async () => {
  const query = await handleMemberPaymentsBff(
    new Request("https://mmdbkk.com/v1/member/payments?member_id=other"),
    {},
    delegate(),
    async () => session(),
  );
  assert.equal(query.status, 400);
  assert.equal((await query.json()).error.code, "BROWSER_PAYMENT_CONTEXT_REJECTED");

  const post = await handleMemberPaymentsBff(
    new Request("https://mmdbkk.com/v1/member/payments", { method: "POST" }),
    {},
    delegate(),
    async () => session(),
  );
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
});

test("HEAD returns the same safe authority headers without a body", async () => {
  const response = await handleMemberPaymentsBff(
    new Request("https://mmdbkk.com/v1/member/payments", { method: "HEAD" }),
    {},
    delegate(),
    async () => session({ memberExists: false }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-payment-authority"), "payments-worker");
  assert.equal(await response.text(), "");
});
