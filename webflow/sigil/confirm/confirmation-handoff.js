/* MMD SIGIL website-first confirmation handoff
 * Customer: /sigil/confirm/job-confirmation -> /my-mmd/ (verified current-job view)
 * Model: /sigil/confirm/job-model -> /sigil/model/dashboard (MY MODEL)
 * Payment: signed /sigil/pay?t=...; payment status: /my-mmd/payments.
 * Navigation only: no payment, session, job or entitlement authority here.
 * Never auto-redirect: if destination is unavailable, the signed source page
 * stays in browser history for a safe Back / retry (no redirect loop).
 */
(() => {
  "use strict";

  const path = (window.location.pathname.replace(/\/+$/, "") || "/");
  const MODEL_CONFIRM_PATH = "/sigil/confirm/job-model";
  const CUSTOMER_CONFIRM_PATH = "/sigil/confirm/job-confirmation";
  const MODEL_WEB_PATH = "/sigil/model/dashboard";
  const MEMBER_WEB_PATH = "/my-mmd/";
  const PAYMENT_WEB_PATH = "/sigil/pay";

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
    const target = new URL(MODEL_WEB_PATH, window.location.href);
    target.searchParams.set("handoff", "job-confirmed");
    target.searchParams.set("lang", lang);
    const liffEnv = new URL(window.location.href).searchParams.get("liff_env");
    if (liffEnv && /^[A-Za-z0-9_-]{1,32}$/.test(liffEnv)) target.searchParams.set("liff_env", liffEnv);
    const href = target.pathname + target.search;
    if (link.getAttribute("href") !== href) link.href = href;
    const label = lang === "en"
      ? "Open MY MODEL on website"
      : lang === "zh"
        ? "在网站打开 MY MODEL"
        : "ไปที่ MY MODEL บนเว็บไซต์";
    if (link.textContent !== label) link.textContent = label;
    if (link.getAttribute("data-mmd-canonical-target") !== "model-website") {
      link.setAttribute("data-mmd-canonical-target", "model-website");
    }
  }

  function wireCustomer() {
    if (path !== CUSTOMER_CONFIRM_PATH) return;
    const root = document.getElementById("mmd-job-confirm-v16");
    const success = root?.querySelector("[data-c-success]");
    if (!success) return;
    const existing = success.querySelector("[data-mmd-my-mmd]");
    const link = existing || document.createElement("a");
    const seed = root.querySelector("[data-c-confirm]");
    if (link.getAttribute?.("href") !== MEMBER_WEB_PATH) link.href = MEMBER_WEB_PATH;
    if (link.textContent !== "ดูสถานะงานปัจจุบันใน MY MMD") link.textContent = "ดูสถานะงานปัจจุบันใน MY MMD";
    link.setAttribute("data-mmd-my-mmd", "1");
    link.setAttribute("data-mmd-canonical-target", "member-website-current-job");
    if (!existing) {
      if (seed?.className) link.className = seed.className;
      success.appendChild(link);
    }
  }

  function wireCustomerPayment() {
    if (path !== CUSTOMER_CONFIRM_PATH) return;
    const root = document.getElementById("mmd-job-confirm-v16");
    if (!root) return;
    const success = root.querySelector("[data-c-success]");
    if (!success) return;
    const token = new URL(window.location.href).searchParams.get("t");
    if (!token || !/^[A-Za-z0-9_-]+\.[A-Fa-f0-9]{64}$/.test(token)) return;
    const target = new URL(PAYMENT_WEB_PATH, window.location.href);
    target.searchParams.set("t", token);
    const existing = success.querySelector("[data-mmd-payment-liff]") || success.querySelector("[data-mmd-payment-web]");
    const link = existing || document.createElement("a");
    const seed = root.querySelector("[data-c-confirm]");
    const href = target.pathname + target.search;
    if (link.getAttribute?.("href") !== href) link.href = href;
    if (link.textContent !== "ชำระเงิน / Payment") link.textContent = "ชำระเงิน / Payment";
    link.referrerPolicy = "no-referrer";
    link.setAttribute("data-mmd-payment-liff", "1"); // legacy duplicate guard
    link.setAttribute("data-mmd-payment-web", "1");
    link.setAttribute("data-mmd-canonical-target", "sigil-payment-website");
    if (!existing) {
      if (seed?.className) link.className = seed.className;
      success.appendChild(link);
    }
  }

  function wire() {
    wireModel();
    wireCustomer();
    wireCustomerPayment();
  }

  function boot() {
    if (![MODEL_CONFIRM_PATH, CUSTOMER_CONFIRM_PATH].includes(path)) return;
    wire();
    // The confirmation skin may mount or replace its root after this script.
    // Idempotent writes keep observer callbacks from causing a render loop.
    const observer = new MutationObserver(wire);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else boot();
})();
