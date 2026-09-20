import { buildAdminDashboard } from "./dashboard-worker.js";
import { RECOVERY_PICKER_INTELLIGENCE_VERSION, RECOVERY_QUEUE_ASSIGNMENT_VERSION, RECOVERY_QUEUE_SLA_VERSION, readRecoveryQueueIntelligence } from "./recovery-control.js";
import { readHypeObserverHealth } from "./hype-observer-health-read.js";
import { readHypeTelegramRouterHealth } from "./hype-telegram-router-health-read.js";
import { buildIncidentRootCauseDigest } from "./hype-incident-root-cause.js";

export const HYPE_OWNER_SUMMARY_PATH = "/__internal/hype/owner-summary";

export async function handleHypeOwnerSummaryRpc(request, env = {}) {
  let url;
  try { url = new URL(request.url); } catch { return json({ ok: false, error: "invalid_request" }, 400); }

  if (url.pathname !== HYPE_OWNER_SUMMARY_PATH) return json({ ok: false, error: "not_found" }, 404);
  if (url.hostname !== "admin-worker.internal") return json({ ok: false, error: "internal_only" }, 403);
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (clean(request.headers.get("x-mmd-service-binding"), 80) !== "telegram-worker") {
    return json({ ok: false, error: "internal_caller_invalid" }, 403);
  }

  try {
    const now = new Date();
    const [dashboard, recoveryQueue, observerHealth, telegramRouterHealth] = await Promise.all([
      buildAdminDashboard(env),
      readRecoveryQueueIntelligence(env, { limit: 12, domain: "all", state: "open" }, now)
        .catch(() => ({ ok: false, error: "recovery_queue_unavailable" })),
      readHypeObserverHealth(env).catch(() => ({ available: false, reason: "health_source_unavailable" })),
      readHypeTelegramRouterHealth(env).catch(() => ({ available: false, status: "unknown", summary: "Telegram Router health source unavailable" })),
    ]);
    return json(buildHypeOwnerSummaryProjection(dashboard, now, recoveryQueue, observerHealth, telegramRouterHealth), 200);
  } catch {
    return json({
      ok: false,
      error: "owner_summary_source_unavailable",
      authority: "admin-worker",
      read_only: true,
    }, 503);
  }
}

