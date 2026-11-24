import candidateHtml from "./artifacts/candidate.html";
import rollbackHtml from "./artifacts/rollback.html";

const WEBFLOW_ORIGIN = "https://mmdprive.webflow.io";
const CANONICAL_PATH = "/sigil/model/console";
const PRODUCTION_HOSTS = new Set(["mmdbkk.com", "www.mmdbkk.com"]);
const RELEASES = new Map([
  ["candidate", {
    html: candidateHtml,
    sha256: "4aff4a31b418a92501349e446af8ac893b9ff17183355ed20df623c41a4be739",
  }],
  ["rollback", {
    html: rollbackHtml,
    sha256: "7dd6e42b4a4dcb292fb4830c8abd134b94ca356a8a9a3d4b5dba51128eae8965",
  }],
]);
const verifiedReleases = new Map();
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
  headers.set("x-mmd-route-version", "model-console-pinned-html-v1");
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

async function servePinnedPage(method, releaseName) {
  const release = RELEASES.get(releaseName);
  if (release && !verifiedReleases.has(releaseName)) {
    const bytes = new TextEncoder().encode(release.html);
    verifiedReleases.set(releaseName, crypto.subtle.digest("SHA-256", bytes).then(
      (digest) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("") === release.sha256,
      () => false,
    ));
  }

  if (!release || !(await verifiedReleases.get(releaseName))) {
    return withOwnershipHeaders(new Response(
      method === "HEAD" ? null : "Model Console unavailable",
      { status: 503, headers: { "cache-control": "no-store" } },
    ), "pinned-artifact");
  }

  const response = new Response(method === "HEAD" ? null : release.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "frame-ancestors 'self' https://*.webflow.com http://*.webflow.com http://*.webflow.io http://webflow.com https://webflow.com",
      "x-mmd-console-html-sha256": release.sha256,
    },
  });
  return withOwnershipHeaders(response, "pinned-artifact");
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
  async fetch(request, env) {
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

    if (PRODUCTION_HOSTS.has(url.hostname)) {
      return servePinnedPage(method, env?.CONSOLE_HTML_RELEASE ?? "candidate");
    }

    return fetchWebflowPage(request, url);
  },
};
