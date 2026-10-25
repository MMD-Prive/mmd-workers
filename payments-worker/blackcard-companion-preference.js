import { authorizeConfirmationRequest } from "./confirmation-ack.js";
import { personalMain } from "../shared/personal-main-catalog.mjs";

export const BLACKCARD_COMPANION_PREFERENCE_PATH = "/v1/confirm/companion-preference";
const TABLE = "mmd_blackcard_companion_preferences";
const OUTBOX = "mmd_blackcard_companion_audit_outbox";
const MIRROR_TABLE = "tblmU2D3u0fjlBpeo";
const MEMBERS_TABLE = "tblgWc5VRon5o8Mhk";
const MEMBER_ID_FIELD = "fldHsczyzr8axfwUC";
const MEMBER_RECORD_ID_FIELD = "fld3hISS6bp1fjOQT";
const COMPANIONS = new Set(["hito", "hima", "hiro", "hiei"]);

const clean = (value, max = 500) => String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const field = (env, key, fallback) => clean(env[key] || fallback, 100);
const sessionValue = (session, env, key, fallback) => session?.fields?.[field(env, key, fallback)] ?? session?.fields?.[fallback] ?? "";
const code = value => clean(value, 100).toLowerCase().replace(/[\s-]+/g, "_");
const CLOSED_STATES = new Set(["cancelled", "canceled", "expired", "refunded", "reversed", "void", "failed", "rejected", "chargeback", "disputed"]);
const PREFERENCE_STATES = new Set(["evidence_submitted", "pending_verification", "paid", "verified", "success", "completed"]);

