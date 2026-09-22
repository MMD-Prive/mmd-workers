import {
  handleKenjiControlRequest,
  KENJI_CONTROL_ENDPOINTS,
} from "./kenji-control-endpoints.js";
import { readKenjiRuntimeControls } from "./kenji-control-actions.js";
import { buildKenjiContinuityOperatorDraft } from "../../shared/kenji-continuity-operator-draft.mjs";

export const CLIENT_INTELLIGENCE_PATH = "/v1/admin/clients/intelligence";

export function isClientIntelligenceRequest(path, method = "GET") {
  return normalizePath(path) === CLIENT_INTELLIGENCE_PATH && String(method || "GET").toUpperCase() === "GET";
}

export async function handleClientIntelligenceRequest(request, env = {}) {
  const url = new URL(request.url);
  if (!isClientIntelligenceRequest(url.pathname, request.method)) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  const clientId = clean(url.searchParams.get("client_id"));
  if (!isRecordId(clientId)) {
    return json({ ok: false, error: "canonical_client_id_required" }, 400);
  }

  const [memorySource, matrixSource, conversationsSource, runtimeControlSource] = await Promise.all([
    readKenjiSource(request, env, KENJI_CONTROL_ENDPOINTS.memory, { client_id: clientId }),
    readKenjiSource(request, env, KENJI_CONTROL_ENDPOINTS.conversations, {
      client_id: clientId,
      view: "matrix",
    }),
    readKenjiSource(request, env, KENJI_CONTROL_ENDPOINTS.conversations, {
      client_id: clientId,
      limit: "8",
    }),
    readRuntimeControlSource(env),
  ]);

  const memoryPayload = memorySource.payload || {};
  const memory = memoryPayload.data_status === "live" ? memoryPayload.memory : null;
  if (!memory || clean(memory.record_id) !== clientId) {
    return json({
      ok: true,
      data_status: "empty",
      client_id: clientId,
      generated_at: new Date().toISOString(),
      identity: {
        status: "identity_review",
        display_name: "",
        confidence: 0,
      },
      relationship: {
        summary: "",
        last_interaction_at: "",
        relationship_state: "unknown",
      },
      current_state: emptyCurrentState(),
      ai: emptyAdvisory(
        "canonical_client_not_resolved",
        env.KENJI_CONTINUITY_PHASE4_MODE,
        runtimeControlSource,
      ),
      unresolved: ["canonical_client_not_resolved"],
      sources: sourceSummary(memorySource, matrixSource, conversationsSource),
      authority: authorityProjection(),
    });
  }

  const projection = buildClientIntelligenceProjection({
    clientId,
    memoryPayload,
    matrixPayload: matrixSource.payload || {},
    conversationsPayload: conversationsSource.payload || {},
    generatedAt: new Date().toISOString(),
    continuityMode: env.KENJI_CONTINUITY_PHASE4_MODE,
    matrixSourceStatus: sourceDataStatus(matrixSource),
    runtimeControlSource,
  });

  const degraded = [memorySource, matrixSource, conversationsSource].some((item) => item.status === "error");
  return json({
    ...projection,
    data_status: degraded ? "degraded" : "live",
    sources: sourceSummary(memorySource, matrixSource, conversationsSource),
  });
}

