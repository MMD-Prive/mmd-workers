import test from "node:test";
import assert from "node:assert/strict";
import { canonicalProofLinks, canonicalProofRecordFields, enrichUnifiedConfirmVerify, handleUnifiedPaymentIntent, paymentProofTelegramRoute, stablePaymentRef } from "./unified-payment-proof.js";
import { membershipTermForPackage } from "./reviewed-proof.js";
import { reconcilePremiumReviewedMembershipTerm } from "./premium-membership-term.js";

test("payment ref is stable for the same session and stage", async () => {
  const a = await stablePaymentRef("session-a", "membership");
  const b = await stablePaymentRef("session-a", "membership");
  const c = await stablePaymentRef("session-a", "deposit");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^pay_[a-f0-9]{24}$/);
});

test("web payment proof links canonical Payment, Session, and Client records", () => {
  const links = canonicalProofLinks(
    { id: "recPayment", fields: { Client: ["recClient"] } },
    { id: "recSession", fields: { Client: ["recClient"] } },
  );
  assert.deepEqual(links, {
    payment: ["recPayment"],
    session: ["recSession"],
    client: ["recClient"],
  });
});

test("web proof record uses only fields present in MMD — Payment Proofs", () => {
  const fields = canonicalProofRecordFields({
    proofId: "webproof_test",
    note: "schema=mmd_web_payment_proof_v1",
    snapshot: { payer_name: "Customer", amount_thb: 7500, session_id: "sess_test", payment_stage: "deposit", member_email: "hidden@example.com" },
    paymentRef: "pay_test",
    links: { payment: ["recPayment"], session: ["recSession"], client: ["recClient"] },
  });
  assert.deepEqual(Object.keys(fields).sort(), [
    "Client",
    "amount_thb",
    "channel",
    "note",
    "payer_name",
    "payment",
    "payment_ref",
    "proof_id",
    "session",
    "status",
  ].sort());
  assert.equal("session_id" in fields, false);
  assert.equal("member_email" in fields, false);
  assert.equal("payment_stage" in fields, false);
});

test("service proof V22 source routes to canonical Payments Confirm topic 22", () => {
  const route = paymentProofTelegramRoute({ TG_THREAD_PAYMENTS_CONFIRM: "22" }, {
    amount_thb: 7500,
    package_code: "",
    payment_stage: "deposit",
    payment_stage_explicit: true,
  }, "sigil_pay_v22");
  assert.equal(route.topic, "payment");
  assert.equal(route.thread_id, 22);
});

test("web membership proof routes to Membership topic 20", () => {
  const route = paymentProofTelegramRoute({}, {
    amount_thb: 2500,
    package_code: "premium",
    payment_stage: "membership",
    payment_stage_explicit: true,
  }, "pay_membership");
  assert.equal(route.topic, "membership");
  assert.equal(route.thread_id, 20);
  assert.equal(route.alerts_thread_id, 9);
  assert.equal(route.should_alert, false);
});

test("membership source can classify a proof even when legacy stage default was not explicit", () => {
  const route = paymentProofTelegramRoute({}, {
    amount_thb: 690,
    package_code: "mmd_member",
    payment_stage: "deposit",
    payment_stage_explicit: false,
  }, "member_payments");
  assert.equal(route.topic, "membership");
  assert.equal(route.thread_id, 20);
});

test("service deposit stays in Payments Confirm even when amount equals a membership renewal price", () => {
  const route = paymentProofTelegramRoute({}, {
    amount_thb: 2500,
    package_code: "",
    payment_stage: "deposit",
    payment_stage_explicit: true,
  }, "sigil_pay");
  assert.equal(route.topic, "payment");
  assert.equal(route.thread_id, 22);
  assert.equal(route.classification, "service_payment");
});

test("web membership amount/package conflict stays in Confirm and flags Alerts", () => {
  const route = paymentProofTelegramRoute({}, {
    amount_thb: 2999,
    package_code: "standard",
    payment_stage: "membership",
    payment_stage_explicit: true,
  }, "pay_membership");
  assert.equal(route.topic, "payment");
  assert.equal(route.thread_id, 22);
  assert.equal(route.alerts_thread_id, 9);
  assert.equal(route.should_alert, true);
  assert.equal(route.reason, "membership_amount_package_mismatch");
});

test("confirmation verification converts known invalid-token throws into a bounded 401", async () => {
  const request = new Request("https://sigil.mmdbkk.com/v1/confirm/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ t: "invalid.invalid", expected_role: "customer" }),
  });
  const response = await enrichUnifiedConfirmVerify(request, {}, async () => {
    throw new Error("invalid_confirmation_token_signature");
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "invalid_confirmation_token_signature" });
});

test("confirmation verification does not hide unexpected runtime failures", async () => {
  const request = new Request("https://sigil.mmdbkk.com/v1/confirm/verify", { method: "POST" });
  await assert.rejects(() => enrichUnifiedConfirmVerify(request, {}, async () => {
    throw new Error("unexpected_binding_failure");
  }), /unexpected_binding_failure/);
});

