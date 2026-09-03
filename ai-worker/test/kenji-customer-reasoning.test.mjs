import test from "node:test";
import assert from "node:assert/strict";

import worker from "../index.js";
import { searchAirtable } from "../src/connectors/airtable.js";
import { reasonKenjiCustomerContext } from "../src/services/kenji-customer-reasoning.js";

function snapshot({ active = [], expiringSoon = [], grace = [], inactive = [], recognized = [], memberBlocked = false, envelope = "none" } = {}) {
  const hasActive = active.length > 0 || expiringSoon.length > 0;
  return {
    schema_version: "my_mmd_entitlement_resolver_v1",
    fail_closed: true,
    member_blocked: memberBlocked,
    capability_state: {
      active,
      expiring_soon: expiringSoon,
      grace,
      inactive,
      recognized: recognized.length ? recognized : [...active, ...expiringSoon, ...grace, ...inactive],
    },
    access: {
      public_service_access: hasActive,
      guest_pass_access: active.includes("guest_pass") || expiringSoon.includes("guest_pass"),
      red_card_request_lane: false,
      private_visibility_envelope: envelope,
      protected_allowlist_required: ["vip", "svip", "black_card"].some((item) => [...active, ...expiringSoon, ...grace].includes(item)),
      protected_capabilities_active: [...active, ...expiringSoon].filter((item) => ["vip", "svip", "black_card"].includes(item)),
      new_model_reveals_allowed: hasActive && envelope !== "none",
    },
  };
}

test("Rename Blackcard confirms historical paid context without creating current entitlement", () => {
  const result = reasonKenjiCustomerContext({
    rename: "โป้ Blackcard 15/08/23",
    hashtags: ["#client", "#mem65", "#mem66", "#memaug23"],
    latest_cycle: {
      package_code: "premium",
      expire_at: "2025-08-15T23:59:59+07:00",
    },
    entitlement_snapshot: snapshot({ inactive: ["black_card", "private_premium"] }),
  }, { now: "2026-09-03T12:00:00Z" });

  assert.equal(result.identity.primary_reference, "โป้ Blackcard 15/08/23");
  assert.equal(result.identity.resolution, "rename");
  assert.equal(result.historical_recognition.level, "black_card");
  assert.equal(result.historical_recognition.historical_blackcard_paid_confirmed, true);
  assert.equal(result.latest_membership_cycle.package_base, "premium");
  assert.equal(result.latest_membership_cycle.latest_signup_or_renewal, "2023-08-15");
  assert.equal(result.tenure.first_year_hint, 2022);
  assert.equal(result.tenure.relationship_years_approx, 4);
  assert.equal(result.canonical_current_state.lifecycle, "expired");
  assert.equal(result.canonical_current_state.rights.private_visibility_envelope, "none");
  assert.equal(result.conversation.strategy, "returning_high_value_expired");
  assert.equal(result.conversation.cta, "renew_premium");
});

test("SVIP recognition remains separate from Lite package base", () => {
  const result = reasonKenjiCustomerContext({
    rename: "เจ - SVIP - (Jjeune) 01/04/25",
    hashtags: ["#client", "#memjan24", "lite"],
    latest_cycle: {
      package_code: "standard_lite",
      expire_at: "2026-04-01T23:59:59+07:00",
    },
    entitlement_snapshot: snapshot({ inactive: ["private_standard", "svip"] }),
  }, { now: "2026-09-03T12:00:00Z" });

  assert.equal(result.historical_recognition.level, "svip");
  assert.equal(result.latest_membership_cycle.package_base, "standard_lite");
  assert.equal(result.conversation.cta, "renew_lite");
  assert.equal(result.canonical_current_state.rights.private_visibility_envelope, "none");
});

