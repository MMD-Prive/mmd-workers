import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { resolveMemberEntitlements } from "../auth-worker/src/member-entitlement-resolver.js";
import { planDownstreamAccess } from "../auth-worker/src/member-downstream-access-reconciler.js";
import { computePhase1Points } from "../payments-worker/points-phase1.js";

const NOW = Date.parse("2026-09-03T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function row(capability, { status = "active", start = -30, expire = 30 } = {}) {
  return {
    fields: {
      entitlement_id: `ent_${capability}_${status}`,
      capability,
      member_lifecycle_status: status,
      access_status: status,
      start_at: new Date(NOW + start * DAY).toISOString(),
      expire_at: new Date(NOW + expire * DAY).toISOString(),
      member_email: "smoke@example.com",
      line_user_id: "U5107dbdc87dbdd985ef5516b7f208fc3",
      telegram_user_id: "123456789",
    },
  };
}

function resolve(rows) {
  return resolveMemberEntitlements(rows, { now: NOW });
}

const matrix = [
  ["standard active", [row("private_standard")], "standard", ["standard"], []],
  ["premium active", [row("private_premium")], "premium", ["standard", "premium"], []],
  ["guest pass active", [row("guest_pass")], "none", [], []],
  ["red card active", [row("red_card")], "none", [], []],
  ["vip active", [row("vip")], "vip", ["standard", "premium"], ["vip"]],
  ["svip active", [row("svip")], "svip", ["standard", "premium"], ["svip"]],
  ["black card active", [row("black_card")], "black_card", ["standard", "premium"], ["black"]],
];

for (const [name, rows, envelope, drive, telegram] of matrix) {
  test(`E2E matrix: ${name}`, () => {
    const snapshot = resolve(rows);
    assert.equal(snapshot.schema_version, "my_mmd_entitlement_resolver_v1");
    assert.equal(snapshot.member_blocked, false);
    assert.equal(snapshot.access.private_visibility_envelope, envelope);

    const plan = planDownstreamAccess(snapshot, { drive_layers: [], telegram_rooms: [] });
    assert.equal(plan.authority, "my_mmd_entitlement_resolver_v1");
    assert.deepEqual(plan.desired.drive_layers, drive);
    assert.deepEqual(plan.desired.telegram_rooms, telegram);
  });
}

test("Expiring Soon remains valid until expiry", () => {
  const snapshot = resolve([row("private_premium", { status: "active", expire: 3 })]);
  assert.ok(snapshot.capability_state.expiring_soon.includes("private_premium"));
  assert.equal(snapshot.access.private_visibility_envelope, "premium");
  assert.equal(snapshot.access.new_drive_grants_allowed, true);
});

test("Grace retains compatible existing downstream grants but creates no new grants", () => {
  const snapshot = resolve([row("private_premium", { status: "active", expire: -2 })]);
  assert.ok(snapshot.capability_state.grace.includes("private_premium"));
  assert.equal(snapshot.access.private_visibility_envelope, "none");
  assert.equal(snapshot.access.new_drive_grants_allowed, false);

  const existing = planDownstreamAccess(snapshot, { drive_layers: ["standard", "premium"], telegram_rooms: [] });
  assert.deepEqual(existing.drive.retain, ["standard", "premium"]);
  assert.deepEqual(existing.drive.grant, []);

  const absent = planDownstreamAccess(snapshot, { drive_layers: [], telegram_rooms: [] });
  assert.deepEqual(absent.drive.grant, []);
  assert.deepEqual(absent.desired.drive_layers, []);
});

test("Guest Pass has no grace and expires closed", () => {
  const snapshot = resolve([row("guest_pass", { status: "active", expire: -1 })]);
  assert.ok(snapshot.capability_state.inactive.includes("guest_pass"));
  assert.equal(snapshot.access.guest_pass_access, false);
  assert.equal(snapshot.access.existing_grants_may_continue_in_grace, false);
});

test("Blocked member revokes observed downstream grants", () => {
  const snapshot = resolve([row("black_card", { status: "blocked" })]);
  assert.equal(snapshot.member_blocked, true);
  const plan = planDownstreamAccess(snapshot, { drive_layers: ["standard", "premium"], telegram_rooms: ["black"] });
  assert.deepEqual(plan.drive.revoke, ["standard", "premium"]);
  assert.deepEqual(plan.telegram.revoke, ["black"]);
});

test("Points Phase 1 remains independent of membership expiry", () => {
  const expiredSnapshot = resolve([row("private_standard", { status: "active", expire: -20 })]);
  assert.equal(expiredSnapshot.access.private_visibility_envelope, "none");

  const points = computePhase1Points(75, 250);
  assert.equal(points.points, 3);
  assert.equal(points.remainder_after_thb, 25);
  assert.equal(points.rate_thb_per_point, 100);
});

test("Consumer contracts stay wired to canonical snapshot and confirmed-booking honor", () => {
  const authRuntime = fs.readFileSync("auth-worker/src/my-mmd-runtime-index.js", "utf8");
  const bookingRuntime = fs.readFileSync("sigil-booking-worker/src/runtime-index.js", "utf8");
  const bookingConfirm = fs.readFileSync("sigil-booking-worker/src/entitlement-runtime-worker.js", "utf8");
  const telegramRuntime = fs.readFileSync("telegram-worker/src/access-runtime.js", "utf8");
  const driveRuntime = fs.readFileSync("member-pages-worker/src/drive-access-reconcile.js", "utf8");
  const lifecycle = fs.readFileSync("auth-worker/src/member-lifecycle-reconciliation.js", "utf8");
  const consumerContract = fs.readFileSync("docs/architecture/MY_MMD_ENTITLEMENT_CONSUMER_CONTRACT_V1.md", "utf8");

  assert.match(authRuntime, /entitlement_snapshot/);
  assert.match(consumerContract, /entitlement_snapshot\.access/);
  assert.match(bookingRuntime, /honor_after_expiry/);
  assert.match(bookingRuntime, /entitlement_snapshot_at_confirm/);
  assert.match(bookingConfirm, /booking_entitlement_snapshot_v1/);
  assert.match(bookingConfirm, /payment_verified_at_confirm/);
  assert.match(telegramRuntime, /AUTH_SERVICE_AUTH_TO_TELEGRAM/);
  assert.match(driveRuntime, /authority: "my_mmd_entitlement_resolver_v1"/);
  assert.match(lifecycle, /my_mmd_lifecycle_reconciliation_v1/);
});
