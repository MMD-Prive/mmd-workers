import test from "node:test";
import assert from "node:assert/strict";
import { classifySnapshotRefreshFailure, memberReplyMorningWindowReady, projectMemberReplySnapshot, snapshotDrainAllowlist, snapshotProjection, snapshotRetryAt } from "./member-reply-snapshot.js";

const authority = "my_mmd_entitlement_resolver_v1";
const membership = { level: "svip", label: "SVIP", lifecycle: "active", expire_at: "2026-11-30" };
const truth = { ok: true, authority, identity_status: "resolved", membership };
const points = { ...truth, points: {
  status: "verified", active_points: 320, valid_until: "2026-11-01T00:00:00.000Z",
  authority: "canonical_paid_points_source_guard_v1",
} };

test("only canonical verified Points enter the snapshot", () => {
  const good = projectMemberReplySnapshot(truth, points);
  assert.equal(good.membership_level, "svip");
  assert.equal(good.points_balance, 320);
  assert.equal(good.points_valid_until, "2026-11-01T00:00:00.000Z");
  const bad = projectMemberReplySnapshot(truth, { ...points, points: { status: "verified", active_points: 320 } });
  assert.equal(bad.points_balance, null);
  assert.equal(bad.points_status, "unavailable");
});

test("conflicting membership sources suppress Points", () => {
  const result = projectMemberReplySnapshot(truth, { ...points, membership: { ...membership, level: "vip" } });
  assert.equal(result.membership_level, "svip");
  assert.equal(result.points_status, "unavailable");
});

test("pending updates, aged rows and temporal expiry hide prior values", () => {
  const now = Date.parse("2026-10-27T07:00:00Z");
  const row = { line_key: "hash", ...projectMemberReplySnapshot(truth, points, "2026-10-27T06:00:00Z"), refresh_generation: 1 };
  assert.equal(snapshotProjection(row, null, now)?.points.active_points, 320);
  assert.equal(snapshotProjection(row, { generation: 2 }, now), null);
  assert.equal(snapshotProjection(row, { generation: 2, reason: "daily_0402_bkk" }, now)?.points.active_points, 320);
  assert.equal(snapshotProjection(row, { generation: 2, reason: "daily_0600_bkk" }, now)?.points.active_points, 320);
  assert.equal(snapshotProjection(row, { generation: 2, reason: "event" }, now), null);
  assert.equal(snapshotProjection(row, { generation: 2, reason: "daily_unknown" }, now), null);
  assert.equal(snapshotProjection(row, { generation: 2, reason: "daily_0600_bkk" }, now + 31 * 60 * 60 * 1000), null);
  assert.equal(snapshotProjection(row, null, now + 31 * 60 * 60 * 1000), null);
  assert.equal(snapshotProjection({ ...row, points_valid_until: "2026-10-27T06:59:00Z" }, null, now)?.points.status, "unavailable");
  assert.equal(snapshotProjection({ ...row, membership_expire_at: "2026-10-27" }, null, now), null);
});

test("morning rebuild begins at 04:02 Bangkok, away from top-of-hour jobs", () => {
  assert.equal(memberReplyMorningWindowReady(new Date("2026-10-26T21:01:59Z")), false);
  assert.equal(memberReplyMorningWindowReady(new Date("2026-10-26T21:02:00Z")), true);
});

test("missing canonical evidence stays unavailable and produces a bounded retry class", () => {
  assert.equal(classifySnapshotRefreshFailure(null, null), "canonical_membership_and_points_unavailable");
  assert.equal(classifySnapshotRefreshFailure(truth, null), "canonical_points_unavailable");
  assert.equal(classifySnapshotRefreshFailure(truth, { ...points, membership: { ...membership, level: "vip" } }), "canonical_membership_conflict");
});

test("retry timestamps describe policy but do not imply an executor exists", () => {
  const now = new Date("2026-10-28T00:00:00.000Z");
  assert.equal(snapshotRetryAt(1, now, "event"), "2026-10-28T00:05:00.000Z");
  assert.equal(snapshotRetryAt(3, now, "daily_0402_bkk"), "2026-10-29T00:00:00.000Z");
});

test("snapshot drain allowlist is opt-in and hash-only", () => {
  assert.deepEqual(snapshotDrainAllowlist({}), []);
  assert.deepEqual(snapshotDrainAllowlist({ MEMBER_REPLY_SNAPSHOT_DRAIN_ALLOWLIST: "abc, def,abc" }), ["abc", "def", "abc"]);
});
