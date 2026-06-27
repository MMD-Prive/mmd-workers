/**
 * SIGIL Booking Canonical Proxy Worker
 *
 * Purpose:
 * - Keep /sigil/booking canonical on https://sigil.mmdbkk.com/sigil/booking
 * - Route the canonical page to the current Webflow page source
 * - Prevent the old/default SIGIL booking page from being served on the canonical host
 * - Redirect mmdbkk.com and www.mmdbkk.com front-gate requests to the canonical host
 * - Preserve only safe access/query params during front-gate redirects
 *
 * This worker owns page HTML only. It does not handle /api/sigil/*.
 */

export const WORKER_NAME = "sigil-booking-proxy-worker";
export const RUNTIME_VERSION = "20260627-sigil-booking-canonical-proxy";
export const CANONICAL_HOST = "sigil.mmdbkk.com";
export const CANONICAL_PROTOCOL = "https:";
export const SIGIL_BOOKING_PATH = "/sigil/booking";
export const WEBFLOW_ORIGIN = "https://mmdprive.webflow.io";
export const WEBFLOW_BOOKING_PATH = "/sigil/booking";

export const FRONT_GATE_HOSTS = new Set(["mmdbkk.com", "www.mmdbkk.com"]);
export const CANONICAL_HOSTS = new Set([CANONICAL_HOST]);
export const SAFE_FRONT_GATE_PARAMS = new Set(["t", "code", "promo", "model_id", "request_id"]);

export function normalizePath(pathname) {
  let path = pathname || "/";
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/g, "");
  return path || "/";
}

export function isSigilBookingPath(url) {
  return normalizePath(url.pathname).toLowerCase() === SIGIL_BOOKING_PATH;
}

export function isFrontGateHost(url) {
  return FRONT_GATE_HOSTS.has(url.hostname.toLowerCase());
}

export function isCanonicalHost(url) {
  return CANONICAL_HOSTS.has(url.hostname.toLowerCase());
}

export function isSafePageMethod(request) {
  const method = request.method.toUpperCase();
  return method === "GET" || method === "HEAD";
}

export function canonicalBookingUrl(url) {
  const target = new URL(`${CANONICAL_PROTOCOL}//${CANONICAL_HOST}${SIGIL_BOOKING_PATH}`);

  for (const [key, value] of url.searchParams.entries()) {
    if (SAFE_FRONT_GATE_PARAMS.has(key)) target.searchParams.set(key, value);
  }

  return target;
}

function pageHeaders(extra = {}) {
  const headers = new Headers({
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "x-mmd-worker": WORKER_NAME,
    "x-mmd-route-owner": WORKER_NAME,
    "x-mmd-page": "sigil-booking",
    "x-mmd-runtime-version": RUNTIME_VERSION,
    ...extra,
  });
  return headers;
}

function redirectToCanonical(url) {
  const target = canonicalBookingUrl(url);
  const response = Response.redirect(target.toString(), 302);
  const headers = pageHeaders({
    location: response.headers.get("location") || target.toString(),
    "x-mmd-redirect-reason": "canonical_sigil_host",
  });

  return new Response(null, {
    status: 302,
    statusText: "Found",
    headers,
  });
}

function withProxyHeaders(response, extra = {}) {
  const headers = new Headers(response.headers);

  for (const [key, value] of pageHeaders(extra).entries()) {
    headers.set(key, value);
  }

  headers.set("x-mmd-origin", WEBFLOW_ORIGIN);
  headers.set("x-mmd-booking-source", "webflow-live");
  headers.set("x-mmd-page-source", `${WEBFLOW_ORIGIN}${WEBFLOW_BOOKING_PATH}`);
  headers.delete("content-length");

  return headers;
}

function injectPageMarkers(html) {
  const marker = `<meta name="mmd-page-owner" content="${WORKER_NAME}">
<meta name="mmd-page-source" content="mmdprive.webflow.io/sigil/booking">
<meta name="mmd-page-version" content="sigil-booking-next">`;

  if (html.includes("mmd-page-owner")) return html;
  if (html.includes("</head>")) return html.replace("</head>", `${marker}\n</head>`);
  return `${marker}\n${html}`;
}

async function fetchBookingFromWebflow(request, url) {
  const upstream = new URL(`${WEBFLOW_ORIGIN}${WEBFLOW_BOOKING_PATH}`);
  upstream.search = url.search;

  const upstreamRequest = new Request(upstream.toString(), {
    method: "GET",
    headers: {
      accept: request.headers.get("accept") || "text/html,application/xhtml+xml",
      "accept-language": request.headers.get("accept-language") || "th,en;q=0.9",
      "user-agent": request.headers.get("user-agent") || WORKER_NAME,
    },
  });

  const upstreamResponse = await fetch(upstreamRequest);

  if (!upstreamResponse.ok) {
    return new Response("SIGIL Booking is temporarily unavailable.", {
      status: 502,
      headers: pageHeaders({
        "content-type": "text/plain; charset=utf-8",
        "x-mmd-origin": WEBFLOW_ORIGIN,
        "x-mmd-booking-error": "webflow_upstream_failed",
      }),
    });
  }

  const contentType = upstreamResponse.headers.get("content-type") || "";
  const headers = withProxyHeaders(upstreamResponse);

  if (!contentType.toLowerCase().includes("text/html")) {
    return new Response(request.method.toUpperCase() === "HEAD" ? null : upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  }

  const html = injectPageMarkers(await upstreamResponse.text());

  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, {
    status: 200,
    headers,
  });
}

function methodNotAllowed() {
  return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
    status: 405,
    headers: pageHeaders({
      "content-type": "application/json; charset=utf-8",
      allow: "GET, HEAD, OPTIONS",
    }),
  });
}

function notFound(url) {
  return new Response(JSON.stringify({ ok: false, error: "NOT_FOUND", path: url.pathname }), {
    status: 404,
    headers: pageHeaders({ "content-type": "application/json; charset=utf-8" }),
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method.toUpperCase() === "OPTIONS") {
      return new Response(null, { status: 204, headers: pageHeaders({ allow: "GET, HEAD, OPTIONS" }) });
    }

    if (!isSigilBookingPath(url)) return notFound(url);
    if (!isSafePageMethod(request)) return methodNotAllowed();

    if (isFrontGateHost(url)) return redirectToCanonical(url);
    if (isCanonicalHost(url)) return fetchBookingFromWebflow(request, url);

    return notFound(url);
  },
};