export function buildHypeOwnerSummaryProjection(dashboard = {}, now = new Date(), recoveryQueue = null, observerHealth = null, telegramRouterHealth = null) {
  const counts = dashboard?.counts || {};
  const paymentItems = safeItems(dashboard?.money, 4, projectPayment);
  const historicalItems = safeItems(dashboard?.historical_recovery, 3, projectHistorical);
  const jobItems = safeItems(dashboard?.jobs, 6, projectJob);
  const memberItems = safeItems(dashboard?.members, 4, projectMember);
  const bossItems = safeItems(dashboard?.boss, 4, projectAlert);
  const todoItems = safeItems(dashboard?.todos, 4, projectAlert);
  const reconfirm = dashboard?.reconfirm && typeof dashboard.reconfirm === "object" ? dashboard.reconfirm : {};
  const today = bangkokDate(now, 0);
  const tomorrow = bangkokDate(now, 1);
  const recovery = projectRecoveryQueueSummary(recoveryQueue);
  const observer = projectObserverHealthSummary(observerHealth);
  const telegramRouter = projectTelegramRouterSummary(telegramRouterHealth);
  const incidentDigest = buildIncidentRootCauseDigest({ observer, router: telegramRouter, recovery });

  const todayJobs = jobItems.filter((item) => item.job_date === today).slice(0, 4);
  const tomorrowJobs = jobItems.filter((item) => item.job_date === tomorrow).slice(0, 4);
  const reviewCounts = {
    payment_review: nn(counts.payment_review ?? counts.payments),
    historical_recovery: nn(counts.historical_recovery),
    membership_review: nn(counts.membership_review ?? counts.members),
    jobs_need_confirm: nn(counts.jobs_need_confirm),
    reconfirm_pending: nn(counts.reconfirm_pending ?? reconfirm.pending),
    reconfirm_overdue: nn(counts.reconfirm_overdue ?? reconfirm.overdue),
    recovery_attention: nn(recovery.attention_count),
    recovery_overdue: nn(recovery.overdue_count),
    recovery_unassigned: nn(recovery.unassigned_count),
    recovery_attention_unassigned: nn(recovery.attention_unassigned_count),
    recovery_picker_waiting_reselection: nn(recovery.picker_waiting_reselection_count),
    recovery_picker_authority_unavailable: nn(recovery.picker_authority_unavailable_count),
    recovery_picker_no_candidates: nn(recovery.picker_no_candidates_count),
    recovery_picker_watch: nn(recovery.picker_watch_count),
  };

  const affectedClients = dedupe([
    ...paymentItems.map((item) => item.client_name),
    ...historicalItems.map((item) => item.client_name),
    ...jobItems.map((item) => item.client_name),
    ...memberItems.map((item) => item.client_name),
  ]).slice(0, 8);

  const nextActions = [];
  if (incidentDigest.status === "critical" || incidentDigest.status === "warning") {
    nextActions.push(action(1, incidentDigest.primary?.owner_action?.title || "เช็ก Incident Digest", incidentDigest.primary?.owner_action?.href || "/internal/admin/control-room", incidentDigest.primary?.owner_action?.authority || "diagnostic_read_only"));
  } else if (observer.alert_required === true) {
    nextActions.push(action(1, "เช็ก Payment Observer Health", "/internal/admin/control-room", "observer_health_read_only"));
  }
  if (reviewCounts.payment_review > 0) nextActions.push(action(nextActions.length ? 2 : 1, "ตรวจ Payments", "/internal/admin/payments", "payments-worker"));
  if (reviewCounts.recovery_picker_authority_unavailable > 0) {
    nextActions.push(action(2, "ดู Picker ที่ refresh ไม่ได้", "/internal/admin/recovery?picker=authority_unavailable", "recovery_picker_interaction_metadata"));
  } else if (reviewCounts.recovery_picker_no_candidates > 0) {
    nextActions.push(action(2, "ดู Picker ที่ไม่มี Candidate", "/internal/admin/recovery?picker=no_candidates", "recovery_picker_interaction_metadata"));
  } else if (reviewCounts.recovery_picker_waiting_reselection > 0) {
    nextActions.push(action(2, "ดูเคสรอลูกค้าเลือกใหม่", "/internal/admin/recovery?picker=waiting_reselection", "recovery_picker_interaction_metadata"));
  }
  if (reviewCounts.recovery_attention_unassigned > 0) nextActions.push(action(3, "รับ Recovery ที่ยังไม่มีคนดู", "/internal/admin/recovery?assignment=unassigned", "recovery_queue_assignment_metadata"));
  else if (reviewCounts.recovery_attention > 0) nextActions.push(action(3, "ดู Recovery ที่ต้องจัดการ", "/internal/admin/recovery", "recovery_queue_operational_metadata"));
  if (reviewCounts.historical_recovery > 0) nextActions.push(action(4, "ตรวจ Historical Recovery", "/internal/admin/payments/historical-backfill", "historical-slip-backfill-runtime"));
  if (reviewCounts.jobs_need_confirm > 0 || reviewCounts.reconfirm_overdue > 0) nextActions.push(action(5, "เช็กงานและการคอนเฟิร์ม", "/internal/admin/jobs", "session-reconfirm-runtime"));
  if (reviewCounts.membership_review > 0) nextActions.push(action(6, "เช็ก Membership", "/internal/admin/member-intelligence", "canonical-members"));
  if (!nextActions.length) nextActions.push(action(1, "เปิด Owner Control Room", "/internal/admin/control-room", "read_only_observation"));

  return {
    ok: true,
    mode: "hype_owner_summary_v1",
    generated_at: clean(dashboard?.generated_at, 80) || now.toISOString(),
    bangkok_date: today,
    focus: {
      title: clean(dashboard?.focus?.title, 160) || "ยังไม่มีเรื่องด่วน",
      text: clean(dashboard?.focus?.text, 360) || "ตอนนี้ยังไม่มีรายการที่ต้องรีบทำก่อน",
    },
    counts: {
      urgent: nn(counts.urgent),
      ...reviewCounts,
      jobs: nn(counts.jobs),
      recovery_open: nn(recovery.open_count),
      recovery_attention: nn(recovery.attention_count),
      recovery_overdue: nn(recovery.overdue_count),
      recovery_watch: nn(recovery.watch_count),
      recovery_assigned: nn(recovery.assigned_count),
      recovery_unassigned: nn(recovery.unassigned_count),
      recovery_attention_unassigned: nn(recovery.attention_unassigned_count),
      recovery_picker_waiting_reselection: nn(recovery.picker_waiting_reselection_count),
      recovery_picker_authority_unavailable: nn(recovery.picker_authority_unavailable_count),
      recovery_picker_no_candidates: nn(recovery.picker_no_candidates_count),
      recovery_picker_selected: nn(recovery.picker_selected_count),
      recovery_picker_watch: nn(recovery.picker_watch_count),
    },
    review_required: {
      count: reviewCounts.payment_review
        + reviewCounts.historical_recovery
        + reviewCounts.membership_review
        + reviewCounts.jobs_need_confirm
        + reviewCounts.recovery_attention,
      payment: paymentItems,
      historical: historicalItems,
      membership: memberItems,
    },
    recovery_queue: recovery,
    what_to_watch_now: mergeRecoveryWatchItems(recovery.picker_attention, recovery.attention).slice(0, 5),
    calendar: {
      today,
      tomorrow,
      today_jobs: todayJobs,
      tomorrow_jobs: tomorrowJobs,
      tomorrow_reconfirm: {
        total: nn(reconfirm.total),
        pending: nn(reconfirm.pending),
        overdue: nn(reconfirm.overdue),
        acknowledged: nn(reconfirm.acknowledged),
      },
    },
    jobs: {
      count: nn(counts.jobs),
      need_confirm: reviewCounts.jobs_need_confirm,
      items: jobItems,
    },
    clients: {
      affected_count: affectedClients.length,
      display_names: affectedClients,
      detail_mode: "open_client_360_on_demand",
    },
    alerts: dedupeObjects([
      ...((incidentDigest.status === "critical" || incidentDigest.status === "warning") ? [{
        title: "HYPE Incident Digest",
        text: clean(incidentDigest.primary?.title, 160) + " · " + clean(incidentDigest.primary?.explanation, 260),
        href: incidentDigest.primary?.owner_action?.href || "/internal/admin/control-room",
      }] : []),
      ...(telegramRouter.status === "degraded" ? [{ title: "Telegram Router Health", text: telegramRouter.summary, href: "/internal/admin/control-room" }] : []),
      ...(observer.alert_required === true ? [{ title: "Payment Observer Health", text: observer.summary, href: "/internal/admin/control-room" }] : []),
      ...bossItems,
      ...todoItems,
    ], (item) => item.title + "|" + item.text).slice(0, 6),
    observer_health: observer,
    telegram_router_health: telegramRouter,
    incident_digest: incidentDigest,
    system: {
      admin: token(dashboard?.status?.admin),
      payments: token(dashboard?.status?.payments),
      historical_recovery: token(dashboard?.status?.historical_recovery),
      telegram: telegramRouter.status === "configured"
        ? "ready"
        : telegramRouter.status === "partial"
          ? "degraded"
          : telegramRouter.status === "degraded"
            ? "unavailable"
            : token(dashboard?.status?.telegram),
      data: token(dashboard?.status?.data),
      reconfirm: token(dashboard?.status?.reconfirm),
    },
    next_actions: nextActions.slice(0, 4),
    authority: {
      source: "admin-worker:/v1/admin/dashboard",
      payment: "payments-worker",
      entitlement: "my_mmd_entitlement_resolver_v1",
      job_calendar: "canonical_sessions_and_reconfirm",
      client_detail: "canonical_client_360_on_demand",
      recovery_queue: "recovery_workflow_metadata_only",
      recovery_sla_policy: RECOVERY_QUEUE_SLA_VERSION,
      recovery_assignment_policy: RECOVERY_QUEUE_ASSIGNMENT_VERSION,
      recovery_assignment_grants_authority: false,
      recovery_picker_policy: RECOVERY_PICKER_INTELLIGENCE_VERSION,
      recovery_picker_interaction_metadata_only: true,
      recovery_picker_manual_refresh_owner_only: true,
      recovery_picker_grants_authority: false,
      recovery_assignment_history_bounded: true,
      recovery_picker_refresh_history_bounded: true,
      telegram_router_health: "telegram-worker:internal-router-health-v1",
      telegram_router_health_operational_only: true,
      incident_digest_diagnostic_only: true,
      incident_digest_may_mutate_business_truth: false,
      read_only: true,
      owner_confirmation_required_for_mutation: true,
    },
  };
}

