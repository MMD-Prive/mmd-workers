import { resolveMemberEntitlements } from "../../../auth-worker/src/member-entitlement-resolver.js";

export function buildKenjiEntitlementSnapshot(records = [], options = {}) {
  return resolveMemberEntitlements(records, options);
}

export function projectKenjiAccess(snapshot = {}) {
  const access = snapshot?.access || {};
  const state = snapshot?.capability_state || {};
  return {
    schema_version: snapshot?.schema_version || "my_mmd_entitlement_resolver_v1",
    fail_closed: snapshot?.fail_closed !== false,
    member_blocked: Boolean(snapshot?.member_blocked),
    active_capabilities: Array.isArray(state.active) ? state.active : [],
    grace_capabilities: Array.isArray(state.grace) ? state.grace : [],
    public_service_access: Boolean(access.public_service_access),
    guest_pass_access: Boolean(access.guest_pass_access),
    red_card_request_lane: Boolean(access.red_card_request_lane),
    private_visibility_envelope: String(access.private_visibility_envelope || "none"),
    protected_allowlist_required: Boolean(access.protected_allowlist_required),
    protected_capabilities_active: Array.isArray(access.protected_capabilities_active) ? access.protected_capabilities_active : [],
    protected_capabilities_grace: Array.isArray(access.protected_capabilities_grace) ? access.protected_capabilities_grace : [],
    new_protected_grants_allowed: Boolean(access.new_protected_grants_allowed),
    new_drive_grants_allowed: Boolean(access.new_drive_grants_allowed),
    new_telegram_grants_allowed: Boolean(access.new_telegram_grants_allowed),
    existing_grants_may_continue_in_grace: Boolean(access.existing_grants_may_continue_in_grace),
  };
}

export function canKenjiRevealPrivateModels(snapshot = {}) {
  const access = projectKenjiAccess(snapshot);
  return !access.member_blocked && access.private_visibility_envelope !== "none";
}

export function canKenjiUseProtectedLane(snapshot = {}) {
  const access = projectKenjiAccess(snapshot);
  return !access.member_blocked && access.protected_capabilities_active.length > 0;
}
