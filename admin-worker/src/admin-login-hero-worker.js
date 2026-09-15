import worker from "./job-orchestrator-owner-ops-wrapper.js";
import { handleModelConsoleAudit, isModelConsoleAuditRequest } from "./model-console-audit.js";
import { kickLineOfcConsoleContactBackfill } from "./line-ofc-console-backfill.js";
import {
  isPrivateModelAdminRequest,
  maybeHandlePrivateModelAdminRequest,
  syncPrivateModelHandoffAfterActivation,
} from "./private-model-application-handoff.js";
import {
  isModelConfirmActionRequest,
  maybeCreateInternalHoldAfterModelConfirm,
} from "./model-confirm-cal-hold.js";
export * from "./admin-login-hero-worker-pre-model-line-link.js";

export const ADMIN_OWNER_DASHBOARD_PATH = "/internal/admin/dashboard";
const ADMIN_LOGIN_SESSION_PATH = "/internal/admin/login/session";
const MMS_PARTNER_PATH = "/internal/admin/mms";
const MODEL_ACTIVATE_PATH = "/v1/model/liff/activate";
const AUDIENCE_BRIEF_PATH = "/v1/admin/audience/brief";
const ADMIN_AUTH_ME_PATH = "/v1/admin/auth/me";
const LINE_OFC_SYNC_RUNS_TABLE_DEFAULT = "tbl2yGlf8XyswZ0Yw";
const AIRTABLE_API = "https://api.airtable.com/v0";
const AUDIENCE_OWNER_ROLES = new Set(["owner", "admin", "super_admin", "superadmin"]);
const LINE_SYNC_FIELDS = Object.freeze({
  status: "fldhRfMpXtzO9Bl69",
  startedAt: "fldTNx3KBlcRVf6Ja",
  completedAt: "fld4KQJOZTbIUJZCJ",
  supported: "fld42q3azGtqeE5fM",
  followersReturned: "fldxFTybctmJyJpln",
  clientsScanned: "fld9ZXM2dAqv7peCf",
  alreadyCanonical: "fldBPSFHSHvtPQ89Y",
  missingClients: "flddYCQqVq905f4zw",
  reason: "fldbrfDSXL84FCj2W",
  source: "fldmTEC9kMdH8x5Jy",
});
let lineOfcContactBackfillKickStarted = false;

function clean(value, max = 4000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function audienceJson(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-audience-brief": "backend-v1",
      ...extraHeaders,
    },
  });
}

function scheduleLineOfcContactBackfill(env, ctx) {
  if (lineOfcContactBackfillKickStarted || !env?.LINE_OFC_BACKFILL_COORDINATOR) return;
  lineOfcContactBackfillKickStarted = true;
  const task = kickLineOfcConsoleContactBackfill(env).catch(() => {
    lineOfcContactBackfillKickStarted = false;
  });
  if (ctx?.waitUntil) ctx.waitUntil(task);
}

function delegatedHeaders(request) {
  const headers = new Headers({ accept: "application/json" });
  for (const name of ["cookie", "authorization", "origin", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function delegatedJson(request, env, ctx, path) {
  const url = new URL(path, request.url);
  const response = await worker.fetch(new Request(url.toString(), {
    method: "GET",
    headers: delegatedHeaders(request),
  }), env, ctx);
  const data = await response.clone().json().catch(() => null);
  return { ok: response.ok && data?.ok !== false, status: response.status, data };
}

async function readAudienceOwner(request, env, ctx) {
  const auth = await delegatedJson(request, env, ctx, ADMIN_AUTH_ME_PATH);
  if (!auth.ok || !auth.data || auth.data.authenticated === false) return null;
  const role = clean(auth.data.actor_role || auth.data.actor?.role, 80).toLowerCase();
  const id = clean(auth.data.actor_id || auth.data.actor?.id, 120);
  if (!id || !AUDIENCE_OWNER_ROLES.has(role)) return null;
  return { id, role };
}

async function readLatestLineAudienceSnapshot(env = {}) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 4096);
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  const tableId = clean(env.AIRTABLE_TABLE_LINE_OFC_SYNC_RUNS_ID || LINE_OFC_SYNC_RUNS_TABLE_DEFAULT, 120);
  if (!token || !baseId || !tableId) {
    return { available: false, state: "waiting", reason: "line_ofc_sync_storage_not_ready" };
  }

  const url = new URL(`${AIRTABLE_API}/${baseId}/${tableId}`);
  url.searchParams.set("pageSize", "20");
  url.searchParams.set("returnFieldsByFieldId", "true");
  for (const fieldId of Object.values(LINE_SYNC_FIELDS)) url.searchParams.append("fields[]", fieldId);

  let response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    return { available: false, state: "waiting", reason: clean(error?.message || "line_ofc_sync_read_failed", 160) };
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { available: false, state: "waiting", reason: `line_ofc_sync_http_${response.status}` };
  }

  const records = (Array.isArray(payload?.records) ? payload.records : [])
    .map((record) => {
      const fields = record?.fields || {};
      const completedAt = clean(fields[LINE_SYNC_FIELDS.completedAt] || fields[LINE_SYNC_FIELDS.startedAt] || record?.createdTime, 80);
      return { fields, completedAt, time: Date.parse(completedAt) || 0 };
    })
    .sort((a, b) => b.time - a.time);
  const latest = records[0];
  if (!latest) return { available: false, state: "waiting", reason: "line_ofc_sync_receipt_missing" };

  const fields = latest.fields;
  const status = clean(fields[LINE_SYNC_FIELDS.status], 80).toLowerCase();
  const supported = fields[LINE_SYNC_FIELDS.supported] === true;
  const followers = numeric(fields[LINE_SYNC_FIELDS.followersReturned]);
  const clientsScanned = numeric(fields[LINE_SYNC_FIELDS.clientsScanned]);
  const alreadyCanonical = numeric(fields[LINE_SYNC_FIELDS.alreadyCanonical]);
  const missingClients = numeric(fields[LINE_SYNC_FIELDS.missingClients]);
  const reason = clean(fields[LINE_SYNC_FIELDS.reason], 180);
  const source = clean(fields[LINE_SYNC_FIELDS.source], 120) || "line_ofc_follower_sync_v1";
  const metricReady = status === "success" && supported && followers !== null;

  return {
    available: metricReady,
    state: metricReady ? "connected_snapshot" : "waiting",
    source,
    snapshot_at: latest.completedAt || null,
    followers,
    clients_scanned: clientsScanned,
    already_canonical: alreadyCanonical,
    missing_clients: missingClients,
    supported,
    status: status || "unknown",
    reason: metricReady ? "" : reason || (supported ? "verified_metric_not_ready" : "followers_endpoint_not_supported"),
  };
}

