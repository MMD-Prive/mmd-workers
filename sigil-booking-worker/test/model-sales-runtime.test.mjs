import assert from "node:assert/strict";
import test from "node:test";

import { applyModelSalesPolicyToSearchResponse } from "../src/runtime-index.js";

const ENV = {
  AIRTABLE_API_KEY: "test",
  AIRTABLE_BASE_ID: "appTest",
  AIRTABLE_TABLE_MODEL_OFFER_RULES_ID: "tblOffers",
};

function sourceResponse() {
  return new Response(JSON.stringify({
    ok: true,
    matched: true,
    model: { model_id: "recMODEL000000001", model_key: "ems21-jdye", working_name: "J Dye" },
    items: [{ model_id: "recMODEL000000001", model_key: "ems21-jdye", working_name: "J Dye" }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("Booking applies customer-safe Model Sales offer and hides source rate", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    records: [{
      id: "recOffer123456789",
      fields: {
        Model: ["recMODEL000000001"],
        model_key: "ems21-jdye",
        status: "Active",
        sales_visibility: "on",
        audience_scope: ["Premium"],
        customer_sell_rate_thb: 25000,
        partner_source_rate_thb: 18000,
        price_visibility: "Eligible scope only",
        schedule_type: "Always",
        priority: 100,
        version: 2,
      },
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });

  const request = new Request("https://sigil.mmdbkk.com/sigil/api/models/search?q=J%20Dye&requested_at=2026-09-21T19%3A00%3A00%2B07%3A00");
  const response = await applyModelSalesPolicyToSearchResponse(
    sourceResponse(),
    ENV,
    request,
    new URL(request.url),
    { entitlement_snapshot: { capability_state: { active: ["private_premium"] } }, client_id: "" },
    { fetchImpl }
  );
  const body = await response.json();
  assert.equal(body.matched, true);
  assert.equal(body.items[0].sales_offer.customer_rate_thb, 25000);
  assert.equal(body.items[0].sales_offer.price_visible, true);
  assert.equal(JSON.stringify(body).includes("18000"), false);
  assert.equal(JSON.stringify(body).includes("partner_source"), false);
});

test("Booking blocks a configured model when only Draft rules exist", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    records: [{
      id: "recOfferDraft12345",
      fields: {
        Model: ["recMODEL000000001"],
        model_key: "ems21-jdye",
        status: "Draft",
        sales_visibility: "on",
        customer_sell_rate_thb: 25000,
        price_visibility: "Eligible scope only",
        version: 1,
      },
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });

  const request = new Request("https://sigil.mmdbkk.com/sigil/api/models/search?q=J%20Dye");
  const response = await applyModelSalesPolicyToSearchResponse(
    sourceResponse(),
    ENV,
    request,
    new URL(request.url),
    { entitlement_snapshot: { capability_state: { active: ["private_premium"] } }, client_id: "" },
    { fetchImpl }
  );
  const body = await response.json();
  assert.equal(body.matched, false);
  assert.equal(body.blocked, true);
  assert.equal(body.reason, "model_sales_control_no_eligible_rule");
  assert.deepEqual(body.items, []);
});
