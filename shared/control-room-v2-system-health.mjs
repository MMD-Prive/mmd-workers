const SCHEMA = "mmd.control_room_v2.system_health.v1";

const ACCEPTED = Object.freeze({
  routes: Object.freeze({
    phase: "1",
    status: "CLOSED",
    blocking_unresolved_count: 0,
    mmd_redirect_worker_production_routes: 0,
    evidence_type: "production_acceptance",
    receipt: "docs/architecture/route-canonical-owner-lock.json",
  }),
  analytics: Object.freeze({
    phase: "0",
    authority_workers: 6,
    accepted_workers: 6,
    evidence_type: "production_acceptance",
    receipt: "PostHog analytics_runtime_health 6/6 acceptance",
  }),
  line: Object.freeze({
    owner: "member-dashboard-chat-worker",
    evidence_type: "production_acceptance",
    receipt: "production LINE/MMS route ownership smoke",
  }),
});

function clean(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function liveStatus(value) {
  const token = clean(value);
  if (["พร้อม", "ข้อมูลจริง", "ready", "configured", "clear", "ok", "live", "healthy"].includes(token)) return "ok";
  if (["บางส่วน", "ข้อมูลจริงบางส่วน", "ยังไม่มีข้อมูล", "partial", "degraded", "warning", "watch", "unknown", "ยังยืนยันไม่ได้"].includes(token)) return "degraded";
  if (["มีปัญหา", "unavailable", "failed", "error", "critical", "overdue", "down"].includes(token)) return "action_needed";
  return token ? "degraded" : "degraded";
}

function system({ key, label, status, evidenceType, source, href = null, detail = "" }) {
  return {
    key,
    label,
    status,
    evidence_type: evidenceType,
    source,
    href,
    detail,
  };
}

export function buildControlRoomV2SystemHealth({
  dashboardStatus = {},
  telegramRouterHealth = null,
  liveProbe = null,
} = {}) {
  const telegramStatus = clean(telegramRouterHealth?.status) || dashboardStatus?.telegram;
  const liveWorkers = liveProbe?.workers;
  const liveAnalytics = liveProbe?.analytics;
  const websiteLive = liveProbe?.website;
  const systems = [
    system({
      key: "website",
      label: "Website",
      status: websiteLive ? (websiteLive.ok === true ? "ok" : "action_needed") : "ok",
      evidenceType: websiteLive ? "live" : "production_acceptance",
      source: "Webflow",
      detail: websiteLive ? ("HTTP " + String(websiteLive.status || 0) + " · refreshed live") : "Phase 1 production presentation smoke accepted",
    }),
    system({
      key: "workers",
      label: "Workers",
      status: liveWorkers ? (liveWorkers.healthy === liveWorkers.total ? "ok" : liveWorkers.healthy > 0 ? "degraded" : "action_needed") : "ok",
      evidenceType: liveWorkers ? "live" : "production_acceptance",
      source: "authority_workers",
      detail: liveWorkers ? (String(liveWorkers.healthy || 0) + "/" + String(liveWorkers.total || 0) + " authority workers healthy") : "Authority runtime accepted 6/6 in Phase 0/1",
    }),
    system({
      key: "routes",
      label: "Routes",
      status: "ok",
      evidenceType: ACCEPTED.routes.evidence_type,
      source: "phase1_machine_canon",
      detail: "Phase 1 CLOSED · blocking 0 · retired front gate routes 0",
    }),
    system({
      key: "analytics",
      label: "PostHog",
      status: liveAnalytics ? (liveAnalytics.all_configured === true ? "ok" : liveAnalytics.configured > 0 ? "degraded" : "action_needed") : "ok",
      evidenceType: liveAnalytics ? "live" : ACCEPTED.analytics.evidence_type,
      source: liveAnalytics ? "authority_runtime_health" : "phase0_authority_acceptance",
      detail: liveAnalytics
        ? (String(liveAnalytics.configured || 0) + "/" + String(liveAnalytics.total || 0) + " PostHog authority runtimes configured")
        : "Authority runtime accepted 6/6 · business events remain transaction-driven",
    }),
    system({
      key: "payments",
      label: "Payments",
      status: liveStatus(dashboardStatus?.payments),
      evidenceType: "live",
      source: "payments-worker",
      href: "/internal/admin/payments",
      detail: clean(dashboardStatus?.payments) || "status unavailable",
    }),
    system({
      key: "telegram",
      label: "Telegram",
      status: liveStatus(telegramStatus),
      evidenceType: "live",
      source: "telegram-worker",
      href: "/internal/admin/control-room",
      detail: telegramRouterHealth?.summary || clean(telegramStatus) || "router health unavailable",
    }),
    system({
      key: "line",
      label: "LINE",
      status: "ok",
      evidenceType: ACCEPTED.line.evidence_type,
      source: ACCEPTED.line.owner,
      detail: "Canonical LINE/MMS webhook ownership accepted",
    }),
    system({
      key: "data",
      label: "Data",
      status: liveStatus(dashboardStatus?.data),
      evidenceType: "live",
      source: "canonical_dashboard_sources",
      detail: clean(dashboardStatus?.data) || "data source status unavailable",
    }),
    system({
      key: "jobs",
      label: "Jobs",
      status: liveStatus(dashboardStatus?.reconfirm),
      evidenceType: "live",
      source: "canonical_sessions_and_reconfirm",
      href: "/internal/admin/jobs",
      detail: clean(dashboardStatus?.reconfirm) || "reconfirm status unavailable",
    }),
  ];

  const rank = { ok: 0, degraded: 1, action_needed: 2 };
  const overall = systems.reduce((current, item) => (
    (rank[item.status] ?? 1) > (rank[current] ?? 0) ? item.status : current
  ), "ok");

  return {
    schema: SCHEMA,
    mode: "read_only",
    refresh_mode: liveProbe ? "live_on_demand" : "baseline",
    refreshed_at: liveProbe?.checked_at || null,
    overall_status: overall,
    systems,
    phase0: { ...ACCEPTED.analytics },
    phase1: { ...ACCEPTED.routes },
    release: liveProbe?.release || null,
    operational_watch: {
      label: "HYPE / STUCK / SLA",
      load_mode: "on_demand",
      source: "/v1/admin/ai-ops/context",
      authority: "admin-ai-ops-worker",
      duplicate_dashboard_fetch: false,
      detail: "โหลดผ่าน AI Ops เมื่อเปิดใช้งาน เพื่อไม่เพิ่ม Airtable reads ทุกครั้งที่เปิด Control Room",
    },
    authority: {
      read_only: true,
      business_truth_mutated: false,
      payment: "payments-worker",
      route_canon: "route-canonical-owner-lock.json",
      analytics: "PostHog production acceptance",
      human_final_authority: "Per",
    },
  };
}

export const CONTROL_ROOM_V2_SYSTEM_HEALTH_SCHEMA = SCHEMA;
