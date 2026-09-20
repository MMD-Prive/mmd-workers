/* Source mirror for /sigil/model/login canonical LINE entry.
 * Webflow renders [data-model-login] dynamically. When there is no established
 * model session, Verify must enter the Published LINE Mini App directly instead
 * of navigating to a Webflow dashboard URL that then constructs an OAuth
 * redirect_uri from location.href.
 */
(() => {
  "use strict";
  if (location.pathname.replace(/\/+$/, "") !== "/sigil/model/login") return;

  const MODEL_LIFF_URL = "https://miniapp.line.me/2010864854-N34SgCqq";

  function language() {
    const raw = String(new URL(location.href).searchParams.get("lang") || document.documentElement.lang || "th").toLowerCase();
    if (raw === "en" || raw.startsWith("en-")) return "en";
    if (raw === "zh" || raw.startsWith("zh-")) return "zh";
    return "th";
  }

  function target() {
    const url = new URL(MODEL_LIFF_URL);
    url.searchParams.set("lang", language());
    url.searchParams.set("source", "model_login");
    return url.toString();
  }

  function patch() {
    document.querySelectorAll("[data-model-login]").forEach((link) => {
      const href = String(link.getAttribute("href") || "");
      if (!href.includes("flow=verify")) return;
      link.href = target();
      link.setAttribute("data-mmd-canonical-target", "model-line-miniapp");
    });
  }

  patch();
  new MutationObserver(patch).observe(document.documentElement, { childList: true, subtree: true });
})();
