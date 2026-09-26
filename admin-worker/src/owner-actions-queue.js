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
  hype_entitlement_notification_overdue: 49,
  hype_recovery_unassigned_overdue: 48,
  hype_coupon_manual_review_overdue: 47,
  hype_telegram_bind_overdue: 46,
  hype_operational_watch: 45,
  owner_exception: 40,
});

const OWNER_WORKLOAD_SLO = Object.freeze({
  urgent_review_target_minutes: 240,
  attention_review_target_minutes: 1440,
  breached_carry_over_target: 0,
  timezone: "Asia/Bangkok",
});

const SOURCE_BREACHED_ACTIONS = new Set([
  "job_reconfirm_overdue",
  "hype_entitlement_notification_overdue",
  "hype_recovery_unassigned_overdue",
  "hype_coupon_manual_review_overdue",
  "hype_telegram_bind_overdue",
  "hype_operational_watch",
]);

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
    membershipReviewAction(input.members),
    ...hypeOverdueCohortActions(input.hype),
    ownerExceptionAction(input.boss),
  ]
    .filter(Boolean)
    .map(applyWorkloadSlo)
    .sort((a, b) => b.priority - a.priority || a.action_key.localeCompare(b.action_key));

  const unavailable = normalizeUnavailable(input.unavailable_sources);
  const coverage = normalizeCoverage(input.source_coverage, unavailable);
  const queueHealth = buildQueueHealth({ actions, hype: input.hype, unavailable, sourceCoverage: coverage });
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
    source_coverage: coverage,
    queue_health: queueHealth,
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
      workload_slo_projection_only: true,
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
    href: "/internal/admin/jobs/all?ops=confirm",
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
  const count = nonNegative(source?.exception_prebooking_count);
  return count ? action({
    key: "mms_prebooking_coordination",
    priority: PRIORITY.mms_prebooking_coordination,
    urgency: "attention",
    title: "ประสาน MMS ที่ติดค้าง",
    summary: `มี ${count} prebooking อยู่สถานะ Pending Coordination ที่ต้องแทรกแซง`,
    count,
    href: "/internal/admin/mms",
    authority: "mms-worker",
  }) : null;
}

const HYPE_OVERDUE_COHORTS = Object.freeze([
  Object.freeze({
    kind: "entitlement_notification_incomplete",
    key: "hype_entitlement_notification_overdue",
    priority: PRIORITY.hype_entitlement_notification_overdue,
    title: "ตรวจ Entitlement Telegram sync failure",
    href: "/internal/admin/member-intelligence",
    authority: "my_mmd_entitlement_resolver_v1",
  }),
  Object.freeze({
    kind: "recovery_unassigned",
    key: "hype_recovery_unassigned_overdue",
    priority: PRIORITY.hype_recovery_unassigned_overdue,
    title: "รับ Recovery ที่เลยเวลาและยังไม่มีคนดู",
    href: "/internal/admin/recovery?assignment=unassigned",
    authority: "recovery_queue_operational_metadata",
  }),
  Object.freeze({
    kind: "coupon_manual_review",
    key: "hype_coupon_manual_review_overdue",
    priority: PRIORITY.hype_coupon_manual_review_overdue,
    title: "ตรวจ Coupon manual review ที่เลยเวลา",
    href: "/internal/admin/member-intelligence",
    authority: "care_back_claim_policy",
  }),
  Object.freeze({
    kind: "telegram_bind_unconsumed",
    key: "hype_telegram_bind_overdue",
    priority: PRIORITY.hype_telegram_bind_overdue,
    title: "ตรวจ Telegram bind anomaly",
    href: "/internal/admin/control-room",
    authority: "telegram_identity_bind_authority",
  }),
]);

function hypeOverdueCohortActions(source) {
  const counts = source?.counts?.owner_actionable_by_kind;
  const byKind = counts && typeof counts === "object" && !Array.isArray(counts) ? counts : {};
  const actions = HYPE_OVERDUE_COHORTS.map((cohort) => {
    const count = nonNegative(byKind[cohort.kind]);
    return count ? action({
      key: cohort.key,
      priority: cohort.priority,
      urgency: "urgent",
      title: cohort.title,
      summary: `มี ${count} รายการเลย SLA จาก ${cohort.kind}`,
      count,
      href: cohort.href,
      authority: cohort.authority,
    }) : null;
  }).filter(Boolean);

  const knownCount = HYPE_OVERDUE_COHORTS.reduce((sum, cohort) => sum + nonNegative(byKind[cohort.kind]), 0);
  const total = nonNegative(source?.counts?.owner_actionable_overdue);
  const unknownCount = Math.max(0, total - knownCount);
  if (unknownCount) {
    actions.push(action({
      key: "hype_operational_watch",
      priority: PRIORITY.hype_operational_watch,
      urgency: "urgent",
      title: "ตรวจ HYPE overdue exception ชนิดใหม่",
      summary: `มี ${unknownCount} จุดที่เลย SLA แต่ยังไม่มี cohort contract เฉพาะ`,
      count: unknownCount,
      href: "/internal/admin/control-room",
      authority: "hype_coordinator_read_only",
    }));
  }

  return actions;
}

