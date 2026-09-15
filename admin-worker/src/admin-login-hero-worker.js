import worker from "./job-orchestrator-owner-ops-wrapper.js";
import { handleModelConsoleAudit, isModelConsoleAuditRequest } from "./model-console-audit.js";
import { kickLineOfcConsoleContactBackfill } from "./line-ofc-console-backfill.js";
import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
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
const LINE_OFC_SYNC_RUNS_TABLE_DEFAULT = "tbl2yGlf8XyswZ0Yw";
const CLIENTS_TABLE_DEFAULT = "tblVv58TCbwh5j1fS";
const AI_MESSAGE_EVENTS_TABLE_DEFAULT = "tbljCYfYqfm8gBTPq";
const BOOKING_REQUESTS_TABLE_DEFAULT = "tblQa2OK4U69eOCRF";
const PAYMENTS_TABLE_DEFAULT = "tblWGGJJOx5eBvBZJ";
const AIRTABLE_API = "https://api.airtable.com/v0";
const AUDIENCE_OWNER_ROLES = new Set(["owner", "admin", "super_admin", "superadmin"]);
const AUDIENCE_WINDOW_DAYS = 30;
const AUDIENCE_WINDOW_MS = AUDIENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const AIRTABLE_METRIC_MAX_PAGES = 100;
const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/i;
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
const CLIENT_FIELDS = Object.freeze({
  lineUserId: "fld5HfSGChKFbd4uh",
});
const AI_MESSAGE_FIELDS = Object.freeze({
  createdAt: "fldwQ7bkMtguRxqz7",
  lineUserId: "fldll0EoyTHt0jHHP",
});
const BOOKING_FIELDS = Object.freeze({
  requestStatus: "fldIQOhTAmJMVJeu6",
  createdAt: "fldlOnbvpkf8G41ol",
  confirmedAt: "flddLv3J5PctaDBPz",
});
const PAYMENT_FIELDS = Object.freeze({
  amount: "fldvCSwrUW8OMAooS",
  officialVerifiedAt: "fldPNK6qgxCSdaJRM",
});
let lineOfcContactBackfillKickStarted = false;

function clean(value, max = 4000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parsedTime(value) {
  const time = Date.parse(clean(value, 120));
  return Number.isFinite(time) ? time : 0;
}

function validLineUserId(value) {
  return LINE_USER_ID_RE.test(clean(value, 80));
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

async function readAudienceOwner(request, env) {
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) return null;
  const role = clean(actor.role, 80).toLowerCase();
  const id = clean(actor.id, 120);
  if (!id || !AUDIENCE_OWNER_ROLES.has(role)) return null;
  return { id, role };
}

function airtableCredentials(env = {}) {
  return {
    token: clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 4096),
    baseId: clean(env.AIRTABLE_BASE_ID, 120),
  };
}

