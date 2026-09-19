import {
  resolveKenjiLv5LiveContext,
  resolveLiveCanonicalClient,
} from "./kenji-lv5-live-context.js";

export const HYPE_CONTINUITY_PATH = "/__internal/hype/continuity";
export const HYPE_HANDOFF_PATH = "/__internal/hype/handoff";

const MATRIX_TABLE_FALLBACK = "tblS6iRgPjYLBqZJh";
const MATRIX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AIRTABLE_API = "https://api.airtable.com/v0";

const F = Object.freeze({
  MATRIX_ID: "matrix_id",
  CLIENT: "Client",
  SCHEMA: "schema_version",
  HASH: "conversation_id_hash",
  CHANNEL: "channel",
  SCOPE: "conversation_scope",
  TOPIC: "topic",
  SUBTOPIC: "subtopic",
  RELATIONSHIP: "relationship_context",
  LAST_INTENT: "last_customer_intent",
  LAST_REQUEST: "last_customer_request",
  LAST_CUSTOMER_ACTION: "last_customer_action",
  LAST_KENJI_ACTION: "last_kenji_action",
  LAST_OUTCOME: "last_confirmed_outcome",
  STAGE: "conversation_stage",
  AWAITING: "awaiting_from",
  PENDING_ACTION: "pending_action",
  PENDING_REF: "pending_reference",
  CONTINUITY: "continuity_summary",
  DONT_ASK: "do_not_ask_again_json",
  OPEN_LOOPS: "important_open_loops_json",
  HANDOFF_REQUIRED: "handoff_required",
  HANDOFF_OWNER: "handoff_owner",
  HANDOFF_REASON: "handoff_reason",
  TRUTH_REQUIRED: "live_truth_required",
  TRUTH_DOMAINS: "live_truth_domains",
  LAST_EVENT: "last_event_id",
  LAST_INTERACTION: "last_interaction_at",
  UPDATED_AT: "state_updated_at",
  EXPIRES_AT: "state_expires_at",
  STATUS: "matrix_status",
  VERSION: "version",
  PAYLOAD: "payload_json",
});

export async function handleHypeContinuityRpc(request, env = {}) {
  const gate = validateRequest(request, HYPE_CONTINUITY_PATH);
  if (gate) return gate;

  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "invalid_json" }, 400);

  const telegramUserId = telegramId(body.telegram_user_id);
  if (!telegramUserId) return json({ ok: false, error: "telegram_identity_invalid" }, 400);

  const identity = await resolveLiveCanonicalClient(env, { telegram_user_id: telegramUserId }).catch(() => null);
  if (identity?.status !== "resolved" || !recordId(identity?.client?.canonical_client_id)) {
    return json({ ok: false, state: "connect_required", error: "canonical_client_unresolved" }, 404);
  }

  const lineUserId = lineId(identity.client.line_user_id);
  if (!lineUserId) {
    return json({
      ok: true,
      state: "canonical_only",
      persisted: false,
      reason: "line_identity_not_linked",
      canonical_client_id: identity.client.canonical_client_id,
    });
  }

  const projection = normalizeProjection(body.projection);
  const command = token(body.command || body.intent || "status");
  const message = clean(body.customer_message, 500);
  const result = await upsertContinuityMatrix(env, {
    clientRecordId: identity.client.canonical_client_id,
    lineUserId,
    displayName: identity.client.display_name,
    command,
    customerMessage: message,
    projection,
    handoff: null,
  });

  return json({
    ok: result.ok,
    state: result.ok ? "recorded" : "storage_unavailable",
    persisted: result.ok,
    matrix_record_id: result.record_id || null,
    version: result.version || null,
    canonical_client_id: identity.client.canonical_client_id,
    line_continuity_ready: true,
    error: result.ok ? undefined : result.error,
  }, result.ok ? 200 : 503);
}

