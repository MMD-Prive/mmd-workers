/* MMD SIGIL confirmation handoff
 * Customer: /sigil/confirm/job-confirmation -> /my-mmd/
 * Model: /sigil/confirm/job-model -> /sigil/model/dashboard
 * This layer only fixes onward navigation after the signed confirmation flow.
 */
(() => {
  "use strict";

  const path = (window.location.pathname.replace(/\/+$/, "") || "/");
  const MODEL_CONFIRM_PATH = "/sigil/confirm/job-model";
  const CUSTOMER_CONFIRM_PATH = "/sigil/confirm/job-confirmation";
  const MODEL_DASHBOARD_PATH = "/sigil/model/dashboard";
  const MY_MMD_PATH = "/my-mmd/";

  function wireModel() {
    if (path !== MODEL_CONFIRM_PATH) return;
    const root = document.getElementById("mmd-model-confirm-v15");
    const link = root?.querySelector(".mm15__success a, [data-m-success] a");
    if (!link) return;
    link.href = MODEL_DASHBOARD_PATH;
    link.setAttribute("data-mmd-canonical-target", "model-dashboard");
  }

  function wireCustomer() {
    if (path !== CUSTOMER_CONFIRM_PATH) return;
    const root = document.getElementById("mmd-job-confirm-v16");
    const success = root?.querySelector("[data-c-success]");
    if (!success || success.querySelector("[data-mmd-my-mmd]")) return;

    const link = document.createElement("a");
    const seed = root.querySelector("[data-c-confirm]");
    link.href = MY_MMD_PATH;
    link.textContent = "ไปที่ My MMD";
    link.setAttribute("data-mmd-my-mmd", "1");
    link.setAttribute("data-mmd-canonical-target", "my-mmd");
    if (seed?.className) link.className = seed.className;
    success.appendChild(link);
  }

  function wire() {
    wireModel();
    wireCustomer();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire, { once: true });
  } else {
    wire();
  }
})();