export function buildClientIntelligenceProjection({
  clientId,
  memoryPayload = {},
  matrixPayload = {},
  conversationsPayload = {},
  generatedAt = new Date().toISOString(),
  continuityMode = "off",
  matrixSourceStatus = "unknown",
  runtimeControlSource = { status: "unavailable", controls: null },
} = {}) {
  const memory = memoryPayload?.data_status === "live" ? memoryPayload.memory || {} : {};
  const matrix = matrixPayload?.data_status === "live" ? matrixPayload.matrix || {} : {};
  const conversations = Array.isArray(conversationsPayload?.conversations)
    ? conversationsPayload.conversations
    : [];

  const canonicalClientId = clean(clientId || memory.record_id);
  const openLoops = stringList(matrix.important_open_loops);
  const liveTruthDomains = stringList(matrix.live_truth_domains);
  const unresolved = unique([
    ...openLoops,
    boolish(matrix.handoff_required) ? clean(matrix.handoff_reason) || "handoff_required" : "",
    boolish(matrix.live_truth_required) && liveTruthDomains.length
      ? `live_truth_required:${liveTruthDomains.join(",")}`
      : "",
  ]);

  const relationshipSummary = firstText(
    matrix.relationship_context,
    matrix.continuity_summary,
    memory.relationship_tier,
  );
  const lastInteractionAt = firstText(matrix.last_interaction_at, memory.last_contact_at);
  const relationshipState = firstText(matrix.matrix_status, memory.relationship_tier, memory.status, "unknown");
  const linkedSession = conversations.find((item) => clean(item?.linked_session_id));

  const currentState = {
    membership: compact({
      status: clean(memory.membership_status) || "unknown",
      tier: clean(memory.membership_tier),
      package_code: clean(memory.package_code),
      renewal_due: clean(memory.renewal_due),
      renewal_status: clean(memory.renewal_status),
      source: clean(memory.source) || "customer_memory",
    }),
    payment: {
      status: "unknown",
      source: "canonical_payment_not_connected",
      authority: "canonical_backend",
    },
    access: compact({
      status: clean(memory.access_status) || "unknown",
      relationship_tier: clean(memory.relationship_tier),
      source: clean(memory.source) || "customer_memory",
    }),
    session: compact({
      status: linkedSession ? "referenced" : "unknown",
      session_id: clean(linkedSession?.linked_session_id),
      source: linkedSession ? "conversation_events" : "conversation_events_empty",
    }),
  };

  const notices = buildNotices({ memory, matrix, openLoops, liveTruthDomains });
  const nextBestAction = buildNextBestAction({
    clientId: canonicalClientId,
    memory,
    matrix,
    openLoops,
  });
  const followUp = buildFollowUp({ matrix, openLoops });
  const aiSummary = firstText(
    matrix.continuity_summary,
    matrix.relationship_context,
    buildDeterministicSummary(memory, matrix),
  );
  const suggestedReply = buildContinuityOperatorDraft({
    canonicalClientId,
    memory,
    matrix,
    matrixPayload,
    generatedAt,
    continuityMode,
    openLoops,
    liveTruthDomains,
  });
  const continuityStatus = buildContinuityStatus({
    matrix,
    matrixPayload,
    matrixSourceStatus,
    suggestedReply,
  });
  const runtimeControls = buildRuntimeControlProjection(runtimeControlSource);
  const identityVerified = clean(memory.verification_status).toLowerCase() === "verified";

  return {
    ok: true,
    client_id: canonicalClientId,
    generated_at: generatedAt,
    identity: {
      status: isRecordId(canonicalClientId) ? "canonical" : "identity_review",
      display_name: clean(memory.display_name),
      confidence: isRecordId(canonicalClientId) ? 1 : 0,
      verified: identityVerified,
    },
    relationship: {
      summary: relationshipSummary,
      last_interaction_at: lastInteractionAt,
      relationship_state: relationshipState,
    },
    current_state: currentState,
    ai: {
      summary: aiSummary,
      notices,
      next_best_action: nextBestAction,
      suggested_reply: suggestedReply,
      continuity_status: continuityStatus,
      runtime_controls: runtimeControls,
      follow_up: followUp,
      advisory_only: true,
      analysis_basis: "deterministic_context_v1",
    },
    unresolved,
    sources: [],
    authority: authorityProjection(),
  };
}

function buildContinuityStatus({
  matrix = {},
  matrixPayload = {},
  matrixSourceStatus = "unknown",
  suggestedReply = {},
} = {}) {
  const status = clean(matrix.matrix_status).toLowerCase() || "unknown";
  const requestedSourceStatus = clean(matrixSourceStatus).toLowerCase();
  const sourceStatus = requestedSourceStatus && requestedSourceStatus !== "unknown"
    ? requestedSourceStatus
    : clean(matrixPayload?.data_status).toLowerCase() || "unknown";
  const reason = clean(suggestedReply.reason).toLowerCase();
  let freshness = "unknown";
  if (["error", "unavailable", "empty"].includes(sourceStatus)) freshness = "unavailable";
  else if (["continuity_stale", "matrix_stale_or_expired"].includes(reason) || status === "stale") freshness = "stale";
  else if (suggestedReply.available === true) freshness = "fresh";
  else if (status === "active") freshness = "review_required";

  return {
    source: "conversation_matrix",
    source_status: sourceStatus,
    matrix_status: status,
    matrix_version: Number(matrix.version) || 0,
    updated_at: firstText(matrix.state_updated_at, matrix.last_interaction_at) || null,
    expires_at: clean(matrix.state_expires_at) || null,
    freshness,
    context_only: matrixPayload.context_only === true,
    live_truth_wins: matrixPayload.live_truth_wins === true,
  };
}

