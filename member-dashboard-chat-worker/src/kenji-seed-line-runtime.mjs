import {
  inferLineIntent,
  requestKenjiRuntimeStatus,
  resolveKenjiLineReply,
  verifyLineSignature,
} from "./index.js";
import {
  resolveKenjiLineContinuity,
  writeKenjiLineMatrixTurn,
} from "./kenji-line-continuity-runtime.mjs";
import { applyKenjiNextAction } from "./kenji-line-next-action.mjs";
import {
  buildKenjiLiveTruthDecision,
  resolveKenjiLineLiveTruth,
} from "./kenji-line-live-truth.mjs";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const KENJI_KNOWLEDGE_TABLE_FALLBACK = "tblsLd1uVOtG2kHoU";
const KENJI_AI_MESSAGE_EVENTS_TABLE_FALLBACK = "tbljCYfYqfm8gBTPq";
const LINE_CHANNEL = "LINE_OFC";
const SMOKE_QUERY = "kenji_seed_smoke";
const KNOWLEDGE_TIMEOUT_MS = 900;

// Only reviewed, navigation-safe Seed Pack cards may drive an autonomous LINE
// reply. Payment, live availability, access/entitlement truth, final pricing,
// and any card whose lifecycle requires handoff stay outside this allowlist.
export const SEED_AUTO_REPLY_BY_INTENT = Object.freeze({
  membership_signup: "kenji_seed_v1_membership_01",
  membership_renewal: "kenji_seed_v1_membership_02",
  membership: "kenji_seed_v1_membership_01",
  mmd_companion: "kenji_seed_v1_route_01",
  mms_wellness: "kenji_seed_v1_route_02",
  partner_venue: "kenji_seed_v1_route_03",
  privacy_request: "kenji_seed_v1_privacy_01",
});

// These cards may govern classification/handoff metadata, but their customer
// answer is never promoted to an autonomous reply by this runtime.
export const SEED_HANDOFF_BY_INTENT = Object.freeze({
  payment_slip: "kenji_seed_v1_payment_01",
  payment_status: "kenji_seed_v1_payment_02",
  availability_request: "kenji_seed_v1_booking_02",
  pricing_review: "kenji_seed_v1_booking_04",
  private_talent: "kenji_seed_v1_route_04",
});

const NEVER_AUTOREPLY_INTENTS = new Set([
  "payment_slip",
  "payment_status",
  "payment_dispute",
  "availability_request",
  "pricing_review",
  "internal_access",
  "membership_status",
  "points_status",
  "vip",
  "svip",
  "black_card",
  "model_access_verification",
]);

function text(value) {
  return value == null ? "" : String(value).trim();
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": "member-dashboard-chat-worker",
      "x-mmd-kenji-runtime": "seed-pack-v1",
    },
  });
}

function pathOf(request) {
  return new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
}

export function isKenjiSeedLineRequest(request) {
  const path = pathOf(request);
  return path === "/webhooks/line" || path === "/webhooks/line/";
}

function escapeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function allowedOnLine(value) {
  const channels = Array.isArray(value) ? value : [value];
  return channels.map((item) => text(item)).includes(LINE_CHANNEL);
}

function safePerVoice(value) {
  const answer = text(value);
  if (!answer || answer.length > 1600) return false;
  return !/(?:\bkenji\b|เคนจิ|ทีม(?:งาน)?|ระบบ|airtable|record[_\s-]?id|secret|token|authorization|bearer|ชำระ(?:เงิน)?สำเร็จ(?:แล้ว)?|ยืนยัน(?:การ)?ชำระ(?:เงิน)?(?:แล้ว)?|เปิดสมาชิก(?:แล้ว)?|ยืนยัน(?:การ)?จอง(?:แล้ว)?|ได้รับสิทธิ์(?:แล้ว)?)/i.test(answer);
}

function knowledgeTable(env = {}) {
  return text(env.AIRTABLE_KENJI_KNOWLEDGE_TABLE_ID || KENJI_KNOWLEDGE_TABLE_FALLBACK);
}

function aiEventsTable(env = {}) {
  return text(env.AIRTABLE_TABLE_AI_MESSAGE_EVENTS_ID || KENJI_AI_MESSAGE_EVENTS_TABLE_FALLBACK);
}

