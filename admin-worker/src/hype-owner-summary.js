import { buildAdminDashboard } from "./dashboard-worker.js";
import { RECOVERY_QUEUE_SLA_VERSION, readRecoveryQueueIntelligence } from "./recovery-control.js";

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
    const [dashboard, recoveryQueue] = await Promise.all([
      buildAdminDashboard(env),
      readRecoveryQueueIntelligence(env, { limit: 12, domain: "all", state: "open" }, now)
        .catch(() => ({ ok: false, error: "recovery_queue_unavailable" })),
    ]);
    return json(buildHypeOwnerSummaryProjection(dashboard, now, recoveryQueue), 200);
  } catch {
    return json({
      ok: false,
      error: "owner_summary_source_unavailable",
      authority: "admin-worker",
      read_only: true,
    }, 503);
  }
}

export function buildHypeOwnerSummaryProjection(dashboard = {}, now = new Date(), recoveryQueue = null) {
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
  };

  const affectedClients = dedupe([
    ...paymentItems.map((item) => item.client_name),
    ...historicalItems.map((item) => item.client_name),
    ...jobItems.map((item) => item.client_name),
    ...memberItems.map((item) => item.client_name),
  ]).slice(0, 8);

  const nextActions = [];
  if (reviewCounts.payment_review > 0) nextActions.push(action(1, "ตรวจ Payments", "/internal/admin/payments", "payments-worker"));
  if (reviewCounts.recovery_attention > 0) nextActions.push(action(2, "ดู Recovery ที่ต้องจัดการ", "/internal/admin/recovery", "recovery_queue_operational_metadata"));
  if (reviewCounts.historical_recovery > 0) nextActions.push(action(3, "ตรวจ Historical Recovery", "/internal/admin/payments/historical-backfill", "historical-slip-backfill-runtime"));
  if (reviewCounts.jobs_need_confirm > 0 || reviewCounts.reconfirm_overdue > 0) nextActions.push(action(4, "เช็กงานและการคอนเฟิร์ม", "/internal/admin/jobs", "session-reconfirm-runtime"));
  if (reviewCounts.membership_review > 0) nextActions.push(action(5, "เช็ก Membership", "/internal/admin/member-intelligence", "canonical-members"));
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
    },
    review_required: {
      count: reviewCounts.payment_review
        + reviewCounts.historical_recovery
        + reviewCounts.membership_review
        + reviewCounts.jobs_need_confirm,
      payment: paymentItems,
      historical: historicalItems,
      membership: memberItems,
    },
    recovery_queue: recovery,
    what_to_watch_now: recovery.attention.slice(0, 5),
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
    alerts: dedupeObjects([...bossItems, ...todoItems], (item) => item.title + "|" + item.text).slice(0, 6),
    system: {
      admin: token(dashboard?.status?.admin),
      payments: token(dashboard?.status?.payments),
      historical_recovery: token(dashboard?.status?.historical_recovery),
      telegram: token(dashboard?.status?.telegram),
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
      read_only: true,
      owner_confirmation_required_for_mutation: true,
    },
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
      by_domain: {},
      by_state: {},
      attention: [],
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
    by_domain: safeCountMap(queue.by_domain),
    by_state: safeCountMap(queue.by_state),
    attention: (Array.isArray(queue.attention) ? queue.attention : []).slice(0, 5).map((item) => ({
      case_ref: clean(item.case_ref, 180),
      client_name: clean(item.client_name, 120) || "Canonical Client",
      domain: clean(item.domain, 40),
      state: clean(item.state, 40),
      sla_status: clean(item.sla_status, 40),
      since_update_minutes: nullableNonNegative(item.since_update_minutes),
      case_age_minutes: nullableNonNegative(item.case_age_minutes),
      next_attention: clean(item.next_attention, 80),
      href: safeInternalHref(item.href) || "/internal/admin/recovery",
    })),
    operational_only: true,
    business_truth_inferred: false,
  };
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
