/* MMD Confirmation Rules CTA v1
 * Routes:
 * - /sigil/confirm/job-confirmation
 * - /sigil/confirm/job-model
 *
 * Presentation only. Always-visible RULES link to /rules.
 * It must remain available even when signed job details fail to load.
 */
(() => {
  "use strict";

  const CUSTOMER_ROOT = "mmd-job-confirm-v16";
  const MODEL_ROOT = "mmd-model-confirm-v15";
  const RULES_PATH = "/rules";

  function buildLink(root) {
    if (!root || root.querySelector("[data-mmd-confirm-rules]")) return null;
    const link = document.createElement("a");
    link.className = "mmd-confirm-rules-btn";
    link.dataset.mmdConfirmRules = "1";
    link.href = RULES_PATH;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "RULES";
    link.setAttribute("aria-label", "Open MMD Rules");
    return link;
  }

  function ensureStyle() {
    if (document.getElementById("mmd-confirm-rules-v1-style")) return;
    const style = document.createElement("style");
    style.id = "mmd-confirm-rules-v1-style";
    style.textContent = `
      #${CUSTOMER_ROOT} .mmd-confirm-rules-btn,
      #${MODEL_ROOT} .mmd-confirm-rules-btn{
        display:inline-flex;
        min-height:40px;
        align-items:center;
        justify-content:center;
        padding:0 15px;
        border:1px solid rgba(217,185,105,.42);
        border-radius:999px;
        background:rgba(217,185,105,.07);
        color:#fff5b1;
        -webkit-text-fill-color:#fff5b1;
        font:900 11px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans Thai",sans-serif;
        letter-spacing:.12em;
        text-decoration:none;
        white-space:nowrap;
        transition:transform .18s ease,border-color .18s ease,background .18s ease;
      }
      #${CUSTOMER_ROOT} .mmd-confirm-rules-btn:hover,
      #${MODEL_ROOT} .mmd-confirm-rules-btn:hover{
        transform:translateY(-1px);
        border-color:rgba(240,215,143,.78);
        background:rgba(217,185,105,.13);
      }
      #${CUSTOMER_ROOT} .mmd-confirm-rules-btn:focus-visible,
      #${MODEL_ROOT} .mmd-confirm-rules-btn:focus-visible{
        outline:3px solid rgba(255,245,177,.24);
        outline-offset:3px;
      }
      #${CUSTOMER_ROOT} .mmd-confirm-rules-tools{
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap:8px;
        flex-wrap:wrap;
      }
      @media(max-width:560px){
        #${CUSTOMER_ROOT} .mmd-confirm-rules-btn,
        #${MODEL_ROOT} .mmd-confirm-rules-btn{
          min-height:36px;
          padding:0 12px;
          font-size:10px;
        }
        #${CUSTOMER_ROOT} .mmd-confirm-rules-tools{
          max-width:58%;
        }
      }
      @media(prefers-reduced-motion:reduce){
        #${CUSTOMER_ROOT} .mmd-confirm-rules-btn,
        #${MODEL_ROOT} .mmd-confirm-rules-btn{
          transition:none!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function wireCustomer() {
    const root = document.getElementById(CUSTOMER_ROOT);
    if (!root) return false;

    const header = root.querySelector(".mjc16__header");
    const pill = root.querySelector("[data-c-pill]");
    if (!header || !pill) return false;
    if (root.querySelector("[data-mmd-confirm-rules]")) return true;

    let tools = header.querySelector(".mmd-confirm-rules-tools");
    if (!tools) {
      tools = document.createElement("div");
      tools.className = "mmd-confirm-rules-tools";
      header.appendChild(tools);
      tools.appendChild(pill);
    }

    const link = buildLink(root);
    if (link) tools.insertBefore(link, pill);
    return true;
  }

  function wireModel() {
    const root = document.getElementById(MODEL_ROOT);
    if (!root) return false;
    if (root.querySelector("[data-mmd-confirm-rules]")) return true;

    const tools = root.querySelector(".mm15__tools");
    if (!tools) return false;

    const link = buildLink(root);
    if (!link) return true;
    const pill = root.querySelector("[data-m-pill]");
    if (pill && pill.parentElement === tools) tools.insertBefore(link, pill);
    else tools.appendChild(link);
    return true;
  }

  function boot(attempt = 0) {
    ensureStyle();
    const path = (window.location.pathname.replace(/\/+$/, "") || "/");
    let ready = false;

    if (path === "/sigil/confirm/job-confirmation") ready = wireCustomer();
    if (path === "/sigil/confirm/job-model") ready = wireModel();

    if (!ready && attempt < 30) {
      window.setTimeout(() => boot(attempt + 1), 120);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot(), { once: true });
  } else {
    boot();
  }
})();