import delegatedWorker from "./payment-proof-client-provenance-wrapper.js";
import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { handleHistoricalSlipBackfillRequest } from "./historical-slip-backfill-runtime.js";

export const CANCELLATION_CREDIT_RECOVERY_PATH = "/v1/admin/cancellation-credit-recovery";

const AIRTABLE_API = "https://api.airtable.com/v0";
const HISTORICAL_SCHEMA = "mmd_historical_slip_backfill_v1";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const TABLE = Object.freeze({
  proofs: "tblfJfM4Sqag9zrLi",
  sessions: "tblC98mKWbzmPuNzX",
  clients: "tblVv58TCbwh5j1fS",
  payments: "tblWGGJJOx5eBvBZJ",
  credits: "tblKvhl2zZm9yYBmT",
});
const PROOF = Object.freeze({
  id: "fldz3Tg9eOm19h0Jd",
  paymentRef: "fldyeyV7aL0dkbLLE",
  client: "fldQB8ZZ9WSanCNzr",
  payment: "fldLTgArSK7U0695K",
  status: "fld45QUtZAl3FEmW4",
});
const CLIENT = Object.freeze({
  displayName: "fld7bPB3pWS2wteUU",
  fallbackName: "fldrHqkGQzvBLRxlP",
  lineDisplayName: "fldb7vkM1FWswNm3l",
});
const SESSION = Object.freeze({
  id: "fldLTq2kZbyRv22IA",
  status: "fldmwuvOaiCFdzzRa",
  client: "fld6P6if0vDZCeV0C",
  clientName: "fldMvnQ0BzDfHUYjT",
  modelName: "flddVz6eoWRHrzIQr",
  jobType: "fldjK3U9bghnj7xUe",
  jobDate: "fldpnqoIsUMfN7y3c",
  startTime: "fldBeG0FkWwa8kgnp",
  endTime: "fldiDSz0wW9Ct9I3P",
  locationName: "fldIiRpaxoafjTkFt",
  googleMapUrl: "fldoUDQ8sH93idPx0",
  serviceAmount: "fldhwC79ndbnEXSZz",
  modelPayout: "fldlTO5aNfqUmlNWm",
  paymentRef: "fldojgjSQLaO0uQLX",
  paymentStatus: "fldTY5lE6m0kQf72n",
  note: "fldEcDkF7CH9VixWM",
});
const PAYMENT = Object.freeze({
  ref: "fldOO6SY49iDw8VBZ",
  client: "fldcrLuJijj7xr0y8",
  sessionId: "fld2wdhBvc8xrV6y5",
  amountReceived: "fld5rTIVEF1DXwfe2",
  verification: "fldJ7a0Ube9F0bmRy",
  depositStatus: "fldD0mQWTfdmyBAeT",
  officialAt: "fldPNK6qgxCSdaJRM",
  officialRef: "flddkMKy5H8RbFwt9",
  officialBy: "fld208LCmQZB5llNo",
});
const CREDIT = Object.freeze({
  id: "fldemjkV42O2DcJgr",
  client: "fldil7TkCWHRfIHVp",
  availableAmount: "fldzuorjny0B7Iwgu",
  paymentRef: "fldsjcpz8nM8NgHHt",
  status: "fld54sOB3tz6VlULs",
  verificationStatus: "fldQW1Mzqyd8oilDc",
});
const CANCELLED_STATES = new Set([
  "cancelled", "canceled", "cancelled_by_client", "canceled_by_client", "client_cancelled", "client_canceled",
]);
const VERIFIED_PAYMENT_STATES = new Set(["verified", "official_verified", "approved", "confirmed"]);
const RECOVERY_ADMIN_ROLES = new Set(["owner", "admin", "super_admin", "superadmin"]);

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function code(value, max = 120) {
  return clean(value, max).toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function recordId(value) {
  const id = clean(value, 40);
  return /^rec[A-Za-z0-9]{14}$/.test(id) ? id : "";
}

function recordIds(value) {
  return Array.isArray(value) ? [...new Set(value.map(recordId).filter(Boolean))] : [];
}

function amount(value) {
  const normalized = clean(value, 80).replace(/,/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 && number <= 10_000_000
    ? Math.round((number + Number.EPSILON) * 100) / 100
    : null;
}

function positiveAmount(value) {
  const number = amount(value);
  return number !== null && number > 0 ? number : null;
}

function field(fields, id, ...names) {
  if (fields?.[id] !== undefined) return fields[id];
  for (const name of names) if (fields?.[name] !== undefined) return fields[name];
  return undefined;
}

function parseNote(value) {
  try {
    const parsed = JSON.parse(clean(value, 12000) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store, private", "content-type": "application/json; charset=utf-8" },
  });
}

function responseError(status, codeValue, message) {
  return json({ ok: false, error: { code: codeValue, message } }, status);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sameOrigin(request) {
  const origin = clean(request.headers.get("origin"), 240);
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function tables(env = {}) {
  return {
    proofs: clean(env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || env.AIRTABLE_TABLE_PAYMENT_PROOFS, 120) || TABLE.proofs,
    sessions: clean(env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS, 120) || TABLE.sessions,
    clients: clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS, 120) || TABLE.clients,
    payments: clean(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS, 120) || TABLE.payments,
    credits: clean(env.AIRTABLE_CLIENT_CREDITS_TABLE_ID, 120) || TABLE.credits,
  };
}

function requireAirtable(env = {}) {
  if (!clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 1000)) throw httpError(503, "airtable_not_ready");
}

async function airtableRequest(env, table, path = "", init = {}) {
  requireAirtable(env);
  const baseId = clean(env.AIRTABLE_BASE_ID, 80) || DEFAULT_BASE_ID;
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}${path}`);
  for (const [key, value] of Object.entries(init.query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const request = new Request(url.toString(), {
    method: init.method || "GET",
    headers: {
      authorization: `Bearer ${clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 1000)}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status, `airtable_${response.status}`);
  return payload;
}