async function readAirtableMetricRecords(env = {}, tableId, fieldIds = []) {
  const { token, baseId } = airtableCredentials(env);
  const canonicalTableId = clean(tableId, 120);
  if (!token || !baseId || !canonicalTableId) {
    return { ok: false, records: [], reason: "airtable_metric_storage_not_ready" };
  }

  const records = [];
  let offset = "";
  for (let page = 0; page < AIRTABLE_METRIC_MAX_PAGES; page += 1) {
    const url = new URL(`${AIRTABLE_API}/${baseId}/${canonicalTableId}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const fieldId of fieldIds) url.searchParams.append("fields[]", fieldId);
    if (offset) url.searchParams.set("offset", offset);

    let response;
    let readError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetch(url.toString(), {
          method: "GET",
          headers: { authorization: `Bearer ${token}`, accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (response.status !== 429) break;
      } catch (error) {
        readError = error;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }

    if (!response) {
      return { ok: false, records: [], reason: clean(readError?.message || "airtable_metric_read_failed", 160) };
    }
    if (response.status === 429) {
      return { ok: false, records: [], reason: "airtable_metric_http_429" };
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, records: [], reason: `airtable_metric_http_${response.status}` };
    }

    if (Array.isArray(payload?.records)) records.push(...payload.records);
    offset = clean(payload?.offset, 300);
    if (!offset) return { ok: true, records, reason: "" };
  }

  return { ok: false, records: [], reason: "airtable_metric_page_limit_exceeded" };
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

async function readKnownLineContacts(env = {}) {
  const tableId = clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || CLIENTS_TABLE_DEFAULT, 120);
  const read = await readAirtableMetricRecords(env, tableId, Object.values(CLIENT_FIELDS));
  if (!read.ok) return { available: false, state: "waiting", reason: read.reason };

  const contacts = read.records.reduce((count, record) => {
    const value = record?.fields?.[CLIENT_FIELDS.lineUserId];
    return count + (validLineUserId(value) ? 1 : 0);
  }, 0);

  return {
    available: true,
    state: "connected_metric",
    contacts,
    source: "airtable_clients",
    basis: "canonical_clients_with_valid_line_user_id",
  };
}

async function readCustomerActivity30d(env = {}, nowMs = Date.now()) {
  const tableId = clean(env.AIRTABLE_TABLE_AI_MESSAGE_EVENTS_ID || env.AIRTABLE_TABLE_AI_MESSAGE_EVENTS || AI_MESSAGE_EVENTS_TABLE_DEFAULT, 120);
  const read = await readAirtableMetricRecords(env, tableId, Object.values(AI_MESSAGE_FIELDS));
  if (!read.ok) return { available: false, state: "waiting", reason: read.reason };

  const cutoff = nowMs - AUDIENCE_WINDOW_MS;
  let events = 0;
  const contacts = new Set();
  for (const record of read.records) {
    const fields = record?.fields || {};
    const eventTime = parsedTime(fields[AI_MESSAGE_FIELDS.createdAt] || record?.createdTime);
    if (!eventTime || eventTime < cutoff || eventTime > nowMs + 5 * 60 * 1000) continue;
    events += 1;
    const lineUserId = clean(fields[AI_MESSAGE_FIELDS.lineUserId], 80);
    if (validLineUserId(lineUserId)) contacts.add(lineUserId.toLowerCase());
  }

  return {
    available: true,
    state: "connected_metric",
    events_30d: events,
    unique_contacts_30d: contacts.size,
    window_days: AUDIENCE_WINDOW_DAYS,
    source: "airtable_ai_message_events",
  };
}

async function readBookingConversion30d(env = {}, nowMs = Date.now()) {
  const tableId = clean(env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID || BOOKING_REQUESTS_TABLE_DEFAULT, 120);
  const read = await readAirtableMetricRecords(env, tableId, Object.values(BOOKING_FIELDS));
  if (!read.ok) return { available: false, state: "waiting", reason: read.reason };

  const cutoff = nowMs - AUDIENCE_WINDOW_MS;
  let requests = 0;
  let confirmed = 0;
  for (const record of read.records) {
    const fields = record?.fields || {};
    const createdAt = parsedTime(fields[BOOKING_FIELDS.createdAt] || record?.createdTime);
    if (!createdAt || createdAt < cutoff || createdAt > nowMs + 5 * 60 * 1000) continue;
    requests += 1;
    const status = clean(fields[BOOKING_FIELDS.requestStatus], 80).toLowerCase();
    const confirmedAt = parsedTime(fields[BOOKING_FIELDS.confirmedAt]);
    if (status === "confirmed" || confirmedAt > 0) confirmed += 1;
  }

  return {
    available: true,
    state: "connected_metric",
    requests_30d: requests,
    confirmed_30d: confirmed,
    conversion_rate: requests > 0 ? Number(((confirmed / requests) * 100).toFixed(1)) : null,
    window_days: AUDIENCE_WINDOW_DAYS,
    source: "airtable_sigil_booking_requests",
  };
}

async function readOfficialVerifiedRevenue30d(env = {}, nowMs = Date.now()) {
  const tableId = clean(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || PAYMENTS_TABLE_DEFAULT, 120);
  const read = await readAirtableMetricRecords(env, tableId, Object.values(PAYMENT_FIELDS));
  if (!read.ok) return { available: false, state: "waiting", reason: read.reason };

  const cutoff = nowMs - AUDIENCE_WINDOW_MS;
  let total = 0;
  let payments = 0;
  for (const record of read.records) {
    const fields = record?.fields || {};
    const verifiedAt = parsedTime(fields[PAYMENT_FIELDS.officialVerifiedAt]);
    if (!verifiedAt || verifiedAt < cutoff || verifiedAt > nowMs + 5 * 60 * 1000) continue;
    const amount = numeric(fields[PAYMENT_FIELDS.amount]);
    if (amount === null) continue;
    total += amount;
    payments += 1;
  }

  return {
    available: true,
    state: "connected_metric",
    official_verified_thb_30d: Number(total.toFixed(2)),
    payments_30d: payments,
    currency: "THB",
    window_days: AUDIENCE_WINDOW_DAYS,
    source: "airtable_payments_official_verified_at",
  };
}

function metricSourceStatus(metric, details = {}) {
  return metric?.available
    ? { state: metric.state || "connected_metric", metric_available: true, source: metric.source || null, ...details }
    : { state: "waiting", metric_available: false, reason: metric?.reason || "metric_source_unavailable", ...details };
}

async function buildAudienceBrief(request, env, ctx) {
  const owner = await readAudienceOwner(request, env);
  if (!owner) {
    return audienceJson({ ok: false, error: "unauthorized" }, 401);
  }

  const nowMs = Date.now();
  const [lineResult, contactsResult, activityResult, bookingResult, revenueResult, dashboardResult, recentResult] = await Promise.allSettled([
    readLatestLineAudienceSnapshot(env),
    readKnownLineContacts(env),
    readCustomerActivity30d(env, nowMs),
    readBookingConversion30d(env, nowMs),
    readOfficialVerifiedRevenue30d(env, nowMs),
    delegatedJson(request, env, ctx, "/v1/admin/dashboard"),
    delegatedJson(request, env, ctx, "/v1/admin/clients/recent"),
  ]);

  const line = lineResult.status === "fulfilled"
    ? lineResult.value
    : { available: false, state: "waiting", reason: "line_ofc_snapshot_read_failed" };
  const contacts = contactsResult.status === "fulfilled"
    ? contactsResult.value
    : { available: false, state: "waiting", reason: "canonical_line_contacts_read_failed" };
  const activity = activityResult.status === "fulfilled"
    ? activityResult.value
    : { available: false, state: "waiting", reason: "customer_activity_read_failed" };
  const booking = bookingResult.status === "fulfilled"
    ? bookingResult.value
    : { available: false, state: "waiting", reason: "booking_conversion_read_failed" };
  const revenue = revenueResult.status === "fulfilled"
    ? revenueResult.value
    : { available: false, state: "waiting", reason: "official_verified_revenue_read_failed" };
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
      note: "LINE OA follower metric is separate from Known LINE Contacts",
    },
    customer_data: metricSourceStatus(contacts, {
      known_line_contacts: contacts.available ? contacts.contacts : null,
      basis: contacts.basis || "canonical_clients_with_valid_line_user_id",
    }),
    engagement: metricSourceStatus(activity, {
      window_days: AUDIENCE_WINDOW_DAYS,
    }),
    booking: metricSourceStatus(booking, {
      window_days: AUDIENCE_WINDOW_DAYS,
    }),
    payments: metricSourceStatus(revenue, {
      window_days: AUDIENCE_WINDOW_DAYS,
      basis: "official_verified_at_only",
    }),
    calendar: { state: "not_read_by_brief", metric_available: false },
  };

  const signals = {
    audience: contacts.available
      ? {
          contacts: contacts.contacts,
          source: contacts.source,
          basis: contacts.basis,
          line_oa_followers: line.available ? line.followers : null,
          line_oa_followers_supported: line.supported === true,
          line_oa_snapshot_at: line.snapshot_at || null,
        }
      : {},
    engagement: activity.available
      ? {
          events_30d: activity.events_30d,
          unique_contacts_30d: activity.unique_contacts_30d,
          window_days: activity.window_days,
          source: activity.source,
        }
      : {},
    booking: booking.available
      ? {
          requests_30d: booking.requests_30d,
          confirmed_30d: booking.confirmed_30d,
          conversion_rate: booking.conversion_rate,
          window_days: booking.window_days,
          source: booking.source,
        }
      : {},
    revenue: revenue.available
      ? {
          official_verified_thb_30d: revenue.official_verified_thb_30d,
          payments_30d: revenue.payments_30d,
          currency: revenue.currency,
          window_days: revenue.window_days,
          source: revenue.source,
        }
      : {},
  };

  const readyMetrics = [contacts, activity, booking, revenue].filter((metric) => metric.available).length;
  const number = new Intl.NumberFormat("en-US");
  const contactsText = contacts.available ? number.format(contacts.contacts) : "WAITING";
  const activityText = activity.available ? number.format(activity.events_30d) : "WAITING";
  const bookingText = booking.available ? `${number.format(booking.confirmed_30d)}/${number.format(booking.requests_30d)}` : "WAITING";
  const revenueText = revenue.available ? `฿${number.format(Math.round(revenue.official_verified_thb_30d))}` : "WAITING";
  const summary = `Live sources ${readyMetrics}/4 · LINE ${contactsText} · Activity 30d ${activityText} · Booking ${bookingText} · Verified Revenue ${revenueText}`;
  const recommendation = readyMetrics === 4
    ? `ใช้ Known LINE Contacts + Customer Activity ${AUDIENCE_WINDOW_DAYS} วัน + Booking Conversion + Official Verified Revenue เป็นฐาน CEO brief ได้แล้ว โดย LINE OA follower metric แยกสถานะและไม่บล็อก KPI หลัก`
    : `แสดงเฉพาะ source ที่อ่านได้จริง ${readyMetrics}/4 รายการ ส่วนที่ยังอ่านไม่ได้คง WAITING โดยไม่ใช้ historical snapshot หรือค่าคาดเดาแทน`;

  return audienceJson({
    ok: true,
    connected: true,
    authority: "backend",
    source: "admin-worker",
    schema: "mmd.admin.audience.brief.v1",
    generated_at: new Date(nowMs).toISOString(),
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
      reason: line.reason || null,
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
