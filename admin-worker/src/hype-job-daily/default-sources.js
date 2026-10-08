// Wires the digest to existing read-only admin-worker sources.
import { handlePaymentReviewRequest } from "../payment-review-runtime.js";
import { readRecoveryQueueIntelligence } from "../recovery-control.js";
import { clean } from "./util.js";
import { collectModels, collectPayments, collectRefundPacks, collectSessions } from "./sources.js";

// Proofs awaiting review, from the canonical Payment Review queue (read-only GET).
export async function collectPaymentReview(env = {}) {
  try {
    const response = await handlePaymentReviewRequest(
      new Request("https://admin.internal/v1/admin/payments/review-queue?limit=100&include_context=1"),
      env,
      { id: "hype_job_daily", role: "admin" },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) {
      return { ok: false, error: "payment_review_read_failed", detail: `http_${response.status}` };
    }
    return {
      ok: true,
      items: payload.items.filter((item) => item?.reviewable === true).map((item) => ({
        proof_id: clean(item.proof_id, 120),
        payment_ref: clean(item.payment_ref, 180),
        session_id: clean(item.session_id, 120),
        created_at: clean(item.created_at, 60),
        customer_name: clean(item.customer_name || item.payer_name, 120),
        evidence_amount_thb: Number.isFinite(Number(item.evidence_amount_thb)) ? Number(item.evidence_amount_thb) : null,
      })),
    };
  } catch (error) {
    return { ok: false, error: "payment_review_read_failed", detail: clean(error?.message, 80) };
  }
}

// Open recovery cases, read live from the canonical recovery store on every run.
export async function collectRecovery(env = {}, now = Date.now()) {
  try {
    const result = await readRecoveryQueueIntelligence(env, { limit: 25, domain: "all", state: "open" }, new Date(now));
    if (!result || result.ok !== true || !result.queue) {
      return { ok: false, error: "recovery_read_failed", detail: clean(result?.error, 80) };
    }
    const queue = result.queue;
    const seen = new Set();
    const items = [];
    for (const item of [...(queue.attention || []), ...(queue.picker_attention || [])]) {
      const ref = clean(item?.case_ref, 180);
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      items.push({
        case_ref: ref,
        client_name: clean(item.client_name, 120),
        domain: clean(item.domain, 40),
        state: clean(item.state, 40),
        sla_status: clean(item.sla_status, 40),
        picker_state: clean(item.picker_state, 40),
      });
    }
    return { ok: true, items, attention_count: Number(queue.attention_count) || 0 };
  } catch (error) {
    return { ok: false, error: "recovery_read_failed", detail: clean(error?.message, 80) };
  }
}

export const defaultSources = Object.freeze({
  sessions: (env, now) => collectSessions(env, now),
  payments: (env, sessionIds) => collectPayments(env, sessionIds),
  review: (env) => collectPaymentReview(env),
  recovery: (env, now) => collectRecovery(env, now),
  models: (env, modelIds) => collectModels(env, modelIds),
  refunds: (env) => collectRefundPacks(env),
});

// Runs all collectors. Sessions must finish before payments and models (they need session / model ids).
// `models` and `refunds` are optional sources: when a caller does not provide them they are reported as
// undefined ("not collected"), which the builder treats as "not checked", never as "failed" or "clear".
export async function collectAll(env, now, sources = defaultSources) {
  const guard = async (fn, code) => {
    try {
      return await fn();
    } catch (error) {
      return { ok: false, error: code, detail: clean(error?.message, 80) };
    }
  };
  const sessionsPromise = guard(() => sources.sessions(env, now), "sessions_read_failed");
  const reviewPromise = guard(() => sources.review(env), "payment_review_read_failed");
  const recoveryPromise = guard(() => sources.recovery(env, now), "recovery_read_failed");
  const refundsPromise = typeof sources.refunds === "function" ? guard(() => sources.refunds(env, now), "refund_read_failed") : Promise.resolve(undefined);
  const sessions = await sessionsPromise;
  const ids = sessions?.ok ? (sessions.records || []).map((r) => r.session_id).filter(Boolean) : [];
  const modelIds = sessions?.ok ? (sessions.records || []).map((r) => (r.model_ref?.status === "one" ? r.model_ref.id : "")).filter(Boolean) : [];
  const payments = sessions?.ok
    ? await guard(() => sources.payments(env, ids), "payments_read_failed")
    : { ok: false, error: "payments_skipped_sessions_unavailable" };
  const models = typeof sources.models !== "function" ? undefined
    : sessions?.ok ? await guard(() => sources.models(env, modelIds), "models_read_failed")
    : { ok: false, error: "models_skipped_sessions_unavailable" };
  const [review, recovery, refunds] = await Promise.all([reviewPromise, recoveryPromise, refundsPromise]);
  return { sessions, payments, review, recovery, models, refunds };
}
