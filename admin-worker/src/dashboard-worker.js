// admin-worker/src/dashboard-worker.js
// =========================================================
// Admin dashboard wrapper
//
// Purpose:
// - Add GET /v1/admin/dashboard without touching the large core router.
// - Delegate every other request to the existing admin-worker implementation.
// - Keep the dashboard endpoint read-only and safe for Webflow.
// - Project backend-owned pre-job reconfirm state for SIGIL Jobs / Per Ops.
// - Reuse canonical Payment Review + Historical Recovery queues for money counts.
// =========================================================

import coreWorker, { isAuthed as isCoreAuthed } from "./index.js";
import { handlePaymentReviewRequest } from "./payment-review-runtime.js";
import { handleHistoricalSlipBackfillRequest } from "./historical-slip-backfill-runtime.js";
import { readHypeTelegramRouterHealth } from "./hype-telegram-router-health-read.js";
import { buildControlRoomV2SystemHealth } from "../../shared/control-room-v2-system-health.mjs";
import { buildOwnerAnalyticsDashboard } from "./owner-analytics-dashboard.js";
import { buildOwnerActionsQueue } from "./owner-actions-queue.js";
import { buildOwnerActionDetail } from "./owner-action-detail.js";
import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { readPartnerFinanceAuditCoverage } from "./partner-owner-console.js";
import { readMmsOwnerActionCoverage } from "./mms-admin-runtime.js";
import { readCrossSystemStuckSlaWatch } from "./hype-cross-system-stuck-sla.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DASHBOARD_PATH = "/v1/admin/dashboard";
const OWNER_ANALYTICS_PATH = "/v1/admin/dashboard/analytics";
const OWNER_ACTIONS_PATH = "/v1/admin/dashboard/owner-actions";
const DEFAULT_MEMBERS_TABLE_ID = "tblgWc5VRon5o8Mhk";
const DEFAULT_SESSIONS_TABLE_ID = "tblC98mKWbzmPuNzX";
const RECONFIRM_LIFECYCLE_STATES = new Set(["confirmed", "accepted"]);
const HISTORICAL_PENDING_STATES = new Set(["pending", "review", "review_required", "needs_review", "unmatched", "new", "submitted"]);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = normalizePathname(url.pathname);
    const method = req.method.toUpperCase();
    const cors = corsHeaders(req, env);

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (path === DASHBOARD_PATH || path === OWNER_ANALYTICS_PATH || path === OWNER_ACTIONS_PATH) {
      if (!isAllowedOrigin(req, env)) {
        return withCors(json({ ok: false, error: "origin_not_allowed" }, 403), cors);
      }

      if (!(await isAuthed(req, env))) {
        return withCors(json({ ok: false, error: "unauthorized" }, 401), cors);
      }

      if (method !== "GET") {
        return withCors(json({ ok: false, error: "method_not_allowed" }, 405), cors);
      }

      if (path === OWNER_ANALYTICS_PATH) {
        return withCors(json(await buildOwnerAnalyticsDashboard(env)), cors);
      }

      if (path === OWNER_ACTIONS_PATH) {
        const actor = await readCredentialBoundAdminActor(req, env);
        if (!actor) return withCors(json({ ok: false, error: "unauthorized" }, 401), cors);
        if (String(actor.role || "").trim().toLowerCase() !== "owner") {
          return withCors(json({ ok: false, error: "owner_required" }, 403), cors);
        }
        const dashboard = await buildAdminDashboard(env, { ownerActor: actor });
        const actionKey = url.searchParams.get("action_key");
        if (actionKey !== null) {
          const detail = buildOwnerActionDetail(dashboard.owner_actions_source, actionKey);
          if (!detail) return withCors(json({ ok: false, error: "owner_action_not_found" }, 404), cors);
          return withCors(json(detail), cors);
        }
        return withCors(json(buildOwnerActionsQueue(dashboard.owner_actions_source)), cors);
      }

      return withCors(json(await buildAdminDashboard(env)), cors);
    }

    return coreWorker.fetch(req, env, ctx);
  },
};

