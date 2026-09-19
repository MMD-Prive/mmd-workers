/* Source mirror for Webflow registered script SigilJobsLineClaimV20.
 * Canonical 2026-09-19:
 * - unresolved LINE identity may receive short-lived identity claim links;
 * - linked jobs expose only Customer Payment URL before payment approval;
 * - Member + Model job URLs remain server-held until Official Verify.
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
    const customerClaim = data?.customer_identity_url || "";
    const modelClaim = data?.model_identity_url || "";
    if (customerClaim || modelClaim) {
      wrap.append(
        box("Customer · ยืนยัน LINE", customerClaim, customerClaim ? "" : "LINE ลูกค้าเชื่อมแล้ว"),
        box("Model · ยืนยัน LINE", modelClaim, modelClaim ? "" : "LINE Model เชื่อมแล้ว"),
      );
      return;
    }
    wrap.append(
      box("Customer Payment URL", paymentUrl, "กำลังสร้าง Payment Intent…"),
      box("Member URL", "", "รอ MMD Approve Payment แล้วระบบจะส่งผ่าน Telegram"),
      box("Model URL", "", "รอ MMD Approve Payment แล้วระบบจะส่งผ่าน Telegram"),
    );
  }

  async function refreshIdentityLinks(data) {
    const sessionId = data?.session_id;
    const held = data?.operational_status === "pending_client_link" || data?.pending_client_link === true;
    if (!held || !sessionId || data?.customer_identity_url || data?.model_identity_url) return data;
    try {
      const response = await originalFetch("/v1/admin/job/create", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          operational_create_mode: "issue_identity_links",
          session_id: sessionId,
          source: "sigil_jobs_v20",
          page: "/sigil/jobs",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || "ออกลิงก์ยืนยัน LINE ไม่สำเร็จ");
      return { ...data, ...payload };
    } catch (error) {
      return { ...data, identity_claim_error: error?.message || "ออกลิงก์ยืนยัน LINE ไม่สำเร็จ" };
    }
  }

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const input = args[0];
      const url = typeof input === "string" ? input : input?.url || "";
      const method = (args[1]?.method || input?.method || "GET").toUpperCase();
      if (method === "POST" && url.includes("/v1/admin/job/create")) {
        response.clone().json().then(async (data) => {
          last = await refreshIdentityLinks(data);
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
