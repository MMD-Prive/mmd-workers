import { readMemberAppSession } from "./member-app-api-runtime.js";

// Medical Professional is a request-only lane.  This endpoint intentionally
// accepts a small, non-clinical structured brief only after the customer has
// a server-verified MY MMD / LINE session.  It never creates a booking,
// payment, match, session, or clinical record.

const API = "https://api.airtable.com/v0";
export const MEDICAL_REQUEST_PATH = "/api/member/medical-request";
const REQUEST_TABLE = "SIGIL Booking Requests";
const PURPOSES = new Set([
  "healthcare_facility_companion",
  "healthcare_event_companion",
  "non_clinical_presence",
  "other_non_clinical",
]);
const TIME_WINDOWS = new Set(["morning", "afternoon", "evening", "flexible"]);
const BLOCKED_MEMBER_STATES = new Set(["blocked", "suspended", "revoked", "pending_review", "under_review"]);

export function isMedicalVerifiedRequestPath(input) {
  try {
    const url = input instanceof URL ? input : new URL(String(input));
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return path === MEDICAL_REQUEST_PATH;
  } catch { return false; }
}

export async function handleMedicalVerifiedRequest(request, env = {}) {
  try {
    return await handleMedicalVerifiedRequestUnsafe(request, env);
  } catch (error) {
    return fail(Number(error?.status) || 503, String(error?.code || "MEDICAL_REQUEST_UNAVAILABLE"));
  }
}

async function handleMedicalVerifiedRequestUnsafe(request, env = {}) {
  if (!sameOrigin(request)) return fail(403, "SAME_ORIGIN_REQUIRED", "Open this request through MMD.");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (!new Set(["GET", "POST"]).has(request.method)) return fail(405, "METHOD_NOT_ALLOWED", "GET or POST required.");

  const identity = await readMemberAppSession(request, env);
  if (!identity?.lineUserId || identity.memberExists !== true || !identity.memberId) {
    return fail(401, "VERIFIED_MEMBER_SESSION_REQUIRED", "Open MY MMD through LINE and complete identity verification first.");
  }
  const membership = normalizedMemberStatus(identity.memberProfile?.membership_status || identity.memberProfile?.status);
  if (BLOCKED_MEMBER_STATES.has(membership)) {
    return fail(403, "MEMBER_REVIEW_REQUIRED", "Your member profile needs MMD review before a request can be received.");
  }

  if (request.method === "GET") {
    return json({
      ok: true,
      eligible: true,
      flow: "medical_verified_request_v1",
      request_only: true,
      accepts_sensitive_medical_data: false,
      booking_created: false,
      payment_required: false,
    });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "REQUEST_BODY_INVALID");
  const requestData = validateBody(body);
  const reference = await requestReference(env, identity, requestData);
  const existing = await findByReference(env, reference);
  if (existing) return json(receipt(reference, true));

  const now = new Date().toISOString();
  const fields = compact({
    "Request ID": reference,
    "Request Status": "review_required",
    "Created At": now,
    "Source": "medical_verified_request",
    "Source Path": "/public/access",
    "Selected Model Name": requestData.modelPreference || undefined,
    "Preference Text": requestData.purpose,
    "Preferred Date": requestData.preferredDate || undefined,
    "Preferred Time": requestData.timeWindow || undefined,
    "Contact Method": "line",
    "Admin Notes": "Medical Professional verified request only. MMD must complete scope and credential review before any match, price, payment, booking, or session action.",
    "Raw Safety Note": "Structured non-clinical request only. No diagnosis, treatment, emergency handling, patient record, or sensitive medical detail was collected.",
    booking_ref: reference,
    member_status: "verified_request",
    access_scope: "public_only",
    lane: "public",
    job_class: "medical_request_only",
    model_scope: "public",
    model_search_query: requestData.modelPreference || "",
    resolver_payload_json: JSON.stringify({
      schema: "medical_verified_request_v1",
      state: "pending_mmd_scope_review",
      verified_member_id: identity.memberId,
      verified_customer_ref_hash: await customerRefHash(env, identity.lineUserId),
      request_purpose: requestData.purpose,
      preferred_date: requestData.preferredDate || null,
      time_window: requestData.timeWindow || null,
      area: requestData.area || null,
      model_preference: requestData.modelPreference || null,
      acknowledgements: ["not_emergency", "no_diagnosis_or_treatment", "mmd_review_required"],
      received_at: now,
    }),
  });

  await createRequest(env, fields);
  return json(receipt(reference, false), 201);
}

