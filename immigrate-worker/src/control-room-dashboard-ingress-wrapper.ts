import canonicalWorker from "./canonical-admin-login-wrapper";
import type { Env } from "./types";

const DASHBOARD_PATH = "/v1/admin/dashboard";
const DASHBOARD_ANALYTICS_PATH = "/v1/admin/dashboard/analytics";
const DASHBOARD_OWNER_ACTIONS_PATH = "/v1/admin/dashboard/owner-actions";
const DASHBOARD_ANNUAL_FINANCE_PATH = "/v1/admin/dashboard/annual-finance";
const OWNER_SNAPSHOT_PATH = "/v1/internal/owner/snapshot";
const CLIENT_INTELLIGENCE_PATH = "/v1/admin/clients/intelligence";
const CLIENT_INTELLIGENCE_AUDIT_PATH = "/v1/admin/clients/intelligence/audit";
const PUBLIC_HOSTS = new Set(["mmdbkk.com", "www.mmdbkk.com"]);

type BridgeKind =
  | "dashboard"
  | "dashboard-analytics"
  | "dashboard-owner-actions"
  | "dashboard-annual-finance"
  | "owner-snapshot"
  | "client-intelligence"
  | "client-intelligence-audit";

function normalizePath(value: string): string {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(data: unknown, status = 200, marker = "immigrate-to-admin-v1"): Response {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store, private",
      "x-mmd-control-room-dashboard-ingress": marker,
    },
  });
}

function markerFor(kind: BridgeKind): string {
  return kind === "dashboard"
    ? "immigrate-to-admin-v1"
    : kind === "dashboard-analytics"
      ? "immigrate-to-admin-analytics-v1"
    : kind === "dashboard-owner-actions"
      ? "immigrate-to-admin-owner-actions-v1"
    : kind === "dashboard-annual-finance"
      ? "immigrate-to-admin-annual-finance-v1"
    : kind === "owner-snapshot"
      ? "immigrate-to-admin-owner-snapshot-v1"
    : kind === "client-intelligence-audit"
      ? "immigrate-to-admin-client-intelligence-audit-v1"
      : "immigrate-to-admin-client-intelligence-v1";
}

function authBridgeFor(kind: BridgeKind): string {
  return kind === "dashboard"
    ? "immigrate-control-room-dashboard"
    : kind === "dashboard-analytics"
      ? "immigrate-control-room-analytics"
    : kind === "dashboard-owner-actions"
      ? "immigrate-dashboard-owner-actions"
    : kind === "dashboard-annual-finance"
      ? "immigrate-dashboard-annual-finance"
    : kind === "owner-snapshot"
      ? "immigrate-owner-snapshot"
    : kind === "client-intelligence-audit"
      ? "immigrate-client-intelligence-audit"
      : "immigrate-client-intelligence";
}

async function bridgeAdminRead(
  request: Request,
  env: Env,
  kind: BridgeKind,
): Promise<Response> {
  const url = new URL(request.url);
  const marker = markerFor(kind);
  if (!PUBLIC_HOSTS.has(url.hostname)) {
    return json({ ok: false, error: `${kind.replace(/-/g, "_")}_bridge_host_not_allowed` }, 403, marker);
  }
  if (!env.ADMIN_WORKER?.fetch) {
    return json({ ok: false, error: "admin_worker_binding_unavailable" }, 503, marker);
  }

  const headers = new Headers(request.headers);
  headers.delete("authorization");
  headers.delete("x-confirm-key");
  headers.delete("x-forwarded-host");
  headers.delete("x-mmd-public-host");
  headers.set("x-mmd-auth-bridge", authBridgeFor(kind));
  headers.set("x-mmd-public-host", url.hostname);

  const targetUrl = new URL(request.url);
  if (kind === "owner-snapshot") targetUrl.pathname = DASHBOARD_PATH;

  const forwarded = new Request(targetUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: request.redirect,
  });
  const response = await env.ADMIN_WORKER.fetch(forwarded);
  if (kind === "owner-snapshot") return ownerSnapshotResponse(response, marker);

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("cache-control", "no-store, private");
  responseHeaders.set("x-mmd-control-room-dashboard-ingress", marker);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

