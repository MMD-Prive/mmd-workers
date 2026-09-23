(function () {
  "use strict";

  const DASHBOARD = "/member/dashboard";
  const MY_MMD = "/member/my-mmd";
  const MY_MMD_CANONICAL = "/my-mmd/";
  const CARE_BACK_COUPONS = "/my-mmd/coupons";
  const COUPON_ENTRY = "/coupon";
  const LIFF_STATUS = "https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status";
  const CARE_BACK_WISH = "/promotion/6-years-care-back/wish";
  const PUBLIC_MEMBERSHIP = "/pay/membership";

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

  function memberLoginTarget() {
    const params = new URLSearchParams(location.search);
    const target = params.get("return_to") === "coupon" ? COUPON_ENTRY : MY_MMD_CANONICAL;
    const token = String(params.get("t") || "").trim();
    if (!token) return target;
    const url = new URL(target, location.origin);
    url.searchParams.set("t", token);
    return `${url.pathname}${url.search}`;
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
    style.textContent = "#mr4 .mr4-title,#mr4 .mr4-h2{color:#201816!important;-webkit-text-fill-color:#201816!important}#mr4[data-renewal-simple=\"1\"] .mr4-pay{display:none!important}#mmdBenefitsFullV4 .bf4-th,#mmdBenefitsFullV4 .bf4-en{color:#fff8ed!important;-webkit-text-fill-color:#fff8ed!important}";
    document.head.appendChild(style);
  }

  async function memberApi(path, init) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      headers: {
        accept: "application/json",
        ...(init && init.body ? { "content-type": "application/json" } : {}),
        ...((init && init.headers) || {}),
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) {
      const error = new Error(payload?.error?.code || payload?.error || `member_api_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload.data && typeof payload.data === "object" ? payload.data : payload;
  }

  function privateRenewalTier(value) {
    const tier = String(value || "").trim().toLowerCase();
    return tier === "standard" || tier === "premium" ? tier : "";
  }

  function canonicalPaymentUrl(value) {
    try {
      const url = new URL(String(value || ""), location.origin);
      if (url.protocol !== "https:" || url.hostname !== "mmdbkk.com" || url.pathname !== "/sigil/pay" || !url.searchParams.get("t")) return "";
      for (const key of url.searchParams.keys()) if (key !== "t") return "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function renewalStatusNode(root) {
    let node = root.querySelector("[data-mr4-renewal-status]");
    if (node) return node;
    const card = root.querySelector("#mr4-rates .mr4-head") || root.querySelector(".mr4-head");
    if (!card) return null;
    node = document.createElement("p");
    node.dataset.mr4RenewalStatus = "1";
    node.className = "mr4-sub";
    node.setAttribute("role", "status");
    card.appendChild(node);
    return node;
  }

  async function startRenewalPayment(root, tier, trigger) {
    const status = renewalStatusNode(root);
    const original = trigger.textContent;
    trigger.setAttribute("aria-busy", "true");
    trigger.style.pointerEvents = "none";
    trigger.textContent = "กำลังคำนวณเรทต่ออายุ…";
    if (status) status.textContent = "ระบบกำลังตรวจสถานะเดิมและยอดใช้บริการย้อนหลัง 365 วันให้ครับ";
    try {
      await memberApi("/member/api/liff/intent", {
        method: "POST",
        body: JSON.stringify({ liff_intent: "renew" }),
      });
      await memberApi("/member/api/liff/package", {
        method: "POST",
        body: JSON.stringify({ requested_package_code: tier }),
      });
      const payment = await memberApi("/member/api/liff/payment-intent", {
        method: "POST",
        body: JSON.stringify({ package_code: tier, payment_stage: "renewal" }),
      });
      const target = canonicalPaymentUrl(payment.redirect_to || payment.customer_payment_url);
      if (!target) throw new Error("canonical_payment_url_missing");
      trigger.textContent = "กำลังเปิดหน้าชำระเงิน…";
      location.assign(target);
    } catch (error) {
      trigger.removeAttribute("aria-busy");
      trigger.style.pointerEvents = "";
      trigger.textContent = original;
      if (status) status.textContent = error?.status === 401
        ? "กรุณาเปิด MY MMD เพื่อยืนยันตัวตนก่อนต่ออายุครับ"
        : "ยังเตรียมรายการชำระไม่ได้ในตอนนี้ กรุณาลองอีกครั้ง หรือกลับไปที่ MY MMD ครับ";
    }
  }

  async function setupRenewalFlow(root) {
    if (root.dataset.renewalFlowBound === "1") return;
    root.dataset.renewalFlowBound = "1";
    root.dataset.renewalSimple = "1";

    const premiumCopy = root.querySelector(".mr4-card.premium .mr4-tier span");
    if (premiumCopy) premiumCopy.textContent = "สมัครใหม่ 2,999 บาท / 2 ปี";

    const legacyPay = root.querySelector("#mr4-pay");
    if (legacyPay) {
      legacyPay.hidden = true;
      legacyPay.setAttribute("aria-hidden", "true");
    }
    const legacyPaymentLink = root.querySelector("[data-mr4-payment-link]");
    if (legacyPaymentLink) legacyPaymentLink.removeAttribute("href");

    const dock = root.querySelector(".mr4-dock a");
    if (dock) {
      dock.setAttribute("href", "#mr4-rates");
      dock.textContent = "ต่ออายุสมาชิก";
    }

    const status = renewalStatusNode(root);
    if (status) status.textContent = "กำลังดูสถานะสมาชิกของคุณ เพื่อแสดงทางต่ออายุที่ตรงกับข้อมูลจริงครับ";

    let profile;
    try {
      profile = await memberApi("/member/api/liff/profile", { method: "GET" });
    } catch (error) {
      if (status) status.textContent = "เปิด MY MMD เพื่อยืนยันสถานะสมาชิกก่อน แล้วกลับมาต่ออายุได้ทันทีครับ";
      root.querySelectorAll("[data-mr4-select]").forEach((anchor) => {
        anchor.textContent = "ยืนยันผ่าน MY MMD";
        anchor.setAttribute("href", MY_MMD);
      });
      return;
    }

    const tier = privateRenewalTier(profile.tier || profile.member?.tier);
    if (!tier) {
      if (status) status.textContent = "สถานะนี้ต้องให้ MMD ตรวจทางต่ออายุที่เหมาะสมใน MY MMD ครับ";
      root.querySelectorAll("[data-mr4-select]").forEach((anchor) => {
        anchor.textContent = "กลับ MY MMD";
        anchor.setAttribute("href", MY_MMD);
      });
      return;
    }

    root.querySelectorAll("[data-mr4-select]").forEach((anchor) => {
      const anchorTier = privateRenewalTier(anchor.getAttribute("data-mr4-select"));
      const card = anchor.closest(".mr4-card");
      if (anchorTier !== tier) {
        if (card) card.hidden = true;
        return;
      }
      if (card) {
        card.hidden = false;
        card.dataset.currentRenewalTier = "1";
      }
      const label = tier === "premium" ? "Premium" : "Standard";
      anchor.textContent = `คำนวณเรทและต่ออายุ ${label}`;
      anchor.setAttribute("href", "#");
      anchor.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        startRenewalPayment(root, tier, anchor);
      }, true);
    });

    const ratesTitle = root.querySelector("#mr4-rates .mr4-h2");
    const ratesSub = root.querySelector("#mr4-rates .mr4-sub");
    if (ratesTitle) ratesTitle.textContent = `ต่ออายุ ${tier === "premium" ? "Premium" : "Standard"}`;
    if (ratesSub) ratesSub.textContent = "ไม่ต้องเลือกเรทเองครับ ระบบจะใช้ประวัติที่ยืนยันแล้วใน 365 วันเพื่อคำนวณอัตราที่ถูกต้องก่อนสร้างรายการชำระ";
    if (status) status.textContent = "กดครั้งเดียว ระบบจะคำนวณเรทที่ตรงกับคุณ แล้วเปิดหน้าชำระเงินพร้อมเลขอ้างอิงให้อัตโนมัติครับ";
  }

  function patch() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    let root;
    const PUBLIC_MEMBERSHIP_SURFACES = new Set(["/", "/hall", "/profiles", "/public/access", "/services/companion", "/booking"]);
    if (PUBLIC_MEMBERSHIP_SURFACES.has(path)) {
      setLinks('a[href="/membership"],a[href^="/membership?"]', PUBLIC_MEMBERSHIP);
    }

    if (path === "/member/login") {
      const target = memberLoginTarget();
      document.querySelectorAll("[data-mml-login]").forEach((anchor) => anchor.setAttribute("href", target));
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
        root.dataset.dashboardUrl = CARE_BACK_COUPONS;
        setLinks('a[href*="/member/liff"],a[href*="miniapp.line.me"],a[href*="/member/my-mmd"],a[href="/my-mmd/"],a[href="/my-mmd"]', CARE_BACK_COUPONS, root);
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
        setLinks('a[href^="/member/my-mmd"]', MY_MMD, root);
        setupRenewalFlow(root);
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


(function(){'use strict';const p=location.pathname.replace(/\/+$/,'')||'/';if(!p.startsWith('/partner'))return;const css=`
[data-mmd-partner-canon-v3] .mmd-canon-primary{background:#d7af67!important;border-color:#d7af67!important;color:#17120b!important;box-shadow:0 12px 28px rgba(215,175,103,.16)!important}
[data-mmd-partner-canon-v3] .mmd-canon-secondary{background:rgba(10,9,8,.78)!important;border-color:rgba(215,175,103,.48)!important;color:#f5e2b5!important}
.mmd-partner-friend-canon{--paper:#0a0908!important;--paper2:#0f0d0b!important;--ivory:#fff9f0!important;--ink:#fff9f0!important;--text:#d9d1c7!important;--muted:#91887f!important;--line:rgba(215,175,103,.28)!important;--wine:#d7af67!important;--wine2:#f5e2b5!important;--rose:#2a0e13!important;--soft:#12100e!important;--shadow:rgba(0,0,0,.45)!important;background:radial-gradient(circle at 84% 0,rgba(215,175,103,.12),transparent 30%),linear-gradient(180deg,#0a0908,#0f0d0b)!important;color:#d9d1c7!important}
.mmd-partner-friend-canon :is(.rm13-heroin,.rm13-block,.rm13-final,.rm13-card,.rm13-deep,.rma02-hero-in,.rma02-panel,.rma02-form-shell,.rma02-warning,.rma02-final,.rma02-form,.rma02-cards article,.rma02-routes article,.rma02-steps li,.rma02-note,.rma02-form fieldset,.rma02-prompt,.rmr04-hero-card,.rmr04-panel,.rmr04-gallery,.rmr04-final,.rmr04-card,.rmr04-steps li){background:linear-gradient(145deg,#171411,#0d0c0a)!important;color:#d9d1c7!important;box-shadow:0 18px 48px rgba(0,0,0,.28)!important}
.mmd-partner-friend-canon :is(.rma02-branch,.rmr04-branch){background:rgba(10,9,8,.88)!important;border-color:rgba(215,175,103,.28)!important}.mmd-partner-friend-canon :is(.rma02-drawer,.rmr04-drawer,.rma02-menu,.rmr04-menu,.rma02-dock button,.rmr04-dock button,.rma02-listnav button,.rma02-child button,.rmr04-drawer-list button,.rmr04-child-list button,.rmr04-back){background:#12100e!important;color:#fff9f0!important;border-color:rgba(215,175,103,.32)!important}
.mmd-partner-friend-canon :is(.rma02-form input,.rma02-form select,.rma02-form textarea){background:#0f0d0b!important;color:#fff9f0!important;border-color:rgba(215,175,103,.36)!important}.mmd-partner-friend-canon :is(h1,h2,h3,b,strong){color:#fff9f0!important}.mmd-partner-friend-canon :is(p,small,span){color:inherit}.mmd-partner-friend-canon :is(.rm13-copy h1,.rma02-copy h1,.rmr04-copy h1){font-size:clamp(2.25rem,5vw,4rem)!important;line-height:1.04!important;letter-spacing:-.04em!important}.mmd-partner-friend-canon :is(.rm13-copy h1 em,.rma02-copy h1 em,.rmr04-copy h1 em){color:#f5e2b5!important}.mmd-partner-friend-canon :is(.rm13-btn.main,.rma02-btn.main,.rma02-submit,.rmr04-btn.primary,.rma02-dock .main,.rmr04-dock .main){background:#d7af67!important;border-color:#d7af67!important;color:#17120b!important}.mmd-partner-friend-canon :is(.rm13-btn:not(.main),.rma02-btn:not(.main),.rmr04-btn.ghost){background:#12100e!important;border-color:rgba(215,175,103,.48)!important;color:#f5e2b5!important}.mmd-partner-friend-canon :is(.rmr04-hero-media::after){background:linear-gradient(180deg,transparent 38%,rgba(10,9,8,.88))!important}@media(max-width:640px){.mmd-partner-friend-canon :is(.rm13-copy h1,.rma02-copy h1,.rmr04-copy h1){font-size:clamp(2.15rem,10vw,3.15rem)!important}}
`;function style(){if(document.getElementById('mmd-partner-canon-v3'))return;const s=document.createElement('style');s.id='mmd-partner-canon-v3';s.textContent=css;document.head.append(s)}function words(){const r=[['YUKI','MMD'],['Yuki','MMD Partner Desk'],['Start Partner Review','เริ่ม Partner Intake'],['Start Partner Intake','เริ่ม Partner Intake'],['สมัคร Service Partner','เริ่ม Service Partner Intake'],['Enter Talent Review','เริ่ม Modeling Partner Intake'],['Enter Service Review','เริ่ม Service Partner Intake'],['Enter Brand Review','เริ่ม Brand / Venue Intake'],['Request Private Review','เริ่ม Private Access Intake'],['Open Referral Lane','เริ่ม Client / Referral Intake']];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);for(let n;n=w.nextNode();){if(n.parentElement&&/^(SCRIPT|STYLE)$/i.test(n.parentElement.tagName))continue;let v=n.nodeValue;for(const [a,b]of r)if(v.includes(a))v=v.split(a).join(b);if(v!==n.nodeValue)n.nodeValue=v}}function links(){document.querySelectorAll('a[href]').forEach(a=>{let h=a.getAttribute('href')||'';if(h==='/partner/login')h='/sigil/model/dashboard/partner-login';if(h==='/partner/model/recommend-model/apply'||h==='/partner/model/recommend-model-apply')h='/partner/model/recommend-model-apply?source=model-to-model';if(h.startsWith('/partner/apply')){const u=new URL(h,location.origin);if(u.searchParams.get('partner_type')==='model')u.searchParams.set('partner_type','modeling');if(u.searchParams.get('intent')==='refer_model'){u.searchParams.delete('intent');u.searchParams.set('partner_type','modeling')}h=u.pathname+u.search+u.hash}a.setAttribute('href',h)})}function ctas(){document.body.dataset.mmdPartnerCanonV3='1';document.querySelectorAll('a,button').forEach(e=>{const t=(e.textContent||'').trim().replace(/\s+/g,' ');if(/^(เริ่ม|ส่งชื่อ|ส่งเข้า|เข้าสู่ระบบด้วย LINE|เปิด Partner Dashboard|OPEN PARTNER|START$|CONTINUE)/i.test(t))e.classList.add('mmd-canon-primary');else if(/^(ดู|อ่าน|Partner Home|READ|VIEW)/i.test(t))e.classList.add('mmd-canon-secondary')})}function apply(){style();if(document.querySelector('.mmd-rm13,.mmd-rma02,.mmd-rmr04'))document.querySelector('.mmd-rm13,.mmd-rma02,.mmd-rmr04').classList.add('mmd-partner-friend-canon');links();words();ctas()}apply();let q;new MutationObserver(()=>{clearTimeout(q);q=setTimeout(apply,80)}).observe(document.documentElement,{childList:true,subtree:true})})();