export async function buildAdminDashboard(env, { ownerActor = null } = {}) {
  const now = new Date();
  const tomorrow = bangkokDateOffset(now, 1);
  const sessionsTable = env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE_ID;

  const [paymentQueueResult, historicalQueueResult, sessionsResult, membersResult, reconfirmSessionsResult, telegramRouterResult, financeAuditResult, mmsResult, hypeResult] = await Promise.allSettled([
    loadCanonicalPaymentReviewQueue(env),
    loadCanonicalHistoricalQueue(env),
    airtableList(env, sessionsTable, 100),
    airtableList(env, env.AIRTABLE_TABLE_MEMBERS_ID || DEFAULT_MEMBERS_TABLE_ID, 30),
    airtableListSessionsForDate(env, sessionsTable, tomorrow),
    readHypeTelegramRouterHealth(env),
    ownerActionCoverage(env, ownerActor),
    ownerActionMmsCoverage(env, ownerActor),
    ownerActionHypeCoverage(env, ownerActor, now),
  ]);

  const paymentQueue = settledRecords(paymentQueueResult);
  const historicalQueue = settledRecords(historicalQueueResult);
  const historicalPending = historicalQueue.filter(isHistoricalPending);
  const sessionRecords = settledRecords(sessionsResult);
  const memberRecords = settledRecords(membersResult);

  const money = buildMoneyList(paymentQueue);
  const jobs = buildJobList(sessionRecords, now);
  const members = buildMemberList(memberRecords, now);
  const reconfirm = reconfirmSessionsResult.status === "fulfilled"
    ? buildReconfirmOverview(reconfirmSessionsResult.value, now, tomorrow)
    : unavailableReconfirmOverview(tomorrow, resultReason(reconfirmSessionsResult));
  const boss = buildBossList({ money, jobs, members, paymentQueue, sessionRecords, memberRecords });
  const todos = buildTodos({ money, historicalPending, jobs, members, boss });

  const counts = {
    urgent: todos.length + boss.length,
    payments: paymentQueue.length,
    payment_review: paymentQueue.length,
    historical_recovery: historicalPending.length,
    jobs: jobs.length,
    jobs_need_confirm: Number(reconfirm.pending || 0) + Number(reconfirm.overdue || 0),
    members: members.length,
    membership_review: members.length,
    reconfirm_pending: reconfirm.pending,
    reconfirm_overdue: reconfirm.overdue,
  };

  const queues = {
    payment_review: {
      count: paymentQueue.length,
      href: "/internal/admin/payments",
      authority: "payment-review-runtime",
    },
    historical_recovery: {
      count: historicalPending.length,
      href: "/internal/admin/payments/historical-backfill",
      authority: "historical-slip-backfill-runtime",
    },
    jobs_need_confirm: {
      count: counts.jobs_need_confirm,
      href: "/internal/admin/jobs",
      authority: "session-reconfirm-runtime",
    },
    membership_review: {
      count: members.length,
      href: "/internal/admin/member-intelligence",
      authority: "canonical-members",
    },
  };

  const focus = buildFocus({ money, historicalPending, jobs, members, boss });
  const telegramRouterHealth = telegramRouterResult.status === "fulfilled"
    ? telegramRouterResult.value
    : { available: false, status: "unknown", summary: "Telegram Router health source unavailable" };
  const financeAudit = coverageResult(financeAuditResult, "finance_audit_unavailable");
  const mms = coverageResult(mmsResult, "mms_snapshot_unavailable");
  const hype = coverageResult(hypeResult, "hype_watch_unavailable");
  const sourceCoverage = [
    sourceCoverageEntry("finance_audit", "Finance Audit", financeAudit, "/internal/admin/partners", "canonical_finance_timeline"),
    sourceCoverageEntry("mms", "MMS", mms, "/internal/admin/mms", "mms-worker"),
    sourceCoverageEntry("hype", "HYPE operational watch", hype, "/internal/admin/control-room", "hype_coordinator_read_only"),
  ];
  const telegramStatus = telegramRouterHealth?.status === "configured"
    ? "พร้อม"
    : telegramRouterHealth?.status === "partial"
      ? "บางส่วน"
      : telegramRouterHealth?.status === "degraded"
        ? "มีปัญหา"
        : "ยังยืนยันไม่ได้";

  const dashboardStatus = {
    admin: "พร้อม",
    payments: statusFromResult(paymentQueueResult),
    historical_recovery: statusFromResult(historicalQueueResult),
    telegram: telegramStatus,
    data: dataMode([paymentQueueResult, historicalQueueResult, sessionsResult, membersResult]),
    reconfirm: reconfirm.available ? "พร้อม" : "ยังยืนยันไม่ได้",
  };
  const controlRoomV2 = buildControlRoomV2SystemHealth({
    dashboardStatus,
    telegramRouterHealth,
  });

  const payload = {
    ok: true,
    layer: "core",
    source: "admin-worker",
    generated_at: now.toISOString(),
    focus,
    counts,
    queues,
    todos,
    jobs,
    money,
    historical_recovery: historicalPending.slice(0, 6),
    members,
    boss,
    reconfirm,
    telegram_router_health: telegramRouterHealth,
    control_room_v2: controlRoomV2,
    status: dashboardStatus,
    debug: {
      payment_review_loaded: paymentQueue.length,
      historical_loaded: historicalQueue.length,
      historical_pending: historicalPending.length,
      sessions_loaded: sessionRecords.length,
      members_loaded: memberRecords.length,
      reconfirm_sessions_loaded: reconfirm.items.length,
      payment_source: resultReason(paymentQueueResult),
      historical_source: resultReason(historicalQueueResult),
      session_source: resultReason(sessionsResult),
      member_source: resultReason(membersResult),
      reconfirm_source: reconfirmSessionsResult.status === "fulfilled" ? "ok" : resultReason(reconfirmSessionsResult),
      telegram_router_source: telegramRouterResult.status === "fulfilled" ? cleanDebugStatus(telegramRouterHealth?.status) : resultReason(telegramRouterResult),
    },
  };
  Object.defineProperty(payload, "owner_actions_source", {
    value: {
      now,
      money: paymentQueue,
      historical_recovery: historicalPending,
      reconfirm,
      members: memberRecords,
      boss,
      finance_audit: financeAudit,
      mms,
      hype,
      source_coverage: sourceCoverage,
      unavailable_sources: sourceCoverage.filter((source) => source.state !== "connected").map((source) => source.source),
    },
    enumerable: false,
  });
  return payload;
}

