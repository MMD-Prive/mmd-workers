import baseWorker, { KenjiKnowledgeCoordinator } from "./admin-login-hero-worker.js";
import {
  MODEL_ACTIVATION_ADMIN_PATH,
  MODEL_ACTIVATION_LIFF_PATH,
  ModelActivationCoordinator,
  activateModelLine,
  issueModelActivation,
} from "./model-first-time-activation.js";

export { KenjiKnowledgeCoordinator, ModelActivationCoordinator };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (path === MODEL_ACTIVATION_LIFF_PATH) {
      return activateModelLine(request, env, baseWorker);
    }

    if (path === MODEL_ACTIVATION_ADMIN_PATH) {
      if (method === "OPTIONS") return baseWorker.fetch(request, env, ctx);
      const auth = await verifyAdminSessionWithCanonicalGate(request, env, ctx);
      if (!auth.ok) return auth.response;
      return issueModelActivation(request, env);
    }

    return baseWorker.fetch(request, env, ctx);
  },
};

async function verifyAdminSessionWithCanonicalGate(request, env, ctx) {
  const authUrl = new URL("/v1/admin/auth/me", request.url);
  const probe = new Request(authUrl.toString(), {
    method: "GET",
    headers: request.headers,
  });
  const response = await baseWorker.fetch(probe, env, ctx);
  if (response.ok) return { ok: true };

  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store, private");
  return {
    ok: false,
    response: new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  };
}

function normalizePath(value = "") {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}
