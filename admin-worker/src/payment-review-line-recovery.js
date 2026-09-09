const REVIEW_PATH = "/v1/admin/payments/review";
const AIRTABLE_API = "https://api.airtable.com/v0";
const PAYMENT_PROOFS = "tblfJfM4Sqag9zrLi";
const RENEWALS = "tblXjQFwo0A2cHseh";
const MEMBERS = "tblgWc5VRon5o8Mhk";
const CLIENTS = "tblVv58TCbwh5j1fS";
const ALLOWED_ROLES = new Set(["owner", "admin"]);
const ALLOWED_CHANNELS = new Set(["line", "line_oa", "line_ofc"]);
const BLOCKED_RENEWAL_STATES = new Set(["blocked", "cancelled", "canceled", "rejected", "revoked", "failed"]);
const RENEWAL_PRICE = Object.freeze({ standard: 1000, premium: 2500 });

/**
 * Narrow fallback used only after the canonical Payment Review runtime has
 * already authenticated the browser request and failed specifically because
 * the recovered member has no email address yet.
 *
 * This bridge never writes Payments, points, membership, or entitlement.
 * It only re-derives a canonical LINE identity and hands reviewed evidence to
 * Payments Worker, which remains money truth and owns post-payment materialization.
 */
export async function tryHandleEmailLessLineRenewalRecovery(request, env, actor, canonicalResponse) {
  if (!isExactRequest(request)) return canonicalResponse;
  if (!(await isCanonicalMissingMemberResponse(canonicalResponse))) return canonicalResponse;

  const role = token(actor?.role);
  if (!ALLOWED_ROLES.has(role)) return canonicalResponse;
  const actorId = text(actor?.id, 120);
  if (!actorId) return canonicalResponse;

  try {
    requireAirtable(env);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "invalid_review_request");
    if (token(body.decision) !== "approve") throw httpError(400, "explicit_approved_decision_required");

    const proofId = text(body.proof_id, 120);
    const reason = text(body.admin_reason || body.review_reason || body.reason, 600);
    const idempotencyKey = text(request.headers.get("Idempotency-Key") || body.idempotency_key, 180);
    if (!proofId) throw httpError(400, "proof_id_required");
    if (reason.length < 5) throw httpError(400, "admin_reason_required");
    if (!idempotencyKey) throw httpError(400, "idempotency_key_required");

    const proof = await findOneByFormula(env, paymentProofTable(env), `{proof_id}='${formulaValue(proofId)}'`, "payment_proof_ambiguous");
    if (!proof) throw httpError(404, "payment_proof_not_found");
    const pf = proof.fields || {};
    const proofStatus = token(pf.status || pf.verification_status || "pending");
    if (["blocked", "rejected", "revoked"].includes(proofStatus)) throw httpError(409, "payment_proof_not_approvable");

    const channel = token(pf.channel || pf.source);
    if (!ALLOWED_CHANNELS.has(channel)) throw httpError(409, "manual_recovery_channel_not_allowed");

    const renewalIds = linkedIds(
      pf["MMD — LIFF Renewal Sessions"] || pf["LIFF Renewal Session"] || pf["MMD — LIFF Renewal Session"] || pf.liff_renewal_session
    );
    if (renewalIds.length !== 1) throw httpError(409, renewalIds.length ? "liff_renewal_context_ambiguous" : "liff_renewal_context_missing");
    const renewal = await airtableGet(env, renewalTable(env), renewalIds[0]);
    const rf = renewal.fields || {};
    if (BLOCKED_RENEWAL_STATES.has(token(rf.renewal_flow_status || rf.status))) throw httpError(409, "liff_renewal_context_not_approvable");

    const lineUserId = lineId(rf.line_user_id);
    if (!lineUserId) throw httpError(409, "canonical_line_identity_missing");
    const packageCode = canonicalPackage(rf.requested_package || rf.package_code);
    const expectedAmount = RENEWAL_PRICE[packageCode];
    const renewalAmount = amount(rf.renewal_amount_thb ?? rf.amount_thb);
    const proofAmount = amount(pf.amount_thb ?? pf.amount ?? pf.total_thb);
    if (!expectedAmount || renewalAmount == null || proofAmount == null) throw httpError(409, "canonical_renewal_price_context_missing");
    if (renewalAmount !== expectedAmount || proofAmount !== expectedAmount) throw httpError(409, "liff_renewal_amount_mismatch");

    const member = await resolveMember(env, pf, rf, lineUserId);
    const client = await resolveClient(env, rf, member, lineUserId);
    const memberId = text(member.fields?.member_id || rf.member_id_canonical, 120);
    if (!memberId) throw httpError(409, "canonical_member_id_missing");

    const paymentRef = text(pf.payment_ref || pf.transaction_ref, 180);
    if (!paymentRef) throw httpError(409, "payment_proof_reference_missing");

    const reviewed = await sendToPayments(env, {
      source: "payment_review_console",
      decision: "approved",
      proof_id: proofId,
      evidence_record_id: proof.id,
      payment_ref: paymentRef,
      amount_thb: proofAmount,
      payment_stage: "membership",
      member_id: memberId,
      member_record_id: member.id,
      client_record_id: client.id,
      line_user_id: lineUserId,
      package_code: packageCode,
      context_source: "liff_renewal_recovery",
      renewal_session_id: text(rf.renewal_session_id || rf.payment_intent_session_id, 180),
      renewal_record_id: renewal.id,
      payment_method: text(pf.payment_method || "promptpay", 80) || "promptpay",
      review_reason: reason,
      review_actor: actorId,
      idempotency_key: idempotencyKey,
    });
    const payload = await reviewed.json().catch(() => ({}));
    if (!reviewed.ok || payload?.ok !== true) {
      return json({ ok: false, error: token(payload?.error || "payments_worker_review_failed"), authority: "payments-worker" }, reviewed.status || 502);
    }

    return json({
      ...payload,
      ok: true,
      decision: "approve",
      proof_id: proofId,
      authority: "payments-worker",
      context_source: "liff_renewal_recovery",
      recovery_context: true,
      canonical_member_id: memberId,
      canonical_member_record_id: member.id,
      canonical_client_record_id: client.id,
      renewal_session_id: text(rf.renewal_session_id, 180) || null,
      money_truth_changed: true,
      browser_can_mark_paid: false,
      browser_can_mutate_entitlement: false,
    }, reviewed.status || 200);
  } catch (error) {
    return json({ ok: false, error: token(error?.message || error || "line_member_recovery_failed"), authority: "payments-worker" }, Number(error?.status || 500));
  }
}