export function buildRuntimeControlProjection(source = {}) {
  const live = clean(source.status).toLowerCase() === "live" && source.controls && typeof source.controls === "object";
  const lineKill = live ? source.controls.line_oa_auto_reply === true : null;
  const globalKill = live ? source.controls.all_kenji_mutations === true : null;
  const copyAllowed = live && !lineKill && !globalKill;
  return {
    status: live ? "live" : "unavailable",
    line_oa_kill_switch: live ? (lineKill ? "active" : "clear") : "unknown",
    all_mutations_kill_switch: live ? (globalKill ? "active" : "clear") : "unknown",
    operator_copy_allowed: copyAllowed,
    reason: !live ? "runtime_control_unavailable" : copyAllowed ? "clear" : "kill_switch_active",
  };
}

function buildContinuityOperatorDraft({
  canonicalClientId = "",
  memory = {},
  matrix = {},
  matrixPayload = {},
  generatedAt = "",
  continuityMode = "off",
  openLoops = [],
  liveTruthDomains = [],
} = {}) {
  const matrixStatus = clean(matrix.matrix_status).toLowerCase();
  const conversationStage = clean(matrix.conversation_stage).toLowerCase();
  const hasOpenThreadEvidence = Boolean(
    clean(matrix.topic)
    || clean(matrix.pending_action)
    || openLoops.length,
  );
  const verifiedIdentity = clean(memory.verification_status).toLowerCase() === "verified";

  return buildKenjiContinuityOperatorDraft({
    evaluated_at: generatedAt,
    channel: firstText(matrix.channel, memory.primary_channel),
    identity: {
      state: isRecordId(canonicalClientId) ? "known" : "review_required",
      confidence: verifiedIdentity ? "high" : "low",
      verified: verifiedIdentity,
      preferred_name: clean(memory.display_name),
    },
    relationship: {
      context: clean(matrix.relationship_context),
      returning_customer: false,
    },
    continuity: {
      decision: matrixStatus === "active" && hasOpenThreadEvidence ? "continuation" : "unknown",
      confidence: matrixStatus === "active" && hasOpenThreadEvidence ? 0.95 : 0,
      topic: clean(matrix.topic),
      conversation_stage: conversationStage,
      matrix_status: matrixStatus,
      matrix_version: Number(matrix.version) || 0,
      updated_at: firstText(matrix.state_updated_at, matrix.last_interaction_at),
      expires_at: clean(matrix.state_expires_at),
      live_truth_domains: liveTruthDomains,
      context_only: matrixPayload.context_only === true,
      live_truth_wins: matrixPayload.live_truth_wins === true,
    },
    safety: {
      review_required: matrixStatus === "review_required"
        || matrixStatus === "ambiguous"
        || conversationStage === "awaiting_review",
      stale: matrixStatus === "stale" || conversationStage === "stale_needs_refresh",
      handoff_required: boolish(matrix.handoff_required),
      live_truth_required: boolish(matrix.live_truth_required),
    },
  }, {
    mode: continuityMode,
    now: generatedAt,
  });
}

function buildNotices({ memory = {}, matrix = {}, openLoops = [], liveTruthDomains = [] } = {}) {
  const notices = [];
  const matrixRef = clean(matrix.record_id) ? [`matrix:${clean(matrix.record_id)}`] : [];
  const memoryRef = clean(memory.record_id) ? [`memory:${clean(memory.record_id)}`] : [];

  for (const message of openLoops.slice(0, 6)) {
    notices.push({
      type: "open_loop",
      severity: "attention",
      message,
      evidence_refs: matrixRef,
    });
  }

  if (boolish(matrix.handoff_required)) {
    notices.push({
      type: "handoff_required",
      severity: "attention",
      message: clean(matrix.handoff_reason) || "ต้องให้ Per ตรวจต่อ",
      evidence_refs: matrixRef,
    });
  }

  if (boolish(matrix.live_truth_required)) {
    notices.push({
      type: "live_truth_required",
      severity: "attention",
      message: liveTruthDomains.length
        ? `ต้องตรวจ canonical state: ${liveTruthDomains.join(", ")}`
        : "ต้องตรวจ canonical state ก่อนดำเนินการต่อ",
      evidence_refs: matrixRef,
    });
  }

  const access = clean(memory.access_status).toLowerCase();
  if (/blocked|suspended|revoked/.test(access)) {
    notices.push({
      type: "access_restricted",
      severity: "critical",
      message: `Access status: ${clean(memory.access_status)}`,
      evidence_refs: memoryRef,
    });
  }

  const membership = clean(memory.membership_status).toLowerCase();
  if (/expired|inactive/.test(membership)) {
    notices.push({
      type: "membership_attention",
      severity: "attention",
      message: `Membership status: ${clean(memory.membership_status)}`,
      evidence_refs: memoryRef,
    });
  }

  const paymentContext = [matrix.topic, matrix.subtopic, matrix.pending_action, matrix.pending_reference]
    .map(clean)
    .join(" ")
    .toLowerCase();
  if (/payment|pay|slip|โอน|ชำระ|ยอด/.test(paymentContext)) {
    notices.push({
      type: "payment_context",
      severity: "attention",
      message: clean(matrix.pending_action) || "มี payment context ที่ต้องตรวจ canonical payment truth",
      evidence_refs: matrixRef,
    });
  }

  return notices.slice(0, 10);
}

