import canonicalWorker from "./canonical-admin-login-wrapper";
import type { Env } from "./types";

const DASHBOARD_PATH = "/v1/admin/dashboard";
const DASHBOARD_ANALYTICS_PATH = "/v1/admin/dashboard/analytics";
const DASHBOARD_OWNER_ACTIONS_PATH = "/v1/admin/dashboard/owner-actions";
const CLIENT_INTELLIGENCE_PATH = "/v1/admin/clients/intelligence";
const CLIENT_INTELLIGENCE_AUDIT_PATH = "/v1/admin/clients/intelligence/audit";
const PUBLIC_HOSTS = new Set(["mmdbkk.com", "www.mmdbkk.com"]);

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

async function bridgeAdminRead(
  request: Request,
  env: Env,
  kind: "dashboard" | "dashboard-analytics" | "dashboard-owner-actions" | "client-intelligence" | "client-intelligence-audit",
): Promise<Response> {
  const url = new URL(request.url);
  const marker = kind === "dashboard"
    ? "immigrate-to-admin-v1"
    : kind === "dashboard-analytics"
      ? "immigrate-to-admin-analytics-v1"
    : kind === "dashboard-owner-actions"
      ? "immigrate-to-admin-owner-actions-v1"
      : kind === "client-intelligence-audit"
        ? "immigrate-to-admin-client-intelligence-audit-v1"
        : "immigrate-to-admin-client-intelligence-v1";
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
  headers.set("x-mmd-auth-bridge", kind === "dashboard"
    ? "immigrate-control-room-dashboard"
    : kind === "dashboard-analytics"
      ? "immigrate-control-room-analytics"
    : kind === "dashboard-owner-actions"
      ? "immigrate-dashboard-owner-actions"
      : kind === "client-intelligence-audit"
        ? "immigrate-client-intelligence-audit"
        : "immigrate-client-intelligence");
  headers.set("x-mmd-public-host", url.hostname);

  const forwarded = new Request(request, { headers });
  const response = await env.ADMIN_WORKER.fetch(forwarded);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("cache-control", "no-store, private");
  responseHeaders.set("x-mmd-control-room-dashboard-ingress", marker);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = normalizePath(new URL(request.url).pathname);
    if (path === DASHBOARD_PATH) return bridgeAdminRead(request, env, "dashboard");
    if (path === DASHBOARD_ANALYTICS_PATH) return bridgeAdminRead(request, env, "dashboard-analytics");
    if (path === DASHBOARD_OWNER_ACTIONS_PATH) return bridgeAdminRead(request, env, "dashboard-owner-actions");
    if (path === CLIENT_INTELLIGENCE_PATH) return bridgeAdminRead(request, env, "client-intelligence");
    if (path === CLIENT_INTELLIGENCE_AUDIT_PATH) return bridgeAdminRead(request, env, "client-intelligence-audit");
    return canonicalWorker.fetch(request, env);
  },
};