function coverageResult(result, fallbackReason) {
  if (result?.status === "fulfilled" && result.value?.available === true) return result.value;
  return {
    available: false,
    reason: cleanDebugStatus(result?.status === "rejected" ? resultReason(result) : result?.value?.reason || fallbackReason),
  };
}

function ownerActionCoverage(env, actor) {
  return actor ? readPartnerFinanceAuditCoverage(env, actor) : Promise.resolve({ available: false, reason: "owner_scope_required" });
}

function ownerActionMmsCoverage(env, actor) {
  return actor ? readMmsOwnerActionCoverage(env) : Promise.resolve({ available: false, reason: "owner_scope_required" });
}

function ownerActionHypeCoverage(env, actor, now) {
  return actor ? readCrossSystemStuckSlaWatch(env, { now }) : Promise.resolve({ available: false, reason: "owner_scope_required" });
}

function sourceCoverageEntry(source, label, value, href, fallbackAuthority) {
  const partial = value?.complete === false || value?.status === "partial";
  return {
    source,
    label,
    state: value?.available === true ? (partial ? "partial" : "connected") : "unavailable",
    authority: cleanDebugStatus(value?.authority || fallbackAuthority),
    href,
    action_count: ownerCoverageActionCount(source, value),
    read_only: true,
  };
}