function projectTelegramRouterSummary(value = null) {
  if (!value || value.available !== true) {
    return {
      available: false,
      status: "unknown",
      checked_at: null,
      summary: "Telegram Router health source unavailable",
      causes: [],
      lanes: [],
      legacy_direct_senders: [],
      counts: { lanes_total: 0, configured: 0, partial: 0, unavailable: 0, legacy_direct_senders: 0 },
      transport: {},
      operational_only: true,
      business_truth_inferred: false,
    };
  }
  const counts = value.counts && typeof value.counts === "object" ? value.counts : {};
  return {
    available: true,
    status: clean(value.status, 40) || "unknown",
    checked_at: clean(value.checked_at, 80) || null,
    summary: clean(value.summary, 500) || "Telegram Router health available",
    canonical_owner: clean(value.canonical_owner, 80) || "telegram-worker",
    registry_version: clean(value.registry_version, 120) || null,
    causes: (Array.isArray(value.causes) ? value.causes : []).slice(0, 12).map((x) => clean(x, 120)).filter(Boolean),
    lanes: (Array.isArray(value.lanes) ? value.lanes : []).slice(0, 30).map((lane) => ({
      key: clean(lane?.key, 80),
      label: clean(lane?.label, 140),
      status: clean(lane?.status, 40) || "unknown",
      topic: clean(lane?.topic, 80),
      fallback: clean(lane?.fallback, 80) || null,
      migration_state: clean(lane?.migration_state, 80) || "unknown",
      shared_destination: clean(lane?.shared_destination, 80) || null,
      source_workers: (Array.isArray(lane?.source_workers) ? lane.source_workers : []).slice(0, 8).map((x) => clean(x, 80)).filter(Boolean),
      authority: clean(lane?.authority, 180),
    })),
    legacy_direct_senders: (Array.isArray(value.legacy_direct_senders) ? value.legacy_direct_senders : []).slice(0, 20).map((item) => ({
      worker: clean(item?.worker, 80),
      reason: clean(item?.reason, 240),
      migration_required: item?.migration_required === true,
    })),
    counts: {
      lanes_total: nn(counts.lanes_total),
      configured: nn(counts.configured),
      partial: nn(counts.partial),
      unavailable: nn(counts.unavailable),
      legacy_direct_senders: nn(counts.legacy_direct_senders),
    },
    transport: value.transport && typeof value.transport === "object" ? {
      bot_configured: value.transport.bot_configured === true,
      ops_chat_configured: value.transport.ops_chat_configured === true,
      webhook_secret_configured: value.transport.webhook_secret_configured === true,
      internal_auth_configured: value.transport.internal_auth_configured === true,
      live_probe_attempted: value.transport.live_probe_attempted === true,
      live_probe_ok: value.transport.live_probe_ok === true,
      webhook_canonical: value.transport.webhook_canonical === true,
      pending_update_count: nullableNonNegative(value.transport.pending_update_count),
      live_probe_reason: clean(value.transport.live_probe_reason, 120) || null,
    } : {},
    operational_only: true,
    business_truth_inferred: false,
  };
}