function isExactRequest(request) {
  const url = new URL(request.url);
  return normalizePath(url.pathname) === REVIEW_PATH && request.method.toUpperCase() === "POST" && ["mmdbkk.com", "www.mmdbkk.com"].includes(url.hostname);
}

async function isCanonicalMissingMemberResponse(response) {
  if (!response || response.status !== 409) return false;
  const payload = await response.clone().json().catch(() => null);
  return token(payload?.error) === "canonical_member_context_missing";
}

async function resolveMember(env, proofFields, renewalFields, lineUserId) {
  const direct = unique([...linkedIds(proofFields.member || proofFields.Member), ...linkedIds(renewalFields.member || renewalFields.Member)]);
  if (direct.length > 1) throw httpError(409, "canonical_member_context_ambiguous");
  let member = direct.length === 1 ? await airtableGet(env, membersTable(env), direct[0]) : null;
  // Canonical Members stores the LINE subject in `line_id`; Clients and LIFF
  // intentionally use `line_user_id`. Keep that schema distinction explicit.
  if (!member) {
    member = await findOneByFormula(env, membersTable(env), `{line_id}='${formulaValue(lineUserId)}'`, "canonical_member_context_ambiguous");
  }
  if (!member) throw httpError(409, "canonical_member_context_missing");
  if (lineId(member.fields?.line_id) !== lineUserId) throw httpError(409, "canonical_member_line_identity_mismatch");
  return member;
}

