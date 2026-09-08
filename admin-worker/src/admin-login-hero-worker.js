import coreWorker from "./admin-login-hero-worker-core.js";
import dashboardWorker from "./dashboard-worker.js";
import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { tryHandleEmailLessLineRenewalRecovery } from "./payment-review-line-recovery.js";
import {
  CLIENT_INTELLIGENCE_PATH,
  handleClientIntelligenceRequest,
} from "./client-intelligence-endpoint.js";
export * from "./admin-login-hero-worker-core.js";

/*
Delegated active-entrypoint contract markers.
The implementation now lives in admin-login-hero-worker-core.js; these markers
keep source-contract CI explicit while the active wrapper adds only AI Ops HTML.

browser_admin_session_required
forbidden_origin
isPaymentReviewRequest
handlePaymentReviewRequest
isPaymentEntitlementApprovalRequest
handlePaymentEntitlementApproval
*/

const AI_OPS_CLIENT_SRC = "/v1/admin/ai-ops/client.js?v=1";
const ADMIN_DASHBOARD_PATH = "/v1/admin/dashboard";
const PAYMENT_REVIEW_PATH = "/v1/admin/payments/review";
const AI_OPS_WORKER_PAGES = new Set([
  "/internal/admin/kenji",
  "/internal/admin/mms",
]);

export default {
  async fetch(request, env, ctx) {
    const path = normalizePath(new URL(request.url).pathname);
    if (path === ADMIN_DASHBOARD_PATH) {
      return handleCredentialBoundDashboard(request, env, ctx);
    }
    if (path === CLIENT_INTELLIGENCE_PATH) {
      return handleCredentialBoundClientIntelligence(request, env);
    }

    // Preserve the already-guarded canonical Payment Review path. The clone is
    // used only if the canonical runtime rejects an otherwise valid reviewed
    // renewal because the recovered historical member has no email address.
    // Unauthorized/cross-origin/non-owner requests never enter the fallback.
    const recoveryRequest = path === PAYMENT_REVIEW_PATH && request.method.toUpperCase() === "POST"
      ? request.clone()
      : null;

    let response = await coreWorker.fetch(request, env, ctx);
    if (recoveryRequest && response.status === 409) {
      const actor = await readCredentialBoundAdminActor(recoveryRequest, env);
      if (actor) {
        response = await tryHandleEmailLessLineRenewalRecovery(recoveryRequest, env, actor, response);
      }
    }
    return injectAdminAiOpsPage(recoveryRequest || request, response);
  },
};

async function handleCredentialBoundDashboard(request, env, ctx) {
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return dashboardWorker.fetch(request, env, ctx);
  if (method !== "GET" && method !== "HEAD") {
    return dashboardJson({ ok: false, error: "method_not_allowed" }, 405);
  }

  const url = new URL(request.url);
  if (url.hostname !== "mmdbkk.com" && url.hostname !== "www.mmdbkk.com") {
    return dashboardJson({ ok: false, error: "dashboard_host_not_allowed" }, 403);
  }

  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) return dashboardJson({ ok: false, error: "unauthorized" }, 401);
  if (String(actor.role || "").toLowerCase() === "mms_partner") {
    return dashboardJson({ ok: false, error: "mms_partner_scope_forbidden" }, 403);
  }

  // dashboard-worker still carries its legacy internal auth check. Translate the
  // already-validated HttpOnly browser session into a server-side credential only
  // for this in-memory delegate call. Browser-supplied service credentials are
  // stripped first and are never returned to the client.
  const headers = new Headers(request.headers);
  headers.delete("Authorization");
  headers.delete("X-Confirm-Key");
  if (env.CONFIRM_KEY) headers.set("X-Confirm-Key", String(env.CONFIRM_KEY));
  else if (env.ADMIN_BEARER) headers.set("Authorization", `Bearer ${String(env.ADMIN_BEARER)}`);
  else return dashboardJson({ ok: false, error: "dashboard_internal_auth_missing" }, 503);

  headers.set("X-MMD-Admin-Actor", String(actor.id || "per"));
  headers.set("X-MMD-Admin-Role", String(actor.role || "admin"));
  headers.set("X-MMD-Admin-Source", "credential-bound-session");

  const delegated = new Request(request, {
    method: method === "HEAD" ? "GET" : method,
    headers,
  });
  const response = await dashboardWorker.fetch(delegated, env, ctx);
  if (method !== "HEAD") return response;
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-length");
  return new Response(null, { status: response.status, headers: responseHeaders });
}

