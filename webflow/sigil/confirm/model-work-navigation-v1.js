/* Model confirmation work navigation. Navigation only; no job/payment authority. */
(() => {
  "use strict";
  if (location.pathname.replace(/\/+$/, "") !== "/sigil/confirm/job-model") return;
  if (window.__mmdModelWorkNavigationV1) return;
  window.__mmdModelWorkNavigationV1 = true;

  const routes = [
    ["Jobs", "/sigil/model/dashboard/jobs"],
    ["Model Console", "/sigil/model/console"],
    ["Rule/model", "/rules/model"],
  ];

  function wire() {
    const root = document.getElementById("mmd-model-confirm-v15");
    if (!root) return;
    if (!root.querySelector("[data-mmd-model-work-nav]")) {
      const nav = document.createElement("nav");
      nav.setAttribute("data-mmd-model-work-nav", "1");
      nav.setAttribute("aria-label", "MY MODEL");
      for (const [label, path] of routes) {
        const link = document.createElement("a");
        const url = new URL(path, location.origin);
        const lang = new URL(location.href).searchParams.get("lang");
        if (["th", "en", "zh"].includes(lang)) url.searchParams.set("lang", lang);
        link.href = url.pathname + url.search;
        link.textContent = label;
        nav.appendChild(link);
      }
      root.appendChild(nav);
    }
    // Remove only customer checkout actions inside the model confirmation.
    // Payout details, alerts, account collection and admin navigation stay intact.
    root.querySelectorAll("a[href]").forEach(link => {
      let url;
      try { url = new URL(link.getAttribute("href"), location.origin); } catch (_) { return; }
      if (![location.hostname, "mmdbkk.com", "www.mmdbkk.com"].includes(url.hostname)) return;
      if (!/^\/(?:sigil\/pay|member\/payments|my-mmd\/payments|pay)(?:\/|$)/.test(url.pathname)) return;
      if (!link.hidden) link.hidden = true;
      if (link.getAttribute("aria-hidden") !== "true") link.setAttribute("aria-hidden", "true");
    });
    // This button exists only when the authenticated server gate requires it.
    // Preserve its signed job context, return URL and mandatory acknowledgement.
    const jobDay = document.querySelector("[data-mmd-read-job-day-rules]");
    if (jobDay && jobDay.textContent !== "Job Day · คู่มือวันทำงาน") {
      jobDay.textContent = "Job Day · คู่มือวันทำงาน";
    }
  }

  function boot() {
    const style = document.createElement("style");
    style.textContent = '[data-mmd-model-work-nav]{display:grid;grid-template-columns:1fr;gap:8px;margin-top:20px}[data-mmd-model-work-nav] a{display:flex;align-items:center;justify-content:center;min-height:48px;padding:12px;border:1px solid rgba(227,189,124,.4);border-radius:12px;background:#171510;color:#f4dfb3;font-family:inherit;font-size:14px;font-weight:600;line-height:1.4;text-decoration:none}[data-mmd-model-work-nav] a:first-child{background:#e3bd7c;color:#17120b}[data-mmd-model-work-nav] a:focus-visible{outline:2px solid #fff3c7;outline-offset:3px}#mmd-model-confirm-v15 a[hidden]{display:none!important}';
    document.head.appendChild(style);
    wire();
    new MutationObserver(wire).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
