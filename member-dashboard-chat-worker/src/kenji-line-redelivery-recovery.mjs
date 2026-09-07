import { createLineSignature, verifyLineSignature } from "./index.js";
import {
  handleKenjiSeedLineRequest,
  isKenjiSeedLineRequest,
  kenjiTelemetryEventId,
} from "./kenji-seed-line-runtime.mjs";
import { redeliveryOutcomeFromAiEvent } from "./kenji-line-redelivery-policy.mjs";

const AI_EVENTS_TABLE_FALLBACK = "tbljCYfYqfm8gBTPq";

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
  if (!redeliveryIndexes.length) {
    return handleKenjiSeedLineRequest(request, env, ctx, legacyWorker);
  }

  const outcomes = new Map();
  await Promise.all(redeliveryIndexes.map(async (index) => {
    const existing = await findAiEvent(env, events[index]);
    outcomes.set(index, redeliveryOutcomeFromAiEvent(existing));
  }));

  const hasRecoverable = redeliveryIndexes.some((index) => outcomes.get(index)?.retry_allowed === true);
  if (!hasRecoverable) {
    return handleKenjiSeedLineRequest(request, env, ctx, legacyWorker);
  }

  const recoveredEvents = events.map((event, index) => recoverableEvent(event, outcomes.get(index) || {}));
  const recoveredBody = JSON.stringify({ ...body, events: recoveredEvents });
  const recoveredSignature = await createLineSignature(recoveredBody, env.LINE_CHANNEL_SECRET);
  const headers = new Headers(request.headers);
  headers.set("x-line-signature", recoveredSignature);
  headers.set("x-mmd-line-redelivery-recovered", "1");

  const recoveredRequest = new Request(request.url, {
    method: "POST",
    headers,
    body: recoveredBody,
  });

  const response = await handleKenjiSeedLineRequest(recoveredRequest, env, ctx, legacyWorker);
  if (!response?.headers) return response;
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("x-mmd-kenji-redelivery", "recovered");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export { isKenjiSeedLineRequest };