function ownerCoverageActionCount(source, value) {
  if (source === "finance_audit") return nonNegativeInteger(value?.reconciliation_count) + nonNegativeInteger(value?.payout_hold_count);
  if (source === "mms") return nonNegativeInteger(value?.application_review_count) + nonNegativeInteger(value?.prebooking_coordination_count);
  return nonNegativeInteger(value?.counts?.total);
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

async function loadCanonicalPaymentReviewQueue(env) {
  const response = await handlePaymentReviewRequest(
    new Request("https://admin.internal/v1/admin/payments/review-queue?limit=100"),
    env,
    { id: "dashboard", role: "admin" },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) {
    throw new Error(`payment_review_queue_${response.status}_${payload?.error || "invalid"}`);
  }
  return payload.items;
}

async function loadCanonicalHistoricalQueue(env) {
  const response = await handleHistoricalSlipBackfillRequest(
    new Request("https://admin.internal/v1/admin/payments/historical-backfill?limit=100"),
    env,
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) {
    throw new Error(`historical_recovery_queue_${response.status}_${payload?.error || "invalid"}`);
  }
  return payload.items;
}

function isHistoricalPending(item) {
  const state = normalizeWord(item?.review_state || item?.status || "pending");
  return HISTORICAL_PENDING_STATES.has(state || "pending");
}

function buildFocus({ money, historicalPending, jobs, members, boss }) {
  if (money.length) {
    return {
      title: "ตรวจเงินก่อน",
      text: `มี Payment Review รอตรวจ ${money.length} รายการ อย่าเพิ่งเปิดสิทธิ์หรือเริ่มงานที่ผูกกับยอดนี้จนกว่าจะตรวจเสร็จ`,
    };
  }

  if (historicalPending.length) {
    return {
      title: "ตรวจ Historical Recovery",
      text: `มีสลิปย้อนหลังรอตรวจ ${historicalPending.length} รายการ เปิด Historical Backfill เพื่อจับคู่และยืนยันหลักฐาน`,
    };
  }

  if (boss.length) {
    return {
      title: "ส่งเคสให้ Boss Per ดู",
      text: `มีเคสพิเศษ ${boss.length} รายการที่ไม่ควรให้แอดมินตัดสินใจเอง`,
    };
  }

  if (jobs.length) {
    return {
      title: "เช็กงานวันนี้",
      text: `มีงาน ${jobs.length} รายการที่ควรดูสถานะ เวลา และการคอนเฟิร์ม`,
    };
  }

  if (members.length) {
    return {
      title: "ดูสมาชิกที่ต้องต่ออายุ",
      text: `มีสมาชิก ${members.length} รายการที่ควรตรวจสถานะหรือต่ออายุ`,
    };
  }

  return {
    title: "ยังไม่มีเรื่องด่วน",
    text: "ตอนนี้ยังไม่มีรายการที่ต้องรีบทำก่อน",
  };
}

function buildTodos({ money, historicalPending, jobs, members, boss }) {
  const todos = [];

  if (money[0]) {
    todos.push({
      title: `ตรวจเงินของ ${money[0].title}`,
      text: money[0].text,
      href: "/internal/admin/payments",
      icon: "฿",
      tag: "Payment Review",
      color: "red",
    });
  }

  if (historicalPending[0]) {
    const proof = historicalPending[0];
    todos.push({
      title: `Historical Recovery · ${proof.proof_id || proof.source_ref || "สลิปย้อนหลัง"}`,
      text: compactJoin([
        proof.amount_thb ? `${amountText(proof.amount_thb)} บาท` : "ยังอ่านยอดไม่ครบ",
        proof.payment_ref_masked ? `ref ${proof.payment_ref_masked}` : "",
      ], " · "),
      href: "/internal/admin/payments/historical-backfill",
      icon: "↺",
      tag: "Historical",
      color: "yellow",
    });
  }

  if (jobs.find((job) => /telegram|รอ|pending|confirm/i.test(job.status || job.text))) {
    const job = jobs.find((item) => /telegram|รอ|pending|confirm/i.test(item.status || item.text));
    todos.push({
      title: `เช็กงาน ${job.id || job.title}`,
      text: job.text,
      href: job.href || "/internal/admin/jobs",
      icon: "+",
      tag: "เช็กงาน",
      color: "yellow",
    });
  }

  if (members[0]) {
    todos.push({
      title: `ดูสมาชิก ${members[0].title}`,
      text: members[0].text,
      href: members[0].href || "/internal/admin/member-intelligence",
      icon: "◇",
      tag: members[0].tag || "สมาชิก",
      color: "gold",
    });
  }

  if (boss[0] && todos.length < 4) {
    todos.push({
      title: boss[0].title,
      text: boss[0].text,
      href: boss[0].href || "/internal/admin/exceptions",
      icon: "!",
      tag: "Boss Per",
      color: "gold",
    });
  }

  return todos.slice(0, 4);
}

function buildMoneyList(items) {
  return (Array.isArray(items) ? items : [])
    .slice(0, 6)
    .map((item) => {
      const name = firstText(item.customer_name, item.payer_name, "ลูกค้า");
      const amount = amountText(item.evidence_amount_thb);
      const ref = firstText(item.payment_ref, item.proof_id);
      const issues = Array.isArray(item.context_issues) ? item.context_issues.length : 0;
      return {
        title: name,
        text: compactJoin([
          firstText(item.inferred_label, item.payment_stage, "รอตรวจสลิป"),
          ref ? `ref ${maskPaymentRef(ref)}` : "",
          issues ? `ต้องเติม ${issues} จุด` : "พร้อมตรวจ",
        ], " · "),
        amount,
        proof_id: firstText(item.proof_id),
        can_approve: item.can_approve === true,
        href: "/internal/admin/payments",
      };
    });
}

export function buildJobList(records, now = new Date()) {
  const items = (Array.isArray(records) ? records : []).map((record) => {
    const fields = record.fields || {};
    const sessionId = firstText(fields.session_id, fields.sid, fields.job_id, record.id);
    const model = firstText(fields.model_name, fields["Assigned Model"], fields["Model Name"], fields.model, fields.assigned_model, "ยังไม่ระบุ model");
    const customer = firstText(fields.client_name, fields.member_name, fields.customer_name, fields.name, "ลูกค้า");
    const status = firstText(fields.session_state, fields.status, fields["Session Status"], fields.job_status, "กำลังดำเนินการ");
    const jobDateSource = firstText(fields.job_date, fields.service_date, fields.date, fields["Job Date"]);
    const scheduleSource = firstText(fields.start_at, fields.scheduled_at, fields.date_time);
    const startTimeSource = firstText(fields.start_time, fields["Start Time"], scheduleSource);
    const jobDate = normalizeDateOnly(jobDateSource) || normalizeDateOnly(scheduleSource);
    const dateLabel = jobDateLabel(jobDate || jobDateSource || scheduleSource);
    const timeOnly = timeLabel(startTimeSource);
    const when = compactJoin([dateLabel, timeOnly], " · ") || "ยังไม่มีวันเวลา";

    return {
      id: sessionId,
      title: `${model} · ${customer}`,
      text: compactJoin([status, firstText(fields.service_type, fields.package_code, fields["Session Type"], fields.work_type, "")], " · "),
      job_date: jobDate,
      date_label: dateLabel,
      start_time: firstText(fields.start_time, fields["Start Time"]),
      time_only: timeOnly,
      time: when,
      when,
      status: thaiStatus(status),
      progress: progressFromStatus(status),
      href: `/internal/admin/jobs/${encodeURIComponent(sessionId)}`,
    };
  });

  return sortDashboardJobs(items, now).slice(0, 6);
}

export function buildReconfirmOverview(records, now = new Date(), jobDate = bangkokDateOffset(now, 1)) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const items = (Array.isArray(records) ? records : [])
    .map((record) => projectReconfirmItem(record, nowMs, jobDate))
    .filter(Boolean)
    .sort((a, b) => String(a.start_time || "99:99").localeCompare(String(b.start_time || "99:99")));

  const counts = { scheduled: 0, pending: 0, acknowledged: 0, overdue: 0, checking: 0 };
  for (const item of items) counts[item.status] += 1;

  return {
    available: true,
    scope: "tomorrow",
    job_date: jobDate,
    total: items.length,
    ...counts,
    items,
  };
}