test("private membership payment intent stays on signed SIGIL pay", async () => {
  const kvWrites = [];
  const env = {
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "unit-test-key",
    PAY_TOKEN_TTL_SECONDS: "3600",
    PAY_SESSIONS_KV: { async put(key, value, options) { kvWrites.push({ key, value, options }); } },
  };
  let forwarded;
  const request = new Request("https://sigil.mmdbkk.com/v1/pay/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "renewal-a", payment_stage: "membership", amount: 2999, package_code: "premium" }),
  });
  const response = await handleUnifiedPaymentIntent(request, env, async (nextRequest) => {
    forwarded = await nextRequest.json();
    return new Response(JSON.stringify({ ok: true, ...forwarded, status: "pending" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const data = await response.json();
  assert.equal(data.payment_ref, forwarded.payment_ref);
  assert.match(data.customer_payment_url, /^https:\/\/mmdbkk\.com\/sigil\/pay\?t=/);
  assert.equal(data.unified_payment_flow, "v1");
  assert.equal(kvWrites.length, 1);
});

test("public membership payment intent uses signed public checkout", async () => {
  const env = {
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "unit-test-key",
    PAY_TOKEN_TTL_SECONDS: "3600",
    PAY_SESSIONS_KV: { async put() {} },
  };
  const request = new Request("https://sigil.mmdbkk.com/v1/pay/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "public-member-a", payment_stage: "membership", amount: 690, package_code: "mmd_member" }),
  });
  const response = await handleUnifiedPaymentIntent(request, env, async (nextRequest) => {
    const body = await nextRequest.json();
    return Response.json({ ok: true, ...body, status: "pending" });
  });
  const data = await response.json();
  assert.match(data.customer_payment_url, /^https:\/\/mmdbkk\.com\/pay\/checkout\?t=/);
  assert.equal(data.payment_surface, "public");
});

test("TMIB story intent uses the same signed public checkout", async () => {
  const env = {
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "unit-test-key",
    PAY_TOKEN_TTL_SECONDS: "3600",
    PAY_SESSIONS_KV: { async put() {} },
  };
  const request = new Request("https://sigil.mmdbkk.com/v1/pay/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "tmib-a", payment_stage: "tmib_story", amount: 299, package_code: "tmib_act_001" }),
  });
  const response = await handleUnifiedPaymentIntent(request, env, async (nextRequest) => {
    const body = await nextRequest.json();
    return Response.json({ ok: true, ...body, status: "pending" });
  });
  const data = await response.json();
  assert.match(data.customer_payment_url, /^https:\/\/mmdbkk\.com\/pay\/checkout\?t=/);
  assert.equal(data.payment_surface, "public");
});

test("reviewed membership materialization uses canonical calendar-year terms", () => {
  const standard = membershipTermForPackage("standard", "2026-09-11T00:00:00.000Z");
  const premium = membershipTermForPackage("premium", "2026-09-11T00:00:00.000Z");
  assert.equal(standard.expire_at.toISOString(), "2027-09-11T00:00:00.000Z");
  assert.equal(standard.membership_term, "1_year");
  assert.equal(standard.membership_expiry_rule, "1_year_from_verified_payment");
  assert.equal(premium.expire_at.toISOString(), "2028-09-11T00:00:00.000Z");
  assert.equal(premium.membership_term, "2_years");
  assert.equal(premium.membership_expiry_rule, "2_years_from_verified_payment");
});

test("calendar-year membership term clamps leap-day expiry", () => {
  const standard = membershipTermForPackage("standard", "2024-02-29T12:34:56.000Z");
  const premium = membershipTermForPackage("premium", "2024-02-29T12:34:56.000Z");
  assert.equal(standard.expire_at.toISOString(), "2025-02-28T12:34:56.000Z");
  assert.equal(premium.expire_at.toISOString(), "2026-02-28T12:34:56.000Z");
});

test("Premium reviewed renewal extends legacy one-year result to two years", async () => {
  const writes = [];
  const env = {
    AIRTABLE_BASE_ID: "appUnitTest",
    AIRTABLE_API_KEY: "unit-test-key",
    AIRTABLE_HTTP: {
      async fetch(request) {
        writes.push(await request.json());
        return new Response(JSON.stringify({ id: "rec123456789012" }), { status: 200 });
      },
    },
  };
  const request = new Request("https://sigil.mmdbkk.com/v1/internal/payments/reviewed-proof", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ package_code: "premium" }),
  });
  const response = new Response(JSON.stringify({
    ok: true,
    entitlement_materialized: true,
    entitlement_record_id: "rec123456789012",
    membership_expire_at: "2027-09-11T00:00:00.000Z",
  }), { status: 200, headers: { "content-type": "application/json" } });
  const result = await reconcilePremiumReviewedMembershipTerm(request, response, env);
  const data = await result.json();
  assert.equal(data.membership_expire_at, "2028-09-11T00:00:00.000Z");
  assert.equal(data.membership_term, "2_years");
  assert.equal(writes[0].fields.membership_expiry_rule, "2_years_from_verified_payment");
});

test("Premium reconciler never adds a third year to an already canonical result", async () => {
  const writes = [];
  const env = {
    AIRTABLE_BASE_ID: "appUnitTest",
    AIRTABLE_API_KEY: "unit-test-key",
    AIRTABLE_HTTP: { async fetch(request) { writes.push(await request.json()); return Response.json({ id: "rec123456789012" }); } },
  };
  const request = new Request("https://sigil.mmdbkk.com/v1/internal/payments/reviewed-proof", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ package_code: "premium" }),
  });
  const response = new Response(JSON.stringify({
    ok: true,
    entitlement_materialized: true,
    entitlement_record_id: "rec123456789012",
    membership_expire_at: "2028-09-11T00:00:00.000Z",
    membership_term: "2_years",
    membership_expiry_rule: "2_years_from_verified_payment",
  }), { status: 200, headers: { "content-type": "application/json" } });
  const result = await reconcilePremiumReviewedMembershipTerm(request, response, env);
  const data = await result.json();
  assert.equal(data.membership_expire_at, "2028-09-11T00:00:00.000Z");
  assert.equal(data.membership_term, "2_years");
  assert.equal(writes.length, 0);
});
