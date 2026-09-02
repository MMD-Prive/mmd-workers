import test from "node:test";
import assert from "node:assert/strict";
import { buildMemberAccessReconciliation } from "../src/member-access-reconciler.js";

function snapshot({ active = [], grace = [], blocked = false, drive = true, telegram = true, keepGrace = false } = {}) {
  return {
    schema_version: "my_mmd_entitlement_resolver_v1",
    member_blocked: blocked,
    capability_state: { active, grace, inactive: [], recognized: [...active, ...grace] },
    access: {
      new_drive_grants_allowed: drive,
      new_telegram_grants_allowed: telegram,
      existing_grants_may_continue_in_grace: keepGrace,
    },
  };
}

test("Drive scopes come from active entitlements, not legacy Drive state", () => {
  const plan = buildMemberAccessReconciliation({
    snapshot: snapshot({ active: ["private_premium"] }),
    current: { drive_scopes: ["private_standard"] },
  });
  assert.deepEqual(plan.drive.grant, ["private_premium"]);
  assert.deepEqual(plan.drive.revoke, ["private_standard"]);
  assert.equal(plan.source_of_truth, "entitlement_snapshot");
});

test("Grace creates no new Drive or Telegram grants and may keep existing grants", () => {
  const plan = buildMemberAccessReconciliation({
    snapshot: snapshot({ grace: ["private_premium", "vip"], drive: false, telegram: false, keepGrace: true }),
    current: { drive_scopes: ["private_premium"], telegram_rooms: ["vip"] },
    approvals: { vip: true },
  });
  assert.deepEqual(plan.drive.grant, []);
  assert.deepEqual(plan.telegram.grant, []);
  assert.deepEqual(plan.drive.keep, ["private_premium"]);
  assert.deepEqual(plan.telegram.keep, ["vip"]);
});

test("Protected Telegram access requires both active capability and explicit approval", () => {
  const plan = buildMemberAccessReconciliation({
    snapshot: snapshot({ active: ["vip", "svip", "black_card"] }),
    approvals: { vip: false, svip: true, black_card: true },
  });
  assert.deepEqual(plan.telegram.grant.sort(), ["black_card", "svip"]);
});

test("Blocked member revokes all current downstream access", () => {
  const plan = buildMemberAccessReconciliation({
    snapshot: snapshot({ blocked: true }),
    current: { drive_scopes: ["private_premium"], telegram_rooms: ["black_card"] },
  });
  assert.deepEqual(plan.drive.revoke, ["private_premium"]);
  assert.deepEqual(plan.telegram.revoke, ["black_card"]);
  assert.deepEqual(plan.drive.grant, []);
  assert.deepEqual(plan.telegram.grant, []);
});

test("Unknown snapshot fails closed", () => {
  const plan = buildMemberAccessReconciliation({ snapshot: { schema_version: "legacy" } });
  assert.equal(plan.reason, "invalid_snapshot");
  assert.deepEqual(plan.drive.grant, []);
  assert.deepEqual(plan.telegram.grant, []);
});
