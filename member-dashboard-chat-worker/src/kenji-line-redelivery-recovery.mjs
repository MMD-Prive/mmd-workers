import { createLineSignature, extractKenjiModelLookupQuery, inferLineIntent, requestKenjiRuntimeStatus, resolveLineCardCampaignTrigger, verifyLineSignature } from "./index.js";
import { ownerContextTestAllowed, ownerContextTestRequested } from "./kenji-owner-context-test.mjs";
import {
  handleKenjiSeedLineRequest,
  isKenjiSeedLineRequest,
  kenjiTelemetryEventId,
  writeKenjiAiMessageEvent,
} from "./kenji-seed-line-runtime.mjs";
import { redeliveryOutcomeFromAiEvent } from "./kenji-line-redelivery-policy.mjs";
import {
  linkCanonicalKenjiLineClientAfterTurn,
  resolveCanonicalKenjiLineClient,
} from "./kenji-line-canonical-client-resolution.mjs";
import { tryHandleKenjiLv5LineOperationalRequest } from "./kenji-lv5-line-operational-request.mjs";
import { notifyKenjiLv5Hype } from "./kenji-lv5-hype-alert.mjs";
import { tryHandleKenjiSvipPhotoRevealRequest } from "./kenji-svip-photo-reveal.mjs";
import { hasPendingDirectUserPaymentCandidate } from "./line-group-ingress-front-gate.js";

const AI_EVENTS_TABLE_FALLBACK = "tbljCYfYqfm8gBTPq";
const MEMBERSHIP_STATUS_CANONICAL_TEXT = "สถานะสมาชิกของผม";

function text(value) {
  return value == null ? "" : String(value).trim();
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function withoutOwnerContextTest(env = {}) {
  return ownerContextTestRequested(env)
    ? { ...env, KENJI_LINE_OWNER_CONTEXT_TEST_ENABLED: "false" }
    : env;
}

export async function hasCardCampaignContext(env = {}, event = {}) {
  if (!enabled(env.LINE_CARD_21829530_LEAD_ENABLED) || !enabled(env.LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR)) return false;
  if (event?.source?.type !== "user" || event?.type !== "message" || event?.message?.type !== "text") return false;
  const userId = text(event?.source?.userId);
  if (!/^U[a-f0-9]{32}$/i.test(userId)) return false;
  const hashes = text(env.LINE_CARD_21829530_PILOT_HASHES).toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!hashes.length || hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  const userHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (!hashes.includes(userHash)) return false;
  if (!env.KENJI_MODEL_DEDUPE?.idFromName || !env.KENJI_MODEL_DEDUPE?.get) return true;
  try {
    const id = env.KENJI_MODEL_DEDUPE.idFromName(`kenji-line-card-21829530-context-v1:${userHash}`);
    const response = await env.KENJI_MODEL_DEDUPE.get(id).fetch("https://kenji-model-dedupe.internal/campaign-lead/context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "get" }),
    });
    if (!response.ok) return true;
    const result = await response.json();
    return result?.ok !== true || result.found === true;
  } catch (_) {
    return true;
  }
}

function escapeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": "member-dashboard-chat-worker",
      "x-mmd-kenji-redelivery": "recovery-v1",
    },
  });
}

function membershipStatusText(value = "") {
  const normalized = text(value).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (/care[\s_-]*back|แคร์\s*แบ[็๊]?ก|แคร์\s*แบค|double[\s_-]*moment|ดับเบิล\s*โมเมนต์/i.test(normalized)) return false;
  if (/(?:membership|member)\s*status|status\s*(?:membership|member)/i.test(normalized)) return true;
  if (/(?:เช็ก|เช็ค|ตรวจ|ตรวจสอบ|ดู|ขอดู|ขอเช็ก|ขอเช็ค).{0,16}สถานะ(?:การ)?สมาชิก/i.test(normalized)) return true;
  if (/สถานะ(?:การ)?สมาชิก.{0,20}(?:ของผม|ของฉัน|ของหนู|ของเรา|ตอนนี้|ปัจจุบัน|เป็นยังไง|เป็นอย่างไร|ยังอยู่|active|inactive|expired|หมดอายุ)/i.test(normalized)) return true;
  return /(?:สมาชิก|membership).{0,16}(?:active|inactive|expired|หมดอายุ|ยังอยู่|ยังเป็นสมาชิก)/i.test(normalized);
}

