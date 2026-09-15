import {
  buildConversationMatrixV1,
  inferLiveTruthDomains,
  resolveConversationContinuityV1,
} from "../../shared/kenji-conversation-matrix.mjs";

const MATRIX_TABLE_FALLBACK = "tblS6iRgPjYLBqZJh";
const CLIENTS_TABLE_FALLBACK = "tblVv58TCbwh5j1fS";
const LINE_CHANNEL = "line_ofc";
const AIRTABLE_READ_TIMEOUT_MS = 700;
const AIRTABLE_WRITE_RECOVERY_TIMEOUT_MS = 1600;
const MATRIX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const F = Object.freeze({
  MATRIX_ID: "matrix_id",
  MATRIX_CLIENT: "Client",
  MATRIX_SCHEMA: "schema_version",
  MATRIX_CONVERSATION_HASH: "conversation_id_hash",
  MATRIX_CHANNEL: "channel",
  MATRIX_SCOPE: "conversation_scope",
  MATRIX_TOPIC: "topic",
  MATRIX_SUBTOPIC: "subtopic",
  MATRIX_RELATIONSHIP: "relationship_context",
  MATRIX_LAST_INTENT: "last_customer_intent",
  MATRIX_LAST_REQUEST: "last_customer_request",
  MATRIX_LAST_CUSTOMER_ACTION: "last_customer_action",
  MATRIX_LAST_KENJI_ACTION: "last_kenji_action",
  MATRIX_LAST_OUTCOME: "last_confirmed_outcome",
  MATRIX_STAGE: "conversation_stage",
  MATRIX_AWAITING: "awaiting_from",
  MATRIX_PENDING_ACTION: "pending_action",
  MATRIX_PENDING_REF: "pending_reference",
  MATRIX_CONTINUITY: "continuity_summary",
  MATRIX_DONT_ASK: "do_not_ask_again_json",
  MATRIX_OPEN_LOOPS: "important_open_loops_json",
  MATRIX_HANDOFF_REQUIRED: "handoff_required",
  MATRIX_HANDOFF_OWNER: "handoff_owner",
  MATRIX_HANDOFF_REASON: "handoff_reason",
  MATRIX_TRUTH_REQUIRED: "live_truth_required",
  MATRIX_TRUTH_DOMAINS: "live_truth_domains",
  MATRIX_LAST_EVENT: "last_event_id",
  MATRIX_LAST_INTERACTION: "last_interaction_at",
  MATRIX_UPDATED_AT: "state_updated_at",
  MATRIX_EXPIRES_AT: "state_expires_at",
  MATRIX_STATUS: "matrix_status",
  MATRIX_VERSION: "version",
  MATRIX_PAYLOAD: "payload_json",
  CLIENT_LINE_USER_ID: "line_user_id",
});

const WEAK_INTENTS = new Set(["", "unknown", "note_only", "line_event"]);
const TERMINAL_AUTO_REPLY_INTENTS = new Set([
  "mmd_companion",
  "mms_wellness",
  "partner_venue",
  "privacy_request",
  "greeting",
]);

function text(value) {
  return value == null ? "" : String(value).trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean);
    } catch (_) {
      return value.split(",").map(text).filter(Boolean);
    }
  }
  return [];
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function eventText(event = {}) {
  if (event?.type === "message" && event?.message?.type === "text") return text(event.message.text);
  if (event?.type === "postback") return text(event?.postback?.displayText || event?.postback?.data);
  return "";
}

function lineUserIdOf(event = {}) {
  return event?.source?.type === "user" ? text(event?.source?.userId) : "";
}

function matrixTable(env = {}) {
  return text(env.AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID || MATRIX_TABLE_FALLBACK);
}

function clientsTable(env = {}) {
  return text(env.AIRTABLE_TABLE_CLIENTS_ID || CLIENTS_TABLE_FALLBACK);
}

