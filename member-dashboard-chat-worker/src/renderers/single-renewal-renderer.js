/* MMD Privé / SĪGIL renewal compatibility bridge.
 *
 * This route family must never render a fallback payment page.
 * - Signed renewal links continue on the canonical /sigil/pay?t=... surface.
 * - Unsigned renewal entry returns to the canonical membership renewal entry.
 */
export const RENEWAL_PAGE_MARKER = "mmd-renewal-redirect-only";
export const RENEWAL_PAGE_NAME = "sigil-pay-renewal";
export const RENEWAL_ROUTE_SOURCE = "member-dashboard-chat-worker:renewal-redirect-bridge";

const WORKER_NAME = "member-dashboard-chat-worker";
const RENEWAL_PATHS = new Set(["/pay/renewal", "/sigil/pay/renewal"]);
const CANONICAL_ORIGIN = "https://mmdbkk.com";
const SIGNED_PAY_PATH = "/sigil/pay";
const RENEWAL_ENTRY_PATH = "/sigil/member/membership";

const SAFE_ENTRY_PARAMS = new Set([
  "plan",
  "package",
  "tier",
  "code",
  "promo",
  "src",
  "source",
  "campaign",
  "from",
]);

export function normalizePath(pathname) {
  let clean = String(pathname || "/").split("?")[0].split("#")[0];
  if (clean.length > 1 && clean.endsWith("/")) clean = clean.slice(0, -1);
  return clean || "/";
}

export function isRenewalRoute(pathname) {
  return RENEWAL_PATHS.has(normalizePath(pathname));
}

export function renewalHeaders(extra = {}) {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-mmd-worker": WORKER_NAME,
    "x-mmd-page": RENEWAL_PAGE_NAME,
    "x-mmd-route-source": RENEWAL_ROUTE_SOURCE,
    "x-mmd-upstream-source": "redirect-bridge",
    ...extra,
  };
}

export function resolveRenewalRedirect(requestUrl) {
  const source = new URL(requestUrl);
  const token = String(source.searchParams.get("t") || "").trim();

  if (token) {
    const target = new URL(SIGNED_PAY_PATH, CANONICAL_ORIGIN);
    target.searchParams.set("t", token);
    return target.toString();
  }

  const target = new URL(RENEWAL_ENTRY_PATH, CANONICAL_ORIGIN);
  target.searchParams.set("intent", "renew");

  for (const [key, value] of source.searchParams.entries()) {
    if (SAFE_ENTRY_PARAMS.has(key) && value) target.searchParams.set(key, value);
  }

  return target.toString();
}

export function renderRenewalResponse(request) {
  if (!request || !["GET", "HEAD"].includes(request.method)) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: renewalHeaders({
        allow: "GET, HEAD",
        "content-type": "text/plain; charset=utf-8",
      }),
    });
  }

  const location = resolveRenewalRedirect(request.url);
  return new Response(null, {
    status: 307,
    headers: renewalHeaders({ location }),
  });
}

// Kept only as an explicit guard against accidental fallback reintroduction.
// The runtime route never calls this to render customer-visible HTML.
export function renderRenewalHtml() {
  return "";
}
