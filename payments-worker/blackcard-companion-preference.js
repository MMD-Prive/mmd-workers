export { replaceMarker, parseStored } from "./blackcard-legacy-marker.js";
import { authorizeConfirmationRequest } from "./confirmation-ack.js";
import { findSession, readConfirmationPaymentEvidence } from "./confirmation-details.js";
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
    const { claims, body } = authorized;
    const session = await findSession(env, claims.session_id);
    if (!session?.id || sessionValue(session, env, "AT_SESSIONS__SESSION_ID", "fldLTq2kZbyRv22IA") !== claims.session_id || sessionValue(session, env, "AT_SESSIONS__PAYMENT_REF", "fldojgjSQLaO0uQLX") !== claims.payment_ref) return corsJson(request, env, { ok: false, error: "confirmation_session_mismatch" }, 409);
    const memberId = clean(sessionValue(session, env, "AT_SESSIONS__MEMBER_ID", MEMBER_ID_FIELD), 160);
    if (!/^[A-Za-z0-9_-]{3,160}$/.test(memberId)) return corsJson(request, env, { ok: false, error: "verified_member_account_required" }, 403);
    if (!isBlackCardSession(session, env)) return corsJson(request, env, { ok: false, error: "blackcard_product_required" }, 409);
    if (!["membership", "blackcard", "black_card"].includes(code(claims.payment_type))) return corsJson(request, env, { ok: false, error: "blackcard_confirmation_required" }, 409);
    const memberRecordId = await resolveMemberRecordId(env, memberId);
    if (!memberRecordId) return corsJson(request, env, { ok: false, error: "verified_member_account_required" }, 403);
    const evidence = await readConfirmationPaymentEvidence(env, claims);
    const paymentStatus = evidence.verified ? "verified" : evidence.proof_received ? "evidence_submitted" : "pending";
    const closedSession = [sessionPaymentState(session, env), code(sessionValue(session, env, "AT_SESSIONS__SESSION_STATUS", "fldmwuvOaiCFdzzRa"))].some(value => CLOSED_STATES.has(value));
    if (closedSession || evidence.closed || (!evidence.verified && !evidence.proof_received)) return corsJson(request, env, { ok: false, error: "blackcard_payment_state_unavailable" }, 409);

    const correlationHash = await sha256(clean(requestToken(body), 12000));
    const requestKey = body.request_key === undefined ? "" : String(body.request_key);
    if (requestKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) return corsJson(request, env, { ok: false, error: "invalid_request_key" }, 400);
    const idempotencyKey = await sha256(`${memberId}:${correlationHash}${requestKey ? ':' + requestKey : ''}`);
    const current = await env.BLACKCARD_DB.prepare(`SELECT * FROM ${TABLE} WHERE idempotency_key = ?`).bind(idempotencyKey).first();

    if (body.read === true) {
      const row = await env.BLACKCARD_DB.prepare(`SELECT * FROM ${TABLE} WHERE member_id = ? ORDER BY rowid DESC LIMIT 1`).bind(memberId).first();
      if (row && retentionExpired(row)) return corsJson(request, env, { ok: true, authority: "payments-worker", schema: "blackcard_companion_preference_v1", companion: null, preference_status: "expired", payment_status: paymentStatus, entitlement_activated: false, session_id: claims.session_id, request_id: null, idempotent: false });
      if (row && !await mirrorPendingPreference(env, row, memberId, memberRecordId)) return corsJson(request, env, { ok: false, error: "preference_review_sync_pending" }, 503);
      const companion = row ? personalMain(row.companion_preference) : null;
      return corsJson(request, env, { ok: true, authority: "payments-worker", schema: "blackcard_companion_preference_v1", companion, preference_status: row?.status || "not_selected", payment_status: paymentStatus, entitlement_activated: false, session_id: claims.session_id, request_id: row?.request_id || null, idempotent: Boolean(row) });
    }

    const companion = normalizeCompanion(body.companion_id || body.companion_preference);
    if (!companion) return corsJson(request, env, { ok: false, error: "invalid_companion" }, 400);
    const previous = await env.BLACKCARD_DB.prepare(`SELECT * FROM ${TABLE} WHERE member_id = ? ORDER BY rowid DESC LIMIT 1`).bind(memberId).first();
    const metadata = current || previous;
    const note = body.note === undefined ? metadata?.note || "" : clean(body.note, 500);
    const changeReason = clean(body.change_reason, 500);
    const experiencePreferences = body.experience_preferences === undefined ? parseArray(metadata?.experience_preferences_json) : Array.isArray(body.experience_preferences) ? [...new Set(body.experience_preferences.filter(value => EXPERIENCE_PREFERENCES.has(value)))].sort() : [];
    if (body.experience_preferences !== undefined && !Array.isArray(body.experience_preferences)) return corsJson(request, env, { ok: false, error: "preference_invalid" }, 400);
    if (Array.isArray(body.experience_preferences) && (body.experience_preferences.length > 6 || experiencePreferences.length !== body.experience_preferences.length)) return corsJson(request, env, { ok: false, error: "preference_invalid" }, 400);
    const payloadHash = await sha256(JSON.stringify({ companion_preference: companion.id, experience_preferences: experiencePreferences, note, change_reason: changeReason }));
    const prior = current;
    if (prior) {
      if (retentionExpired(prior)) return corsJson(request, env, { ok: false, error: "preference_expired" }, 410);
      if (prior.payload_hash !== payloadHash) return corsJson(request, env, { ok: false, error: "idempotency_conflict" }, 409);
      if (!await mirrorPendingPreference(env, prior, memberId, memberRecordId)) return corsJson(request, env, { ok: false, error: "preference_review_sync_pending", request_id: prior.request_id }, 503);
      return accepted(request, env, prior, companion, claims.session_id, true, paymentStatus);
    }

    if (previous && retentionExpired(previous)) return corsJson(request, env, { ok: false, error: "preference_expired" }, 410);
    if (previous && previous.payload_hash === payloadHash) {
      if (!await mirrorPendingPreference(env, previous, memberId, memberRecordId)) return corsJson(request, env, { ok: false, error: "preference_review_sync_pending", request_id: previous.request_id }, 503);
      return accepted(request, env, previous, personalMain(previous.companion_preference), claims.session_id, true, paymentStatus);
    }
    const requestType = previous ? "companion_change_request" : "first_companion_preference";
    if (body.previous_request_id !== undefined && body.previous_request_id !== (previous?.request_id || null)) return corsJson(request, env, { ok: false, error: "preference_concurrent_conflict" }, 409);
    if (previous && !changeReason) return corsJson(request, env, { ok: false, error: "change_reason_required" }, 400);
    const retentionDays = Number(env.BLACKCARD_PREFERENCE_RETENTION_DAYS);
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) return corsJson(request, env, { ok: false, error: "preference_retention_policy_unavailable" }, 503);
    const now = new Date().toISOString();
    const requestId = `bcp_${crypto.randomUUID().replace(/-/g, "")}`;
    const auditId = `bca_${crypto.randomUUID().replace(/-/g, "")}`;
    const recorded = await env.BLACKCARD_DB.prepare(`SELECT * FROM ${TABLE} WHERE member_id = ? AND status = 'recorded' ORDER BY rowid DESC LIMIT 1`).bind(memberId).first();
    const currentCompanion = recorded && !retentionExpired(recorded) ? recorded.companion_preference : null;
    const insert = env.BLACKCARD_DB.prepare(`INSERT OR IGNORE INTO ${TABLE} (request_id, member_id, member_record_id, line_user_id_hash, correlation_hash, source_session_id_hash, idempotency_key, payload_hash, request_type, companion_preference, experience_preferences_json, note, change_reason, current_companion_snapshot, status, audit_event_id, retention_expires_at, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?, ? WHERE COALESCE((SELECT request_id FROM ${TABLE} WHERE member_id = ? ORDER BY rowid DESC LIMIT 1), '') = ?`)
      .bind(requestId, memberId, memberRecordId, "", correlationHash, await sha256(session.id), idempotencyKey, payloadHash, requestType, companion.id, JSON.stringify(experiencePreferences), note, changeReason, currentCompanion, auditId, new Date(Date.now() + retentionDays * 86400000).toISOString(), now, now, memberId, previous?.request_id || "");
    const audit = env.BLACKCARD_DB.prepare(`INSERT OR IGNORE INTO ${OUTBOX} (event_id, idempotency_key, event_type, member_id_hash, request_id, created_at, delivery_status) SELECT audit_event_id, idempotency_key, 'blackcard.companion_preference.requested', ?, request_id, ?, 'pending' FROM ${TABLE} WHERE idempotency_key = ?`)
      .bind(await sha256(memberId), now, idempotencyKey);
    await env.BLACKCARD_DB.batch([insert, audit]);
    const saved = await env.BLACKCARD_DB.prepare(`SELECT * FROM ${TABLE} WHERE idempotency_key = ?`).bind(idempotencyKey).first();
    if (!saved) return corsJson(request, env, { ok: false, error: "preference_concurrent_conflict" }, 409);
    if (saved.payload_hash !== payloadHash) return corsJson(request, env, { ok: false, error: "idempotency_conflict" }, 409);
    if (!await mirrorPendingPreference(env, saved, memberId, memberRecordId)) return corsJson(request, env, { ok: false, error: "preference_review_sync_pending", request_id: saved.request_id }, 503);
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
function retentionExpired(row) { const expires = Date.parse(row.retention_expires_at); return !Number.isFinite(expires) || expires <= Date.now(); }
function normalizeCompanion(value) { const id = clean(value, 40).toLowerCase(); return COMPANIONS.has(id) ? personalMain(id) : null; }
function accepted(request, env, row, companion, sessionId, idempotent, paymentStatus) {
  return corsJson(request, env, { ok: true, authority: "payments-worker", schema: "blackcard_companion_preference_v1", companion, preference_status: row.status, status: row.status, request_id: row.request_id, submitted_at: row.created_at, payment_status: paymentStatus, entitlement_activated: false, session_id: sessionId, idempotent }, 202);
}
export function isBlackCardSession(session, env) {
  const packageCode = code(sessionValue(session, env, "AT_SESSIONS__PACKAGE_CODE", "fldp6xNSvxDh5pjR9"));
  return ["black_card", "blackcard"].includes(packageCode);
}
function sessionPaymentState(session, env) {
  const status = code(sessionValue(session, env, "AT_SESSIONS__PAYMENT_STATUS", "fldTY5lE6m0kQf72n"));
  return status || "pending";
}
export async function mirrorPendingPreference(env, row, memberId, memberRecordId) {
  if (retentionExpired(row)) return false;
  const key = row.idempotency_key;
  const lock = crypto.randomUUID();
  const outbox = await env.BLACKCARD_DB.prepare(`SELECT * FROM ${OUTBOX} WHERE idempotency_key = ?`).bind(key).first();
  if (outbox?.event_id !== row.audit_event_id || outbox?.request_id !== row.request_id || outbox?.member_id_hash !== await sha256(memberId)) return false;
  if (outbox.delivery_status === "delivered") return true;
  const now = new Date().toISOString();
  const acquired = await env.BLACKCARD_DB.prepare(`UPDATE ${OUTBOX} SET sync_lock_token = ?, sync_lock_until = ? WHERE idempotency_key = ? AND delivery_status IN ('pending', 'retry_required') AND (sync_lock_until IS NULL OR sync_lock_until < ?)`).bind(lock, new Date(Date.now() + 60000).toISOString(), key, now).run();
  if (acquired.meta?.changes !== 1) return false;
  try {
    if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("mirror_configuration_missing");
    const endpoint = `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${MIRROR_TABLE}`;
    const lookup = new URL(endpoint); lookup.searchParams.set("filterByFormula", `{fldPYEff5pSnpjk0p}='${key}'`); lookup.searchParams.set("maxRecords", "2"); lookup.searchParams.set("returnFieldsByFieldId", "true");
    const headers = { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json", "content-type": "application/json" };
    const existingResponse = await airtableFetch(env, new Request(lookup, { headers }));
    if (!existingResponse.ok) throw new Error("mirror_lookup_failed");
    const existing = await existingResponse.json();
    if (!Array.isArray(existing.records) || existing.records.length > 1) throw new Error("mirror_identity_conflict");
    const record = existing.records[0];
    if (record) {
      if (!mirrorMatches(record, row, memberId, memberRecordId)) throw new Error("mirror_payload_conflict");
    } else {
      const fields = {
        fldOlcIzDs5QbDN2c: row.request_id, fld6I0jkPbACVSVWV: [memberRecordId], fldMiUCgSuP229TcZ: memberId,
        fld3inSQEneySuxez: row.correlation_hash, fldPYEff5pSnpjk0p: key, fldLiLJd4SmBkKO5B: row.payload_hash,
        fldMCzDdLuzLfcHIJ: row.request_type, fldlR0h05dSjyDIcw: row.companion_preference,
        fldxw53oA5eTu8MKy: parseArray(row.experience_preferences_json), fldEZrXcf97ON2mqI: row.note,
        fldn9wU28zjv37lye: row.change_reason, ...(row.current_companion_snapshot ? { fldTkZboOvHQFsfOp: row.current_companion_snapshot } : {}),
        fldmUukFu7vlCNVRS: row.status, fld8DwXQ5xdunoDvV: "/blackcard/confirm",
        fldg3oBALJFB6Lmxd: JSON.stringify({ source: "payments-worker", session_id_hash: row.source_session_id_hash }),
        fldhdZwWJBB7CTbA5: row.audit_event_id, flda7tIZNEOulLnqq: "pending", fld7qYcsjjsnI4E1r: "synced",
        fldgwMccAhzfeDK6c: row.retention_expires_at, fld76dlT7Y2RoskHr: row.created_at, fldzOUolL6YYnjdCn: row.updated_at,
      };
      const create = await airtableFetch(env, new Request(endpoint, { method: "PATCH", headers, body: JSON.stringify({ performUpsert: { fieldsToMergeOn: ["fldPYEff5pSnpjk0p"] }, returnFieldsByFieldId: true, records: [{ fields }] }) }));
      if (!create.ok) throw new Error("mirror_write_failed");
      const result = await create.json();
      const created = result.records?.length === 1 ? result.records[0] : null;
      if (!mirrorMatches(created, row, memberId, memberRecordId) || result.details) throw new Error("mirror_invalid_record");
      existing.records = [created];
    }
    const recordId = existing.records[0].id;
    const delivered = await airtableFetch(env, new Request(`${endpoint}/${encodeURIComponent(recordId)}`, { method: "PATCH", headers, body: JSON.stringify({ fields: { flda7tIZNEOulLnqq: "delivered", fld7qYcsjjsnI4E1r: "synced" } }) }));
    if (!delivered.ok) throw new Error("mirror_delivery_update_failed");
    const delivery = await delivered.json();
    if (delivery.id !== recordId || delivery.details) throw new Error("mirror_delivery_invalid");
    const result = await env.BLACKCARD_DB.prepare(`UPDATE ${OUTBOX} SET delivery_status = 'delivered', delivered_at = ?, sync_lock_token = NULL, sync_lock_until = NULL WHERE idempotency_key = ? AND sync_lock_token = ?`).bind(new Date().toISOString(), key, lock).run();
    return result.meta?.changes === 1;
  } catch {
    await env.BLACKCARD_DB.prepare(`UPDATE ${OUTBOX} SET delivery_status = 'retry_required', sync_lock_token = NULL, sync_lock_until = NULL WHERE idempotency_key = ? AND sync_lock_token = ?`).bind(key, lock).run().catch(() => null);
    return false;
  }
}
export function mirrorMatches(record, row, memberId, memberRecordId) {
  const f = record?.fields || {};
  return /^rec[A-Za-z0-9]{14}$/.test(record?.id || "") && f.fldOlcIzDs5QbDN2c === row.request_id && f.fldLiLJd4SmBkKO5B === row.payload_hash && f.fldPYEff5pSnpjk0p === row.idempotency_key && f.fldMiUCgSuP229TcZ === memberId && f.fldlR0h05dSjyDIcw === row.companion_preference && f.fldhdZwWJBB7CTbA5 === row.audit_event_id && Array.isArray(f.fld6I0jkPbACVSVWV) && f.fld6I0jkPbACVSVWV.length === 1 && f.fld6I0jkPbACVSVWV[0] === memberRecordId;
}
export async function resolveMemberRecordId(env, memberId) {
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${MEMBERS_TABLE}`);
  url.searchParams.set("filterByFormula", `{${MEMBER_RECORD_ID_FIELD}}='${escapeFormula(memberId)}'`); url.searchParams.set("maxRecords", "2"); url.searchParams.set("returnFieldsByFieldId", "true"); url.searchParams.append("fields[]", MEMBER_RECORD_ID_FIELD);
  const response = await airtableFetch(env, new Request(url, { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json" } }));
  if (!response.ok) throw new Error("canonical_member_lookup_failed");
  const data = await response.json(); const matches = Array.isArray(data.records) ? data.records.filter(r => r.fields?.[MEMBER_RECORD_ID_FIELD] === memberId) : [];
  return data.records?.length === 1 && matches.length === 1 && /^rec[A-Za-z0-9]{14}$/.test(matches[0].id || "") ? matches[0].id : null;
}
function escapeFormula(value) { return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function parseArray(value) { try { const result = JSON.parse(value || "[]"); return Array.isArray(result) ? result : []; } catch { return []; } }
async function sha256(value) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value))); return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join(""); }
async function airtableFetch(env, request) { const bounded = new Request(request, { signal: AbortSignal.timeout(10000) }); return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(bounded) : fetch(bounded); }