export function isKenjiModelNameOnlyTextEvent(event = {}) {
  if (event?.source?.type !== "user" || event?.type !== "message" || event?.message?.type !== "text") return false;
  const raw = text(event?.message?.text);
  if (!raw) return false;
  const query = extractKenjiModelLookupQuery(raw);
  return Boolean(query) && inferLineIntent(raw, event) === "model_lookup";
}

function silentModelOnlyAck(reason = "non_model_text") {
  return json({
    ok: true,
    route: "line_webhook",
    kenji_mode: "model_name_only",
    replied: false,
    suppressed: true,
    reason,
  }, 200);
}

function membershipStatusEvent(event = {}) {
  if (event?.type !== "message" || event?.message?.type !== "text") return false;
  return membershipStatusText(event?.message?.text);
}

function refineMembershipStatusEvent(event = {}) {
  if (!membershipStatusEvent(event)) return event;
  return {
    ...event,
    message: {
      ...(event.message || {}),
      text: MEMBERSHIP_STATUS_CANONICAL_TEXT,
    },
  };
}

async function findAiEvent(env = {}, event = {}) {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = text(env.AIRTABLE_TABLE_AI_MESSAGE_EVENTS_ID || AI_EVENTS_TABLE_FALLBACK);
  const telemetryEventId = kenjiTelemetryEventId(event);
  if (!apiKey || !baseId || !table || !telemetryEventId) return null;

  try {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "1");
    url.searchParams.set("maxRecords", "1");
    url.searchParams.set("filterByFormula", `{event_id}=\"${escapeFormulaValue(telemetryEventId)}\"`);
    ["payload_json", "final_status", "handoff_required", "handoff_reason"].forEach((field) => {
      url.searchParams.append("fields[]", field);
    });
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

function recoverableEvent(event = {}, outcome = {}) {
  if (event?.deliveryContext?.isRedelivery !== true || outcome.retry_allowed !== true) return event;
  return {
    ...event,
    deliveryContext: {
      ...(event.deliveryContext || {}),
      isRedelivery: false,
    },
  };
}

async function syncCanonicalCustomerMemory(env = {}, events = []) {
  const results = [];
  for (const event of events) {
    if (event?.source?.type !== "user") continue;
    const context = await resolveCanonicalKenjiLineClient({ env, event }).catch(() => ({
      resolved: false,
      status: "unavailable",
      reason: "canonical_client_resolution_runtime_error",
    }));
    const matrixLink = context?.resolved === true
      ? await linkCanonicalKenjiLineClientAfterTurn({ env, event, context }).catch(() => ({
          ok: false,
          skipped: true,
          reason: "canonical_matrix_link_runtime_error",
        }))
      : { ok: false, skipped: true, reason: "canonical_client_unresolved" };
    results.push({
      resolved: context?.resolved === true,
      status: text(context?.status),
      reason: text(context?.reason),
      relationship_context: text(context?.relationship_context),
      voice_profile: text(context?.voice_context?.voice_profile),
      matrix_linked: matrixLink?.ok === true,
    });
  }
  return results;
}

function scheduleCanonicalCustomerMemory(ctx, env, events) {
  const work = syncCanonicalCustomerMemory(env, events).catch(() => []);
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work);
  return work;
}

