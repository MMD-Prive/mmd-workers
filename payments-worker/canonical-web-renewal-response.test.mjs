import test from "node:test";
import assert from "node:assert/strict";

import { preserveCanonicalWebRenewalPaymentSuccess } from "./canonical-web-renewal-response.js";

function response(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("entitlement authority label cannot promote unverified money to paid", async () => {
  const input = response({
    ok: true,
    evidence_submitted: true,
    payment_status: "pending",
    verification_status: "pending_verification",
    entitlement_materialized: false,
    manual_membership_review_required: true,
    renewal_settlement: {
      status: "review_required",
      authority: "my_mmd_entitlement_resolver_v1",
      reason: "canonical_member_not_found",
      entitlement_materialized: false,
      manual_membership_review_required: true,
    },
  });
  const output = await preserveCanonicalWebRenewalPaymentSuccess(input);
  const body = await output.json();
  assert.equal(body.payment_status, "pending");
  assert.equal(body.verification_status, "pending_verification");
  assert.equal(body.evidence_submitted, true);
  assert.equal(body.entitlement_materialized, false);
  assert.equal(body.manual_membership_review_required, true);
  assert.equal(body.owner_policy, undefined);
});

test("pre-money-truth review remains pending", async () => {
  const input = response({
    ok: true,
    payment_status: "pending",
    verification_status: "pending_verification",
    renewal_settlement: {
      status: "review_required",
      authority: "payments-worker",
      reason: "renewal_payment_context_not_safe",
    },
  });
  const output = await preserveCanonicalWebRenewalPaymentSuccess(input);
  const body = await output.json();
  assert.equal(body.payment_status, "pending");
  assert.equal(body.verification_status, "pending_verification");
  assert.equal(body.owner_policy, undefined);
});

test("canonical paid outcome survives the response adapter unchanged", async()=>{const input=response({ok:true,payment_status:"paid",verification_status:"verified"});assert.equal(await preserveCanonicalWebRenewalPaymentSuccess(input),input)});