async function resolveClient(env, renewalFields, member, lineUserId) {
  const direct = unique(linkedIds(renewalFields.Client || renewalFields.client));
  if (direct.length > 1) throw httpError(409, "canonical_client_context_ambiguous");
  let client = direct.length === 1 ? await airtableGet(env, clientsTable(env), direct[0]) : null;
  if (!client) {
    const memberClients = linkedIds(member.fields?.Clients || member.fields?.Client);
    if (memberClients.length > 1) throw httpError(409, "canonical_client_context_ambiguous");
    if (memberClients.length === 1) client = await airtableGet(env, clientsTable(env), memberClients[0]);
  }
  if (!client) client = await findOneByFormula(env, clientsTable(env), `{line_user_id}='${formulaValue(lineUserId)}'`, "canonical_client_context_ambiguous");
  if (!client) throw httpError(409, "canonical_client_context_missing");
  if (lineId(client.fields?.line_user_id) !== lineUserId) throw httpError(409, "canonical_client_line_identity_mismatch");
  return client;
}

async function sendToPayments(env, body) {
  const base = clean(env.PAYMENTS_BASE_URL).replace(/\/+$/, "");
  const tokenValue = clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS);
  if (!base || !tokenValue) throw httpError(503, "payments_worker_service_not_ready");
  return fetch(`${base}/v1/internal/payments/reviewed-proof`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenValue}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function findOneByFormula(env, tableName, filterByFormula, ambiguousError) {
  const rows = await airtableList(env, tableName, { filterByFormula, maxRecords: 2 });
  if (rows.length > 1) throw httpError(409, ambiguousError);
  return rows[0] || null;
}

async function airtableList(env, tableName, params = {}) {
  const url = airtableUrl(env, tableName);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const response = await airtableFetch(env, new Request(url.toString(), { headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` } }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload.records;
}

async function airtableGet(env, tableName, recordId) {
  const response = await airtableFetch(env, new Request(`${airtableUrl(env, tableName).toString()}/${encodeURIComponent(recordId)}`, { headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` } }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload;
}

function airtableFetch(env, request) { return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request); }
function airtableUrl(env, tableName) { return new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`); }
function paymentProofTable(env) { return clean(env.AIRTABLE_TABLE_PAYMENT_PROOFS || env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || PAYMENT_PROOFS); }
function renewalTable(env) { return clean(env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID || env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || RENEWALS); }
function membersTable(env) { return clean(env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || MEMBERS); }
function clientsTable(env) { return clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || CLIENTS); }
function requireAirtable(env) { if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) throw httpError(503, "airtable_not_ready"); }
function linkedIds(value) { return Array.isArray(value) ? value.map((v) => text(v, 120)).filter(Boolean) : []; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function lineId(value) { const v = text(value, 100); return /^U[A-Za-z0-9_-]{20,80}$/.test(v) ? v : ""; }
function canonicalPackage(value) { const v = token(value); if (v.includes("premium")) return "premium"; if (v.includes("standard") || v.includes("lite")) return "standard"; return ""; }
function amount(value) { const v = clean(value).replace(/,/g, ""); if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(v)) return null; const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; }
function formulaValue(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function normalizePath(value = "") { const p = String(value || "/").replace(/\/{2,}/g, "/"); return p.length > 1 ? p.replace(/\/+$/g, "") : p; }
function token(value) { return clean(value).toLowerCase().replace(/[^a-z0-9_:-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 160); }
function text(value, max = 500) { return clean(value).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max); }
function clean(value) { return String(value ?? "").trim(); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" } }); }
