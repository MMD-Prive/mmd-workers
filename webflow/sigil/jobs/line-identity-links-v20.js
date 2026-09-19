/* Source mirror for Webflow registered script SigilJobsLineClaimV20.
 * Canonical 2026-09-19 dispatch:
 * Create Job exposes only the signed customer payment URL.
 * Member + Model confirmation URLs remain withheld until official payment approval.
 */
(() => {
  if (location.pathname !== "/sigil/jobs" || window.__mmdClaim20) return;
  window.__mmdClaim20 = 1;
  let last = null;
  const originalFetch = window.fetch;

  function box(label, url, status) {
    const container = document.createElement("div");
    container.style.cssText = "padding:14px;border:1px solid rgba(255,255,255,.14);border-radius:14px;min-width:0;flex:1";
    const title = document.createElement("b");
    title.textContent = label;
    title.style.cssText = "display:block;margin-bottom:7px";
    container.append(title);
    if (url) {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = url;
      link.style.cssText = "color:#f0d78f;font-size:12px;word-break:break-all;text-decoration:underline";
      container.append(link);
    } else {
      const text = document.createElement("span");
      text.textContent = status;
      text.style.cssText = "color:rgba(250,247,241,.62);font-size:12px";
      container.append(text);
    }
    return container;
  }

  function render(data) {
    const root = document.getElementById("mmd-sigil-job-v9");
    const actions = root?.querySelector(".sj10__success-actions");
    if (!actions) return;
    actions.querySelectorAll("[data-copy-customer],[data-copy-model],[data-url-output],[data-reconcile-wrap],[data-line-claim-v19],[data-line-claim-v20]").forEach((element) => element.remove());
    const wrap = document.createElement("div");
    wrap.dataset.lineClaimV20 = "1";
    wrap.style.cssText = "display:flex;flex:1 1 100%;gap:10px;flex-wrap:wrap";
    actions.prepend(wrap);

    const paymentUrl = data?.customer_payment_url || "";
    wrap.append(
      box("Customer Payment URL", paymentUrl, "กำลังสร้าง Payment Intent…"),
      box("Member URL", "", "รอ MMD Approve Payment แล้วระบบจะส่งผ่าน Telegram"),
      box("Model URL", "", "รอ MMD Approve Payment แล้วระบบจะส่งผ่าน Telegram"),
    );
  }

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const input = args[0];
      const url = typeof input === "string" ? input : input?.url || "";
      const method = (args[1]?.method || input?.method || "GET").toUpperCase();
      if (method === "POST" && url.includes("/v1/admin/job/create")) {
        response.clone().json().then((data) => {
          last = data;
          render(last);
        });
      }
    } catch {}
    return response;
  };

  (function boot() {
    if (!document.getElementById("mmd-sigil-job-v9")) return setTimeout(boot, 120);
    render(last || {});
  })();
})();