function projectObserverHealthSummary(value = null) {
  if (!value || value.available !== true) {
    return {
      available: false,
      status: "unknown",
      checked_at: null,
      alert_required: false,
      alert_codes: [],
      summary: "Payment Observer health source unavailable",
      operational_only: true,
      business_truth_inferred: false,
    };
  }
  return {
    available: true,
    status: clean(value.status, 40) || "unknown",
    checked_at: clean(value.checked_at, 80) || null,
    last_accepted_slip_at: clean(value.last_accepted_slip_at, 80) || null,
    accepted_last_24h: nullableNonNegative(value.accepted_last_24h),
    silence_hours: value.silence_hours === null || value.silence_hours === undefined ? null : Math.max(0, Number(value.silence_hours) || 0),
    held_open: nullableNonNegative(value.held_open),
    held_new_1h: nullableNonNegative(value.held_new_1h),
    extractor_failures_1h: nullableNonNegative(value.extractor_failures_1h),
    extractor_consecutive_failures: nullableNonNegative(value.extractor_consecutive_failures),
    outbox_retryable: nullableNonNegative(value.outbox_retryable),
    outbox_failed_terminal: nullableNonNegative(value.outbox_failed_terminal),
    membership_v4_last_seen_at: clean(value.membership_v4_last_seen_at, 80) || null,
    membership_v4_heartbeat_at: clean(value.membership_v4_heartbeat_at, 80) || null,
    membership_v4_seen_after_deploy: value.membership_v4_seen_after_deploy === true,
    alert_required: value.alert_required === true,
    alert_codes: (Array.isArray(value.alert_codes) ? value.alert_codes : []).slice(0, 10).map((x) => clean(x, 80)).filter(Boolean),
    recovery_state: clean(value.recovery_state, 40) || "none",
    summary: clean(value.summary, 1000),
    operational_only: true,
    business_truth_inferred: false,
  };
}

