import { inferLiveTruthDomains } from "../../shared/kenji-conversation-matrix.mjs";

export const KENJI_CANONICAL_CONTEXT_ADAPTER_SCHEMA = "mmd.kenji_canonical_context_adapter.v2";

const AIRTABLE_API = "https://api.airtable.com/v0";
const CLIENTS_TABLE_FALLBACK = "tblVv58TCbwh5j1fS";
const MATRIX_TABLE_FALLBACK = "tblS6iRgPjYLBqZJh";
const EVIDENCE_TABLE_FALLBACK = "tblx7NdfHO5iY6qtg";
const HISTORY_REVIEWS_TABLE_FALLBACK = "tblnpDFQMpo8AmNQv";
const MEMBER_TRUTH_URL = "https://member-pages-worker.internal/__internal/kenji/member-truth";
const ADMIN_LIVE_URL = "https://admin-worker.local/v1/internal/kenji/operational-context/live";
const RIGHTS_AUTHORITY = "my_mmd_entitlement_resolver_v1";
const LIVE_FANIN_SCHEMA = "mmd.kenji_live_context_fanin.v1";
const READ_TIMEOUT_MS = 1_200;

const REVIEWED_STATES = new Set(["approved", "reviewed", "verified", "materialized"]);
const PRIVATE_LEVELS = new Set(["sensitive", "restricted", "private_internal", "secret"]);
const ADMIN_LIVE_DOMAINS = new Set(["payment", "booking", "availability", "pricing"]);
const WEAK_INTENTS = new Set(["", "line_event", "context_clarification", "per_continuity", "unknown"]);

const CLIENT_FIELDS = Object.freeze([
  "Client Name",
  "Client Name (Display)",
  "Verification Status",
  "line_user_id",
  "mmd_client_name",
  "nickname",
  "line_display_name",
  "MMD — Client Intelligence Evidence",
  "MMD — Customer History Reviews",
]);

const MATRIX_FIELDS = Object.freeze([
  "matrix_id",
  "schema_version",
  "conversation_id_hash",
  "topic",
  "subtopic",
  "relationship_context",
  "last_customer_intent",
  "conversation_stage",
  "continuity_summary",
  "important_open_loops_json",
  "handoff_required",
  "handoff_owner",
  "handoff_reason",
  "live_truth_required",
  "live_truth_domains",
  "last_interaction_at",
  "state_updated_at",
  "state_expires_at",
  "matrix_status",
  "version",
]);

const EVIDENCE_FIELDS = Object.freeze([
  "evidence_id",
  "Mentioned Model",
  "evidence_type",
  "normalized_summary",
  "model_relationship_signal",
  "preference_strength",
  "service_date_hint",
  "review_status",
  "privacy_level",
  "created_at",
  "reviewed_at",
]);

const HISTORY_REVIEW_FIELDS = Object.freeze([
  "history_review_id",
  "review_status",
  "decision",
  "approved_model_text",
  "approved_service_date",
  "approved_service_type",
  "reviewed_at",
]);

function text(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && "name" in value) return String(value.name ?? "").trim();
  return value == null ? "" : String(value).trim();
}

function token(value, max = 80) {
  return text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
}

function bounded(value, max = 220) {
  const result = text(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, max);
  if (/(?:authorization|bearer\s+|password|passwd|secret|access[_ -]?token|refresh[_ -]?token|session[_ -]?cookie|sk-[A-Za-z0-9_-]{8,})/i.test(result)) return "";
  return result;
}

function safeRef(value) {
  const ref = text(value).slice(0, 120);
  if (!ref || !/^[A-Za-z0-9._:-]+$/.test(ref) || /^(?:U[0-9a-f]{20,}|Bearer|sk-|eyJ)/i.test(ref)) return "";
  return ref;
}

function list(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(",");
    }
  }
  return [];
}

function names(value, max = 40) {
  return list(value).map((item) => token(item)).filter(Boolean).slice(0, max);
}

