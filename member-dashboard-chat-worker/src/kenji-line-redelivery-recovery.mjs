import { createLineSignature, verifyLineSignature } from "./index.js";
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

const AI_EVENTS_TABLE_FALLBACK = "tbljCYfYqfm8gBTPq";
const MEMBERSHIP_STATUS_CANONICAL_TEXT = "สถานะสมาชิกของผม";

function text(value) {
  return value == null ? "" : String(value).trim();
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
    return handleKenjiSeedLineRequest(kenjiSalesV2SmokeRequest(request), env, ctx, legacyWorker);
  }

  const original = request.clone();
  const rawBody = await original.text();
  const signature = text(original.headers.get("x-line-signature"));
  if (!await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET)) {
    return handleKenjiSeedLineRequest(request, env, ctx, legacyWorker);
  }

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (_) {
    return handleKenjiSeedLineRequest(request, env, ctx, legacyWorker);
  }

  const events = Array.isArray(body?.events) ? body.events : [];
  const redeliveryIndexes = events
    .map((event, index) => event?.deliveryContext?.isRedelivery === true ? index : -1)
    .filter((index) => index >= 0);
  const membershipStatusIndexes = events
    .map((event, index) => membershipStatusEvent(event) ? index : -1)
    .filter((index) => index >= 0);

  if (redeliveryIndexes.length === 0 && membershipStatusIndexes.length === 0) {
    const operationalRequest = new Request(request.url, {
      method: "POST",
      headers: new Headers(request.headers),
      body: rawBody,
    });
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
    const response = await handleKenjiSeedLineRequest(request, env, ctx, legacyWorker);
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

  const response = await handleKenjiSeedLineRequest(transformedRequest, env, ctx, legacyWorker);
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
