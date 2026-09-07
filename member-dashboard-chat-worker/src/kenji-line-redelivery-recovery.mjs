import { createLineSignature, verifyLineSignature } from "./index.js";
import {
  handleKenjiSeedLineRequest,
  isKenjiSeedLineRequest,
  kenjiTelemetryEventId,
} from "./kenji-seed-line-runtime.mjs";
import { redeliveryOutcomeFromAiEvent } from "./kenji-line-redelivery-policy.mjs";

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

export async function handleKenjiSeedLineRequestWithRedeliveryRecovery(
  request,
  env = {},
  ctx = null,
  legacyWorker = null,
) {
  if (!isKenjiSeedLineRequest(request) || String(request?.method || "GET").toUpperCase() !== "POST") {
    return handleKenjiSeedLineRequest(request, env, ctx, legacyWorker);
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

  const outcomes = new Map();
  await Promise.all(redeliveryIndexes.map(async (index) => {
    const existing = await findAiEvent(env, events[index]);
    outcomes.set(index, redeliveryOutcomeFromAiEvent(existing));
  }));

  const hasRecoverable = redeliveryIndexes.some((index) => outcomes.get(index)?.retry_allowed === true);
  const hasMembershipStatusRefinement = membershipStatusIndexes.length > 0;
  if (!hasRecoverable && !hasMembershipStatusRefinement) {
    return handleKenjiSeedLineRequest(request, env, ctx, legacyWorker);
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
