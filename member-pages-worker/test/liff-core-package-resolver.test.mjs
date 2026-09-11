import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getLiffGatewayStore } from "../src/liff-gateway-airtable.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function env() {
  return {
    AIRTABLE_API_KEY: "test-airtable-key-not-production",
    AIRTABLE_BASE_ID: "appTestBase",
  };
}

function mockPackageRecord(fields) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    return Response.json({ records: [{ fields }] });
  };
  return calls;
}

describe("LIFF core package resolver", () => {
  it("resolves Standard from the canonical packages table using renewal pricing", async () => {
    const calls = mockPackageRecord({
      code: "standard",
      name_th: "Standard",
      name_en: "Standard",
      price: 1199,
      renew_price: 1000,
      duration_days: 365,
      tier: "standard",
      is_active: true,
      require_approval: false,
    });

    const result = await getLiffGatewayStore(env()).resolvePackage("standard");

    assert.deepEqual(result, {
      package_code: "standard",
      pricing_lane: "standard_1199",
      amount_thb: 1000,
      duration_days: 365,
      points_after_verification: 0,
      requires_manual_review: false,
    });
    assert.match(calls[0].url, /tblg2z8dENx75yHka/);
    assert.equal(new URL(calls[0].url).searchParams.get("filterByFormula"), "{code}='standard'");
  });

  it("resolves Premium from the canonical packages table and preserves two-year compatibility duration", async () => {
    const calls = mockPackageRecord({
      code: "premium",
      name_th: "Premium",
      name_en: "Premium",
      price: 2999,
      renew_price: 2500,
      duration_days: 730,
      tier: "premium",
      is_active: true,
      require_approval: false,
    });

    const result = await getLiffGatewayStore(env()).resolvePackage("premium");

    assert.deepEqual(result, {
      package_code: "premium",
      pricing_lane: "premium_2999",
      amount_thb: 2500,
      duration_days: 730,
      points_after_verification: 0,
      requires_manual_review: false,
    });
    assert.match(calls[0].url, /tblg2z8dENx75yHka/);
    assert.equal(new URL(calls[0].url).searchParams.get("filterByFormula"), "{code}='premium'");
  });

  it("fails closed for inactive or schema-mismatched core packages", async () => {
    for (const fields of [
      { code: "standard", price: 1199, renew_price: 1000, duration_days: 365, tier: "standard", is_active: false, require_approval: false },
      { code: "standard", price: 1199, renew_price: 1000, duration_days: 365, tier: "premium", is_active: true, require_approval: false },
      { code: "standard", price: 1199, renew_price: "1000", duration_days: 365, tier: "standard", is_active: true, require_approval: false },
    ]) {
      mockPackageRecord(fields);
      assert.equal(await getLiffGatewayStore(env()).resolvePackage("standard"), null);
    }
  });

  it("keeps Believe/non-gay package rules on their existing table", async () => {
    const calls = mockPackageRecord({
      package_rule_code: "believe_member_2999",
      pricing_lane: "believe_member_2999",
      price_thb: 2999,
      duration_days: 365,
      points_granted: 250,
      requires_manual_review: false,
    });

    const result = await getLiffGatewayStore(env()).resolvePackage("believe_member_2999");

    assert.equal(result.pricing_lane, "believe_member_2999");
    assert.match(calls[0].url, /tble4VuGT9gPsJ2Sh/);
  });
});
