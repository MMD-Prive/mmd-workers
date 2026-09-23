// Phase 4A — Owner Actions Queue Contract
// Read-only projection. It does not create, update, approve, send, or reconcile anything.

const PRIORITY = Object.freeze({
  payment_review: 100,
  historical_recovery: 90,
  job_reconfirm_overdue: 80,
  job_reconfirm_pending: 70,
  membership_review: 50,
  owner_exception: 40,
});

export function buildOwnerActionsQueue(input = {}) {
  const now = input.now instanceof Date ? input.now : new Date(input.now || Date.now());
  const actions = [
    paymentReviewAction(input.money),
    historicalRecoveryAction(input.historical_recovery),
    reconfirmAction(input.reconfirm, "overdue"),
    reconfirmAction(input.reconfirm, "pending"),
    membershipReviewAction(input.members),
    ownerExceptionAction(input.boss),
  ].filter(Boolean).sort((a, b) => b.priority - a.priority || a.action_key.localeCompare(b.action_key));

  const unavailable = normalizeUnavailable(input.unavailable_sources);
  return {
    ok: true,
    contract: "mmd_owner_actions_queue_v1",
    mode: "owner_review_only",
    generated_at: now.toISOString(),
    send_allowed: false,
    mutation_allowed: false,
    actions,
    counts: {
      total: actions.length,
      urgent: actions.filter((item) => item.urgency === "urgent").length,
      attention: actions.filter((item) => item.urgency === "attention").length,
    },
    unavailable_sources: unavailable,
    guardrails: {
      payment_truth: "payments-worker",
      job_truth: "canonical_sessions_and_reconfirm",
      membership_truth: "my_mmd_entitlement_resolver_v1",
      finance_truth: "partner_finance_audit",
      dedupe: "one_action_per_decision_class; source records remain in their owning surface",
      no_auto_send: true,
      no_business_truth_mutation: true,
      no_raw_notes_or_payment_refs: true,
      no_pii_in_projection: true,
    },
  };
}

function paymentReviewAction(items) {
  const count = uniqueCount(items, (item) => clean(item?.proof_id) || clean(item?.payment_ref) || signature(item));
  return count ? action({
    key: "payment_review",
    priority: PRIORITY.payment_review,
    urgency: "urgent",
    title: "ตรวจการชำระเงิน",
    summary: `มี ${count} รายการรอการตรวจจาก Payments`,
    count,
    href: "/internal/admin/payments",
    authority: "payments-worker",
  }) : null;
}

function historicalRecoveryAction(items) {
  const count = uniqueCount(items, (item) => clean(item?.proof_id) || clean(item?.source_ref) || signature(item));
  return count ? action({
    key: "historical_recovery",
    priority: PRIORITY.historical_recovery,
    urgency: "attention",
    title: "ตรวจหลักฐานย้อนหลัง",
    summary: `มี ${count} รายการที่ต้องจับคู่หลักฐานก่อนสรุป`,
    count,
    href: "/internal/admin/payments/historical-backfill",
    authority: "historical-slip-backfill-runtime",
  }) : null;
}

function reconfirmAction(reconfirm, status) {
  if (!reconfirm || reconfirm.available !== true) return null;
  const count = uniqueCount(asArray(reconfirm.items).filter((item) => clean(item?.status) === status), (item) => clean(item?.session_id) || clean(item?.job_id) || signature(item));
  if (!count) return null;
  const overdue = status === "overdue";
  return action({
    key: overdue ? "job_reconfirm_overdue" : "job_reconfirm_pending",
    priority: overdue ? PRIORITY.job_reconfirm_overdue : PRIORITY.job_reconfirm_pending,
    urgency: overdue ? "urgent" : "attention",
    title: overdue ? "ยืนยันงานที่เลยเวลา" : "ยืนยันงานก่อนเริ่ม",
    summary: overdue ? `มี ${count} งานที่เลยเวลายืนยันแล้ว` : `มี ${count} งานที่ถึงเวลายืนยัน`,
    count,
    href: "/internal/admin/jobs",
    authority: "canonical_sessions_and_reconfirm",
  });
}

function membershipReviewAction(items) {
  const count = uniqueCount(items, (item) => clean(item?.id) || signature(item));
  return count ? action({
    key: "membership_review",
    priority: PRIORITY.membership_review,
    urgency: "attention",
    title: "ตรวจสถานะสมาชิก",
    summary: `มี ${count} สถานะสมาชิกที่ต้องตรวจจาก resolver`,
    count,
    href: "/internal/admin/member-intelligence",
    authority: "my_mmd_entitlement_resolver_v1",
  }) : null;
}

function ownerExceptionAction(items) {
  const count = uniqueCount(items, (item) => clean(item?.id) || clean(item?.href) || signature(item));
  return count ? action({
    key: "owner_exception",
    priority: PRIORITY.owner_exception,
    urgency: "attention",
    title: "เรื่องที่ต้องให้เปอร์ดู",
    summary: `มี ${count} exception ที่ระบบไม่ควรตัดสินใจแทน`,
    count,
    href: "/internal/admin/control-room",
    authority: "owner_review",
  }) : null;
}

function action(input) {
  return {
    action_key: input.key,
    priority: input.priority,
    urgency: input.urgency,
    title: input.title,
    summary: input.summary,
    count: input.count,
    href: input.href,
    authority: input.authority,
    review_required: true,
    send_allowed: false,
    mutation_allowed: false,
  };
}

function normalizeUnavailable(value) {
  const allowed = new Set(["finance_audit", "mms", "hype"]);
  return asArray(value).map(clean).filter((item) => allowed.has(item));
}

function uniqueCount(items, keyFor) {
  const seen = new Set();
  for (const item of asArray(items)) {
    const key = clean(keyFor(item));
    if (key) seen.add(key);
  }
  return seen.size;
}

function signature(item) {
  return JSON.stringify({
    state: clean(item?.status || item?.review_state),
    href: clean(item?.href),
    tag: clean(item?.tag),
  });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value ?? "").trim().slice(0, 240);
}