function field(fields = {}, keys = []) {
  for (const key of keys) {
    const value = fields?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function canonicalLineUserId(event = {}) {
  const value = text(event?.source?.userId);
  return /^U[0-9a-f]{32}$/i.test(value) ? value : "";
}

function clientsTable(env = {}) {
  return text(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || CLIENTS_TABLE_FALLBACK);
}

function matrixTable(env = {}) {
  return text(env.AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID || MATRIX_TABLE_FALLBACK);
}

function evidenceTable(env = {}) {
  return text(env.AIRTABLE_TABLE_CLIENT_INTELLIGENCE_EVIDENCE_ID || EVIDENCE_TABLE_FALLBACK);
}

function historyReviewsTable(env = {}) {
  return text(env.AIRTABLE_TABLE_CUSTOMER_HISTORY_REVIEWS_ID || HISTORY_REVIEWS_TABLE_FALLBACK);
}

function escapeFormula(value) {
  return text(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text(value)));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function airtableList(env = {}, table = "", params = {}) {
  const apiKey = text(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  const baseId = text(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !text(table)) return { ok: false, records: [], reason: "airtable_env_missing" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_phase2_context_timeout"), READ_TIMEOUT_MS);
  try {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(text(table))}`);
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    const request = new Request(url.toString(), {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      signal: controller.signal,
    });
    const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
    if (!response.ok) return { ok: false, records: [], reason: `airtable_${response.status}` };
    const payload = await response.json().catch(() => ({}));
    return { ok: true, records: Array.isArray(payload?.records) ? payload.records : [] };
  } catch (_) {
    return { ok: false, records: [], reason: "airtable_read_failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function readExactClient(env, lineUserId) {
  return airtableList(env, clientsTable(env), {
    maxRecords: 2,
    pageSize: 2,
    filterByFormula: `{line_user_id}="${escapeFormula(lineUserId)}"`,
    "fields[]": CLIENT_FIELDS,
  });
}

async function readMatrix(env, conversationHash) {
  return airtableList(env, matrixTable(env), {
    maxRecords: 2,
    pageSize: 2,
    filterByFormula: `{conversation_id_hash}="${escapeFormula(conversationHash)}"`,
    "fields[]": MATRIX_FIELDS,
  });
}

async function readReviewedEvidence(env, clientRecord = null) {
  const ids = list(field(clientRecord?.fields || {}, ["MMD — Client Intelligence Evidence"]))
    .map(safeRef)
    .filter((value) => /^rec[A-Za-z0-9]+$/.test(value))
    .slice(0, 40);
  if (!ids.length) return { ok: true, records: [], reason: "no_linked_evidence" };
  const formula = ids.length === 1
    ? `RECORD_ID()="${escapeFormula(ids[0])}"`
    : `OR(${ids.map((id) => `RECORD_ID()="${escapeFormula(id)}"`).join(",")})`;
  return airtableList(env, evidenceTable(env), {
    maxRecords: 40,
    pageSize: 40,
    filterByFormula: formula,
    "fields[]": EVIDENCE_FIELDS,
  });
}

async function readReviewedHistory(env, clientRecord = null) {
  const ids = list(field(clientRecord?.fields || {}, ["MMD — Customer History Reviews"]))
    .map(safeRef)
    .filter((value) => /^rec[A-Za-z0-9]+$/.test(value))
    .slice(0, 60);
  if (!ids.length) return { ok: true, records: [], reason: "no_linked_history_reviews" };
  const formula = ids.length === 1
    ? `RECORD_ID()="${escapeFormula(ids[0])}"`
    : `OR(${ids.map((id) => `RECORD_ID()="${escapeFormula(id)}"`).join(",")})`;
  return airtableList(env, historyReviewsTable(env), {
    maxRecords: 60,
    pageSize: 60,
    filterByFormula: formula,
    "fields[]": HISTORY_REVIEW_FIELDS,
  });
}

function safeResolverSnapshot(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.schema_version !== RIGHTS_AUTHORITY || value.fail_closed !== true || !value.access) return null;
  const evaluatedAt = Date.parse(text(value.evaluated_at));
  if (!Number.isFinite(evaluatedAt)) return null;
  const state = value.capability_state && typeof value.capability_state === "object" ? value.capability_state : {};
  const access = value.access && typeof value.access === "object" ? value.access : {};
  const envelope = token(access.private_visibility_envelope);
  return {
    schema_version: RIGHTS_AUTHORITY,
    evaluated_at: new Date(evaluatedAt).toISOString(),
    fail_closed: true,
    member_blocked: value.member_blocked === true,
    capability_state: {
      active: names(state.active),
      expiring_soon: names(state.expiring_soon),
      grace: names(state.grace),
      inactive: names(state.inactive),
      recognized: names(state.recognized),
    },
    access: {
      public_service_access: access.public_service_access === true,
      guest_pass_access: access.guest_pass_access === true,
      red_card_request_lane: access.red_card_request_lane === true,
      private_visibility_envelope: ["none", "standard", "premium", "vip", "svip", "black_card"].includes(envelope) ? envelope : "none",
      protected_allowlist_required: access.protected_allowlist_required === true,
      protected_capabilities_active: names(access.protected_capabilities_active),
      new_model_reveals_allowed: access.new_model_reveals_allowed === true,
    },
  };
}

async function readMemberTruth(env, lineUserId) {
  if (!env.MEMBER_PAGES_WORKER?.fetch) return { ok: false, reason: "member_truth_binding_missing" };
  try {
    const response = await env.MEMBER_PAGES_WORKER.fetch(new Request(MEMBER_TRUTH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
      },
      body: JSON.stringify({ line_user_id: lineUserId, intent: "membership_status" }),
    }));
    if (!response.ok) return { ok: false, reason: `member_truth_${response.status}` };
    const payload = await response.json().catch(() => null);
    const snapshot = safeResolverSnapshot(payload?.resolver_snapshot);
    if (payload?.ok !== true || payload?.authority !== RIGHTS_AUTHORITY || payload?.identity_status !== "resolved" || !snapshot) {
      return { ok: false, reason: "member_truth_contract_rejected" };
    }
    return {
      ok: true,
      snapshot,
      membership: payload.membership && typeof payload.membership === "object" ? payload.membership : {},
    };
  } catch (_) {
    return { ok: false, reason: "member_truth_unavailable" };
  }
}

async function readAdminLiveState(env, { clientRecordId = "", lineUserId = "", currentIntent = "" } = {}) {
  const internalToken = text(env.INTERNAL_TOKEN);
  if (!env.ADMIN_WORKER?.fetch || !internalToken) return { ok: false, reason: "admin_live_binding_missing" };
  try {
    const response = await env.ADMIN_WORKER.fetch(new Request(ADMIN_LIVE_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${internalToken}`,
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
      },
      body: JSON.stringify({
        client: { canonical_client_id: clientRecordId, line_user_id: lineUserId },
        intent: { type: token(currentIntent) || "general" },
      }),
    }));
    if (!response.ok) return { ok: false, reason: `admin_live_${response.status}` };
    const payload = await response.json().catch(() => null);
    if (payload?.ok !== true || payload?.schema !== LIVE_FANIN_SCHEMA || payload?.live_truth_complete !== true) {
      return { ok: false, reason: "admin_live_incomplete" };
    }
    return { ok: true, payload };
  } catch (_) {
    return { ok: false, reason: "admin_live_unavailable" };
  }
}

