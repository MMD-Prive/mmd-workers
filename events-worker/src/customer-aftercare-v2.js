import { normalizeSessionState } from "../../admin-worker/src/modelSessionContractV1.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
export const CUSTOMER_AFTERCARE_PATH = "/v1/customer/session/aftercare";

const QUICK_TAGS = new Set([
  "on_time",
  "polite",
  "good_care",
  "matched_brief",
  "want_again",
]);

const ISSUE_TAGS = new Set([
  "privacy",
  "safety",
  "payment",
  "brief_mismatch",
]);

const AFTERCARE_STATES = new Set([
  "separated",
  "under_review",
  "payout_pending",
  "closed",
]);

export function isCustomerAftercareRequest(path, method) {
  const normalized = normalizePath(path);
  const verb = String(method || "GET").toUpperCase();
  return normalized === CUSTOMER_AFTERCARE_PATH && ["POST", "OPTIONS"].includes(verb);
}

export async function handleCustomerAftercare(request, env = {}) {
  if (request.method.toUpperCase() === "OPTIONS") {
    return withCors(request, env, new Response(null, { status: 204 }));
  }
  if (request.method.toUpperCase() !== "POST") {
    return withCors(request, env, json({ ok: false, error: "method_not_allowed" }, 405));
  }
  if (!isAllowedOrigin(request, env)) {
    return withCors(request, env, json({ ok: false, error: "origin_not_allowed" }, 403));
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return withCors(request, env, json({ ok: false, error: "invalid_json" }, 400));
  }

  try {
    const input = normalizeAftercareInput(body);
    const origin = clean(request.headers.get("origin"), 500);
    const verified = await verifyCustomerConfirmation(env, input.token, origin);
    const sessionId = clean(verified?.session_id, 200);
    if (!sessionId) throw httpError(401, "invalid_confirmation_token_subject");

    const job = await findJobBySessionId(env, sessionId);
    const state = normalizeSessionState(job?.fields?.status);
    if (!AFTERCARE_STATES.has(state)) {
      throw httpError(409, state === "work_finished" ? "aftercare_wait_for_separated" : "aftercare_not_available");
    }

    const events = parseEvents(job?.fields?.events_json);
    const existing = findExistingAftercare(events);
    if (existing) {
      return withCors(request, env, json(buildResponse({
        input,
        sessionId,
        job,
        state,
        event: existing,
        idempotent: true,
      }), 200));
    }

    const updatedAt = new Date().toISOString();
    const privateCareRecommended = shouldRecommendPrivateCare(input.rating, input.issueTags);
    const aftercareEvent = {
      ts: updatedAt,
      event: "aftercare_submitted",
      by: "customer",
      source: "mmd_aftercare_v2",
      schema: "customer_aftercare_v2",
      idempotency_key: input.idempotencyKey,
      rating: input.rating,
      quick_tags: input.quickTags,
      issue_tags: input.issueTags,
      private_model_message: input.privateModelMessage,
      private_mmd_message: input.privateMmdMessage,
      private_care_recommended: privateCareRecommended,
    };

    const nextEvents = appendTimelineEvent(events, aftercareEvent);
    let nextState = state;
    if (state === "separated") {
      nextState = "under_review";
      nextEvents.push({
        ts: updatedAt,
        event: "request_review",
        by: "customer_aftercare",
        source: "mmd_aftercare_v2",
        from: "separated",
        to: "under_review",
      });
    }

    const patched = await patchJob(env, job.id, {
      events_json: JSON.stringify(nextEvents.slice(-200)),
      status: nextState,
      last_update_at: updatedAt,
    });

    return withCors(request, env, json(buildResponse({
      input,
      sessionId,
      job: patched,
      state: nextState,
      event: aftercareEvent,
      idempotent: false,
    }), 201));
  } catch (error) {
    return withCors(request, env, json({
      ok: false,
      error: clean(error?.message || "aftercare_submit_failed", 200),
      authority: "events-worker",
    }, errorStatus(error)));
  }
}

export function normalizeAftercareInput(body = {}) {
  const token = clean(body.t || body.token, 12000);
  if (!token) throw httpError(400, "confirmation_token_required");

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw httpError(400, "rating_must_be_1_to_5");
  }

  const idempotencyKey = clean(body.idempotency_key || body.idempotencyKey, 120);
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) {
    throw httpError(400, "idempotency_key_invalid");
  }

  const quickTags = normalizeTags(body.quick_tags || body.tags, QUICK_TAGS, "quick_tag_invalid");
  const issueTags = normalizeTags(body.issue_tags || body.sensitive_tags, ISSUE_TAGS, "issue_tag_invalid");
  const privateModelMessage = safeText(body.private_model_message, 2000);
  const privateMmdMessage = safeText(body.private_mmd_message, 4000);

  return {
    token,
    rating,
    idempotencyKey,
    quickTags,
    issueTags,
    privateModelMessage,
    privateMmdMessage,
  };
}

export function shouldRecommendPrivateCare(rating, issueTags = []) {
  return Number(rating) <= 2 || issueTags.some((tag) => ISSUE_TAGS.has(String(tag || "")));
}

