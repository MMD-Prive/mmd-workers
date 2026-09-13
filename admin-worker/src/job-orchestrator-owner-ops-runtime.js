import { sendCanonicalTelegramAlert, telegramAlertDiagnostic } from "./telegram-alert-matrix.js";

export const OWNER_JOB_ACTIONS_PATH = "/v1/admin/dashboard/owner-actions";
export const JOB_ORCHESTRATOR_AUTHORITY = "model_session_contract_v1";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const SESSIONS_TABLE = "tblC98mKWbzmPuNzX";
const PAYMENTS_TABLE = "tblWGGJJOx5eBvBZJ";
const PAYOUT_EVIDENCE_TABLE = "tblMvsl7qYozD05e5";
const PRIVATE_CARE_TABLE = "tbltWzMBhWev4JR13";

const SESSION = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  jobId: "fldHw5HdDDdkHXMhG",
  modelName: "flddVz6eoWRHrzIQr",
  clientName: "fldMvnQ0BzDfHUYjT",
  paymentRef: "fldojgjSQLaO0uQLX",
  paymentStatus: "fldTY5lE6m0kQf72n",
  modelPayout: "fldlTO5aNfqUmlNWm",
  customerAmount: "fldvJowquu8RrsOMc",
  customerAckAt: "fldJSS5GNN7quJwa8",
  modelAckAt: "fldFgkHXivIAThfDz",
  canonicalState: "fld57fhdWqIcOy4Jp",
  canonicalStateUpdatedAt: "fldFJI1Leni6wvzR4",
  completionStatus: "fldsX182wBo1TdD5f",
  completionReviewedAt: "fldwFJHdx52esyQcq",
  payoutHoldReason: "fldLjo7Af3ISu9yf5",
});
const PAYMENT = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  sessionId: "fld2wdhBvc8xrV6y5",
  verification: "fldJ7a0Ube9F0bmRy",
  paymentStatus: "fldEJ1hmm7KwWuI6q",
  amount: "fldvCSwrUW8OMAooS",
  stage: "fldrr9g8ZZjqAbdKQ",
});
const PAYOUT = Object.freeze({
  payoutRef: "fldrHeDeuv0ZP08L1",
  sessionId: "fldwmqaIq9QubX9Uy",
  modelName: "fldxsDAxjO9sDt3Ab",
  payoutType: "fldgITP2xFiS2YHCG",
  amount: "fldTNf4UOoqc0KobP",
  payoutDatetime: "fldUxokneJ2FBI6jo",
  payoutStatus: "fldy2TgwO7Ayp6uhh",
  linkedPaymentRef: "fldzN9hbCbWIbQOj1",
  slipUrl: "fldBKLWNpl72HIhIt",
  verificationStatus: "fldbnm3clTmwhGiNu",
  verifiedBy: "fldJ3QDCmFuKbLzlv",
  verifiedAt: "fldQNNVtrLyQ3guoW",
  notes: "fldtWxHf3duswd2Uk",
});
const CARE = Object.freeze({
  complaintId: "fldxO9ZbQvw2kfXmT",
  sessionId: "fldsCZsKIU7k9ZJm3",
  status: "fldlW4GB2IoyjY5ee",
});