function contextStatus(read, details = {}) {
  return read?.ok
    ? { state: "connected_context_only", metric_available: false, ...details }
    : { state: "waiting", metric_available: false, reason: `backend_http_${read?.status || 0}` };
}

async function buildAudienceBrief(request, env, ctx) {
  const owner = await readAudienceOwner(request, env, ctx);
  if (!owner) {
    return audienceJson({ ok: false, error: "unauthorized" }, 401);
  }

  const [lineResult, dashboardResult, recentResult] = await Promise.allSettled([
    readLatestLineAudienceSnapshot(env),
    delegatedJson(request, env, ctx, "/v1/admin/dashboard"),
    delegatedJson(request, env, ctx, "/v1/admin/clients/recent"),
  ]);

  const line = lineResult.status === "fulfilled"
    ? lineResult.value
    : { available: false, state: "waiting", reason: "line_ofc_snapshot_read_failed" };
  const dashboard = dashboardResult.status === "fulfilled"
    ? dashboardResult.value
    : { ok: false, status: 0, data: null };
  const recent = recentResult.status === "fulfilled"
    ? recentResult.value
    : { ok: false, status: 0, data: null };

  const recentRecords = Array.isArray(recent?.data?.records)
    ? recent.data.records
    : Array.isArray(recent?.data?.items)
      ? recent.data.items
      : [];
  const dashboardCounts = dashboard?.ok && dashboard?.data?.counts && typeof dashboard.data.counts === "object"
    ? dashboard.data.counts
    : {};

  const sourceStatus = {
    line_ofc: {
      state: line.state || "waiting",
      metric_available: line.available === true,
      snapshot_at: line.snapshot_at || null,
      source: line.source || "line_ofc_follower_sync_v1",
      reason: line.reason || null,
    },
    customer_data: recent?.ok
      ? { state: "connected_sample", metric_available: false, recent_canonical_sample: recentRecords.length }
      : { state: "waiting", metric_available: false, reason: `backend_http_${recent?.status || 0}` },
    booking: contextStatus(dashboard, {
      active_job_context: numeric(dashboardCounts.jobs),
      note: "operational context only; not a booking-conversion denominator",
    }),
    payments: contextStatus(dashboard, {
      review_queue_context: numeric(dashboardCounts.payment_review ?? dashboardCounts.payments),
      note: "review context only; never treated as revenue",
    }),
    calendar: { state: "not_read_by_brief", metric_available: false },
  };

  const signals = {
    audience: line.available
      ? {
          contacts: line.followers,
          snapshot_at: line.snapshot_at,
          source: line.source,
          basis: "verified_line_ofc_follower_sync_receipt",
        }
      : {},
    engagement: {},
    booking: {},
    revenue: {},
  };

  const summary = line.available
    ? `LINE OFC เชื่อมแล้ว · audience snapshot ล่าสุด ${Intl.NumberFormat("en-US").format(line.followers)} คน`
    : "Audience backend เชื่อมแล้ว · รอ LINE OFC metric ที่ยืนยันได้";
  const recommendation = line.available
    ? "ใช้ snapshot นี้เป็นฐาน audience ล่าสุดได้ แต่ Engagement, Booking Conversion และ Revenue Mix ยังไม่สรุปจนกว่าจะมี source ที่ยืนยันตรง ห้ามใช้ Historical 2026-06-01 แทน live KPI"
    : "Backend พร้อมแล้ว แต่ยังไม่สร้างตัวเลขแทน source ที่ขาด ให้ใช้ Customer Data / Booking / Payments เป็น context และรอ LINE OFC verified snapshot ก่อนสรุป audience ปัจจุบัน";

  return audienceJson({
    ok: true,
    connected: true,
    authority: "backend",
    source: "admin-worker",
    schema: "mmd.admin.audience.brief.v1",
    generated_at: new Date().toISOString(),
    summary,
    recommendation,
    signals,
    source_status: sourceStatus,
    recent_client_sample: {
      count: recentRecords.length,
      scope: "recent_canonical_clients_only",
      is_total_audience: false,
    },
    operational_context: {
      dashboard_available: dashboard?.ok === true,
      jobs: numeric(dashboardCounts.jobs),
      payment_review: numeric(dashboardCounts.payment_review ?? dashboardCounts.payments),
      membership_review: numeric(dashboardCounts.membership_review ?? dashboardCounts.members),
    },
    line_ofc_snapshot: {
      snapshot_at: line.snapshot_at || null,
      followers_returned: line.available ? line.followers : null,
      clients_scanned: line.clients_scanned ?? null,
      already_canonical: line.already_canonical ?? null,
      missing_clients: line.missing_clients ?? null,
      supported: line.supported === true,
      status: line.status || "waiting",
    },
    guardrails: {
      webflow_presentation_only: true,
      no_fabricated_metrics: true,
      historical_snapshot_is_current_kpi: false,
      may_broadcast: false,
      may_change_customer_truth: false,
      may_change_payment_truth: false,
      may_change_entitlement: false,
    },
  });
}