async function fetchSeedCard(env = {}, knowledgeId = "") {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = knowledgeTable(env);
  const id = text(knowledgeId);
  if (!apiKey || !baseId || !table || !id) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("seed_knowledge_timeout"), KNOWLEDGE_TIMEOUT_MS);
  try {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "1");
    url.searchParams.set(
      "filterByFormula",
      `AND({status}=\"active\",{knowledge_id}=\"${escapeFormulaValue(id)}\")`,
    );
    [
      "knowledge_id",
      "customer_answer",
      "allowed_channels",
      "status",
      "response_mode",
      "risk_level",
      "source_path",
    ].forEach((field) => url.searchParams.append("fields[]", field));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({}));
    const fields = Array.isArray(payload?.records) ? payload.records[0]?.fields : null;
    if (!fields || text(fields.status).toLowerCase() !== "active" || !allowedOnLine(fields.allowed_channels)) return null;
    return fields;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function withDecisionMetadata(base = {}, overrides = {}) {
  return {
    text: text(base.text),
    fallback: base.fallback === true,
    reply_source: text(base.reply_source) || "deterministic",
    model_attempted: base.model_attempted === true,
    model_success: base.model_success === true,
    model_latency_ms: Number(base.model_latency_ms) || 0,
    knowledge_hits: Number(base.knowledge_hits) || 0,
    guard_blocked: base.guard_blocked === true,
    guard_reason: text(base.guard_reason),
    selected_knowledge_ids: Array.isArray(base.selected_knowledge_ids) ? base.selected_knowledge_ids.filter(Boolean) : [],
    knowledge_response_mode: text(base.knowledge_response_mode),
    knowledge_risk_level: text(base.knowledge_risk_level),
    knowledge_source_path: text(base.knowledge_source_path),
    handoff_required: base.handoff_required === true,
    handoff_reason: text(base.handoff_reason),
    inferred_intent: text(base.inferred_intent),
    continuity_decision: text(base.continuity_decision),
    continuity_topic: text(base.continuity_topic),
    continuity_stage: text(base.continuity_stage),
    truth_authority: text(base.truth_authority),
    truth_status: text(base.truth_status),
    live_truth_used: base.live_truth_used === true,
    live_truth_verified: base.live_truth_verified === true,
    ...overrides,
  };
}

async function deterministicFallback(event, env, options = {}) {
  // A Seed-mapped miss must not silently fall back to a legacy Knowledge ID.
  // Disable Knowledge for this one resolution and retain all deterministic
  // truth/model-access guards from the canonical resolver.
  const decision = await resolveKenjiLineReply(event, {}, {
    ...env,
    LINE_KENJI_KNOWLEDGE_ENABLED: "false",
  }, options);
  return withDecisionMetadata(decision);
}

function cardMetadata(card = {}) {
  return {
    selected_knowledge_ids: [text(card.knowledge_id)].filter(Boolean),
    knowledge_response_mode: text(card.response_mode),
    knowledge_risk_level: text(card.risk_level),
    knowledge_source_path: text(card.source_path),
  };
}

function continuityMetadata(options = {}, inferredIntent = "") {
  const continuity = options?.continuity || {};
  return {
    inferred_intent: text(inferredIntent),
    continuity_decision: text(continuity.decision),
    continuity_topic: text(continuity.topic),
    continuity_stage: text(continuity.conversation_stage),
  };
}

