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
    return gallery.fetch(request, env, context);
  }
};

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
