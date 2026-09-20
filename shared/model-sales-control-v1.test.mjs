import assert from "node:assert/strict";
import test from "node:test";

import { resolveModelSalesOffer } from "./model-sales-control-v1.mjs";

const at = "2026-09-21T12:00:00+07:00";

function rule(id, fields = {}) {
  return {
    id,
    fields: {
      model_key: "EMs21-JDye",
      status: "Active",
      sales_visibility: "on",
      price_visibility: "visible",
      customer_sell_rate_thb: 25000,
      priority: 10,
      version: 1,
      ...fields,
    },
  };
}

test("exact Client rule beats audience and model default", () => {
  const result = resolveModelSalesOffer({
    model_key: "EMs21-JDye",
    client_id: "recCLIENT00000001",
    requested_at: at,
    entitlement_snapshot: { capability_state: { active: ["private_premium"] } },
    rules: [
      rule("default", { priority: 99, customer_sell_rate_thb: 30000 }),
      rule("audience", { audience_scope: ["Premium"], customer_sell_rate_thb: 28000 }),
      rule("client", { Client: ["recCLIENT00000001"], customer_sell_rate_thb: 22000, priority: 1 }),
    ],
  });
  assert.equal(result.sellable, true);
  assert.equal(result.matched_rule_id, "client");
  assert.equal(result.customer_rate_thb, 22000);
  assert.equal(result.specificity, "exact_client");
});

test("audience uses canonical entitlement capabilities", () => {
  const premium = resolveModelSalesOffer({
    model_key: "EMs21-JDye",
    requested_at: at,
    entitlement_snapshot: { capability_state: { active: ["private_premium"] } },
    rules: [
      rule("standard", { audience_scope: ["Standard"], customer_sell_rate_thb: 26000 }),
      rule("premium", { audience_scope: ["Premium"], customer_sell_rate_thb: 24000 }),
    ],
  });
  assert.equal(premium.matched_rule_id, "premium");
  assert.equal(premium.customer_rate_thb, 24000);
});

test("scheduled rule activates and expires on exact timestamps", () => {
  const scheduled = rule("scheduled", {
    schedule_type: "Date + time range",
    effective_from_at: "2026-09-21T10:00:00+07:00",
    effective_until_at: "2026-09-21T14:00:00+07:00",
  });
  const before = resolveModelSalesOffer({
    model_key: "EMs21-JDye",
    requested_at: "2026-09-21T09:59:59+07:00",
    rules: [scheduled],
  });
  const inside = resolveModelSalesOffer({
    model_key: "EMs21-JDye",
    requested_at: "2026-09-21T10:00:00+07:00",
    rules: [scheduled],
  });
  const end = resolveModelSalesOffer({
    model_key: "EMs21-JDye",
    requested_at: "2026-09-21T14:00:00+07:00",
    rules: [scheduled],
  });
  assert.equal(before.sellable, false);
  assert.equal(inside.sellable, true);
  assert.equal(end.sellable, false);
});

test("equal specificity priority and version conflicts fail closed", () => {
  const result = resolveModelSalesOffer({
    model_key: "EMs21-JDye",
    requested_at: at,
    rules: [
      rule("a", { customer_sell_rate_thb: 22000 }),
      rule("b", { customer_sell_rate_thb: 23000 }),
    ],
  });
  assert.equal(result.sellable, false);
  assert.equal(result.reason_code, "ambiguous_equal_priority_rules");
  assert.deepEqual(result.conflict_rule_ids.sort(), ["a", "b"]);
});

test("weekly overnight Bangkok window is supported", () => {
  const overnight = rule("overnight", {
    schedule_type: "Weekly recurring",
    days_of_week: ["Mon"],
    start_time_local: "22:00",
    end_time_local: "02:00",
  });
  const late = resolveModelSalesOffer({
    model_key: "EMs21-JDye",
    requested_at: "2026-09-21T23:30:00+07:00",
    rules: [overnight],
  });
  const earlyNextDay = resolveModelSalesOffer({
    model_key: "EMs21-JDye",
    requested_at: "2026-09-22T01:00:00+07:00",
    rules: [overnight],
  });
  assert.equal(late.sellable, true);
  assert.equal(earlyNextDay.sellable, false);
});

test("hidden pricing never leaks customer rate", () => {
  const result = resolveModelSalesOffer({
    model_key: "EMs21-JDye",
    requested_at: at,
    rules: [rule("hidden", { price_visibility: "Per approval only", customer_sell_rate_thb: 25000 })],
  });
  assert.equal(result.sellable, true);
  assert.equal(result.customer_rate_thb, null);
  assert.equal(result.price_visible, false);
  assert.equal(result.reason_code, "matched_rate_hidden");
});

test("legacy Draft rules remain fail closed", () => {
  const result = resolveModelSalesOffer({
    model_key: "EMs21-JDye",
    requested_at: at,
    rules: [rule("draft", { status: "Draft" })],
  });
  assert.equal(result.sellable, false);
  assert.equal(result.reason_code, "no_matching_active_rule");
});