function preferredName(fields = {}) {
  return bounded(field(fields, ["nickname", "mmd_client_name", "Client Name (Display)", "Client Name", "line_display_name"]), 100);
}

function identityProjection(clientResult = {}) {
  if (!clientResult.ok) return { state: "review_required", confidence: "unknown", reason: clientResult.reason || "identity_source_unavailable", record: null, preferred_name: "" };
  if (clientResult.records.length > 1) return { state: "ambiguous", confidence: "low", reason: "multiple_exact_clients", record: null, preferred_name: "" };
  if (!clientResult.records.length) return { state: "unknown", confidence: "unknown", reason: "exact_client_not_found", record: null, preferred_name: "" };
  const record = clientResult.records[0];
  const name = preferredName(record.fields || {});
  if (!name) return { state: "review_required", confidence: "low", reason: "customer_safe_name_missing", record, preferred_name: "" };
  const verified = token(field(record.fields || {}, ["Verification Status"])) === "verified";
  return {
    state: "known",
    confidence: verified ? "high" : "medium",
    reason: "exact_clients_line_user_id",
    record,
    preferred_name: name,
  };
}

function matrixProjection(matrixResult = {}) {
  if (!matrixResult.ok || matrixResult.records.length !== 1) return null;
  const fields = matrixResult.records[0]?.fields || {};
  return {
    matrix_id: safeRef(field(fields, ["matrix_id"])),
    schema_version: bounded(field(fields, ["schema_version"]), 80),
    topic: bounded(field(fields, ["topic"]), 160),
    subtopic: bounded(field(fields, ["subtopic"]), 160),
    relationship_context: token(field(fields, ["relationship_context"])),
    last_customer_intent: token(field(fields, ["last_customer_intent"])),
    conversation_stage: token(field(fields, ["conversation_stage"])),
    continuity_summary: bounded(field(fields, ["continuity_summary"]), 600),
    important_open_loops: list(field(fields, ["important_open_loops_json"])).map((item) => token(item)).filter(Boolean).slice(0, 6),
    handoff_required: field(fields, ["handoff_required"]) === true,
    handoff_owner: token(field(fields, ["handoff_owner"])),
    handoff_reason: bounded(field(fields, ["handoff_reason"]), 220),
    live_truth_required: field(fields, ["live_truth_required"]) === true,
    live_truth_domains: names(field(fields, ["live_truth_domains"]), 8),
    last_interaction_at: bounded(field(fields, ["last_interaction_at"]), 80),
    state_updated_at: bounded(field(fields, ["state_updated_at"]), 80),
    state_expires_at: bounded(field(fields, ["state_expires_at"]), 80),
    matrix_status: token(field(fields, ["matrix_status"])),
    version: Math.max(0, Number(field(fields, ["version"])) || 0),
  };
}

