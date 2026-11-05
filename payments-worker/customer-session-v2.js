import { formulaValue } from "./lib/payment-primitives.js";
import { readCustomerCompletion } from "../shared/session-completion.mjs";
const AIRTABLE_API = "https://api.airtable.com/v0";

export const CUSTOMER_SESSION_DETAILS_PATH = "/v1/confirm/details";

const TRAVEL_STATES = new Set(["en_route", "nearby"]);
const ARRIVAL_STATES = new Set([
  "arrived",
  "met_customer",
  "final_payment_pending",
  "final_payment_confirmed",
]);
const SERVICE_STATES = new Set(["work_started", "work_finished"]);
const POST_SEPARATION_STATES = new Set([
  "separated",
  "review",
  "under_review",
  "payout",
  "payout_pending",
  "closed",
]);

const STATE_ALIASES = Object.freeze({
  assigned: "confirmed",
  traveling: "en_route",
  met: "met_customer",
  met_client: "met_customer",
  payment_pending: "final_payment_pending",
  payment_confirmed: "final_payment_confirmed",
  working: "work_started",
  finished: "work_finished",
});

export function isCustomerSessionDetailsRequest(path, method) {
  const normalized = normalizePath(path);
  const verb = String(method || "GET").toUpperCase();
  return normalized === CUSTOMER_SESSION_DETAILS_PATH && (verb === "POST" || verb === "OPTIONS");
}

export async function handleCustomerSessionDetails(request, env = {}, next) {
  if (typeof next !== "function") throw new TypeError("customer_session_next_required");

  const method = request.method.toUpperCase();
  const tokenBodyPromise = method === "POST"
    ? request.clone().json().catch(() => null)
    : Promise.resolve(null);

  const baseResponse = await next(request);
  if (method !== "POST" || !baseResponse.ok) return baseResponse;

  const payload = await baseResponse.clone().json().catch(() => null);
  if (!payload?.ok || payload?.role !== "customer" || !text(payload?.session_id, 200)) {
    return baseResponse;
  }

  const body = await tokenBodyPromise;
  const token = text(body?.t || body?.token, 12000);
  let session = null;
  let job = null;
  let sourceAvailable = true;

  try {
    session = await findRecordBySessionId(env, env.AIRTABLE_TABLE_SESSIONS || "Sessions", payload.session_id);
    sourceAvailable = Boolean(session);
  } catch {
    sourceAvailable = false;
  }

  // Jobs supply ETA only; their status never supplies or unlocks lifecycle state.
  if (TRAVEL_STATES.has(normalizeLifecycleState(session?.fields?.model_session_state))) {
    try {
      job = await findRecordBySessionId(env, env.AIRTABLE_TABLE_JOBS || "jobs", payload.session_id);
    } catch {
      // An unavailable ETA does not invalidate the canonical session.
    }
  }

  const tracker = buildCustomerSessionTracker({
    sessionFields: session?.fields || null,
    jobFields: job?.fields || null,
    confirmation: payload,
    token,
    sourceAvailable,
  });

  return replaceJson(baseResponse, {
    ...payload,
    customer_session: tracker,
  });
}

export function buildCustomerSessionTracker({ sessionFields, jobFields, confirmation = {}, token = "", sourceAvailable = true } = {}) {
  const available = Boolean(sourceAvailable && sessionFields);
  const state = available ? normalizeLifecycleState(sessionFields.model_session_state) : "";
  const aftercareAvailable = available && POST_SEPARATION_STATES.has(state);
  const eta = TRAVEL_STATES.has(state) ? latestEta(jobFields?.events_json) : null;
  const signedToken = text(token, 12000);
  const completion = readCustomerCompletion(sessionFields || {});

  return {
    schema: "customer_session_v2",
    source: sessionFields ? "Sessions" : "confirmation",
    source_available: available,
    lifecycle_state: state || null,
    customer_stage: customerStage(state),
    status_updated_at: available ? text(sessionFields.model_session_state_updated_at, 120) || null : null,
    eta,
    privacy: {
      live_gps: false,
      exposes_events_json: false,
      eta_source: eta ? "model_sent" : null,
    },
    aftercare: {
      available: aftercareAvailable,
      customer_approved: available && Boolean(completion.approved),
      review_submitted: available && Boolean(completion.review?.ts),
      unlock_state: "separated",
      url: aftercareAvailable && signedToken ? signedPath("/aftercare", signedToken) : null,
      rating_min: 1,
      rating_max: 5,
      quick_tags: ["on_time", "polite", "good_care", "matched_brief", "want_again"],
      private_model_message: true,
      private_mmd_message: true,
    },
    private_care: {
      url: signedToken ? signedPath("/sigil/recovery", signedToken) : "/sigil/recovery",
      context_transport: signedToken ? "signed_confirmation_token" : "none",
      suggested_when: {
        rating_lte: 2,
        tags: ["privacy", "safety", "payment", "brief_mismatch"],
      },
    },
    context: {
      session_id: text(confirmation?.session_id, 200) || null,
      payment_ref: text(confirmation?.payment_ref, 200) || null,
      job_id: text(sessionFields?.job_id || jobFields?.job_id, 200) || null,
    },
  };
}

export function latestEta(value) {
  const events = parseEvents(value);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const item = events[index];
    if (normalizeCode(item?.event) !== "eta_update") continue;
    const minutes = Number(item?.eta_minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) continue;
    return {
      minutes,
      updated_at: text(item?.ts || item?.updated_at, 120) || null,
    };
  }
  return null;
}

export function normalizeLifecycleState(value) {
  const raw = normalizeCode(value);
  return STATE_ALIASES[raw] || raw;
}

export function customerStage(stateValue) {
  const state = normalizeLifecycleState(stateValue);
  if (!state) return "confirmation";
  if (["offered", "offer_declined", "offer_expired"].includes(state)) return "confirmation";
  if (["confirmed", "reminder"].includes(state)) return "confirmed";
  if (state === "en_route") return "en_route";
  if (state === "nearby") return "nearby";
  if (ARRIVAL_STATES.has(state)) return "arrived";
  if (SERVICE_STATES.has(state)) return "service";
  if (POST_SEPARATION_STATES.has(state)) return "aftercare";
  return "confirmed";
}

async function findRecordBySessionId(env, tableName, sessionId) {
  const baseId = text(env.AIRTABLE_BASE_ID, 100);
  const table = text(tableName, 120);
  const apiKey = text(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !table || !apiKey) throw new Error("customer_session_storage_not_ready");

  const query = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `{session_id}='${formulaValue(sessionId)}'`,
  });
  const req = new Request(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${query.toString()}`, {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const response = env.AIRTABLE_HTTP?.fetch
    ? await env.AIRTABLE_HTTP.fetch(req)
    : await fetch(req);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("customer_session_storage_lookup_failed");
  const records = Array.isArray(data?.records) ? data.records : [];
  if (records.length > 1 || data.offset) throw new Error("customer_session_id_ambiguous");
  if (records[0] && records[0].fields?.session_id !== sessionId) throw new Error("customer_session_id_mismatch");
  return records[0] || null;
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

function signedPath(path, token) {
  return `${path}?t=${encodeURIComponent(token)}`;
}

function replaceJson(response, payload) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-customer-session", "customer_session_v2");
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function text(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}