async function runOperationalTelemetry(env, operational) {
  if (!operational?.handled || !operational?.event || !operational?.decision) return null;
  return writeKenjiAiMessageEvent({
    env,
    event: operational.event,
    decision: operational.decision,
    delivered: operational.delivered === true,
    attempted: operational.attempted === true,
    deliveryStatus: operational.delivery_status,
  }).catch(() => ({ skipped: true, reason: "lv5_operational_telemetry_runtime_error" }));
}

function scheduleOperationalSideEffects(ctx, env, events, operational) {
  const work = Promise.all([
    runOperationalTelemetry(env, operational),
    notifyKenjiLv5Hype(env, operational?.event || {}, operational?.decision || {}).catch(() => ({ skipped: true, reason: "lv5_hype_runtime_error" })),
    syncCanonicalCustomerMemory(env, events).catch(() => []),
  ]);
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work);
  return work;
}

/** Normalize only the existing public, read-only GET diagnostic after edge routing. */
export function kenjiSalesV2SmokeRequest(request) {
  if (!isKenjiSeedLineRequest(request) || request.method !== "GET" || request.headers.get("x-mmd-kenji-sales-v2-smoke") !== "1") return request;
  const url = new URL(request.url);
  url.searchParams.set("kenji_sales_v2_smoke", "1");
  return new Request(url.toString(), request);
}