export async function resolveKenjiSeedDecision(event = {}, env = {}, options = {}) {
  const raw = event?.type === "message" && event?.message?.type === "text"
    ? text(event.message.text)
    : event?.type === "postback"
      ? text(event?.postback?.displayText || event?.postback?.data)
      : "";
  const inferredIntent = text(options.currentIntent || inferLineIntent(raw, event));
  const intent = text(options?.continuity?.effective_intent || inferredIntent);
  const continuityMeta = continuityMetadata(options, inferredIntent);
  const autoKnowledgeId = SEED_AUTO_REPLY_BY_INTENT[intent];
  const handoffKnowledgeId = SEED_HANDOFF_BY_INTENT[intent];
  const liveTruthDecision = buildKenjiLiveTruthDecision(intent, options.liveTruth || {}, options.continuity || {});

  if (liveTruthDecision) {
    return withDecisionMetadata({}, {
      ...liveTruthDecision,
      ...continuityMeta,
      intent,
    });
  }

  if (autoKnowledgeId && !NEVER_AUTOREPLY_INTENTS.has(intent) && enabled(env.LINE_KENJI_KNOWLEDGE_ENABLED)) {
    const card = await fetchSeedCard(env, autoKnowledgeId);
    const answer = text(card?.customer_answer);
    if (
      card &&
      text(card.response_mode).toLowerCase() === "auto_reply_allowed" &&
      safePerVoice(answer)
    ) {
      return withDecisionMetadata({}, {
        text: answer,
        reply_source: "seed_knowledge",
        knowledge_hits: 1,
        ...cardMetadata(card),
        ...continuityMeta,
        handoff_required: false,
        handoff_reason: "",
        intent,
      });
    }

    const fallback = await deterministicFallback(event, env, options);
    return withDecisionMetadata(fallback, {
      ...continuityMeta,
      intent,
      reply_source: fallback.reply_source || "deterministic",
    });
  }

  if (handoffKnowledgeId && enabled(env.LINE_KENJI_KNOWLEDGE_ENABLED)) {
    const card = await fetchSeedCard(env, handoffKnowledgeId);
    const fallback = await deterministicFallback(event, env, options);
    const mode = text(card?.response_mode).toLowerCase();
    if (card && ["handoff_required", "owner_approval_required"].includes(mode)) {
      return withDecisionMetadata(fallback, {
        ...cardMetadata(card),
        ...continuityMeta,
        intent,
        reply_source: "seed_handoff",
        knowledge_hits: 1,
        handoff_required: true,
        handoff_reason: `${intent}:${mode}`,
      });
    }
    return withDecisionMetadata(fallback, {
      ...continuityMeta,
      intent,
      handoff_required: true,
      handoff_reason: `${intent}:protected_truth`,
    });
  }

  const decision = await resolveKenjiLineReply(event, {}, env, options);
  const protectedIntent = NEVER_AUTOREPLY_INTENTS.has(intent);
  return withDecisionMetadata(decision, {
    ...continuityMeta,
    intent,
    handoff_required: protectedIntent || decision.handoff_required === true,
    handoff_reason: protectedIntent
      ? `${intent}:protected_truth`
      : text(decision.handoff_reason),
  });
}

function eventIdOf(event = {}) {
  return text(event?.message?.id || event?.webhookEventId || event?.replyToken || `evt_${Date.now()}`);
}

function replyTokenOf(event = {}) {
  return text(event?.replyToken);
}

export function kenjiTelemetryEventId(event = {}) {
  return `kai_line_${eventIdOf(event)}`.slice(0, 120);
}

function normalizeTelemetryIntent(intent = "") {
  const value = text(intent);
  if (value.startsWith("membership") || ["points", "points_status"].includes(value)) return "membership_question";
  if (value.startsWith("payment") || value === "care_back_payment_points") return "payment_question";
  if (["privacy_request", "internal_access"].includes(value)) return "privacy_question";
  if (["complaint_escalation", "human_handoff"].includes(value)) return "complaint";
  if (["vip", "svip", "black_card"].includes(value)) return "vip_blackcard";
  if (["model_lookup", "model_access_verification", "private_talent"].includes(value)) return "model_request";
  if (["mmd_companion", "mms_wellness", "partner_venue", "availability_request", "pricing_review"].includes(value)) return "booking_intake";
  if (["booking_status", "aftercare"].includes(value)) return value;
  return "unknown";
}

function normalizeRisk(intent = "", decision = {}) {
  const cardRisk = text(decision.knowledge_risk_level).toLowerCase();
  if (["low", "medium", "high", "critical"].includes(cardRisk)) return cardRisk;
  if (["payment_slip", "payment_status", "internal_access", "privacy_request"].includes(intent)) return "critical";
  if (decision.handoff_required || ["availability_request", "pricing_review", "membership_status", "points_status"].includes(intent)) return "high";
  if (["membership_signup", "membership_renewal"].includes(intent)) return "low";
  return "medium";
}

function telemetryResponseMode(decision = {}, delivered = false) {
  if (decision.guard_blocked && !decision.handoff_required) return "blocked";
  if (decision.handoff_required) return "handoff_required";
  if (delivered && decision.text) return "auto_reply_sent";
  return "blocked";
}

