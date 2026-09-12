import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeJobCreateBody } from "./src/job-create-contract.js";

test("direct jobs preserve the MMD-to-model payout", () => {
  const body = normalizeJobCreateBody({
    model_payout_thb: 7000,
    job_details: {},
  });
  assert.equal(body.pay_model_thb, 7000);
  assert.equal(body.model_payout_thb, 7000);
});

test("partner-managed jobs discard every model payout alias", () => {
  const body = normalizeJobCreateBody({
    pay_model_thb: 1000,
    model_payout_thb: 2000,
    model_payout: { amount_thb: 3000 },
    expected_payout_thb: 4000,
    payment: {
      pay_model_thb: 5000,
      model_payout_thb: 6000,
    },
    job_details: {
      partner_relationship: {
        settlement_method: "partner_managed",
        settlement_owner: "modeling_partner",
        partner_quoted_rate_thb: 8000,
        model_payout_thb: 7000,
      },
    },
    partner_attribution: { partner_name: "Kendo" },
  });

  assert.equal(body.pay_model_thb, undefined);
  assert.equal(Object.hasOwn(body, "model_payout_thb"), false);
  assert.equal(Object.hasOwn(body, "model_payout"), false);
  assert.equal(Object.hasOwn(body, "expected_payout_thb"), false);
  assert.equal(Object.hasOwn(body.payment, "pay_model_thb"), false);
  assert.equal(Object.hasOwn(body.payment, "model_payout_thb"), false);
  assert.equal(body.job_details.partner_relationship.model_payout_thb, null);
  assert.equal(body.job_details.partner_relationship.partner_quoted_rate_thb, 8000);
});
