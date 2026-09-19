import assert from "node:assert/strict";
import {
  buildCustomerVisibleProfile,
  buildKenjiMemorySnapshot,
  buildKenjiSafeContext,
  buildMmdClientId,
  canMaterializeFromTrigger,
  parseLatestSignupFromRenamedName,
} from "./kenji-member-memory-snapshot.mjs";

const legalId = buildMmdClientId({ nickname: "Jay", first_name: "Somchai", last_name: "Tanawat" });
assert.equal(legalId.client_id_display, "Jay St");
assert.equal(legalId.client_id_canonical, "jayst");
assert.equal(legalId.suffix_type, "legal_initials");
assert.equal(legalId.client_id_confidence, "high");

const premiumHidden = buildMmdClientId({ nickname: "Jay", hidden_name: true, package_code: "premium" });
assert.equal(premiumHidden.client_id_display, "Jay Pm");
assert.equal(premiumHidden.client_id_canonical, "jaypm");
assert.equal(premiumHidden.suffix_type, "package_fallback");

const blackCardHidden = buildMmdClientId({ nickname: "Jay", hidden_name: true, package_code: "black_card" });
assert.equal(blackCardHidden.client_id_display, "Jay Bc");

const parsedRename = parseLatestSignupFromRenamedName("Jay Pm 24/06/26");
assert.equal(parsedRename.membership_cycle_start_at, "2026-06-24");
assert.equal(parsedRename.latest_signup_date_raw, "24/06/26");

const snapshot = buildKenjiMemorySnapshot({
  client: {
    id: "recClient",
    mmd_client_name: "เจย์",
    username: "jaypm",
    suffix_code: "Pm",
    line_user_id: "U1234567890abcdef",
    points_balance: 128,
  },
  entitlement: {
    package_code: "premium",
    member_status: "active",
    expire_at: "2027-06-24",
  },
  legacy: {
    proposed_points: 42,
    service_history_summary: "Legacy service usage is staged only.",
  },
  conversation: {
    summary: "Asked for points and renewal in LINE.",
  },
});

assert.equal(snapshot.display_name_for_kenji, "เจย์");
assert.equal(snapshot.client_id_canonical, "jaypm");
assert.equal(snapshot.points_balance_confirmed, 128);
assert.equal(snapshot.points_pending_review, 42);
assert.equal(snapshot.internal_visibility_guard.hide_ban_status_from_customer, true);
assert.equal(snapshot.internal_visibility_guard.use_confirmed_points_only_for_customer, true);

const customerProfile = buildCustomerVisibleProfile(snapshot);
assert.equal(customerProfile.points_balance, 128);
assert.equal(customerProfile.points_pending_review, undefined);
assert.equal(customerProfile.client_id_display, "jaypm");

const kenjiContext = buildKenjiSafeContext(snapshot);
assert.equal(kenjiContext.display_name, "เจย์");
assert.equal(kenjiContext.active_points, 128);
assert.equal(kenjiContext.tier, "Premium");

assert.equal(canMaterializeFromTrigger("renewal_verified"), true);
assert.equal(canMaterializeFromTrigger("liff_identity_linked"), false);

console.log("kenji member memory snapshot tests passed");