function reviewedEvidenceProjection(result = {}) {
  if (!result.ok) return { ok: false, preferences: [], model_touches: [] };
  const preferences = [];
  const modelTouches = [];
  for (const record of result.records || []) {
    const fields = record?.fields || {};
    const reviewStatus = token(field(fields, ["review_status"]));
    const privacyLevel = token(field(fields, ["privacy_level"]));
    if (!REVIEWED_STATES.has(reviewStatus) || PRIVATE_LEVELS.has(privacyLevel)) continue;
    const type = token(field(fields, ["evidence_type"]) || "preference");
    const summary = bounded(field(fields, ["normalized_summary"]), 180);
    if (summary && !/(?:credential|token|payment_artifact|private_note|application_answer)/.test(type)) {
      preferences.push({
        evidence_id: safeRef(field(fields, ["evidence_id"]) || record?.id),
        review_status: reviewStatus,
        evidence_type: type,
        normalized_summary: summary,
        preference_strength: token(field(fields, ["preference_strength"])),
        privacy_level: privacyLevel || "internal_safe",
      });
    }
    const lastSeen = field(fields, ["service_date_hint", "reviewed_at", "created_at"]);
    for (const modelRef of list(field(fields, ["Mentioned Model"])).map(safeRef).filter(Boolean).slice(0, 3)) {
      modelTouches.push({
        model_key: modelRef,
        relationship: token(field(fields, ["model_relationship_signal"])),
        last_seen_at: Number.isFinite(Date.parse(text(lastSeen))) ? new Date(Date.parse(text(lastSeen))).toISOString() : "",
      });
    }
    if (preferences.length >= 8 && modelTouches.length >= 6) break;
  }
  return { ok: true, preferences: preferences.slice(0, 8), model_touches: modelTouches.slice(0, 6) };
}