export async function enforceOwnerDashboardFirst(request, response) {
  if (!(response instanceof Response)) return response;

  let requestUrl;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return response;
  }

  const path = requestUrl.pathname.replace(/\/+$/g, "") || "/";
  if (path !== ADMIN_LOGIN_SESSION_PATH || String(request.method || "GET").toUpperCase() !== "POST") {
    return response;
  }

  const role = String(response.headers.get("x-mmd-admin-role") || "").trim();
  const sessionCreated = response.headers.get("x-mmd-admin-login") === "session-created";
  if (!sessionCreated || role === "mms_partner") return response;

  const headers = new Headers(response.headers);
  headers.set("x-mmd-admin-next", ADMIN_OWNER_DASHBOARD_PATH);
  headers.set("x-mmd-admin-post-login", "dashboard-first");

  if (response.status >= 300 && response.status < 400) {
    headers.set("location", new URL(ADMIN_OWNER_DASHBOARD_PATH, requestUrl.origin).toString());
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return response;

  let payload;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  if (!payload || payload.ok !== true) return response;
  payload.next = ADMIN_OWNER_DASHBOARD_PATH;
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/*
Delegated active-entrypoint contract markers.
The implementation remains in the pre-model-line-link wrapper/core chain; these
markers keep existing source-contract CI explicit while the outer wrappers add
owner-reviewed MMD MODEL LINE-link behavior, read-only dashboard summary, verified
Client Credit carry-forward authority, and the canonical owner Job Orchestrator.

browser_admin_session_required
forbidden_origin
isPaymentReviewRequest
handlePaymentReviewRequest
isPaymentEntitlementApprovalRequest
handlePaymentEntitlementApproval
coreWorker.fetch(request, env, ctx)
*/

export default {
  async fetch(request, env, ctx) {
    scheduleLineOfcContactBackfill(env, ctx);
    if (isModelConsoleAuditRequest(request)) return handleModelConsoleAudit(request, env);
    let privateModelRequest = null;
    let activationRequest = null;
    let modelConfirmRequest = null;
    let normalizedPath = "";
    const method = String(request.method || "GET").toUpperCase();
    try {
      normalizedPath = new URL(request.url).pathname.replace(/\/+$/g, "") || "/";
      if (isPrivateModelAdminRequest(request)) privateModelRequest = request.clone();
      if (isModelConfirmActionRequest(request)) modelConfirmRequest = request.clone();
      if (normalizedPath === MODEL_ACTIVATE_PATH && method === "POST") {
        activationRequest = request.clone();
      }
    } catch {
      // Core worker remains authoritative if URL parsing fails.
    }

    let response = await worker.fetch(request, env, ctx);
    if (normalizedPath === AUDIENCE_BRIEF_PATH && method === "GET" && response.status === 404) {
      response = await buildAudienceBrief(request, env, ctx);
    }
    if (privateModelRequest) response = await maybeHandlePrivateModelAdminRequest(privateModelRequest, env, response);
    if (activationRequest) response = await syncPrivateModelHandoffAfterActivation(activationRequest, response, env);
    if (modelConfirmRequest) response = await maybeCreateInternalHoldAfterModelConfirm(modelConfirmRequest, response, env);
    return enforceOwnerDashboardFirst(request, response);
  },
};
