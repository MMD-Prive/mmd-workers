import assert from "node:assert/strict";
import test from "node:test";
import { resolveMemberEntitlements } from "../../auth-worker/src/member-entitlement-resolver.js";

test("booking private access is represented by canonical private envelope", () => {
  const snapshot = resolveMemberEntitlements([
    { fields: { capability: "private_standard", member_status: "active", access_status: "active" } },
  ], { now: "2026-09-03T00:00:00Z" });
  assert.equal(snapshot.access.private_visibility_envelope, "standard");
  assert.equal(snapshot.member_blocked, false);
});

test("booking fails closed for blocked member", () => {
  const snapshot = resolveMemberEntitlements([
    { fields: { capability: "private_premium", member_status: "blocked", access_status: "active" } },
  ], { now: "2026-09-03T00:00:00Z" });
  assert.equal(snapshot.access.private_visibility_envelope, "none");
  assert.equal(snapshot.member_blocked, true);
});

test("booking grace preserves historical grant state but blocks new model visibility", () => {
  const snapshot = resolveMemberEntitlements([
    { fields: { capability: "private_premium", member_status: "grace", access_status: "grace", grace_until: "2026-09-05T00:00:00Z" } },
  ], { now: "2026-09-03T00:00:00Z" });
  assert.equal(snapshot.access.private_visibility_envelope, "none");
  assert.equal(snapshot.access.grace_private_history_envelope, "premium");
  assert.equal(snapshot.access.new_model_reveals_allowed, false);
  assert.equal(snapshot.access.new_drive_grants_allowed, false);
  assert.equal(snapshot.access.new_telegram_grants_allowed, false);
});