async function getRecord(env, table, id) {
  const normalizedId = recordId(id);
  if (!normalizedId) return null;
  try {
    return await airtableRequest(env, table, `/${encodeURIComponent(normalizedId)}`);
  } catch (error) {
    if (Number(error?.status) === 404) return null;
    throw error;
  }
}

async function findOne(env, table, formula) {
  const payload = await airtableRequest(env, table, "", { query: { maxRecords: 2, filterByFormula: formula } });
  const rows = Array.isArray(payload?.records) ? payload.records : [];
  if (rows.length > 1) throw httpError(409, "recovery_record_ambiguous");
  return rows[0] || null;
}

async function createRecord(env, table, fields) {
  return airtableRequest(env, table, "", { method: "POST", body: { records: [{ fields }], typecast: true } });
}

async function patchRecord(env, table, id, fields) {
  return airtableRequest(env, table, `/${encodeURIComponent(id)}`, { method: "PATCH", body: { fields, typecast: true } });
}

async function requireActor(request, env, deps) {
  const actor = await (deps.readActor || readCredentialBoundAdminActor)(request, env);
  if (!actor) throw httpError(401, "admin_session_required");
  if (!RECOVERY_ADMIN_ROLES.has(code(actor.role, 80))) throw httpError(403, "recovery_owner_role_required");
  return actor;
}

function proofSnapshot(proof) {
  const fields = proof?.fields || {};
  const note = parseNote(field(fields, "", "note"));
  const proofId = clean(field(fields, PROOF.id, "proof_id"), 120);
  const paymentRef = clean(field(fields, PROOF.paymentRef, "payment_ref", "Payment Reference"), 180)
    || clean(note?.extraction?.payment_ref, 180);
  const amountThb = positiveAmount(field(fields, "", "amount_thb", "amount", "Amount", "Amount THB"))
    ?? positiveAmount(note?.extraction?.amount_thb);
  const status = code(field(fields, PROOF.status, "status"));
  const proofClientIds = recordIds(field(fields, PROOF.client, "Client", "client"));
  const proofPaymentIds = recordIds(field(fields, PROOF.payment, "Payment", "payment"));
  return { proofId, paymentRef, amountThb, status, note, proofClientIds, proofPaymentIds };
}

