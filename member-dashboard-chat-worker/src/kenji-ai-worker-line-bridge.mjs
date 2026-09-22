import {
  buildKenjiLineCanonicalContext,
  inferKenjiShadowIntent,
} from "./kenji-line-canonical-context-adapter.mjs";
import { buildKenjiLineConversationHistory } from "./kenji-line-conversation-history.mjs";
import { observeKenjiLineContextualUnderstandingShadow } from "./kenji-line-contextual-understanding-shadow.mjs";

const AI_MATRIX_URL = "https://ai-worker.local/v1/ai/kenji/conversation-matrix";
const BRIDGE_ENV = "KENJI_AI_WORKER_BRIDGE_ENABLED";
const CREW_SOURCE_IDS_ENV = "KENJI_LINE_CREW_SOURCE_IDS";
const MAX_EVENTS_PER_WEBHOOK = 50;
const SHADOW_OBSERVATION_CONCURRENCY = 4;

const EVIDENCE_SOURCE_UNAVAILABLE = "SOURCE_UNAVAILABLE";

function text(value) {
  return value == null ? "" : String(value).trim();
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

async function mapWithConcurrency(values, limit, mapper) {
  const items = Array.isArray(values) ? values : [];
  if (!items.length) return [];
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, Number(limit) || 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

function parseSourceIds(value) {
  return new Set(text(value).split(/[\s,]+/).map((item) => item.trim()).filter(Boolean));
}

function sourceType(event = {}) {
  const type = text(event?.source?.type).toLowerCase();
  return ["user", "group", "room"].includes(type) ? type : "unknown";
}

function sourceId(event = {}) {
  const type = sourceType(event);
  if (type === "group") return text(event?.source?.groupId);
  if (type === "room") return text(event?.source?.roomId);
  if (type === "user") return text(event?.source?.userId);
  return "";
}

function canonicalLineUserId(event = {}) {
  const value = text(event?.source?.userId);
  return /^U[0-9a-f]{32}$/i.test(value) ? value : "";
}

function messageType(event = {}) {
  return event?.type === "message" ? text(event?.message?.type).toLowerCase() || "unknown" : "none";
}

function unavailable(reason) {
  return { state: EVIDENCE_SOURCE_UNAVAILABLE, reason };
}

export function buildKenjiLineEvidenceContext(event = {}, env = {}) {
  const type = sourceType(event);
  const id = sourceId(event);
  const crewIds = parseSourceIds(env[CREW_SOURCE_IDS_ENV]);
  const currentCrewObserved = (type === "group" || type === "room") && Boolean(id) && crewIds.has(id);
  const currentOaObserved = type === "user" && Boolean(canonicalLineUserId(event));

  // A webhook event proves only that one current event reached the transport.
  // It does NOT prove that historical LINE OA or Crew history was searched.
  // Exhaustive evidence state therefore remains SOURCE_UNAVAILABLE until a
  // dedicated archive/backfill adapter reports FOUND or SEARCHED_NO_MATCH.
  const evidenceSources = {
    rename_identity: unavailable("rename_archive_not_wired"),
    line_oa_1to1: unavailable(currentOaObserved
      ? "current_oa_event_observed_historical_search_unavailable"
      : "oa_1to1_source_not_observed_or_searchable"),
    line_crew: unavailable(currentCrewObserved
      ? "current_crew_event_observed_historical_search_unavailable"
      : "crew_source_not_proven_or_not_allowlisted"),
    chat_exports_attachments: unavailable("chat_export_or_attachment_archive_not_wired"),
    hashtags_tenure: unavailable("historical_tag_source_not_wired"),
    recognition_history: unavailable("historical_recognition_source_not_wired"),
    membership_cycles: unavailable("canonical_membership_cycle_context_not_wired"),
    payment_evidence: unavailable("historical_payment_evidence_source_not_wired"),
    resolver_snapshot: unavailable("canonical_resolver_context_not_wired"),
  };

  return {
    line_user_id: canonicalLineUserId(event),
    evidence_sources: evidenceSources,
    current_line_event: {
      observed: true,
      source_type: type,
      crew_source_allowlisted: currentCrewObserved,
      event_type: text(event?.type).toLowerCase() || "unknown",
      message_type: messageType(event),
      redelivery: event?.deliveryContext?.isRedelivery === true,
    },
  };
}

function safeBridgeResult(overrides = {}) {
  return {
    ok: false,
    observed: false,
    reason: "bridge_unavailable",
    note_ready: false,
    evidence_incomplete: true,
    unavailable_source_count: 0,
    memory_used: false,
    identity_state: "unknown",
    matrix_version: 0,
    review_required: true,
    contextual_shadow_enabled: false,
    contextual_relation: "standalone",
    contextual_confidence: 0,
    contextual_referent_state: "not_needed",
    contextual_needs_clarification: false,
    contextual_analysis_source: "disabled",
    contextual_model_success: false,
    shadow_only: true,
    customer_copy_changed: false,
    ...overrides,
  };
}

export async function observeKenjiLineEvent({ env = {}, event = {}, contextBuilder = buildKenjiLineCanonicalContext } = {}) {
  if (!enabled(env[BRIDGE_ENV])) return safeBridgeResult({ reason: "bridge_disabled" });
  if (!env.AI_WORKER?.fetch) return safeBridgeResult({ reason: "ai_worker_binding_missing" });
  if (!event || typeof event !== "object" || event?.deliveryContext?.isRedelivery === true) {
    return safeBridgeResult({ reason: event?.deliveryContext?.isRedelivery === true ? "line_redelivery_skipped" : "invalid_event" });
  }

  let adapted;
  try {
    adapted = await contextBuilder({
      env,
      event,
      currentIntent: inferKenjiShadowIntent(event),
      now: new Date(),
    });
  } catch (_) {
    return safeBridgeResult({ observed: true, reason: "canonical_context_adapter_failed" });
  }
  if (adapted?.ok !== true || !adapted?.context_bundle || typeof adapted.context_bundle !== "object") {
    return safeBridgeResult({ observed: true, reason: "canonical_context_adapter_unavailable" });
  }

  let response;
  // This context is intentionally attached only to the internal AI Worker
  // request. It is not included in bridge telemetry or any customer-facing
  // response. The only outbound history admitted here is a record with actual
  // sent evidence; drafts and suggested copy are never treated as prior words.
  let conversationHistory;
  try {
    conversationHistory = await buildKenjiLineConversationHistory({ env, event });
  } catch (_) {
    conversationHistory = {
      enabled: false,
      available: false,
      turns: [],
      coverage: { customer_messages: 0, confirmed_assistant_messages: 0, reply_history_complete: false },
      reason: "conversation_history_unavailable",
    };
  }
  let contextualUnderstanding;
  try {
    contextualUnderstanding = await observeKenjiLineContextualUnderstandingShadow({
      env,
      history: conversationHistory,
      event,
    });
  } catch (_) {
    contextualUnderstanding = {
      enabled: true,
      schema: "mmd.kenji_line_contextual_understanding.v1",
      relation: "clarification_needed",
      topic_relation: "unclear",
      referent_state: "unresolved",
      needs_clarification: true,
      confidence: 0,
      analysis_source: "shadow_error",
      model_success: false,
      shadow_only: true,
      auto_send_allowed: false,
      customer_copy_changed: false,
    };
  }

  try {
    response = await env.AI_WORKER.fetch(new Request(AI_MATRIX_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
        "x-service-name": "member-dashboard-chat-worker",
      },
      body: JSON.stringify({
        actor: { role: "system" },
        context_bundle: {
          ...adapted.context_bundle,
          // Private service-binding input. It must not be copied into a
          // Matrix, event telemetry, response, or log.
          conversation_history_v1: conversationHistory,
          // Phase 2 is analysis-only. The structured semantic projection has
          // no customer reply field and cannot authorize any domain action.
          contextual_understanding_v1: contextualUnderstanding,
        },
      }),
    }));
  } catch (_) {
    return safeBridgeResult({ observed: true, reason: "ai_worker_request_failed" });
  }

  if (!response.ok) return safeBridgeResult({ observed: true, reason: `ai_worker_http_${response.status}` });
  const payload = await response.json().catch(() => null);
  const data = payload?.data;
  const evidence = data?.evidence;
  const safety = data?.safety;
  if (
    payload?.ok !== true ||
    data?.read_only !== true ||
    data?.schema_version !== "mmd.kenji_conversation_matrix.v1" ||
    safety?.memory_is_context_only !== true ||
    safety?.may_grant_entitlement !== false ||
    safety?.may_confirm_payment !== false ||
    safety?.may_confirm_booking_or_availability !== false ||
    !evidence
  ) {
    return safeBridgeResult({ observed: true, reason: "ai_worker_contract_rejected" });
  }

  const identityState = ["known", "unknown", "ambiguous", "review_required"].includes(text(data?.identity?.state))
    ? text(data.identity.state)
    : "review_required";
  const matrixVersion = Math.max(0, Number(data?.continuity_resolution?.matrix_version || adapted?.telemetry?.matrix_version) || 0);
  const unavailableSourceCount = Array.isArray(evidence.unavailable_sources) ? evidence.unavailable_sources.length : 0;

  return {
    ok: true,
    observed: true,
    reason: "ai_worker_matrix_shadow_recorded",
    note_ready: evidence.evidence_incomplete !== true,
    evidence_incomplete: evidence.evidence_incomplete === true,
    unavailable_source_count: unavailableSourceCount,
    memory_used: identityState === "known" && adapted?.telemetry?.memory_candidate === true,
    identity_state: identityState,
    matrix_version: matrixVersion,
    review_required: safety.review_required === true,
    conversation_turns_read: Array.isArray(conversationHistory?.turns) ? conversationHistory.turns.length : 0,
    confirmed_assistant_turns_read: Number(conversationHistory?.coverage?.confirmed_assistant_messages) || 0,
    reply_history_complete: conversationHistory?.coverage?.reply_history_complete === true,
    contextual_shadow_enabled: contextualUnderstanding?.enabled === true,
    contextual_relation: text(contextualUnderstanding?.relation) || "standalone",
    contextual_confidence: Math.max(0, Math.min(1, Number(contextualUnderstanding?.confidence) || 0)),
    contextual_referent_state: text(contextualUnderstanding?.referent_state) || "not_needed",
    contextual_needs_clarification: contextualUnderstanding?.needs_clarification === true,
    contextual_analysis_source: text(contextualUnderstanding?.analysis_source) || "unknown",
    contextual_model_success: contextualUnderstanding?.model_success === true,
    shadow_only: true,
    customer_copy_changed: false,
  };
}

