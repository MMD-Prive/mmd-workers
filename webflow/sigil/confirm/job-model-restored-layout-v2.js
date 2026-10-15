/* Restore the canonical model-confirmation layout around the current runtime.
 * DOM presentation only: retain every data hook, value and event listener.
 */
(() => {
  "use strict";
  if (location.pathname.replace(/\/+$/, "") !== "/sigil/confirm/job-model") return;
  if (window.__mmdModelRestoredLayoutV2) return;
  window.__mmdModelRestoredLayoutV2 = true;
  function layout() {
    const root = document.getElementById("mmd-model-confirm-v15");
    const wrap = root?.querySelector(".mm15__wrap");
    const card = wrap?.querySelector(".mm15__card");
    if (!root || !wrap || !card) return;
    const payout = root.querySelector("[data-m-payout-card]");
    if (payout && payout.parentNode !== wrap) wrap.insertBefore(payout, card.nextSibling);
    const nav = root.querySelector("[data-mmd-model-work-nav]");
    if (nav && nav.parentNode !== wrap) wrap.appendChild(nav);
    for (const [selector, name] of [["[data-m-map]", "mm15__map"], ["[data-m-retry]", "mm15__retry"]]) {
      const el = root.querySelector(selector);
      if (el && !el.classList.contains(name)) el.classList.add(name);
    }
    if (root.dataset.mmdRestoredDesign !== "bridge-v2") root.dataset.mmdRestoredDesign = "bridge-v2";
  }
  function boot() {
    layout();
    new MutationObserver(layout).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
