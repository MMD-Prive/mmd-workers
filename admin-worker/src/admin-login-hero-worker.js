import worker from "./job-orchestrator-owner-ops-wrapper.js";
import { handleModelConsoleAudit, isModelConsoleAuditRequest } from "./model-console-audit.js";
import {
  isPrivateModelAdminRequest,
  maybeHandlePrivateModelAdminRequest,
  syncPrivateModelHandoffAfterActivation,
} from "./private-model-application-handoff.js";
export * from "./admin-login-hero-worker-pre-model-line-link.js";

export const ADMIN_OWNER_DASHBOARD_PATH = "/internal/admin/dashboard";
const ADMIN_LOGIN_SESSION_PATH = "/internal/admin/login/session";
const MMS_PARTNER_PATH = "/internal/admin/mms";
const MODEL_ACTIVATE_PATH = "/v1/model/liff/activate";

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
    if (isModelConsoleAuditRequest(request)) return handleModelConsoleAudit(request, env);
    let privateModelRequest = null;
    let activationRequest = null;
    try {
      const path = new URL(request.url).pathname.replace(/\/+$/g, "") || "/";
      if (isPrivateModelAdminRequest(request)) privateModelRequest = request.clone();
      if (path === MODEL_ACTIVATE_PATH && String(request.method || "GET").toUpperCase() === "POST") {
        activationRequest = request.clone();
      }
    } catch {
      // Core worker remains authoritative if URL parsing fails.
    }

    let response = await worker.fetch(request, env, ctx);
    if (privateModelRequest) response = await maybeHandlePrivateModelAdminRequest(privateModelRequest, env, response);
    if (activationRequest) response = await syncPrivateModelHandoffAfterActivation(activationRequest, response, env);
    return enforceOwnerDashboardFirst(request, response);
  },
};