export async function handleHypeHandoffRpc(request, env = {}) {
  const gate = validateRequest(request, HYPE_HANDOFF_PATH);
  if (gate) return gate;

  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "invalid_json" }, 400);

  const telegramUserId = telegramId(body.telegram_user_id);
  if (!telegramUserId) return json({ ok: false, error: "telegram_identity_invalid" }, 400);

  const target = normalizeTarget(body.target);
  if (!target) return json({ ok: false, error: "handoff_target_invalid" }, 400);

  const customerMessage = clean(body.customer_message, 500);
  const sourceCommand = token(body.command || body.intent || "handoff");
  const context = await resolveKenjiLv5LiveContext(env, {
    telegram_user_id: telegramUserId,
    intent: {
      type: sourceCommand === "handoff" ? "general" : sourceCommand,
      trigger: "telegram_hype_handoff",
      raw: customerMessage,
    },
  }).catch(() => null);

  const canonicalClientId = recordId(context?.client_360?.canonical_client_id);
  if (!canonicalClientId) {
    return json({
      ok: false,
      state: "connect_required",
      error: "canonical_client_unresolved",
      customer_message: "ยังต้องเชื่อม Telegram กับ MY MMD ก่อนจึงจะส่งต่อพร้อมประวัติได้ครับ",
    }, 404);
  }

  const identity = await resolveLiveCanonicalClient(env, { canonical_client_id: canonicalClientId }).catch(() => null);
  const lineUserId = lineId(identity?.client?.line_user_id);
  const projection = buildCanonicalHandoffProjection(context);
  const handoffId = await buildHandoffId(canonicalClientId, target);

  let matrix = { ok: false, error: "line_identity_not_linked" };
  if (lineUserId) {
    matrix = await upsertContinuityMatrix(env, {
      clientRecordId: canonicalClientId,
      lineUserId,
      displayName: clean(context?.client_360?.display_name, 120),
      command: sourceCommand,
      customerMessage,
      projection,
      handoff: {
        id: handoffId,
        target,
        reason: clean(body.reason, 160) || `customer_requested_${target}`,
      },
    });
  }

  return json({
    ok: true,
    state: matrix.ok ? "handoff_ready" : "handoff_ready_without_line_continuity",
    handoff_id: handoffId,
    target,
    display_name: clean(context?.client_360?.display_name, 120),
    canonical_client_id: canonicalClientId,
    line_continuity_ready: Boolean(lineUserId && matrix.ok),
    line_identity_present: Boolean(lineUserId),
    matrix_record_id: matrix.record_id || null,
    continuity_version: matrix.version || null,
    context: projection,
    operator_summary: buildOperatorSummary({
      target,
      displayName: context?.client_360?.display_name,
      customerMessage,
      projection,
      handoffId,
    }),
    resume: {
      customer_does_not_need_to_repeat: true,
      kenji_line_url: "https://lin.ee/xRqsALs",
      owner_route: "/internal/admin/kenji",
      live_truth_refresh_required: true,
    },
    guardrails: {
      business_truth_mutated: false,
      payment_mutated: false,
      job_mutated: false,
      entitlement_mutated: false,
      raw_private_notes_included: false,
      handoff_context_only: true,
    },
  });
}