async function loadHistoricalProof(env, input) {
  const currentTables = tables(env);
  const direct = await getRecord(env, currentTables.proofs, input.proof_record_id);
  const proof = direct || await findOne(env, currentTables.proofs, `{proof_id}='${formulaValue(clean(input.proof_id, 120))}'`);
  if (!proof?.id) throw httpError(404, "historical_proof_not_found");
  const snapshot = proofSnapshot(proof);
  if (!snapshot.proofId || snapshot.note.schema !== HISTORICAL_SCHEMA) throw httpError(409, "historical_proof_schema_mismatch");
  if (snapshot.status === "rejected" || code(snapshot.note.review_state) === "rejected") throw httpError(409, "historical_proof_rejected");
  if (!snapshot.paymentRef || snapshot.amountThb === null) throw httpError(409, "historical_proof_money_evidence_incomplete");
  return { proof, snapshot };
}

function recoverySessionId(proofId) {
  const safe = clean(proofId, 120).replace(/[^A-Za-z0-9_-]/g, "");
  return `cxl_hist_${safe.slice(-80)}`;
}

function canonicalClientName(client) {
  return clean(field(client?.fields, CLIENT.displayName, "Client Name (Display)")
    || field(client?.fields, CLIENT.fallbackName, "Client Name")
    || field(client?.fields, CLIENT.lineDisplayName, "line_display_name"), 180);
}

async function loadCanonicalClient(env, clientId) {
  const client = await getRecord(env, tables(env).clients, clientId);
  if (!client?.id) throw httpError(404, "canonical_client_not_found");
  return { client, clientName: canonicalClientName(client) || "Canonical Client" };
}

async function loadPaymentForProof(env, snapshot) {
  const currentTables = tables(env);
  if (snapshot.proofPaymentIds.length > 1) throw httpError(409, "proof_payment_link_ambiguous");
  if (snapshot.proofPaymentIds.length === 1) return getRecord(env, currentTables.payments, snapshot.proofPaymentIds[0]);
  return findOne(env, currentTables.payments, `{Payment Reference}='${formulaValue(snapshot.paymentRef)}'`);
}

function paymentClientIds(payment) {
  return recordIds(field(payment?.fields, PAYMENT.client, "Client", "client"));
}

function paymentSessionId(payment) {
  return clean(field(payment?.fields, PAYMENT.sessionId, "session_id", "Session ID"), 180);
}

function sessionClientIds(session) {
  return recordIds(field(session?.fields, SESSION.client, "Client", "client"));
}

function sessionStatus(session) {
  return code(field(session?.fields, SESSION.status, "Session Status", "session_status", "status"));
}

function sessionPaymentRef(session) {
  return clean(field(session?.fields, SESSION.paymentRef, "payment_ref", "Payment Reference"), 180);
}

function sessionId(session) {
  return clean(field(session?.fields, SESSION.id, "session_id", "Session ID"), 180);
}

function recoverySummary({ proof, snapshot, session = null, payment = null, credit = null, clientName = null }) {
  return {
    proof: {
      record_id: proof?.id || null,
      proof_id: snapshot?.proofId || null,
      state: code(snapshot?.note?.review_state || snapshot?.status) || "pending",
      payment_ref: snapshot?.paymentRef || null,
      deposit_evidence_thb: snapshot?.amountThb ?? null,
      canonical_client_record_ids: snapshot?.proofClientIds || [],
    },
    recovery_session: session?.id ? {
      record_id: session.id,
      session_id: sessionId(session),
      status: sessionStatus(session),
      canonical_client_record_ids: sessionClientIds(session),
    } : null,
    payment: payment?.id ? paymentSummary(payment) : null,
    credit: credit?.id ? creditSummary(credit) : null,
    canonical_client_name: clientName || null,
  };
}