test("VIP recognition can coexist with an active 7 Days base", () => {
  const result = reasonKenjiCustomerContext({
    rename: "Kai VIP 01/09/26",
    hashtags: ["#client", "#memsep26", "7 Days"],
    latest_cycle: {
      package_code: "7_days",
      expire_at: "2026-09-08T23:59:59+07:00",
    },
    entitlement_snapshot: snapshot({ active: ["guest_pass"], envelope: "none" }),
  }, { now: "2026-09-03T12:00:00Z" });

  assert.equal(result.historical_recognition.level, "vip");
  assert.equal(result.latest_membership_cycle.package_base, "7_days");
  assert.equal(result.canonical_current_state.lifecycle, "active");
  assert.equal(result.canonical_current_state.rights.guest_pass_access, true);
  assert.equal(result.conversation.strategy, "active_member_continuation");
});

test("missing Rename is review-required even when secondary identifiers exist", () => {
  const result = reasonKenjiCustomerContext({
    line_user_id: "U00000000000000000000000000000000",
    email: "masked@example.invalid",
    latest_cycle: { package_code: "premium", expire_at: "2026-12-31T23:59:59Z" },
    entitlement_snapshot: snapshot({ active: ["private_premium"], envelope: "premium" }),
  }, { now: "2026-09-03T12:00:00Z" });

  assert.equal(result.identity.resolution, "review_required");
  assert.equal(result.review_required, true);
  assert.equal(result.conversation.strategy, "review_required");
  assert.equal(result.conversation.cta, "human_review");
});

test("missing canonical Resolver snapshot fails closed", () => {
  const result = reasonKenjiCustomerContext({
    rename: "Moss VIP 01/01/26",
    hashtags: ["#client", "#memjan26"],
    latest_cycle: { package_code: "premium", expire_at: "2026-12-31T23:59:59Z" },
  }, { now: "2026-09-03T12:00:00Z" });

  assert.equal(result.canonical_current_state.resolver_snapshot_valid, false);
  assert.equal(result.canonical_current_state.rights.public_service_access, false);
  assert.equal(result.canonical_current_state.rights.private_visibility_envelope, "none");
  assert.equal(result.conversation.cta, "human_review");
  assert.equal(result.review_required, true);
});

test("blocked Resolver state never produces a reactivation CTA", () => {
  const blocked = snapshot({ active: ["black_card"], envelope: "black_card", memberBlocked: true });
  const result = reasonKenjiCustomerContext({
    rename: "Beam Blackcard 01/01/26",
    latest_cycle: { package_code: "premium", expire_at: "2026-12-31T23:59:59Z" },
    entitlement_snapshot: blocked,
  }, { now: "2026-09-03T12:00:00Z" });

  assert.equal(result.canonical_current_state.member_blocked, true);
  assert.equal(result.canonical_current_state.rights.private_visibility_envelope, "none");
  assert.equal(result.conversation.strategy, "restricted_human_review");
  assert.equal(result.conversation.cta, "human_review");
});

test("legacy search connector has no demo fallback and fails closed when unconfigured", async () => {
  await assert.rejects(
    () => searchAirtable("member", [], {}),
    (error) => error?.status === 503 && error?.code === "UPSTREAM_UNAVAILABLE",
  );
});

test("Kenji reasoning route requires internal auth and returns read-only contract", async () => {
  const body = {
    actor: { role: "system" },
    customer_context: {
      rename: "Test Premium 01/09/26",
      latest_cycle: { package_code: "premium", expire_at: "2027-09-01T00:00:00Z" },
      entitlement_snapshot: snapshot({ active: ["private_premium"], envelope: "premium" }),
    },
  };

  const denied = await worker.fetch(new Request("https://ai-worker.local/v1/ai/kenji/customer-reasoning", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), { INTERNAL_TOKEN: "secret" });
  assert.equal(denied.status, 401);

  const allowed = await worker.fetch(new Request("https://ai-worker.local/v1/ai/kenji/customer-reasoning", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer secret" },
    body: JSON.stringify(body),
  }), { INTERNAL_TOKEN: "secret" });
  assert.equal(allowed.status, 200);
  const payload = await allowed.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.read_only, true);
  assert.equal(payload.data.canonical_current_state.authority, "my_mmd_entitlement_resolver_v1");
});