export function appendTimelineEvent(events, event) {
  const list = Array.isArray(events) ? events.slice(-198) : [];
  list.push(event);
  return list;
}

export function findExistingAftercare(events) {
  if (!Array.isArray(events)) return null;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (clean(events[index]?.event, 80) === "aftercare_submitted") return events[index];
  }
  return null;
}

async function verifyCustomerConfirmation(env, token, origin) {
  const base = clean(env.PAYMENTS_WORKER_BASE || "https://payments-worker.malemodel-bkk.workers.dev", 500).replace(/\/+$/, "");
  const request = new Request(`${base}/v1/confirm/details`, {
    method: "POST",
    headers: {
      origin: origin || "https://mmdbkk.com",
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ t: token, expected_role: "customer" }),
  });
  const response = env.PAYMENTS_HTTP?.fetch
    ? await env.PAYMENTS_HTTP.fetch(request)
    : await fetch(request);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok || data?.role !== "customer") {
    const status = [400, 401, 403, 410].includes(response.status) ? response.status : 503;
    throw httpError(status, clean(data?.error || "confirmation_verification_failed", 200));
  }
  return data;
}

async function findJobBySessionId(env, sessionId) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const table = clean(env.AIRTABLE_TABLE_JOBS || "jobs", 120);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !table || !apiKey) throw httpError(503, "aftercare_storage_not_ready");

  const query = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `{session_id}='${formulaValue(sessionId)}'`,
  });
  const request = new Request(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${query}`, {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const response = env.AIRTABLE_HTTP?.fetch
    ? await env.AIRTABLE_HTTP.fetch(request)
    : await fetch(request);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(503, "aftercare_storage_lookup_failed");
  const records = Array.isArray(data?.records) ? data.records : [];
  if (records.length > 1) throw httpError(409, "session_id_ambiguous");
  if (!records[0]) throw httpError(404, "aftercare_session_not_found");
  return records[0];
}

async function patchJob(env, recordId, fields) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const table = clean(env.AIRTABLE_TABLE_JOBS || "jobs", 120);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !table || !apiKey) throw httpError(503, "aftercare_storage_not_ready");

  const request = new Request(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const response = env.AIRTABLE_HTTP?.fetch
    ? await env.AIRTABLE_HTTP.fetch(request)
    : await fetch(request);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(503, "aftercare_storage_write_failed");
  return data;
}

function buildResponse({ input, sessionId, job, state, event, idempotent }) {
  const privateCareRecommended = Boolean(event?.private_care_recommended ?? shouldRecommendPrivateCare(input.rating, input.issueTags));
  return {
    ok: true,
    authority: "events-worker",
    schema: "customer_aftercare_v2",
    session_id: sessionId,
    job_id: clean(job?.fields?.job_id, 200) || null,
    state,
    aftercare_complete: true,
    idempotent: Boolean(idempotent),
    submitted_at: clean(event?.ts, 120) || null,
    private_model_message_received: Boolean(input.privateModelMessage || event?.private_model_message),
    private_mmd_message_received: Boolean(input.privateMmdMessage || event?.private_mmd_message),
    private_care: {
      recommended: privateCareRecommended,
      url: privateCareRecommended ? `/sigil/recovery?t=${encodeURIComponent(input.token)}` : null,
      reasons: privateCareRecommended ? privateCareReasons(input.rating, input.issueTags) : [],
    },
  };
}

function privateCareReasons(rating, issueTags) {
  const reasons = [];
  if (Number(rating) <= 2) reasons.push("low_rating");
  for (const tag of issueTags || []) if (!reasons.includes(tag)) reasons.push(tag);
  return reasons;
}

function normalizeTags(value, allowed, errorCode) {
  const source = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
  const output = [];
  for (const item of source) {
    const tag = clean(item, 80).toLowerCase().replace(/[\s-]+/g, "_");
    if (!tag) continue;
    if (!allowed.has(tag)) throw httpError(400, errorCode);
    if (!output.includes(tag)) output.push(tag);
  }
  return output;
}

function parseEvents(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function allowedOrigins(env = {}) {
  return clean(env.ALLOWED_ORIGINS || "https://mmdbkk.com,https://www.mmdbkk.com", 5000)
    .replace(/^[\"']|[\"']$/g, "")
    .split(",")
    .map((value) => value.trim().replace(/^[\"']|[\"']$/g, ""))
    .filter(Boolean);
}

function isAllowedOrigin(request, env = {}) {
  const origin = clean(request.headers.get("origin"), 500);
  return Boolean(origin && allowedOrigins(env).includes(origin));
}

function corsHeaders(request, env = {}) {
  const origin = clean(request.headers.get("origin"), 500);
  const headers = new Headers({
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
  });
  if (origin && allowedOrigins(env).includes(origin)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function withCors(request, env, response) {
  const headers = new Headers(response.headers);
  corsHeaders(request, env).forEach((value, key) => headers.set(key, value));
  headers.set("cache-control", "no-store, private");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function safeText(value, max) {
  return clean(value, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function errorStatus(error) {
  return Number.isInteger(error?.status) ? error.status : 500;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
