import test from "node:test";
import assert from "node:assert/strict";
import { handleUnifiedPaymentIntent, stablePaymentRef } from "./unified-payment-proof.js";
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

test("payment intent exposes one signed SIGIL pay handoff", async () => {
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
