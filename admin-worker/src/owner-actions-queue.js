// Phase 4A — Owner Actions Queue Contract
// Read-only projection. It does not create, update, approve, send, or reconcile anything.

const PRIORITY = Object.freeze({
  payment_review: 100,
  historical_recovery: 90,
  finance_reconciliation: 85,
  job_reconfirm_overdue: 80,
  availability_exception_review: 78,
  finance_payout_hold: 75,
  job_reconfirm_pending: 70,
  mms_prebooking_coordination: 65,
  mms_application_review: 60,
  membership_review: 50,
  hype_operational_watch: 45,
  owner_exception: 40,
});

export function buildOwnerActionsQueue(input = {}) {
  const now = input.now instanceof Date ? input.now : new Date(input.now || Date.now());
  const actions = [
    paymentReviewAction(input.money),
    historicalRecoveryAction(input.historical_recovery),
    financeReconciliationAction(input.finance_audit),
    reconfirmAction(input.reconfirm, "overdue"),
    availabilityExceptionAction(input.availability),
    financePayoutHoldAction(input.finance_audit),
    reconfirmAction(input.reconfirm, "pending"),
    mmsPrebookingCoordinationAction(input.mms),
    mmsApplicationReviewAction(input.mms),
    membershipReviewAction(input.members),
    hypeOperationalWatchAction(input.hype),
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
    source_coverage: normalizeCoverage(input.source_coverage, unavailable),
    guardrails: {
      payment_truth: "payments-worker",
      job_truth: "canonical_sessions_and_reconfirm",
      membership_truth: "my_mmd_entitlement_resolver_v1",
      finance_truth: "partner_finance_audit",
      availability_truth: "sigil_availability_snapshot_v1",
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

function financeReconciliationAction(source) {
  const count = nonNegative(source?.reconciliation_count);
  return count ? action({
    key: "finance_reconciliation",
    priority: PRIORITY.finance_reconciliation,
    urgency: "attention",
    title: "ตรวจความสอดคล้องทางการเงิน",
    summary: `มี ${count} รายการที่ Finance Audit ระบุว่าต้องตรวจ`,
    count,
    href: "/internal/admin/partners",
    authority: "canonical_finance_timeline",
  }) : null;
}

function availabilityExceptionAction(source) {
  if (!source || source.available !== true) return null;
  const health = source.coverage_health && typeof source.coverage_health === "object" ? source.coverage_health : {};
  const reviewStatus = clean(health.review_status);
  const sourceUnavailable = nonNegative(health.source_unavailable_models);
  const followUpDue = nonNegative(health.follow_up_due);

  // Initial identity/LINE onboarding remains visible in Calendar's Adoption
  // recovery queue. Control Room daily operations surfaces only source failures
  // or an explicit follow-up that has crossed its 24h SLA.
  const sourceAttention = reviewStatus === "source_attention";
  if (!sourceAttention && followUpDue === 0) return null;

  const count = sourceAttention ? Math.max(1, sourceUnavailable) : followUpDue;
  return action({
    key: "availability_exception_review",
    priority: PRIORITY.availability_exception_review,
    urgency: sourceAttention ? "attention" : "urgent",
    title: sourceAttention ? "ตรวจ Availability source" : "ติดตาม Availability ที่เลยเวลา",
    summary: sourceAttention
      ? `มี ${count} จุดที่ source ของ Availability ยังอ่านไม่ครบ`
      : `มี ${count} นายแบบถึงเวลาตามผลหลัง reminder`,
    count,
    href: "/internal/admin/calendar",
    authority: "sigil_availability_snapshot_v1",
  });
}

function financePayoutHoldAction(source) {
  const count = nonNegative(source?.payout_hold_count);
  return count ? action({
    key: "finance_payout_hold",
    priority: PRIORITY.finance_payout_hold,
    urgency: "attention",
    title: "ตรวจรายการพักจ่าย",
    summary: `มี ${count} รายการที่ Finance Audit ระบุว่าอยู่ระหว่างพักจ่าย`,
    count,
    href: "/internal/admin/partners",
    authority: "canonical_finance_timeline",
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

function mmsPrebookingCoordinationAction(source) {
  const count = nonNegative(source?.prebooking_coordination_count);
  return count ? action({
    key: "mms_prebooking_coordination",
    priority: PRIORITY.mms_prebooking_coordination,
    urgency: "attention",
    title: "ประสาน MMS prebooking",
    summary: `มี ${count} prebooking ที่ MMS ยังอยู่ระหว่างประสานงาน`,
    count,
    href: "/internal/admin/mms",
    authority: "mms-worker",
  }) : null;
}

function mmsApplicationReviewAction(source) {
  const count = nonNegative(source?.application_review_count);
  return count ? action({
    key: "mms_application_review",
    priority: PRIORITY.mms_application_review,
    urgency: "attention",
    title: "ตรวจใบสมัคร MMS",
    summary: `มี ${count} ใบสมัครที่ MMS รอการตรวจ`,
    count,
    href: "/internal/admin/mms",
    authority: "mms-worker",
  }) : null;
}

function hypeOperationalWatchAction(source) {
  const count = nonNegative(source?.counts?.total);
  return count ? action({
    key: "hype_operational_watch",
    priority: PRIORITY.hype_operational_watch,
    urgency: source?.counts?.overdue > 0 ? "urgent" : "attention",
    title: "ตรวจ HYPE operational watch",
    summary: `มี ${count} จุดที่ HYPE พบว่าต้องดูจาก authority ต้นทาง`,
    count,
    href: "/internal/admin/control-room",
    authority: "hype_coordinator_read_only",
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
    detail_href: `/v1/admin/dashboard/owner-actions?action_key=${encodeURIComponent(input.key)}`,
    authority: input.authority,
    review_required: true,
    send_allowed: false,
    mutation_allowed: false,
  };
}

function normalizeUnavailable(value) {
  const allowed = new Set(["finance_audit", "mms", "hype", "availability"]);
  return asArray(value).map(clean).filter((item) => allowed.has(item));
}

function normalizeCoverage(value, unavailable) {
  const allowed = new Set(["finance_audit", "mms", "hype", "availability"]);
  const seen = new Set();
  return asArray(value).map((item) => {
    const source = clean(item?.source);
    if (!allowed.has(source) || seen.has(source)) return null;
    seen.add(source);
    const state = ["connected", "partial", "unavailable"].includes(clean(item?.state)) ? clean(item.state) : "unavailable";
    return {
      source,
      label: clean(item?.label) || source,
      state: unavailable.includes(source) && state === "connected" ? "partial" : state,
      authority: clean(item?.authority) || "read_only_authority",
      href: clean(item?.href).startsWith("/internal/") ? clean(item.href) : "/internal/admin/control-room",
      action_count: nonNegative(item?.action_count),
      read_only: true,
    };
  }).filter(Boolean);
}

function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
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