export async function observeKenjiLineWebhook({ request, env = {}, contextBuilder = buildKenjiLineCanonicalContext } = {}) {
  if (!enabled(env[BRIDGE_ENV])) return { ok: true, enabled: false, events: 0, observed: 0 };
  if (!request || request.method !== "POST") return { ok: true, enabled: true, events: 0, observed: 0 };

  const path = new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
  if (!["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"].includes(path)) {
    return { ok: true, enabled: true, events: 0, observed: 0 };
  }

  const body = await request.json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS_PER_WEBHOOK) : [];
  const results = await mapWithConcurrency(events, SHADOW_OBSERVATION_CONCURRENCY, (event) => (
    observeKenjiLineEvent({ env, event, contextBuilder })
  ));

  // Telemetry is deliberately aggregate only: no message text, LINE IDs,
  // reply tokens, source IDs, or customer identifiers leave this function.
  const observed = results.filter((item) => item.observed).length;
  const succeeded = results.filter((item) => item.ok).length;
  const incomplete = results.filter((item) => item.evidence_incomplete).length;
  const identityStates = [...new Set(results.map((item) => item.identity_state).filter(Boolean))];
  const contextualRelations = [...new Set(results
    .filter((item) => item.contextual_shadow_enabled)
    .map((item) => item.contextual_relation)
    .filter(Boolean))];
  return {
    ok: succeeded === results.length,
    enabled: true,
    events: events.length,
    observed,
    succeeded,
    evidence_incomplete: incomplete,
    memory_used: results.filter((item) => item.memory_used).length,
    identity_state: identityStates.length === 1 ? identityStates[0] : identityStates.length ? "mixed" : "unknown",
    matrix_version: Math.max(0, ...results.map((item) => Number(item.matrix_version) || 0)),
    review_required: results.filter((item) => item.review_required).length,
    contextual_shadow_observed: results.filter((item) => item.contextual_shadow_enabled).length,
    contextual_model_success: results.filter((item) => item.contextual_model_success).length,
    contextual_clarification_required: results.filter((item) => item.contextual_needs_clarification).length,
    contextual_relations: contextualRelations,
    shadow_only: true,
    customer_copy_changed: false,
  };
}

export const KENJI_AI_WORKER_LINE_BRIDGE_INTERNALS = Object.freeze({
  BRIDGE_ENV,
  CREW_SOURCE_IDS_ENV,
  AI_MATRIX_URL,
  EVIDENCE_SOURCE_UNAVAILABLE,
  SHADOW_OBSERVATION_CONCURRENCY,
  mapWithConcurrency,
});
