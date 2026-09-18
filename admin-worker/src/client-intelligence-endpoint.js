import {
  handleKenjiControlRequest,
  KENJI_CONTROL_ENDPOINTS,
} from "./kenji-control-endpoints.js";

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

  const [memorySource, matrixSource, conversationsSource] = await Promise.all([
    readKenjiSource(request, env, KENJI_CONTROL_ENDPOINTS.memory, { client_id: clientId }),
    readKenjiSource(request, env, KENJI_CONTROL_ENDPOINTS.conversations, {
      client_id: clientId,
      view: "matrix",
    }),
    readKenjiSource(request, env, KENJI_CONTROL_ENDPOINTS.conversations, {
      client_id: clientId,
      limit: "8",
    }),
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
      ai: emptyAdvisory("canonical_client_not_resolved"),
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

  return {
    ok: true,
    client_id: canonicalClientId,
    generated_at: generatedAt,
    identity: {
      status: isRecordId(canonicalClientId) ? "canonical" : "identity_review",
      display_name: clean(memory.display_name),
      confidence: isRecordId(canonicalClientId) ? 1 : 0,
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
      suggested_reply: {
        available: false,
        text: null,
        channel: firstText(matrix.channel, memory.primary_channel),
        send_allowed: false,
        reason: "reply_generation_not_connected",
      },
      follow_up: followUp,
      advisory_only: true,
      analysis_basis: "deterministic_context_v1",
    },
    unresolved,
    sources: [],
    authority: authorityProjection(),
  };
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
    http_status: source.http_status,
    error: source.error,
  }));
}

function emptyCurrentState() {
  return {
    membership: { status: "unknown" },
    payment: { status: "unknown", source: "canonical_payment_not_connected", authority: "canonical_backend" },
    access: { status: "unknown" },
    session: { status: "unknown" },
  };
}

function emptyAdvisory(reason) {
  return {
    summary: "",
    notices: [],
    next_best_action: null,
    suggested_reply: {
      available: false,
      text: null,
      channel: "",
      send_allowed: false,
      reason,
    },
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
