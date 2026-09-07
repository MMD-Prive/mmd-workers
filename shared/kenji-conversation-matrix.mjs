export const CONVERSATION_MATRIX_SCHEMA = "mmd.kenji_conversation_matrix.v1";
export const CONTINUITY_RESOLVER_SCHEMA = "mmd.kenji_continuity_resolver.v1";

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
  membership_renewal: ["membership", "entitlement", "payment"],
  points: ["points"],
  points_status: ["points"],
  vip: ["entitlement"],
  svip: ["entitlement"],
  black_card: ["entitlement"],
  availability_request: ["availability", "booking"],
  model_availability: ["availability", "booking"],
  create_session: ["booking"],
  booking: ["booking"],
  pricing: ["pricing"],
  pricing_review: ["pricing"],
  ask_where_to_get_rate: ["pricing"],
  model_access_verification: ["model_visibility", "entitlement"],
});

const CONTINUATION_CUE_RE = /^(?:ได้ยัง(?:ครับ|คะ|ค่ะ)?|ถึงไหน(?:แล้ว)?|โอเคยัง|เรียบร้อยยัง|เป็นไง(?:บ้าง)?|ยัง(?:ครับ|คะ|ค่ะ)?|แล้ว(?:ครับ|คะ|ค่ะ)?|มีอัปเดตไหม|อัปเดตหน่อย|update|status|done yet|any update)\b/i;
const NEW_TOPIC_CUE_RE = /(?:^|\s)(?:อีกเรื่อง|เปลี่ยนเรื่อง|เรื่องใหม่|ถามอีกอย่าง|ถามเรื่องอื่น|new topic|another question|different topic)(?:\s|$)/i;

