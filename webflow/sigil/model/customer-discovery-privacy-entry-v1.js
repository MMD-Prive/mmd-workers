/* MY MODEL privacy navigation only. The signed Model API owns every decision. */
(() => {
  "use strict";
  function mount() {
    const root = document.getElementById("mmd-model-home-v4");
    const account = root?.querySelector("[data-mm-workspace] #mmd-model-self-service");
    if (!account || root.querySelector("[data-mm-model-privacy-entry]")) return;
    const link = document.createElement("a");
    link.href = "https://mmdbkk.com/sigil/model/dashboard/more#privacy-panel";
    link.className = "mmsecondary";
    link.setAttribute("data-mm-model-privacy-entry", "v1");
    link.setAttribute("data-i18n-text", "myModel.privacy.open");
    link.textContent = "ความเป็นส่วนตัว · ซ่อนจากลูกค้าบางคน";
    link.style.cssText = "display:flex;align-items:center;min-height:48px;margin-top:16px;padding:12px 14px;border:1px solid #9a824f;border-radius:12px;background:#25221b;color:#fff4df;font:inherit;text-decoration:underline;text-underline-offset:3px";
    account.append(link);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
