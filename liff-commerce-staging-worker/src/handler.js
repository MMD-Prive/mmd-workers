export const MOCK_STAGING_HOST = "mmd-liff-commerce-mock-staging.malemodel-bkk.workers.dev";
export const MOCK_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

// This Worker deliberately receives no bindings or credentials. It serves only
// the already tested offline fixture: no auth, backend calls, writes or storage.
export function createMockCommerceStagingWorker(html, qr) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const respond = (body, status = 200, type = "application/json; charset=utf-8", extra = {}) => new Response(request.method === "HEAD" ? null : body, {
        status, headers: {
          "content-type": type, "cache-control": "no-store",
          "content-security-policy": MOCK_CSP,
          "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow",
          "x-mmd-preview-mode": "mock-only-no-payments",
          ...extra,
        },
      });
      if (url.hostname !== MOCK_STAGING_HOST || url.port) return respond('{"error":"staging_host_only"}', 404);
      if (!["GET", "HEAD"].includes(request.method)) return respond('{"error":"mock_staging_writes_disabled"}', 405, undefined, { allow: "GET, HEAD" });
      if (url.pathname === "/" || url.pathname === "/index.html") return respond(html, 200, "text/html; charset=utf-8");
      if (url.pathname === "/qr.svg") return respond(qr, 200, "image/svg+xml");
      if (url.pathname === "/healthz") {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html));
        const sha = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
        return respond(JSON.stringify({ ok: true, mode: "mock_only", writes_enabled: false, payment_intents_enabled: false, live_liff_auth: false, bindings: [], fixture_sha256: sha }));
      }
      return respond('{"error":"mock_route_not_found"}', 404);
    },
  };
}