function unavailableReconfirmOverview(jobDate, reason) {
  return {
    available: false,
    scope: "tomorrow",
    job_date: jobDate,
    total: 0,
    scheduled: 0,
    pending: 0,
    acknowledged: 0,
    overdue: 0,
    checking: 0,
    items: [],
    reason: str(reason) || "reconfirm_source_unavailable",
  };
}

function projectReconfirmItem(record, nowMs, expectedJobDate) {
  const fields = record?.fields || {};
  const lifecycle = normalizeWord(firstText(fields.session_state, fields.status, fields["Session Status"], fields.job_status));
  if (!RECONFIRM_LIFECYCLE_STATES.has(lifecycle)) return null;

  const jobDate = firstText(fields.job_date, fields.service_date, fields.date, fields["Job Date"]);
  if (expectedJobDate && normalizeDateOnly(jobDate) && normalizeDateOnly(jobDate) !== expectedJobDate) return null;

  const requiredAt = firstText(fields.reconfirm_required_at);
  const reminderAt = firstText(fields.reconfirm_reminder_at);
  const overdueAt = firstText(fields.reconfirm_overdue_at);
  const acknowledgedAt = firstText(fields.reconfirm_acknowledged_at);
  const explicitStatus = normalizeWord(fields.reconfirm_status);
  const status = deriveDashboardReconfirmStatus({ explicitStatus, requiredAt, overdueAt, acknowledgedAt }, nowMs);

  return {
    session_id: firstText(fields.session_id, fields.sid, record.id),
    job_id: firstText(fields.job_id),
    job_date: normalizeDateOnly(jobDate) || expectedJobDate || "",
    start_time: firstText(fields.start_time, fields["Start Time"]),
    model_name: firstText(fields.model_name, fields["Model Name"], fields.assigned_model, "Model"),
    client_name: firstText(fields.client_name, fields.member_name, fields.customer_name, fields.name, "ลูกค้า"),
    status,
    required_at: requiredAt || null,
    reminder_at: reminderAt || null,
    overdue_at: overdueAt || null,
    acknowledged_at: acknowledgedAt || null,
    followup_status: firstText(fields.followup_status) || null,
    risk_level: firstText(fields.risk_level) || null,
  };
}

