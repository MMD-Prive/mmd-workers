import { handleLegacyAssetHost } from "./legacy-media-retirement.js";
import entitlementRuntime from "./entitlement-runtime-worker.js";
import modelImagePolicyWorker from "./model-image-policy-worker.js";
import { attachCareBackApprovalToConfirmedBooking } from "./care-back-trusted-caller.js";
import { handlePublicProfilesCatalogRequest, isPublicProfilesCatalogRequest } from "./public-profiles-catalog.js";

const CLIENT_RESOLVE_PATH = "/sigil/api/client/resolve";
const BOOKING_INTAKE_PATH = "/sigil/api/booking/intake";
const BOOKING_CONFIRM_PATH = "/__internal/booking/confirm";
const MODEL_SEARCH_PATH = "/sigil/api/models/search";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();
    if (url.hostname === "models.mmdbkk.com") return handleLegacyAssetHost(request, env);

    if (isPublicProfilesCatalogRequest(path, method)) {
      return handlePublicProfilesCatalogRequest(request, env);
    }

    if (method === "POST" && path === BOOKING_CONFIRM_PATH) {
      const approvalRequest = request.clone();
      const response = await entitlementRuntime.fetch(request, env, ctx);
      return attachCareBackApprovalToConfirmedBooking(approvalRequest, env, response);
    }

    if (method === "POST" && [CLIENT_RESOLVE_PATH, BOOKING_INTAKE_PATH].includes(path)) {
      return entitlementRuntime.fetch(request, env, ctx);
    }

    if ((method === "GET" || method === "POST") && path === MODEL_SEARCH_PATH) {
      return modelImagePolicyWorker.fetch(request, env, ctx);
    }

    return modelImagePolicyWorker.fetch(request, env, ctx);
  },
};

export async function requestedScope(request, url) {
  const queryScope = clean(url.searchParams.get("scope")).toLowerCase();
  if (queryScope === "private") return "private";
  if (queryScope === "booking") return "booking";
  if (request.method.toUpperCase() !== "POST") return "public";
  const body = await request.clone().json().catch(() => ({}));
  const bodyScope = clean(body.scope || body.model_scope).toLowerCase();
  if (bodyScope === "private") return "private";
  if (bodyScope === "booking") return "booking";
  return "public";
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
function clean(value) { return String(value ?? "").trim(); }