function paymentSummary(payment) {
  const fields = payment?.fields || {};
  const verification = code(field(fields, PAYMENT.verification, "Verification Status", "verification_status"));
  const depositStatus = code(field(fields, PAYMENT.depositStatus, "deposit_status"));
  const receivedThb = positiveAmount(field(fields, PAYMENT.amountReceived, "amount_received_thb", "Amount Received"));
  const officialAt = clean(field(fields, PAYMENT.officialAt, "official_verified_at"), 120);
  const officialRef = clean(field(fields, PAYMENT.officialRef, "official_verification_ref"), 180);
  const officialBy = clean(field(fields, PAYMENT.officialBy, "official_verified_by"), 180);
  const officiallyVerified = (VERIFIED_PAYMENT_STATES.has(verification) || depositStatus === "official_verified")
    && Boolean(officialAt || officialRef || officialBy)
    && receivedThb !== null;
  return {
    record_id: payment.id,
    payment_ref: clean(field(fields, PAYMENT.ref, "Payment Reference", "payment_ref"), 180),
    session_id: paymentSessionId(payment) || null,
    canonical_client_record_ids: paymentClientIds(payment),
    received_thb: receivedThb,
    verification_status: verification || null,
    deposit_status: depositStatus || null,
    officially_verified: officiallyVerified,
  };
}

function creditSummary(credit) {
  return {
    record_id: credit.id,
    credit_id: clean(field(credit.fields, CREDIT.id, "credit_id"), 120) || null,
    available_thb: amount(field(credit.fields, CREDIT.availableAmount, "available_amount_thb")),
    status: code(field(credit.fields, CREDIT.status, "status")) || null,
    verification_status: code(field(credit.fields, CREDIT.verificationStatus, "verification_status")) || null,
  };
}

async function findRecoverySession(env, proofId) {
  return findOne(env, tables(env).sessions, `{session_id}='${formulaValue(recoverySessionId(proofId))}'`);
}

async function findCredit(env, paymentRef, clientId) {
  return findOne(env, tables(env).credits, `AND({source_payment_ref}='${formulaValue(paymentRef)}',{client_record_id}='${formulaValue(clientId)}')`).catch(() => null);
}

function normalizePrepareInput(body) {
  const modelName = clean(body.model_name, 180);
  const jobType = clean(body.job_type || "PN", 80);
  const jobDate = clean(body.job_date, 10);
  const startTime = clean(body.start_time, 5);
  const endTime = clean(body.end_time, 5);
  const locationName = clean(body.location_name, 240);
  const googleMapUrl = clean(body.google_map_url, 1000);
  const serviceAmountThb = positiveAmount(body.service_amount_thb);
  const modelPayoutThb = positiveAmount(body.model_payout_thb);
  const cancellationReason = clean(body.cancellation_reason, 600);
  const sourceLabel = clean(body.source_label || "Historical cancellation-to-credit recovery", 300);
  const clientId = recordId(body.client_id);
  if (!clientId || !modelName || !locationName || !cancellationReason || cancellationReason.length < 5) {
    throw httpError(400, "recovery_context_required");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jobDate) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    throw httpError(400, "recovery_schedule_invalid");
  }
  if (endTime <= startTime || !jobType || serviceAmountThb === null || modelPayoutThb === null) throw httpError(400, "recovery_money_or_schedule_invalid");
  if (googleMapUrl) {
    let parsed;
    try { parsed = new URL(googleMapUrl); } catch { throw httpError(400, "google_map_url_invalid"); }
    if (parsed.protocol !== "https:") throw httpError(400, "google_map_url_invalid");
  }
  return {
    clientId, modelName, jobType, jobDate, startTime, endTime, locationName, googleMapUrl,
    serviceAmountThb, modelPayoutThb, cancellationReason, sourceLabel,
    identityCorrectionConfirmed: body.identity_correction_confirmed === true,
    identityCorrectionReason: clean(body.identity_correction_reason, 600),
  };
}