async function upsertContinuityMatrix(env, input = {}) {
  const hash = await sha256Hex(`line_ofc:${input.lineUserId}`);
  const existing = await findMatrix(env, hash);
  if (!existing.ok) return { ok: false, error: existing.error || "matrix_read_failed" };

  const prior = existing.record?.fields || {};
  const stamp = new Date().toISOString();
  const handoff = input.handoff;
  const version = Math.max(0, Number(prior[F.VERSION]) || 0) + 1;
  const existingLoops = parseList(prior[F.OPEN_LOOPS]);
  const existingDontAsk = parseList(prior[F.DONT_ASK]);
  const loops = unique([
    ...existingLoops,
    ...openLoopsFromProjection(input.projection),
    ...(handoff ? ["human_handoff"] : []),
  ]);
  const dontAsk = unique([
    ...existingDontAsk,
    "telegram_identity",
    ...(input.customerMessage ? ["latest_customer_request"] : []),
  ]);
  const stage = handoff ? "handoff" : deriveStage(input.projection);
  const targetLabel = handoff?.target === "kenji" ? "Kenji" : handoff?.target === "per" ? "Per" : "none";
  const summary = buildContinuitySummary({
    command: input.command,
    projection: input.projection,
    handoff,
  });

  const fields = {
    [F.MATRIX_ID]: clean(prior[F.MATRIX_ID], 160) || `kcm1_line_${hash.slice(0, 20)}`,
    [F.CLIENT]: [input.clientRecordId],
    [F.SCHEMA]: clean(prior[F.SCHEMA], 80) || "mmd.kenji_conversation_matrix.v1",
    [F.HASH]: hash,
    [F.CHANNEL]: "telegram_hype",
    [F.SCOPE]: clean(prior[F.SCOPE], 160) || `cross_channel:${hash.slice(0, 20)}`,
    [F.TOPIC]: topicForCommand(input.command),
    [F.SUBTOPIC]: clean(input.command, 80),
    [F.RELATIONSHIP]: clean(prior[F.RELATIONSHIP], 120) || "known_customer",
    [F.LAST_INTENT]: clean(input.command, 120) || "general",
    [F.LAST_REQUEST]: input.customerMessage || `HYPE command: ${clean(input.command, 80)}`,
    [F.LAST_CUSTOMER_ACTION]: handoff ? `requested_handoff:${handoff.target}` : `hype_command:${clean(input.command, 80)}`,
    [F.LAST_KENJI_ACTION]: handoff ? "handoff_context_prepared" : "hype_context_recorded",
    [F.LAST_OUTCOME]: handoff
      ? "handoff_pending; protected current truth must be refreshed before action"
      : "HYPE read-only status delivered; no business truth changed",
    [F.STAGE]: stage,
    [F.AWAITING]: handoff ? (handoff.target === "per" ? "mmd_review" : "kenji") : awaitingFromProjection(input.projection),
    [F.PENDING_ACTION]: handoff
      ? `resume conversation with ${targetLabel} using continuity context; refresh live truth first`
      : pendingActionFromProjection(input.projection),
    [F.PENDING_REF]: handoff?.id || clean(prior[F.PENDING_REF], 160),
    [F.CONTINUITY]: summary,
    [F.DONT_ASK]: JSON.stringify(dontAsk),
    [F.OPEN_LOOPS]: JSON.stringify(loops),
    [F.HANDOFF_REQUIRED]: Boolean(handoff),
    [F.HANDOFF_OWNER]: targetLabel,
    [F.HANDOFF_REASON]: handoff?.reason || "",
    [F.TRUTH_REQUIRED]: true,
    [F.TRUTH_DOMAINS]: truthDomainsFor(input.command, input.projection),
    [F.LAST_EVENT]: clean(prior[F.LAST_EVENT], 160),
    [F.LAST_INTERACTION]: stamp,
    [F.UPDATED_AT]: stamp,
    [F.EXPIRES_AT]: new Date(Date.parse(stamp) + MATRIX_TTL_MS).toISOString(),
    [F.STATUS]: "active",
    [F.VERSION]: version,
    [F.PAYLOAD]: JSON.stringify({
      runtime_schema: "mmd.hype_cross_channel_continuity.v1",
      source: "telegram_hype",
      command: clean(input.command, 80),
      handoff_id: handoff?.id || null,
      handoff_target: handoff?.target || null,
      display_name: clean(input.displayName, 120),
      projection: input.projection,
      live_truth_refresh_required: true,
      business_truth_mutated: false,
    }),
  };

  const write = existing.record
    ? await airtableWrite(env, "PATCH", { records: [{ id: existing.record.id, fields }], typecast: true })
    : await airtableWrite(env, "POST", { records: [{ fields }], typecast: true });
  if (!write.ok) return { ok: false, error: write.error || "matrix_write_failed" };
  const row = Array.isArray(write.payload?.records) ? write.payload.records[0] : null;
  return { ok: true, record_id: clean(row?.id || existing.record?.id, 120), version };
}

