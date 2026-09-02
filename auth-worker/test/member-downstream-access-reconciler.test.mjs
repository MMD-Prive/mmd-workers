import test from "node:test";
import assert from "node:assert/strict";
import { resolveMemberEntitlements } from "../src/member-entitlement-resolver.js";
import { planDownstreamAccess } from "../src/member-downstream-access-reconciler.js";

const now = "2026-09-03T00:00:00.000Z";
const row = (capability, member_status = "active", extra = {}) => ({ fields: { capability, member_status, ...extra } });
const resolve = (rows) => resolveMemberEntitlements(rows, { now });

test("public, guest and red card never create private downstream grants", () => {
  for (const capability of ["public_member", "guest_pass", "red_card"]) {
    const plan = planDownstreamAccess(resolve([row(capability)]));
    assert.deepEqual(plan.drive.grant, []);
    assert.deepEqual(plan.telegram.grant, []);
  }
});

test("active standard grants standard Drive only", () => {
  const plan = planDownstreamAccess(resolve([row("private_standard")]));
  assert.deepEqual(plan.drive.grant, ["standard"]);
  assert.deepEqual(plan.telegram.grant, []);
});

test("active premium grants standard and premium Drive", () => {
  const plan = planDownstreamAccess(resolve([row("private_premium")]));
  assert.deepEqual(plan.drive.grant, ["standard", "premium"]);
});

test("grace retains existing grants but never adds", () => {
  const snapshot = resolve([row("private_premium", "grace", { expire_at: "2026-09-01T00:00:00.000Z", grace_until: "2026-09-08T00:00:00.000Z" })]);
  const plan = planDownstreamAccess(snapshot, { drive_layers: ["standard"], telegram_rooms: [] });
  assert.deepEqual(plan.drive.grant, []);
  assert.deepEqual(plan.drive.retain, ["standard"]);
  assert.deepEqual(plan.drive.revoke, []);
});

test("protected grace retains existing room but never creates one", () => {
  const snapshot = resolve([row("black_card", "grace", { expire_at: "2026-09-01T00:00:00.000Z", grace_until: "2026-09-08T00:00:00.000Z" })]);
  const empty = planDownstreamAccess(snapshot, { telegram_rooms: [] });
  assert.deepEqual(empty.telegram.grant, []);
  const existing = planDownstreamAccess(snapshot, { telegram_rooms: ["black"] });
  assert.deepEqual(existing.telegram.retain, ["black"]);
});

test("active protected capability derives room from resolver only", () => {
  const plan = planDownstreamAccess(resolve([row("black_card")]));
  assert.deepEqual(plan.telegram.grant, ["black"]);
});

test("expired or blocked revokes current downstream access", () => {
  const expired = resolve([row("private_premium", "expired")]);
  const expiredPlan = planDownstreamAccess(expired, { drive_layers: ["standard", "premium"], telegram_rooms: ["black"] });
  assert.deepEqual(expiredPlan.drive.revoke, ["standard", "premium"]);
  assert.deepEqual(expiredPlan.telegram.revoke, ["black"]);

  const blocked = resolve([row("black_card", "blocked")]);
  const blockedPlan = planDownstreamAccess(blocked, { drive_layers: ["standard", "premium"], telegram_rooms: ["black"] });
  assert.deepEqual(blockedPlan.telegram.revoke, ["black"]);
});
