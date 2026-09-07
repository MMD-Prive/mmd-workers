import aiOpsWorker from "./ceo-bridge.js";

const CONTEXT_PATH = "/v1/admin/ai-ops/context";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && normalizePath(url.pathname) === CONTEXT_PATH) {
      const auth = await verifyAdminStrict(request);
      if (!auth.ok) {
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
          status: 401,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
    }
    return aiOpsWorker.fetch(request, env, ctx);
  },
};

async function verifyAdminStrict(request) {
  try {
    const url = new URL(request.url);
    url.pathname = "/v1/admin/auth/me";
    url.search = "";
    const headers = new Headers({ accept: "application/json" });
    for (const key of ["cookie", "origin", "user-agent"]) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      redirect: "manual",
    });
    if (!response.ok) return { ok: false };
    const body = await response.json().catch(() => null);
    return {
      ok: Boolean(body && body.ok === true && body.authenticated === true),
      actor: body || null,
    };
  } catch {
    return { ok: false };
  }
}

function normalizePath(value = "") {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
