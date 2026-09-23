(function () {
  "use strict";

  var COUPON_URL = "/my-mmd/coupons";

  function boot() {
    var root = document.getElementById("mmd-wish");
    if (!root || root.dataset.memberFlowV30 === "1") return;
    root.dataset.memberFlowV30 = "1";

    function enforceRoot() {
      if (root.getAttribute("data-wish-version") !== "2026.09.21-member-flow-v30") {
        root.setAttribute("data-wish-version", "2026.09.21-member-flow-v30");
      }
      if (root.getAttribute("data-dashboard-url") !== COUPON_URL) {
        root.setAttribute("data-dashboard-url", COUPON_URL);
      }
    }
    enforceRoot();

    var copy = {
      th: {
        title: "ทุกคนอวยพรได้\nระบบจัดสิทธิ์ให้เอง",
        lead: "ส่งได้ทันที ไม่ต้อง Login — สมาชิกเก่า สมาชิกหมดอายุ และสมาชิกปัจจุบัน ยืนยัน LINE ครั้งเดียวเพื่อให้ข้อความขึ้นแบบไม่ระบุชื่อและรับคูปองใน MY MMD ทันที",
        start: "เขียนคำอวยพรถึง MMD",
        status: "ทุกคนส่งได้ · ระบบยังไม่เผยแพร่จนยืนยันว่าเคยเป็นสมาชิก",
        separation: "เคยเป็นสมาชิก = ข้อความขึ้น + คูปองทันที · ไม่เคยเป็นสมาชิก = เก็บข้อความแบบส่วนตัว",
        consent: "ยืนยันส่งข้อความนี้ และยินยอมให้แสดงแบบไม่ระบุชื่อ หากระบบยืนยันว่าเคยเป็นสมาชิก MMD",
        success: "คำอวยพรถูกบันทึกแล้วครับ หากเคยเป็นสมาชิก เปิด MY MMD เพื่อยืนยัน LINE — ข้อความจะขึ้นและคูปองจะเข้า Wallet ทันที",
        dashboard: "เปิด MY MMD · รับคูปอง",
        phaseTitle: "อวยพรได้ทุกคน\nสิทธิ์สมาชิกตรวจทีหลัง",
        phaseLead: "ไม่ต้อง Login ก่อนส่งครับ ระบบจะตรวจว่าเคยเป็นสมาชิกหรือไม่ตอนยืนยัน LINE",
        phaseSmall: "สมาชิกเก่า · สมาชิกหมดอายุ · สมาชิกปัจจุบัน",
        phaseReward: "ข้อความขึ้น + รับคูปองทันที",
        phaseValid: "คูปองเข้า MY MMD · ใช้ได้ 1 ครั้ง · อายุ 2 เดือน",
        phaseFine: "ส่วนลดจริงขึ้นอยู่กับสถานะสมาชิก นายแบบ และประเภทงานที่ MMD ยืนยันได้ · สมาชิกเก่า สมาชิกหมดอายุ และสมาชิกปัจจุบันรับคูปองทันที · ผู้ที่ไม่เคยเป็นสมาชิกไม่มีคูปอง",
        verifiedTitle: "สมาชิกที่ยืนยันแล้ว รับคูปองทันที",
        verifiedBody: "สมาชิกเก่า สมาชิกหมดอายุ และสมาชิกปัจจุบันรับคูปองได้ทันทีใน MY MMD · ผู้ที่ไม่เคยเป็นสมาชิกจะไม่มีคูปอง",
        phaseCta: "เริ่มเขียนคำอวยพร"
      },
      en: {
        title: "Everyone can send a wish\nMembership is checked afterward",
        lead: "Send now without logging in. Past, expired and current members verify LINE once to publish anonymously and receive the coupon in My MMD immediately.",
        start: "Write a wish to MMD",
        status: "Anyone can send · Nothing is published until past or current membership is verified.",
        separation: "Past or current member = published + instant coupon · Non-member = kept private",
        consent: "Send this message and display it anonymously if MMD verifies that I am or was a member.",
        success: "Your wish is saved. If you have ever been a member, open My MMD and verify LINE — your wish will appear and the coupon will enter your wallet immediately.",
        dashboard: "Open My MMD · Get coupon",
        phaseTitle: "Everyone can make a wish\nMembership is checked later",
        phaseLead: "No login is needed before sending. MMD checks past or current membership when LINE is verified.",
        phaseSmall: "PAST · EXPIRED · CURRENT MEMBERS",
        phaseReward: "Wish published + coupon immediately",
        phaseValid: "Delivered to My MMD · single use · valid 2 months",
        phaseFine: "The final rate follows verified membership, Model and job type. Past, expired and current members receive the coupon immediately; non-members do not.",
        verifiedTitle: "Verified members receive the coupon immediately",
        verifiedBody: "Past, expired and current members receive it immediately in My MMD. Non-members do not receive a coupon.",
        phaseCta: "Start writing my wish"
      },
      zh: {
        title: "任何人都可以送上祝福\n会员资格稍后核验",
        lead: "无需登录即可发送。旧会员、已到期会员和当前会员只需验证一次 LINE，祝福便会匿名显示，优惠券也会立即进入 My MMD。",
        start: "写下给 MMD 的祝福",
        status: "任何人都可发送；核实曾经或当前为会员前不会公开。",
        separation: "曾经或当前是会员 = 公开祝福 + 立即获得优惠券 · 非会员 = 私密保存",
        consent: "发送此留言；若 MMD 核实我现在或过去是会员，可匿名公开显示。",
        success: "祝福已保存。如果您曾是会员，请打开 My MMD 验证 LINE；祝福会显示，优惠券也会立即进入 Wallet。",
        dashboard: "打开 My MMD · 领取优惠券",
        phaseTitle: "任何人都可以送祝福\n稍后核验会员资格",
        phaseLead: "发送前无需登录；验证 LINE 时才核实是否曾是 MMD 会员。",
        phaseSmall: "旧会员 · 已到期会员 · 当前会员",
        phaseReward: "祝福显示 + 立即获得优惠券",
        phaseValid: "进入 My MMD · 限用一次 · 有效期 2 个月",
        phaseFine: "实际折扣以已核实的会员状态、模特和工作类型为准。旧会员、已到期会员和当前会员立即获得优惠券；非会员不会获得。",
        verifiedTitle: "会员验证后立即获得优惠券",
        verifiedBody: "旧会员、已到期会员和当前会员可立即在 My MMD 获得优惠券；非会员不会获得优惠券。",
        phaseCta: "开始写祝福"
      }
    };

    function language() {
      var value = String(root.lang || document.documentElement.lang || "th").toLowerCase();
      return value.indexOf("zh") === 0 ? "zh" : value.indexOf("en") === 0 ? "en" : "th";
    }

    function text(selector, value) {
      var element = root.querySelector(selector);
      if (element) element.textContent = value;
    }

    function setHref(element, value) {
      if (element && element.getAttribute("href") !== value) element.setAttribute("href", value);
    }

    function rewriteCouponLinks() {
      Array.prototype.slice.call(root.querySelectorAll('a[data-dashboard],a[data-cb-my],a[href*="/member/my-mmd"],a[href="/my-mmd/"],a[href="/my-mmd"]')).forEach(function (anchor) {
        if (!anchor.classList.contains("wish-phase2__cta")) setHref(anchor, COUPON_URL);
      });
    }

    function patchLegacyBenefits(current) {
      var phase = root.querySelector("[data-phase2-coupon]");
      if (phase) {
        var fine = phase.querySelector(".wish-phase2__fine");
        if (!fine) {
          fine = Array.prototype.slice.call(phase.querySelectorAll("p")).find(function (paragraph) {
            return /ส่วนลดจริง|Actual discount|实际折扣/.test(paragraph.textContent || "");
          });
        }
        if (fine) fine.textContent = current.phaseFine;
      }

      Array.prototype.slice.call(root.querySelectorAll("[data-cb-verify],.wish-benefits-v28>div")).forEach(function (panel) {
        var title = panel.querySelector("strong");
        var body = panel.querySelector("p");
        if (title) title.textContent = current.verifiedTitle;
        if (body) body.textContent = current.verifiedBody;
      });
      var benefitsUrl = root.querySelector(".wish-benefits-v28__url");
      if (benefitsUrl) benefitsUrl.textContent = "mmdbkk.com/my-mmd/coupons";
    }

    function apply() {
      enforceRoot();
      var current = copy[language()];
      text('[data-wish-copy="title"]', current.title);
      text('[data-wish-copy="lead"]', current.lead);
      text('[data-wish-copy="start"]', current.start);
      var status = root.querySelector("[data-status]");
      if (status && !status.dataset.state) status.textContent = current.status;
      text('[data-wish-copy="separation"]', current.separation);
      text('[data-wish-copy="consent"]', current.consent);
      text("[data-success-copy]", current.success);

      var dashboard = root.querySelector("[data-dashboard]");
      if (dashboard) {
        setHref(dashboard, COUPON_URL);
        dashboard.setAttribute("aria-label", current.dashboard);
        var dashboardLabel = dashboard.querySelector("span");
        if (dashboardLabel) dashboardLabel.textContent = current.dashboard;
        else dashboard.textContent = current.dashboard;
      }

      var phase = root.querySelector("[data-phase2-coupon]");
      if (phase) {
        text("[data-phase2-coupon] h2", current.phaseTitle);
        text("[data-phase2-coupon] .wish-phase2__lead", current.phaseLead);
        text("[data-phase2-coupon] .wish-phase2__reward small", current.phaseSmall);
        text("[data-phase2-coupon] .wish-phase2__reward strong", current.phaseReward);
        text("[data-phase2-coupon] .wish-phase2__reward span", current.phaseValid);
        text("[data-phase2-coupon] .wish-phase2__fine", current.phaseFine);
        var phaseCta = phase.querySelector(".wish-phase2__cta");
        if (phaseCta) {
          phaseCta.href = "#wish-flow";
          phaseCta.setAttribute("aria-label", current.phaseCta);
          var first = phaseCta.firstChild;
          if (first && first.nodeType === 3) first.nodeValue = current.phaseCta + " ";
          else phaseCta.textContent = current.phaseCta;
        }
      }
      patchLegacyBenefits(current);
      rewriteCouponLinks();
    }

    Array.prototype.slice.call(root.querySelectorAll(".wish-public-consent")).forEach(function (element) {
      element.remove();
    });

    // Compatibility bridge for the older Webflow form runtime. The only
    // visible choice remains the native consent checkbox.
    var nativeConsent = root.querySelector("[data-consent]");
    var consentBridge = root.querySelector("[data-public-consent]");
    if (nativeConsent && !consentBridge) {
      consentBridge = document.createElement("input");
      consentBridge.type = "checkbox";
      consentBridge.hidden = true;
      consentBridge.tabIndex = -1;
      consentBridge.setAttribute("aria-hidden", "true");
      consentBridge.setAttribute("data-public-consent", "");
      root.appendChild(consentBridge);
    }
    function syncConsent(notify) {
      if (!nativeConsent || !consentBridge) return;
      consentBridge.checked = nativeConsent.checked === true;
      if (notify) consentBridge.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (nativeConsent && consentBridge) {
      nativeConsent.addEventListener("change", function () { syncConsent(true); }, true);
      syncConsent(false);
      setTimeout(function () {
        nativeConsent.dispatchEvent(new Event("change", { bubbles: true }));
      }, 0);
    }

    Array.prototype.slice.call(root.querySelectorAll(".wish-v23-ribbon,.wish-v23-policy")).forEach(function (element) {
      element.hidden = true;
    });

    document.addEventListener("mmd:care-back:wish-linked", function (event) {
      var detail = event && event.detail || {};
      // The legacy Webflow runtime emits this event without eligibility data.
      // Keep the accurate conditional success copy in that case rather than
      // incorrectly labelling a verified member as a non-member.
      if (typeof detail.eligible !== "boolean") return;
      var current = copy[language()];
      var message = detail.eligible === true
        ? current.success
        : language() === "th"
          ? "บันทึกคำอวยพรแบบส่วนตัวแล้วครับ เนื่องจากระบบยังไม่พบสถานะสมาชิก จึงไม่แสดงบน Wish Wall และไม่ออกคูปอง"
          : language() === "zh"
            ? "祝福已私密保存。系统未找到会员记录，因此不会显示在 Wish Wall，也不会发放优惠券。"
            : "Your wish was saved privately. No member record was found, so it will not appear on the Wish Wall and no coupon is issued.";
      text("[data-success-copy]", message);
      var status = root.querySelector("[data-status]");
      if (status) {
        status.textContent = message;
        status.dataset.state = "success";
      }
    });

    document.addEventListener("mmd:care-back:wish-completed", function () {
      setTimeout(apply, 0);
      setTimeout(apply, 120);
    });

    var applyTimer;
    new MutationObserver(function () {
      clearTimeout(applyTimer);
      applyTimer = setTimeout(apply, 40);
    }).observe(root, {
      attributes: true,
      subtree: true,
      attributeFilter: ["lang", "href", "data-dashboard-url", "data-wish-version"]
    });
    apply();
    setTimeout(apply, 120);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