function normalizeProjection(value) {
  const p = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const membership = p.membership || {};
  const job = p.job || {};
  const payment = p.payment || {};
  const next = p.next_action || {};
  return {
    state: token(p.state),
    membership: {
      level: token(membership.level),
      lifecycle: token(membership.lifecycle || membership.status),
      blocked: membership.blocked === true,
    },
    job: {
      active_count: nn(job.active_count),
      next_status: token(job.next?.status),
      model_name: clean(job.next?.model_name, 120),
      start_at: clean(job.next?.start_at, 80),
      payment_state: token(job.next?.payment_state),
    },
    payment: {
      status: token(payment.status),
      paid: payment.paid === true,
      review_required: payment.review_required === true,
      outstanding_amount_thb: nonNegative(payment.outstanding_amount_thb),
      credit_balance_thb: nonNegative(payment.credit_balance_thb),
    },
    next_action: {
      action: token(next.action),
      label: clean(next.label, 140),
    },
  };
}

function buildCanonicalHandoffProjection(context = {}) {
  return normalizeProjection({
    state: context.live_truth_complete === true ? "ready" : "partial",
    membership: {
      level: context?.entitlement?.membership_level || context?.entitlement?.canonical_membership_level,
      lifecycle: context?.entitlement?.lifecycle || context?.entitlement?.status,
      blocked: context?.entitlement?.blocked === true,
    },
    job: {
      active_count: Array.isArray(context?.job?.active_jobs) ? context.job.active_jobs.length : 0,
      next: Array.isArray(context?.job?.active_jobs) ? context.job.active_jobs[0] : null,
    },
    payment: context?.payment || {},
    next_action: Array.isArray(context?.next_actions) ? context.next_actions[0] : null,
  });
}

function deriveStage(p = {}) {
  if (p.payment.review_required) return "awaiting_payment_verification";
  if (p.membership.blocked) return "awaiting_entitlement_refresh";
  if (p.job.active_count > 0) return "in_progress";
  return "active";
}

function awaitingFromProjection(p = {}) {
  if (p.payment.review_required) return "payment_authority";
  if (p.membership.blocked) return "entitlement_authority";
  return "none";
}

function pendingActionFromProjection(p = {}) {
  if (p.payment.review_required) return "refresh payment truth before continuing";
  if (p.membership.blocked) return "refresh entitlement truth before continuing";
  if (p.next_action.label) return p.next_action.label;
  if (p.job.active_count > 0) return "continue current job context";
  return "continue current conversation";
}

function openLoopsFromProjection(p = {}) {
  const out = [];
  if (p.payment.review_required) out.push("payment_verification");
  if (p.membership.blocked) out.push("entitlement_review");
  if (p.job.active_count > 0) out.push("active_job");
  if (p.next_action.action) out.push(`next:${p.next_action.action}`);
  return out;
}

function truthDomainsFor(command, p = {}) {
  const domains = ["identity"];
  if (["status", "next", "handoff", "kenji", "human"].includes(command)) domains.push("membership", "job", "payment");
  if (command === "booking") domains.push("job", "calendar");
  if (command === "payment") domains.push("payment");
  if (p.membership.level || p.membership.lifecycle) domains.push("membership");
  if (p.job.active_count > 0) domains.push("job");
  if (p.payment.status || p.payment.review_required || p.payment.paid) domains.push("payment");
  return unique(domains);
}

function topicForCommand(command) {
  if (command === "payment") return "payment";
  if (command === "booking") return "booking";
  if (command === "next") return "next_action";
  if (["kenji", "human", "handoff"].includes(command)) return "human_handoff";
  return "account_status";
}

function buildContinuitySummary({ command, projection, handoff }) {
  const chunks = [
    `HYPE ${clean(command, 80) || "status"} context.`,
    projection.membership.level ? `Membership ${projection.membership.level}/${projection.membership.lifecycle || "unknown"}.` : "",
    projection.job.active_count ? `${projection.job.active_count} active/pending job(s)${projection.job.model_name ? ` with ${projection.job.model_name}` : ""}.` : "No active job confirmed in this snapshot.",
    projection.payment.review_required
      ? "Payment proof is awaiting canonical review."
      : projection.payment.paid
        ? "Payment is canonically marked paid."
        : projection.payment.status
          ? `Payment state ${projection.payment.status}.`
          : "",
    projection.next_action.label ? `Next action: ${projection.next_action.label}.` : "",
    handoff ? `Customer requested supervised handoff to ${handoff.target}; do not ask them to restart the story. Refresh live truth before acting.` : "",
  ].filter(Boolean);
  return chunks.join(" ").slice(0, 1200);
}

