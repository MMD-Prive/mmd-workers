import { authorizeConfirmationRequest } from "./confirmation-ack.js";
import { personalMain, PERSONAL_MAINS } from "../shared/personal-main-catalog.mjs";

export const BLACKCARD_COMPANION_PREFERENCE_PATH = "/v1/confirm/companion-preference";
const NOTE_MARKER = "MMD BLACK CARD COMPANION PREFERENCE V1";
const DEFAULT_NOTE_FIELD = "fldEcDkF7CH9VixWM";
const DEFAULT_PACKAGE_FIELD = "fldp6xNSvxDh5pjR9";
const BLACKCARD_STATES = new Set(["pending", "awaiting_payment", "payment_started", "evidence_submitted", "pending_verification", "paid", "verified", "success", "completed"]);
const CLOSED_STATES = new Set(["cancelled", "canceled", "expired", "refunded", "reversed", "void", "failed", "rejected", "chargeback", "disputed"]);

const clean = (value, max = 5000) => String(value == null ? "" : value).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
const code = value => clean(value, 120).toLowerCase().replace(/[\s_-]+/g, "_");
const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const withCors = (request, env, response) => {
  const headers = new Headers(response.headers);
  const origin = clean(request.headers.get("origin"), 500);
  const allowed = clean(env.ALLOWED_ORIGINS, 5000).replace(/^[\"']|[\"']$/g, "").split(",").map(v => v.trim().replace(/^[\"']|[\"']$/g, "")).filter(Boolean);
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "Origin");
  if (origin && allowed.includes(origin)) headers.set("access-control-allow-origin", origin);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
const field = (env, name, fallback) => clean(env[name] || fallback, 120);
const sessionValue = (session, env, name, fallback) => session?.fields?.[field(env, name, fallback)] ?? session?.fields?.[fallback] ?? "";
const airtableRequest = async (env, path, init = {}) => {
  const base = clean(env.AIRTABLE_BASE_ID, 100), token = clean(env.AIRTABLE_API_KEY, 5000);
  if (!base || !token) { const e = new Error("airtable_not_ready"); e.status = 503; throw e; }
  const request = new Request("https://api.airtable.com/v0/" + encodeURIComponent(base) + "/" + path, { ...init, headers: { authorization: "Bearer " + token, "content-type": "application/json", ...(init.headers || {}) } });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const e = new Error("airtable_preference_failed"); e.status = response.status >= 500 ? 503 : 409; throw e; }
  return data;
};
const escapeFormula = value => clean(value, 300).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const parseStored = raw => {
  const text = clean(raw, 12000);
  const match = text.match(new RegExp("\\[" + NOTE_MARKER.replace(/[.*+?^{}()|[\\]\\\\]/g, "\\\\$&") + "\\]\\s*(\\{.*?\\})(?=\\n|$)"));
  if (!match) return null;
  try { const data = JSON.parse(match[1]); return data && typeof data === "object" ? data : null; } catch { return null; }
};
const marker = value => "[" + NOTE_MARKER + "] " + JSON.stringify(value);
const isBlackCardSession = (session, env) => {
  const packageValue = code(sessionValue(session, env, "AT_SESSIONS__PACKAGE_CODE", DEFAULT_PACKAGE_FIELD));
  const note = clean(sessionValue(session, env, "AT_SESSIONS__NOTE", DEFAULT_NOTE_FIELD) || sessionValue(session, env, "AT_SESSIONS__NOTES", "fldwl9Gs5tYlXG5ls"), 12000);
  const haystack = (packageValue + " " + note).toLowerCase();
  return packageValue === "black_card" || packageValue === "blackcard" || /black\s*card|blackcard/.test(haystack);
};
const paymentState = (session, env) => {
  const value = code(sessionValue(session, env, "AT_SESSIONS__PAYMENT_STATUS", "fldTY5lE6m0kQf72n") || sessionValue(session, env, "AT_SESSIONS__SESSION_STATUS", "fldmwuvOaiCFdzzRa"));
  return value || "pending";
};
const replaceMarker = (note, data) => {
  const next = marker(data);
  const re = new RegExp("\\[" + NOTE_MARKER.replace(/[.*+?^{}()|[\\]\\\\]/g, "\\\\$&") + "\\]\\s*\\{.*?\\}(?=\\n|$)");
  return re.test(note) ? note.replace(re, next) : [note, next].filter(Boolean).join("\n");
};
const readPreference = (session, env) => {
  const note = clean(sessionValue(session, env, "AT_SESSIONS__NOTE", DEFAULT_NOTE_FIELD) || sessionValue(session, env, "AT_SESSIONS__NOTES", "fldwl9Gs5tYlXG5ls"), 12000);
  return parseStored(note);
};
const savePreference = async (env, session, data) => {
  const noteField = field(env, "AT_SESSIONS__NOTE", DEFAULT_NOTE_FIELD);
  const note = clean(sessionValue(session, env, "AT_SESSIONS__NOTE", DEFAULT_NOTE_FIELD) || sessionValue(session, env, "AT_SESSIONS__NOTES", "fldwl9Gs5tYlXG5ls"), 12000);
  const nextNote = replaceMarker(note, data);
  const table = encodeURIComponent(clean(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 120));
  return airtableRequest(env, table + "/" + encodeURIComponent(session.id) + "?returnFieldsByFieldId=true", { method: "PATCH", body: JSON.stringify({ fields: { [noteField]: nextNote } }) });
};
const normalizeId = value => code(value).replace(/[^a-z0-9_]/g, "");
const selected = id => personalMain(normalizeId(id));
const preferenceStatus = state => CLOSED_STATES.has(state) ? "unavailable" : state === "paid" || state === "verified" || state === "success" || state === "completed" ? "selected_verified_pending_entitlement" : "selected_pending_verification";

export function isBlackCardCompanionPreferenceRequest(path, method) {
  const p = String(path || "/").replace(/\/{2,}/g, "/").replace(/\/+$/g, "") || "/";
  return p === BLACKCARD_COMPANION_PREFERENCE_PATH && ["GET", "POST", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

export async function handleBlackCardCompanionPreference(request, env = {}) {
  if (request.method.toUpperCase() === "OPTIONS") return withCors(request, env, new Response(null, { status: 204 }));
  if (!["GET", "POST"].includes(request.method.toUpperCase())) return withCors(request, env, json({ ok: false, error: "method_not_allowed" }, 405));
  const authorized = await authorizeConfirmationRequest(request, env);
  if (authorized.response) return authorized.response;
  if (authorized.expectedRole !== "customer") return withCors(request, env, json({ ok: false, error: "customer_confirmation_required" }, 403));
  try {
    if (!isBlackCardSession(authorized.session, env)) return withCors(request, env, json({ ok: false, error: "blackcard_product_required" }, 409));
    const state = paymentState(authorized.session, env);
    if (!BLACKCARD_STATES.has(state) || CLOSED_STATES.has(state)) return withCors(request, env, json({ ok: false, error: "blackcard_payment_state_unavailable" }, 409));
    const current = readPreference(authorized.session, env);
    if (request.method.toUpperCase() === "GET" || authorized.body?.read === true) return withCors(request, env, json({ ok: true, authority: "payments-worker", schema: "blackcard_companion_preference_v1", companion: current ? selected(current.companion_id) : null, preference_status: current ? preferenceStatus(state) : "not_selected", entitlement_activated: false, payment_status: state, session_id: authorized.claims.session_id }));
    const body = authorized.body || {};
    const companion = selected(body.companion_id || body.companion_preference);
    if (!companion) return withCors(request, env, json({ ok: false, error: "invalid_companion" }, 400));
    const next = { schema: 1, companion_id: companion.id, source: "blackcard_confirm", updated_at: new Date().toISOString(), payment_status_at_selection: state };
    if (current?.companion_id === next.companion_id) return withCors(request, env, json({ ok: true, authority: "payments-worker", schema: "blackcard_companion_preference_v1", companion, preference_status: preferenceStatus(state), entitlement_activated: false, payment_status: state, session_id: authorized.claims.session_id, idempotent: true }));
    await savePreference(env, authorized.session, next);
    return withCors(request, env, json({ ok: true, authority: "payments-worker", schema: "blackcard_companion_preference_v1", companion, preference_status: preferenceStatus(state), entitlement_activated: false, payment_status: state, session_id: authorized.claims.session_id, idempotent: false }));
  } catch (error) {
    return withCors(request, env, json({ ok: false, error: clean(error?.message || "companion_preference_failed", 200) }, Number(error?.status || 503)));
  }
}

export { PERSONAL_MAINS, isBlackCardSession, parseStored, preferenceStatus, replaceMarker, selected };