export function deriveDashboardReconfirmStatus({ explicitStatus, requiredAt, overdueAt, acknowledgedAt }, nowMs = Date.now()) {
  if (acknowledgedAt) return "acknowledged";
  const overdueMs = Date.parse(overdueAt || "");
  const requiredMs = Date.parse(requiredAt || "");
  if (Number.isFinite(overdueMs) && nowMs >= overdueMs) return "overdue";
  if (Number.isFinite(requiredMs) && nowMs >= requiredMs) return "pending";
  if (explicitStatus === "acknowledged") return "acknowledged";
  if (["scheduled", "pending", "overdue"].includes(explicitStatus)) return explicitStatus;
  if (requiredAt || overdueAt) return "scheduled";
  return "checking";
}

function buildMemberList(records, now) {
  return records
    .filter((record) => {
      const fields = record.fields || {};
      const status = lower(firstText(fields["Membership Status"], fields["Verification Status"], fields.status, fields.member_status, fields.membership_status));
      const expiry = parseDate(firstText(fields["Membership Expiry"], fields["Membership End Date"], fields["Expire At"], fields.expire_at, fields.expiry, fields.end_date, fields.expires_at));
      const nearExpiry = expiry ? expiry.getTime() - now.getTime() < 1000 * 60 * 60 * 24 * 30 : false;
      return /expired|pending|hold|รอ|หมด/.test(status) || nearExpiry;
    })
    .slice(0, 6)
    .map((record) => {
      const fields = record.fields || {};
      const name = firstText(fields["Full Name (Display)"], fields["Full Name"], fields.mmd_client_name, fields.name, fields.nickname, fields.email, "สมาชิก");
      const tier = firstText(fields["Membership Tier"], fields.tier, fields.package_code, fields.member_tier, "Member");
      const status = firstText(fields["Membership Status"], fields["Verification Status"], fields.status, fields.member_status, fields.membership_status, "ควรตรวจ");
      return {
        title: name,
        text: `${tier} · ${thaiStatus(status)}`,
        tag: memberTag(status),
        href: "/internal/admin/member-intelligence",
      };
    });
}

