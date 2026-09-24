import workerWithSlipEvidence from "./index.with-slip-evidence.js";
import { awardBasePointsPhase1 } from "./points-phase1.js";
import {
  CONFIRM_ACK_PATH,
  CONFIRM_CONTEXT_PATH,
  handleConfirmationAck,
  handleConfirmationContext,
} from "./confirmation-ack.js";
import { CONFIRM_DETAILS_PATH, handleConfirmationDetails } from "./confirmation-details.js";
import {
  CUSTOMER_CHANGE_REQUEST_PATH,
  handleCustomerChangeRequest,
} from "./customer-change-request.js";
import { notifyPartnerJobAfterOfficialVerify } from "./partner-job-confirm.js";
export { PointsPhase1Coordinator } from "./points-phase1.js";

const NOTIFY_PATH = "/v1/payments/notify";
const HISTORICAL_REVIEW_PATH = "/v1/internal/payments/historical-slip/reviewed";
const HISTORICAL_SCHEMA = "mmd_historical_slip_backfill_v1";
const PAYMENT_STAGES = new Set(["deposit", "final", "tips", "full", "extension", "membership"]);
const AIRTABLE_API = "https://api.airtable.com/v0";
const CANCELLATION_CREDIT_RECOVERY = Object.freeze({
  paymentsTable: "tblWGGJJOx5eBvBZJ",
  sessionsTable: "tblC98mKWbzmPuNzX",
  paymentRef: "fldOO6SY49iDw8VBZ",
  paymentClient: "fldcrLuJijj7xr0y8",
  paymentAmountReceived: "fld5rTIVEF1DXwfe2",
  paymentVerification: "fldJ7a0Ube9F0bmRy",
  paymentSessionId: "fld2wdhBvc8xrV6y5",
  paymentDepositStatus: "fldD0mQWTfdmyBAeT",
  paymentOfficialAt: "fldPNK6qgxCSdaJRM",
  paymentOfficialRef: "flddkMKy5H8RbFwt9",
  paymentOfficialBy: "fld208LCmQZB5llNo",
  sessionId: "fldLTq2kZbyRv22IA",
  sessionClient: "fld6P6if0vDZCeV0C",
  sessionStatus: "fldmwuvOaiCFdzzRa",
});
const CANCELLED_SESSION_STATES = new Set([
  "cancelled", "canceled", "cancelled_by_client", "canceled_by_client", "client_cancelled", "client_canceled",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (path === CONFIRM_DETAILS_PATH && (method === "POST" || method === "OPTIONS")) {
      return handleConfirmationDetails(request, env);
    }

    if (path === CONFIRM_ACK_PATH && (method === "POST" || method === "OPTIONS")) {
      return handleConfirmationAck(request, env);
    }
    if (path === CONFIRM_CONTEXT_PATH && (method === "POST" || method === "OPTIONS")) {
      return handleConfirmationContext(request, env);
    }

    if (path === CUSTOMER_CHANGE_REQUEST_PATH && (method === "POST" || method === "OPTIONS")) {
      return handleCustomerChangeRequest(request, env);
    }

    if (path === HISTORICAL_REVIEW_PATH) {
      if (method === "OPTIONS") return new Response(null, { status: 204, headers: jsonHeaders() });
      if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      return handleHistoricalReviewedSlip(request, env, ctx);
    }

    if (method !== "POST" || path !== NOTIFY_PATH) {
      return workerWithSlipEvidence.fetch(request, env, ctx);
    }

    const body = await request.clone().json().catch(() => ({}));
    return runTrustedNotify(request, env, ctx, body, { injectInternalToken: false });
  },
};

