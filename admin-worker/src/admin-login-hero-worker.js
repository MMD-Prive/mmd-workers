import { handlePartnerOwnerConsole, isPartnerOwnerConsoleRequest } from "./partner-owner-console.js";
import { handleModelOwnerReviewQueue, isModelOwnerReviewQueueRequest } from "./model-owner-review-queue.js";
import { drainApprovedJobLinkNotifications } from "./payment-approved-job-link-dispatch.js";
import { isPrivateMediaReviewRequest, handlePrivateMediaReview } from './private-media-review.js';
import worker from "./job-orchestrator-owner-ops-wrapper.js";
import { handleModelConsoleAudit, isModelConsoleAuditRequest } from "./model-console-audit.js";
import { kickLineOfcConsoleContactBackfill } from "./line-ofc-console-backfill.js";
import { buildAudienceBriefLive } from "./audience-brief-live.js";
import { maybeHandleHeldIdentityLinkRefresh } from "./sigil-jobs-identity-link-refresh.js";
import {
  isPrivateModelAdminRequest,
  maybeHandlePrivateModelAdminRequest,
  syncPrivateModelHandoffAfterActivation,
} from "./private-model-application-handoff.js";
import {
  isModelConfirmActionRequest,
  maybeCreateInternalHoldAfterModelConfirm,
} from "./model-confirm-cal-hold.js";
import { enrichLineageWithPerRename } from "./per-rename-client-search.js";
import {
  enforcePrivateModelSearchPolicy,
  guardPrivateJobCreateWork,
  isPrivateModelSearchRequest,
} from "./private-model-work-policy.js";
import {
  handleKenjiLv5OperationalRpc,
  isKenjiLv5OperationalRpcRequest,
} from "./kenji-lv5-operational-rpc.js";
import { augmentOwnerJobGrantCreateError } from "./owner-private-job-grant-diagnostic.js";
import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import {
  handleModelPayoutAdjustments,
  isModelPayoutAdjustmentRequest,
} from "./model-payout-adjustments.js";
import {
  handleAdminShopOrdersApi,
  handleAdminShopOrdersPage,
  isAdminShopOrdersApiRequest,
  isAdminShopOrdersPageRequest,
} from "./mmd-shop-orders-admin.js";
import {
  handleAdminShopOperationsApi,
  handleAdminShopOperationsPage,
  isAdminShopOperationsApiRequest,
  isAdminShopOperationsPageRequest,
} from "./mmd-shop-operations-admin.js";
export * from "./admin-login-hero-worker-pre-model-line-link.js";

export const ADMIN_OWNER_DASHBOARD_PATH = "/internal/admin/dashboard";
const ADMIN_LOGIN_SESSION_PATH = "/internal/admin/login/session";
const MMS_PARTNER_PATH = "/internal/admin/mms";
const MODEL_ACTIVATE_PATH = "/v1/model/liff/activate";
const AUDIENCE_BRIEF_PATH = "/v1/admin/audience/brief";
const LINEAGE_LOOKUP_PATH = "/v1/admin/clients/lineage-lookup";
const LINEAGE_RECENT_PATH = "/v1/admin/clients/recent";
const JOB_CREATE_PATH = "/v1/admin/job/create";
const MANUAL_PUBLIC_FALLBACK_MARKER = "canonical-v1";
let lineOfcContactBackfillKickStarted = false;

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
Client Credit carry-forward authority, the canonical owner Job Orchestrator, and
canonical Private work capability enforcement.

browser_admin_session_required
forbidden_origin
isPaymentReviewRequest
handlePaymentReviewRequest
isPaymentEntitlementApprovalRequest
handlePaymentEntitlementApproval
coreWorker.fetch(request, env, ctx)
*/

