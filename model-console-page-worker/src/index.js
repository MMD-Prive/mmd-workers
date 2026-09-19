const WEBFLOW_ORIGIN = "https://mmdprive.webflow.io";
const CANONICAL_PATH = "/sigil/model/console";
const LEGACY_PATHS = new Set(["/model/console", "/model/console/"]);

function normalizePath(pathname) {
  if (!pathname) return "/";
  const normalized = pathname.replace(/\/{2,}/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/+$/g, "") : normalized;
}

function withOwnershipHeaders(response, origin) {
  const headers = new Headers(response.headers);
  headers.set("x-mmd-route-owner", "model-console-page-worker");
  headers.set("x-mmd-page", "sigil-model-console");
  headers.set("x-mmd-origin", origin);
  headers.set("x-mmd-route-version", "20260726-model-console-webflow-owner-v1");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function canonicalRedirect(request, url) {
  const target = new URL(request.url);
  target.protocol = "https:";
  target.hostname = "mmdbkk.com";
  target.pathname = CANONICAL_PATH;
  return withOwnershipHeaders(Response.redirect(target.toString(), 301), "canonical-redirect");
}

async function fetchWebflowPage(request, url) {
  const target = new URL(WEBFLOW_ORIGIN);
  target.pathname = CANONICAL_PATH;
  target.search = url.search;

  const headers = new Headers(request.headers);
  headers.set("host", target.hostname);
  headers.set("x-forwarded-host", url.hostname);
  headers.set("x-forwarded-proto", "https");

  const upstreamRequest = new Request(target.toString(), {
    method: request.method,
    headers,
    redirect: "follow",
  });

  const response = await fetch(upstreamRequest);
  return withOwnershipHeaders(response, WEBFLOW_ORIGIN);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const path = normalizePath(url.pathname);

    if (method !== "GET" && method !== "HEAD") {
      return withOwnershipHeaders(
        new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
          status: 405,
          headers: {
            "content-type": "application/json; charset=utf-8",
            allow: "GET, HEAD",
          },
        }),
        "method-guard"
      );
    }

    if (LEGACY_PATHS.has(url.pathname.toLowerCase())) {
      return canonicalRedirect(request, url);
    }

    if (path !== CANONICAL_PATH) {
      return withOwnershipHeaders(
        new Response(JSON.stringify({ ok: false, error: "not_found" }), {
          status: 404,
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
        "route-guard"
      );
    }

    return fetchWebflowPage(request, url);
  },
};
