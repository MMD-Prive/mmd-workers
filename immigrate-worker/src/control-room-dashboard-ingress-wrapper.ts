import canonicalWorker from "./canonical-admin-login-wrapper";
import type { Env } from "./types";

const DASHBOARD_PATH = "/v1/admin/dashboard";
const CLIENT_INTELLIGENCE_PATH = "/v1/admin/clients/intelligence";
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

async function bridgeAdminRead(request: Request, env: Env, kind: "dashboard" | "client-intelligence"): Promise<Response> {
  const url = new URL(request.url);
  const marker = kind === "dashboard"
    ? "immigrate-to-admin-v1"
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
    if (path === CLIENT_INTELLIGENCE_PATH) return bridgeAdminRead(request, env, "client-intelligence");
    return canonicalWorker.fetch(request, env);
  },
};
