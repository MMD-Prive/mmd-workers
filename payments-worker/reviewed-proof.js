const REVIEW_SOURCE = "payment_review_console";
const HISTORICAL_SCHEMA = "mmd_historical_slip_backfill_v1";
const PAYMENT_STAGES = new Set(["deposit", "final", "tips", "full", "membership"]);
const AIRTABLE_API = "https://api.airtable.com/v0";
const RECOVERY_CONTEXT = "liff_renewal_recovery";
const CANONICAL_ENTITLEMENTS = "tblNImdF9PKAxhXGi";
const CANONICAL_RENEWALS = "tblXjQFwo0A2cHseh";
const CANONICAL_MEMBERS = "tblgWc5VRon5o8Mhk";
const CANONICAL_CLIENTS = "tblVv58TCbwh5j1fS";
const RECOVERY_PRICE = Object.freeze({ standard: 1000, premium: 2500 });
const MEMBERSHIP_DAYS = 365;

export const REVIEWED_PROOF_PATH = "/v1/internal/payments/reviewed-proof";

export function isReviewedProofRequest(path, method = "POST") {
  return normalizePath(path) === REVIEWED_PROOF_PATH && ["POST", "OPTIONS"].includes(String(method || "POST").toUpperCase());
}

export async function handleReviewedProof(request, env = {}, ctx = null, notifyTrusted) {
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: jsonHeaders() });
  if (!isReviewedProofRequest(new URL(request.url).pathname, method)) return json({ ok: false, error: "not_found" }, 404);
  if (!(await serviceAuthed(request, env.AUTH_SERVICE_ADMIN_TO_PAYMENTS))) {
    return json({ ok: false, error: "service_auth_required", authority: "payments-worker" }, 401);
  }
  if (typeof notifyTrusted !== "function") {
    return json({ ok: false, error: "trusted_notify_adapter_missing", authority: "payments-worker" }, 503);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_payment_review_request", authority: "payments-worker" }, 400);
  }

  try {
    const source = code(body.source);
    const decision = code(body.decision);
    const proofId = text(body.proof_id, 120);
    const evidenceRecordId = text(body.evidence_record_id, 120);
    const paymentRef = text(body.payment_ref || body.transaction_ref, 180);
    const amountThb = positiveAmount(body.amount_thb ?? body.amount);
    const paymentStage = normalizeStage(body.payment_stage || body.stage || body.payment_type);
    const sessionId = text(body.session_id, 180);
    const memberEmail = email(body.member_email || body.email);
    const packageCode = canonicalPackage(body.package_code || body.package);
    const paymentMethod = text(body.payment_method || "promptpay", 80) || "promptpay";
    const reviewReason = text(body.review_reason, 600);
    const reviewActor = text(body.review_actor || "internal_admin_owner", 120);
    const contextSource = code(body.context_source);
    const memberId = text(body.member_id, 120);
    const memberRecordId = recordId(body.member_record_id);
    const clientRecordId = recordId(body.client_record_id);
    const renewalRecordId = recordId(body.renewal_record_id);
    const renewalSessionId = text(body.renewal_session_id, 180);
    const lineUserId = lineId(body.line_user_id);
    const emailLessRecovery = paymentStage === "membership" && contextSource === RECOVERY_CONTEXT && !memberEmail;

    if (source !== REVIEW_SOURCE) throw httpError(400, "invalid_payment_review_source");
    if (decision !== "approved") throw httpError(400, "explicit_approved_decision_required");
    if (!proofId) throw httpError(400, "proof_id_required");
    if (!paymentRef) throw httpError(400, "payment_ref_required");
    if (amountThb == null) throw httpError(400, "amount_thb_required");
    if (reviewReason.length < 5) throw httpError(400, "review_reason_required");
    if (["deposit", "final", "tips", "full"].includes(paymentStage) && !sessionId) {
      throw httpError(400, "session_id_required_for_service_payment");
    }
    if (paymentStage === "membership" && !memberEmail && !emailLessRecovery) {
      throw httpError(400, "member_email_required_for_membership_payment");
    }
    if (paymentStage === "membership" && !packageCode) throw httpError(400, "package_code_required_for_membership_payment");

    const proof = await loadProof(env, proofId);
    if (!proof) throw httpError(404, "payment_proof_not_found");
    if (evidenceRecordId && evidenceRecordId !== text(proof.id, 120)) {
      throw httpError(409, "payment_proof_record_mismatch");
    }

    const fields = proof.fields || {};
    const note = parseNote(fields.note);
    if (note.schema === HISTORICAL_SCHEMA) {
      throw httpError(409, "historical_proof_requires_historical_review_contract");
    }

    const proofStatus = code(fields.status || fields.verification_status || fields.payment_status || "pending");
    if (["rejected", "blocked", "revoked"].includes(proofStatus)) {
      throw httpError(409, "payment_proof_not_approvable");
    }

    const proofRef = text(fields.payment_ref || fields.transaction_ref, 180);
    const proofAmount = positiveAmount(fields.amount_thb ?? fields.amount ?? fields.total_thb);
    if (!proofRef) throw httpError(409, "payment_proof_reference_missing");
    if (proofAmount == null) throw httpError(409, "payment_proof_amount_missing");
    if (proofRef !== paymentRef) throw httpError(409, "payment_proof_reference_mismatch");
    if (Math.abs(proofAmount - amountThb) > 0.009) throw httpError(409, "payment_proof_amount_mismatch");

    let recovery = null;
    if (emailLessRecovery) {
      recovery = await validateEmailLessRecovery(env, {
        proof,
        amountThb,
        paymentRef,
        packageCode,
        memberId,
        memberRecordId,
        clientRecordId,
        renewalRecordId,
        renewalSessionId,
        lineUserId,
      });
    }

    if (!clean(env.INTERNAL_TOKEN)) throw httpError(503, "payments_internal_token_not_ready");

    const notifyBody = {
      payment_ref: paymentRef,
      payment_stage: paymentStage,
      stage: paymentStage,
      session_id: sessionId || undefined,
      amount_thb: amountThb,
      member_email: memberEmail || undefined,
      package_code: packageCode || undefined,
      payment_method: paymentMethod,
      receipt_url: evidenceUrl(fields) || undefined,
      paid_at: text(fields.paid_at || fields["Payment Date"], 80) || undefined,
      notes: recovery
        ? `payment_review_console proof_id=${proofId}; reviewed_by=${reviewActor}; recovered_member_id=${recovery.member_id}; line_identity=${recovery.line_user_id}`
        : `payment_review_console proof_id=${proofId}; reviewed_by=${reviewActor}`,
    };

    const response = await notifyTrusted(notifyBody, { request, env, ctx });
    const payload = await response.clone().json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) return response;

    let materialization = null;
    if (recovery) {
      materialization = await materializeRecoveredMembership(env, {
        ...recovery,
        proof,
        payment_ref: paymentRef,
        package_code: packageCode,
        amount_thb: amountThb,
        review_actor: reviewActor,
      });
    }

    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store, private");
    headers.set("x-mmd-payment-authority", "payments-worker");
    return new Response(JSON.stringify({
      ...payload,
      ok: true,
      authority: "payments-worker",
      payment_review_console: true,
      proof_id: proofId,
      evidence_record_id: proof.id,
      context_source: recovery ? RECOVERY_CONTEXT : contextSource || undefined,
      recovery_context: Boolean(recovery),
      entitlement_materialized: Boolean(materialization?.entitlement_record_id),
      entitlement_record_id: materialization?.entitlement_record_id || undefined,
      membership_expire_at: materialization?.expire_at || undefined,
      downstream_access_reconcile_required: Boolean(materialization),
    }), { status: response.status, headers });
  } catch (error) {
    return json({
      ok: false,
      error: clean(error?.message || error || "payment_review_failed"),
      authority: "payments-worker",
    }, Number(error?.status || 500));
  }
}

