/* Source mirror for Webflow registered script SigilJobsLineClaimV19.
 * The live page shows signed customer/model LINE identity URLs returned by
 * admin-worker. It never asks the owner to type Airtable record IDs.
 */
(() => {
  if (location.pathname !== "/sigil/jobs" || window.__mmdClaim19) return;
  window.__mmdClaim19 = 1;
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

  function mount(data) {
    const root = document.getElementById("mmd-sigil-job-v9");
    const actions = root?.querySelector(".sj10__success-actions");
    if (!actions) return;
    actions.querySelectorAll("[data-copy-customer],[data-copy-model],[data-url-output],[data-reconcile-wrap]").forEach((element) => element.remove());
    let wrap = actions.querySelector("[data-line-claim-v19]");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.dataset.lineClaimV19 = "1";
      wrap.style.cssText = "display:flex;flex:1 1 100%;gap:10px;flex-wrap:wrap";
      actions.prepend(wrap);
    }
    wrap.innerHTML = "";
    const customerFinal = data?.customer_confirmation_url || "";
    const modelFinal = data?.model_confirmation_url || "";
    const customerClaim = data?.customer_identity_url || "";
    const modelClaim = data?.model_identity_url || "";
    wrap.append(
      box(customerFinal ? "Customer Confirmation URL" : "Customer · ยืนยัน LINE", customerFinal || customerClaim, customerFinal ? "พร้อมส่งลูกค้า" : data?.pending_client === false ? "LINE linked ✓ · รออีกฝ่าย" : "ส่ง URL นี้ให้ลูกค้ากดใน LINE"),
      box(modelFinal ? "Model Confirmation URL" : "Model · ยืนยัน LINE", modelFinal || modelClaim, modelFinal ? "พร้อมส่งนายแบบ" : data?.pending_model === false ? "LINE linked ✓ · รออีกฝ่าย" : "ส่ง URL นี้ให้นายแบบกดใน LINE"),
    );
    let note = actions.querySelector("[data-claim-note]");
    if (!note) {
      note = document.createElement("p");
      note.dataset.claimNote = "1";
      note.style.cssText = "flex:1 1 100%;margin:0;color:rgba(250,247,241,.62);font-size:12px";
      actions.append(note);
    }
    note.textContent = customerClaim || modelClaim
      ? "ไม่ต้องหา rec ID · คนที่กดลิงก์จะยืนยัน LINE และ Worker จะหา Canonical ID ให้เอง"
      : "ระบบจะแสดงลิงก์ยืนยัน LINE เมื่อ Job อยู่ใน identity hold";
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
          setTimeout(() => mount(data), 0);
        });
      }
    } catch {}
    return response;
  };

  (function boot() {
    if (!document.getElementById("mmd-sigil-job-v9")) return setTimeout(boot, 120);
    mount(last || {});
  })();
})();