async function ownerSnapshotResponse(response: Response, marker: string): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-control-room-dashboard-ingress", marker);
  headers.set("x-mmd-owner-snapshot", "v1");
  headers.delete("content-length");

  if (!response.ok || !(headers.get("content-type") || "").includes("application/json")) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  const dashboard = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!dashboard || dashboard.ok === false) {
    return new Response(JSON.stringify(dashboard || { ok: false, error: "dashboard_payload_unavailable" }), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return new Response(JSON.stringify(buildOwnerSnapshot(dashboard)), { status: 200, headers });
}

function buildOwnerSnapshot(dashboard: Record<string, unknown>): Record<string, unknown> {
  const counts = objectAt(dashboard, "counts");
  const queues = objectAt(dashboard, "queues");
  const shortcutCounts = objectAt(dashboard, "shortcut_counts");
  const status = objectAt(dashboard, "status");
  const controlRoom = objectAt(dashboard, "control_room_v2");

  const paymentQueue = objectAt(queues, "payment_review");
  const historicalQueue = objectAt(queues, "historical_recovery");
  const jobsQueue = objectAt(queues, "jobs_need_confirm");
  const membershipQueue = objectAt(queues, "membership_review");

  const fixedCounts = {
    payment_slip_inbox: boundedCount(shortcutCounts.payment_slip_inbox, counts.payment_slips_pending, paymentQueue.count),
    money_control: boundedCount(shortcutCounts.money_control, counts.payments_review_pending, counts.payment_review, paymentQueue.count),
    model_assets_pending: boundedCount(counts.model_assets_pending, counts.studio_review_pending),
    jobs_need_confirm: boundedCount(counts.jobs_need_confirm, jobsQueue.count),
    membership_review: boundedCount(counts.membership_review, membershipQueue.count),
    historical_recovery: boundedCount(counts.historical_recovery, historicalQueue.count),
  };

  const unavailableSections = Object.entries(status)
    .filter(([, value]) => !isReadyStatus(value))
    .map(([key]) => key);

  return {
    ok: true,
    schema: "mmd.internal.owner.snapshot.v1",
    source: "admin-worker",
    projection: "immigrate-worker",
    read_only: true,
    no_business_truth: true,
    generated_at: String(dashboard.generated_at || new Date().toISOString()),
    dashboard_generated_at: String(dashboard.generated_at || ""),
    counts: fixedCounts,
    sections: {
      payment_slip_inbox: section("Payment Slip Inbox", "/internal/ceo/payment-slip-inbox", fixedCounts.payment_slip_inbox, "payment-review-runtime"),
      money_control: section("Money Control", "/internal/admin/payments", fixedCounts.money_control, "payment-review-runtime"),
      create_job: section("Create Job", "/internal/admin/jobs/create-job", null, "admin-worker"),
      model_assets: section("Model Assets / Studio", "/internal/ceo/models", fixedCounts.model_assets_pending, "model-owner-review-queue"),
      hype_henna: section("HYPE + HENNA", "/internal/admin/telegram-brief", null, "telegram-router-health"),
    },
    status: {
      payments: cleanStatus(status.payments),
      telegram: cleanStatus(status.telegram),
      data: cleanStatus(status.data),
      reconfirm: cleanStatus(status.reconfirm),
      control_room_phase: cleanStatus(objectAt(controlRoom, "phase1").status),
    },
    unavailable_sections: unavailableSections,
  };
}

function section(label: string, href: string, count: number | null, authority: string): Record<string, unknown> {
  return { label, href, count, authority, read_only: true };
}

function objectAt(value: unknown, key?: string): Record<string, unknown> {
  const source = key ? (value as Record<string, unknown> | null | undefined)?.[key] : value;
  return source && typeof source === "object" && !Array.isArray(source) ? source as Record<string, unknown> : {};
}

function boundedCount(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 999999) return value;
    if (typeof value === "string" && /^\d{1,6}$/.test(value)) return Number(value);
  }
  return null;
}

function cleanStatus(value: unknown): string | null {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9ก-๙ _.-]{1,80}$/.test(text) ? text : null;
}

function isReadyStatus(value: unknown): boolean {
  const text = String(value || "").trim().toLowerCase();
  return ["พร้อม", "ok", "ready", "connected"].includes(text);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = normalizePath(new URL(request.url).pathname);
    if (path === DASHBOARD_PATH) return bridgeAdminRead(request, env, "dashboard");
    if (path === DASHBOARD_ANALYTICS_PATH) return bridgeAdminRead(request, env, "dashboard-analytics");
    if (path === DASHBOARD_OWNER_ACTIONS_PATH) return bridgeAdminRead(request, env, "dashboard-owner-actions");
    if (path === DASHBOARD_ANNUAL_FINANCE_PATH) return bridgeAdminRead(request, env, "dashboard-annual-finance");
    if (path === OWNER_SNAPSHOT_PATH) return bridgeAdminRead(request, env, "owner-snapshot");
    if (path === CLIENT_INTELLIGENCE_PATH) return bridgeAdminRead(request, env, "client-intelligence");
    if (path === CLIENT_INTELLIGENCE_AUDIT_PATH) return bridgeAdminRead(request, env, "client-intelligence-audit");
    return canonicalWorker.fetch(request, env);
  },
};