function telemetryFinalStatus(decision = {}, delivered = false, attempted = false) {
  if (attempted && !delivered) return "failed";
  if (decision.handoff_required) return "escalated";
  if (delivered) return "sent";
  return "processed";
}

async function findAiEvent(env = {}, telemetryEventId = "") {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = aiEventsTable(env);
  if (!apiKey || !baseId || !table || !telemetryEventId) return null;
  try {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "1");
    url.searchParams.set("filterByFormula", `{event_id}=\"${escapeFormulaValue(telemetryEventId)}\"`);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({}));
    return Array.isArray(payload?.records) ? payload.records[0] || null : null;
  } catch (_) {
    return null;
  }
}

export async function writeKenjiAiMessageEvent({ env = {}, event = {}, decision = {}, delivered = false, attempted = false } = {}) {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = aiEventsTable(env);
  if (!apiKey || !baseId || !table) return { skipped: true, reason: "airtable_env_missing" };

  const sourceEventId = eventIdOf(event);
  const telemetryEventId = kenjiTelemetryEventId(event);
  const existing = await findAiEvent(env, telemetryEventId);
  if (existing?.id) return { id: existing.id, event_id: telemetryEventId, deduped: true };

  const intent = text(decision.intent) || inferLineIntent(
    event?.type === "message" ? text(event?.message?.text) : "",
    event,
  );
  const selected = Array.isArray(decision.selected_knowledge_ids)
    ? decision.selected_knowledge_ids.map(text).filter(Boolean)
    : [];
  const handoffReason = text(decision.handoff_reason || decision.guard_reason).slice(0, 500);
  const fields = {
    event_id: telemetryEventId,
    created_at: new Date().toISOString(),
    channel: LINE_CHANNEL,
    source_path: text(decision.knowledge_source_path) || "/webhooks/line",
    detected_intent: normalizeTelemetryIntent(intent),
    risk_level: normalizeRisk(intent, decision),
    response_mode: telemetryResponseMode(decision, delivered),
    selected_knowledge_ids: selected.join(", "),
    generated_reply: text(decision.text).slice(0, 1600),
    handoff_required: decision.handoff_required === true,
    handoff_reason: handoffReason,
    final_status: telemetryFinalStatus(decision, delivered, attempted),
    linked_console_inbox_id: `line_${sourceEventId}`.slice(0, 160),
    payload_json: JSON.stringify({
      telemetry_version: "kenji_seed_runtime_v1",
      exact_intent: intent,
      inferred_intent: text(decision.inferred_intent),
      continuity_decision: text(decision.continuity_decision),
      continuity_topic: text(decision.continuity_topic),
      reply_source: text(decision.reply_source),
      guard_blocked: decision.guard_blocked === true,
      guard_reason: text(decision.guard_reason).slice(0, 160),
      knowledge_hits: Number(decision.knowledge_hits) || 0,
      cta_type: text(decision.cta_type),
      cta_route: text(decision.cta_route),
      cta_appended: decision.cta_appended === true,
      truth_authority: text(decision.truth_authority),
      truth_status: text(decision.truth_status),
      live_truth_used: decision.live_truth_used === true,
      line_delivery_attempted: attempted === true,
      line_delivery_succeeded: delivered === true,
      seed_pack: "v1",
    }),
  };

  // Deliberately omit line_user_id, contact_value, and user_message. Runtime
  // telemetry needs decision evidence, not duplicated customer PII.
  try {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });
    if (!response.ok) return { skipped: true, reason: "airtable_write_failed", status: response.status };
    const payload = await response.json().catch(() => ({}));
    return { id: text(payload?.id), event_id: telemetryEventId, deduped: false };
  } catch (_) {
    return { skipped: true, reason: "airtable_write_failed" };
  }
}

async function sendReply(env = {}, replyToken = "", replyText = "") {
  const token = text(env.LINE_CHANNEL_ACCESS_TOKEN);
  const reply = text(replyToken);
  const answer = text(replyText).slice(0, 1600);
  if (!token || !reply || !answer) return { ok: false, error: "reply_not_configured" };
  try {
    const response = await fetch(LINE_REPLY_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ replyToken: reply, messages: [{ type: "text", text: answer }] }),
    });
    return response.ok
      ? { ok: true, status: response.status }
      : { ok: false, status: response.status, error: "line_reply_failed" };
  } catch (_) {
    return { ok: false, error: "line_reply_request_failed" };
  }
}

