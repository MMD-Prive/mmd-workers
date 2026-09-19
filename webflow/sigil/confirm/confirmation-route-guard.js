/* MMD SIGIL confirmation route guard
 * Route hint only. Backend token verification remains authoritative.
 * If a signed confirmation token is opened on the wrong confirmation page,
 * preserve the complete query/hash and move to the matching role route.
 */
(() => {
  "use strict";

  const ROUTES = Object.freeze({
    customer: "/sigil/confirm/job-confirmation",
    model: "/sigil/confirm/job-model",
  });

  function tokenRoleHint(token) {
    const raw = String(token || "").trim();
    const encoded = raw.split(".")[0] || "";
    if (!encoded || encoded.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return "";

    try {
      const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/")
        + "=".repeat((4 - (encoded.length % 4)) % 4);
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      const explicitRole = String(payload?.role || "").trim().toLowerCase();
      if (explicitRole === "customer" || explicitRole === "model") return explicitRole;
      if (payload?.kind === "customer_confirm") return "customer";
      if (payload?.kind === "model_confirm") return "model";
    } catch (_) {
      // Unreadable hints must fall through to the normal backend verification path.
    }
    return "";
  }

  let url;
  try {
    url = new URL(window.location.href);
  } catch (_) {
    return;
  }

  const currentPath = url.pathname.replace(/\/+$/, "") || "/";
  if (currentPath !== ROUTES.customer && currentPath !== ROUTES.model) return;

  const role = tokenRoleHint(url.searchParams.get("t"));
  const targetPath = ROUTES[role];
  if (!targetPath || targetPath === currentPath) return;

  url.pathname = targetPath;
  window.location.replace(`${url.pathname}${url.search}${url.hash}`);
})();
