import { resolveConversationContinuityV1 } from "./kenji-conversation-matrix.mjs";

export const CONVERSATION_MATRIX_SCHEMA = "mmd.kenji_conversation_matrix.v1";
export const CONVERSATION_MATRIX_POLICY = "kenji_customer_memory_v1";
export const CONVERSATION_POLICY_ENGINE = "shared_canonical_v1";

const IDENTITY_STATES = new Set(["known", "unknown", "ambiguous", "review_required"]);
const IDENTITY_CONFIDENCE = new Set(["high", "medium", "low", "unknown"]);
const REVIEWED_EVIDENCE_STATES = new Set(["approved", "reviewed", "verified", "materialized"]);
const PRIVATE_EVIDENCE_LEVELS = new Set(["sensitive", "restricted", "private_internal", "secret"]);
const PROTECTED_INTENTS = new Set([
  "payment_slip",
  "payment_status",
  "payment_dispute",
  "availability_request",
  "pricing_review",
  "internal_access",
  "membership",
  "membership_status",
  "renewal",
  "points",
  "points_status",
  "vip",
  "svip",
  "black_card",
  "model_access_verification",
]);
const ALLOWED_LIVE_STATE_AUTHORITIES = new Set([
  "payments-worker",
  "events-worker",
  "member-pages-worker",
  "admin-worker",
  "my_mmd_entitlement_resolver_v1",
]);
const MAX_CURRENT_STATE_AGE_MS = 10 * 60 * 1000;
const MAX_CONTINUITY_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function token(value) {
  return text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeRef(value) {
  const candidate = text(value);
  if (!candidate || candidate.length > 120) return "";
  if (!/^[A-Za-z0-9._:-]+$/.test(candidate)) return "";
  if (/^(?:U[0-9a-f]{20,}|Bearer|sk-|eyJ)/i.test(candidate)) return "";
  return candidate;
}

function safeSnippet(value, max = 220) {
  const candidate = text(value).replace(/\s+/g, " ").slice(0, max);
  if (!candidate) return "";
  if (/(?:authorization|bearer\s+|password|passwd|secret|access[_ -]?token|refresh[_ -]?token|session[_ -]?cookie|sk-[A-Za-z0-9_-]{8,})/i.test(candidate)) {
    return "";
  }
  return candidate;
}

function parseTime(value) {
  const candidate = text(value);
  if (!candidate) return null;
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

function isStale(value, nowMs, maxAgeMs) {
  const parsed = parseTime(value);
  if (parsed === null) return false;
  return parsed > nowMs + 60_000 || nowMs - parsed > maxAgeMs;
}

function anonymousReasoning(rightsAuthority) {
  return {
    review_required: false,
    identity: { resolution: "unknown", primary_reference: "" },
    evidence_discovery: { note_ready: false, evidence_incomplete: false, unavailable_sources: [] },
    tenure: {},
    historical_recognition: { signals: [], level: "none" },
    canonical_current_state: {
      authority: rightsAuthority,
      resolver_snapshot_valid: false,
      lifecycle: "unknown",
      member_blocked: false,
      rights: {},
    },
    conversation: {
      strategy: "anonymous_or_unknown",
      acknowledge_history_and_tenure: false,
      exhaustive_note_ready: false,
      cta: "generic_safe_routing",
    },
    warnings: [],
  };
}

function normalizeIdentity(bundle, reasoning) {
  const source = object(bundle.identity);
  const explicitState = token(source.state || bundle.identity_state);
  let state = IDENTITY_STATES.has(explicitState) ? explicitState : "unknown";

  if (state === "known" && reasoning?.identity?.resolution !== "rename") state = "review_required";

  const explicitConfidence = token(source.confidence);
  const confidence = IDENTITY_CONFIDENCE.has(explicitConfidence)
    ? explicitConfidence
    : state === "known"
      ? "medium"
      : "unknown";

  return {
    state,
    canonical_client_ref: state === "known" ? safeRef(source.canonical_client_ref) : "",
    preferred_name: state === "known"
      ? safeSnippet(source.preferred_name || reasoning?.identity?.primary_reference, 100)
      : "",
    confidence,
    source: token(source.source || "canonical_identity"),
  };
}

function reviewedPreferenceEvidence(bundle) {
  const candidates = [
    ...list(bundle.reviewed_preferences),
    ...list(bundle.relationship_evidence),
    ...list(bundle.client_intelligence_evidence),
  ];
  const output = [];

  for (const raw of candidates) {
    const item = object(raw);
    const reviewStatus = token(item.review_status || item.status);
    if (!REVIEWED_EVIDENCE_STATES.has(reviewStatus)) continue;
    if (PRIVATE_EVIDENCE_LEVELS.has(token(item.privacy_level))) continue;

    const evidenceType = token(item.evidence_type || item.type || "preference");
    if (!evidenceType || /(?:credential|token|payment_artifact|private_note|application_answer)/.test(evidenceType)) continue;

    const summary = safeSnippet(
      item.normalized_summary || item.customer_safe_summary || item.summary || item.preference,
      180,
    );
    if (!summary) continue;

    output.push({
      type: evidenceType,
      summary,
      strength: token(item.preference_strength || item.strength || ""),
      source_ref: safeRef(item.evidence_id || item.source_ref || ""),
    });
    if (output.length >= 8) break;
  }

  return output;
}

function safeModelTouches(bundle) {
  const candidates = [...list(bundle.prior_model_touches), ...list(bundle.model_touches)];
  const output = [];
  for (const raw of candidates) {
    const item = typeof raw === "string" ? { model_key: raw } : object(raw);
    const modelKey = safeRef(item.model_key || item.model_ref || item.key);
    if (!modelKey) continue;
    const lastSeen = parseTime(item.last_seen_at);
    output.push({
      model_key: modelKey,
      relationship: token(item.relationship || item.touch_type || ""),
      last_seen_at: lastSeen === null ? "" : new Date(lastSeen).toISOString(),
    });
    if (output.length >= 6) break;
  }
  return output;
}

function relationshipFrom(bundle, reasoning) {
  const preferences = reviewedPreferenceEvidence(bundle);
  const modelTouches = safeModelTouches(bundle);
  const recognition = reasoning?.historical_recognition || {};
  const tenure = reasoning?.tenure || {};
  const recognitionHistory = unique(list(recognition.signals).map(token)).slice(0, 6);
  const returningCustomer = Boolean(
    reasoning?.conversation?.acknowledge_history_and_tenure || preferences.length || modelTouches.length,
  );

  return {
    returning_customer: returningCustomer,
    recognition_history: recognitionHistory,
    tenure_summary: {
      membership_cycles_observed: Number(tenure.membership_cycles_observed) || 0,
      first_year_hint: Number(tenure.first_year_hint) || null,
      relationship_years_approx: Number.isFinite(Number(tenure.relationship_years_approx))
        ? Number(tenure.relationship_years_approx)
        : null,
    },
    prior_model_touches: modelTouches,
    reviewed_preferences: preferences,
  };
}

function capabilitiesFromRights(rights = {}) {
  const output = [];
  if (rights.public_service_access === true) output.push("public_service_access");
  if (rights.guest_pass_access === true) output.push("guest_pass_access");
  if (rights.red_card_request_lane === true) output.push("red_card_request_lane");
  const envelope = token(rights.private_visibility_envelope);
  if (envelope && envelope !== "none") output.push(`private_visibility:${envelope}`);
  for (const capability of list(rights.protected_capabilities_active).map(token)) {
    if (capability) output.push(`protected:${capability}`);
  }
  if (rights.new_model_reveals_allowed === true) output.push("new_model_reveals_allowed");
  return unique(output);
}

function safeLiveState(bundle, nowMs) {
  const live = object(bundle.live_state);
  const authority = text(live.authority);
  const canonical = live.canonical === true && ALLOWED_LIVE_STATE_AUTHORITIES.has(authority);
  const stale = isStale(live.evaluated_at, nowMs, MAX_CURRENT_STATE_AGE_MS);
  if (!canonical || stale) {
    return {
      available: false,
      authority: canonical ? authority : "",
      evaluated_at: parseTime(live.evaluated_at) === null ? "" : new Date(parseTime(live.evaluated_at)).toISOString(),
      states: {},
    };
  }

  const states = {};
  for (const key of ["booking_status", "session_status", "payment_status", "availability_status", "request_status"]) {
    const value = token(live[key]);
    if (value) states[key] = value;
  }
  return {
    available: true,
    authority,
    evaluated_at: parseTime(live.evaluated_at) === null ? "" : new Date(parseTime(live.evaluated_at)).toISOString(),
    states,
  };
}

function currentStateFrom(bundle, reasoning, nowMs, rightsAuthority) {
  const snapshot = object(object(bundle.customer_context).entitlement_snapshot);
  const snapshotEvaluatedAt = text(bundle.current_state_evaluated_at || snapshot.evaluated_at || snapshot.resolved_at);
  const stale = isStale(snapshotEvaluatedAt, nowMs, MAX_CURRENT_STATE_AGE_MS);
  const canonical = reasoning?.canonical_current_state || {};
  const resolverValid = canonical.resolver_snapshot_valid === true && !stale;
  const live = safeLiveState(bundle, nowMs);

  return {
    rights_authority: rightsAuthority,
    resolver_snapshot_valid: resolverValid,
    lifecycle: resolverValid ? token(canonical.lifecycle || "unknown") : "unknown",
    capabilities: resolverValid ? capabilitiesFromRights(canonical.rights) : [],
    open_thread_state: live.states,
    live_state_authority: live.authority,
    evaluated_at: snapshotEvaluatedAt && parseTime(snapshotEvaluatedAt) !== null
      ? new Date(parseTime(snapshotEvaluatedAt)).toISOString()
      : "",
    stale,
  };
}

function safeUnresolvedThreads(value) {
  const output = [];
  for (const raw of list(value)) {
    const item = object(raw);
    const type = token(item.type || item.intent || item.topic);
    if (!type) continue;
    output.push({
      type,
      status: token(item.status || "open"),
      ref: safeRef(item.ref || item.request_ref || item.session_ref || ""),
      summary: safeSnippet(item.summary || item.customer_safe_summary, 160),
      handoff_required: item.handoff_required === true,
    });
    if (output.length >= 6) break;
  }
  return output;
}

function continuityFrom(bundle, nowMs) {
  const source = object(bundle.continuity);
  const updatedAt = text(source.updated_at || source.last_event_at);
  const stale = isStale(updatedAt, nowMs, MAX_CONTINUITY_AGE_MS);
  const normalizedAt = parseTime(updatedAt) === null ? "" : new Date(parseTime(updatedAt)).toISOString();

  if (stale) {
    return {
      last_intent: "",
      last_topic: "",
      last_model_key: "",
      unresolved_threads: [],
      last_reply_summary: "",
      updated_at: normalizedAt,
      stale: true,
    };
  }

  return {
    last_intent: token(source.last_intent),
    last_topic: safeSnippet(source.last_topic, 160),
    last_model_key: safeRef(source.last_model_key),
    unresolved_threads: safeUnresolvedThreads(source.unresolved_threads),
    last_reply_summary: safeSnippet(source.last_reply_summary, 220),
    updated_at: normalizedAt,
    stale: false,
  };
}

export function buildKenjiConversationPolicyV1(input = {}, options = {}) {
  const bundle = object(input);
  const now = options.now || bundle.evaluated_at || new Date().toISOString();
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new TypeError("evaluated_at must be a valid ISO timestamp");

  const rightsAuthority = text(options.rightsAuthority || bundle.rights_authority || "my_mmd_entitlement_resolver_v1");
  const identityInput = object(bundle.identity);
  const requestedIdentityState = token(identityInput.state || bundle.identity_state);
  const suppliedReasoning = object(options.reasoning || bundle.reasoning);
  const reasoning = requestedIdentityState === "known" && Object.keys(suppliedReasoning).length
    ? suppliedReasoning
    : anonymousReasoning(rightsAuthority);

  const identity = normalizeIdentity(bundle, reasoning);
  const relationship = identity.state === "known"
    ? relationshipFrom(bundle, reasoning)
    : relationshipFrom({}, anonymousReasoning(rightsAuthority));
  const currentState = identity.state === "known"
    ? currentStateFrom(bundle, reasoning, nowMs, rightsAuthority)
    : {
        rights_authority: rightsAuthority,
        resolver_snapshot_valid: false,
        lifecycle: "unknown",
        capabilities: [],
        open_thread_state: {},
        live_state_authority: "",
        evaluated_at: "",
        stale: false,
      };
  const continuity = identity.state === "known"
    ? continuityFrom(bundle, nowMs)
    : continuityFrom({}, nowMs);

  const currentIntent = token(bundle.current_intent);
  const domainGuard = object(bundle.domain_guard);
  const protectedIntent = PROTECTED_INTENTS.has(currentIntent);
  const identityNeedsReview = ["ambiguous", "review_required"].includes(identity.state);
  const reasoningNeedsReview = identity.state === "known" && reasoning.review_required === true;
  const stateNeedsReview = identity.state === "known" && (currentState.stale || !currentState.resolver_snapshot_valid);
  const handoffRequired = domainGuard.handoff_required === true || protectedIntent;
  const reviewRequired = identityNeedsReview || reasoningNeedsReview || stateNeedsReview || domainGuard.review_required === true;
  const evidenceReady = identity.state === "known" && reasoning?.evidence_discovery?.note_ready === true;

  const continuityResolution = resolveConversationContinuityV1({
    message: bundle.current_message || bundle.message,
    current_intent: currentIntent,
    current_topic: bundle.current_topic,
    current_subtopic: bundle.current_subtopic,
    explicit_new_topic: bundle.explicit_new_topic,
    matrix: bundle.conversation_matrix || bundle.matrix,
    now,
  });

  return {
    schema_version: CONVERSATION_MATRIX_SCHEMA,
    policy_version: CONVERSATION_MATRIX_POLICY,
    engine_version: CONVERSATION_POLICY_ENGINE,
    evaluated_at: new Date(nowMs).toISOString(),
    read_only: true,
    identity,
    relationship,
    current_state: currentState,
    continuity,
    continuity_resolution: continuityResolution,
    conversation: {
      strategy: identity.state === "known" ? token(reasoning?.conversation?.strategy) : "anonymous_or_unknown",
      cta: identity.state === "known" ? token(reasoning?.conversation?.cta) : "generic_safe_routing",
      last_intent: continuity.last_intent,
      current_intent: currentIntent,
    },
    safety: {
      may_personalize: identity.state === "known" && ["high", "medium"].includes(identity.confidence),
      may_reference_history: identity.state === "known" && evidenceReady && !continuity.stale,
      handoff_required: handoffRequired,
      stale: currentState.stale || continuity.stale || continuityResolution.requires_state_refresh,
      review_required: reviewRequired || continuityResolution.decision === "ambiguous",
      memory_is_context_only: true,
      may_grant_entitlement: false,
      may_confirm_payment: false,
      may_confirm_booking_or_availability: false,
      may_set_points: false,
      may_restore_vip_svip_black_card: false,
    },
    evidence: {
      source_state_schema: reasoning?.evidence_discovery?.schema_version || "",
      evidence_incomplete: reasoning?.evidence_discovery?.evidence_incomplete === true,
      unavailable_sources: list(reasoning?.evidence_discovery?.unavailable_sources).map(token).filter(Boolean),
    },
  };
}

export { PROTECTED_INTENTS, ALLOWED_LIVE_STATE_AUTHORITIES };
