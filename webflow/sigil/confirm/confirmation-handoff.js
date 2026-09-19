/* MMD SIGIL confirmation handoff
 * Customer: /sigil/confirm/job-confirmation -> My MMD LINE Mini App > Jobs
 * Model: /sigil/confirm/job-model -> MMD MODEL LINE Mini App
 * This layer only fixes onward navigation after the signed confirmation flow.
 */
(() => {
  "use strict";

  const path = (window.location.pathname.replace(/\/+$/, "") || "/");
  const MODEL_CONFIRM_PATH = "/sigil/confirm/job-model";
  const CUSTOMER_CONFIRM_PATH = "/sigil/confirm/job-confirmation";
  const MODEL_LIFF_URL = "https://miniapp.line.me/2010864854-N34SgCqq";
  const MEMBER_LIFF_URL = "https://miniapp.line.me/2010862595-yT4DCEMc/?view=jobs";

  function currentModelLang() {
    const queryLang = new URL(window.location.href).searchParams.get("lang");
    const raw = String(queryLang || document.documentElement.lang || "th").toLowerCase();
    if (raw === "en" || raw.startsWith("en-")) return "en";
    if (raw === "zh" || raw.startsWith("zh-")) return "zh";
    return "th";
  }

  function wireModel() {
    if (path !== MODEL_CONFIRM_PATH) return;
    const root = document.getElementById("mmd-model-confirm-v15");
    const link = root?.querySelector(".mm15__success a, [data-m-success] a");
    if (!link) return;

    const lang = currentModelLang();
    const target = new URL(`${MODEL_LIFF_URL}/`);
    target.searchParams.set("lang", lang);
    link.href = target.toString();
    link.textContent = lang === "en"
      ? "Open MMD MODEL in LINE"
      : lang === "zh"
        ? "在 LINE 中打开 MMD MODEL"
        : "ไปที่ MMD MODEL ใน LINE";
    link.setAttribute("data-mmd-canonical-target", "model-line-miniapp");
  }

  function wireCustomer() {
    if (path !== CUSTOMER_CONFIRM_PATH) return;
    const root = document.getElementById("mmd-job-confirm-v16");
    const success = root?.querySelector("[data-c-success]");
    if (!success || success.querySelector("[data-mmd-my-mmd]")) return;

    const link = document.createElement("a");
    const seed = root.querySelector("[data-c-confirm]");
    link.href = MEMBER_LIFF_URL;
    link.textContent = "ดู Upcoming Job ใน My MMD";
    link.setAttribute("data-mmd-my-mmd", "1");
    link.setAttribute("data-mmd-canonical-target", "member-line-miniapp-jobs");
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