export async function handleKenjiSeedLineRequestWithRedeliveryRecovery(
  request,
  env = {},
  ctx = null,
  legacyWorker = null,
) {
  if (!isKenjiSeedLineRequest(request) || String(request?.method || "GET").toUpperCase() !== "POST") {
    return handleKenjiSeedLineRequest(kenjiSalesV2SmokeRequest(request), withoutOwnerContextTest(env), ctx, legacyWorker);
  }

  const original = request.clone();
  const rawBody = await original.text();
  const signature = text(original.headers.get("x-line-signature"));
  if (!await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET)) {
    return handleKenjiSeedLineRequest(request, withoutOwnerContextTest(env), ctx, legacyWorker);
  }

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (_) {
    return handleKenjiSeedLineRequest(request, withoutOwnerContextTest(env), ctx, legacyWorker);
  }

  const events = Array.isArray(body?.events) ? body.events : [];
  // Isolated contextual rehearsal uses intake/Seed continuity only. Apply the
  // bypass only to one signed event that passes the current runtime and owner
  // gates; mixed or ineligible requests retain normal wrapper orchestration.
  if (ownerContextTestRequested(env) && events.length === 1) {
    let ownerContextAllowed = false;
    try {
      const runtime = await requestKenjiRuntimeStatus(env);
      ownerContextAllowed = await ownerContextTestAllowed(env, events[0], runtime);
    } catch (_) {
      ownerContextAllowed = false;
    }
    if (ownerContextAllowed) return handleKenjiSeedLineRequest(request, env, ctx, legacyWorker);
  }
  // Recovery can clear the redelivery marker before Seed performs its own
  // per-event check. Keep owner-test mode disabled downstream unless the
  // wrapper explicitly authorized the original singleton event above.
  const seedEnv = withoutOwnerContextTest(env);
  // A fresh direct-user image candidate must reach the existing evidence intake
  // before the LV5 payment-word handler can consume the follow-up silently.
  if (events.length === 1 && events[0]?.deliveryContext?.isRedelivery !== true && text(events[0]?.mode).toLowerCase() !== "standby") {
    let candidate = false;
    let lookupUnavailable = false;
    try { candidate = await hasPendingDirectUserPaymentCandidate(env, events[0], { waitForImageMs: 5000 }); }
    catch (_) { candidate = true; lookupUnavailable = true; }
    if (candidate) {
      console.log(JSON.stringify({ line_payment_route: "candidate_precedence", lookup: lookupUnavailable ? "unavailable" : "found" }));
      if (!legacyWorker?.fetch) return json({ ok: false, error: "line_intake_unavailable" }, 503);
      return legacyWorker.fetch(request, { ...env, LINE_AUTO_REPLY_ENABLED: "false" }, ctx);
    }
  }
  const redeliveryIndexes = events
    .map((event, index) => event?.deliveryContext?.isRedelivery === true ? index : -1)
    .filter((index) => index >= 0);
  const membershipStatusIndexes = events
    .map((event, index) => membershipStatusEvent(event) ? index : -1)
    .filter((index) => index >= 0);

  const hasCardCampaignAction = events.some((event) => event?.type === "message" && event?.message?.type === "text" && resolveLineCardCampaignTrigger(event.message.text));
  const hasPendingCardCampaign = !hasCardCampaignAction && events.length === 1
    ? await hasCardCampaignContext(env, events[0])
    : false;
  if (redeliveryIndexes.length === 0 && membershipStatusIndexes.length === 0 && !hasCardCampaignAction && !hasPendingCardCampaign) {
    const operationalRequest = new Request(request.url, {
      method: "POST",
      headers: new Headers(request.headers),
      body: rawBody,
    });
    const photoReveal = await tryHandleKenjiSvipPhotoRevealRequest(operationalRequest.clone(), env, ctx).catch(() => null);
    if (photoReveal?.handled && photoReveal.response) {
      const sideEffects = scheduleOperationalSideEffects(ctx, env, events, photoReveal);
      if (typeof ctx?.waitUntil !== "function") await sideEffects;
      return photoReveal.response;
    }
    const operational = await tryHandleKenjiLv5LineOperationalRequest(operationalRequest, env, ctx).catch(() => null);
    if (operational?.handled && operational.response) {
      const sideEffects = scheduleOperationalSideEffects(ctx, env, events, operational);
      if (typeof ctx?.waitUntil !== "function") await sideEffects;
      return operational.response;
    }
  }

  const outcomes = new Map();
  await Promise.all(redeliveryIndexes.map(async (index) => {
    const existing = await findAiEvent(env, events[index]);
    outcomes.set(index, redeliveryOutcomeFromAiEvent(existing));
  }));

  const hasRecoverable = redeliveryIndexes.some((index) => outcomes.get(index)?.retry_allowed === true);
  const hasMembershipStatusRefinement = membershipStatusIndexes.length > 0;
  if (!hasRecoverable && !hasMembershipStatusRefinement) {
    const response = await handleKenjiSeedLineRequest(request, seedEnv, ctx, legacyWorker);
    const work = scheduleCanonicalCustomerMemory(ctx, env, events);
    if (typeof ctx?.waitUntil !== "function") await work;
    return response;
  }

  const transformedEvents = events.map((event, index) => {
    const recovered = recoverableEvent(event, outcomes.get(index) || {});
    return membershipStatusIndexes.includes(index) ? refineMembershipStatusEvent(recovered) : recovered;
  });
  const transformedBody = JSON.stringify({ ...body, events: transformedEvents });
  const transformedSignature = await createLineSignature(transformedBody, env.LINE_CHANNEL_SECRET);
  const headers = new Headers(request.headers);
  headers.set("x-line-signature", transformedSignature);
  if (hasRecoverable) headers.set("x-mmd-line-redelivery-recovered", "1");
  if (hasMembershipStatusRefinement) headers.set("x-mmd-line-intent-refined", "membership_status");

  const transformedRequest = new Request(request.url, {
    method: "POST",
    headers,
    body: transformedBody,
  });

  const response = await handleKenjiSeedLineRequest(transformedRequest, seedEnv, ctx, legacyWorker);
  const work = scheduleCanonicalCustomerMemory(ctx, env, transformedEvents);
  if (typeof ctx?.waitUntil !== "function") await work;
  if (!response?.headers) return response;
  const responseHeaders = new Headers(response.headers);
  if (hasRecoverable) responseHeaders.set("x-mmd-kenji-redelivery", "recovered");
  if (hasMembershipStatusRefinement) responseHeaders.set("x-mmd-kenji-intent-refined", "membership_status");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export { isKenjiSeedLineRequest };