function buildOperatorSummary({ target, displayName, customerMessage, projection, handoffId }) {
  const lines = [
    `HYPE → ${target === "kenji" ? "Kenji" : "Per"} handoff`,
    `Ref: ${handoffId}`,
    `Client: ${clean(displayName, 120) || "Canonical Client"}`,
    customerMessage ? `Latest request: ${customerMessage}` : "",
    projection.membership.level ? `Membership: ${projection.membership.level} · ${projection.membership.lifecycle || "unknown"}` : "",
    projection.job.active_count ? `Job: ${projection.job.active_count} active/pending · ${projection.job.model_name || "-"} · ${projection.job.next_status || "unknown"}` : "Job: no active job in current snapshot",
    `Payment: ${projection.payment.paid ? "paid" : projection.payment.review_required ? "review_required" : projection.payment.status || "unknown"}`,
    projection.next_action.label ? `Next: ${projection.next_action.label}` : "",
    "Context is continuity-only. Refresh canonical truth before any protected action.",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 1800);
}

async function findMatrix(env, hash) {
  const config = airtableConfig(env);
  if (!config.ok) return config;
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.table)}`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", `{${F.HASH}}="${escapeFormula(hash)}"`);
  try {
    const response = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${config.token}`, accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: `airtable_read_${response.status}` };
    return { ok: true, record: Array.isArray(payload.records) ? payload.records[0] || null : null };
  } catch {
    return { ok: false, error: "airtable_read_failed" };
  }
}

async function airtableWrite(env, method, body) {
  const config = airtableConfig(env);
  if (!config.ok) return config;
  try {
    const response = await fetch(
      `${AIRTABLE_API}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.table)}`,
      {
        method,
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const payload = await response.json().catch(() => ({}));
    return response.ok
      ? { ok: true, payload }
      : { ok: false, error: `airtable_write_${response.status}` };
  } catch {
    return { ok: false, error: "airtable_write_failed" };
  }
}

function airtableConfig(env) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 80);
  const tokenValue = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 1000);
  const table = clean(env.AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID, 120) || MATRIX_TABLE_FALLBACK;
  if (!baseId || !tokenValue || !table) return { ok: false, error: "airtable_config_missing" };
  return { ok: true, baseId, token: tokenValue, table };
}

async function buildHandoffId(clientId, target) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const digest = await sha256Hex(`${clientId}|${target}|${stamp}`);
  return `HYPE-${target.toUpperCase()}-${stamp}-${digest.slice(0, 8)}`;
}

function validateRequest(request, expectedPath) {
  let url;
  try { url = new URL(request.url); } catch { return json({ ok: false, error: "invalid_request" }, 400); }
  if (url.pathname !== expectedPath) return json({ ok: false, error: "not_found" }, 404);
  if (url.hostname !== "admin-worker.internal") return json({ ok: false, error: "internal_only" }, 403);
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (clean(request.headers.get("x-mmd-service-binding"), 80) !== "telegram-worker") {
    return json({ ok: false, error: "internal_caller_invalid" }, 403);
  }
  return null;
}

async function readBody(request) {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? body : null;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(clean(value, 1000));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function parseList(value) {
  if (Array.isArray(value)) return value.map((x) => clean(x, 160)).filter(Boolean);
  const raw = clean(value, 3000);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => clean(x, 160)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function unique(values) {
  return [...new Set(values.map((x) => clean(x, 160)).filter(Boolean))];
}

function normalizeTarget(value) {
  const target = token(value);
  if (["kenji", "per"].includes(target)) return target;
  return "";
}

function lineId(value) {
  const id = clean(value, 80);
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}

function telegramId(value) {
  const id = clean(value, 40);
  return /^\d{5,20}$/.test(id) ? id : "";
}

function recordId(value) {
  const id = clean(value, 80);
  return /^rec[A-Za-z0-9]+$/.test(id) ? id : "";
}

function escapeFormula(value) {
  return clean(value, 500).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function nn(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function nonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function token(value) {
  return clean(value, 160).toLowerCase().normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-hype-handoff": "supervised-v1",
    },
  });
}
