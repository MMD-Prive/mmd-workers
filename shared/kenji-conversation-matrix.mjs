const STAGES = Object.freeze(new Set([
  "new_topic",
  "in_progress",
  "awaiting_customer",
  "awaiting_per",
  "awaiting_review",
  "awaiting_payment_verification",
  "awaiting_entitlement_refresh",
  "handoff",
  "resolved",
  "stale_needs_refresh",
]));

const RELATIONSHIP_CONTEXTS = Object.freeze(new Set([
  "unknown",
  "new_contact",
  "verified_public_member",
  "known_customer",
  "repeat_customer",
  "active_member",
  "expired_member",
  "private_access_verified",
  "vip_relationship",
  "svip_relationship",
  "blackcard_relationship",
]));

const LIVE_TRUTH_DOMAINS = Object.freeze(new Set([
  "membership",
  "entitlement",
  "points",
  "payment",
  "booking",
  "model_visibility",
  "availability",
  "pricing",
]));

const PROTECTED_INTENT_DOMAINS = Object.freeze({
  payment_slip: ["payment"],
  payment_status: ["payment"],
  payment_dispute: ["payment"],
  membership: ["membership", "entitlement"],
  membership_status: ["membership", "entitlement"],
  renewal: ["membership", "entitlement", "payment"],
  points: ["points"],
  points_status: ["points"],
  vip: ["entitlement"],
  svip: ["entitlement"],
  black_card: ["entitlement"],
  availability_request: ["availability", "booking"],
  pricing_review: ["pricing"],
  model_access_verification: ["model_visibility", "entitlement"],
});

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function jsonArray(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(text).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = text(value).toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function boundedText(value, max = 1200) {
  return text(value).slice(0, max);
}

export function inferLiveTruthDomains(intent = "", explicitDomains = []) {
  const domains = new Set(jsonArray(explicitDomains));
  for (const domain of PROTECTED_INTENT_DOMAINS[text(intent).toLowerCase()] || []) domains.add(domain);
  return [...domains].filter((domain) => LIVE_TRUTH_DOMAINS.has(domain));
}

export function buildConversationMatrixV1(input = {}) {
  const intent = text(input.last_customer_intent || input.intent);
  const liveTruthDomains = inferLiveTruthDomains(intent, input.live_truth_domains);
  const stage = normalizeEnum(input.conversation_stage, STAGES, intent ? "in_progress" : "new_topic");
  const relationship = normalizeEnum(input.relationship_context, RELATIONSHIP_CONTEXTS, "unknown");
  const now = text(input.state_updated_at || input.updated_at) || new Date().toISOString();

  return {
    schema: "mmd.kenji_conversation_matrix.v1",
    matrix_id: text(input.matrix_id),
    client_record_id: text(input.client_record_id),
    conversation_id_hash: text(input.conversation_id_hash),
    channel: text(input.channel || "unknown") || "unknown",
    conversation_scope: text(input.conversation_scope),
    topic: boundedText(input.topic, 160),
    subtopic: boundedText(input.subtopic, 160),
    relationship_context: relationship,
    last_customer_intent: intent,
    last_customer_request: boundedText(input.last_customer_request, 600),
    last_customer_action: boundedText(input.last_customer_action, 160),
    last_kenji_action: boundedText(input.last_kenji_action, 160),
    last_confirmed_outcome: boundedText(input.last_confirmed_outcome, 600),
    conversation_stage: stage,
    awaiting_from: text(input.awaiting_from || "none") || "none",
    pending_action: boundedText(input.pending_action, 220),
    pending_reference: boundedText(input.pending_reference, 180),
    continuity_summary: boundedText(input.continuity_summary, 1200),
    do_not_ask_again: jsonArray(input.do_not_ask_again ?? input.do_not_ask_again_json),
    important_open_loops: jsonArray(input.important_open_loops ?? input.important_open_loops_json),
    handoff_required: Boolean(input.handoff_required),
    handoff_owner: text(input.handoff_owner || "none") || "none",
    handoff_reason: boundedText(input.handoff_reason, 600),
    live_truth_required: Boolean(input.live_truth_required || liveTruthDomains.length),
    live_truth_domains: liveTruthDomains,
    last_event_id: text(input.last_event_id),
    last_interaction_at: text(input.last_interaction_at),
    state_updated_at: now,
    state_expires_at: text(input.state_expires_at),
    matrix_status: text(input.matrix_status || "active") || "active",
    version: Number.isFinite(Number(input.version)) ? Number(input.version) : 1,
  };
}

export function buildConversationContinuityContext(matrix = {}) {
  return {
    conversation_topic: text(matrix.topic),
    conversation_subtopic: text(matrix.subtopic),
    relationship_context: text(matrix.relationship_context || "unknown"),
    conversation_stage: text(matrix.conversation_stage || "new_topic"),
    last_customer_intent: text(matrix.last_customer_intent),
    last_customer_request: text(matrix.last_customer_request),
    last_customer_action: text(matrix.last_customer_action),
    last_kenji_action: text(matrix.last_kenji_action),
    last_confirmed_outcome: text(matrix.last_confirmed_outcome),
    awaiting_from: text(matrix.awaiting_from || "none"),
    pending_action: text(matrix.pending_action),
    pending_reference: text(matrix.pending_reference),
    continuity_summary: text(matrix.continuity_summary),
    do_not_ask_again: jsonArray(matrix.do_not_ask_again ?? matrix.do_not_ask_again_json),
    important_open_loops: jsonArray(matrix.important_open_loops ?? matrix.important_open_loops_json),
    handoff_required: Boolean(matrix.handoff_required),
    handoff_owner: text(matrix.handoff_owner || "none"),
    handoff_reason: text(matrix.handoff_reason),
    live_truth_required: Boolean(matrix.live_truth_required),
    live_truth_domains: jsonArray(matrix.live_truth_domains),
    matrix_version: Number.isFinite(Number(matrix.version)) ? Number(matrix.version) : 1,
  };
}

export function isContinuationCandidate(message = "", matrix = {}) {
  const normalized = text(message).toLowerCase();
  if (!normalized || !text(matrix.topic)) return false;
  if (["resolved", "stale_needs_refresh"].includes(text(matrix.conversation_stage))) return false;
  if (/^(ได้ยัง|ถึงไหน|โอเคยัง|เรียบร้อยยัง|เป็นไง|ยังครับ|ยังคะ|ยังค่ะ|update|status|done yet)/i.test(normalized)) return true;
  return Boolean(text(matrix.pending_action) || jsonArray(matrix.important_open_loops).length);
}

export { STAGES, RELATIONSHIP_CONTEXTS, LIVE_TRUTH_DOMAINS, PROTECTED_INTENT_DOMAINS };
