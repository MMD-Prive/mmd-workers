import assert from "node:assert/strict";
import test from "node:test";
import { buildKenjiRecommendations, KENJI_RECOMMENDATION_POLICY_VERSION } from "./kenji-recommendation-layer-v1.mjs";
import { NOW, candidate, gate, input } from "./kenji-recommendation-test-fixtures.mjs";

test("requires a fresh exact Model Access permission gate", () => {
  for (const permission_gate of [undefined, gate({ applied: false }), gate({ policy_version: "legacy" }), gate({ evaluated_at: "2026-09-21T14:00:00.000Z" })]) {
    const result = buildKenjiRecommendations(input([candidate()], { permission_gate }), { now: NOW });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "permission_gate_required");
  }
});

test("requires access approval, canonical sellable offer, and fresh sanitized availability", () => {
  const result = buildKenjiRecommendations(input([
    candidate(),
    candidate({ model_key: "DENY1", safe_display_name: "Hidden", access_allowed: false }),
    candidate({ model_key: "OFF1", safe_display_name: "Off", sales: { ...candidate().sales, sellable: false } }),
    candidate({ model_key: "LEGACY1", safe_display_name: "Legacy", sales: { ...candidate().sales, policy_version: "legacy" } }),
  ]), { now: NOW });
  assert.equal(result.policy_version, KENJI_RECOMMENDATION_POLICY_VERSION);
  assert.deepEqual(result.recommendations.map((item) => item.model_key), ["MX17"]);
  assert.equal(result.guardrails.booking_confirmed, false);
  assert.equal(result.guardrails.auto_send_allowed, false);
});

test("stale, missing, or untrusted availability remains review-only", () => {
  const result = buildKenjiRecommendations(input([
    candidate({ model_key: "STALE1", safe_display_name: "Stale", availability: { ...candidate().availability, safe_availability_state: "available_now", updated_at: "2026-09-21T15:20:00.000Z", expires_at: "2026-09-21T15:25:00.000Z" } }),
    candidate({ model_key: "MISS1", safe_display_name: "Missing", availability: null }),
    candidate({ model_key: "UNTRUST1", safe_display_name: "Untrusted", availability: { ...candidate().availability, schema: "raw_model_console" } }),
  ]), { now: NOW });
  assert.equal(result.recommendation_count, 0);
  assert.equal(result.review_candidates.length, 3);
  assert(result.review_candidates.every((item) => item.safe_next_action === "verify_live_availability_before_offer"));
});

test("lane, city, zone, and operational filters fail closed", () => {
  const result = buildKenjiRecommendations(input([
    candidate({ model_key: "STRAIGHT1", safe_display_name: "Straight", model_lane: "straight" }),
    candidate({ model_key: "CITY1", safe_display_name: "Other City", availability: { ...candidate().availability, city: "Chiang Mai" } }),
    candidate({ model_key: "ZONE1", safe_display_name: "Other Zone", availability: { ...candidate().availability, zones: ["ratchada"] } }),
    candidate({ model_key: "BURN1", safe_display_name: "Burn", availability: { ...candidate().availability, operational_flags: { burn: true, mk: false, live: true } } }),
  ]), { now: NOW });
  assert.equal(result.recommendation_count, 0);
  assert.equal(result.review_candidates.length, 0);
});

test("budget uses customer-visible price only", () => {
  const result = buildKenjiRecommendations(input([
    candidate({ model_key: "HIGH1", safe_display_name: "High", sales: { ...candidate().sales, customer_rate_thb: 22000 } }),
    candidate({ model_key: "HIDDEN1", safe_display_name: "Hidden Price", sales: { ...candidate().sales, customer_rate_thb: null, price_visible: false } }),
    candidate({ model_key: "FIT1", safe_display_name: "Fit", sales: { ...candidate().sales, customer_rate_thb: 14000 } }),
  ]), { now: NOW });
  assert.deepEqual(result.recommendations.map((item) => item.model_key), ["FIT1"]);
  assert.deepEqual(result.review_candidates.map((item) => item.model_key), ["HIDDEN1"]);
  assert.equal(result.review_candidates[0].safe_next_action, "verify_customer_price_before_offer");
});

test("history can never bypass access, sales, or availability authority", () => {
  const result = buildKenjiRecommendations(input([
    candidate({ model_key: "DENY1", safe_display_name: "Denied", access_allowed: false }),
    candidate({ model_key: "NOSALE1", safe_display_name: "No Sale", sales: { ...candidate().sales, sellable: false } }),
    candidate({ model_key: "STALE1", safe_display_name: "Stale", availability: null }),
  ], { customer_context: { ...input([]).customer_context, prior_model_touches: [
    { model_key: "DENY1", relationship: "favorite" },
    { model_key: "NOSALE1", relationship: "favorite" },
    { model_key: "STALE1", relationship: "favorite" },
  ] } }), { now: NOW });
  assert.equal(result.recommendation_count, 0);
  assert.deepEqual(result.review_candidates.map((item) => item.model_key), ["STALE1"]);
});

test("output is deterministic, capped at three, and strips private/source fields", () => {
  const result = buildKenjiRecommendations(input([
    candidate({ model_key: "DD", safe_display_name: "D" }),
    candidate({ model_key: "CC", safe_display_name: "C" }),
    candidate({ model_key: "BB", safe_display_name: "B" }),
    candidate({ model_key: "AA", safe_display_name: "A", summary: "admin_note recABCDEFGHIJKLMN phone 0812345678", raw_private_note: "secret", source_rate: 5000, sales: { ...candidate().sales, partner_source_rate_thb: 7000, margin: 5000, matched_rule_id: "recRULEPRIVATE" } }),
  ]), { now: NOW });
  assert.deepEqual(result.recommendations.map((item) => item.model_key), ["AA", "BB", "CC"]);
  assert.equal(result.recommendations[0].summary, undefined);
  assert.doesNotMatch(JSON.stringify(result), /0812345678|raw_private_note|partner_source_rate|"margin"\s*:|recRULEPRIVATE|recABCDEFGHIJKLMN|"source_rate"\s*:/);
});
