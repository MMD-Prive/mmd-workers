import test from "node:test";
import assert from "node:assert/strict";
import {
  ANALYTICS_SCHEMA,
  EVENTS,
  FUNNELS,
  DEPRECATED_EVENT_ALIASES,
  canonicalEventName,
} from "./posthog-conversion-canon.mjs";

test("analytics canon schema is locked", () => {
  assert.equal(ANALYTICS_SCHEMA, "mmd_analytics_canon_v1");
});

test("deprecated booking/payment aliases resolve to server authority canon", () => {
  assert.equal(canonicalEventName("booking_submitted"), EVENTS.BOOKING_SUBMITTED);
  assert.equal(canonicalEventName("payment_completed"), EVENTS.PAYMENT_COMPLETED);
  assert.equal(DEPRECATED_EVENT_ALIASES.booking_submitted, "booking_received");
  assert.equal(DEPRECATED_EVENT_ALIASES.payment_completed, "payment_verified");
});

test("public conversion funnel uses canonical completion events", () => {
  assert.deepEqual(FUNNELS.PUBLIC_TO_PAYMENT, [
    "profile_viewed",
    "booking_started",
    "booking_received",
    "payment_started",
    "payment_verified",
  ]);
});

test("operational health is never a conversion step", () => {
  for (const steps of Object.values(FUNNELS)) {
    assert.ok(!steps.includes(EVENTS.ANALYTICS_RUNTIME_HEALTH));
  }
});