export function isBlackCardCompanionPreferenceRequest(path, method) {
  const normalized = String(path || "/").replace(/\/{2,}/g, "/").replace(/\/+$/g, "") || "/";
  return normalized === BLACKCARD_COMPANION_PREFERENCE_PATH && ["GET", "POST", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

export async function handleBlackCardCompanionPreference(request, env = {}) {
  if (request.method.toUpperCase() === "OPTIONS") return corsJson(request, env, null, 204);
  if (request.method.toUpperCase() !== "POST") return corsJson(request, env, { ok: false, error: "method_not_allowed" }, 405);
  const authorized = await authorizeConfirmationRequest(request, env);
  if (authorized.response) return authorized.response;
  if (authorized.expectedRole !== "customer") return corsJson(request, env, { ok: false, error: "customer_confirmation_required" }, 403);
  if (!env.BLACKCARD_DB?.prepare) return corsJson(request, env, { ok: false, error: "preference_storage_unavailable" }, 503);

  try {
    const { session, claims, body } = authorized;
    const memberId = clean(sessionValue(session, env, "AT_SESSIONS__MEMBER_ID", MEMBER_ID_FIELD), 160);
    if (!/^[A-Za-z0-9_-]{3,160}$/.test(memberId)) return corsJson(request, env, { ok: false, error: "verified_member_account_required" }, 403);
    if (!isBlackCardSession(session, env)) return corsJson(request, env, { ok: false, error: "blackcard_product_required" }, 409);
    if (!["membership", "blackcard", "black_card"].includes(code(claims.payment_type))) return corsJson(request, env, { ok: false, error: "blackcard_confirmation_required" }, 409);
    const paymentStatus = sessionPaymentState(session, env);
    if (!PREFERENCE_STATES.has(paymentStatus) || CLOSED_STATES.has(paymentStatus)) return corsJson(request, env, { ok: false, error: "blackcard_payment_state_unavailable" }, 409);

    const correlationHash = await sha256(clean(requestToken(body), 12000));
    const idempotencyKey = await sha256(`${memberId}:${correlationHash}`);
    const current = await env.BLACKCARD_DB.prepare(`SELECT request_id, idempotency_key, correlation_hash, payload_hash, request_type, companion_preference, experience_preferences_json, note, change_reason, current_companion_snapshot, audit_event_id, retention_expires_at, status, created_at, updated_at FROM ${TABLE} WHERE idempotency_key = ?`).bind(idempotencyKey).first();

    if (body.read === true) {
      const row = current || await env.BLACKCARD_DB.prepare(`SELECT request_id, idempotency_key, correlation_hash, payload_hash, request_type, companion_preference, experience_preferences_json, note, change_reason, current_companion_snapshot, audit_event_id, retention_expires_at, status, created_at, updated_at FROM ${TABLE} WHERE member_id = ? ORDER BY rowid DESC LIMIT 1`).bind(memberId).first();
      if (row && !await mirrorPendingPreference(env, row, memberId, session, correlationHash, row.idempotency_key, row.payload_hash)) return corsJson(request, env, { ok: false, error: "preference_review_sync_pending" }, 503);
      const companion = row ? personalMain(row.companion_preference) : null;
      return corsJson(request, env, { ok: true, authority: "payments-worker", schema: "blackcard_companion_preference_v1", companion, preference_status: row?.status || "not_selected", payment_status: paymentStatus, entitlement_activated: false, session_id: claims.session_id, request_id: row?.request_id || null, idempotent: Boolean(row) });
    }

    const companion = normalizeCompanion(body.companion_id || body.companion_preference);
    if (!companion) return corsJson(request, env, { ok: false, error: "invalid_companion" }, 400);
    const note = clean(body.note, 500);
    const changeReason = clean(body.change_reason, 500);
    const experiencePreferences = Array.isArray(body.experience_preferences) ? [...new Set(body.experience_preferences.filter(value => EXPERIENCE_PREFERENCES.has(value)))].sort() : [];
    if (Array.isArray(body.experience_preferences) && (body.experience_preferences.length > 6 || experiencePreferences.length !== body.experience_preferences.length)) return corsJson(request, env, { ok: false, error: "preference_invalid" }, 400);
    const payloadHash = await sha256(JSON.stringify({ companion_preference: companion.id, experience_preferences: experiencePreferences, note, change_reason: changeReason }));
    const prior = current;
    if (prior) {
      if (prior.payload_hash !== payloadHash) return corsJson(request, env, { ok: false, error: "idempotency_conflict" }, 409);
      if (!await mirrorPendingPreference(env, prior, memberId, session, correlationHash, idempotencyKey, payloadHash)) return corsJson(request, env, { ok: false, error: "preference_review_sync_pending", request_id: prior.request_id }, 503);
      return accepted(request, env, prior, companion, claims.session_id, true, paymentStatus);
    }

    const previous = await env.BLACKCARD_DB.prepare(`SELECT request_id, idempotency_key, correlation_hash, payload_hash, request_type, companion_preference, experience_preferences_json, note, change_reason, current_companion_snapshot, audit_event_id, retention_expires_at, status, created_at, updated_at FROM ${TABLE} WHERE member_id = ? ORDER BY rowid DESC LIMIT 1`).bind(memberId).first();
    if (previous && previous.payload_hash === payloadHash) {
      if (!await mirrorPendingPreference(env, previous, memberId, session, previous.correlation_hash || correlationHash, previous.idempotency_key, previous.payload_hash)) return corsJson(request, env, { ok: false, error: "preference_review_sync_pending", request_id: previous.request_id }, 503);
      return accepted(request, env, previous, personalMain(previous.companion_preference), claims.session_id, true, paymentStatus);
    }
    const requestType = previous ? "companion_change_request" : "first_companion_preference";
    if (previous && !changeReason) return corsJson(request, env, { ok: false, error: "change_reason_required" }, 400);
    const retentionDays = Number(env.BLACKCARD_PREFERENCE_RETENTION_DAYS);
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) return corsJson(request, env, { ok: false, error: "preference_retention_policy_unavailable" }, 503);
    const now = new Date().toISOString();
    const requestId = `bcp_${crypto.randomUUID().replace(/-/g, "")}`;
    const auditId = `bca_${crypto.randomUUID().replace(/-/g, "")}`;
    const currentCompanion = previous?.companion_preference || null;
    const insert = env.BLACKCARD_DB.prepare(`INSERT OR IGNORE INTO ${TABLE} (request_id, member_id, line_user_id_hash, correlation_hash, idempotency_key, payload_hash, request_type, companion_preference, experience_preferences_json, note, change_reason, current_companion_snapshot, status, audit_event_id, retention_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?, ?)`)
      .bind(requestId, memberId, "", correlationHash, idempotencyKey, payloadHash, requestType, companion.id, JSON.stringify(experiencePreferences), note, changeReason, currentCompanion, auditId, new Date(Date.now() + retentionDays * 86400000).toISOString(), now, now);
    const audit = env.BLACKCARD_DB.prepare(`INSERT OR IGNORE INTO ${OUTBOX} (event_id, idempotency_key, event_type, member_id_hash, request_id, created_at, delivery_status) SELECT ?, ?, 'blackcard.companion_preference.requested', ?, request_id, ?, 'pending' FROM ${TABLE} WHERE idempotency_key = ?`)
      .bind(auditId, idempotencyKey, await sha256(memberId), now, idempotencyKey);
    await env.BLACKCARD_DB.batch([insert, audit]);
    const saved = await env.BLACKCARD_DB.prepare(`SELECT request_id, idempotency_key, payload_hash, request_type, companion_preference, experience_preferences_json, note, change_reason, current_companion_snapshot, audit_event_id, retention_expires_at, status, created_at, updated_at FROM ${TABLE} WHERE idempotency_key = ?`).bind(idempotencyKey).first();
    if (!saved) return corsJson(request, env, { ok: false, error: "preference_storage_unavailable" }, 503);
    if (saved.payload_hash !== payloadHash) return corsJson(request, env, { ok: false, error: "idempotency_conflict" }, 409);
    if (!await mirrorPendingPreference(env, saved, memberId, session, correlationHash, idempotencyKey, payloadHash)) return corsJson(request, env, { ok: false, error: "preference_review_sync_pending", request_id: saved.request_id }, 503);
    return accepted(request, env, saved, companion, claims.session_id, saved.request_id !== requestId, paymentStatus);
  } catch {
    return corsJson(request, env, { ok: false, error: "preference_storage_unavailable" }, 503);
  }
}

function corsJson(request, env, payload, status = 200) {
  const origin = clean(request.headers.get("origin"), 500);
  const allow = clean(env.ALLOWED_ORIGINS, 5000).replace(/^["']|["']$/g, "").split(",").map(value => value.trim().replace(/^["']|["']$/g, ""));
  const headers = { "cache-control": "no-store", "vary": "Origin", "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "Content-Type" };
  if (origin && allow.includes(origin)) headers["access-control-allow-origin"] = origin;
  if (status === 204) return new Response(null, { status, headers });
  return new Response(JSON.stringify(payload), { status, headers: { ...headers, "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" } });
}

const EXPERIENCE_PREFERENCES = new Set(["calm-presence", "easy-conversation", "privacy", "warm-energy", "clear-boundaries", "bangkok-guidance"]);
const requestToken = body => body?.t || body?.token || "";
function normalizeCompanion(value) { const id = clean(value, 40).toLowerCase().replace(/[^a-z0-9_-]/g, ""); return COMPANIONS.has(id) ? personalMain(id) : null; }
function accepted(request, env, row, companion, sessionId, idempotent, paymentStatus) {
  return corsJson(request, env, { ok: true, authority: "payments-worker", schema: "blackcard_companion_preference_v1", companion, preference_status: row.status, status: row.status, request_id: row.request_id, submitted_at: row.created_at, payment_status: paymentStatus, entitlement_activated: false, session_id: sessionId, idempotent }, 202);
}
export function isBlackCardSession(session, env) {
  const packageCode = code(sessionValue(session, env, "AT_SESSIONS__PACKAGE_CODE", "fldp6xNSvxDh5pjR9"));
  return ["black_card", "blackcard"].includes(packageCode);
}
function sessionPaymentState(session, env) {
  const status = code(sessionValue(session, env, "AT_SESSIONS__PAYMENT_STATUS", "fldTY5lE6m0kQf72n") || sessionValue(session, env, "AT_SESSIONS__SESSION_STATUS", "fldmwuvOaiCFdzzRa"));
  return status || "pending";
}
async function mirrorPendingPreference(env, row, memberId, session, correlationHash, idempotencyKey, payloadHash) {
  try {
    if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("mirror_configuration_missing");
    const endpoint = `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${MIRROR_TABLE}`;
    const lookup = new URL(endpoint); lookup.searchParams.set("filterByFormula", `{fldPYEff5pSnpjk0p}='${idempotencyKey}'`); lookup.searchParams.set("maxRecords", "2");
    const headers = { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json", "content-type": "application/json" };
    const existingResponse = await airtableFetch(env, new Request(lookup, { headers }));
    if (!existingResponse.ok) throw new Error("mirror_lookup_failed");
    const existing = await existingResponse.json();
    if (!Array.isArray(existing.records) || existing.records.length > 1) throw new Error("mirror_identity_conflict");
    let recordId = existing.records[0]?.id || "";
    if (recordId) {
      const fields = existing.records[0].fields || {};
      if (fields.fldOlcIzDs5QbDN2c !== row.request_id || fields.fldLiLJd4SmBkKO5B !== payloadHash || fields.fldPYEff5pSnpjk0p !== idempotencyKey) throw new Error("mirror_payload_conflict");
    } else {
      const memberRecordId = await resolveMemberRecordId(env, memberId);
      if (!memberRecordId) throw new Error("canonical_member_unresolved");
      const fields = {
        fldOlcIzDs5QbDN2c: row.request_id, fld6I0jkPbACVSVWV: [memberRecordId], fldMiUCgSuP229TcZ: memberId,
        fld3inSQEneySuxez: correlationHash, fldPYEff5pSnpjk0p: idempotencyKey, fldLiLJd4SmBkKO5B: payloadHash,
        fldMCzDdLuzLfcHIJ: row.request_type, fldlR0h05dSjyDIcw: row.companion_preference,
        fldxw53oA5eTu8MKy: parseArray(row.experience_preferences_json), fldEZrXcf97ON2mqI: row.note,
        fldn9wU28zjv37lye: row.change_reason, ...(row.current_companion_snapshot ? { fldTkZboOvHQFsfOp: row.current_companion_snapshot } : {}),
        fldmUukFu7vlCNVRS: row.status, fld8DwXQ5xdunoDvV: "/blackcard/confirm",
        fldg3oBALJFB6Lmxd: JSON.stringify({ source: "payments-worker", session_id_hash: await sha256(session.id) }),
        fldhdZwWJBB7CTbA5: row.audit_event_id, flda7tIZNEOulLnqq: "pending", fld7qYcsjjsnI4E1r: "synced",
        fldgwMccAhzfeDK6c: row.retention_expires_at, fld76dlT7Y2RoskHr: row.created_at, fldzOUolL6YYnjdCn: row.updated_at,
      };
      const create = await airtableFetch(env, new Request(endpoint, { method: "POST", headers, body: JSON.stringify({ fields }) }));
      if (!create.ok) throw new Error("mirror_write_failed");
      const result = await create.json(); recordId = result.id || "";
      if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) throw new Error("mirror_invalid_record");
    }
    const delivered = await airtableFetch(env, new Request(`${endpoint}/${encodeURIComponent(recordId)}`, { method: "PATCH", headers, body: JSON.stringify({ fields: { flda7tIZNEOulLnqq: "delivered", fld7qYcsjjsnI4E1r: "synced" } }) }));
    if (!delivered.ok) throw new Error("mirror_delivery_update_failed");
    await env.BLACKCARD_DB.prepare(`UPDATE ${OUTBOX} SET delivery_status = 'delivered', delivered_at = ? WHERE idempotency_key = ? AND delivery_status IN ('pending', 'retry_required')`).bind(new Date().toISOString(), idempotencyKey).run();
    return true;
  } catch {
    await env.BLACKCARD_DB.prepare(`UPDATE ${OUTBOX} SET delivery_status = 'retry_required' WHERE idempotency_key = ? AND delivery_status IN ('pending', 'retry_required')`).bind(idempotencyKey).run().catch(() => null);
    return false;
  }
}
async function resolveMemberRecordId(env, memberId) {
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${MEMBERS_TABLE}`);
  url.searchParams.set("filterByFormula", `{${MEMBER_RECORD_ID_FIELD}}='${escapeFormula(memberId)}'`); url.searchParams.set("maxRecords", "2"); url.searchParams.append("fields[]", MEMBER_RECORD_ID_FIELD);
  const response = await airtableFetch(env, new Request(url, { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json" } }));
  if (!response.ok) throw new Error("canonical_member_lookup_failed");
  const data = await response.json(); const matches = Array.isArray(data.records) ? data.records.filter(r => r.fields?.[MEMBER_RECORD_ID_FIELD] === memberId) : [];
  return matches.length === 1 && /^rec[A-Za-z0-9]{14}$/.test(matches[0].id || "") ? matches[0].id : null;
}
function escapeFormula(value) { return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function parseArray(value) { try { const result = JSON.parse(value || "[]"); return Array.isArray(result) ? result : []; } catch { return []; } }
async function sha256(value) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value))); return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join(""); }
async function airtableFetch(env, request) { return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request); }
