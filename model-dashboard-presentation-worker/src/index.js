const WORKER_NAME = "model-dashboard-presentation-worker";
const UI_PREFIX = "/sigil/model/dashboard";
const ASSET_PREFIX = "/sigil/model/dashboard-assets/";
const ROOT_RUNTIME_PREFIXES = ["/_build/", "/_serverFn/", "/assets/"];
const PRESENTATION_ORIGIN = "https://mmd-model-dashboard.lovable.app";
const UI_SOURCE = "lovable-presentation-proxy";
const APP_MARKER = "lovable-model-dashboard";
const APP_ROUTE_SUFFIXES = ["profile", "availability", "photos", "support"];

function normalizePath(pathname = "") {
  const value = String(pathname || "/").replace(/\/{2,}/g, "/");
  return value || "/";
}

export function isPresentationUiPath(pathname = "") {
  const path = normalizePath(pathname);
  return path === UI_PREFIX || path === `${UI_PREFIX}/` || path.startsWith(`${UI_PREFIX}/`);
}

export function isPresentationAssetPath(pathname = "") {
  return normalizePath(pathname).startsWith(ASSET_PREFIX);
}

export function isPresentationRootRuntimePath(pathname = "") {
  const path = normalizePath(pathname);
  return ROOT_RUNTIME_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function presentationRequestHeaders(request, { runtime = false } = {}) {
  const headers = new Headers();
  const allowed = runtime
    ? ["accept", "accept-language", "content-type", "if-none-match", "if-modified-since", "range", "user-agent"]
    : ["accept", "accept-language", "if-none-match", "if-modified-since", "range", "user-agent"];
  for (const name of allowed) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export function presentationUrlForPage(request) {
  const source = new URL(request.url);
  const path = normalizePath(source.pathname);
  const suffix = path.slice(UI_PREFIX.length);
  const upstream = new URL(PRESENTATION_ORIGIN);
  upstream.pathname = suffix || "/";
  upstream.search = source.search;
  return upstream;
}

export function presentationUrlForAsset(request) {
  const source = new URL(request.url);
  const path = normalizePath(source.pathname);
  const upstream = new URL(PRESENTATION_ORIGIN);

  if (isPresentationAssetPath(path)) {
    const suffix = path.slice(ASSET_PREFIX.length);
    upstream.pathname = suffix ? `/${suffix}` : "/";
  } else if (isPresentationRootRuntimePath(path)) {
    // Compatibility alias for TanStack/Lovable lazy runtime chunks that still
    // resolve to root-absolute paths after hydration. Keeping these requests
    // on the MMD host prevents apex -> www redirects from becoming CORS errors.
    upstream.pathname = path;
  } else {
    upstream.pathname = path;
  }

  upstream.search = source.search;
  return upstream;
}

function stripLovableChrome(html) {
  return String(html || "")
    .replace(/<aside\b[^>]*id=["']lovable-badge["'][\s\S]*?<\/aside>/gi, "")
    .replace(/<script\b[^>]*src=["']\/~flock\.js["'][\s\S]*?<\/script>/gi, "");
}

function rewriteRuntimePaths(source) {
  return String(source || "")
    .replaceAll("/_build/", `${ASSET_PREFIX}_build/`)
    .replaceAll("/_serverFn/", `${ASSET_PREFIX}_serverFn/`)
    .replaceAll("/assets/", `${ASSET_PREFIX}assets/`)
    .replaceAll("/favicon.ico", `${ASSET_PREFIX}favicon.ico`);
}

export function rewritePresentationHtml(html) {
  let output = rewriteRuntimePaths(stripLovableChrome(html));

  // Lovable SSR renders root-based app links. Keep the first paint and
  // no-JS fallback on the canonical MMD path before the client router hydrates.
  output = output.replace(/href=["']\/["']/g, `href="${UI_PREFIX}"`);
  for (const suffix of APP_ROUTE_SUFFIXES) {
    output = output.replace(
      new RegExp(`href=["']\\/${suffix}(?:\\/)?["']`, "g"),
      `href="${UI_PREFIX}/${suffix}"`,
    );
  }
  return output;
}

export function rewritePresentationText(source) {
  return rewriteRuntimePaths(source);
}

function responseHeaders(upstreamHeaders, { html = false, rewritten = false } = {}) {
  const headers = new Headers(upstreamHeaders);
  for (const name of ["content-length", "set-cookie", "reporting-endpoints", "report-to", "nel"]) {
    headers.delete(name);
  }
  if (rewritten) {
    for (const name of ["content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  }
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-ui-source", UI_SOURCE);
  headers.set("x-mmd-ui-app", APP_MARKER);
  headers.set("x-robots-tag", "noindex, nofollow");
  if (html) headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  return headers;
}

async function fetchUpstream(request, upstreamUrl, { runtime = false } = {}) {
  const method = request.method.toUpperCase();
  const init = {
    method,
    headers: presentationRequestHeaders(request, { runtime }),
    redirect: "follow",
  };
  if (runtime && !new Set(["GET", "HEAD"]).has(method)) init.body = request.body;
  return globalThis.fetch(new Request(upstreamUrl, init));
}

async function proxyPage(request) {
  if (!new Set(["GET", "HEAD"]).has(request.method.toUpperCase())) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD", "cache-control": "no-store", "x-mmd-worker": WORKER_NAME },
    });
  }

  let upstream;
  try {
    upstream = await fetchUpstream(request, presentationUrlForPage(request));
  } catch (_) {
    return unavailable();
  }

  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  const isHtml = contentType.includes("text/html");
  const headers = responseHeaders(upstream.headers, { html: isHtml, rewritten: isHtml });
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers });
  }
  if (!isHtml) return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });

  const html = rewritePresentationHtml(await upstream.text());
  return new Response(html, { status: upstream.status, statusText: upstream.statusText, headers });
}

async function proxyRuntime(request) {
  let upstream;
  try {
    upstream = await fetchUpstream(request, presentationUrlForAsset(request), { runtime: true });
  } catch (_) {
    return unavailable();
  }

  const upstreamUrl = presentationUrlForAsset(request);
  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  const isTextRuntime =
    contentType.includes("javascript") ||
    contentType.includes("text/css") ||
    contentType.includes("application/json") ||
    upstreamUrl.pathname.endsWith(".js") ||
    upstreamUrl.pathname.endsWith(".mjs") ||
    upstreamUrl.pathname.endsWith(".css");
  const headers = responseHeaders(upstream.headers, { rewritten: isTextRuntime });

  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers });
  }
  if (!isTextRuntime) {
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  }

  return new Response(rewritePresentationText(await upstream.text()), {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function unavailable() {
  return new Response("MMD Model Dashboard is temporarily unavailable.", {
    status: 502,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": WORKER_NAME,
      "x-mmd-route-owner": WORKER_NAME,
      "x-mmd-ui-source": UI_SOURCE,
    },
  });
}

export default {
  async fetch(request) {
    const path = normalizePath(new URL(request.url).pathname);
    if (isPresentationAssetPath(path) || isPresentationRootRuntimePath(path)) return proxyRuntime(request);
    if (isPresentationUiPath(path)) return proxyPage(request);
    return new Response("Not Found", {
      status: 404,
      headers: { "cache-control": "no-store", "x-mmd-worker": WORKER_NAME },
    });
  },
};