async function runLegacyShadow(request, env, ctx, legacyWorker, rawBody) {
  if (!legacyWorker?.fetch) return;
  const shadowRequest = new Request(request.url, {
    method: "POST",
    headers: new Headers(request.headers),
    body: rawBody,
  });
  const shadowEnv = { ...env, LINE_AUTO_REPLY_ENABLED: "false" };
  const work = legacyWorker.fetch(shadowRequest, shadowEnv, ctx).catch(() => null);
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work);
  else await work;
}

async function handleSyntheticSmoke(request, env) {
  const url = new URL(request.url);
  const intent = text(url.searchParams.get("intent")) || "mms_wellness";
  const id = SEED_AUTO_REPLY_BY_INTENT[intent] || SEED_HANDOFF_BY_INTENT[intent];
  if (!id) return json({ ok: false, synthetic: true, error: "unsupported_intent" }, 400);
  const card = await fetchSeedCard(env, id);
  if (!card) return json({ ok: false, synthetic: true, error: "published_seed_card_not_found", intent, knowledge_id: id }, 503);
  const mode = text(card.response_mode).toLowerCase();
  const autoEligible = SEED_AUTO_REPLY_BY_INTENT[intent] === id && mode === "auto_reply_allowed" && safePerVoice(card.customer_answer);
  return json({
    ok: true,
    synthetic: true,
    seed_pack: "v1",
    intent,
    knowledge_id: id,
    response_mode: mode,
    risk_level: text(card.risk_level),
    source_path: text(card.source_path),
    auto_reply_eligible: autoEligible,
    line_delivery_attempted: false,
    telemetry_write_attempted: false,
  });
}