function buildBossList({ money, jobs, members, paymentQueue, sessionRecords, memberRecords }) {
  const out = [];

  const blackCardMember = memberRecords.find((record) => /black|vip|svip/i.test(JSON.stringify(record.fields || {})));
  if (blackCardMember) {
    const fields = blackCardMember.fields || {};
    out.push({
      title: `Black Card Review · ${firstText(fields["Full Name (Display)"], fields["Full Name"], fields.name, fields.mmd_client_name, fields.email, "สมาชิก")}`,
      text: "มีข้อมูลระดับ VIP / Black Card ควรให้ Boss Per ตรวจเอง",
      href: "/internal/admin/black-card-review",
    });
  }

  const unmatchedPayment = (Array.isArray(paymentQueue) ? paymentQueue : []).find((item) =>
    Array.isArray(item?.context_issues) && item.context_issues.includes("customer_or_job_not_linked")
  );
  if (unmatchedPayment) {
    out.push({
      title: "ยอดโอนจับคู่ไม่ได้",
      text: "มีรายการจ่ายเงินที่ยังจับคู่กับ Session หรือสมาชิกไม่ได้",
      href: "/internal/admin/payments",
    });
  }

  const exceptionJob = sessionRecords.find((record) => /exception|telegram missing|invalid|hold|blocked/i.test(JSON.stringify(record.fields || {})));
  if (exceptionJob) {
    out.push({
      title: "Job Exception",
      text: "มีงานที่สถานะไม่ปกติ ควรตรวจเองก่อนให้ flow ไปต่อ",
      href: "/internal/admin/exceptions",
    });
  }

  if (!out.length && (money.length > 3 || jobs.length > 5 || members.length > 3)) {
    out.push({
      title: "รายการวันนี้ค่อนข้างแน่น",
      text: "ควรไล่ตรวจเงิน งาน และสมาชิกที่ใกล้หมดอายุก่อน",
      href: "/internal/admin/dashboard",
    });
  }

  return out.slice(0, 5);
}

