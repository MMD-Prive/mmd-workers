import test from "node:test";
import assert from "node:assert/strict";
import { newPointsWallet, transitionPoints, pointsSnapshot } from "./points-lots.js";
const apply = (w, type, reference, now, extra = {}) => transitionPoints(w, { memberId: "member-a", type, reference, ...extra }, now);
const award = (w, reference, now, points) => apply(w, "award", reference, now, { points });
function fixture() {
  let w = award(newPointsWallet("member-a"), "job-1", "2026-01-01T00:00:00Z", 100);
  return award(w, "job-2", "2026-02-01T00:00:00Z", 200);
}
test("only the due lot expires at the exact boundary; later lots remain spendable", () => {
  const w = fixture();
  assert.equal(pointsSnapshot(w, "2026-12-31T23:59:59Z").available, 300);
  const s = pointsSnapshot(w, "2027-01-01T00:00:00Z");
  assert.equal(s.available, 200);
  assert.equal(s.expired, 100);
  assert.equal(s.expirySchedule.length, 1);
});
test("reserve spends nearest expiry first, capture/retry deduct only once", () => {
  let w = apply(fixture(), "reserve", "order-1", "2026-03-01T00:00:00Z", { points: 150, holdUntil: "2026-03-01T00:15:00Z" });
  assert.deepEqual(w.reservations[0].allocations, [{ lotId: "job-1", points: 100 }, { lotId: "job-2", points: 50 }]);
  assert.equal(pointsSnapshot(w, "2026-03-01T00:01:00Z").available, 150);
  w = apply(w, "capture", "order-1", "2026-03-01T00:01:00Z");
  assert.deepEqual(apply(w, "capture", "order-1", "2026-03-01T00:02:00Z"), w);
  assert.equal(pointsSnapshot(w, "2027-01-01T00:00:00Z").available, 150);
});
test("import replay never renews expiry or grants twice; conflicting award rejected", () => {
  const w = fixture();
  assert.deepEqual(award(w, "job-1", "2026-12-01T00:00:00Z", 100), w);
  assert.throws(() => award(w, "job-1", "2026-12-01T00:00:00Z", 101), /idempotency_conflict/);
});
test("refund after expiry restores provenance without reviving expired points", () => {
  let w = apply(fixture(), "reserve", "order", "2026-03-01T00:00:00Z", { points: 150, holdUntil: "2026-03-01T00:15:00Z" });
  w = apply(w, "capture", "order", "2026-03-01T00:01:00Z");
  w = apply(w, "refund", "order", "2027-01-02T00:00:00Z");
  const s = pointsSnapshot(w, "2027-01-02T00:00:00Z");
  assert.equal(s.available, 200);
  assert.equal(s.expired, 100);
  assert.deepEqual(apply(w, "refund", "order", "2027-01-03T00:00:00Z"), w);
});
test("expired reservation is released for reuse and cannot later capture", () => {
  const w = apply(fixture(), "reserve", "order", "2026-03-01T00:00:00Z", { points: 300, holdUntil: "2026-03-01T00:15:00Z" });
  assert.equal(pointsSnapshot(w, "2026-03-01T00:15:00Z").available, 300);
  assert.throws(() => apply(w, "capture", "order", "2026-03-01T00:15:00Z"), /hold_expired/);
});
test("insufficient balance, another owner and invalid amounts cannot mutate wallet", () => {
  const w = fixture();
  const before = structuredClone(w);
  assert.throws(() => apply(w, "reserve", "order", "2026-03-01", { points: 301, holdUntil: "2026-03-02" }), /insufficient/);
  assert.throws(() => transitionPoints(w, { memberId: "member-b", type: "award", reference: "x", points: 100 }, "2026-03-01"), /member_mismatch/);
  for (const points of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => award(w, "x", "2026-03-01", points), /invalid_points/);
  assert.deepEqual(w, before);
});
test("release restores original balance and capture after release is rejected", () => {
  let w = apply(fixture(), "reserve", "order", "2026-03-01", { points: 100, holdUntil: "2026-03-02" });
  w = apply(w, "release", "order", "2026-03-01T01:00:00Z");
  assert.equal(pointsSnapshot(w, "2026-03-01T01:00:00Z").available, 300);
  assert.throws(() => apply(w, "capture", "order", "2026-03-01T02:00:00Z"), /invalid_transition/);
});
