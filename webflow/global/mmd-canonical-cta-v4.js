(function () {
  "use strict";

  const DASHBOARD = "/member/dashboard";
  const MY_MMD = "/member/my-mmd";
  const LIFF_STATUS = "https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status";
  const CARE_BACK_WISH = "/promotion/6-years-care-back/wish";

  function setLinks(selector, target, root = document) {
    root.querySelectorAll(selector).forEach((anchor) => {
      const raw = anchor.getAttribute("href") || "";
      if (target.startsWith("/") && raw) {
        try {
          const previous = new URL(raw, location.origin);
          anchor.setAttribute("href", `${target}${previous.search}${previous.hash}`);
          return;
        } catch (_) {}
      }
      anchor.setAttribute("href", target);
    });
  }

  function patchCareBackTier(root, tier, duration, text) {
    const card = root.querySelector(`[data-tier="${tier}"]`);
    if (!card) return;
    const durationNode = card.querySelector(".bf4-level-top em");
    const priceUnit = card.querySelector(".bf4-price span");
    const list = card.querySelector("ul");
    let note = list && list.querySelector("[data-careback]");
    if (durationNode) durationNode.textContent = duration;
    if (priceUnit) priceUnit.textContent = `THB / ${duration}`;
    if (list && !note) {
      note = document.createElement("li");
      note.dataset.careback = "1";
      list.appendChild(note);
    }
    if (note) note.textContent = text;
  }

  function ensureContrastGuard() {
    if (document.getElementById("mmd-canonical-cta-v41-contrast")) return;
    const style = document.createElement("style");
    style.id = "mmd-canonical-cta-v41-contrast";
    style.textContent = "#mr4 .mr4-title,#mr4 .mr4-h2{color:#201816!important;-webkit-text-fill-color:#201816!important}#mmdBenefitsFullV4 .bf4-th,#mmdBenefitsFullV4 .bf4-en{color:#fff8ed!important;-webkit-text-fill-color:#fff8ed!important}";
    document.head.appendChild(style);
  }

  function patch() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    let root;

    if (path === "/member/login") {
      setLinks("[data-mml-login]", LIFF_STATUS);
    }

    if (path === "/public/access") {
      root = document.getElementById("mmd-access-gate");
      if (root) {
        const buttons = root.querySelectorAll(".mag-button");
        if (buttons[0]) buttons[0].setAttribute("href", LIFF_STATUS);
        if (buttons[1]) buttons[1].setAttribute("href", MY_MMD);
      }
    }

    if (path === "/promotion/6-years-care-back") {
      root = document.getElementById("mmd-careback-six-v6");
      if (root) {
        root.dataset.memberUrl = MY_MMD;
        setLinks("[data-member-link]", MY_MMD, root);
        setLinks("[data-wish-link]", CARE_BACK_WISH, root);
      }
    }

    if (path === "/promotion/6-years-care-back/wish") {
      root = document.getElementById("mmd-wish");
      if (root) {
        root.dataset.dashboardUrl = MY_MMD;
        setLinks('a[href*="/member/liff"],a[href*="miniapp.line.me"]', MY_MMD, root);
      }
    }

    if (path === "/member/promotion") {
      root = document.querySelector("[data-mmd-member-promo-mb10]");
      if (root) setLinks("[data-mmd-mp10-dashboard]", DASHBOARD, root);
    }

    if (path === "/membership" || path === "/member/membership") {
      root = document.getElementById("mmd-member-membership");
      if (root) {
        root.dataset.dashboardRoute = DASHBOARD;
        setLinks('[data-route="dashboard"]', DASHBOARD, root);
      }
    }

    if (path === "/member/payments") {
      root = document.getElementById("mmd-payments-maxx");
      if (root) {
        root.dataset.dashboardPath = DASHBOARD;
        setLinks(".mpx__brand,.mpx__dashboard", DASHBOARD, root);
      }
    }

    if (path === "/sigil/member/membership/benefits") {
      root = document.getElementById("mmdBenefitsFullV4");
      if (root) {
        setLinks('a[href^="/sigil/member/dashboard"]', DASHBOARD, root);
        patchCareBackTier(root, "standard", "1 YEAR", "CARE BACK · ส.ค. 2026 +180 วัน หลังยืนยัน");
        patchCareBackTier(root, "premium", "2 YEARS", "CARE BACK · ส.ค. 2026 +1 ปี หลังยืนยัน");
      }
    }

    if (path === "/member/renewal") {
      root = document.getElementById("mr4");
      if (root) {
        setLinks('a[href^="/member/my-mmd"]', DASHBOARD, root);
        const premium = root.querySelector(".mr4-card.premium .mr4-tier span");
        const paymentLink = root.querySelector("[data-mr4-payment-link]");
        if (premium) premium.textContent = "สมัครใหม่ 2,999 บาท / 2 ปี";
        if (paymentLink) paymentLink.textContent = "ไปต่อที่รายการชำระ";
      }
    }

    if (path === "/member/my-mmd") {
      setLinks('a[href*="miniapp.line.me"]', LIFF_STATUS);
    }

    ensureContrastGuard();
  }

  function boot() {
    patch();
    let timer;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(patch, 50);
    }).observe(document.documentElement, { subtree: true, childList: true });
    setTimeout(patch, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
