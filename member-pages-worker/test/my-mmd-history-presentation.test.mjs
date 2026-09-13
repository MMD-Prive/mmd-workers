import assert from "node:assert/strict";
import test from "node:test";
import { applyMyMmdCanonicalEntitlementResponse } from "../src/my-mmd-canonical-entitlement-bridge.js";

function historyContext() {
  return {
    profileRefreshed: true,
    capability: null,
    source: "member_profile_resolver",
    clientHistory: {
      state: "resolved",
      summary: {
        verifiedServiceCount: 2,
        verifiedServiceSpendThb: 27500,
        lastServiceDate: "2026-09-11",
      },
      items: [
        {
          id: "client-service-old",
          kind: "booking",
          occurredAt: "2024-02-09",
          title: "PN + MK",
          statusLabel: "Completed",
          model: "Tar T",
          serviceCodes: ["PN", "MK"],
          chargeComponents: [{ code: "TR", type: "travel_fee" }],
          location: "GO Hotel Bangkok Suvarnabhumi Airport",
          startTime: "17:00",
          endTime: "18:30",
          durationMinutes: 90,
          totalAmountThb: 17500,
          depositAmountThb: 5300,
          balanceAmountThb: 12200,
        },
        {
          id: "client-service-new",
          kind: "booking",
          occurredAt: "2026-09-11",
          title: "PN",
          statusLabel: "Completed",
          model: "Babe B",
          serviceCodes: ["PN"],
          chargeComponents: [],
          totalAmountThb: 10000,
          depositAmountThb: 3000,
          balanceAmountThb: 7000,
        },
      ],
    },
  };
}

test("history response merges lifetime client-backed history even when upstream already has history", async () => {
  const request = new Request("https://mmdbkk.com/api/member/app/history");
  const upstream = Response.json([{ id: "history-current", kind: "booking", occurredAt: "2026-09-11", title: "Current dashboard item" }]);
  const response = await applyMyMmdCanonicalEntitlementResponse(request, upstream, historyContext());
  const payload = await response.json();
  assert.equal(Array.isArray(payload), true);
  assert.equal(payload.length, 3);
  assert.equal(payload[0].occurredAt, "2026-09-11");
  assert.ok(payload.some((item) => item.id === "client-service-old"));
});

test("profile exposes verified service count, lifetime spend and rich safe service summary", async () => {
  const request = new Request("https://mmdbkk.com/api/member/app/profile");
  const upstream = Response.json({
    match_state: "matched",
    verified_service_count: null,
    service_history_summary: { items: [] },
  });
  const response = await applyMyMmdCanonicalEntitlementResponse(request, upstream, historyContext());
  const payload = await response.json();
  assert.equal(payload.verified_service_count, 2);
  assert.equal(payload.service_history_summary.verified_service_spend_thb, 27500);
  assert.equal(payload.service_history_summary.last_service_date, "2026-09-11");
  assert.equal(payload.service_history_summary.items.length, 2);
  assert.equal(payload.service_history_summary.items[0].model, "Tar T");
  assert.deepEqual(payload.service_history_summary.items[0].service_codes, ["PN", "MK"]);
  assert.deepEqual(payload.service_history_summary.items[0].charge_components, [{ code: "TR", type: "travel_fee" }]);
  assert.equal(payload.service_history_summary.items[0].total_amount_thb, 17500);
});