function projectRecoveryQueueSummary(result = null) {
  if (!result || result.ok !== true || !result.queue) {
    return {
      available: false,
      policy_version: RECOVERY_QUEUE_SLA_VERSION,
      open_count: 0,
      attention_count: 0,
      overdue_count: 0,
      watch_count: 0,
      assigned_count: 0,
      unassigned_count: 0,
      attention_unassigned_count: 0,
      picker_waiting_reselection_count: 0,
      picker_authority_unavailable_count: 0,
      picker_no_candidates_count: 0,
      picker_selected_count: 0,
      picker_watch_count: 0,
      by_domain: {},
      by_state: {},
      by_picker_state: {},
      attention: [],
      picker_attention: [],
      operational_only: true,
      business_truth_inferred: false,
    };
  }
  const queue = result.queue || {};
  return {
    available: true,
    policy_version: clean(queue.policy_version, 120) || RECOVERY_QUEUE_SLA_VERSION,
    open_count: nn(queue.open_count),
    attention_count: nn(queue.attention_count),
    overdue_count: nn(queue.overdue_count),
    watch_count: nn(queue.watch_count),
    assigned_count: nn(queue.assigned_count),
    unassigned_count: nn(queue.unassigned_count),
    attention_unassigned_count: nn(queue.attention_unassigned_count),
    picker_waiting_reselection_count: nn(queue.picker_waiting_reselection_count),
    picker_authority_unavailable_count: nn(queue.picker_authority_unavailable_count),
    picker_no_candidates_count: nn(queue.picker_no_candidates_count),
    picker_selected_count: nn(queue.picker_selected_count),
    picker_watch_count: nn(queue.picker_watch_count),
    by_domain: safeCountMap(queue.by_domain),
    by_state: safeCountMap(queue.by_state),
    by_picker_state: safeCountMap(queue.by_picker_state),
    attention: (Array.isArray(queue.attention) ? queue.attention : []).slice(0, 5).map(projectRecoveryWatchItem),
    picker_attention: (Array.isArray(queue.picker_attention) ? queue.picker_attention : []).slice(0, 5).map(projectRecoveryWatchItem),
    operational_only: true,
    business_truth_inferred: false,
  };
}

function projectRecoveryWatchItem(item = {}) {
  return {
    case_ref: clean(item.case_ref, 180),
    client_name: clean(item.client_name, 120) || "Canonical Client",
    domain: clean(item.domain, 40),
    state: clean(item.state, 40),
    sla_status: clean(item.sla_status, 40),
    since_update_minutes: nullableNonNegative(item.since_update_minutes),
    case_age_minutes: nullableNonNegative(item.case_age_minutes),
    next_attention: clean(item.next_attention, 80),
    assignment_status: clean(item.assignment_status, 40) || "unassigned",
    assigned_to: clean(item.assigned_to, 120) || null,
    assigned_lane: clean(item.assigned_lane, 40) || null,
    picker_state: clean(item.picker_state, 40) || "other",
    picker_status: clean(item.picker_status, 40) || null,
    picker_revision: nullablePositive(item.picker_revision),
    picker_candidate_count: nullableNonNegative(item.picker_candidate_count),
    picker_reissue_count: nullableNonNegative(item.picker_reissue_count),
    picker_last_stale_reason: clean(item.picker_last_stale_reason, 80) || null,
    picker_refresh_history: (Array.isArray(item.picker_refresh_history) ? item.picker_refresh_history : []).slice(-5).map(projectPickerRefreshHistoryItem),
    picker_next_attention: clean(item.picker_next_attention, 80) || null,
    href: safeInternalHref(item.href) || "/internal/admin/recovery",
  };
}