async function validateEmailLessRecovery(env, input) {
  const expectedPrice = RECOVERY_PRICE[input.packageCode];
  if (!expectedPrice || Math.abs(expectedPrice - input.amountThb) > 0.009) throw httpError(409, "recovery_package_amount_mismatch");
  if (!input.memberId || !input.memberRecordId || !input.clientRecordId || !input.renewalRecordId || !input.lineUserId) {
    throw httpError(409, "recovery_identity_context_incomplete");
  }

  const [member, client, renewal] = await Promise.all([
    airtableGet(env, membersTable(env), input.memberRecordId),
    airtableGet(env, clientsTable(env), input.clientRecordId),
    airtableGet(env, renewalTable(env), input.renewalRecordId),
  ]);
  const mf = member.fields || {};
  const cf = client.fields || {};
  const rf = renewal.fields || {};
  if (lineId(mf.line_user_id) !== input.lineUserId) throw httpError(409, "recovery_member_line_mismatch");
  if (lineId(cf.line_user_id) !== input.lineUserId) throw httpError(409, "recovery_client_line_mismatch");
  if (lineId(rf.line_user_id) !== input.lineUserId) throw httpError(409, "recovery_renewal_line_mismatch");
  if (text(mf.member_id, 120) !== input.memberId) throw httpError(409, "recovery_member_id_mismatch");
  if (canonicalPackage(rf.requested_package || rf.package_code) !== input.packageCode) throw httpError(409, "recovery_package_mismatch");
  const renewalAmount = positiveAmount(rf.renewal_amount_thb ?? rf.amount_thb);
  if (renewalAmount == null || Math.abs(renewalAmount - input.amountThb) > 0.009) throw httpError(409, "recovery_renewal_amount_mismatch");
  if (input.renewalSessionId && text(rf.renewal_session_id, 180) !== input.renewalSessionId) throw httpError(409, "recovery_renewal_session_mismatch");

  const proofMembers = linkedIds(input.proof.fields?.member || input.proof.fields?.Member);
  if (proofMembers.length !== 1 || proofMembers[0] !== member.id) throw httpError(409, "recovery_proof_member_mismatch");
  const renewalClients = linkedIds(rf.Client || rf.client);
  if (renewalClients.length !== 1 || renewalClients[0] !== client.id) throw httpError(409, "recovery_renewal_client_mismatch");

  return {
    member_id: input.memberId,
    member_record_id: member.id,
    client_record_id: client.id,
    renewal_record_id: renewal.id,
    renewal_session_id: text(rf.renewal_session_id, 180),
    line_user_id: input.lineUserId,
  };
}

