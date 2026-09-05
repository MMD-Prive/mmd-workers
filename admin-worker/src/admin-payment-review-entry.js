import adminWorker from "./admin-login-hero-worker.js";
import { handlePaymentReviewRequest, isPaymentReviewRequest } from "./payment-review-runtime.js";

export { KenjiKnowledgeCoordinator, ModelActivationCoordinator, ModelLocationCoordinator } from "./admin-login-hero-worker.js";

const DASHBOARD_AUTH_PROBE_PATH = "/v1/admin/dashboard";
const ALLOWED_BROWSER_ORIGINS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (!isPaymentReviewRequest(path, method)) return adminWorker.fetch(request, env, ctx);

    if (request.headers.get("Authorization") || request.headers.get("X-Confirm-Key")) {
      return json({ ok: false, error: "browser_admin_session_required" }, 403);
    }

    if (method === "POST") {
      const origin = request.headers.get("Origin") || "";
      if (origin !== url.origin || !ALLOWED_BROWSER_ORIGINS.has(origin)) {
        return json({ ok: false, error: "forbidden_origin" }, 403);
      }
    }

    const probe = new Request(new URL(DASHBOARD_AUTH_PROBE_PATH, request.url), {
      method: "GET",
      headers: copyProbeHeaders(request.headers),
    });
    const authResponse = await adminWorker.fetch(probe, env, ctx);
    if (!authResponse.ok) return sanitizeAuthFailure(authResponse);

    return handlePaymentReviewRequest(request, env, { id: "boss-per", role: "owner" });
  },
};

function copyProbeHeaders(source) {
  const headers = new Headers();
  for (const name of ["Cookie", "Origin", "User-Agent", "Accept-Language"]) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function sanitizeAuthFailure(response) {
  if (response.status === 401 || response.status === 403) {
    return json({ ok: false, authenticated: false, error: response.status === 403 ? "forbidden" : "unauthorized" }, response.status);
  }
  return json({ ok: false, error: "admin_auth_probe_unavailable" }, 503);
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
    },
  });
}