const POST_WORK_STATES = new Set(["work_finished", "separated", "under_review", "payout_pending"]);
const OWNER_ROLES = new Set(["owner", "admin", "super_admin", "superadmin"]);

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}
function lower(value) {
  return clean(typeof value === "object" && value ? value.name : value, 120).toLowerCase();
}
function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private" } });
}
function config(env = {}) {
  return {
    baseId: clean(env.AIRTABLE_BASE_ID, 40) || DEFAULT_BASE_ID,
    token: clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 1200),
  };
}
async function airtable(env, tableId, path = "", init = {}) {
  const { baseId, token } = config(env);
  if (!baseId || !token) throw new Error("airtable_not_configured");
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}${path}`);
  url.searchParams.set("returnFieldsByFieldId", "true");
  for (const [key, value] of Object.entries(init.query || {})) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  const response = await fetch(url.toString(), {
    method: init.method || "GET",
    headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return payload;
}
async function listAll(env, tableId, max = 300) {
  const out = [];
  let offset = "";
  do {
    const payload = await airtable(env, tableId, "", { query: { pageSize: 100, ...(offset ? { offset } : {}) } });
    out.push(...(Array.isArray(payload?.records) ? payload.records : []));
    offset = clean(payload?.offset, 500);
  } while (offset && out.length < max);
  return out.slice(0, max);
}
async function patchRecord(env, tableId, recordId, fields) {
  return airtable(env, tableId, `/${encodeURIComponent(recordId)}`, { method: "PATCH", body: { fields } });
}
async function createRecord(env, tableId, fields) {
  return airtable(env, tableId, "", { method: "POST", body: { fields } });
}
function findSession(rows, sessionId) {
  return rows.find((row) => clean(row?.fields?.[SESSION.sessionId], 120) === sessionId) || null;
}
function careForSession(rows, sessionId) {
  return rows.filter((row) => clean(row?.fields?.[CARE.sessionId], 120) === sessionId);
}
function openCareCases(rows, sessionId) {
  return careForSession(rows, sessionId).filter((row) => lower(row?.fields?.[CARE.status]) !== "closed");
}
function verifiedPayment(rows, sessionId, paymentRef = "") {
  const candidates = rows.filter((row) => {
    const f = row?.fields || {};
    return clean(f[PAYMENT.sessionId], 120) === sessionId || (paymentRef && clean(f[PAYMENT.paymentRef], 180) === paymentRef);
  });
  const verified = candidates.filter((row) => lower(row?.fields?.[PAYMENT.verification]) === "verified");
  if (!verified.length) return null;
  return verified.sort((a, b) => {
    const rank = (row) => ["final", "full"].includes(lower(row?.fields?.[PAYMENT.stage])) ? 2 : 1;
    return rank(b) - rank(a);
  })[0];
}
function payoutForSession(rows, sessionId) {
  return rows.find((row) => clean(row?.fields?.[PAYOUT.sessionId], 120) === sessionId && lower(row?.fields?.[PAYOUT.payoutType]) === "session_payout") || null;
}
function canonicalState(session) {
  return lower(session?.fields?.[SESSION.canonicalState]);
}
function completionStatus(session) {
  return lower(session?.fields?.[SESSION.completionStatus]);
}
function confirmationComplete(session) {
  return Boolean(clean(session?.fields?.[SESSION.customerAckAt], 80) && clean(session?.fields?.[SESSION.modelAckAt], 80));
}
function ownerActionProjection(session, context) {
  const fields = session?.fields || {};
  const sessionId = clean(fields[SESSION.sessionId], 120);
  const state = canonicalState(session);
  const completion = completionStatus(session);
  const payoutAmount = money(fields[SESSION.modelPayout]);
  const careOpen = context.openCare.length > 0;
  const paymentVerified = Boolean(context.payment);
  const payoutStatus = lower(context.payout?.fields?.[PAYOUT.payoutStatus]);
  const holdReasons = [];
  if (careOpen) holdReasons.push("open_private_care_case");
  if (!paymentVerified) holdReasons.push("payment_not_verified");
  if (!(payoutAmount > 0)) holdReasons.push("payout_amount_missing");
  if (!["clear", "resolved"].includes(completion)) holdReasons.push("completion_not_reviewed");

  return {
    session_id: sessionId,
    job_id: clean(fields[SESSION.jobId], 120) || null,
    client_name: clean(fields[SESSION.clientName], 160) || null,
    model_name: clean(fields[SESSION.modelName], 160) || null,
    state: state || null,
    confirmation_complete: confirmationComplete(session),
    completion_review_status: completion || null,
    payout_amount_thb: payoutAmount,
    payout_status: payoutStatus || null,
    payment_verified: paymentVerified,
    open_care_case_count: context.openCare.length,
    payout_hold_reason: clean(fields[SESSION.payoutHoldReason], 240) || (holdReasons.length ? holdReasons.join(",") : null),
    actions: {
      can_clear_completion: ["separated", "under_review"].includes(state) && !careOpen && paymentVerified && payoutAmount > 0,
      can_hold_completion: POST_WORK_STATES.has(state) && state !== "closed",
      can_mark_payout_ready: state === "under_review" && ["clear", "resolved"].includes(completion) && !careOpen && paymentVerified && payoutAmount > 0 && !["payout_pending", "payout_paid"].includes(payoutStatus),
      can_mark_payout_paid: state === "payout_pending" && payoutStatus === "payout_pending",
    },
  };
}

export async function listOwnerJobActions(env = {}) {
  const [sessions, payments, payouts, care] = await Promise.all([
    listAll(env, SESSIONS_TABLE),
    listAll(env, PAYMENTS_TABLE),
    listAll(env, PAYOUT_EVIDENCE_TABLE),
    listAll(env, PRIVATE_CARE_TABLE),
  ]);
  const items = sessions
    .filter((session) => {
      const state = canonicalState(session);
      return POST_WORK_STATES.has(state) || state === "closed";
    })
    .map((session) => {
      const sessionId = clean(session?.fields?.[SESSION.sessionId], 120);
      return ownerActionProjection(session, {
        payment: verifiedPayment(payments, sessionId, clean(session?.fields?.[SESSION.paymentRef], 180)),
        payout: payoutForSession(payouts, sessionId),
        openCare: openCareCases(care, sessionId),
      });
    })
    .filter((item) => item.session_id)
    .sort((a, b) => Number(b.state === "payout_pending") - Number(a.state === "payout_pending"));

  const completionReview = items.filter((item) => ["separated", "under_review"].includes(item.state) && !["clear", "resolved"].includes(item.completion_review_status));
  const payoutReady = items.filter((item) => item.actions.can_mark_payout_ready || item.state === "payout_pending");
  return {
    ok: true,
    authority: JOB_ORCHESTRATOR_AUTHORITY,
    counts: {
      completion_review: completionReview.length,
      payout_ready: payoutReady.length,
      confirmation_incomplete: sessions.filter((s) => ["offered", "confirmed"].includes(canonicalState(s)) && !confirmationComplete(s)).length,
    },
    items,
    telegram: telegramAlertDiagnostic(env),
  };
}

function noteWithTransfer(existing, body, actor) {
  const chunks = [clean(existing, 1800), `owner_transfer_ref=${clean(body.transfer_ref, 240)}`, `marked_by=${clean(actor?.id, 120)}`, `marked_at=${new Date().toISOString()}`].filter(Boolean);
  return chunks.join("; ").slice(0, 1900);
}

export async function applyOwnerJobAction(env = {}, body = {}, actor = {}) {
  const role = lower(actor?.role);
  if (!OWNER_ROLES.has(role)) return { ok: false, status: 403, error: "owner_or_admin_required" };
  const sessionId = clean(body?.session_id, 120);
  const action = lower(body?.action);
  const reason = clean(body?.reason, 500);
  if (!sessionId || !action) return { ok: false, status: 400, error: "session_id_and_action_required" };

  const [sessions, payments, payouts, care] = await Promise.all([
    listAll(env, SESSIONS_TABLE), listAll(env, PAYMENTS_TABLE), listAll(env, PAYOUT_EVIDENCE_TABLE), listAll(env, PRIVATE_CARE_TABLE),
  ]);
  const session = findSession(sessions, sessionId);
  if (!session?.id) return { ok: false, status: 404, error: "session_not_found" };
  const state = canonicalState(session);
  const paymentRef = clean(session?.fields?.[SESSION.paymentRef], 180);
  const payment = verifiedPayment(payments, sessionId, paymentRef);
  const openCare = openCareCases(care, sessionId);
  const payout = payoutForSession(payouts, sessionId);
  const payoutAmount = money(session?.fields?.[SESSION.modelPayout]);
  const now = new Date().toISOString();

  if (action === "hold_completion_review") {
    if (!POST_WORK_STATES.has(state)) return { ok: false, status: 409, error: "completion_hold_not_allowed_from_state", state };
    if (reason.length < 5) return { ok: false, status: 400, error: "hold_reason_required" };
    await patchRecord(env, SESSIONS_TABLE, session.id, {
      [SESSION.completionStatus]: "hold",
      [SESSION.payoutHoldReason]: reason,
      [SESSION.completionReviewedAt]: now,
    });
    if (payout?.id && lower(payout.fields?.[PAYOUT.payoutStatus]) === "payout_pending") {
      await patchRecord(env, PAYOUT_EVIDENCE_TABLE, payout.id, { [PAYOUT.payoutStatus]: "payout_under_review", [PAYOUT.notes]: `Hold: ${reason}` });
    }
    await sendCanonicalTelegramAlert(env, { event: "complaint_dispute_opened", session_id: sessionId, reference_id: sessionId, text: `MMD · Completion/Payout HOLD\nSession: ${sessionId}\nReason: ${reason}`, idempotency_key: `completion_hold:${sessionId}:${clean(body.event_id || reason, 120)}` });
    return { ok: true, status: 200, action, session_id: sessionId, state, completion_review_status: "hold", money_truth_changed: false };
  }

  if (action === "clear_completion_review") {
    if (!["separated", "under_review"].includes(state)) return { ok: false, status: 409, error: "completion_review_not_allowed_from_state", state };
    if (openCare.length) return { ok: false, status: 409, error: "open_private_care_case", count: openCare.length };
    if (!payment) return { ok: false, status: 409, error: "payment_not_verified" };
    if (!(payoutAmount > 0)) return { ok: false, status: 409, error: "payout_amount_missing" };
    const fields = {
      [SESSION.completionStatus]: "clear",
      [SESSION.completionReviewedAt]: now,
      [SESSION.payoutHoldReason]: "",
    };
    if (state === "separated") {
      fields[SESSION.canonicalState] = "under_review";
      fields[SESSION.canonicalStateUpdatedAt] = now;
    }
    await patchRecord(env, SESSIONS_TABLE, session.id, fields);
    return { ok: true, status: 200, action, session_id: sessionId, state: state === "separated" ? "under_review" : state, completion_review_status: "clear", money_truth_changed: false };
  }

  if (action === "mark_payout_ready") {
    if (state !== "under_review") return { ok: false, status: 409, error: "payout_ready_requires_under_review", state };
    const completion = completionStatus(session);
    if (!["clear", "resolved"].includes(completion)) return { ok: false, status: 409, error: "completion_review_not_clear" };
    if (openCare.length) return { ok: false, status: 409, error: "open_private_care_case", count: openCare.length };
    if (!payment) return { ok: false, status: 409, error: "payment_not_verified" };
    if (!(payoutAmount > 0)) return { ok: false, status: 409, error: "payout_amount_missing" };
    const payoutRef = `payout:${sessionId}:session_payout`;
    if (payout?.id) {
      const status = lower(payout.fields?.[PAYOUT.payoutStatus]);
      if (status === "payout_paid") return { ok: true, status: 200, action, session_id: sessionId, idempotent: true, payout_status: status };
      await patchRecord(env, PAYOUT_EVIDENCE_TABLE, payout.id, {
        [PAYOUT.payoutStatus]: "payout_pending",
        [PAYOUT.verificationStatus]: "pending",
        [PAYOUT.amount]: payoutAmount,
        [PAYOUT.linkedPaymentRef]: paymentRef || clean(payment.fields?.[PAYMENT.paymentRef], 180),
      });
    } else {
      await createRecord(env, PAYOUT_EVIDENCE_TABLE, {
        [PAYOUT.payoutRef]: payoutRef,
        [PAYOUT.sessionId]: sessionId,
        [PAYOUT.modelName]: clean(session.fields?.[SESSION.modelName], 160),
        [PAYOUT.payoutType]: "session_payout",
        [PAYOUT.amount]: payoutAmount,
        [PAYOUT.payoutStatus]: "payout_pending",
        [PAYOUT.verificationStatus]: "pending",
        [PAYOUT.linkedPaymentRef]: paymentRef || clean(payment.fields?.[PAYMENT.paymentRef], 180),
        [PAYOUT.notes]: `Ready to Pay by ${clean(actor?.id, 120) || "owner"}`,
      });
    }
    await patchRecord(env, SESSIONS_TABLE, session.id, {
      [SESSION.canonicalState]: "payout_pending",
      [SESSION.canonicalStateUpdatedAt]: now,
      [SESSION.payoutHoldReason]: "",
    });
    await sendCanonicalTelegramAlert(env, { event: "payout_ready", session_id: sessionId, reference_id: payoutRef, text: `MMD · READY TO PAY\nSession: ${sessionId}\nModel: ${clean(session.fields?.[SESSION.modelName], 160) || "—"}\nAmount: ${payoutAmount.toLocaleString("en-US")} THB`, idempotency_key: payoutRef });
    return { ok: true, status: 200, action, session_id: sessionId, state: "payout_pending", payout_ref: payoutRef, payout_status: "payout_pending", money_truth_changed: false };
  }

  if (action === "mark_payout_paid") {
    if (state !== "payout_pending") return { ok: false, status: 409, error: "payout_paid_requires_payout_pending", state };
    if (!payout?.id || lower(payout.fields?.[PAYOUT.payoutStatus]) !== "payout_pending") return { ok: false, status: 409, error: "payout_evidence_not_pending" };
    const transferRef = clean(body?.transfer_ref, 240);
    if (transferRef.length < 4) return { ok: false, status: 400, error: "transfer_ref_required" };
    if (openCare.length) return { ok: false, status: 409, error: "open_private_care_case", count: openCare.length };
    const payoutPatch = {
      [PAYOUT.payoutStatus]: "payout_paid",
      [PAYOUT.verificationStatus]: "verified",
      [PAYOUT.payoutDatetime]: now,
      [PAYOUT.verifiedBy]: clean(actor?.id, 120) || "owner",
      [PAYOUT.verifiedAt]: now,
      [PAYOUT.notes]: noteWithTransfer(payout.fields?.[PAYOUT.notes], body, actor),
    };
    if (clean(body?.payout_slip_url, 1000)) payoutPatch[PAYOUT.slipUrl] = clean(body.payout_slip_url, 1000);
    await patchRecord(env, PAYOUT_EVIDENCE_TABLE, payout.id, payoutPatch);
    await patchRecord(env, SESSIONS_TABLE, session.id, {
      [SESSION.canonicalState]: "closed",
      [SESSION.canonicalStateUpdatedAt]: now,
      [SESSION.completionStatus]: "resolved",
      [SESSION.completionReviewedAt]: now,
      [SESSION.payoutHoldReason]: "",
    });
    return { ok: true, status: 200, action, session_id: sessionId, state: "closed", payout_status: "payout_paid", money_truth_changed: false };
  }

  return { ok: false, status: 400, error: "unsupported_owner_job_action" };
}

export function augmentDashboardPayload(payload, ownerOps) {
  if (!payload || typeof payload !== "object" || !ownerOps?.ok) return payload;
  return {
    ...payload,
    counts: {
      ...(payload.counts || {}),
      completion_review: ownerOps.counts.completion_review,
      payout_ready: ownerOps.counts.payout_ready,
      confirmation_incomplete: ownerOps.counts.confirmation_incomplete,
    },
    queues: {
      ...(payload.queues || {}),
      completion_review: { count: ownerOps.counts.completion_review, href: "/internal/admin/jobs/all?ops=completion-review" },
      payout_ready: { count: ownerOps.counts.payout_ready, href: "/internal/admin/jobs/all?ops=payout" },
    },
    owner_actions: {
      authority: JOB_ORCHESTRATOR_AUTHORITY,
      href: "/internal/admin/jobs/all?ops=owner",
      items: ownerOps.items.slice(0, 20),
    },
    telegram_alerts: ownerOps.telegram,
  };
}

export function isOwnerJobActionsRequest(url, method = "GET") {
  const path = typeof url === "string" ? new URL(url, "https://mmdbkk.com").pathname : url?.pathname;
  return path === OWNER_JOB_ACTIONS_PATH && ["GET", "POST"].includes(String(method || "GET").toUpperCase());
}

export function ownerActionHttpResponse(result) {
  return json(result, Number(result?.status) || (result?.ok ? 200 : 500));
}
