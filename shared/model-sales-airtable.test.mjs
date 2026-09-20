import assert from "node:assert/strict";
import test from "node:test";

import { loadModelSalesRules, resolveModelSalesOfferFromAirtable } from "./model-sales-airtable.mjs";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ENV = {
  AIRTABLE_API_KEY: "test-key",
  AIRTABLE_BASE_ID: "appTestBase",
  AIRTABLE_TABLE_MODEL_OFFER_RULES_ID: "tblOfferRules",
};

test("loads canonical Model Offer Rules with pagination", async () => {
  const calls = [];
  const rows = await loadModelSalesRules(ENV, async (url) => {
    calls.push(url);
    return calls.length === 1
      ? response({ records: [{ id: "recA", fields: {} }], offset: "next" })
      : response({ records: [{ id: "recB", fields: {} }] });
  });
  assert.equal(rows.length, 2);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /tblOfferRules/);
});

test("reports configured rules while preserving fail-closed Draft behavior", async () => {
  const result = await resolveModelSalesOfferFromAirtable(ENV, {
    model_key: "ems21-jdye",
    requested_at: "2026-09-21T19:00:00+07:00",
  }, {
    fetchImpl: async () => response({
      records: [{
        id: "recDraft",
        fields: {
          model_key: "ems21-jdye",
          status: "Draft",
          sales_visibility: "on",
          customer_sell_rate_thb: 25000,
          price_visibility: "Eligible scope only",
          version: 1,
        },
      }],
    }),
  });
  assert.equal(result.configured_rule_count, 1);
  assert.equal(result.configured_active_rule_count, 0);
  assert.equal(result.sellable, false);
  assert.equal(result.reason_code, "no_matching_active_rule");
});

test("returns customer-safe active offer and never projects partner source rate", async () => {
  const result = await resolveModelSalesOfferFromAirtable(ENV, {
    model_key: "ems21-jdye",
    requested_at: "2026-09-21T19:00:00+07:00",
    entitlement_snapshot: { capability_state: { active: ["private_premium"] } },
  }, {
    fetchImpl: async () => response({
      records: [{
        id: "recActive",
        fields: {
          model_key: "ems21-jdye",
          status: "Active",
          sales_visibility: "on",
          audience_scope: ["Premium"],
          customer_sell_rate_thb: 25000,
          partner_source_rate_thb: 18000,
          price_visibility: "Eligible scope only",
          version: 3,
        },
      }],
    }),
  });
  assert.equal(result.sellable, true);
  assert.equal(result.customer_rate_thb, 25000);
  assert.equal(Object.hasOwn(result, "partner_source_rate_thb"), false);
});