async function materializeRecoveredMembership(env, input) {
  const existing = await airtableList(env, entitlementsTable(env), {
    filterByFormula: `{payment_ref}='${formulaValue(input.payment_ref)}'`,
    maxRecords: 2,
  });
  if (existing.length > 1) throw httpError(409, "recovery_entitlement_payment_ref_ambiguous");

  const paidAtRaw = text(input.proof.fields?.paid_at || input.proof.fields?.["Payment Date"], 80);
  const paidAt = validDate(paidAtRaw) || new Date();
  const startAt = new Date(paidAt);
  const expireAt = new Date(startAt.getTime() + MEMBERSHIP_DAYS * 86400000);
  const packageLabel = input.package_code === "premium" ? "Premium" : "Standard";
  const entitlementLevel = input.package_code === "premium" ? "premium" : "standard_basic";

  let entitlement = existing[0] || null;
  if (!entitlement) {
    entitlement = await airtableCreate(env, entitlementsTable(env), {
      entitlement_id: `renewal_${code(input.payment_ref).slice(0, 80)}`,
      member: [input.member_record_id],
      client: [input.client_record_id],
      line_user_id: input.line_user_id,
      member_status: input.package_code,
      access_status: "active",
      entitlement_level: entitlementLevel,
      package_code: input.package_code,
      start_at: startAt.toISOString(),
      expire_at: expireAt.toISOString(),
      renewal_status: "renewed",
      membership_expiry_rule: "365_days_from_verified_payment",
      telegram_access_status: "pending_invite",
      source: "renewal",
      source_ref: `payment:${input.payment_ref}`,
      payment_ref: input.payment_ref,
      notes: `Materialized by payments-worker after official reviewed LINE renewal proof; amount=${input.amount_thb}; member_id=${input.member_id}`,
    });
  }

  await Promise.all([
    airtableUpdate(env, membersTable(env), input.member_record_id, {
      "Membership Tier": packageLabel,
      "Membership Status": "Active",
    }),
    airtableUpdate(env, renewalTable(env), input.renewal_record_id, {
      renewal_flow_status: "materialized",
      "Member Entitlement": [entitlement.id],
      verified_at: new Date().toISOString(),
      materialized_at: new Date().toISOString(),
      reviewed_by: input.review_actor,
      review_note: `Official ${input.amount_thb} THB ${packageLabel} renewal verified by payments-worker; entitlement ${entitlement.id}.`,
    }),
    airtableUpdate(env, proofTable(env), input.proof.id, {
      status: "verified",
      verified_at: new Date().toISOString().slice(0, 10),
      verified_by: "payments-worker",
    }),
  ]);

  return { entitlement_record_id: entitlement.id, start_at: startAt.toISOString(), expire_at: expireAt.toISOString() };
}