async function handleHistoricalReviewedSlip(request, env, ctx) {
  if (!(await serviceAuthed(request, env.AUTH_SERVICE_ADMIN_TO_PAYMENTS))) {
    return json({ ok: false, error: "service_auth_required", authority: "payments-worker" }, 401);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_historical_review_request", authority: "payments-worker" }, 400);
  }

  try {
    const source = code(body.source);
    const decision = code(body.decision);
    const proofId = text(body.proof_id, 120);
    const evidenceSha256 = text(body.evidence_sha256, 64).toLowerCase();
    const paymentRef = text(body.payment_ref || body.transaction_ref, 180);
    const amountThb = positiveAmount(body.amount_thb ?? body.amount);
    const paymentStage = normalizeStage(body.payment_stage || body.stage || body.payment_type);
    const sessionId = text(body.session_id, 180);
    const memberEmail = email(body.member_email || body.email);
    const packageCode = text(body.package_code || body.package, 120);
    const paidAt = text(body.paid_at, 80);
    const reviewReason = text(body.review_reason, 600);
    const overrideReason = text(body.override_reason, 600);
    const reviewActor = text(body.review_actor || "internal_admin_owner", 120);
    const cancellationCreditRecovery = body.cancellation_credit_recovery === true;
    const recoveryClientRecordId = recordId(body.recovery_client_record_id || body.client_record_id);

    if (source !== "historical_slip_backfill") throw httpError(400, "invalid_historical_review_source");
    if (decision !== "approved") throw httpError(400, "explicit_approved_decision_required");
    if (!proofId) throw httpError(400, "proof_id_required");
    if (!/^[a-f0-9]{64}$/.test(evidenceSha256)) throw httpError(400, "evidence_sha256_required");
    if (!paymentRef) throw httpError(400, "payment_ref_required");
    if (amountThb == null) throw httpError(400, "amount_thb_required");
    if (reviewReason.length < 5) throw httpError(400, "review_reason_required");
    if (["deposit", "final", "tips", "full", "extension"].includes(paymentStage) && !sessionId) throw httpError(400, "session_id_required_for_service_payment");
    if (paymentStage === "membership" && !memberEmail) throw httpError(400, "member_email_required_for_membership_payment");
    if (cancellationCreditRecovery && paymentStage !== "deposit") throw httpError(409, "cancellation_credit_recovery_requires_deposit");
    if (cancellationCreditRecovery && !recoveryClientRecordId) throw httpError(400, "recovery_client_record_id_required");

    const proof = await loadHistoricalProof(env, proofId);
    if (!proof) throw httpError(404, "historical_proof_not_found");
    const proofNote = parseNote(proof.fields?.note);
    if (proofNote.schema !== HISTORICAL_SCHEMA) throw httpError(409, "historical_proof_schema_mismatch");
    if (!new Set(["line_album", "line_archive"]).has(code(proofNote.source_type))) throw httpError(409, "historical_proof_source_mismatch");
    if (text(proofNote.evidence_sha256, 64).toLowerCase() !== evidenceSha256) throw httpError(409, "historical_proof_sha_mismatch");

    const proofState = code(proofNote.review_state || "pending");
    if (proofState === "processed") {
      return json({
        ok: true,
        duplicate: true,
        idempotent: true,
        authority: "payments-worker",
        proof_id: proofId,
        payment_ref: text(proofNote.payments_worker_result?.payment_ref || paymentRef, 180),
        payment_stage: code(proofNote.payments_worker_result?.payment_stage || paymentStage),
        proof_status: code(proof.fields?.status || "reviewed"),
      });
    }
    if (proofState === "rejected") throw httpError(409, "historical_proof_rejected");
    if (proofState !== "pending") throw httpError(409, "historical_proof_not_pending");

    const proofRef = text(proof.fields?.payment_ref || proofNote.extraction?.payment_ref, 180);
    const proofAmount = positiveAmount(proof.fields?.amount_thb ?? proofNote.extraction?.amount_thb);
    const conflict = Boolean(
      (proofRef && proofRef !== paymentRef) ||
      (proofAmount != null && Math.abs(proofAmount - amountThb) > 0.009)
    );
    if (conflict && overrideReason.length < 5) throw httpError(409, "override_reason_required_for_proof_conflict");

    let recoverySession = null;
    if (cancellationCreditRecovery) {
      recoverySession = await validateCancellationCreditRecoverySubject(env, {
        sessionId,
        clientRecordId: recoveryClientRecordId,
        paymentRef,
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
      paid_at: paidAt || undefined,
      payment_method: "promptpay",
      notes: `historical_slip_backfill proof_id=${proofId}; evidence_sha256=${evidenceSha256}; reviewed_by=${reviewActor}${cancellationCreditRecovery ? "; cancellation_credit_recovery=true" : ""}`,
    };

    const notifyRequest = new Request(new URL(NOTIFY_PATH, request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notifyBody),
    });
    const response = await runTrustedNotify(notifyRequest, env, ctx, notifyBody, {
      injectInternalToken: true,
      skipPointsAndPartner: cancellationCreditRecovery,
    });
    const payload = await response.clone().json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) return response;

    const recoveryPayment = cancellationCreditRecovery
      ? await finalizeCancellationCreditRecoveryPayment(env, {
          paymentWrite: payload.payment_write,
          paymentRef,
          amountThb,
          sessionId,
          clientRecordId: recoveryClientRecordId,
          sessionRecordId: recoverySession?.id || null,
          proofId,
        })
      : null;

    const processedAt = new Date().toISOString();
    const nextNote = {
      ...proofNote,
      review_state: "processed",
      reviewed_at: processedAt,
      review_reason: reviewReason,
      override_reason: overrideReason || null,
      reviewed_by: reviewActor,
      payments_worker_processed_at: processedAt,
      payments_worker_result: {
        payment_ref: paymentRef,
        payment_stage: paymentStage,
        payment_record_id: text(payload.payment_write?.record_id || payload.payment_write?.id, 120) || null,
        points_awarded: payload.points_ledger?.awarded === true,
        duplicate: payload.duplicated === true || payload.duplicate === true,
        cancellation_credit_recovery: cancellationCreditRecovery,
        recovery_client_record_id: cancellationCreditRecovery ? recoveryClientRecordId : null,
        recovery_session_record_id: cancellationCreditRecovery ? recoverySession?.id || null : null,
        recovery_payment_record_id: recoveryPayment?.record_id || null,
      },
    };

    const proofAuditWrite = await patchHistoricalProof(env, proof.id, {
      status: "reviewed",
      note: JSON.stringify(nextNote),
    }).then(() => ({ ok: true })).catch((error) => ({ ok: false, error: String(error?.message || error) }));

    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store, private");
    headers.set("x-mmd-payment-authority", "payments-worker");
    return new Response(JSON.stringify({
      ...payload,
      ok: true,
      authority: "payments-worker",
      historical_slip_backfill: true,
      proof_id: proofId,
      proof_audit_write: proofAuditWrite,
      cancellation_credit_recovery: cancellationCreditRecovery,
      recovery_payment: recoveryPayment,
    }), { status: response.status, headers });
  } catch (error) {
    return json({
      ok: false,
      error: clean(error?.message || error || "historical_review_failed"),
      authority: "payments-worker",
    }, Number(error?.status || 500));
  }
}