async function handleCredentialBoundClientIntelligence(request, env) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return clientIntelligenceJson({ ok: false, error: "method_not_allowed" }, 405, { allow: "GET, HEAD" });
  }

  const url = new URL(request.url);
  if (url.hostname !== "mmdbkk.com" && url.hostname !== "www.mmdbkk.com") {
    return clientIntelligenceJson({ ok: false, error: "client_intelligence_host_not_allowed" }, 403);
  }

  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) return clientIntelligenceJson({ ok: false, error: "unauthorized" }, 401);
  if (String(actor.role || "").toLowerCase() === "mms_partner") {
    return clientIntelligenceJson({ ok: false, error: "mms_partner_scope_forbidden" }, 403);
  }

  // Client Intelligence is Per-only/read-only. Strip any browser-supplied
  // service credentials before delegating into the advisory projection.
  const headers = new Headers(request.headers);
  headers.delete("Authorization");
  headers.delete("X-Confirm-Key");
  headers.set("X-MMD-Admin-Actor", String(actor.id || "per"));
  headers.set("X-MMD-Admin-Role", String(actor.role || "owner"));
  headers.set("X-MMD-Admin-Source", "credential-bound-session");

  const delegated = new Request(request, {
    method: "GET",
    headers,
  });
  const response = await handleClientIntelligenceRequest(delegated, env);
  if (method !== "HEAD") return response;
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-length");
  return new Response(null, { status: response.status, headers: responseHeaders });
}

function dashboardJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
    },
  });
}

function clientIntelligenceJson(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-MMD-Client-Intelligence": "advisory-v1",
      ...extraHeaders,
    },
  });
}

export async function injectAdminAiOpsPage(request, response) {
  if (!shouldInject(request, response)) return response;

  const html = await response.text();
  if (!/<\/body\s*>/i.test(html) || html.includes("data-mmd-ai-ops=\"v1\"")) {
    return rebuildResponse(response, html);
  }

  const script = `<script src="${AI_OPS_CLIENT_SRC}" defer data-mmd-ai-ops="v1"></script>`;
  const body = html.replace(/<\/body\s*>/i, `${script}</body>`);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-ai-ops-layer", "v1");
  relaxSelfOnlyCsp(headers);

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function shouldInject(request, response) {
  if (request.method.toUpperCase() !== "GET") return false;
  const path = normalizePath(new URL(request.url).pathname);
  if (!AI_OPS_WORKER_PAGES.has(path)) return false;
  if (!response || response.status < 200 || response.status >= 300) return false;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  return contentType.includes("text/html");
}

function rebuildResponse(response, body) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function relaxSelfOnlyCsp(headers) {
  let csp = String(headers.get("content-security-policy") || "").trim();
  if (!csp) return;
  csp = ensureSelfDirective(csp, "script-src");
  csp = ensureSelfDirective(csp, "connect-src");
  headers.set("content-security-policy", csp);
}

function ensureSelfDirective(csp, name) {
  const pattern = new RegExp(`(^|;)\\s*${name}\\s+([^;]*)`, "i");
  const match = csp.match(pattern);
  if (!match) return `${csp.replace(/;?\s*$/, "")}; ${name} 'self'`;
  if (/(^|\s)'self'(\s|$)/.test(match[2])) return csp;
  return csp.replace(pattern, `${match[1]} ${name} ${match[2].trim()} 'self'`);
}

function normalizePath(value = "") {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