async function reconcileProofIdentity(env, { proof, snapshot, clientId, actor, confirmed, reason }) {
  const currentTables = tables(env);
  const existingPayment = await loadPaymentForProof(env, snapshot);
  const existingPaymentClients = paymentClientIds(existingPayment);
  if (existingPayment?.id) {
    if (existingPaymentClients.length !== 1 || existingPaymentClients[0] !== clientId) {
      throw httpError(409, "recovery_payment_client_conflict");
    }
    // A prepared recovery must begin from a historical proof with no Payment.
    // Reusing an existing money record could silently convert unrelated funds.
    throw httpError(409, "recovery_payment_already_exists");
  }

  const proofMatches = snapshot.proofClientIds.length === 1 && snapshot.proofClientIds[0] === clientId;
  if (proofMatches) return { proof, corrected: false };
  const correctionRequired = snapshot.proofClientIds.length > 0;
  if (correctionRequired && (!confirmed || reason.length < 5)) {
    throw httpError(409, "identity_correction_confirmation_required");
  }
  const nextNote = {
    ...snapshot.note,
    identity_correction: {
      schema: "cancellation_credit_recovery_identity_correction_v1",
      from_client_record_ids: snapshot.proofClientIds,
      to_client_record_id: clientId,
      reason: correctionRequired ? reason : "Canonical client linked during recovery preparation.",
      actor: clean(actor?.id || actor?.role || "admin", 160),
      corrected_at: new Date().toISOString(),
    },
  };
  const updated = await patchRecord(env, currentTables.proofs, proof.id, {
    [PROOF.client]: [clientId],
    note: JSON.stringify(nextNote),
  });
  return { proof: updated?.id ? updated : proof, corrected: true };
}

async function ensureRecoverySession(env, { proof, snapshot, clientId, clientName, input, actor }) {
  const currentTables = tables(env);
  const desiredSessionId = recoverySessionId(snapshot.proofId);
  const existing = await findRecoverySession(env, snapshot.proofId);
  if (existing?.id) {
    const sameClient = sessionClientIds(existing).length === 1 && sessionClientIds(existing)[0] === clientId;
    const sameRef = sessionPaymentRef(existing) === snapshot.paymentRef;
    if (!sameClient || !sameRef || !CANCELLED_STATES.has(sessionStatus(existing))) {
      throw httpError(409, "recovery_session_collision");
    }
    return { session: existing, created: false };
  }
  const recoveryNote = {
    schema: "mmd_cancellation_credit_recovery_v1",
    source_proof_record_id: proof.id,
    source_proof_id: snapshot.proofId,
    source_payment_ref: snapshot.paymentRef,
    source_deposit_evidence_thb: snapshot.amountThb,
    cancellation_reason: input.cancellationReason,
    source_label: input.sourceLabel,
    created_by: clean(actor?.id || actor?.role || "admin", 160),
    created_at: new Date().toISOString(),
    payment_authority_required: true,
    client_credit_not_issued: true,
  };
  const fields = {
    [SESSION.id]: desiredSessionId,
    [SESSION.status]: "Cancelled",
    [SESSION.client]: [clientId],
    [SESSION.clientName]: clientName,
    [SESSION.modelName]: input.modelName,
    [SESSION.jobType]: input.jobType,
    [SESSION.jobDate]: input.jobDate,
    [SESSION.startTime]: input.startTime,
    [SESSION.endTime]: input.endTime,
    [SESSION.locationName]: input.locationName,
    [SESSION.googleMapUrl]: input.googleMapUrl || undefined,
    [SESSION.serviceAmount]: input.serviceAmountThb,
    [SESSION.modelPayout]: input.modelPayoutThb,
    [SESSION.paymentRef]: snapshot.paymentRef,
    [SESSION.paymentStatus]: "pending",
    [SESSION.note]: `[CANCELLATION_CREDIT_RECOVERY_V1] ${JSON.stringify(recoveryNote)}`,
  };
  const created = await createRecord(env, currentTables.sessions, Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)));
  const session = Array.isArray(created?.records) ? created.records[0] : null;
  if (!session?.id) throw httpError(502, "recovery_session_create_failed");
  return { session, created: true };
}