async function airtableList(env, tableName, maxRecords = 20) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !tableName) {
    throw new Error("missing_airtable_env");
  }

  const qs = new URLSearchParams({ maxRecords: String(maxRecords) });
  const request = new Request(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const res = await airtableFetch(env, request);

  if (!res.ok) {
    throw new Error(`airtable_${tableName}_${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data.records) ? data.records : [];
}

async function airtableListSessionsForDate(env, tableName, jobDate) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !tableName) {
    throw new Error("missing_airtable_env");
  }
  const field = str(env.AT_SESSIONS__JOB_DATE || "job_date").replace(/[{}]/g, "");
  if (!field) throw new Error("reconfirm_job_date_field_missing");
  const qs = new URLSearchParams({
    maxRecords: "100",
    filterByFormula: `IS_SAME({${field}}, DATETIME_PARSE('${jobDate}'), 'day')`,
  });
  const request = new Request(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const res = await airtableFetch(env, request);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`airtable_reconfirm_${res.status}${detail ? `:${detail.slice(0, 120)}` : ""}`);
  }
  const data = await res.json();
  return Array.isArray(data.records) ? data.records : [];
}

async function airtableFetch(env, request) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request);
}

function settledRecords(result) {
  return result.status === "fulfilled" && Array.isArray(result.value) ? result.value : [];
}

function statusFromResult(result) {
  return result.status === "fulfilled" ? "พร้อม" : "ยังไม่มีข้อมูล";
}

function cleanDebugStatus(value) {
  return String(value ?? "").trim().slice(0, 80) || "unknown";
}

function resultReason(result) {
  return result.status === "fulfilled" ? "ok" : String(result.reason?.message || result.reason || "unavailable");
}

function dataMode(results) {
  const ok = results.filter((item) => item.status === "fulfilled").length;
  if (ok === results.length) return "ข้อมูลจริง";
  if (ok > 0) return "ข้อมูลจริงบางส่วน";
  return "ยังไม่มีข้อมูล";
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = getAllowedOrigins(env);
  const h = new Headers();

  if (!origin) {
    // server-to-server
  } else if (allow.length === 0 || allow.includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }

  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  h.set("Access-Control-Max-Age", "86400");
  h.set("Content-Type", "application/json");
  return h;
}

function withCors(res, cors) {
  const headers = new Headers(res.headers);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(res.body, { status: res.status, headers });
}

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAllowedOrigin(req, env) {
  const allow = getAllowedOrigins(env);
  const origin = req.headers.get("Origin") || "";
  if (!origin) return true;
  if (!allow.length) return true;
  return allow.includes(origin);
}

async function isAuthed(req, env) {
  return await isCoreAuthed(req, env);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizePathname(pathname = "") {
  const normalized = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (normalized.length > 1) return normalized.replace(/\/$/, "");
  return normalized || "/";
}

function str(value) {
  return String(value == null ? "" : value).trim();
}

function lower(value) {
  return str(value).toLowerCase();
}

function normalizeWord(value) {
  return lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function firstText(...values) {
  for (const value of values) {
    const text = str(Array.isArray(value) ? value[0] : value);
    if (text) return text;
  }
  return "";
}

function compactJoin(values, separator) {
  return values.map(str).filter(Boolean).join(separator);
}

function amountText(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(num);
    }
  }
  return "-";
}

function maskPaymentRef(value) {
  const ref = str(value);
  if (!ref) return "";
  if (ref.length <= 8) return `${ref.slice(0, 2)}…${ref.slice(-2)}`;
  return `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}

function parseDate(value) {
  const raw = str(Array.isArray(value) ? value[0] : value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDateOnly(value) {
  const raw = str(Array.isArray(value) ? value[0] : value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function bangkokDateOffset(value, days) {
  const base = value instanceof Date ? value : new Date(value);
  const shifted = new Date(base.getTime() + Number(days || 0) * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(shifted);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function jobDateLabel(value) {
  const raw = str(Array.isArray(value) ? value[0] : value);
  if (!raw) return "";
  const normalized = normalizeDateOnly(raw);
  const date = normalized ? new Date(`${normalized}T12:00:00+07:00`) : parseDate(raw);
  if (!date) return "";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function timeLabel(value) {
  const raw = str(Array.isArray(value) ? value[0] : value);
  if (!raw) return "";

  const timeOnly = raw.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  if (timeOnly) {
    const hour = Number(timeOnly[1]);
    const minute = Number(timeOnly[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const date = parseDate(raw);
  if (!date) return "";
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function sortDashboardJobs(items, now) {
  const today = bangkokDateOffset(now, 0);
  const bucket = (job) => {
    if (!job.job_date) return 3;
    if (job.job_date === today) return 0;
    if (job.job_date > today) return 1;
    return 2;
  };

  return [...items].sort((a, b) => {
    const aBucket = bucket(a);
    const bBucket = bucket(b);
    if (aBucket !== bBucket) return aBucket - bBucket;
    if (a.job_date !== b.job_date) {
      if (aBucket === 2) return String(b.job_date).localeCompare(String(a.job_date));
      return String(a.job_date).localeCompare(String(b.job_date));
    }
    return String(a.time_only || "99:99").localeCompare(String(b.time_only || "99:99"));
  });
}

function thaiStatus(value) {
  const text = lower(value);
  if (/active|confirmed|ready|verified|paid|approved/.test(text)) return "พร้อม";
  if (/pending|wait|review|new|รอ/.test(text)) return "รอตรวจ";
  if (/expired|หมด/.test(text)) return "หมดอายุ";
  if (/hold|paused|blocked|พัก/.test(text)) return "พักไว้ก่อน";
  if (/travel|en_route|on_the_way/.test(text)) return "กำลังเดินทาง";
  if (/arrived/.test(text)) return "ถึงแล้ว";
  if (/working|live/.test(text)) return "กำลังทำงาน";
  if (/finished|done|closed/.test(text)) return "เสร็จแล้ว";
  return str(value) || "กำลังดำเนินการ";
}

function progressFromStatus(value) {
  const text = lower(value);
  if (/new|pending|wait|รอ/.test(text)) return 20;
  if (/confirmed|ready|approved/.test(text)) return 40;
  if (/travel|en_route|on_the_way/.test(text)) return 58;
  if (/arrived/.test(text)) return 72;
  if (/working|live/.test(text)) return 86;
  if (/finished|done|closed/.test(text)) return 100;
  return 35;
}

function memberTag(status) {
  const text = lower(status);
  if (/expired|หมด/.test(text)) return "ต่ออายุ";
  if (/pending|รอ/.test(text)) return "รอตรวจ";
  if (/hold|paused|พัก/.test(text)) return "พักไว้ก่อน";
  return "ดู";
}
