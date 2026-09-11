const PATHS = new Set([
  "/member/api/mms/service-zones",
  "/member/api/liff/mms/service-zones",
]);

export function isMmsServiceZoneCatalogPath(url) {
  const path = normalizePath(url instanceof URL ? url.pathname : String(url || ""));
  return PATHS.has(path);
}

export async function handleMmsServiceZoneCatalog(request, env = {}) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: responseHeaders("GET,OPTIONS"),
    });
  }
  if (request.method !== "GET") {
    return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, "GET,OPTIONS");
  }
  if (!env.MMS_WORKER?.fetch) {
    return json({ ok: false, error: { code: "MMS_UPSTREAM_NOT_CONFIGURED" } }, 503, "GET,OPTIONS");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await env.MMS_WORKER.fetch(new Request("https://mms.internal/mms/api/service-zones", {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    }));
    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return json({ ok: false, error: { code: "MMS_UPSTREAM_INVALID" } }, 502, "GET,OPTIONS");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json({ ok: false, error: { code: "MMS_UPSTREAM_INVALID" } }, 502, "GET,OPTIONS");
    }
    return json(payload, upstream.status, "GET,OPTIONS");
  } catch (error) {
    return json({
      ok: false,
      error: { code: error?.name === "AbortError" ? "MMS_UPSTREAM_TIMEOUT" : "MMS_UPSTREAM_UNAVAILABLE" },
    }, error?.name === "AbortError" ? 504 : 502, "GET,OPTIONS");
  } finally {
    clearTimeout(timeout);
  }
}

function responseHeaders(allow = "GET,OPTIONS") {
  return new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    Allow: allow,
  });
}

function json(payload, status = 200, allow) {
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders(allow) });
}

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export const mmsServiceZoneCatalogFacadeContract = Object.freeze({
  paths: Object.freeze([...PATHS]),
  upstream: "/mms/api/service-zones",
  auth: "public catalog; no member identity required",
  browser_delivery: "same-origin via member-pages-worker",
});