async function loadPreparedContext(env, input) {
  const { proof, snapshot } = await loadHistoricalProof(env, input);
  const session = await findRecoverySession(env, snapshot.proofId);
  if (!session?.id) throw httpError(409, "recovery_session_not_prepared");
  const clientIds = sessionClientIds(session);
  if (clientIds.length !== 1 || !CANCELLED_STATES.has(sessionStatus(session)) || sessionPaymentRef(session) !== snapshot.paymentRef) {
    throw httpError(409, "recovery_session_integrity_failed");
  }
  const client = await loadCanonicalClient(env, clientIds[0]);
  return { proof, snapshot, session, clientId: clientIds[0], clientName: client.clientName };
}

async function recoveryStatus(env, input) {
  const { proof, snapshot } = await loadHistoricalProof(env, input);
  const session = await findRecoverySession(env, snapshot.proofId);
  const payment = await loadPaymentForProof(env, snapshot);
  const clientId = sessionClientIds(session)[0] || snapshot.proofClientIds[0] || "";
  const client = clientId ? await loadCanonicalClient(env, clientId).catch(() => null) : null;
  const credit = clientId ? await findCredit(env, snapshot.paymentRef, clientId) : null;
  const summary = recoverySummary({ proof, snapshot, session, payment, credit, clientName: client?.clientName || null });
  const paymentOfficial = summary.payment?.officially_verified === true;
  summary.next_action = summary.credit ? "complete" : paymentOfficial ? "issue_credit" : session ? "verify_payment" : "prepare";
  return summary;
}

async function prepareRecovery(request, env, actor) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "invalid_recovery_request");
  const input = normalizePrepareInput(body);
  const { proof, snapshot } = await loadHistoricalProof(env, body);
  if (code(snapshot.note.review_state) === "processed") throw httpError(409, "historical_proof_already_processed");
  const client = await loadCanonicalClient(env, input.clientId);
  const identity = await reconcileProofIdentity(env, {
    proof, snapshot, clientId: input.clientId, actor,
    confirmed: input.identityCorrectionConfirmed, reason: input.identityCorrectionReason,
  });
  const latestSnapshot = proofSnapshot(identity.proof);
  const ensured = await ensureRecoverySession(env, {
    proof: identity.proof, snapshot: latestSnapshot, clientId: input.clientId, clientName: client.clientName, input, actor,
  });
  const summary = await recoveryStatus(env, { proof_record_id: identity.proof.id, proof_id: latestSnapshot.proofId });
  return json({ ok: true, action: "prepared", identity_corrected: identity.corrected, session_created: ensured.created, ...summary }, 201);
}

async function verifyRecoveryPayment(request, env, ctx, actor, deps) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "invalid_recovery_request");
  const prepared = await loadPreparedContext(env, body);
  if (code(prepared.snapshot.note.review_state) === "processed") {
    const summary = await recoveryStatus(env, body);
    return json({ ok: true, action: "verify_payment", duplicate: true, ...summary });
  }
  const reviewRequest = new Request(new URL("/v1/admin/payments/historical-backfill/review", request.url).toString(), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      proof_id: prepared.snapshot.proofId,
      proof_record_id: prepared.proof.id,
      decision: "approve",
      payment_ref: prepared.snapshot.paymentRef,
      amount_thb: prepared.snapshot.amountThb,
      payment_stage: "deposit",
      session_id: sessionId(prepared.session),
      review_reason: `Cancellation-to-credit recovery: ${prepared.snapshot.proofId}; actor=${clean(actor?.id || "admin", 120)}`,
      cancellation_credit_recovery: true,
      recovery_client_record_id: prepared.clientId,
    }),
  });
  const response = await (deps.historicalHandler || handleHistoricalSlipBackfillRequest)(reviewRequest, env, ctx);
  const payload = await response.clone().json().catch(() => null);
  if (!response.ok || payload?.ok !== true) return response;
  const summary = await recoveryStatus(env, body);
  return json({ ok: true, action: "verify_payment", authority: "payments-worker", payment_handoff: payload, ...summary });
}