function reviewedHistoryProjection(result = {}) {
  if (!result.ok) return { ok: false, model_touches: [] };
  const modelTouches = [];
  for (const record of result.records || []) {
    const fields = record?.fields || {};
    const reviewStatus = token(field(fields, ["review_status"]));
    const decision = token(field(fields, ["decision"]));
    if (!REVIEWED_STATES.has(reviewStatus) || decision !== "approve_service_history") continue;
    const modelText = bounded(field(fields, ["approved_model_text"]), 120);
    if (!modelText) continue;
    const lastSeen = field(fields, ["approved_service_date", "reviewed_at"]);
    modelTouches.push({
      model_key: modelText,
      relationship: "completed",
      last_seen_at: Number.isFinite(Date.parse(text(lastSeen))) ? new Date(Date.parse(text(lastSeen))).toISOString() : "",
      source: "reviewed_customer_history",
    });
    if (modelTouches.length >= 8) break;
  }
  return { ok: true, model_touches: modelTouches };
}

function mergeModelTouches(...groups) {
  const output = [];
  const seen = new Set();
  for (const group of groups) {
    for (const item of group || []) {
      const key = `${token(item?.model_key, 120)}:${token(item?.relationship, 60)}`;
      if (!token(item?.model_key, 120) || seen.has(key)) continue;
      seen.add(key);
      output.push(item);
      if (output.length >= 8) return output;
    }
  }
  return output;
}

function effectiveIdentityConfidence(identity = {}, truth = {}) {
  if (identity.state !== "known") return identity.confidence || "unknown";
  if (identity.confidence === "high") return "high";
  return truth.ok === true ? "high" : identity.confidence || "medium";
}

function sourceState(state, reason, evidenceCount = null) {
  return {
    state,
    reason: token(reason, 120) || "source_state_recorded",
    ...(Number.isInteger(evidenceCount) ? { evidence_count: evidenceCount } : {}),
  };
}

function evidenceSources({ identity, evidence, history, truth }) {
  const reviewedCount = evidence.preferences.length + evidence.model_touches.length + history.model_touches.length;
  return {
    rename_identity: identity.state === "known"
      ? sourceState("FOUND", "exact_canonical_client_name", 1)
      : sourceState("SOURCE_UNAVAILABLE", identity.reason),
    line_oa_1to1: sourceState("SOURCE_UNAVAILABLE", "historical_oa_search_not_wired"),
    line_crew: sourceState("SOURCE_UNAVAILABLE", "historical_crew_search_not_wired"),
    chat_exports_attachments: sourceState("SOURCE_UNAVAILABLE", "historical_archive_search_not_wired"),
    hashtags_tenure: sourceState("SOURCE_UNAVAILABLE", "reviewed_tenure_tags_not_wired"),
    recognition_history: evidence.ok && history.ok
      ? sourceState(reviewedCount ? "FOUND" : "SEARCHED_NO_MATCH", reviewedCount ? "reviewed_customer_history_found" : "reviewed_customer_history_searched_no_match", reviewedCount)
      : sourceState("SOURCE_UNAVAILABLE", "reviewed_customer_history_unavailable"),
    membership_cycles: truth.ok
      ? sourceState(truth.snapshot.capability_state.recognized.length ? "FOUND" : "SEARCHED_NO_MATCH", "canonical_resolver_read", truth.snapshot.capability_state.recognized.length)
      : sourceState("SOURCE_UNAVAILABLE", truth.reason),
    payment_evidence: sourceState("SOURCE_UNAVAILABLE", "payment_history_adapter_not_wired"),
    resolver_snapshot: truth.ok
      ? sourceState("FOUND", "fresh_canonical_resolver_snapshot", 1)
      : sourceState("SOURCE_UNAVAILABLE", truth.reason),
  };
}

