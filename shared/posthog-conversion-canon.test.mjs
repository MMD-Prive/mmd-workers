import test from "node:test";
import assert from "node:assert/strict";
import {
  ANALYTICS_SCHEMA,
  EVENTS,
  IDENTITY_POLICY,
  LANES,
  INTENT_FUNNELS,
  BUSINESS_TRUTH_METRICS,
  OPERATIONAL_HEALTH,
  OWNER_DASHBOARD,
  DEPRECATED_EVENT_ALIASES,
  canonicalEventName,
  isCrossLayerPersonConversionAllowed,
} from "./posthog-conversion-canon.mjs";

test("analytics canon v2 locks intent and truth as separate identity layers", () => {
  assert.equal(ANALYTICS_SCHEMA, "mmd_analytics_canon_v2");
  assert.equal(IDENTITY_POLICY.intent_identity, "posthog_client_person");
  assert.equal(IDENTITY_POLICY.business_truth_identity, "mmd_authority_record_hash");
  assert.equal(isCrossLayerPersonConversionAllowed(), false);
});

test("deprecated booking/payment aliases resolve only to authority canon", () => {
  assert.equal(canonicalEventName("booking_submitted"), EVENTS.BOOKING_RECEIVED);
  assert.equal(canonicalEventName("payment_completed"), EVENTS.PAYMENT_VERIFIED);
  assert.equal(DEPRECATED_EVENT_ALIASES.booking_submitted, "booking_received");
  assert.equal(DEPRECATED_EVENT_ALIASES.payment_completed, "payment_verified");
});

test("public intent funnel contains browser intent only", () => {
  assert.deepEqual(INTENT_FUNNELS.PUBLIC_PROFILE_TO_BOOKING_START.steps, [
    "profile_viewed",
    "booking_started",
  ]);
  assert.ok(!INTENT_FUNNELS.PUBLIC_PROFILE_TO_BOOKING_START.steps.includes("booking_received"));
  assert.ok(!INTENT_FUNNELS.PUBLIC_PROFILE_TO_BOOKING_START.steps.includes("payment_verified"));
});

test("six business lanes retain canonical authority truth", () => {
  assert.deepEqual(Object.keys(LANES), [
    "public_booking",
    "membership",
    "my_mmd",
    "mms",
    "shop",
    "partner",
  ]);
  assert.equal(LANES.membership.truth_flow.payment, "membership_payment");
  assert.equal(LANES.mms.truth_flow.payment, "mms_payment");
  assert.equal(LANES.shop.truth_flow.payment, "shop_payment");
  assert.equal(LANES.partner.intent_routes[0], "/partner");
});

test("owner truth metrics never use intent events as completion", () => {
  assert.equal(BUSINESS_TRUTH_METRICS.payment_verified.event, "payment_verified");
  assert.equal(BUSINESS_TRUTH_METRICS.payment_verified_thb.property, "amount_thb");
  assert.equal(BUSINESS_TRUTH_METRICS.membership_activated.event, "membership_activated");
});

test("analytics runtime health remains operational only", () => {
  assert.equal(OPERATIONAL_HEALTH.event, "analytics_runtime_health");
  assert.equal(OPERATIONAL_HEALTH.required_authorities.length, 6);
  for (const metric of Object.values(BUSINESS_TRUTH_METRICS)) {
    assert.notEqual(metric.event, EVENTS.ANALYTICS_RUNTIME_HEALTH);
  }
});

test("owner dashboard has three explicit layers", () => {
  assert.deepEqual(OWNER_DASHBOARD.sections, ["intent", "business_truth", "operational_health"]);
  assert.equal(OWNER_DASHBOARD.default_window_days, 30);
  assert.equal(OWNER_DASHBOARD.compare_days, 7);
});
