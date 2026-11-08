/* Payment Confirmation — website-first return button.
 * Navigation only: payment evidence/verification stays payments-worker owned.
 * Do not infer success from this page or query parameters.
 */
(() => {
  "use strict";
  const PAGE = "/sigil/confirm/payment-confirmation";
  const DEST = "/my-mmd/payments";
  if (window.location.pathname.replace(/\/+$/, "") !== PAGE) return;

  function wire() {
    const root = document.querySelector("[data-mpc]");
    const link = root?.querySelector(".mpc-actions .mpc-btn-primary");
    if (!link) return;
    if (link.getAttribute("href") !== DEST) link.setAttribute("href", DEST);
    if (link.textContent !== "ดูสถานะชำระเงินใน MY MMD") link.textContent = "ดูสถานะชำระเงินใน MY MMD";
    if (link.getAttribute("data-mmd-canonical-target") !== "my-mmd-payment-center") {
      link.setAttribute("data-mmd-canonical-target", "my-mmd-payment-center");
    }
  }

  function boot() {
    wire();
    const observer = new MutationObserver(wire);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else boot();
})();