function effectiveIntent(currentIntent, matrix) {
  const current = token(currentIntent);
  if (matrix && WEAK_INTENTS.has(current) && matrix.last_customer_intent && !["resolved", "stale_needs_refresh"].includes(matrix.conversation_stage)) {
    return matrix.last_customer_intent;
  }
  return current || "line_event";
}

function continuityProjection(matrix) {
  if (!matrix) return {};
  return {
    last_intent: matrix.last_customer_intent,
    last_topic: matrix.topic,
    last_model_key: "",
    unresolved_threads: matrix.important_open_loops.map((item) => ({
      type: item,
      status: matrix.conversation_stage || "open",
      summary: "",
      handoff_required: matrix.handoff_required,
    })),
    last_reply_summary: matrix.continuity_summary,
    updated_at: matrix.state_updated_at || matrix.last_interaction_at,
  };
}

function liveStateProjection(result, stamp) {
  if (!result?.ok) return { canonical: false, authority: "", evaluated_at: stamp };
  const payload = result.payload || {};
  return {
    canonical: true,
    authority: "admin-worker",
    evaluated_at: stamp,
    booking_status: token(payload?.job_live?.status),
    session_status: token(payload?.job_live?.session_status),
    payment_status: token(payload?.payment_live?.status),
    availability_status: token(payload?.calendar_live?.status),
    request_status: token(payload?.readiness),
  };
}

export function inferKenjiShadowIntent(event = {}) {
  const raw = bounded(event?.message?.text || event?.postback?.displayText || event?.postback?.data, 600).toLowerCase();
  if (!raw) return event?.type === "follow" ? "new_follow" : "line_event";
  if (/(สลิป|โอน|จ่าย|ชำระ|payment|paid|slip)/i.test(raw)) return /(?:สถานะ|เรียบร้อย|แล้ว|status)/i.test(raw) ? "payment_status" : "payment_slip";
  if (/(แต้ม|คะแนน|points?)/i.test(raw)) return "points_status";
  if (/(สมาชิก|membership|ต่ออายุ|renew)/i.test(raw)) return /(?:ต่ออายุ|renew)/i.test(raw) ? "membership_renewal" : "membership_status";
  if (/(ว่างไหม|เช็กคิว|ดูคิว|availability|schedule)/i.test(raw)) return "availability_request";
  if (/(ราคา|เรต|rate|price|pricing)/i.test(raw)) return "pricing_review";
  if (/(เมื่อกี้|ก่อนหน้านี้|ที่คุยมา|ต่อจากเดิม|update|status)/i.test(raw)) return "context_clarification";
  return "line_event";
}