const INTENT_TOPIC = Object.freeze({
  payment_slip: "payment",
  payment_status: "payment",
  payment_dispute: "payment",
  membership: "membership",
  membership_status: "membership",
  renewal: "membership",
  membership_renewal: "membership",
  points: "points",
  points_status: "points",
  vip: "membership",
  svip: "membership",
  black_card: "membership",
  create_session: "booking",
  booking: "booking",
  availability_request: "booking",
  model_availability: "booking",
  pricing: "pricing",
  pricing_review: "pricing",
  ask_where_to_get_rate: "pricing",
  model_access_verification: "model_access",
  private_talent: "model_access",
  aftercare: "aftercare",
  support: "support",
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
  return text(value).replace(/\s+/g, " ").slice(0, max);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseTime(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function inferTopicFromIntent(intent = "") {
  return INTENT_TOPIC[text(intent).toLowerCase()] || "";
}

function matrixExpired(matrix, now) {
  const expires = parseTime(matrix?.state_expires_at);
  const nowMs = parseTime(now);
  return expires !== null && nowMs !== null && nowMs > expires;
}

function isOpenStage(stage) {
  return !["resolved", "stale_needs_refresh"].includes(text(stage));
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
    schema: CONVERSATION_MATRIX_SCHEMA,
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

export function resolveConversationContinuityV1(input = {}) {
  const now = text(input.now) || new Date().toISOString();
  const matrix = buildConversationMatrixV1(input.matrix || {});
  const message = boundedText(input.message, 600);
  const currentIntent = text(input.current_intent || input.intent).toLowerCase();
  const previousIntent = text(matrix.last_customer_intent).toLowerCase();
  const priorTopic = text(matrix.topic) || inferTopicFromIntent(previousIntent);
  const inferredCurrentTopic = inferTopicFromIntent(currentIntent);
  const currentTopic = boundedText(input.current_topic || inferredCurrentTopic, 160);
  const currentSubtopic = boundedText(input.current_subtopic, 160);
  const openLoops = jsonArray(matrix.important_open_loops);
  const doNotAskAgain = jsonArray(matrix.do_not_ask_again);
  const openState = isOpenStage(matrix.conversation_stage) && Boolean(priorTopic || matrix.pending_action || openLoops.length);
  const expired = matrixExpired(matrix, now) || matrix.matrix_status === "stale";
  const explicitNewTopic = input.explicit_new_topic === true || NEW_TOPIC_CUE_RE.test(message);
  const continuationCue = CONTINUATION_CUE_RE.test(message);
  const sameTopic = Boolean(currentTopic && priorTopic && currentTopic === priorTopic);
  const differentTopic = Boolean(currentTopic && priorTopic && currentTopic !== priorTopic);
  const sameIntent = Boolean(currentIntent && previousIntent && currentIntent === previousIntent);

  let decision = "new_topic";
  let confidence = 0.9;
  let reason = "no_open_thread";
  let inheritPreviousContext = false;
  let requiresStateRefresh = false;

  if (expired) {
    decision = "stale_refresh";
    confidence = 0.99;
    reason = "matrix_expired_or_stale";
    requiresStateRefresh = true;
  } else if (explicitNewTopic) {
    decision = "new_topic";
    confidence = 0.99;
    reason = "explicit_new_topic_signal";
  } else if (openState && continuationCue) {
    decision = "continuation";
    confidence = 0.99;
    reason = "continuation_cue_with_open_thread";
    inheritPreviousContext = true;
  } else if (openState && (sameTopic || sameIntent)) {
    decision = "continuation";
    confidence = 0.94;
    reason = sameTopic ? "same_topic_open_thread" : "same_intent_open_thread";
    inheritPreviousContext = true;
  } else if (openState && differentTopic) {
    decision = "new_topic";
    confidence = 0.96;
    reason = "strong_topic_switch";
  } else if (openState && !currentTopic && (matrix.pending_action || openLoops.length)) {
    decision = "ambiguous";
    confidence = 0.62;
    reason = "open_thread_but_message_not_specific_enough";
    inheritPreviousContext = false;
  }

  const resolvedTopic = decision === "continuation"
    ? priorTopic
    : currentTopic || (decision === "stale_refresh" ? priorTopic : "");
  const resolvedSubtopic = decision === "continuation" ? text(matrix.subtopic) : currentSubtopic;
  const truthDomains = unique([
    ...jsonArray(matrix.live_truth_domains),
    ...inferLiveTruthDomains(previousIntent),
    ...inferLiveTruthDomains(currentIntent),
  ]).filter((domain) => LIVE_TRUTH_DOMAINS.has(domain));

  return {
    schema: CONTINUITY_RESOLVER_SCHEMA,
    evaluated_at: now,
    decision,
    confidence,
    reason,
    inherit_previous_context: inheritPreviousContext,
    topic: resolvedTopic,
    subtopic: resolvedSubtopic,
    previous_intent: previousIntent,
    current_intent: currentIntent,
    conversation_stage: decision === "stale_refresh"
      ? "stale_needs_refresh"
      : decision === "continuation"
        ? matrix.conversation_stage
        : "new_topic",
    awaiting_from: decision === "continuation" ? matrix.awaiting_from : "none",
    pending_action: decision === "continuation" ? matrix.pending_action : "",
    pending_reference: decision === "continuation" ? matrix.pending_reference : "",
    do_not_ask_again: decision === "continuation" ? doNotAskAgain : [],
    important_open_loops: decision === "continuation" || decision === "stale_refresh" ? openLoops : [],
    live_truth_required: Boolean(truthDomains.length || matrix.live_truth_required),
    live_truth_domains: truthDomains,
    requires_state_refresh: requiresStateRefresh,
    matrix_version: matrix.version,
  };
}

export function isContinuationCandidate(message = "", matrix = {}) {
  return resolveConversationContinuityV1({ message, matrix }).decision === "continuation";
}

export {
  STAGES,
  RELATIONSHIP_CONTEXTS,
  LIVE_TRUTH_DOMAINS,
  PROTECTED_INTENT_DOMAINS,
  INTENT_TOPIC,
};
