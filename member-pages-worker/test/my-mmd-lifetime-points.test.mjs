import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeLifetimePoints,
  patchLifetimePointsPayload,
} from "../src/my-mmd-lifetime-points.js";

test("lifetime points count old posted records and ignore expiry in phase 1", () => {
  const summary = summarizeLifetimePoints([
    { id: "rec1", fields: { points: 200, transaction_status: "posted", posted_at: "2026-08-01", expires_at: "2026-09-01", idempotency_key: "a" } },
    { id: "rec2", fields: { points: 999, transaction_status: "posted", posted_at: "2021-08-01", expires_at: "2022-08-01", idempotency_key: "b" } },
    { id: "rec3", fields: { points: -25, transaction_status: "completed", posted_at: "2022-01-01", idempotency_key: "c" } },
    { id: "rec4", fields: { points: 200, transaction_status: "posted", posted_at: "2026-08-01", idempotency_key: "a" } },
    { id: "rec5", fields: { points: 500, transaction_status: "pending", posted_at: "2026-08-01", idempotency_key: "d" } },
  ]);
  assert.equal(summary.confirmedBalance, 1174);
  assert.equal(summary.earnedTotal, 1199);
  assert.equal(summary.redeemedTotal, 25);
  assert.equal(summary.recordsCount, 3);
  assert.equal(summary.pointsExpire, false);
  assert.equal(summary.nearestExpiry, null);
});

test("points endpoint is patched to lifetime total without removing ledger history", () => {
  const payload = {
    state: "resolved",
    summary: { confirmedBalance: 200, currencyLabel: "MMD Points" },
    ledger: [{ id: "points-1", delta: 200 }],
  };
  const patched = patchLifetimePointsPayload("/api/member/app/points", payload, {
    confirmedBalance: 1174,
    earnedTotal: 1199,
    redeemedTotal: 25,
    recordsCount: 3,
  });
  assert.equal(patched.summary.confirmedBalance, 1174);
  assert.equal(patched.summary.pointsExpire, false);
  assert.equal(patched.ledger.length, 1);
  assert.deepEqual(patched.pointsPolicy, { expires: false, mode: "lifetime_total", phase: 1 });
});

test("profile and dashboard receive the same lifetime points total", () => {
  const summary = {
    confirmedBalance: 325,
    earnedTotal: 350,
    redeemedTotal: 25,
    recordsCount: 4,
  };
  const profile = patchLifetimePointsPayload("/api/member/app/profile", { points_confirmed: 10 }, summary);
  assert.equal(profile.points_confirmed, 325);
  assert.equal(profile.points_expire, false);

  const dashboard = patchLifetimePointsPayload("/api/member/dashboard", {
    ok: true,
    data: { points: { status: "verified", value: 10 } },
  }, summary);
  assert.equal(dashboard.data.points.value, 325);
  assert.equal(dashboard.data.points.expiring_points, 0);
  assert.equal(dashboard.data.points.nearest_expiry, null);
});