function escapeFormulaValue(value) {
  return text(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(text(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function airtableList(env = {}, table = "", params = {}, timeoutMs = AIRTABLE_READ_TIMEOUT_MS) {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const tableId = text(table);
  if (!apiKey || !baseId || !tableId) return { ok: false, records: [], reason: "airtable_env_missing" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_matrix_timeout"), timeoutMs);
  try {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    const response = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, records: [], reason: "airtable_read_failed", status: response.status };
    const payload = await response.json().catch(() => ({}));
    return { ok: true, records: Array.isArray(payload?.records) ? payload.records : [] };
  } catch (_) {
    return { ok: false, records: [], reason: "airtable_read_failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function airtableWrite(env = {}, table = "", method = "POST", body = {}) {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const tableId = text(table);
  if (!apiKey || !baseId || !tableId) return { ok: false, reason: "airtable_env_missing" };
  try {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return { ok: false, reason: "airtable_write_failed", status: response.status };
    const payload = await response.json().catch(() => ({}));
    return { ok: true, payload };
  } catch (_) {
    return { ok: false, reason: "airtable_write_failed" };
  }
}

function mapMatrixRecord(row = null) {
  if (!row?.fields) return null;
  const x = row.fields;
  return buildConversationMatrixV1({
    matrix_id: x[F.MATRIX_ID],
    client_record_id: Array.isArray(x[F.MATRIX_CLIENT]) ? x[F.MATRIX_CLIENT][0] : "",
    conversation_id_hash: x[F.MATRIX_CONVERSATION_HASH],
    channel: x[F.MATRIX_CHANNEL],
    conversation_scope: x[F.MATRIX_SCOPE],
    topic: x[F.MATRIX_TOPIC],
    subtopic: x[F.MATRIX_SUBTOPIC],
    relationship_context: x[F.MATRIX_RELATIONSHIP],
    last_customer_intent: x[F.MATRIX_LAST_INTENT],
    last_customer_request: x[F.MATRIX_LAST_REQUEST],
    last_customer_action: x[F.MATRIX_LAST_CUSTOMER_ACTION],
    last_kenji_action: x[F.MATRIX_LAST_KENJI_ACTION],
    last_confirmed_outcome: x[F.MATRIX_LAST_OUTCOME],
    conversation_stage: x[F.MATRIX_STAGE],
    awaiting_from: x[F.MATRIX_AWAITING],
    pending_action: x[F.MATRIX_PENDING_ACTION],
    pending_reference: x[F.MATRIX_PENDING_REF],
    continuity_summary: x[F.MATRIX_CONTINUITY],
    do_not_ask_again_json: x[F.MATRIX_DONT_ASK],
    important_open_loops_json: x[F.MATRIX_OPEN_LOOPS],
    handoff_required: x[F.MATRIX_HANDOFF_REQUIRED],
    handoff_owner: x[F.MATRIX_HANDOFF_OWNER],
    handoff_reason: x[F.MATRIX_HANDOFF_REASON],
    live_truth_required: x[F.MATRIX_TRUTH_REQUIRED],
    live_truth_domains: x[F.MATRIX_TRUTH_DOMAINS],
    last_event_id: x[F.MATRIX_LAST_EVENT],
    last_interaction_at: x[F.MATRIX_LAST_INTERACTION],
    state_updated_at: x[F.MATRIX_UPDATED_AT],
    state_expires_at: x[F.MATRIX_EXPIRES_AT],
    matrix_status: x[F.MATRIX_STATUS],
    version: x[F.MATRIX_VERSION],
  });
}

async function findMatrix(env, conversationHash, timeoutMs = AIRTABLE_READ_TIMEOUT_MS) {
  const result = await airtableList(env, matrixTable(env), {
    pageSize: 1,
    filterByFormula: `{${F.MATRIX_CONVERSATION_HASH}}=\"${escapeFormulaValue(conversationHash)}\"`,
  }, timeoutMs);
  return { ...result, record: result.records[0] || null };
}

async function findClientRecordId(env, lineUserId) {
  const result = await airtableList(env, clientsTable(env), {
    pageSize: 1,
    filterByFormula: `{${F.CLIENT_LINE_USER_ID}}=\"${escapeFormulaValue(lineUserId)}\"`,
  });
  return result.ok ? text(result.records[0]?.id) : "";
}

function defaultMatrix({ conversationHash = "", clientRecordId = "", relationshipContext = "new_contact", now = "" } = {}) {
  const stamp = text(now) || new Date().toISOString();
  return buildConversationMatrixV1({
    matrix_id: `kcm1_line_${conversationHash.slice(0, 20)}`,
    client_record_id: clientRecordId,
    conversation_id_hash: conversationHash,
    channel: LINE_CHANNEL,
    conversation_scope: `line:${conversationHash.slice(0, 20)}`,
    relationship_context: relationshipContext,
    conversation_stage: "new_topic",
    awaiting_from: "none",
    matrix_status: "active",
    state_updated_at: stamp,
    version: 0,
  });
}

function deriveEffectiveIntent(resolution = {}, matrix = {}, currentIntent = "") {
  const current = text(currentIntent).toLowerCase();
  const previous = text(matrix.last_customer_intent).toLowerCase();
  const continuationLike = ["continuation", "stale_refresh"].includes(text(resolution.decision));
  if (!continuationLike) return current;
  if (!WEAK_INTENTS.has(current)) return current;

  const statusCue = text(resolution.reason) === "continuation_cue_with_open_thread";
  const stage = text(matrix.conversation_stage);
  if (statusCue || stage === "awaiting_payment_verification") {
    if (stage === "awaiting_payment_verification" || previous.startsWith("payment") || previous === "membership_renewal") return "payment_status";
    if (["points", "points_status"].includes(previous)) return "points_status";
    if (previous === "model_access_verification") return "model_access_verification";
    if (/membership|vip|svip|black_card/.test(previous) || stage === "awaiting_entitlement_refresh") return "membership_status";
  }
  return previous || current;
}

export async function resolveKenjiLineContinuity({ env = {}, event = {}, currentIntent = "", now = "" } = {}) {
  const stamp = text(now) || new Date().toISOString();
  const lineUserId = lineUserIdOf(event);
  const current = text(currentIntent).toLowerCase();
  if (!lineUserId) {
    const matrix = defaultMatrix({ conversationHash: "", relationshipContext: "unknown", now: stamp });
    const resolution = resolveConversationContinuityV1({ matrix, message: eventText(event), current_intent: current, now: stamp });
    return { ...resolution, effective_intent: current, matrix, matrix_record_id: "", conversation_hash: "", client_record_id: "", storage_status: "unavailable", available: false };
  }

  const conversationHash = await sha256Hex(`line_ofc:${lineUserId}`);
  const lookup = await findMatrix(env, conversationHash);
  if (!lookup.ok) {
    const matrix = defaultMatrix({ conversationHash, relationshipContext: "unknown", now: stamp });
    const resolution = resolveConversationContinuityV1({ matrix, message: eventText(event), current_intent: current, now: stamp });
    return {
      ...resolution,
      effective_intent: current,
      matrix,
      matrix_record_id: "",
      conversation_hash: conversationHash,
      client_record_id: "",
      storage_status: lookup.reason || "unavailable",
      available: false,
    };
  }

  let matrix = mapMatrixRecord(lookup.record);
  let clientRecordId = text(matrix?.client_record_id);
  if (!matrix) {
    clientRecordId = await findClientRecordId(env, lineUserId);
    matrix = defaultMatrix({
      conversationHash,
      clientRecordId,
      relationshipContext: clientRecordId ? "known_customer" : "new_contact",
      now: stamp,
    });
  }

  const resolution = resolveConversationContinuityV1({
    matrix,
    message: eventText(event),
    current_intent: current,
    now: stamp,
  });
  const effectiveIntent = deriveEffectiveIntent(resolution, matrix, current);
  return {
    ...resolution,
    effective_intent: effectiveIntent,
    matrix,
    matrix_record_id: text(lookup.record?.id),
    conversation_hash: conversationHash,
    client_record_id: clientRecordId,
    storage_status: "ready",
    available: true,
  };
}

function stageForTurn({ continuity = {}, decision = {}, delivered = false, attempted = false, truthDomains = [] } = {}) {
  const intent = text(decision.intent).toLowerCase();
  if (text(continuity.decision) === "stale_refresh") return "stale_needs_refresh";
  if (attempted && !delivered) return "awaiting_review";
  if (decision.handoff_required === true) {
    if (truthDomains.includes("payment")) return "awaiting_payment_verification";
    if (truthDomains.some((domain) => ["membership", "entitlement", "points", "model_visibility"].includes(domain))) return "awaiting_entitlement_refresh";
    if (truthDomains.includes("pricing")) return "awaiting_per";
    if (truthDomains.some((domain) => ["booking", "availability"].includes(domain))) return "awaiting_review";
    return "handoff";
  }
  if (delivered && decision.live_truth_verified === true && ["membership_status", "points_status"].includes(intent)) return "resolved";
  if (delivered && ["membership_signup", "membership_renewal"].includes(intent)) return "awaiting_customer";
  if (delivered && TERMINAL_AUTO_REPLY_INTENTS.has(intent)) return "resolved";
  if (text(continuity.decision) === "continuation" && text(continuity.conversation_stage)) return text(continuity.conversation_stage);
  return "in_progress";
}

function awaitingFromForStage(stage = "") {
  if (stage === "awaiting_payment_verification") return "payment_authority";
  if (stage === "awaiting_entitlement_refresh") return "entitlement_authority";
  if (stage === "awaiting_per") return "mmd_review";
  if (["awaiting_review", "handoff", "stale_needs_refresh"].includes(stage)) return "mmd_review";
  if (stage === "awaiting_customer") return "customer";
  return "none";
}

function pendingActionFor({ stage = "", intent = "" } = {}) {
  if (stage === "awaiting_payment_verification") return "refresh payment truth before answering status";
  if (stage === "awaiting_entitlement_refresh") return "refresh entitlement truth before answering status";
  if (stage === "awaiting_per") return "continue Per review before customer-facing pricing answer";
  if (stage === "awaiting_review") return "continue protected truth review before replying";
  if (stage === "handoff") return "continue human review/handoff";
  if (stage === "stale_needs_refresh") return "refresh stale conversation and protected current truth before replying";
  if (stage === "awaiting_customer") return /renewal/.test(intent) ? "wait for customer renewal action" : "wait for customer next action";
  return stage === "resolved" ? "" : "continue current conversation";
}

function actionForIntent(intent = "", continuity = {}) {
  const value = text(intent).toLowerCase();
  if (text(continuity.decision) === "continuation") return "followed_up_on_open_thread";
  if (value === "payment_slip") return "submitted_payment_proof";
  if (value === "membership_renewal") return "requested_membership_renewal";
  if (value === "membership_signup") return "requested_membership_signup";
  if (value === "availability_request") return "requested_availability_review";
  if (value === "pricing_review") return "requested_pricing_review";
  return value ? `asked:${value}`.slice(0, 160) : "customer_message_received";
}

function doNotAskForTurn(intent = "", continuity = {}) {
  const base = text(continuity.decision) === "continuation" ? list(continuity.do_not_ask_again) : [];
  const value = text(intent).toLowerCase();
  if (value === "payment_slip") base.push("payment_proof");
  if (value === "membership_renewal") base.push("renewal_intent");
  if (value === "membership_signup") base.push("membership_signup_intent");
  return unique(base);
}

function openLoopsForTurn({ intent = "", continuity = {}, stage = "", handoffRequired = false } = {}) {
  const loops = text(continuity.decision) === "continuation" || text(continuity.decision) === "stale_refresh"
    ? list(continuity.important_open_loops)
    : [];
  const value = text(intent).toLowerCase();
  if (stage === "awaiting_payment_verification") loops.push("payment_verification");
  if (stage === "awaiting_entitlement_refresh") loops.push(value.startsWith("points") ? "points_refresh" : "entitlement_refresh");
  if (stage === "awaiting_per") loops.push("pricing_review");
  if (stage === "awaiting_review") loops.push(/availability|booking/.test(value) ? "availability_review" : "protected_truth_review");
  if (stage === "handoff" || handoffRequired) loops.push("handoff_review");
  if (stage === "awaiting_customer") loops.push(/renewal/.test(value) ? "renewal_customer_action" : "customer_action");
  if (stage === "resolved") return [];
  return unique(loops);
}

function handoffOwnerFor(stage = "") {
  return ["awaiting_payment_verification", "awaiting_entitlement_refresh", "awaiting_per", "awaiting_review", "handoff", "stale_needs_refresh"].includes(stage)
    ? "Per"
    : "none";
}

function continuitySummaryFor({ continuity = {}, intent = "", stage = "", delivered = false, handoffRequired = false } = {}) {
  const topic = text(continuity.topic) || text(intent) || "general";
  const prefix = text(continuity.decision) === "continuation" ? "Continued existing" : "Started";
  const outcome = handoffRequired
    ? `Protected/current truth is pending review at ${stage}.`
    : delivered
      ? `Kenji reply was delivered; state is ${stage}.`
      : `No customer-facing confirmation was made; state is ${stage}.`;
  return `${prefix} ${topic} conversation. ${outcome}`.slice(0, 1200);
}

export function buildKenjiPostTurnMatrix({
  continuity = {},
  decision = {},
  delivered = false,
  attempted = false,
  lastEventId = "",
  now = "",
} = {}) {
  const stamp = text(now) || new Date().toISOString();
  const prior = continuity.matrix || {};
  const intent = text(decision.intent || continuity.effective_intent || continuity.current_intent).toLowerCase();
  const truthDomains = unique([
    ...list(continuity.live_truth_domains),
    ...inferLiveTruthDomains(intent),
  ]);
  const stage = stageForTurn({ continuity, decision, delivered, attempted, truthDomains });
  const awaitingFrom = awaitingFromForStage(stage);
  const pendingAction = pendingActionFor({ stage, intent });
  const loops = openLoopsForTurn({ intent, continuity, stage, handoffRequired: decision.handoff_required === true });
  const version = Math.max(0, Number(prior.version) || 0) + 1;

  return buildConversationMatrixV1({
    matrix_id: text(prior.matrix_id) || `kcm1_line_${text(continuity.conversation_hash).slice(0, 20)}`,
    client_record_id: text(continuity.client_record_id || prior.client_record_id),
    conversation_id_hash: text(continuity.conversation_hash || prior.conversation_id_hash),
    channel: LINE_CHANNEL,
    conversation_scope: text(prior.conversation_scope) || `line:${text(continuity.conversation_hash).slice(0, 20)}`,
    topic: text(continuity.topic) || text(prior.topic) || intent || "general",
    subtopic: text(continuity.subtopic) || text(prior.subtopic),
    relationship_context: text(prior.relationship_context) || (continuity.client_record_id ? "known_customer" : "new_contact"),
    last_customer_intent: intent,
    last_customer_request: text(continuity.decision) === "continuation" ? "continuation status/follow-up" : `intent:${intent || "unknown"}`,
    last_customer_action: actionForIntent(intent, continuity),
    last_kenji_action: decision.handoff_required === true
      ? "handoff_requested"
      : delivered
        ? `replied:${text(decision.reply_source) || "deterministic"}`
        : attempted
          ? "reply_delivery_failed"
          : `no_reply:${text(decision.guard_reason) || "not_eligible"}`,
    last_confirmed_outcome: decision.handoff_required === true
      ? "handoff_pending; protected current truth not confirmed"
      : delivered && decision.live_truth_verified === true
        ? `customer_reply_sent; current truth confirmed by ${text(decision.truth_authority) || "canonical authority"}`
        : delivered
          ? "customer_reply_sent; no protected truth granted from memory"
          : attempted
            ? "reply_delivery_failed"
            : "no_customer_reply",
    conversation_stage: stage,
    awaiting_from: awaitingFrom,
    pending_action: pendingAction,
    pending_reference: text(lastEventId),
    continuity_summary: continuitySummaryFor({
      continuity,
      intent,
      stage,
      delivered,
      handoffRequired: decision.handoff_required === true,
    }),
    do_not_ask_again: doNotAskForTurn(intent, continuity),
    important_open_loops: loops,
    handoff_required: decision.handoff_required === true || ["awaiting_payment_verification", "awaiting_entitlement_refresh", "awaiting_per", "awaiting_review", "handoff", "stale_needs_refresh"].includes(stage),
    handoff_owner: handoffOwnerFor(stage),
    handoff_reason: text(decision.handoff_reason || decision.guard_reason),
    live_truth_required: Boolean(truthDomains.length || continuity.live_truth_required),
    live_truth_domains: truthDomains,
    last_event_id: text(lastEventId || prior.last_event_id),
    last_interaction_at: stamp,
    state_updated_at: stamp,
    state_expires_at: new Date(Date.parse(stamp) + MATRIX_TTL_MS).toISOString(),
    matrix_status: stage === "resolved" ? "resolved" : stage === "stale_needs_refresh" ? "stale" : "active",
    version,
  });
}

function matrixFields(matrix = {}, continuity = {}, decision = {}, delivered = false, attempted = false) {
  const clientRecordId = text(continuity.client_record_id || matrix.client_record_id);
  return {
    [F.MATRIX_ID]: matrix.matrix_id,
    ...(clientRecordId ? { [F.MATRIX_CLIENT]: [clientRecordId] } : {}),
    [F.MATRIX_SCHEMA]: matrix.schema,
    [F.MATRIX_CONVERSATION_HASH]: matrix.conversation_id_hash,
    [F.MATRIX_CHANNEL]: matrix.channel,
    [F.MATRIX_SCOPE]: matrix.conversation_scope,
    [F.MATRIX_TOPIC]: matrix.topic,
    [F.MATRIX_SUBTOPIC]: matrix.subtopic,
    [F.MATRIX_RELATIONSHIP]: matrix.relationship_context,
    [F.MATRIX_LAST_INTENT]: matrix.last_customer_intent,
    [F.MATRIX_LAST_REQUEST]: matrix.last_customer_request,
    [F.MATRIX_LAST_CUSTOMER_ACTION]: matrix.last_customer_action,
    [F.MATRIX_LAST_KENJI_ACTION]: matrix.last_kenji_action,
    [F.MATRIX_LAST_OUTCOME]: matrix.last_confirmed_outcome,
    [F.MATRIX_STAGE]: matrix.conversation_stage,
    [F.MATRIX_AWAITING]: matrix.awaiting_from,
    [F.MATRIX_PENDING_ACTION]: matrix.pending_action,
    [F.MATRIX_PENDING_REF]: matrix.pending_reference,
    [F.MATRIX_CONTINUITY]: matrix.continuity_summary,
    [F.MATRIX_DONT_ASK]: JSON.stringify(matrix.do_not_ask_again || []),
    [F.MATRIX_OPEN_LOOPS]: JSON.stringify(matrix.important_open_loops || []),
    [F.MATRIX_HANDOFF_REQUIRED]: matrix.handoff_required,
    [F.MATRIX_HANDOFF_OWNER]: matrix.handoff_owner,
    [F.MATRIX_HANDOFF_REASON]: matrix.handoff_reason,
    [F.MATRIX_TRUTH_REQUIRED]: matrix.live_truth_required,
    [F.MATRIX_TRUTH_DOMAINS]: matrix.live_truth_domains,
    [F.MATRIX_LAST_EVENT]: matrix.last_event_id,
    [F.MATRIX_LAST_INTERACTION]: matrix.last_interaction_at,
    [F.MATRIX_UPDATED_AT]: matrix.state_updated_at,
    [F.MATRIX_EXPIRES_AT]: matrix.state_expires_at,
    [F.MATRIX_STATUS]: matrix.matrix_status,
    [F.MATRIX_VERSION]: matrix.version,
    [F.MATRIX_PAYLOAD]: JSON.stringify({
      runtime_schema: "mmd.kenji_line_continuity_runtime.v1",
      continuity_schema: text(continuity.schema),
      continuity_decision: text(continuity.decision),
      continuity_reason: text(continuity.reason),
      effective_intent: text(decision.intent || continuity.effective_intent),
      reply_source: text(decision.reply_source),
      line_delivery_attempted: attempted === true,
      line_delivery_succeeded: delivered === true,
      live_truth_required: matrix.live_truth_required,
      live_truth_domains: matrix.live_truth_domains,
      truth_authority: text(decision.truth_authority),
      truth_status: text(decision.truth_status),
      live_truth_used: decision.live_truth_used === true,
    }),
  };
}

async function recoverContinuityStorageForWrite(env = {}, continuity = {}) {
  if (text(continuity.storage_status) === "ready") return continuity;
  const conversationHash = text(continuity.conversation_hash);
  if (!conversationHash) return continuity;

  const lookup = await findMatrix(env, conversationHash, AIRTABLE_WRITE_RECOVERY_TIMEOUT_MS);
  if (!lookup.ok || !lookup.record) return continuity;
  const matrix = mapMatrixRecord(lookup.record);
  if (!matrix) return continuity;

  return {
    ...continuity,
    matrix,
    matrix_record_id: text(lookup.record.id),
    client_record_id: text(matrix.client_record_id || continuity.client_record_id),
    storage_status: "ready",
    available: true,
    write_recovered: true,
  };
}

export async function writeKenjiLineMatrixTurn({
  env = {},
  continuity = {},
  decision = {},
  delivered = false,
  attempted = false,
  lastEventId = "",
  now = "",
} = {}) {
  const writeContinuity = await recoverContinuityStorageForWrite(env, continuity);
  if (text(writeContinuity.storage_status) !== "ready" || !text(writeContinuity.conversation_hash)) {
    return {
      skipped: true,
      reason: "continuity_storage_unavailable",
      recovery_attempted: text(continuity.storage_status) !== "ready" && Boolean(text(continuity.conversation_hash)),
    };
  }

  const matrix = buildKenjiPostTurnMatrix({ continuity: writeContinuity, decision, delivered, attempted, lastEventId, now });
  const fields = matrixFields(matrix, writeContinuity, decision, delivered, attempted);
  const recordId = text(writeContinuity.matrix_record_id);
  const result = recordId
    ? await airtableWrite(env, matrixTable(env), "PATCH", { records: [{ id: recordId, fields }], typecast: true })
    : await airtableWrite(env, matrixTable(env), "POST", { records: [{ fields }], typecast: true });

  if (!result.ok) return { skipped: true, reason: result.reason, status: result.status, matrix };
  const row = Array.isArray(result.payload?.records) ? result.payload.records[0] : result.payload;
  return {
    id: text(row?.id),
    created: !recordId,
    recovered: writeContinuity.write_recovered === true,
    version: matrix.version,
    stage: matrix.conversation_stage,
    matrix,
  };
}
