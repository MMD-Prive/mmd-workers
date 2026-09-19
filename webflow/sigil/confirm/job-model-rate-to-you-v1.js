/* MMD SIGIL Model Confirmation — Rate To You v1
 * Route: /sigil/confirm/job-model
 * UI-only compatibility layer. Amount authority remains model_payout_thb from /v1/confirm/details.
 * Keeps the rate field visible even when the payout has not been filled yet.
 */
(() => {
  const start = () => {
    const root = document.getElementById("mmd-model-confirm-v15");
    if (!root) return;

    let applying = false;
    const apply = () => {
      if (applying) return;
      applying = true;

      const lang = String(document.documentElement.lang || "th").toLowerCase();
      const card = root.querySelector("[data-m-payout-card]");
      const label = root.querySelector(".mm15__payout > span");
      const value = root.querySelector("[data-m-payout]");
      const labelText = lang.startsWith("zh")
        ? "到手报酬"
        : lang.startsWith("en")
          ? "Rate to you"
          : "เรทถึงตัว";

      if (label && label.textContent !== labelText) label.textContent = labelText;
      if (card && card.hidden) card.hidden = false;
      if (value && !String(value.textContent || "").trim()) value.textContent = "—";

      applying = false;
    };

    apply();
    new MutationObserver(apply).observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden"]
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