function buildNextBestAction({ clientId, memory = {}, matrix = {}, openLoops = [] } = {}) {
  const matrixRef = clean(matrix.record_id) ? [`matrix:${clean(matrix.record_id)}`] : [];
  const memoryRef = clean(memory.record_id) ? [`memory:${clean(memory.record_id)}`] : [];

  if (boolish(matrix.handoff_required)) {
    return {
      action: "review_handoff",
      label: "ตรวจเคสที่ต้องรับช่วง",
      reason: clean(matrix.handoff_reason) || "Conversation Matrix ระบุว่าต้อง handoff",
      mode: "ready_for_per",
      confidence: 1,
      target_url: `/internal/admin/member-intelligence?client_id=${encodeURIComponent(clientId)}`,
      evidence_refs: matrixRef,
    };
  }

  const pendingAction = clean(matrix.pending_action);
  if (pendingAction) {
    return {
      action: normalizeAction(pendingAction),
      label: pendingAction,
      reason: "Conversation Matrix มี pending action ที่ยังไม่ปิด",
      mode: "ready_for_per",
      confidence: 0.95,
      target_url: targetForAction(pendingAction, clientId),
      evidence_refs: matrixRef,
    };
  }

  const access = clean(memory.access_status).toLowerCase();
  if (/blocked|suspended|revoked/.test(access)) {
    return {
      action: "review_access",
      label: "ตรวจ Access",
      reason: `Canonical access snapshot is ${clean(memory.access_status)}`,
      mode: "ready_for_per",
      confidence: 1,
      target_url: `/internal/admin/membership-access?client_id=${encodeURIComponent(clientId)}`,
      evidence_refs: memoryRef,
    };
  }

  const membership = clean(memory.membership_status).toLowerCase();
  if (/expired|inactive/.test(membership)) {
    return {
      action: "review_renewal",
      label: "ตรวจการต่ออายุ",
      reason: `Canonical membership snapshot is ${clean(memory.membership_status)}`,
      mode: "ready_for_per",
      confidence: 1,
      target_url: `/internal/admin/membership-access?client_id=${encodeURIComponent(clientId)}`,
      evidence_refs: memoryRef,
    };
  }

  if (openLoops.length) {
    return {
      action: "review_open_loop",
      label: "ตรวจเรื่องที่ยังค้าง",
      reason: openLoops[0],
      mode: "ready_for_per",
      confidence: 0.9,
      target_url: `/internal/admin/member-intelligence?client_id=${encodeURIComponent(clientId)}`,
      evidence_refs: matrixRef,
    };
  }

  return null;
}

function buildFollowUp({ matrix = {}, openLoops = [] } = {}) {
  const awaiting = clean(matrix.awaiting_from).toLowerCase();
  const pendingAction = clean(matrix.pending_action).toLowerCase();

  if (awaiting === "per" || awaiting === "owner") {
    return {
      recommended: false,
      reason: "owner_action_required",
      timing: null,
    };
  }

  if (/follow.?up|remind|ทัก|ติดตาม/.test(pendingAction)) {
    return {
      recommended: true,
      reason: "conversation_matrix_follow_up_pending",
      timing: "review_now",
    };
  }

  if ((awaiting === "customer" || awaiting === "client") && openLoops.length) {
    return {
      recommended: true,
      reason: "waiting_on_customer_with_open_loop",
      timing: "review_now",
    };
  }

  return {
    recommended: false,
    reason: openLoops.length ? "review_open_loop_before_follow_up" : "no_verified_follow_up_signal",
    timing: null,
  };
}

function buildDeterministicSummary(memory = {}, matrix = {}) {
  const parts = [];
  const membership = clean(memory.membership_status);
  const access = clean(memory.access_status);
  const intent = clean(matrix.last_customer_intent);
  if (membership) parts.push(`Membership: ${membership}`);
  if (access) parts.push(`Access: ${access}`);
  if (intent) parts.push(`Latest intent: ${intent}`);
  return parts.join(" · ");
}

