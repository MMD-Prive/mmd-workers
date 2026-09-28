import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOwnerAnalyticsDashboard,
  __ownerAnalyticsTest,
} from "./src/owner-analytics-dashboard.js";

test("owner analytics fails closed to read-scope-missing without fabricating zeros", async () => {
  const result = await buildOwnerAnalyticsDashboard({});
  assert.equal(result.ok, true);
  assert.equal(result.schema, "mmd.owner_analytics_dashboard.v1");
  assert.equal(result.analytics_schema, "mmd_analytics_canon_v2");
  assert.equal(result.state, "read_scope_missing");
  assert.equal(result.guardrails.cross_layer_person_conversion, false);
  assert.equal(result.intent.funnels.public_profile_to_booking_start.steps[0].events_30d, null);
  assert.equal(result.business_truth.metrics.payment_verified.events_30d, null);
  assert.equal(result.operational_health.status, "unknown");
});

test("event aggregation keeps intent and authority truth separate", () => {
  const map = __ownerAnalyticsTest.indexEventRows([
    { event: "profile_viewed", flow: null, events_30d: 7, current_7d: 7, previous_7d: 0, last_seen: "2026-09-22T20:00:00+07:00" },
    { event: "booking_started", flow: null, events_30d: 5, current_7d: 5, previous_7d: 0, last_seen: "2026-09-22T11:00:00+07:00" },
    { event: "booking_received", flow: "booking_intake", events_30d: 2, current_7d: 2, previous_7d: 0, last_seen: "2026-09-22T21:00:00+07:00" },
    { event: "payment_verified", flow: "booking_payment", events_30d: 1, current_7d: 1, previous_7d: 0, last_seen: "2026-09-22T21:10:00+07:00" },
  ]);
  const intent = __ownerAnalyticsTest.buildIntent(map, [], "connected");
  const truth = __ownerAnalyticsTest.buildTruth(map, [], "connected");

  assert.equal(intent.funnels.public_profile_to_booking_start.steps[0].events_30d, 7);
  assert.equal(intent.funnels.public_profile_to_booking_start.steps[1].events_30d, 5);
  assert.equal(intent.funnels.public_profile_to_booking_start.conversion_rate, null);
  assert.equal(truth.metrics.booking_received.events_30d, 2);
  assert.equal(truth.metrics.payment_verified.events_30d, 1);
  assert.equal(truth.cross_layer_person_join, "forbidden_without_explicit_safe_join_key");
});

test("health requires all six canonical authorities", () => {
  const rows = [
    "sigil-booking-worker",
    "payments-worker",
    "member-pages-worker",
    "mms-worker",
    "himai-chat-worker",
    "partners-worker",
  ].map((authority) => ({ authority, events_24h: 2, last_seen: "2026-09-22T21:00:00+07:00" }));

  const health = __ownerAnalyticsTest.buildHealth(rows, "connected");
  assert.equal(health.required, 6);
  assert.equal(health.healthy, 6);
  assert.equal(health.status, "ok");
});

test("HogQL definitions never attempt client/server identity joins", () => {
  const eventQuery = __ownerAnalyticsTest.eventSummaryQuery();
  const routeQuery = __ownerAnalyticsTest.routeSummaryQuery();
  assert.match(eventQuery, /profile_viewed/);
  assert.match(eventQuery, /payment_verified/);
  assert.match(routeQuery, /\/member\/login/);
  assert.match(routeQuery, /\/partner\/terms/);
  assert.doesNotMatch(eventQuery, /JOIN\s+persons/i);
});
