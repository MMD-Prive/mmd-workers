/* MMD Confirmation Rules CTA v1
 * Routes:
 * - /sigil/confirm/job-confirmation
 * - /sigil/confirm/job-model
 *
 * Presentation only. Always-visible RULES link.
 * - Customer page: small RULES pill + a prominent featured CTA, both -> /rules/customer
 * - Model page: RULES pill -> /rules
 * Links open in a new tab so the signed confirmation page stays open underneath;
 * closing the rules tab returns the customer to /sigil/confirm/job-confirmation.
 * It must remain available even when signed job details fail to load.
 */
(() => {
  "use strict";

  const CUSTOMER_ROOT = "mmd-job-confirm-v16";
  const MODEL_ROOT = "mmd-model-confirm-v15";
  const RULES_PATH = "/rules";
  const CUSTOMER_RULES_PATH = "/rules/customer";

  function buildFeatured() {
    const wrap = document.createElement("div");
    wrap.className = "mmd-confirm-rules-featured";
    wrap.dataset.mmdConfirmRulesFeatured = "1";

    const text = document.createElement("div");
    text.className = "mmd-confirm-rules-featured__text";
    const title = document.createElement("strong");
    title.textContent = "อ่านกติกาลูกค้าก่อนยืนยันงาน";
    const sub = document.createElement("span");
    sub.textContent = "ใช้เวลาไม่นาน อ่านเสร็จปิดแท็บแล้วกลับมายืนยันงานต่อได้เลย";
    text.append(title, sub);

    const link = document.createElement("a");
    link.className = "mmd-confirm-rules-featured__btn";
    link.dataset.mmdConfirmRulesCustomer = "1";
    link.href = CUSTOMER_RULES_PATH;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "อ่านกติกาลูกค้า";
    link.setAttribute("aria-label", "Open MMD Customer Rules");

    wrap.append(text, link);
    return wrap;
  }

  function buildLink(root, href = RULES_PATH) {
    if (!root || root.querySelector("[data-mmd-confirm-rules]")) return null;
    const link = document.createElement("a");
    link.className = "mmd-confirm-rules-btn";
    link.dataset.mmdConfirmRules = "1";
    link.href = href;
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
      #${CUSTOMER_ROOT} .mmd-confirm-rules-featured{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:14px;
        margin:14px 0;
        padding:16px 18px;
        border:1px solid rgba(240,211,157,.55);
        border-radius:22px;
        background:linear-gradient(135deg,rgba(240,211,157,.16),rgba(215,166,93,.07)),rgba(18,15,13,.82);
        box-shadow:0 18px 50px rgba(215,166,93,.14);
      }
      #${CUSTOMER_ROOT} .mmd-confirm-rules-featured__text{
        display:grid;
        gap:4px;
        min-width:0;
      }
      #${CUSTOMER_ROOT} .mmd-confirm-rules-featured__text strong{
        color:#fff8ee;
        -webkit-text-fill-color:#fff8ee;
        font-size:15px;
        font-weight:800;
        line-height:1.35;
      }
      #${CUSTOMER_ROOT} .mmd-confirm-rules-featured__text span{
        color:#eee2d4;
        -webkit-text-fill-color:#eee2d4;
        font-size:12px;
        line-height:1.5;
      }
      #${CUSTOMER_ROOT} .mmd-confirm-rules-featured__btn{
        flex:0 0 auto;
        display:inline-flex;
        min-height:48px;
        align-items:center;
        justify-content:center;
        padding:0 22px;
        border-radius:999px;
        background:linear-gradient(135deg,#f0d39d,#d7a65d);
        color:#22170d!important;
        -webkit-text-fill-color:#22170d!important;
        font:800 14px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans Thai",sans-serif;
        text-decoration:none;
        white-space:nowrap;
        box-shadow:0 12px 30px rgba(215,166,93,.28);
        transition:transform .18s ease,box-shadow .18s ease;
      }
      #${CUSTOMER_ROOT} .mmd-confirm-rules-featured__btn:hover{
        transform:translateY(-1px);
        box-shadow:0 16px 36px rgba(215,166,93,.36);
      }
      #${CUSTOMER_ROOT} .mmd-confirm-rules-featured__btn:focus-visible{
        outline:3px solid rgba(255,245,177,.4);
        outline-offset:3px;
      }
      @media(max-width:560px){
        #${CUSTOMER_ROOT} .mmd-confirm-rules-featured{
          flex-direction:column;
          align-items:stretch;
          text-align:center;
        }
        #${CUSTOMER_ROOT} .mmd-confirm-rules-featured__btn{
          width:100%;
        }
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
        #${CUSTOMER_ROOT} .mmd-confirm-rules-featured__btn,
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

    const link = buildLink(root, CUSTOMER_RULES_PATH);
    if (link) tools.insertBefore(link, pill);

    if (!root.querySelector("[data-mmd-confirm-rules-featured]")) {
      header.insertAdjacentElement("afterend", buildFeatured());
    }
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