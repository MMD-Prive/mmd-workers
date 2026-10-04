/* MMD Model Console — rules links v1
 * Keep the console compact: exactly two world-level work-rules links.
 * Job Day is intentionally absent; it appears only in the first Direct Private Job gate.
 */
(() => {
  "use strict";
  const root = document.querySelector("#sigil-model-console-v3[data-smc]");
  if (!root || root.querySelector("[data-model-work-rules-links]")) return;

  const card = document.createElement("details");
  card.className = "smcv3-card";
  card.setAttribute("data-model-work-rules-links", "1");
  card.innerHTML = `
    <summary class="smcv3-summary-row">กติกาการทำงาน</summary>
    <div class="smcv3-detail">
      <div class="smcv3-actions" style="display:grid!important;grid-template-columns:1fr 1fr!important">
        <a class="smcv3-btn" href="/rules/model"><span>Private / SIGIL</span></a>
        <a class="smcv3-btn" href="/rules/public-model-work"><span>Public / MY MODEL</span></a>
      </div>
    </div>`;

  const summary = root.querySelector(".smcv3-summary");
  if (summary) summary.insertAdjacentElement("afterend", card);
  else root.querySelector("[data-view=\"work\"]")?.appendChild(card);
})();