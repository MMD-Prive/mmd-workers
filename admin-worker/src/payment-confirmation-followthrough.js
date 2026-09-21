import { readPaymentNotification } from "../../shared/payment-notification-outbox.mjs";
import { retryExistingApprovedJobLinks } from "./payment-approved-job-link-dispatch.js";

const text = value => String(value ?? "").trim().slice(0, 180);
const code = value => text(value).toLowerCase();
const formula = value => text(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const ack = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const closed = value => ["cancelled", "canceled", "rejected", "void", "failed", "refunded"].includes(code(value));

// This route can only revisit an existing Official Verify delivery event.
// It cannot create an approval, a link, an outbox event, or a payment write.
export async function paymentConfirmationFollowthrough(env, input, { list, paymentsTable, sessionsTable, retry = false, actor } = {}) {
  if (retry && !["owner", "admin"].includes(code(actor?.role))) fail(403, "confirmation_retry_requires_owner_admin");
  const context = { session_id: text(input.session_id), payment_ref: text(input.payment_ref), payment_stage: code(input.payment_stage) };
  if (!context.session_id || !context.payment_ref || !["deposit", "full"].includes(context.payment_stage)) fail(400, "initial_job_payment_required");
  const payments = await list(paymentsTable, { filterByFormula: `{Payment Reference}='${formula(context.payment_ref)}'`, maxRecords: 2 });
  if (payments.length !== 1) fail(409, "canonical_payment_missing_or_ambiguous");
  const p = payments[0].fields || {};
  if (text(p.session_id) !== context.session_id || code(p.payment_stage || p.payment_type) !== context.payment_stage) fail(409, "confirmation_payment_context_mismatch");
  if (code(p["Payment Status"]) !== "paid") fail(409, "confirmation_requires_paid_payment");
  const sessions = await list(sessionsTable, { filterByFormula: `{session_id}='${formula(context.session_id)}'`, maxRecords: 2, returnFieldsByFieldId: true });
  if (sessions.length !== 1) fail(409, "canonical_session_missing_or_ambiguous");
  const s = sessions[0].fields || {};
  if (closed(s.fldmwuvOaiCFdzzRa)) fail(409, "session_cancelled");
  const client = s.fld6P6if0vDZCeV0C || [], payer = p.Client || [];
  if (client.length > 1 || payer.length > 1 || client.length && payer.length && client[0] !== payer[0]) fail(409, "confirmation_client_mismatch");
  const lookup = { bucket: env.LINE_SLIP_EVIDENCE, lane: "approved-job-links", eventKey: `${context.session_id}:${context.payment_stage}` };
  let record = await readPaymentNotification(lookup);
  if (record && Object.entries(context).some(([key, value]) => record.payload?.[key] !== value)) fail(409, "notification_context_mismatch");
  if (retry) {
    if (!record) fail(409, "notification_not_found");
    await retryExistingApprovedJobLinks(env, context);
    record = await readPaymentNotification(lookup);
  }
  const result = record?.result || {};
  const retryable = !!record && ["pending", "delivering"].includes(record.status)
    && Date.now() - record.created_at < 23 * 3600000 && record.attempts < 12;
  // Explicit allowlist: no signed URLs, tokens, identities, payload or raw errors.
  const delivery = {};
  for (const key of ["dispatched", "customer_line_sent", "customer_telegram_sent", "model_line_sent", "model_telegram_sent", "manual_delivery_required"]) delivery[key] = result[key] === true;
  return {
    ok: true, ...context, money_truth_changed: false,
    confirmation: {
      delivery_status: record?.status || "not_recorded", ...delivery,
      retry_available: retryable, retry_queued: retryable,
      next_attempt_at: retryable && record.next_attempt_at ? new Date(record.next_attempt_at).toISOString() : null,
      updated_at: record?.updated_at ? new Date(record.updated_at).toISOString() : null,
      customer_acknowledged_at: ack(s.fldJSS5GNN7quJwa8), model_acknowledged_at: ack(s.fldFgkHXivIAThfDz),
    },
  };
}