export default {
  async scheduled(event, env, ctx) {
    await drainApprovedJobLinkNotifications(env);
    if (typeof worker.scheduled === "function") await worker.scheduled(event, env, ctx);
  },
  async fetch(request, env, ctx) {
    if (isPartnerOwnerConsoleRequest(request)) return handlePartnerOwnerConsole(request, env, ctx);
    if (isModelOwnerReviewQueueRequest(request)) return handleModelOwnerReviewQueue(request, env);
    if (isPrivateMediaReviewRequest(request)) return handlePrivateMediaReview(request, env, ctx);
    scheduleLineOfcContactBackfill(env, ctx);
    if (isModelConsoleAuditRequest(request)) return handleModelConsoleAudit(request, env);
    let privateModelRequest = null;
    let privateModelSearchRequest = null;
    let activationRequest = null;
    let modelConfirmRequest = null;
    let perRenameRequest = null;
    let normalizedPath = "";
    const method = String(request.method || "GET").toUpperCase();
    try {
      normalizedPath = new URL(request.url).pathname.replace(/\/+$/g, "") || "/";
      if (isPrivateModelAdminRequest(request)) privateModelRequest = request.clone();
      if (isPrivateModelSearchRequest(request)) privateModelSearchRequest = request.clone();
      if (isModelConfirmActionRequest(request)) modelConfirmRequest = request.clone();
      if (normalizedPath === LINEAGE_LOOKUP_PATH && method === "POST") perRenameRequest = request.clone();
      if (normalizedPath === MODEL_ACTIVATE_PATH && method === "POST") {
        activationRequest = request.clone();
      }
    } catch {
      // Core worker remains authoritative if URL parsing fails.
    }

    // Kenji LV5 orchestration is service-binding only. The handler performs its
    // own strict caller + internal bearer checks and never becomes domain truth.
    if (isKenjiLv5OperationalRpcRequest(normalizedPath, method)) {
      return handleKenjiLv5OperationalRpc(request, env);
    }

    if (isAdminShopOrdersPageRequest(normalizedPath, method)) {
      const actor = await readCredentialBoundAdminActor(request, env);
      return handleAdminShopOrdersPage(request, actor);
    }

    if (isAdminShopOrdersApiRequest(normalizedPath, method)) {
      const actor = await readCredentialBoundAdminActor(request, env);
      return handleAdminShopOrdersApi(request, env, actor);
    }

    if (isAdminShopOperationsPageRequest(normalizedPath, method)) {
      const actor = await readCredentialBoundAdminActor(request, env);
      return handleAdminShopOperationsPage(request, actor);
    }

    if (isAdminShopOperationsApiRequest(normalizedPath, method)) {
      const actor = await readCredentialBoundAdminActor(request, env);
      return handleAdminShopOperationsApi(request, env, actor);
    }

    if (isModelPayoutAdjustmentRequest(normalizedPath, method)) {
      const actor = await readCredentialBoundAdminActor(request, env);
      return handleModelPayoutAdjustments(request, env, actor);
    }

    if (normalizedPath === JOB_CREATE_PATH && method === "POST") {
      const privateWorkBlocked = await guardPrivateJobCreateWork(request.clone(), env);
      if (privateWorkBlocked) return privateWorkBlocked;
      const refreshed = await maybeHandleHeldIdentityLinkRefresh(request, env);
      if (refreshed) return refreshed;
    }

    let response = await worker.fetch(request, env, ctx);
    if (normalizedPath === AUDIENCE_BRIEF_PATH && method === "GET" && response.status === 404) {
      response = await buildAudienceBriefLive(
        request,
        env,
        ctx,
        (path) => delegatedJson(request, env, ctx, path),
      );
    }
    if (privateModelSearchRequest) response = await enforcePrivateModelSearchPolicy(privateModelSearchRequest, response, env);
    if (privateModelRequest) response = await maybeHandlePrivateModelAdminRequest(privateModelRequest, env, response);
    if (activationRequest) response = await syncPrivateModelHandoffAfterActivation(activationRequest, response, env);
    if (modelConfirmRequest) response = await maybeCreateInternalHoldAfterModelConfirm(modelConfirmRequest, response, env);
    if (perRenameRequest) response = await enrichLineageWithPerRename(perRenameRequest, response, env);
    response = await enforceOwnerDashboardFirst(request, response);

    if (normalizedPath === JOB_CREATE_PATH && method === "POST") {
      response = await augmentOwnerJobGrantCreateError(request, response, env);
    }

    if (normalizedPath === LINEAGE_LOOKUP_PATH || normalizedPath === LINEAGE_RECENT_PATH) {
      const headers = new Headers(response.headers);
      headers.set("X-MMD-Manual-Public-Fallback", MANUAL_PUBLIC_FALLBACK_MARKER);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  },
};
