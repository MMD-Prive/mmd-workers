import { handlePartnerOwnerConsole, isPartnerOwnerConsoleRequest } from "./partner-owner-console.js";
import { handleModelOwnerReviewQueue, isModelOwnerReviewQueueRequest } from "./model-owner-review-queue.js";
import { drainApprovedJobLinkNotifications } from "./payment-approved-job-link-dispatch.js";
import { reconcilePendingMembershipRecoveries } from "./membership-payment-pending-recovery.js";
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
import {
  handleSigilAvailabilityInternalRequest,
  isSigilAvailabilityInternalRequest,
} from "./sigil-availability-snapshot.js";
import { augmentOwnerJobGrantCreateError } from "./owner-private-job-grant-diagnostic.js";
import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import {
  handleKenjiConversationShadowReceiptAdmin,
  isKenjiConversationShadowReceiptAdminRequest,
} from "./kenji-conversation-shadow-receipt-admin.js";
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

export function modelMoneyRuntimeEnv(env = {}) {
  const modelPackageField = String(env?.AT_SESSIONS__MODEL_PACKAGE_CODE || "").trim() || "model_package_code";
  return {
    ...env,
    // Never allow the model-money resolver to read Sessions.package_code. That
    // field is Membership/access-only. Model service packages have a separate
    // canonical field so Public pricing cannot leak into Private money policy.
    AT_SESSIONS__PACKAGE_CODE: modelPackageField,
  };
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
    const runtimeEnv = modelMoneyRuntimeEnv(env);
    await drainApprovedJobLinkNotifications(runtimeEnv);
    await reconcilePendingMembershipRecoveries(runtimeEnv);
    if (typeof worker.scheduled === "function") await worker.scheduled(event, runtimeEnv, ctx);
  },
  async fetch(request, env, ctx) {
    const runtimeEnv = modelMoneyRuntimeEnv(env);
    if (isPartnerOwnerConsoleRequest(request)) return handlePartnerOwnerConsole(request, runtimeEnv, ctx);
    if (isModelOwnerReviewQueueRequest(request)) return handleModelOwnerReviewQueue(request, runtimeEnv);
    if (isPrivateMediaReviewRequest(request)) return handlePrivateMediaReview(request, runtimeEnv, ctx);
    scheduleLineOfcContactBackfill(runtimeEnv, ctx);
    if (isModelConsoleAuditRequest(request)) return handleModelConsoleAudit(request, runtimeEnv);
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

    // SIGIL Availability Snapshot is a service-only write boundary. It accepts
    // only sanitized Model Console / Model App inputs and writes no raw operational
    // context into the recommendation KV.
    if (isSigilAvailabilityInternalRequest(normalizedPath, method)) {
      return handleSigilAvailabilityInternalRequest(request, runtimeEnv);
    }

    // Kenji LV5 orchestration is service-binding only. The handler performs its
    // own strict caller + internal bearer checks and never becomes domain truth.
    if (isKenjiLv5OperationalRpcRequest(normalizedPath, method)) {
      return handleKenjiLv5OperationalRpc(request, runtimeEnv);
    }

    if (isAdminShopOrdersPageRequest(normalizedPath, method)) {
      const actor = await readCredentialBoundAdminActor(request, runtimeEnv);
      return handleAdminShopOrdersPage(request, actor);
    }

    if (isAdminShopOrdersApiRequest(normalizedPath, method)) {
      const actor = await readCredentialBoundAdminActor(request, runtimeEnv);
      return handleAdminShopOrdersApi(request, runtimeEnv, actor);
    }

    if (isAdminShopOperationsPageRequest(normalizedPath, method)) {
      const actor = await readCredentialBoundAdminActor(request, runtimeEnv);
      return handleAdminShopOperationsPage(request, actor);
    }

    if (isAdminShopOperationsApiRequest(normalizedPath, method)) {
      const actor = await readCredentialBoundAdminActor(request, runtimeEnv);
      return handleAdminShopOperationsApi(request, runtimeEnv, actor);
    }

    if (isModelPayoutAdjustmentRequest(normalizedPath, method)) {
      const actor = await readCredentialBoundAdminActor(request, runtimeEnv);
      return handleModelPayoutAdjustments(request, runtimeEnv, actor);
    }

    if (isKenjiConversationShadowReceiptAdminRequest(normalizedPath, method)) {
      const actor = await readCredentialBoundAdminActor(request, runtimeEnv);
      return handleKenjiConversationShadowReceiptAdmin(runtimeEnv, actor);
    }

    if (normalizedPath === JOB_CREATE_PATH && method === "POST") {
      const privateWorkBlocked = await guardPrivateJobCreateWork(request.clone(), runtimeEnv);
      if (privateWorkBlocked) return privateWorkBlocked;
      const refreshed = await maybeHandleHeldIdentityLinkRefresh(request, runtimeEnv);
      if (refreshed) return refreshed;
    }

    let response = await worker.fetch(request, runtimeEnv, ctx);
    if (normalizedPath === AUDIENCE_BRIEF_PATH && method === "GET" && response.status === 404) {
      response = await buildAudienceBriefLive(
        request,
        runtimeEnv,
        ctx,
        (path) => delegatedJson(request, runtimeEnv, ctx, path),
      );
    }
    if (privateModelSearchRequest) response = await enforcePrivateModelSearchPolicy(privateModelSearchRequest, response, runtimeEnv);
    if (privateModelRequest) response = await maybeHandlePrivateModelAdminRequest(privateModelRequest, runtimeEnv, response);
    if (activationRequest) response = await syncPrivateModelHandoffAfterActivation(activationRequest, response, runtimeEnv);
    if (modelConfirmRequest) response = await maybeCreateInternalHoldAfterModelConfirm(modelConfirmRequest, response, runtimeEnv);
    if (perRenameRequest) response = await enrichLineageWithPerRename(perRenameRequest, response, runtimeEnv);
    response = await enforceOwnerDashboardFirst(request, response);

    if (normalizedPath === JOB_CREATE_PATH && method === "POST") {
      response = await augmentOwnerJobGrantCreateError(request, response, runtimeEnv);
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
