/*
  MMD SIGIL Access - Private Operating System JS
  Page: /sigil/access
  Notes:
  - Standard / Premium are self-verifiable tiers.
  - VIP / Black Card are optional access claims / review layers.
  - SVIP is internal-only and never displayed in UI.
*/

(function () {
  "use strict";

  const root = document.querySelector("[data-sigil-os]");
  if (!root) return;

  const CONFIG = {
    defaultLang: "th",
    enforceMaleWhenProvided: true,
    aftercareUrl: "/aftercare",
    startUrl: "/sigil/start",
    bookingUrl: "/sigil/booking",
    payUrl: "/sigil/pay",
    accountUrl: "/sigil/member/account"
  };

  const state = {
    lang: localStorage.getItem("mmd_sigil_lang") || CONFIG.defaultLang,
    progress: 78,
    member: {
      accessLevel: "Private",
      verifiedTier: "Premium",
      requestedTier: "Black Card",
      sessionCount: 27,
      paymentActivity: "Verified",
      restrictedLayers: "Partial Visibility",
      innerCircle: "Locked",
      status: "secure"
    }
  };

  const copy = {
    en: {
      systemStatus: "SYSTEM STATUS: SECURE",
      identityScan: "IDENTITY SCAN",
      memberstackValidated: "MEMBERSTACK VALIDATED",
      tierValidation: "TIER VALIDATION",
      accessDecrypted: "SIGIL ACCESS DECRYPTED",
      authorizationConfirmed: "AUTHORIZATION CONFIRMED",
      complete: "COMPLETE",
      active: "ACTIVE",
      verified: "VERIFIED",
      reviewRequired: "REVIEW REQUIRED",
      decryptionLevel: "DECRYPTION LEVEL",
      accessOverview: "ACCESS OVERVIEW",
      accessLevel: "Access Level:",
      verifiedTier: "Verified Tier:",
      optionalClaim: "Optional Claim:",
      sessionCount: "Session Count:",
      paymentActivity: "Payment Activity:",
      restrictedLayers: "Restricted Layers:",
      innerCircle: "Inner Circle:",
      partialVisibility: "Partial Visibility",
      locked: "Locked",
      intelligenceModule: "INTELLIGENCE MODULE",
      live: "LIVE",
      systemNote: "SYSTEM NOTE",
      systemOperations: "SYSTEM OPERATIONS",
      runAnalysis: "RUN ACCESS ANALYSIS",
      prepareSession: "PREPARE PRIVATE SESSION",
      verifyPayment: "VERIFY PAYMENT READINESS",
      openRoute: "OPEN CONTROLLED ROUTE",
      inProgress: "IN PROGRESS",
      pending: "PENDING",
      awaitingAuthorization: "AWAITING AUTHORIZATION",
      liveProtocolLog: "LIVE PROTOCOL LOG",
      clearLog: "CLEAR",
      encryptedChannel: "ENCRYPTED CHANNEL",
      privateLayer: "PRIVATE LAYER",
      zeroTrust: "ZERO TRUST PROTOCOL",
      monitoredAccess: "MONITORED ACCESS",

      kenjiDefault: "Access read completed.<br>Recommended route prepared.",
      kenjiAnalysis: "Current access layer is stable.<br>Premium verification is active. Black Card claim requires private review.",
      kenjiSession: "Private session layer prepared.<br>Proceed to controlled booking when ready.",
      kenjiPayment: "Payment readiness check initialized.<br>Verification required before session lock.",
      kenjiRoute: "Controlled route is partially visible.<br>Authorization layer remains active.",

      logBoot: "SIGIL private operating layer initialized.",
      logIdentity: "Identity scan completed.",
      logMemberstack: "Memberstack session validated.",
      logTier: "Standard / Premium validation layer active.",
      logClaim: "Optional VIP / Black Card claim layer detected.",
      logDecrypt: "SIGIL access decrypted.",
      logAuthorized: "Authorization confirmed. Restricted visibility enabled.",
      logAnalysis: "Access analysis executed by Kenji Engine.",
      logSession: "Private session preparation protocol started.",
      logPayment: "Payment readiness verification queued.",
      logRoute: "Controlled route request registered."
    },

    th: {
      systemStatus: "สถานะระบบ: ปลอดภัย / SYSTEM STATUS: SECURE",
      identityScan: "ตรวจตัวตน / IDENTITY SCAN",
      memberstackValidated: "ยืนยัน Memberstack / MEMBERSTACK VALIDATED",
      tierValidation: "ตรวจระดับสิทธิ์ / TIER VALIDATION",
      accessDecrypted: "ถอดรหัส SIGIL Access / ACCESS DECRYPTED",
      authorizationConfirmed: "ยืนยันการเข้าใช้งาน / AUTHORIZATION CONFIRMED",
      complete: "เสร็จสิ้น / COMPLETE",
      active: "ใช้งานได้ / ACTIVE",
      verified: "ยืนยันแล้ว / VERIFIED",
      reviewRequired: "รอตรวจสอบ / REVIEW REQUIRED",
      decryptionLevel: "ระดับการถอดรหัส / DECRYPTION LEVEL",
      accessOverview: "ภาพรวมสิทธิ์ / ACCESS OVERVIEW",
      accessLevel: "ระดับการเข้าถึง / Access Level:",
      verifiedTier: "ระดับที่ยืนยันแล้ว / Verified Tier:",
      optionalClaim: "สิทธิ์ที่ขอ review / Optional Claim:",
      sessionCount: "จำนวน Session / Session Count:",
      paymentActivity: "สถานะการชำระเงิน / Payment Activity:",
      restrictedLayers: "ชั้นที่จำกัด / Restricted Layers:",
      innerCircle: "Inner Circle:",
      partialVisibility: "เห็นบางส่วน / Partial Visibility",
      locked: "ล็อกอยู่ / Locked",
      intelligenceModule: "หน่วยวิเคราะห์ / INTELLIGENCE MODULE",
      live: "LIVE",
      systemNote: "บันทึกระบบ / SYSTEM NOTE",
      systemOperations: "คำสั่งระบบ / SYSTEM OPERATIONS",
      runAnalysis: "วิเคราะห์สิทธิ์ / RUN ACCESS ANALYSIS",
      prepareSession: "เตรียม Private Session / PREPARE PRIVATE SESSION",
      verifyPayment: "ตรวจความพร้อมชำระเงิน / VERIFY PAYMENT READINESS",
      openRoute: "เปิดเส้นทางควบคุม / OPEN CONTROLLED ROUTE",
      inProgress: "กำลังดำเนินการ / IN PROGRESS",
      pending: "รอดำเนินการ / PENDING",
      awaitingAuthorization: "รอการอนุญาต / AWAITING AUTHORIZATION",
      liveProtocolLog: "บันทึกระบบสด / LIVE PROTOCOL LOG",
      clearLog: "ล้าง / CLEAR",
      encryptedChannel: "ช่องทางเข้ารหัส / ENCRYPTED CHANNEL",
      privateLayer: "ชั้นส่วนตัว / PRIVATE LAYER",
      zeroTrust: "ZERO TRUST PROTOCOL",
      monitoredAccess: "การเข้าถึงถูกติดตาม / MONITORED ACCESS",

      kenjiDefault: "ตรวจ access state เรียบร้อยแล้วครับ<br>เตรียม route ที่เหมาะสมให้แล้ว / Recommended route prepared.",
      kenjiAnalysis: "ผมตรวจ access layer ให้แล้วครับ<br>Premium verification active และ Black Card claim ต้องรอ private review",
      kenjiSession: "เตรียม private session layer แล้วครับ<br>ถ้าพร้อม สามารถเข้าสู่ controlled booking ได้",
      kenjiPayment: "เริ่มตรวจ payment readiness แล้วครับ<br>ระบบต้อง verify ก่อนล็อก session",
      kenjiRoute: "controlled route เปิดให้เห็นบางส่วนแล้วครับ<br>authorization layer ยังทำงานอยู่",

      logBoot: "เปิดชั้นระบบ SIGIL private operating layer แล้ว",
      logIdentity: "ตรวจตัวตนเสร็จสิ้น / Identity scan completed.",
      logMemberstack: "ยืนยัน Memberstack session แล้ว",
      logTier: "เปิดชั้นตรวจ Standard / Premium แล้ว",
      logClaim: "ตรวจพบชั้น optional claim: VIP / Black Card",
      logDecrypt: "ถอดรหัส SIGIL access แล้ว",
      logAuthorized: "ยืนยัน authorization แล้ว และเปิด restricted visibility",
      logAnalysis: "Kenji Engine วิเคราะห์สิทธิ์เรียบร้อยแล้ว",
      logSession: "เริ่ม protocol เตรียม private session",
      logPayment: "ส่งคิวตรวจ payment readiness แล้ว",
      logRoute: "ลงทะเบียนคำขอ controlled route แล้ว"
    }
  };

  function qs(selector) {
    return root.querySelector(selector);
  }

  function qsa(selector) {
    return Array.from(root.querySelectorAll(selector));
  }

  function getDict() {
    return copy[state.lang] || copy.en;
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function genderGuard() {
    if (!CONFIG.enforceMaleWhenProvided) return;

    const raw =
      getQueryParam("gender") ||
      getQueryParam("sex") ||
      getQueryParam("source_gender") ||
      "";

    if (!raw) return;

    const normalized = raw.trim().toLowerCase();
    const allowed = ["m", "male", "man", "men", "ชาย", "ผู้ชาย"];

    if (!allowed.includes(normalized)) {
      window.location.href = CONFIG.aftercareUrl;
    }
  }

  function normalizeVisibleTier(tier) {
    const raw = String(tier || "Premium").trim().toLowerCase();
    if (["standard", "premium"].includes(raw)) return capitalize(raw);
    return "Premium";
  }

  function normalizeClaimTier(tier) {
    const raw = String(tier || "").trim().toLowerCase().replace(/\s+/g, "");
    if (["vip"].includes(raw)) return "VIP";
    if (["blackcard", "black-card", "black_card"].includes(raw)) return "Black Card";
    return "None";
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function applyLanguage() {
    const dict = getDict();

    qsa("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (dict[key]) node.textContent = dict[key];
    });

    setKenji(dict.kenjiDefault, false);
    localStorage.setItem("mmd_sigil_lang", state.lang);
  }

  function hydrateFromStorage() {
    try {
      const saved = JSON.parse(localStorage.getItem("mmd_sigil_access_state") || "{}");
      state.member = Object.assign(state.member, saved.member || {});
      if (typeof saved.progress === "number") state.progress = saved.progress;
    } catch (error) {
      console.warn("[SIGIL] Could not parse access state", error);
    }

    state.member.verifiedTier = normalizeVisibleTier(state.member.verifiedTier);
    state.member.requestedTier = normalizeClaimTier(state.member.requestedTier);

    const accessLevel = qs("[data-access-level]");
    const verifiedTier = qs("[data-verified-tier]");
    const claimTier = qs("[data-claim-tier]");
    const sessionCount = qs("[data-session-count]");
    const paymentStatus = qs("[data-payment-status]");

    if (accessLevel) accessLevel.textContent = state.member.accessLevel;
    if (verifiedTier) verifiedTier.textContent = state.member.verifiedTier;
    if (claimTier) claimTier.textContent = state.member.requestedTier;
    if (sessionCount) sessionCount.textContent = state.member.sessionCount;
    if (paymentStatus) paymentStatus.textContent = state.member.paymentActivity;

    setProgress(state.progress);
  }

  function setProgress(value) {
    state.progress = Math.max(0, Math.min(100, Number(value) || 0));

    const bar = qs("[data-progress-bar]");
    const text = qs("[data-progress-text]");

    if (bar) bar.style.width = state.progress + "%";
    if (text) text.textContent = state.progress + "%";
  }

  function setKenji(html, animate) {
    const node = qs("[data-kenji-note]");
    if (!node) return;

    if (animate !== false) {
      node.animate(
        [
          { opacity: 0.3, transform: "translateY(4px)" },
          { opacity: 1, transform: "translateY(0)" }
        ],
        { duration: 260, easing: "ease-out" }
      );
    }

    node.innerHTML = html;
  }

  function nowStamp() {
    const date = new Date();
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function addLog(message) {
    const log = qs("[data-log]");
    if (!log) return;

    const p = document.createElement("p");
    const time = document.createElement("time");

    time.textContent = nowStamp();
    p.appendChild(time);
    p.appendChild(document.createTextNode(message));

    log.prepend(p);

    while (log.children.length > 8) {
      log.removeChild(log.lastElementChild);
    }
  }

  function runBootLogs() {
    const dict = getDict();
    const logs = [
      dict.logBoot,
      dict.logIdentity,
      dict.logMemberstack,
      dict.logTier,
      dict.logClaim,
      dict.logDecrypt,
      dict.logAuthorized
    ];

    logs.forEach((line, index) => {
      window.setTimeout(() => addLog(line), 260 + index * 420);
    });
  }

  function handleEvent(type) {
    const dict = getDict();

    const eventMap = {
      analysis: {
        progress: 84,
        note: dict.kenjiAnalysis,
        log: dict.logAnalysis
      },
      session: {
        progress: 88,
        note: dict.kenjiSession,
        log: dict.logSession,
        url: CONFIG.bookingUrl
      },
      payment: {
        progress: 91,
        note: dict.kenjiPayment,
        log: dict.logPayment,
        url: CONFIG.payUrl
      },
      route: {
        progress: 94,
        note: dict.kenjiRoute,
        log: dict.logRoute,
        url: CONFIG.startUrl
      }
    };

    const event = eventMap[type] || eventMap.analysis;
    setProgress(event.progress);
    setKenji(event.note);
    addLog(event.log);

    const btn = root.querySelector(`[data-event="${type}"]`);
    if (btn) {
      btn.animate(
        [
          { filter: "brightness(1)", transform: "translateY(0)" },
          { filter: "brightness(1.45)", transform: "translateY(-2px)" },
          { filter: "brightness(1)", transform: "translateY(0)" }
        ],
        { duration: 420, easing: "ease-out" }
      );
    }
  }

  function bindEvents() {
    qsa("[data-event]").forEach((button) => {
      button.addEventListener("click", () => {
        handleEvent(button.getAttribute("data-event"));
      });
    });

    const langBtn = qs("[data-sigil-lang]");
    if (langBtn) {
      langBtn.addEventListener("click", () => {
        state.lang = state.lang === "th" ? "en" : "th";
        applyLanguage();
        addLog(state.lang === "th" ? "Language layer switched: TH / เปลี่ยนเป็นภาษาไทย." : "Language layer switched: EN.");
      });
    }

    const clearLog = qs("[data-clear-log]");
    if (clearLog) {
      clearLog.addEventListener("click", () => {
        const log = qs("[data-log]");
        if (log) log.innerHTML = "";
        addLog("Protocol log refreshed.");
      });
    }
  }

  function boot() {
    genderGuard();

    root.classList.add("is-booting");
    applyLanguage();
    hydrateFromStorage();
    bindEvents();
    runBootLogs();

    window.setTimeout(() => {
      root.classList.remove("is-booting");
    }, 1400);
  }

  boot();
})();