async function runTrustedNotify(request, env, ctx, body, { injectInternalToken, skipPointsAndPartner = false }) {
  // Keep existing payment/session validation and persistence, but suppress the
  // legacy per-payment points calculation. Phase 1 is the only base-points
  // writer after a trusted notify succeeds.
  const baseEnv = { ...env, POINTS_RATE: "9007199254740991" };
  let downstreamRequest = request;
  if (injectInternalToken) {
    const headers = new Headers(request.headers);
    headers.set("X-Internal-Token", clean(env.INTERNAL_TOKEN));
    headers.set("Authorization", `Bearer ${clean(env.INTERNAL_TOKEN)}`);
    downstreamRequest = new Request(request, { headers });
  }

  const response = await workerWithSlipEvidence.fetch(downstreamRequest, baseEnv, ctx);
  if (!response.ok) return response;

  const payload = await response.clone().json().catch(() => null);
  if (!payload?.ok) return response;

  const pointsLedger = skipPointsAndPartner
    ? { ok: true, awarded: false, skipped: true, reason: "cancellation_credit_recovery" }
    : await awardBasePointsPhase1(env, {
        payment_ref: body.payment_ref || body.transaction_ref,
        stage: body.stage || body.payment_stage || body.payment_type || "deposit",
        session_id: body.session_id,
        amount_thb: body.amount_thb || body.amount,
        member_id: body.member_id,
        member_email: body.member_email || body.email,
      }).catch((error) => ({
        ok: false,
        awarded: false,
        error: String(error?.message || error || "points_phase1_failed"),
      }));

  const partnerConfirmation = skipPointsAndPartner
    ? { ok: true, sent: false, skipped: true, reason: "cancellation_credit_recovery" }
    : await notifyPartnerJobAfterOfficialVerify(env, {
        payment_ref: body.payment_ref || body.transaction_ref,
        stage: body.stage || body.payment_stage || body.payment_type || "deposit",
        session_id: body.session_id,
      }).catch((error) => ({
        ok:false,
        sent:false,
        reason:"partner_confirmation_hook_failed",
        error:String(error?.message || error || "unknown"),
      }));

  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify({ ...payload, points_ledger: pointsLedger, partner_confirmation: partnerConfirmation }), {
    status: response.status,
    headers,
  });
}

