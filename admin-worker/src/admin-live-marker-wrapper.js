import worker from "./admin-login-hero-worker.js";
export * from "./admin-login-hero-worker.js";

const LINEAGE_LOOKUP_PATH = "/v1/admin/clients/lineage-lookup";
const LINEAGE_RECENT_PATH = "/v1/admin/clients/recent";
const MANUAL_PUBLIC_FALLBACK_MARKER = "canonical-v1";

export default {
  async fetch(request, env, ctx) {
    const response = await worker.fetch(request, env, ctx);
    const pathname = normalizePath(new URL(request.url).pathname);
    if (pathname !== LINEAGE_LOOKUP_PATH && pathname !== LINEAGE_RECENT_PATH) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set("X-MMD-Manual-Public-Fallback", MANUAL_PUBLIC_FALLBACK_MARKER);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

function normalizePath(value) {
  const pathname = String(value || "/").replace(/\/{2,}/g, "/");
  return pathname.length > 1 ? pathname.replace(/\/+$/g, "") : pathname;
}
