import gallery from "./index.mjs";

/**
 * Deployment-only gate for the Access Code entry.
 * The account-scoped Cloudflare Rate Limiting binding is the ONLY non-secret
 * binding this isolated Worker has. No production API/data binding is allowed.
 *
 * A fixed global key deliberately shares the approximate per-POP allowance
 * among all visitors: owner review is single-user by design, and a distributed
 * password spray must not get an independent allowance per fake identity/IP.
 * The 32+ random-character code is still the primary brute-force defense.
 */
export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname === "/unlock" && request.method === "POST") {
      const limiter = env?.OWNER_REVIEW_RATE_LIMIT;
      if (typeof limiter?.limit !== "function") {
        return denied(503, "review_rate_limit_unavailable");
      }
      let decision;
      try {
        decision = await limiter.limit({ key: "owner-review-unlock" });
      } catch {
        return denied(503, "review_rate_limit_unavailable");
      }
      if (decision?.success !== true) {
        return denied(429, "try_again_later", { "retry-after": "60" });
      }
    }

    // iOS Safari / LINE WKWebView can omit Origin on a normal HTML form POST.
    // Never accept an explicitly foreign Origin. When Origin is absent or null,
    // recover only a browser navigation proven same-origin by Fetch Metadata or
    // by an exact same-origin Referer. The canonical worker still performs its
    // strict Origin check after this normalization.
    const normalizedRequest = normalizeSameOriginFormNavigation(request, url);
    const result = await gallery.fetch(normalizedRequest, env, context);

    // Login and catalog contain same-origin forms. `same-origin` keeps the
    // fallback useful while still sending no Referer to production/external URLs.
    if (["GET", "HEAD"].includes(request.method) && ["/", "/index.html"].includes(url.pathname)) {
      return withReferrerPolicy(result, "same-origin");
    }
    return result;
  }
};

function normalizeSameOriginFormNavigation(request, url) {
  if (request.method !== "POST" || !["/unlock", "/logout"].includes(url.pathname)) return request;

  const suppliedOrigin = request.headers.get("origin");
  if (suppliedOrigin && suppliedOrigin !== "null") return request;

  const fetchSite = request.headers.get("sec-fetch-site");
  const fetchMode = request.headers.get("sec-fetch-mode");
  const fetchDestination = request.headers.get("sec-fetch-dest");
  const trustedFetchNavigation = fetchSite === "same-origin" &&
    (!fetchMode || fetchMode === "navigate") &&
    (!fetchDestination || fetchDestination === "document");

  let trustedReferrer = false;
  const referrer = request.headers.get("referer");
  if (referrer) {
    try {
      const source = new URL(referrer);
      trustedReferrer = source.origin === url.origin && !source.username && !source.password;
    } catch {
      trustedReferrer = false;
    }
  }

  if (!trustedFetchNavigation && !trustedReferrer) return request;
  const headers = new Headers(request.headers);
  headers.set("origin", url.origin);
  return new Request(request, { headers });
}

function withReferrerPolicy(response, policy) {
  const headers = new Headers(response.headers);
  headers.set("referrer-policy", policy);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function denied(status, reason, more = {}) {
  return new Response(JSON.stringify({ ok: false, error: reason }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, no-cache, max-age=0",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; form-action 'none'",
      ...more
    }
  });
}
