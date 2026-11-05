import { normalizeSessionState } from "../../admin-worker/src/modelSessionContractV1.js";
import { COMPLETION_SCHEMA, readCustomerCompletion, withSessionCompletionLock } from "../../shared/session-completion.mjs";
import {notifyAftercareOwner} from './owner-aftercare-notification.js';

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

    return await withSessionCompletionLock(env, sessionId, async () => {
    const job = await findJobBySessionId(env, sessionId);
    const state = normalizeSessionState(job?.fields?.model_session_state);
    if (!AFTERCARE_STATES.has(state)) {
      throw httpError(409, state === "work_finished" ? "aftercare_wait_for_separated" : "aftercare_not_available");
    }

    const completion = readCustomerCompletion(job.fields);
    const existing = completion.review;
    if ((input.action === "approve_completion" && completion.approved) || existing) {
      return withCors(request, env, json(buildResponse({
        input,
        sessionId,
        job,
        state,
        event: existing || {},
        idempotent: true,
      }), 200));
    }

    if (input.action === "submit_review" && !completion.approved) throw httpError(409, "customer_completion_required");
    if (input.action === "approve_completion" && state !== "separated") throw httpError(409, "customer_completion_not_available");
    if (job.fields.customer_aftercare_json && !completion.approved) throw httpError(409, "completion_evidence_review_required");

    const updatedAt = new Date().toISOString();
    const privateCareRecommended = input.action === "submit_review" && shouldRecommendPrivateCare(input.rating, input.issueTags, input.ratingScale);
    const aftercareEvent = {
      ts: updatedAt,
      event: "aftercare_submitted",
      by: "customer",
      source: "mmd_aftercare_v2",
      schema: "customer_aftercare_v2",
      idempotency_key: input.idempotencyKey,
      rating: input.rating,
      rating_scale: input.ratingScale,
      quick_tags: input.quickTags,
      issue_tags: input.issueTags,
      private_model_message: input.privateModelMessage,
      private_mmd_message: input.privateMmdMessage,
      private_care_recommended: privateCareRecommended,
    };

    const approving = input.action === "approve_completion";
    const nextState = approving ? "under_review" : state;
    const evidence = approving ? { schema: COMPLETION_SCHEMA, session_id: sessionId, approved_at: updatedAt,
      approval_id: input.idempotencyKey, review: null } : { ...completion.evidence, review: aftercareEvent };
    const fields = { customer_aftercare_json: JSON.stringify(evidence) };
    if (approving) Object.assign(fields, { customer_completed_at: updatedAt, model_session_state: nextState,
      model_session_state_updated_at: updatedAt,
      completion_review_status: job.fields.completion_review_status === "hold" ? "hold" : "pending_review" });
    if (privateCareRecommended && state !== "closed") Object.assign(fields, {
      completion_review_status: "hold", payout_hold_reason: "customer_review_requires_attention",
    });
    const fresh = await findJobBySessionId(env, sessionId);
    if (fresh.id !== job.id || JSON.stringify(fresh.fields) !== JSON.stringify(job.fields)) throw httpError(409, "session_changed_retry");
    const patched = await patchJob(env, job.id, fields);
    // Notification failure does not undo the customer's recorded approval/review.
    const notification = await notifyAftercareOwner(env,patched,approving?'customer_completion_approved':'customer_review_received');

    return withCors(request, env, json(buildResponse({
      input,
      sessionId,
      job: patched,
      state: nextState,
      event: approving ? {} : aftercareEvent,
      idempotent: false,
    }, notification), 201));
    });
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

  const action = body.action || "submit_review";
  if (!["approve_completion", "submit_review"].includes(action)) throw httpError(400, "invalid_aftercare_action");
  if (action === "approve_completion" && body.confirm_completed !== true) throw httpError(400, "explicit_completion_approval_required");
  const ratingScale = Number(body.rating_scale || 5);
  const rating = action === "approve_completion" ? null : Number(body.rating);
  if (action === "submit_review" && (![5, 10].includes(ratingScale) || !Number.isInteger(rating) || rating < 1 || rating > ratingScale)) {
    throw httpError(400, "rating_out_of_range");
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
    action,
    token,
    rating,
    ratingScale,
    idempotencyKey,
    quickTags,
    issueTags,
    privateModelMessage,
    privateMmdMessage,
  };
}

export function shouldRecommendPrivateCare(rating, issueTags = [], ratingScale = 5) {
  return Number(rating) > 0 && Number(rating) / ratingScale <= 0.4 || issueTags.some((tag) => ISSUE_TAGS.has(String(tag || "")));
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
  const table = clean(env.AIRTABLE_TABLE_SESSIONS || "Sessions", 120);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !table || !apiKey) throw httpError(503, "aftercare_storage_not_ready");

  const query = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `{session_id}='${formulaValue(sessionId)}'`,
  });
  const request = new Request(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${query}`, {
    method: "GET",
    signal: AbortSignal.timeout(10000),
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const response = env.AIRTABLE_HTTP?.fetch
    ? await env.AIRTABLE_HTTP.fetch(request)
    : await fetch(request);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(503, "aftercare_storage_lookup_failed");
  const records = Array.isArray(data?.records) ? data.records : [];
  if (records.length > 1 || data.offset) throw httpError(409, "session_id_ambiguous");
  if (!records[0]) throw httpError(404, "aftercare_session_not_found");
  if (records[0].fields?.session_id !== sessionId) throw httpError(409, "aftercare_session_mismatch");
  return records[0];
}

async function patchJob(env, recordId, fields) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const table = clean(env.AIRTABLE_TABLE_SESSIONS || "Sessions", 120);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !table || !apiKey) throw httpError(503, "aftercare_storage_not_ready");

  const request = new Request(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    signal: AbortSignal.timeout(10000),
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

function buildResponse({ input, sessionId, job, state, event, idempotent }, notification = null) {
  const privateCareRecommended = event?.private_care_recommended === true;
  return {
    ok: true,
    authority: "events-worker",
    schema: "customer_aftercare_v2",
    session_id: sessionId,
    job_id: clean(job?.fields?.job_id, 200) || null,
    state,
    customer_approved: readCustomerCompletion(job.fields).approved,
    aftercare_complete: Boolean(event?.ts),
    ...(notification ? { owner_notification: { delivered: notification.ok === true } } : {}),
    idempotent: Boolean(idempotent),
    submitted_at: clean(event?.ts, 120) || null,
    private_model_message_received: Boolean(input.privateModelMessage || event?.private_model_message),
    private_mmd_message_received: Boolean(input.privateMmdMessage || event?.private_mmd_message),
    private_care: {
      recommended: privateCareRecommended,
      url: privateCareRecommended ? `/sigil/recovery?t=${encodeURIComponent(input.token)}` : null,
      reasons: privateCareRecommended ? privateCareReasons(event.rating / (event.rating_scale || 5) * 5, event.issue_tags) : [],
    },
  };
}

function escapeHtml(value) { return String(value).replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

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
