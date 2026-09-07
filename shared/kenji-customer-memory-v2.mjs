import { buildKenjiMemorySnapshot, buildKenjiSafeContext } from "./kenji-member-memory-snapshot.mjs";
import { buildConversationContinuityContext } from "./kenji-conversation-matrix.mjs";

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRelationship(input = {}) {
  const explicit = text(input.relationship_context).toLowerCase();
  if (explicit) return explicit;

  const tier = text(input.membership_package || input.package_code).toLowerCase();
  const status = text(input.membership_status || input.member_status || input.access_status).toLowerCase();
  const known = Boolean(input.client_record_id || input.known_customer || input.service_history_summary);
  const verified = Boolean(input.verified_public_member || input.verification_status === "verified");

  if (/svip/.test(tier)) return "svip_relationship";
  if (/black/.test(tier)) return "blackcard_relationship";
  if (/vip/.test(tier)) return "vip_relationship";
  if (/active|current|grace/.test(status)) return "active_member";
  if (/expired|inactive/.test(status)) return "expired_member";
  if (verified) return "verified_public_member";
  if (known) return "known_customer";
  return "new_contact";
}

export function buildCustomerMemorySnapshotV2(input = {}) {
  const compatV1 = input.compat_v1 || buildKenjiMemorySnapshot(input);
  const matrix = input.conversation_matrix || {};
  const relationshipContext = normalizeRelationship({
    relationship_context: input.relationship_context || matrix.relationship_context,
    membership_package: compatV1.membership_package,
    membership_status: compatV1.membership_status,
    client_record_id: compatV1.client_record_id,
    service_history_summary: compatV1.service_history_summary,
    verification_status: input.verification_status,
    verified_public_member: input.verified_public_member,
  });

  return {
    schema: "mmd.customer_memory_snapshot.v2",
    compat_schema: text(compatV1.schema || "mmd.kenji_memory_snapshot.v1"),
    client_record_id: text(compatV1.client_record_id),
    display_name_for_kenji: text(compatV1.display_name_for_kenji),
    mmd_client_name: text(compatV1.mmd_client_name),
    client_id_display: text(compatV1.client_id_display),
    client_id_canonical: text(compatV1.client_id_canonical),
    identity_status: text(input.identity_status || (compatV1.client_record_id ? "resolved" : "candidate")),
    verification_status: text(input.verification_status || "unknown"),
    relationship_context: relationshipContext,
    membership_package_observed: text(compatV1.membership_package),
    membership_status_observed: text(compatV1.membership_status),
    membership_expiry_observed: text(compatV1.membership_expiry),
    points_balance_confirmed_observed: number(compatV1.points_balance_confirmed, 0),
    service_history_summary: text(compatV1.service_history_summary),
    preference_summary: text(compatV1.client_preference_summary || input.client_preference_summary),
    kenji_handling_note: text(compatV1.kenji_handling_note),
    conversation: buildConversationContinuityContext(matrix),
    authority_guard: {
      memory_is_not_current_truth: true,
      live_truth_wins_over_memory: true,
      refresh_before_customer_reply_for: [
        "membership",
        "entitlement",
        "points",
        "payment",
        "booking",
        "model_visibility",
        "availability",
        "pricing",
      ],
      hide_raw_notes_from_customer: true,
      hide_risk_notes_from_customer: true,
      svip_is_per_only_manual_decision: true,
    },
    source_refs: {
      compat_v1_updated_at: text(compatV1.updated_at),
      matrix_id: text(matrix.matrix_id),
      last_event_id: text(matrix.last_event_id),
    },
    last_truth_status: text(input.last_truth_status || "fresh"),
    last_truth_refresh_at: text(input.last_truth_refresh_at || new Date().toISOString()),
    snapshot_status: text(input.snapshot_status || "active"),
    version: Number.isFinite(Number(input.version)) ? Number(input.version) : 2,
    updated_at: new Date().toISOString(),
  };
}

export function buildKenjiSafeContextV2(snapshotV2 = {}, compatV1 = {}) {
  const legacySafe = buildKenjiSafeContext(compatV1);
  return {
    ...legacySafe,
    memory_schema: text(snapshotV2.schema),
    relationship_context: text(snapshotV2.relationship_context),
    verification_status: text(snapshotV2.verification_status),
    conversation: snapshotV2.conversation || {},
    live_truth_required: Boolean(snapshotV2.conversation?.live_truth_required),
    live_truth_domains: Array.isArray(snapshotV2.conversation?.live_truth_domains)
      ? snapshotV2.conversation.live_truth_domains
      : [],
    memory_authority_guard: snapshotV2.authority_guard || {},
  };
}