export async function handleKenjiSeedLineRequest(request, env = {}, ctx = null, legacyWorker = null) {
  if (!isKenjiSeedLineRequest(request)) return legacyWorker?.fetch ? legacyWorker.fetch(request, env, ctx) : json({ ok: false, error: "not_found" }, 404);

  const url = new URL(request.url);
  if (request.method === "GET" && url.searchParams.get(SMOKE_QUERY) === "1") {
    return handleSyntheticSmoke(request, env);
  }
  if (request.method !== "POST") {
    return legacyWorker?.fetch ? legacyWorker.fetch(request, env, ctx) : json({ ok: true, route: "line_webhook" });
  }

  const rawBody = await request.text();
  const signature = text(request.headers.get("x-line-signature"));
  if (!await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET)) {
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (_) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  await runLegacyShadow(request, env, ctx, legacyWorker, rawBody);

  const runtime = await requestKenjiRuntimeStatus(env);
  const controls = runtime.controls || {};
  const runtimeAllKill = runtime.ok !== true || controls.all_kenji_mutations === true;
  const runtimeLineKill = runtimeAllKill || controls.line_oa_auto_reply === true;
  const autoReplyEnabled = enabled(env.LINE_AUTO_REPLY_ENABLED) && enabled(env.LINE_KENJI_AI_ENABLED) && !runtimeLineKill;
  const continuityEnabled = enabled(env.KENJI_LINE_CONTINUITY_ENABLED);
  const events = Array.isArray(body.events) ? body.events : [];
  const saved = [];

  for (const event of events) {
    const eventMode = text(event?.mode).toLowerCase() || "unknown";
    const redelivered = event?.deliveryContext?.isRedelivery === true;
    const replyToken = replyTokenOf(event);
    const currentIntent = inferLineIntent(event?.message?.text || event?.postback?.displayText || event?.postback?.data || "", event);
    const continuity = continuityEnabled
      ? await resolveKenjiLineContinuity({ env, event, currentIntent })
      : {
          decision: "new_topic",
          effective_intent: currentIntent,
          current_intent: currentIntent,
          topic: "",
          conversation_stage: "new_topic",
          storage_status: "disabled",
          available: false,
        };
    const effectiveIntent = text(continuity.effective_intent || currentIntent);
    const liveTruth = autoReplyEnabled && eventMode !== "standby" && !redelivered && replyToken
      ? await resolveKenjiLineLiveTruth({ env, event, intent: effectiveIntent })
      : { ok: false, status: "not_attempted", authority: "my_mmd_entitlement_resolver_v1" };

    const baseDecision = autoReplyEnabled && eventMode !== "standby" && !redelivered && replyToken
      ? await resolveKenjiSeedDecision(event, env, {
          modelAccessAllowed: controls.model_keyword_auto_reply !== true,
          currentIntent,
          continuity,
          liveTruth,
        })
      : withDecisionMetadata({}, {
        ...continuityMetadata({ continuity }, currentIntent),
        intent: effectiveIntent,
        reply_source: "silent",
        guard_blocked: true,
        guard_reason: redelivered ? "line_redelivery" : runtimeLineKill ? "runtime_line_kill" : "reply_not_eligible",
      });

    const decision = applyKenjiNextAction(baseDecision, {
      intent: text(baseDecision.intent || effectiveIntent),
      continuity,
    });
    const shouldReply = Boolean(autoReplyEnabled && eventMode !== "standby" && !redelivered && replyToken && decision.text);
    const replyResult = shouldReply ? await sendReply(env, replyToken, decision.text) : null;
    const delivered = replyResult?.ok === true;

    const postTurnWork = (async () => {
      const telemetry = await writeKenjiAiMessageEvent({
        env,
        event,
        decision,
        delivered,
        attempted: shouldReply,
      }).catch(() => ({ skipped: true, reason: "telemetry_runtime_error" }));
      const matrix = continuityEnabled && eventMode !== "standby" && !redelivered
        ? await writeKenjiLineMatrixTurn({
            env,
            continuity,
            decision,
            delivered,
            attempted: shouldReply,
            lastEventId: text(telemetry?.event_id),
          }).catch(() => ({ skipped: true, reason: "matrix_runtime_error" }))
        : { skipped: true, reason: continuityEnabled ? "event_not_eligible" : "continuity_disabled" };
      return { telemetry, matrix };
    })();
    if (typeof ctx?.waitUntil === "function") ctx.waitUntil(postTurnWork);
    else await postTurnWork;

    console.log(JSON.stringify({
      line_webhook: "kenji_seed_runtime",
      event_type: text(event?.type) || "unknown",
      inferred_intent: currentIntent,
      intent: text(decision.intent),
      continuity_decision: text(continuity.decision),
      continuity_topic: text(continuity.topic),
      reply_source: text(decision.reply_source),
      selected_knowledge_ids: decision.selected_knowledge_ids,
      handoff_required: decision.handoff_required === true,
      cta_type: text(decision.cta_type),
      cta_appended: decision.cta_appended === true,
      truth_authority: text(decision.truth_authority),
      truth_status: text(decision.truth_status),
      live_truth_used: decision.live_truth_used === true,
      reply_attempted: shouldReply,
      reply_sent: delivered,
      runtime_control_ok: runtime.ok === true,
      runtime_line_kill: runtimeLineKill,
      continuity_enabled: continuityEnabled,
      continuity_storage_status: text(continuity.storage_status),
    }));

    saved.push({
      ok: true,
      type: text(event?.type),
      inferred_intent: currentIntent,
      intent: text(decision.intent),
      continuity_decision: text(continuity.decision),
      continuity_topic: text(continuity.topic),
      continuity_stage: text(continuity.conversation_stage),
      replied: delivered,
      reply_source: text(decision.reply_source),
      selected_knowledge_ids: decision.selected_knowledge_ids,
      handoff_required: decision.handoff_required === true,
      cta_type: text(decision.cta_type),
      cta_route: text(decision.cta_route),
      cta_appended: decision.cta_appended === true,
      truth_authority: text(decision.truth_authority),
      truth_status: text(decision.truth_status),
      live_truth_used: decision.live_truth_used === true,
      runtime_control_ok: runtime.ok === true,
      runtime_line_kill: runtimeLineKill,
      continuity_enabled: continuityEnabled,
      continuity_storage_status: text(continuity.storage_status),
      message_id: eventIdOf(event),
    });
  }

  return json({
    ok: true,
    worker: "member-dashboard-chat-worker",
    route: "line_webhook",
    runtime: "kenji_seed_pack_v1",
    continuity_runtime: continuityEnabled ? "kenji_line_continuity_v1" : "disabled",
    events: events.length,
    saved,
  });
}