function targetForAction(action, clientId) {
  const value = clean(action).toLowerCase();
  const q = `client_id=${encodeURIComponent(clientId)}`;
  if (/payment|pay|slip|โอน|ชำระ|ยอด/.test(value)) return `/internal/admin/payments?${q}`;
  if (/member|renew|access|entitlement|ต่ออายุ|สิทธิ์/.test(value)) return `/internal/admin/membership-access?${q}`;
  if (/session|booking|job|จอง|งาน/.test(value)) return `/internal/admin/jobs/create-session?${q}`;
  if (/reply|message|kenji|ตอบ|ข้อความ/.test(value)) return `/internal/admin/kenji?${q}`;
  return `/internal/admin/member-intelligence?${q}`;
}

function normalizeAction(value) {
  const normalized = clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || "review_pending_action";
}

async function readKenjiSource(request, env, path, params = {}) {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = "";
  for (const [key, value] of Object.entries(params)) {
    if (clean(value)) url.searchParams.set(key, clean(value));
  }

  try {
    const response = await handleKenjiControlRequest(
      new Request(url.toString(), {
        method: "GET",
        headers: { accept: "application/json" },
      }),
      env,
    );
    const payload = await response.json().catch(() => ({}));
    return {
      type: sourceType(path, params),
      status: response.ok ? "live" : "error",
      http_status: response.status,
      payload,
    };
  } catch (error) {
    return {
      type: sourceType(path, params),
      status: "error",
      http_status: 503,
      payload: {},
      error: clean(error?.message || error) || "source_unavailable",
    };
  }
}

function sourceType(path, params = {}) {
  if (path === KENJI_CONTROL_ENDPOINTS.memory) return "customer_memory";
  if (clean(params.view).toLowerCase() === "matrix") return "conversation_matrix";
  return "conversation_events";
}

function sourceSummary(...sources) {
  return sources.map((source) => compact({
    type: source.type,
    status: source.status,
    data_status: source.payload?.data_status,
    http_status: source.http_status,
    error: source.error,
  }));
}

function sourceDataStatus(source = {}) {
  if (clean(source.status).toLowerCase() !== "live") return clean(source.status) || "error";
  return clean(source.payload?.data_status).toLowerCase() || "live";
}

async function readRuntimeControlSource(env = {}) {
  try {
    return {
      type: "kenji_runtime_controls",
      status: "live",
      controls: await readKenjiRuntimeControls(env),
    };
  } catch (error) {
    return {
      type: "kenji_runtime_controls",
      status: "unavailable",
      controls: null,
      error: clean(error?.message || error) || "runtime_control_unavailable",
    };
  }
}

function emptyCurrentState() {
  return {
    membership: { status: "unknown" },
    payment: { status: "unknown", source: "canonical_payment_not_connected", authority: "canonical_backend" },
    access: { status: "unknown" },
    session: { status: "unknown" },
  };
}

function emptyAdvisory(reason, continuityMode = "off", runtimeControlSource = {}) {
  const suggestedReply = {
    ...buildKenjiContinuityOperatorDraft({}, { mode: continuityMode }),
    reason,
  };
  return {
    summary: "",
    notices: [],
    next_best_action: null,
    suggested_reply: suggestedReply,
    continuity_status: buildContinuityStatus({
      matrixSourceStatus: "empty",
      suggestedReply,
    }),
    runtime_controls: buildRuntimeControlProjection(runtimeControlSource),
    follow_up: {
      recommended: false,
      reason,
      timing: null,
    },
    advisory_only: true,
    analysis_basis: "deterministic_context_v1",
  };
}

function authorityProjection() {
  return {
    payment: "canonical_backend",
    membership: "resolver",
    access: "resolver",
    ai: "advisory",
  };
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(clean).filter(Boolean).slice(0, 12);
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function compact(value) {
  const out = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (item === undefined || item === null || item === "") continue;
    out[key] = item;
  }
  return out;
}

function boolish(value) {
  if (value === true) return true;
  const normalized = clean(value).toLowerCase();
  return ["true", "1", "yes", "y", "required"].includes(normalized);
}

function firstText(...values) {
  return values.map(clean).find(Boolean) || "";
}

function isRecordId(value) {
  return /^rec[A-Za-z0-9]{14}$/.test(clean(value));
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizePath(pathname = "") {
  const value = String(pathname || "/").replace(/\/{2,}/g, "/");
  return value.length > 1 ? value.replace(/\/+$/g, "") : value;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
      "x-mmd-client-intelligence": "advisory-v1",
    },
  });
}