function mergeRecoveryWatchItems(primary = [], secondary = []) {
  const out = [];
  const seen = new Set();
  for (const item of [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])]) {
    const ref = clean(item?.case_ref, 180);
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    out.push(item);
  }
  return out;
}

function projectPickerRefreshHistoryItem(item = {}) {
  return {
    trigger: clean(item.trigger, 40) || null,
    result: clean(item.result, 40) || null,
    source_revision: nullablePositive(item.source_revision),
    revision: nullablePositive(item.revision),
    candidate_count: nullableNonNegative(item.candidate_count),
    reason: clean(item.reason, 80) || null,
    at: clean(item.at, 80) || null,
  };
}

function nullablePositive(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function safeCountMap(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};
  for (const [key, count] of Object.entries(input).slice(0, 12)) {
    const safeKey = clean(key, 60);
    if (!safeKey) continue;
    out[safeKey] = nn(count);
  }
  return out;
}

function nullableNonNegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function projectPayment(item = {}) {
  return {
    client_name: clean(item.title, 120) || "ลูกค้า",
    text: clean(item.text, 240),
    amount_thb: numberOrNull(item.amount),
    href: safeInternalHref(item.href) || "/internal/admin/payments",
  };
}

function projectHistorical(item = {}) {
  return {
    client_name: clean(item.client_name || item.customer_name || item.title, 120),
    text: clean(item.text || item.status || item.review_state, 240),
    amount_thb: numberOrNull(item.amount_thb),
    href: "/internal/admin/payments/historical-backfill",
  };
}

function projectJob(item = {}) {
  const title = clean(item.title, 200);
  const parts = title.split(" · ").map((part) => part.trim()).filter(Boolean);
  return {
    job_id: clean(item.id, 120),
    model_name: parts[0] || "",
    client_name: parts.slice(1).join(" · ") || "",
    status: clean(item.status, 120),
    text: clean(item.text, 240),
    job_date: clean(item.job_date, 20),
    time: clean(item.time || item.when, 120),
    href: safeInternalHref(item.href) || "/internal/admin/jobs",
  };
}

function projectMember(item = {}) {
  return {
    client_name: clean(item.title, 120) || "สมาชิก",
    text: clean(item.text, 240),
    tag: clean(item.tag, 80),
    href: safeInternalHref(item.href) || "/internal/admin/member-intelligence",
  };
}

function projectAlert(item = {}) {
  return {
    title: clean(item.title || item.tag, 160) || "ต้องดู",
    text: clean(item.text || item.summary, 300),
    href: safeInternalHref(item.href) || "/internal/admin/control-room",
  };
}

function safeItems(value, limit, projector) {
  return (Array.isArray(value) ? value : []).slice(0, limit).map(projector);
}

function action(priority, label, href, authority) {
  return { priority, label, href, authority, execution_mode: "handoff_only" };
}

function safeInternalHref(value) {
  const href = clean(value, 500);
  if (!/^\/(?:internal|sigil)\//.test(href) || href.startsWith("//")) return "";
  return href;
}

function dedupe(values) {
  return [...new Set(values.map((value) => clean(value, 160)).filter(Boolean))];
}

function dedupeObjects(values, keyer) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyer(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function bangkokDate(now, offsetDays) {
  const base = new Date(now.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

function numberOrNull(value) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nn(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function token(value) {
  const text = clean(value, 120).toLowerCase();
  if (!text) return "unknown";
  if (/(พร้อม|ready|ok|healthy|active)/i.test(text)) return "ready";
  if (/(partial|บางส่วน|degraded|waiting|ยัง)/i.test(text)) return "degraded";
  if (/(error|fail|down|unavailable|missing|blocked)/i.test(text)) return "unavailable";
  return text.slice(0, 60);
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-hype-owner-summary": "read-only-v1",
    },
  });
}