function validateBody(body) {
  const keys = new Set(["purpose", "preferred_date", "time_window", "area", "model_preference", "acknowledgements"]);
  if (Object.keys(body).some((key) => !keys.has(key))) throw httpError(400, "REQUEST_FIELDS_NOT_ALLOWED");
  const purpose = clean(body.purpose, 80).toLowerCase();
  if (!PURPOSES.has(purpose)) throw httpError(400, "REQUEST_PURPOSE_INVALID");
  const preferredDate = clean(body.preferred_date, 10);
  if (preferredDate && !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) throw httpError(400, "PREFERRED_DATE_INVALID");
  const timeWindow = clean(body.time_window, 32).toLowerCase();
  if (timeWindow && !TIME_WINDOWS.has(timeWindow)) throw httpError(400, "TIME_WINDOW_INVALID");
  const area = clean(body.area, 120);
  const modelPreference = clean(body.model_preference, 120);
  const acknowledgements = Array.isArray(body.acknowledgements) ? body.acknowledgements.map((value) => clean(value, 64).toLowerCase()) : [];
  for (const required of ["not_emergency", "no_diagnosis_or_treatment", "mmd_review_required"]) {
    if (!acknowledgements.includes(required)) throw httpError(400, "ACKNOWLEDGEMENT_REQUIRED");
  }
  return { purpose, preferredDate, timeWindow, area, modelPreference };
}

async function requestReference(env, identity, data) {
  const fingerprint = JSON.stringify({ member: identity.memberId, ...data });
  const digest = await hmac(env, `medical-request:${fingerprint}`);
  return `MED-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${digest.slice(0, 16).toUpperCase()}`;
}

async function customerRefHash(env, lineUserId) { return (await hmac(env, `medical-customer:${lineUserId}`)).slice(0, 32); }
async function hmac(env, value) {
  const secret = String(env.LIFF_SESSION_SECRET || "");
  if (secret.length < 32) throw httpError(503, "VERIFIED_REQUEST_UNAVAILABLE");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function findByReference(env, reference) {
  const response = await airtable(env, table(env), `?filterByFormula=${encodeURIComponent(`{booking_ref}='${reference.replace(/'/g, "\\'")}'`)}&maxRecords=1`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(502, "MEDICAL_REQUEST_STORAGE_UNAVAILABLE");
  return Array.isArray(payload.records) ? payload.records[0] || null : null;
}

async function createRequest(env, fields) {
  const response = await airtable(env, table(env), "", { method: "POST", body: JSON.stringify({ records: [{ fields }], typecast: true }) });
  if (!response.ok) throw httpError(502, "MEDICAL_REQUEST_STORAGE_UNAVAILABLE");
}

function table(env) { return String(env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID || env.AIRTABLE_TABLE_BOOKING_REQUESTS || REQUEST_TABLE).trim(); }
function airtable(env, tableName, suffix, init = {}) {
  if (!String(env.AIRTABLE_API_KEY || "").trim() || !String(env.AIRTABLE_BASE_ID || "").trim()) throw httpError(503, "MEDICAL_REQUEST_STORAGE_UNAVAILABLE");
  const request = new Request(`${API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}${suffix}`, {
    ...init,
    headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json", "content-type": "application/json", ...(init.headers || {}) },
  });
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request);
}

function receipt(reference, idempotent) {
  return {
    ok: true,
    request_ref: reference,
    state: "pending_mmd_scope_review",
    idempotent,
    request_only: true,
    booking_created: false,
    payment_required: false,
    official_review_required: true,
  };
}
function clean(value, max = 240) { return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : ""; }
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined && field !== null && field !== "")); }
function normalizedMemberStatus(value) { return clean(String(value || ""), 80).toLowerCase().replace(/[\s-]+/g, "_"); }
function sameOrigin(request) { const origin = String(request.headers.get("origin") || "").toLowerCase(); return origin === "https://mmdbkk.com" || origin === "https://www.mmdbkk.com"; }
function corsHeaders() { return { "access-control-allow-origin": "https://www.mmdbkk.com", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type", "cache-control": "no-store" }; }
function json(data, status = 200) { return Response.json(data, { status, headers: { "cache-control": "no-store", "x-mmd-medical-request": "v1" } }); }
function fail(status, code, message = code) { return json({ ok: false, error: { code, message } }, status); }
function httpError(status, code) { const error = new Error(code); error.status = status; error.code = code; return error; }
