/* MMD SIGIL Model Confirmation v15 i18n
 * Route: /sigil/confirm/job-model
 * Locale contract: ?lang=th|en|zh -> safe localStorage.mmd_sigil_lang -> th
 * Keeps confirmation authority on sigil.mmdbkk.com and never exposes partner pricing.
 * Storage access is guarded because LINE/iOS in-app browsers may throw on localStorage.
 */
(() => {
  "use strict";

  const root = document.getElementById("mmd-model-confirm-v15");
  if (!root || root.dataset.i18nReady) return;

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
      intro: "เช็กเวลา สถานที่ รายละเอียดงาน และยอดเงินถึงตัวให้เรียบร้อยก่อนออกเดินทาง",
      details: "รายละเอียดงาน",
      client: "ลูกค้า",
      job: "งาน",
      date: "วัน",
      time: "เวลา",
      location: "สถานที่",
      map: "เปิด Google Maps ↗",
      payout: "ยอดเงินถึงตัว",
      payoutKicker: "ยอดถึงตัว",
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
      payoutMissingWarning: "ยังไม่พบเรทถึงตัว Model — ขอให้ MMD ระบุเรทก่อนกดยืนยัน"
    },
    en: {
      loadingPill: "Loading details",
      title: "Confirm this job",
      introKicker: "TONIGHT IN BANGKOK",
      intro: "Check the time, location, job details, and payout before heading out.",
      details: "Job details",
      client: "Client",
      job: "Job",
      date: "Date",
      time: "Time",
      location: "Location",
      map: "Open Google Maps ↗",
      payout: "Your payout",
      payoutKicker: "YOUR PAYOUT",
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
      payoutMissingWarning: "Model payout is not available yet — ask MMD to set the payout before confirming."
    },
    zh: {
      loadingPill: "正在加载详情",
      title: "确认接单",
      introKicker: "今晚 · 曼谷",
      intro: "出发前请确认时间、地点、工作详情和到手金额。",
      details: "工作详情",
      client: "客户",
      job: "工作",
      date: "日期",
      time: "时间",
      location: "地点",
      map: "打开 Google Maps ↗",
      payout: "到手金额",
      payoutKicker: "到手金额",
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
      payoutMissingWarning: "尚未设置 Model 到手金额 — 请先让 MMD 设置金额再确认接单。"
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
  let statusKey = "loadingStatus";
  let pillKey = "loadingPill";

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
    success: $("[data-m-success]")
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
    const text = key ? dict()[key] || key : "";
    if (!el.status) return;
    el.status.textContent = text;
    el.status.classList.toggle("is-error", error);
    el.status.hidden = !text;
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
    staticAttr(".mm15__payout", "data-mmd-i18n-kicker", d.payoutKicker);
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
    staticText(".mm15__payout > span", d.payout);
    if (el.retry) el.retry.textContent = d.retry;
    staticText(".mm15__check > span", d.check);
    if (el.confirm) el.confirm.textContent = confirmed ? d.confirmed : d.confirm;
    staticText(".mm15__success > strong", d.successTitle);
    staticText(".mm15__success > span", d.successText);
    staticText(".mm15__success > a", d.dashboard);
    const payoutWarning = $("[data-m-paywarn]");
    if (payoutWarning) payoutWarning.textContent = d.payoutMissingWarning;
    if (statusKey) setStatus(statusKey, el.status?.classList.contains("is-error"));
    if (pillKey) setPill(pillKey);
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

  function money(value) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0
      ? new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(amount) + " THB"
      : "—";
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

  async function call(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(API + path, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "omit",
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function sync() {
    if (el.confirm) el.confirm.disabled = busy || confirmed || !loaded || !el.check?.checked;
  }

  function render(data, updateState = true) {
    currentDetails = data;
    if (el.client) el.client.textContent = str(data.client_name) || "—";
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
    const payout = Number(data.model_payout_thb);
    if (Number.isFinite(payout) && payout > 0) {
      if (el.payout) el.payout.textContent = money(payout);
      if (el.payoutCard) el.payoutCard.hidden = false;
    } else if (el.payoutCard) {
      el.payoutCard.hidden = true;
    }
    if (updateState) {
      loaded = true;
      if (el.check) el.check.disabled = false;
      if (el.retry) el.retry.hidden = true;
      setPill("readyPill");
      setStatus("");
      sync();
    }
  }

  async function load() {
    busy = true;
    loaded = false;
    if (el.check) el.check.disabled = true;
    if (el.retry) el.retry.hidden = true;
    setPill("loadingPill");
    setStatus("loadingStatus");
    sync();
    if (!token) {
      busy = false;
      setPill("badLinkPill");
      setStatus("badLinkStatus", true);
      sync();
      return;
    }
    try {
      render(await call("/v1/confirm/details", { t: token, expected_role: "model" }));
    } catch (_) {
      setPill("detailErrorPill");
      if (el.retry) el.retry.hidden = false;
      setStatus("detailErrorStatus", true);
    } finally {
      busy = false;
      sync();
    }
  }

  async function confirm() {
    if (el.confirm?.disabled) return;
    busy = true;
    sync();
    setStatus("confirming");
    try {
      await call("/v1/confirm/ack", { t: token, expected_role: "model" });
      confirmed = true;
      if (el.success) el.success.hidden = false;
      if (el.check) el.check.disabled = true;
      if (el.confirm) el.confirm.textContent = dict().confirmed;
      setPill("confirmed");
      setStatus("");
    } catch (_) {
      setStatus("confirmError", true);
    } finally {
      busy = false;
      sync();
    }
  }

  installStyle();
  ensureLangSwitch();
  applyLanguage();
  el.retry?.addEventListener("click", load);
  el.check?.addEventListener("change", sync);
  el.confirm?.addEventListener("click", confirm);
  load();
})();