async function loadProof(env, proofId) {
  requireAirtable(env);
  const formula = `{proof_id}='${formulaValue(proofId)}'`;
  const records = await airtableList(env, proofTable(env), { filterByFormula: formula, maxRecords: 2 });
  if (records.length > 1) throw httpError(409, "payment_proof_ambiguous");
  return records[0] || null;
}

async function airtableList(env, tableName, params = {}) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const request = new Request(url.toString(), { headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` } });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload.records;
}

async function airtableGet(env, tableName, recordIdValue) {
  requireAirtable(env);
  const url = `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordIdValue)}`;
  const request = new Request(url, { headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` } });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload;
}

async function airtableCreate(env, tableName, fields) {
  requireAirtable(env);
  const url = `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`;
  const request = new Request(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  const record = payload?.records?.[0];
  if (!response.ok || !record?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return record;
}

async function airtableUpdate(env, tableName, recordIdValue, fields) {
  requireAirtable(env);
  const url = `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordIdValue)}`;
  const request = new Request(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload;
}

function proofTable(env) { return clean(env.AIRTABLE_TABLE_PAYMENT_PROOFS || env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi"); }
function membersTable(env) { return clean(env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || CANONICAL_MEMBERS); }
function clientsTable(env) { return clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || CANONICAL_CLIENTS); }
function entitlementsTable(env) { return clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || CANONICAL_ENTITLEMENTS); }
function renewalTable(env) { return clean(env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID || env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || CANONICAL_RENEWALS); }

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) throw httpError(503, "airtable_not_ready");
}

async function serviceAuthed(request, expected) {
  const expectedToken = clean(expected);
  if (!expectedToken) return false;
  const direct = clean(request.headers.get("X-Internal-Token"));
  const bearer = clean(request.headers.get("Authorization")).replace(/^Bearer\s+/i, "");
  return constantTimeEqual(direct || bearer, expectedToken);
}

async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(clean(left))),
    crypto.subtle.digest("SHA-256", encoder.encode(clean(right))),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i += 1) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

function evidenceUrl(fields = {}) {
  for (const value of [fields.receipt_url, fields.slip_url, fields.evidence_url, fields["Receipt Photo"]]) {
    if (typeof value === "string" && /^https:\/\//i.test(value)) return value.slice(0, 1200);
    if (Array.isArray(value) && value[0] && typeof value[0].url === "string" && /^https:\/\//i.test(value[0].url)) return value[0].url.slice(0, 1200);
  }
  return "";
}

function normalizeStage(value) {
  const stage = code(value);
  if (!PAYMENT_STAGES.has(stage)) throw httpError(400, "invalid_payment_stage");
  return stage;
}

function canonicalPackage(value) {
  const v = code(value);
  if (v.includes("premium")) return "premium";
  if (v.includes("standard") || v.includes("lite")) return "standard";
  return "";
}

function positiveAmount(value) {
  if (value == null || clean(value) === "") return null;
  const normalized = clean(value).replace(/,/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function linkedIds(value) { return Array.isArray(value) ? value.map((v) => recordId(v)).filter(Boolean) : []; }
function recordId(value) { const v = text(value, 120); return /^rec[A-Za-z0-9]{14}$/.test(v) ? v : ""; }
function lineId(value) { const v = text(value, 100); return /^U[A-Za-z0-9_-]{20,80}$/.test(v) ? v : ""; }
function validDate(value) { const ms = Date.parse(clean(value)); return Number.isFinite(ms) ? new Date(ms) : null; }

function parseNote(value) {
  try {
    const parsed = JSON.parse(clean(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function formulaValue(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function email(value) { const v = clean(value).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : ""; }
function code(value) { return clean(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100); }
function text(value, max = 240) { return clean(value).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max); }
function clean(value) { return String(value ?? "").trim(); }
function normalizePath(pathname = "") { const path = String(pathname || "/").replace(/\/{2,}/g, "/"); return path.length > 1 ? path.replace(/\/+$/g, "") : path; }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function jsonHeaders() { return new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-MMD-Payment-Authority": "payments-worker" }); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: jsonHeaders() }); }
