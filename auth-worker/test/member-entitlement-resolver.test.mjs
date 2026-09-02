import test from "node:test";
import assert from "node:assert/strict";

import {
  CAPABILITIES,
  capabilityFromFields,
  normalizeEntitlement,
  resolveMemberEntitlements,
} from "../src/member-entitlement-resolver.js";

const NOW = "2026-09-02T12:00:00.000Z";

function row(fields) {
  return { fields };
}

test("keeps concurrent public and private entitlements independent", () => {
  const result = resolveMemberEntitlements([
    row({ entitlement_id: "pub", package_code: "public_member", access_status: "active", expire_at: "2027-01-01T00:00:00Z" }),
    row({ entitlement_id: "pre", package_code: "private_premium", access_status: "active", expire_at: "2027-01-01T00:00:00Z" }),
  ], { now: NOW });

  assert.deepEqual(result.capability_state.active.sort(), [CAPABILITIES.PRIVATE_PREMIUM, CAPABILITIES.PUBLIC_MEMBER].sort());
  assert.equal(result.access.public_service_access, true);
  assert.equal(result.access.private_visibility_envelope, "premium");
  assert.equal(result.access.red_card_request_lane, false);
});

test("black card qualifies Red Card request lane without inventing a Red Card entitlement", () => {
  const result = resolveMemberEntitlements([
    row({ entitlement_id: "black", entitlement_level: "black_card", access_status: "active", expire_at: "2027-01-01T00:00:00Z" }),
  ], { now: NOW });

  assert.deepEqual(result.capability_state.active, [CAPABILITIES.BLACK_CARD]);
  assert.equal(result.capability_state.active.includes(CAPABILITIES.RED_CARD), false);
  assert.equal(result.access.red_card_request_lane, true);
  assert.equal(result.access.protected_allowlist_required, true);
  assert.equal(result.access.private_visibility_envelope, "black_card");
});

test("premium establishes only a premium private envelope and never auto-grants VIP", () => {
  const result = resolveMemberEntitlements([
    row({ entitlement_id: "premium", package_code: "premium", access_status: "active", expire_at: "2027-01-01" }),
  ], { now: NOW });

  assert.equal(result.access.private_visibility_envelope, "premium");
  assert.equal(result.capability_state.active.includes(CAPABILITIES.VIP), false);
  assert.equal(result.access.protected_allowlist_required, false);
});

test("grace preserves existing access state but forbids new protected and downstream grants", () => {
  const result = resolveMemberEntitlements([
    row({ entitlement_id: "vip", entitlement_level: "vip", access_status: "grace", expire_at: "2026-09-01T00:00:00Z", grace_until: "2026-09-07T00:00:00Z" }),
  ], { now: NOW });

  assert.deepEqual(result.capability_state.active, []);
  assert.deepEqual(result.capability_state.grace, [CAPABILITIES.VIP]);
  assert.equal(result.access.private_visibility_envelope, "vip");
  assert.equal(result.access.protected_allowlist_required, true);
  assert.equal(result.access.new_protected_grants_allowed, false);
  assert.equal(result.access.new_drive_grants_allowed, false);
  assert.equal(result.access.new_telegram_grants_allowed, false);
  assert.equal(result.access.existing_grants_may_continue_in_grace, true);
});

test("guest pass never receives grace even if grace_until is populated", () => {
  const normalized = normalizeEntitlement({
    entitlement_id: "guest",
    package_code: "guest_pass",
    access_status: "grace",
    expire_at: "2026-09-01T00:00:00Z",
    grace_until: "2026-09-07T00:00:00Z",
  }, 0, Date.parse(NOW));

  assert.equal(normalized.capability, CAPABILITIES.GUEST_PASS);
  assert.equal(normalized.lifecycle, "expired");
  assert.equal(normalized.grace_until, "");
});

test("blocked or suspended member state fails closed across every capability", () => {
  const result = resolveMemberEntitlements([
    row({ entitlement_id: "premium", package_code: "private_premium", access_status: "active", member_status: "blocked", expire_at: "2027-01-01" }),
    row({ entitlement_id: "public", package_code: "public_member", access_status: "active", expire_at: "2027-01-01" }),
  ], { now: NOW });

  assert.equal(result.member_blocked, true);
  assert.deepEqual(result.capability_state.active, []);
  assert.equal(result.access.public_service_access, false);
  assert.equal(result.access.red_card_request_lane, false);
  assert.equal(result.access.private_visibility_envelope, "none");
  assert.equal(result.access.new_drive_grants_allowed, false);
});

test("expired entitlements remain recognized for history but grant no active access", () => {
  const result = resolveMemberEntitlements([
    row({ entitlement_id: "old-public", package_code: "public_member", access_status: "active", expire_at: "2026-08-01T00:00:00Z" }),
  ], { now: NOW });

  assert.deepEqual(result.capability_state.active, []);
  assert.deepEqual(result.capability_state.inactive, [CAPABILITIES.PUBLIC_MEMBER]);
  assert.deepEqual(result.capability_state.recognized, [CAPABILITIES.PUBLIC_MEMBER]);
  assert.equal(result.access.public_service_access, false);
});

test("unknown entitlement values fail closed and surface review refs", () => {
  const result = resolveMemberEntitlements([
    row({ entitlement_id: "mystery", package_code: "super_secret_tier", access_status: "active", source_ref: "legacy-1" }),
  ], { now: NOW });

  assert.equal(capabilityFromFields({ package_code: "super_secret_tier" }), "unknown");
  assert.equal(result.access.public_service_access, false);
  assert.equal(result.access.private_visibility_envelope, "none");
  assert.deepEqual(result.review.unknown_records, ["legacy-1"]);
});

test("Public Member and Red Card are separate capabilities", () => {
  const result = resolveMemberEntitlements([
    row({ entitlement_id: "member", package_code: "public_member", access_status: "active", expire_at: "2027-01-01" }),
    row({ entitlement_id: "red", package_code: "red_card", access_status: "active", expire_at: "2029-01-01" }),
  ], { now: NOW });

  assert.equal(result.access.public_service_access, true);
  assert.equal(result.access.red_card_request_lane, true);
  assert.deepEqual(result.capability_state.active.sort(), [CAPABILITIES.PUBLIC_MEMBER, CAPABILITIES.RED_CARD].sort());
});
