import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKenjiEntitlementSnapshot,
  canKenjiRevealPrivateModels,
  canKenjiUseProtectedLane,
  projectKenjiAccess,
} from "./kenji-entitlement-runtime-contract.mjs";

test("Kenji consumes active Premium through canonical entitlement snapshot", () => {
  const snapshot = buildKenjiEntitlementSnapshot([
    { fields: { capability: "private_premium", member_status: "active", access_status: "active" } },
  ], { now: "2026-09-03T00:00:00Z" });
  const access = projectKenjiAccess(snapshot);
  assert.equal(access.private_visibility_envelope, "premium");
  assert.equal(canKenjiRevealPrivateModels(snapshot), true);
  assert.equal(canKenjiUseProtectedLane(snapshot), false);
});

test("Kenji keeps protected lane approval-gated and fail-closed in grace", () => {
  const snapshot = buildKenjiEntitlementSnapshot([
    { fields: { capability: "black_card", member_status: "grace", access_status: "grace", grace_until: "2026-09-05T00:00:00Z" } },
  ], { now: "2026-09-03T00:00:00Z" });
  const access = projectKenjiAccess(snapshot);
  assert.equal(access.private_visibility_envelope, "black_card");
  assert.equal(access.new_protected_grants_allowed, false);
  assert.equal(canKenjiUseProtectedLane(snapshot), false);
});

test("blocked member cannot reveal private models", () => {
  const snapshot = buildKenjiEntitlementSnapshot([
    { fields: { capability: "private_premium", member_status: "blocked", access_status: "active" } },
  ], { now: "2026-09-03T00:00:00Z" });
  assert.equal(canKenjiRevealPrivateModels(snapshot), false);
});
