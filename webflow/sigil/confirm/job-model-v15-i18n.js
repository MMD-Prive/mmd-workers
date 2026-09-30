/* MMD SIGIL Model Confirmation v15 i18n (v15.1 no-silent-failure)
 * Route: /sigil/confirm/job-model
 * Locale contract: ?lang=th|en|zh -> safe localStorage.mmd_sigil_lang -> th
 * Keeps confirmation authority on sigil.mmdbkk.com and never exposes partner pricing.
 * Storage access is guarded because LINE/iOS in-app browsers may throw on localStorage.
 * v15.1: every state is visible. Errors are mapped to model-safe copy plus an
 * owner-safe reference code (error code + session tail only; never money, never token).
 * v15.1: the model page shows no customer identity and no rate/amount/payment data.
 * The client row always shows a neutral label and the payout card is removed.
 */
(() => {
  "use strict";

  const ROOT_ID = "mmd-model-confirm-v15";
  const MODEL_CONFIRM_PATH = "/sigil/confirm/job-model";

  function renderMissingRoot() {
    const path = (window.location.pathname.replace(/\/+$/, "") || "/");
    if (path !== MODEL_CONFIRM_PATH || !document.body) return;
    if (document.querySelector("[data-mmd-model-confirm-fallback]")) return;
    const box = document.createElement("div");
    box.setAttribute("data-mmd-model-confirm-fallback", "1");
    box.setAttribute("role", "alert");
    box.style.cssText = "margin:24px 16px;padding:18px;border:1px solid rgba(217,185,105,.4);border-radius:16px;background:#11100f;color:#f8f3ea;font:14px/1.6 -apple-system,BlinkMacSystemFont,'Noto Sans Thai',sans-serif";
    const title = document.createElement("strong");
    title.textContent = "ยังเปิดหน้ายืนยันงานไม่ได้ / Can't open this page yet";
    const text = document.createElement("p");
    text.style.margin = "8px 0 0";
    text.textContent = "กรุณาเปิดลิงก์อีกครั้ง หรือส่งรหัสนี้ให้ MMD · Please reopen the link or send this code to MMD: MC-ROOT-missing";
    box.appendChild(title);
    box.appendChild(text);
    document.body.appendChild(box);
    console.warn("[mmd-model-confirm]", { code: "root_missing" });
  }

  function start() {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    renderMissingRoot();
    return;
  }
  if (root.dataset.i18nReady) return;

  const API = "https://sigil.mmdbkk.com";
  const STORAGE_KEY = "mmd_sigil_lang";
  const params = new URL(window.location.href).searchParams;
  const token = params.get("t") || "";

  const storageGet = (key) => {
    try {
      return window.localStorage?.getItem(key) || "";
    } catch (_) {
      return "";
    }
  };

  const storageSet = (key, value) => {
    try {
      window.localStorage?.setItem(key, value);
    } catch (_) {
      // Restricted LINE/iOS storage must never block job-detail loading.
    }
  };

  root.dataset.i18nReady = "1";

  const COPY = Object.freeze({
    th: {
      loadingPill: "กำลังโหลดรายละเอียด",
      title: "ยืนยันรับงาน",
      introKicker: "คืนนี้ในกรุงเทพ",
      intro: "เช็กวัน เวลา สถานที่ และรายละเอียดงานให้เรียบร้อยก่อนออกเดินทาง",
      clientLabel: "ลูกค้า MMD",
      details: "รายละเอียดงาน",
      client: "ลูกค้า",
      job: "งาน",
      date: "วัน",
      time: "เวลา",
      location: "สถานที่",
      map: "เปิด Google Maps ↗",
      readyKicker: "พร้อมสำหรับคืนนี้?",
      loadingStatus: "กำลังโหลดรายละเอียดงาน…",
      retry: "ลองใหม่",
      check: "ผมตรวจสอบรายละเอียดและพร้อมรับงานนี้",
      confirm: "ยืนยันรับงาน",
      successKicker: "✓ พร้อม",
      successTitle: "ยืนยันเรียบร้อยแล้ว",
      successText: "งานนี้อยู่ใน Model Dashboard แล้ว เช็กเวลาและสถานที่อีกครั้งก่อนออกเดินทางครับ",
      dashboard: "ไปที่ Model Dashboard",
      readyPill: "พร้อมยืนยัน",
      badLinkPill: "เปิดลิงก์ไม่ได้",
      badLinkStatus: "ลิงก์นี้ไม่สมบูรณ์ กรุณาขอลิงก์ใหม่จาก MMD",
      detailErrorPill: "เปิดรายละเอียดไม่ได้",
      detailErrorStatus: "ยังเปิดรายละเอียดงานไม่ได้ กรุณาลองใหม่",
      confirming: "กำลังยืนยัน…",
      confirmed: "ยืนยันแล้ว",
      confirmError: "ยังยืนยันไม่ได้ กรุณาลองอีกครั้ง",
      checkFirst: "กรุณาติ๊ก ✓ ว่าตรวจรายละเอียดแล้ว ก่อนกดยืนยันรับงาน",
      alreadyPill: "รับทราบแล้ว",
      alreadyTitle: "รับทราบแล้ว",
      alreadyText: "คุณยืนยันงานนี้ไว้เรียบร้อยแล้ว ไม่ต้องกดซ้ำ เช็กเวลาและสถานที่อีกครั้งก่อนออกเดินทางครับ",
      expiredStatus: "ลิงก์นี้หมดอายุแล้ว กรุณาขอลิงก์ใหม่จาก MMD",
      replacedStatus: "ลิงก์นี้ถูกแทนที่ด้วยลิงก์ใหม่แล้ว กรุณาเปิดลิงก์ล่าสุดที่ MMD ส่งให้",
      sessionMissingStatus: "ไม่พบงานนี้ในระบบ กรุณาแจ้ง MMD พร้อมรหัสอ้างอิงด้านล่าง",
      changePendingStatus: "MMD กำลังอัปเดตรายละเอียดงานนี้ กรุณารอสักครู่แล้วลองใหม่",
      detailsChangedStatus: "รายละเอียดงานเพิ่งถูกอัปเดต กรุณาตรวจรายละเอียดใหม่แล้วกดยืนยันอีกครั้ง",
      networkStatus: "เชื่อมต่อไม่ได้ กรุณาเช็กอินเทอร์เน็ตแล้วลองใหม่",
      timeoutStatus: "ระบบตอบช้ากว่าปกติ กรุณาลองใหม่",
      temporaryStatus: "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง",
      reentryStatus: "กำลังเปิดใน LINE เพื่อยืนยันตัวตน…",
      refLabel: "รหัสอ้างอิงสำหรับแจ้ง MMD"
    },
    en: {
      loadingPill: "Loading details",
      title: "Confirm this job",
      introKicker: "TONIGHT IN BANGKOK",
      intro: "Check the date, time, location, and job details before heading out.",
      clientLabel: "MMD client",
      details: "Job details",
      client: "Client",
      job: "Job",
      date: "Date",
      time: "Time",
      location: "Location",
      map: "Open Google Maps ↗",
      readyKicker: "READY FOR TONIGHT?",
      loadingStatus: "Loading job details…",
      retry: "Try again",
      check: "I have reviewed the details and I’m ready to accept this job.",
      confirm: "Confirm job",
      successKicker: "✓ READY",
      successTitle: "Confirmed",
      successText: "This job is now in Model Dashboard. Check the time and location once more before heading out.",
      dashboard: "Go to Model Dashboard",
      readyPill: "Ready to confirm",
      badLinkPill: "Link unavailable",
      badLinkStatus: "This link is incomplete. Please request a new link from MMD.",
      detailErrorPill: "Details unavailable",
      detailErrorStatus: "We can’t load the job details right now. Please try again.",
      confirming: "Confirming…",
      confirmed: "Confirmed",
      confirmError: "Couldn’t confirm yet. Please try again.",
      checkFirst: "Please tick ✓ to confirm you reviewed the details, then tap Confirm.",
      alreadyPill: "Already confirmed",
      alreadyTitle: "Already confirmed",
      alreadyText: "You already confirmed this job. No need to confirm again — check the time and location before heading out.",
      expiredStatus: "This link has expired. Please request a new link from MMD.",
      replacedStatus: "This link was replaced by a newer one. Please open the latest link from MMD.",
      sessionMissingStatus: "We can’t find this job. Please send MMD the reference code below.",
      changePendingStatus: "MMD is updating this job’s details. Please wait a moment and try again.",
      detailsChangedStatus: "The job details were just updated. Please review them and confirm again.",
      networkStatus: "Can’t connect. Check your internet and try again.",
      timeoutStatus: "The system is slower than usual. Please try again.",
      temporaryStatus: "Temporary system issue. Please try again.",
      reentryStatus: "Opening in LINE to verify it’s you…",
      refLabel: "Reference for MMD"
    },
    zh: {
      loadingPill: "正在加载详情",
      title: "确认接单",
      introKicker: "今晚 · 曼谷",
      intro: "出发前请确认日期、时间、地点和工作详情。",
      clientLabel: "MMD 客户",
      details: "工作详情",
      client: "客户",
      job: "工作",
      date: "日期",
      time: "时间",
      location: "地点",
      map: "打开 Google Maps ↗",
      readyKicker: "今晚准备好了吗？",
      loadingStatus: "正在加载工作详情…",
      retry: "重试",
      check: "我已核对工作详情，并确认可以接单。",
      confirm: "确认接单",
      successKicker: "✓ 已准备",
      successTitle: "已确认",
      successText: "此工作现已显示在 Model Dashboard。出发前请再次确认时间和地点。",
      dashboard: "前往 Model Dashboard",
      readyPill: "可以确认",
      badLinkPill: "链接不可用",
      badLinkStatus: "此链接不完整，请向 MMD 获取新链接。",
      detailErrorPill: "无法打开详情",
      detailErrorStatus: "暂时无法加载工作详情，请重试。",
      confirming: "正在确认…",
      confirmed: "已确认",
      confirmError: "暂时无法确认，请再试一次。",
      checkFirst: "请先勾选 ✓ 确认已核对详情，再点击确认接单。",
      alreadyPill: "已确认",
      alreadyTitle: "已确认",
      alreadyText: "你已确认过此工作，无需再次确认。出发前请再次确认时间和地点。",
      expiredStatus: "此链接已过期，请向 MMD 获取新链接。",
      replacedStatus: "此链接已被新链接取代，请打开 MMD 发送的最新链接。",
      sessionMissingStatus: "找不到此工作，请将下方参考编号发给 MMD。",
      changePendingStatus: "MMD 正在更新此工作详情，请稍候再试。",
      detailsChangedStatus: "工作详情刚刚更新，请重新核对后再次确认。",
      networkStatus: "无法连接，请检查网络后重试。",
      timeoutStatus: "系统响应较慢，请重试。",
      temporaryStatus: "系统暂时异常，请再试一次。",
      reentryStatus: "正在 LINE 中打开以验证身份…",
      refLabel: "MMD 参考编号"
    }
  });

  const localeMap = { th: "th-TH", en: "en-US", zh: "zh-CN" };
  const normalizeLang = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "zh" || raw.startsWith("zh-")) return "zh";
    if (raw === "en" || raw.startsWith("en-")) return "en";
    return "th";
  };

  let lang = normalizeLang(params.get("lang") || storageGet(STORAGE_KEY) || "th");
  let currentDetails = null;
  let loaded = false;
  let busy = false;
  let confirmed = false;
  let alreadyConfirmed = false;
  let revision = "";
  let stage = "load";
  let statusKey = "loadingStatus";
  let statusIsError = false;
  let pillKey = "loadingPill";
  let feedbackKey = "";
  let feedbackIsError = false;
  let diagCode = "";
  const REQUEST_TIMEOUT_MS = 20000;

  const $ = (selector) => root.querySelector(selector);
  const dict = () => COPY[lang] || COPY.th;
  const locale = () => localeMap[lang] || localeMap.th;
  const str = (value) => String(value == null ? "" : value).trim();

  const el = {
    pill: $("[data-m-pill]"),
    status: $("[data-m-status]"),
    retry: $("[data-m-retry]"),
    client: $("[data-m-client]"),
    type: $("[data-m-type]"),
    date: $("[data-m-date]"),
    time: $("[data-m-time]"),
    location: $("[data-m-location]"),
    vipRow: $("[data-m-vip-row]"),
    vip: $("[data-m-vip]"),
    map: $("[data-m-map]"),
    payoutCard: $("[data-m-payout-card]"),
    payout: $("[data-m-payout]"),
    check: $("[data-m-check]"),
    confirm: $("[data-m-confirm]"),
    success: $("[data-m-success]"),
    feedback: null,
    diag: null
  };

  function installStyle() {
    if (document.querySelector("style[data-mmd-model-i18n]")) return;
    const style = document.createElement("style");
    style.dataset.mmdModelI18n = "1";
    style.textContent = `
      #mmd-model-confirm-v15 .mm15__tools{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      #mmd-model-confirm-v15 .mmd-lang{display:inline-flex;gap:2px;padding:3px;border:1px solid rgba(217,185,105,.22);border-radius:999px;background:rgba(0,0,0,.2)}
      #mmd-model-confirm-v15 .mmd-lang button{min-width:34px;min-height:28px;border:0;border-radius:999px;padding:0 8px;background:transparent;color:#aaa29a;font:900 10px/1 inherit;cursor:pointer}
      #mmd-model-confirm-v15 .mmd-lang button[aria-pressed="true"]{background:rgba(217,185,105,.13);color:#fff5b1;-webkit-text-fill-color:#fff5b1}
      #mmd-model-confirm-v15 .mm15__intro::before{content:attr(data-mmd-i18n-kicker)}
      #mmd-model-confirm-v15 .mm15__payout::before{content:attr(data-mmd-i18n-kicker)}
      #mmd-model-confirm-v15 .mm15__confirm::after{content:attr(data-mmd-i18n-kicker)}
      #mmd-model-confirm-v15 .mm15__success::before{content:attr(data-mmd-i18n-kicker)}
      html[lang="zh-CN"] #mmd-model-confirm-v15{font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei","Noto Sans Thai","Inter",sans-serif}
      @media(max-width:560px){#mmd-model-confirm-v15 .mm15__header{align-items:flex-start}#mmd-model-confirm-v15 .mm15__tools{max-width:58%}}
      #mmd-model-confirm-v15 [data-m-confirm][aria-disabled="true"]{opacity:.62}
      #mmd-model-confirm-v15 [data-m-confirm][aria-busy="true"]{opacity:.8;cursor:progress}
      #mmd-model-confirm-v15 .mm15__feedback{margin:10px 0 0;font-size:13px;line-height:1.55;color:#ded7cd}
      #mmd-model-confirm-v15 .mm15__feedback.is-error{color:#ffb4a8}
      #mmd-model-confirm-v15 .mm15__diag{margin:8px 0 0;font-size:11px;line-height:1.45;color:#9f978c;word-break:break-all;user-select:all;-webkit-user-select:all}
      #mmd-model-confirm-v15 .is-attention{outline:2px solid #efd58d;outline-offset:4px;border-radius:10px}
    `;
    document.head.appendChild(style);
  }

  function ensureLangSwitch() {
    if ($("[data-mmd-lang-switch]")) return;
    const tools = document.createElement("div");
    tools.className = "mm15__tools";
    const switcher = document.createElement("div");
    switcher.className = "mmd-lang";
    switcher.dataset.mmdLangSwitch = "1";
    switcher.setAttribute("aria-label", "Language");
    [["th", "TH"], ["en", "EN"], ["zh", "中文"]].forEach(([code, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.lang = code;
      button.textContent = label;
      switcher.appendChild(button);
    });
    const header = $(".mm15__header");
    if (!header) return;
    tools.appendChild(switcher);
    if (el.pill) tools.appendChild(el.pill);
    header.appendChild(tools);
    switcher.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-lang]");
      if (button) setLanguage(button.dataset.lang);
    });
  }

  function staticText(selector, value) {
    const node = $(selector);
    if (node) node.textContent = value;
  }

  function staticAttr(selector, name, value) {
    const node = $(selector);
    if (node) node.setAttribute(name, value);
  }

  function setStatus(key, error = false) {
    statusKey = key || "";
    statusIsError = Boolean(key) && error;
    const text = key ? dict()[key] || key : "";
    if (!el.status) return;
    el.status.textContent = text;
    el.status.classList.toggle("is-error", statusIsError);
    el.status.hidden = !text;
  }

  function setState(state) {
    root.dataset.mmdState = state;
  }

  function anchorAfter(node, fallbackParent) {
    return (created) => {
      if (node?.parentNode) node.parentNode.insertBefore(created, node.nextSibling);
      else (fallbackParent || root).appendChild(created);
      return created;
    };
  }

  // Feedback lives directly under the confirm button so a tap always produces
  // visible text next to the thing the model tapped.
  function feedbackNode() {
    if (el.feedback) return el.feedback;
    const node = document.createElement("p");
    node.className = "mm15__feedback";
    node.setAttribute("data-m-confirm-feedback", "1");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.hidden = true;
    el.feedback = anchorAfter(el.confirm || el.status)(node);
    return el.feedback;
  }

  function setFeedback(key, error = false) {
    feedbackKey = key || "";
    feedbackIsError = Boolean(key) && error;
    const node = feedbackNode();
    const text = key ? dict()[key] || key : "";
    node.textContent = text;
    node.classList.toggle("is-error", feedbackIsError);
    node.hidden = !text;
  }

  function diagNode() {
    if (el.diag) return el.diag;
    const node = document.createElement("p");
    node.className = "mm15__diag";
    node.setAttribute("data-m-diag", "1");
    node.hidden = true;
    el.diag = anchorAfter(el.feedback || el.status || el.confirm)(node);
    return el.diag;
  }

  function renderDiag() {
    const node = diagNode();
    node.textContent = diagCode ? `${dict().refLabel}: ${diagCode}` : "";
    node.hidden = !diagCode;
    if (diagCode) root.dataset.mmdDiag = diagCode;
    else delete root.dataset.mmdDiag;
  }

  function setDiag(code) {
    diagCode = code || "";
    renderDiag();
  }

  function ensureRetry() {
    if (el.retry) return el.retry;
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-m-retry", "1");
    button.className = el.confirm?.className || "";
    button.hidden = true;
    button.textContent = dict().retry;
    el.retry = anchorAfter(el.status || el.confirm)(button);
    return el.retry;
  }

  // Session tail comes from the unverified token payload and is a hint only,
  // so the owner can find the job. Backend verification stays authoritative.
  function sessionTail() {
    try {
      const encoded = token.split(".")[0] || "";
      if (!/^[A-Za-z0-9_-]{1,4096}$/.test(encoded)) return "";
      const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      return str(payload?.session_id).replace(/[^A-Za-z0-9_]/g, "").slice(-6);
    } catch (_) {
      return "";
    }
  }

  function diagFor(error, where) {
    const code = str(error?.code || error?.message || "unknown").replace(/[^a-z0-9_]/gi, "").slice(0, 60) || "unknown";
    const status = Number(error?.status) || 0;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const tail = sessionTail();
    return ["MC", `${where === "confirm" ? "A" : "D"}${status || "000"}`, code, tail || "nosess", hhmm].join("-");
  }

  const REPLACED_CODES = new Set([
    "confirmation_token_not_active",
    "confirmation_token_record_mismatch",
    "confirmation_token_record_invalid",
    "confirmation_session_mismatch"
  ]);
  const BAD_LINK_CODES = new Set([
    "confirmation_role_mismatch",
    "confirmation_token_required",
    "expected_role_required",
    "confirmation_token_not_yet_valid"
  ]);

  function classify(error, where) {
    const code = str(error?.code || error?.message) || "unknown";
    const status = Number(error?.status) || 0;
    if (code === "model_identity_reentry") return { key: "reentryStatus", error: false, retry: false, diag: false };
    if (code === "confirmation_token_expired" || status === 410) return { key: "expiredStatus", error: true, retry: false, diag: true };
    if (REPLACED_CODES.has(code)) return { key: "replacedStatus", error: true, retry: false, diag: true };
    if (/^invalid_confirmation_token/.test(code) || BAD_LINK_CODES.has(code)) return { key: "badLinkStatus", error: true, retry: false, diag: true };
    if (code === "session_not_found" || code === "session_id_ambiguous") return { key: "sessionMissingStatus", error: true, retry: false, diag: true };
    if (code === "confirmation_change_pending") return { key: "changePendingStatus", error: true, retry: true, diag: true };
    if (code === "confirmation_details_changed_reload_required") return { key: "detailsChangedStatus", error: true, retry: true, diag: true, reload: true };
    if (code === "timeout") return { key: "timeoutStatus", error: true, retry: true, diag: true };
    if (code === "network_error") return { key: "networkStatus", error: true, retry: true, diag: true };
    if (status >= 500 || /^airtable_|_unavailable$|_not_ready$/.test(code)) return { key: "temporaryStatus", error: true, retry: true, diag: true };
    return { key: where === "confirm" ? "confirmError" : "detailErrorStatus", error: true, retry: true, diag: true };
  }

  function gateVisible() {
    return Boolean(document.querySelector("[data-mmd-direct-first-job-gate]"));
  }

  function logFailure(error, where) {
    try {
      console.warn("[mmd-model-confirm]", { stage: where, code: str(error?.code || error?.message), status: Number(error?.status) || 0 });
    } catch (_) {}
  }

  function setPill(key) {
    pillKey = key || "";
    if (el.pill) el.pill.textContent = key ? dict()[key] || key : "";
  }

  function applyLanguage() {
    const d = dict();
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
    storageSet(STORAGE_KEY, lang);
    root.querySelectorAll("[data-mmd-lang-switch] button[data-lang]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.lang === lang ? "true" : "false");
    });
    staticAttr(".mm15__intro", "data-mmd-i18n-kicker", d.introKicker);
    staticAttr(".mm15__confirm", "data-mmd-i18n-kicker", d.readyKicker);
    staticAttr(".mm15__success", "data-mmd-i18n-kicker", d.successKicker);
    staticText(".mm15__intro h1", d.title);
    staticText(".mm15__intro p", d.intro);
    staticText(".mm15__card h2", d.details);
    const rows = root.querySelectorAll(".mm15__rows > div > span");
    [d.client, d.job, d.date, d.time, d.location, "VIP"].forEach((value, index) => {
      if (rows[index]) rows[index].textContent = value;
    });
    if (el.map) el.map.textContent = d.map;
    if (el.retry) el.retry.textContent = d.retry;
    staticText(".mm15__check > span", d.check);
    if (el.confirm) el.confirm.textContent = confirmed ? d.confirmed : d.confirm;
    staticText(".mm15__success > strong", alreadyConfirmed ? d.alreadyTitle : d.successTitle);
    staticText(".mm15__success > span", alreadyConfirmed ? d.alreadyText : d.successText);
    staticText(".mm15__success > a", d.dashboard);
    if (statusKey) setStatus(statusKey, statusIsError);
    if (pillKey) setPill(pillKey);
    if (feedbackKey) setFeedback(feedbackKey, feedbackIsError);
    if (diagCode) renderDiag();
    if (currentDetails) render(currentDetails, false);
  }

  function setLanguage(next) {
    lang = normalizeLang(next);

    // Switch the visible UI first. LINE/iOS WebViews may restrict history
    // mutation; that must never prevent TH/EN/ZH from changing in-place.
    applyLanguage();

    const url = new URL(window.location.href);
    url.searchParams.set("lang", lang);
    const relativeUrl = `${url.pathname}${url.search}${url.hash}`;
    try {
      window.history.replaceState(window.history.state, "", relativeUrl);
    } catch (_) {
      // Some LINE/iOS WebViews restrict history mutation. Reloading the same
      // signed URL with only the safe lang query keeps the switch deterministic.
      window.location.replace(relativeUrl);
      return;
    }

    root.dispatchEvent(new CustomEvent("mmd:sigil-language-change", {
      detail: { lang }
    }));
  }

  function formatDate(value) {
    const raw = str(value);
    if (!raw) return "—";
    const date = new Date(raw.length === 10 ? raw + "T00:00:00" : raw);
    return Number.isNaN(date.getTime())
      ? raw
      : date.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
  }

  function formatClock(value) {
    const raw = str(value);
    if (!raw) return "";
    if (/^\d{2}:\d{2}$/.test(raw)) return raw;
    const date = new Date(raw);
    return Number.isNaN(date.getTime())
      ? raw
      : date.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function range(start, end) {
    const a = formatClock(start);
    const b = formatClock(end);
    return a && b ? `${a}–${b}` : a || b || "—";
  }

  const taxonomy = Object.freeze({
    private: "Private", public: "Public", exclusive: "Exclusive", standard: "Standard",
    premium: "Premium", vip: "VIP", straight: "Straight", gay: "Gay", pn: "PN",
    mk: "MK", burn: "Burn", kiss: "Kiss", live: "Live"
  });

  function workType(value) {
    return str(value).split(":").filter(Boolean).map((part) => taxonomy[part.toLowerCase()] || part).join(" · ") || "—";
  }

  function codedError(code, status = 0) {
    const error = new Error(code || "request_failed");
    error.code = code || "request_failed";
    error.status = status;
    return error;
  }

  function transportCode(error) {
    if (error?.code) return error.code;
    if (error?.name === "AbortError") return "timeout";
    const message = str(error?.message);
    // Layers such as the Direct First Job gate reject with a machine code.
    if (!(error instanceof TypeError) && /^[a-z0-9_]{3,80}$/.test(message)) return message;
    return "network_error";
  }

  async function call(path, body) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer = null;
    const request = (async () => {
      let response;
      try {
        response = await fetch(API + path, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          credentials: "omit",
          body: JSON.stringify(body),
          signal: controller?.signal
        });
      } catch (error) {
        throw codedError(transportCode(error), 0);
      }
      let raw = "";
      try { raw = await response.text(); } catch (_) {}
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
      if (!response.ok || data.ok === false) {
        throw codedError(str(data.error || data.message) || `http_${response.status}`, response.status);
      }
      return data;
    })();
    request.catch(() => {});
    // The watchdog races the whole request, so a wrapped fetch that ignores the
    // abort signal can still never leave the model on an endless spinner.
    const watchdog = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { controller?.abort(); } catch (_) {}
        reject(codedError("timeout", 0));
      }, REQUEST_TIMEOUT_MS);
    });
    try {
      return await Promise.race([request, watchdog]);
    } finally {
      clearTimeout(timer);
    }
  }

  function needsCheck() {
    return Boolean(el.check) && !el.check.checked;
  }

  // The checkbox no longer disables the button: a disabled button swallows the
  // tap and gives no feedback, which is exactly the "nothing happened" report.
  function sync() {
    if (!el.confirm) return;
    el.confirm.disabled = busy || confirmed || !loaded;
    const waiting = loaded && !confirmed && !busy && needsCheck();
    el.confirm.setAttribute("aria-disabled", waiting ? "true" : "false");
    el.confirm.classList.toggle("is-waiting", waiting);
    if (!needsCheck() && feedbackKey === "checkFirst") setFeedback("");
    if (!needsCheck()) (el.check?.closest("label") || el.check)?.classList.remove("is-attention");
  }

  function showSuccess() {
    if (el.success) el.success.hidden = false;
    if (el.check) {
      el.check.checked = true;
      el.check.disabled = true;
    }
    if (el.confirm) el.confirm.textContent = dict().confirmed;
    applyLanguage();
  }

  function render(data, updateState = true) {
    currentDetails = data;
    // Customer identity is owner/admin-only: never render a name, even if an
    // older backend still sends one.
    if (el.client) el.client.textContent = dict().clientLabel;
    if (el.type) el.type.textContent = workType(data.job_type);
    if (el.date) el.date.textContent = formatDate(data.job_date);
    if (el.time) el.time.textContent = range(data.start_time, data.end_time);
    if (el.location) el.location.textContent = str(data.location_name) || "—";
    if (data.vip_detail) {
      if (el.vip) el.vip.textContent = str(data.vip_detail);
      if (el.vipRow) el.vipRow.hidden = false;
    } else if (el.vipRow) {
      el.vipRow.hidden = true;
    }
    const mapUrl = str(data.google_map_url);
    if (el.map && /^https:\/\//i.test(mapUrl)) {
      el.map.href = mapUrl;
      el.map.hidden = false;
    } else if (el.map) {
      el.map.hidden = true;
    }
    if (updateState) {
      loaded = true;
      revision = str(data.confirmation_revision).slice(0, 80);
      if (el.retry) el.retry.hidden = true;
      setDiag("");
      setFeedback("");
      if (data.already_confirmed === true || str(data.model_acknowledged_at)) {
        alreadyConfirmed = true;
        confirmed = true;
        setPill("alreadyPill");
        setStatus("");
        setState("already_confirmed");
        showSuccess();
      } else {
        if (el.check) el.check.disabled = false;
        setPill("readyPill");
        if (data.confirmation_change_pending === true) setStatus("changePendingStatus", true);
        else setStatus("");
        setState("ready");
      }
      sync();
    }
  }

  async function load(notice = "") {
    if (busy) return;
    busy = true;
    stage = "load";
    loaded = false;
    if (el.check) el.check.disabled = true;
    if (el.retry) el.retry.hidden = true;
    setPill("loadingPill");
    setStatus("loadingStatus");
    setFeedback("");
    setDiag("");
    setState("loading");
    sync();
    if (!token) {
      busy = false;
      setPill("badLinkPill");
      setStatus("badLinkStatus", true);
      setDiag(diagFor(codedError("confirmation_token_required", 0), "load"));
      setState("bad_link");
      sync();
      return;
    }
    try {
      render(await call("/v1/confirm/details", { t: token, expected_role: "model" }));
      if (notice && !confirmed) setStatus(notice);
    } catch (error) {
      logFailure(error, "load");
      if (gateVisible()) {
        setState("gate");
      } else {
        const result = classify(error, "load");
        setPill(result.key === "reentryStatus" ? "loadingPill" : result.retry ? "detailErrorPill" : "badLinkPill");
        setStatus(result.key, result.error);
        if (result.retry) ensureRetry().hidden = false;
        if (result.diag) setDiag(diagFor(error, "load"));
        setState(result.key === "reentryStatus" ? "reentry" : "load_failed");
      }
    } finally {
      busy = false;
      sync();
    }
  }

  async function confirm(event) {
    if (busy || confirmed || !loaded) return;
    if (needsCheck()) {
      event?.preventDefault?.();
      setFeedback("checkFirst", true);
      (el.check.closest("label") || el.check).classList.add("is-attention");
      try { el.check.focus({ preventScroll: false }); } catch (_) {}
      setState("needs_check");
      return;
    }
    busy = true;
    stage = "confirm";
    setState("confirming");
    setDiag("");
    if (el.confirm) {
      el.confirm.textContent = dict().confirming;
      el.confirm.setAttribute("aria-busy", "true");
    }
    setFeedback("confirming");
    sync();
    let reloadNotice = "";
    try {
      const payload = { t: token, expected_role: "model" };
      if (revision) payload.confirmation_revision = revision;
      await call("/v1/confirm/ack", payload);
      confirmed = true;
      setPill("confirmed");
      setStatus("");
      setFeedback("");
      setState("confirmed");
      showSuccess();
    } catch (error) {
      logFailure(error, "confirm");
      const result = classify(error, "confirm");
      if (el.confirm) el.confirm.textContent = dict().confirm;
      setFeedback(result.key, result.error);
      setStatus(result.key, result.error);
      if (result.diag) setDiag(diagFor(error, "confirm"));
      setState("confirm_failed");
      if (result.reload) reloadNotice = result.key;
    } finally {
      busy = false;
      el.confirm?.removeAttribute("aria-busy");
      sync();
    }
    if (reloadNotice) {
      const keepDiag = diagCode;
      await load(reloadNotice);
      if (!diagCode && keepDiag) setDiag(keepDiag);
    }
  }

  // No rate/amount on the model page: drop the payout card and the payout
  // warning from the DOM so no other layer (e.g. rate-to-you v1) can re-show it.
  function removePayoutSurface() {
    [el.payoutCard, $(".mm15__payout"), $("[data-m-paywarn]")].forEach((node) => {
      try { node?.parentNode?.removeChild(node); } catch (_) {}
    });
    el.payoutCard = null;
    el.payout = null;
  }

  removePayoutSurface();
  installStyle();
  ensureLangSwitch();
  applyLanguage();
  ensureRetry().addEventListener("click", () => load());
  el.check?.addEventListener("change", sync);
  el.confirm?.addEventListener("click", confirm);
  load();
  }

  // The runtime may be pasted in <head>. Wait for the DOM rather than exiting
  // silently when the confirmation root has not been parsed yet.
  if (!document.getElementById(ROOT_ID) && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();