async function issueRecoveryCredit(request, env, ctx, actor, deps) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "invalid_recovery_request");
  const prepared = await loadPreparedContext(env, body);
  const payment = await loadPaymentForProof(env, prepared.snapshot);
  if (!payment?.id) throw httpError(409, "recovery_payment_not_officially_verified");
  const source = paymentSummary(payment);
  if (!source.officially_verified || source.received_thb === null) throw httpError(409, "recovery_payment_not_officially_verified");
  if (source.payment_ref !== prepared.snapshot.paymentRef || source.session_id !== sessionId(prepared.session)) {
    throw httpError(409, "recovery_payment_subject_mismatch");
  }
  if (source.canonical_client_record_ids.length !== 1 || source.canonical_client_record_ids[0] !== prepared.clientId) {
    throw httpError(409, "recovery_payment_client_mismatch");
  }
  const url = new URL("/v1/admin/client-credits/carry-forward-by-ref", request.url);
  const headers = new Headers({ "content-type": "application/json", accept: "application/json" });
  const originalOrigin = request.headers.get("origin");
  const originalCookie = request.headers.get("cookie");
  if (originalOrigin) headers.set("origin", originalOrigin);
  if (originalCookie) headers.set("cookie", originalCookie);
  headers.set("idempotency-key", `cancellation-credit:${prepared.proof.id}:${prepared.clientId}`);
  const downstreamRequest = new Request(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({
      payment_ref: prepared.snapshot.paymentRef,
      // Amount comes from the payment authority record. It is never accepted
      // from the browser's cancellation form.
      amount_thb: source.received_thb,
      reason: "client_cancel_no_penalty",
      refundable: false,
      customer_display_note: "ยอดมัดจำคงเหลือพร้อมใช้กับการจองครั้งถัดไป",
      internal_note: `Cancellation credit recovery for ${prepared.snapshot.proofId}; confirmed by ${clean(actor?.id || "admin", 120)}.`,
    }),
  });
  const response = await (deps.delegatedWorker || delegatedWorker).fetch(downstreamRequest, env, ctx);
  const payload = await response.clone().json().catch(() => null);
  if (!response.ok || payload?.ok !== true) return response;
  const summary = await recoveryStatus(env, body);
  return json({ ok: true, action: "issue_credit", credit_result: payload, ...summary }, response.status === 201 ? 201 : 200);
}

export async function handleCancellationCreditRecoveryRequest(request, env = {}, ctx = null, deps = {}) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  try {
    if (method !== "GET" && method !== "POST") return responseError(405, "METHOD_NOT_ALLOWED", "GET or POST required.");
    const actor = await requireActor(request, env, deps);
    if (method === "GET") {
      const summary = await recoveryStatus(env, {
        proof_id: url.searchParams.get("proof_id"),
        proof_record_id: url.searchParams.get("proof_record_id"),
      });
      return json({ ok: true, action: "status", actor: clean(actor?.id || actor?.role, 120), ...summary });
    }
    if (!sameOrigin(request)) return responseError(403, "FORBIDDEN_ORIGIN", "Same-origin request required.");
    const clone = request.clone();
    const body = await clone.json().catch(() => null);
    const action = code(body?.action);
    if (action === "prepare") return await prepareRecovery(request, env, actor);
    if (action === "verify_payment") return await verifyRecoveryPayment(request, env, ctx, actor, deps);
    if (action === "issue_credit") return await issueRecoveryCredit(request, env, ctx, actor, deps);
    return responseError(400, "ACTION_REQUIRED", "Use prepare, verify_payment, or issue_credit.");
  } catch (error) {
    const status = Number(error?.status) >= 400 && Number(error?.status) <= 599 ? Number(error.status) : 500;
    const errorCode = clean(error?.message || "cancellation_credit_recovery_failed", 120).toUpperCase();
    return responseError(status, errorCode, "Cancellation-to-credit recovery could not be completed.");
  }
}

export default {
  ...delegatedWorker,
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === CANCELLATION_CREDIT_RECOVERY_PATH) {
      return handleCancellationCreditRecoveryRequest(request, env, ctx);
    }
    return delegatedWorker.fetch(request, env, ctx);
  },
};
