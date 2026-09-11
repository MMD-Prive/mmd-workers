import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getLiffGatewayStore } from "../src/liff-gateway-airtable.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function env(overrides = {}) {
  return {
    AIRTABLE_API_KEY: "test-airtable-key-not-production",
    AIRTABLE_BASE_ID: "appTestBase",
    ...overrides,
  };
}

function mockAirtable(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const request = {
      url: String(url),
      method: init.method || "GET",
      body: init.body ? JSON.parse(init.body) : null,
    };
    calls.push(request);
    return handler(request, calls.length - 1);
  };
  return calls;
}

describe("LIFF core member package resolver", () => {
  it("resolves Standard and Premium from the canonical core packages table", async () => {
    const recordsByCode = {
      standard: {
        code: "standard",
        name_th: "Standard",
        name_en: "Standard",
        price: 1199,
        renew_price: 1000,
        duration_days: 365,
        tier: "standard",
        is_active: true,
      },
      premium: {
        code: "premium",
        name_th: "Premium",
        name_en: "Premium",
        price: 2999,
        renew_price: 2500,
        duration_days: 730,
        tier: "premium",
        is_active: true,
      },
    };
    const calls = mockAirtable(async (request) => {
      const formula = new URL(request.url).searchParams.get("filterByFormula") || "";
      const code = formula.includes("premium") ? "premium" : "standard";
      return Response.json({ records: [{ fields: recordsByCode[code] }] });
    });

    const store = getLiffGatewayStore(env());
    assert.deepEqual(await store.resolvePackage("standard"), {
      package_code: "standard",
      pricing_lane: "standard_1199",
      amount_thb: 1199,
      duration_days: 365,
      points_after_verification: 0,
      requires_manual_review: false,
    });
    assert.deepEqual(await store.resolvePackage("premium"), {
      package_code: "premium",
      pricing_lane: "premium_2999",
      amount_thb: 2999,
      duration_days: 730,
      points_after_verification: 0,
      requires_manual_review: false,
    });

    assert.equal(calls.length, 2);
    for (const [index, code] of ["standard", "premium"].entries()) {
      assert.match(calls[index].url, /tblg2z8dENx75yHka/);
      assert.equal(new URL(calls[index].url).searchParams.get("filterByFormula"), `{code}='${code}'`);
      assert.equal(new URL(calls[index].url).searchParams.get("maxRecords"), "2");
    }
  });

  it("fails closed when a core member package is inactive, mismatched, malformed, or duplicated", async () => {
    const invalidCases = [
      [{ fields: { code: "standard", price: 1199, duration_days: 365, tier: "standard", is_active: false } }],
      [{ fields: { code: "standard", price: 1199, duration_days: 365, tier: "premium", is_active: true } }],
      [{ fields: { code: "standard", price: "1199", duration_days: 365, tier: "standard", is_active: true } }],
      [{ fields: { code: "standard", price: 1199, duration_days: 365.5, tier: "standard", is_active: true } }],
      [
        { fields: { code: "standard", price: 1199, duration_days: 365, tier: "standard", is_active: true } },
        { fields: { code: "standard", price: 1199, duration_days: 365, tier: "standard", is_active: true } },
      ],
    ];

    for (const records of invalidCases) {
      mockAirtable(async () => Response.json({ records }));
      assert.equal(await getLiffGatewayStore(env()).resolvePackage("standard"), null);
    }
  });

  it("keeps Believe and other audience-context package rules on the non-gay package table", async () => {
    const calls = mockAirtable(async () => Response.json({ records: [{ fields: {
      package_rule_code: "believe_member_2999",
      pricing_lane: "believe_member_2999",
      price_thb: 2999,
      duration_days: 365,
      points_granted: 250,
      requires_manual_review: false,
    } }] }));

    const rule = await getLiffGatewayStore(env()).resolvePackage("believe_member_2999");
    assert.equal(rule?.pricing_lane, "believe_member_2999");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /tble4VuGT9gPsJ2Sh/);
    assert.doesNotMatch(calls[0].url, /tblg2z8dENx75yHka/);
  });
});