export async function buildKenjiLineCanonicalContext({ env = {}, event = {}, currentIntent = "", now = new Date() } = {}) {
  const stamp = now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : new Date(now).toISOString();
  const lineUserId = canonicalLineUserId(event);
  if (!lineUserId) {
    return {
      ok: true,
      schema: KENJI_CANONICAL_CONTEXT_ADAPTER_SCHEMA,
      context_bundle: {
        evaluated_at: stamp,
        identity: { state: "unknown", canonical_client_ref: "", preferred_name: "", confidence: "unknown", source: "trusted_line_boundary" },
        current_intent: token(currentIntent) || "line_event",
        domain_guard: { handoff_required: false, review_required: false },
      },
      telemetry: { memory_candidate: false, identity_state: "unknown", matrix_version: 0, adapter_complete: true },
    };
  }

  const conversationHash = await sha256Hex(`line_ofc:${lineUserId}`);
  const [clientResult, matrixResult, truth] = await Promise.all([
    readExactClient(env, lineUserId),
    readMatrix(env, conversationHash),
    readMemberTruth(env, lineUserId),
  ]);
  const identity = identityProjection(clientResult);
  const matrix = matrixProjection(matrixResult);
  const [evidenceResult, historyResult] = identity.record
    ? await Promise.all([
        readReviewedEvidence(env, identity.record),
        readReviewedHistory(env, identity.record),
      ])
    : [{ ok: true, records: [] }, { ok: true, records: [] }];
  const evidence = reviewedEvidenceProjection(evidenceResult);
  const history = reviewedHistoryProjection(historyResult);
  const modelTouches = mergeModelTouches(evidence.model_touches, history.model_touches);
  const intent = effectiveIntent(currentIntent, matrix);
  const domains = inferLiveTruthDomains(intent, matrix?.live_truth_domains || []);
  const needsAdminLive = domains.some((domain) => ADMIN_LIVE_DOMAINS.has(domain));
  const matrixUnavailable = !matrixResult.ok || matrixResult.records.length > 1;
  const clientRecordId = safeRef(identity.record?.id);
  const adminLive = needsAdminLive && identity.state === "known"
    ? await readAdminLiveState(env, { clientRecordId, lineUserId, currentIntent: intent })
    : { ok: false, reason: needsAdminLive ? "canonical_identity_required" : "not_required" };
  const snapshot = truth.ok ? truth.snapshot : null;
  const membership = truth.ok ? truth.membership : {};
  const sources = evidenceSources({ identity, evidence, history, truth });
  const identityConfidence = effectiveIdentityConfidence(identity, truth);
  const reviewRequired = ["ambiguous", "review_required"].includes(identity.state)
    || (identity.state === "known" && !snapshot)
    || (identity.state === "known" && (!evidence.ok || !history.ok || matrixUnavailable))
    || (needsAdminLive && !adminLive.ok);

  const contextBundle = {
    evaluated_at: stamp,
    identity: {
      state: identity.state,
      canonical_client_ref: identity.state === "known" && clientRecordId ? `client:${clientRecordId}` : "",
      preferred_name: identity.state === "known" ? identity.preferred_name : "",
      confidence: identityConfidence,
      source: "exact_line_canonical_client",
    },
    customer_context: {
      rename: identity.state === "known" ? identity.preferred_name : "",
      latest_cycle: snapshot ? {
        package_code: token(membership.level),
        expire_at: bounded(membership.expire_at, 80),
      } : {},
      entitlement_snapshot: snapshot || {},
      evidence_sources: sources,
      evaluated_at: stamp,
    },
    reviewed_preferences: identity.state === "known" ? evidence.preferences : [],
    prior_model_touches: identity.state === "known" ? modelTouches : [],
    continuity: identity.state === "known" ? continuityProjection(matrix) : {},
    conversation_matrix: matrix || {},
    current_intent: intent,
    current_topic: matrix?.topic || "",
    current_state_evaluated_at: snapshot?.evaluated_at || "",
    live_state: liveStateProjection(adminLive, stamp),
    domain_guard: {
      handoff_required: domains.length > 0,
      review_required: reviewRequired,
    },
    rights_authority: RIGHTS_AUTHORITY,
  };

  return {
    ok: true,
    schema: KENJI_CANONICAL_CONTEXT_ADAPTER_SCHEMA,
    context_bundle: contextBundle,
    telemetry: {
      memory_candidate: identity.state === "known" && Boolean(evidence.preferences.length || modelTouches.length || matrix?.last_customer_intent),
      identity_state: identity.state,
      matrix_version: matrix?.version || 0,
      review_required: reviewRequired,
      adapter_complete: clientResult.ok && !matrixUnavailable && truth.ok && evidence.ok && history.ok && (!needsAdminLive || adminLive.ok),
    },
  };
}

export const KENJI_CANONICAL_CONTEXT_INTERNALS = Object.freeze({
  CLIENTS_TABLE_FALLBACK,
  MATRIX_TABLE_FALLBACK,
  EVIDENCE_TABLE_FALLBACK,
  HISTORY_REVIEWS_TABLE_FALLBACK,
  MEMBER_TRUTH_URL,
  ADMIN_LIVE_URL,
});