async function loadHistoricalProof(env, proofId) {
  requireAirtable(env);
  const table = historicalProofTable(env);
  const formula = `{proof_id}='${formulaValue(proofId)}'`;
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", formula);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status, `airtable_${response.status}`);
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (records.length > 1) throw httpError(409, "historical_proof_ambiguous");
  return records[0] || null;
}

async function patchHistoricalProof(env, recordId, fields) {
  requireAirtable(env);
  const url = `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(historicalProofTable(env))}/${encodeURIComponent(recordId)}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return payload;
}

function recordId(value) {
  const valueText = text(value, 40);
  return /^rec[A-Za-z0-9]{14}$/.test(valueText) ? valueText : "";
}

function recordLinks(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => recordId(item)).filter(Boolean))]
    : [];
}

function recoveryField(fields, fieldId, ...aliases) {
  if (fields?.[fieldId] !== undefined) return fields[fieldId];
  for (const alias of aliases) if (fields?.[alias] !== undefined) return fields[alias];
  return undefined;
}

function recoveryPaymentsTable(env) {
  return clean(env.AIRTABLE_TABLE_PAYMENTS || env.AIRTABLE_TABLE_PAYMENTS_ID) || CANCELLATION_CREDIT_RECOVERY.paymentsTable;
}

function recoverySessionsTable(env) {
  return clean(env.AIRTABLE_TABLE_SESSIONS || env.AIRTABLE_TABLE_SESSIONS_ID) || CANCELLATION_CREDIT_RECOVERY.sessionsTable;
}

async function recoveryAirtableRequest(env, table, path = "", init = {}) {
  requireAirtable(env);
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}${path}`);
  url.searchParams.set("returnFieldsByFieldId", "true");
  for (const [key, value] of Object.entries(init.query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString(), {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status, `airtable_${response.status}`);
  return payload;
}

async function recoveryFindOne(env, table, formula) {
  const payload = await recoveryAirtableRequest(env, table, "", { query: { maxRecords: 2, filterByFormula: formula } });
  const rows = Array.isArray(payload?.records) ? payload.records : [];
  if (rows.length > 1) throw httpError(409, "recovery_subject_ambiguous");
  return rows[0] || null;
}

async function recoveryGetRecord(env, table, id) {
  const normalizedId = recordId(id);
  if (!normalizedId) return null;
  return recoveryAirtableRequest(env, table, `/${encodeURIComponent(normalizedId)}`).catch((error) => {
    if (Number(error?.status) === 404) return null;
    throw error;
  });
}

async function validateCancellationCreditRecoverySubject(env, { sessionId, clientRecordId, paymentRef }) {
  const session = await recoveryFindOne(
    env,
    recoverySessionsTable(env),
    `{session_id}='${formulaValue(sessionId)}'`,
  );
  if (!session?.id) throw httpError(404, "recovery_session_not_found");

  const sessionClientIds = recordLinks(recoveryField(session.fields, CANCELLATION_CREDIT_RECOVERY.sessionClient, "Client"));
  if (sessionClientIds.length !== 1 || sessionClientIds[0] !== clientRecordId) {
    throw httpError(409, "recovery_session_client_mismatch");
  }
  const sessionStatus = code(recoveryField(session.fields, CANCELLATION_CREDIT_RECOVERY.sessionStatus, "Session Status", "session_status"));
  if (!CANCELLED_SESSION_STATES.has(sessionStatus)) throw httpError(409, "recovery_session_not_cancelled");

  const existingPayment = await recoveryFindOne(
    env,
    recoveryPaymentsTable(env),
    `{Payment Reference}='${formulaValue(paymentRef)}'`,
  );
  if (existingPayment?.id) {
    const existingSessionId = text(recoveryField(existingPayment.fields, CANCELLATION_CREDIT_RECOVERY.paymentSessionId, "session_id", "Session ID"), 180);
    const existingClientIds = recordLinks(recoveryField(existingPayment.fields, CANCELLATION_CREDIT_RECOVERY.paymentClient, "Client"));
    if (existingSessionId && existingSessionId !== sessionId) throw httpError(409, "recovery_payment_session_mismatch");
    if (existingClientIds.length && (existingClientIds.length !== 1 || existingClientIds[0] !== clientRecordId)) {
      throw httpError(409, "recovery_payment_client_mismatch");
    }
  }
  return session;
}

async function finalizeCancellationCreditRecoveryPayment(env, {
  paymentWrite,
  paymentRef,
  amountThb,
  sessionId,
  clientRecordId,
  sessionRecordId,
  proofId,
}) {
  const paymentId = recordId(paymentWrite?.record_id || paymentWrite?.id);
  const payment = paymentId
    ? await recoveryGetRecord(env, recoveryPaymentsTable(env), paymentId)
    : await recoveryFindOne(env, recoveryPaymentsTable(env), `{Payment Reference}='${formulaValue(paymentRef)}'`);
  if (!payment?.id) throw httpError(502, "recovery_payment_write_unresolved");

  const writtenRef = text(recoveryField(payment.fields, CANCELLATION_CREDIT_RECOVERY.paymentRef, "Payment Reference", "payment_ref"), 180);
  const writtenSessionId = text(recoveryField(payment.fields, CANCELLATION_CREDIT_RECOVERY.paymentSessionId, "session_id", "Session ID"), 180);
  const writtenClientIds = recordLinks(recoveryField(payment.fields, CANCELLATION_CREDIT_RECOVERY.paymentClient, "Client"));
  if (writtenRef !== paymentRef || writtenSessionId !== sessionId) throw httpError(409, "recovery_payment_write_subject_mismatch");
  if (writtenClientIds.length && (writtenClientIds.length !== 1 || writtenClientIds[0] !== clientRecordId)) {
    throw httpError(409, "recovery_payment_write_client_mismatch");
  }

  const verifiedAt = new Date().toISOString();
  await recoveryAirtableRequest(env, recoveryPaymentsTable(env), `/${encodeURIComponent(payment.id)}`, {
    method: "PATCH",
    body: {
      fields: {
        [CANCELLATION_CREDIT_RECOVERY.paymentClient]: [clientRecordId],
        [CANCELLATION_CREDIT_RECOVERY.paymentAmountReceived]: amountThb,
        [CANCELLATION_CREDIT_RECOVERY.paymentVerification]: "official_verified",
        [CANCELLATION_CREDIT_RECOVERY.paymentDepositStatus]: "official_verified",
        [CANCELLATION_CREDIT_RECOVERY.paymentOfficialAt]: verifiedAt,
        [CANCELLATION_CREDIT_RECOVERY.paymentOfficialRef]: paymentRef,
        [CANCELLATION_CREDIT_RECOVERY.paymentOfficialBy]: "payments-worker",
      },
      typecast: false,
    },
  });
  return {
    record_id: payment.id,
    payment_ref: paymentRef,
    received_thb: amountThb,
    client_record_id: clientRecordId,
    session_record_id: recordId(sessionRecordId) || null,
    proof_id: proofId,
    official_verified_at: verifiedAt,
  };
}

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) throw httpError(503, "airtable_not_ready");
}

function historicalProofTable(env) {
  return clean(env.AIRTABLE_TABLE_PAYMENT_PROOFS || env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi");
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

function normalizeStage(value) {
  const stage = code(value);
  if (!PAYMENT_STAGES.has(stage)) throw httpError(400, "invalid_payment_stage");
  return stage;
}

function positiveAmount(value) {
  if (value == null || clean(value) === "") return null;
  const normalized = clean(value).replace(/,/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function parseNote(value) {
  try {
    const parsed = JSON.parse(clean(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function email(value) {
  const normalized = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

function code(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100);
}

function text(value, max = 240) {
  return clean(value).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function jsonHeaders() {
  return new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-MMD-Payment-Authority": "payments-worker",
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders() });
}