function buildQueueHealth({ actions, hype, unavailable, sourceCoverage }) {
  const byKind = hype?.counts?.owner_actionable_by_kind;
  const ownerActionableByKind = byKind && typeof byKind === "object" && !Array.isArray(byKind) ? byKind : {};
  const knownHypeOverdue = HYPE_OVERDUE_COHORTS.reduce(
    (sum, cohort) => sum + nonNegative(ownerActionableByKind[cohort.kind]),
    0,
  );
  const totalHypeOverdue = nonNegative(hype?.counts?.owner_actionable_overdue);
  const unknownHypeOverdue = Math.max(0, totalHypeOverdue - knownHypeOverdue);
  const staleTerminalRecords = nonNegative(hype?.counts?.stale_terminal_records);
  const nonActionableRecords = nonNegative(hype?.counts?.non_actionable_records);
  const coverage = asArray(sourceCoverage);
  const routineSourceRecords = coverage.reduce((sum, item) => sum + nonNegative(item?.routine_count), 0);
  const mmsBauReady = coverage.some((item) => clean(item?.source) === "mms" && clean(item?.operating_model) === "bau_exception_only_v1");

  return {
    schema: "mmd_owner_actions_queue_health_v1",
    operating_model: "bau_exception_only_v1",
    action_classes: asArray(actions).length,
    active_owner_decisions: asArray(actions).reduce((sum, item) => sum + nonNegative(item?.count), 0),
    routine_source_records: routineSourceRecords,
    unknown_hype_overdue: unknownHypeOverdue,
    stale_terminal_records: staleTerminalRecords,
    stale_terminal_by_kind: normalizeDiagnosticCounts(hype?.stale_terminal_by_kind, [
      "coupon_manual_review_terminal",
      "telegram_bind_expired_pending",
    ]),
    non_actionable_records: nonActionableRecords,
    non_actionable_by_kind: normalizeDiagnosticCounts(hype?.non_actionable_by_kind, [
      "entitlement_pending_invite_expected",
      "entitlement_removal_due_expected",
    ]),
    unavailable_sources: asArray(unavailable).length,
    classification_complete: unknownHypeOverdue === 0,
    source_coverage_complete: asArray(unavailable).length === 0,
    phase_5_closure_ready: unknownHypeOverdue === 0 && asArray(unavailable).length === 0,
    phase_6_bau_ready: unknownHypeOverdue === 0 && asArray(unavailable).length === 0 && mmsBauReady,
    workload_slo: buildWorkloadSlo({ actions, unavailable, unknownHypeOverdue }),
    phase_6b_slo_ready: unknownHypeOverdue === 0 && asArray(unavailable).length === 0 && mmsBauReady,
    business_truth_mutated: false,
  };
}

function normalizeDiagnosticCounts(value, allowedKeys = []) {
  const allowed = new Set(asArray(allowedKeys).map((key) => clean(key)).filter(Boolean));
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => allowed.has(clean(key)))
      .map(([key, count]) => [clean(key), nonNegative(count)])
      .filter(([, count]) => count > 0),
  );
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
    href: "/internal/admin/jobs/all",
    authority: "owner_review",
  }) : null;
}

function applyWorkloadSlo(item) {
  const key = clean(item?.action_key);
  const urgency = clean(item?.urgency);
  const sourceBreached = SOURCE_BREACHED_ACTIONS.has(key) ||
    (key === "availability_exception_review" && urgency === "urgent");
  const targetMinutes = urgency === "urgent"
    ? OWNER_WORKLOAD_SLO.urgent_review_target_minutes
    : OWNER_WORKLOAD_SLO.attention_review_target_minutes;
  const state = sourceBreached
    ? "breached"
    : urgency === "urgent"
      ? "due_now"
      : "due_today";

  return {
    ...item,
    slo: {
      schema: "mmd_owner_action_slo_v1",
      state,
      target_minutes: targetMinutes,
      source_breached: sourceBreached,
    },
  };
}

function buildWorkloadSlo({ actions, unavailable, unknownHypeOverdue }) {
  const list = asArray(actions);
  const decisions = (state) => list
    .filter((item) => clean(item?.slo?.state) === state)
    .reduce((sum, item) => sum + nonNegative(item?.count), 0);
  const classes = (state) => list.filter((item) => clean(item?.slo?.state) === state).length;

  const breachedDecisions = decisions("breached");
  const dueNowDecisions = decisions("due_now");
  const dueTodayDecisions = decisions("due_today");
  const sourceAttention = asArray(unavailable).length > 0 || nonNegative(unknownHypeOverdue) > 0;
  const state = sourceAttention
    ? "source_attention"
    : breachedDecisions > 0
      ? "breached"
      : dueNowDecisions > 0
        ? "due_now"
        : dueTodayDecisions > 0
          ? "due_today"
          : "clear";

  return {
    schema: "mmd_owner_workload_slo_v1",
    timezone: OWNER_WORKLOAD_SLO.timezone,
    state,
    active_decisions: list.reduce((sum, item) => sum + nonNegative(item?.count), 0),
    breached_decisions: breachedDecisions,
    breached_classes: classes("breached"),
    due_now_decisions: dueNowDecisions,
    due_now_classes: classes("due_now"),
    due_today_decisions: dueTodayDecisions,
    due_today_classes: classes("due_today"),
    urgent_review_target_minutes: OWNER_WORKLOAD_SLO.urgent_review_target_minutes,
    attention_review_target_minutes: OWNER_WORKLOAD_SLO.attention_review_target_minutes,
    breached_carry_over_target: OWNER_WORKLOAD_SLO.breached_carry_over_target,
    burn_down_remaining: list.reduce((sum, item) => sum + nonNegative(item?.count), 0),
    burn_down_target: 0,
    slo_met: !sourceAttention && breachedDecisions === OWNER_WORKLOAD_SLO.breached_carry_over_target,
    projection_only: true,
  };
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
      routine_count: nonNegative(item?.routine_count),
      operating_model: clean(item?.operating_model),
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
