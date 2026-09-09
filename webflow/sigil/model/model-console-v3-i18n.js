/* MMD SIGIL Model Console v3 i18n
 * Route: /sigil/model/console
 * Locale contract: ?lang=th|en|zh -> localStorage.mmd_sigil_lang -> th
 * Operational console only: no model compensation / payout is rendered here.
 */
(() => {
  "use strict";

  const root = document.querySelector("#sigil-model-console-v3[data-smc]");
  if (!root || root.dataset.i18nRuntimeReady === "true") return;
  root.dataset.i18nRuntimeReady = "true";
  root.dataset.ready = "i18n-v1";

  const STORAGE_KEY = "mmd_sigil_lang";
  const params = new URL(window.location.href).searchParams;
  const normalizeLang = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "zh" || raw.startsWith("zh-")) return "zh";
    if (raw === "en" || raw.startsWith("en-")) return "en";
    return "th";
  };
  let lang = normalizeLang(params.get("lang") || localStorage.getItem(STORAGE_KEY) || "th");
  const LOCALES = { th: "th-TH", en: "en-US", zh: "zh-CN" };

  const COPY = Object.freeze({
    th: {
      chipLoading: "กำลังโหลด", chipEmpty: "ยังไม่มีงาน", chipActive: "งานกำลังทำงาน", chipExpired: "Session หมดอายุ", chipOffline: "ยังเชื่อมระบบไม่ได้",
      loadingKicker: "งานล่าสุด", loadingTitle: "กำลังเตรียมข้อมูลงานครับ",
      emptyKicker: "ไม่มีงาน active", emptyTitle: "ตอนนี้ยังไม่มีงานที่ต้องอัปเดตครับ", checkAgain: "ตรวจอีกครั้ง",
      errorKicker: "เปิดงานไม่ได้", errorTitle: "ดึงข้อมูลงานไม่ได้ครับ", errorCopy: "ลองเปิด Console ใหม่จาก HYPE", retry: "ลองใหม่",
      today: "งานวันนี้", dateTime: "วันและเวลา", location: "สถานที่", status: "สถานะ", now: "ตอนนี้",
      openMap: "เปิดแผนที่", help: "ขอความช่วยเหลือ", helper: "Tart: กดสถานะเมื่อเกิดขึ้นจริงก็พอครับ",
      details: "รายละเอียดงาน", jobId: "รหัสงาน", support: "แจ้งทีม",
      placeholder: "เช่น รถติด น่าจะถึงช้าประมาณ 15 นาทีครับ", sendHype: "ส่งผ่าน HYPE", helpShort: "ช่วยเหลือ",
      authTitle: "Session ของพี่หมดอายุแล้วครับ", authCopy: "เปิด Model Console ใหม่จาก HYPE เพื่อยืนยันสิทธิ์อีกครั้งนะครับ",
      loadTitle: "ตอนนี้ยังดึงข้อมูลงานไม่ได้ครับ", loadCopy: "ลองรีเฟรชอีกครั้ง หรือกลับไปเปิดหน้านี้จาก HYPE นะครับ",
      saved: "บันทึกสถานะแล้วครับ", saveError: "ยังบันทึกไม่ได้ครับ ลองใหม่อีกครั้ง หรือแจ้ง HYPE ได้เลย",
      noteFirst: "พิมพ์ข้อความก่อนนะครับ", openingHype: "ผมคัดลอกข้อความไว้ให้แล้ว กำลังเปิด HYPE", urgentDefault: "ต้องการให้ทีมช่วยดูงานนี้ทันที",
      stages: {
        confirmed: ["งานยืนยันแล้วครับ", "เช็กเวลาและสถานที่ให้ครบก่อนเริ่มเดินทางนะครับ", "พร้อมเริ่ม"],
        en_route: ["พี่กำลังเดินทาง", "อัปเดตเมื่อถึงจุดนัดได้เลยครับ", "กำลังเดินทาง"],
        arrived: ["ถึงจุดนัดแล้ว", "เมื่อพบลูกค้าแล้ว ค่อยกดขั้นต่อไปนะครับ", "ถึงแล้ว"],
        met_customer: ["พบลูกค้าแล้ว", "ตรวจรายละเอียดให้เรียบร้อยก่อนเริ่มงานนะครับ", "พบลูกค้าแล้ว"],
        work_started: ["กำลังทำงาน", "ถ้ามีอะไรเปลี่ยนไป แจ้งทีมได้ทันทีครับ", "กำลังทำงาน"],
        work_finished: ["งานเสร็จแล้ว", "หลังแยกกับลูกค้าเรียบร้อยแล้ว กดปิดงานได้ครับ", "รอปิดงาน"],
        separated: ["ปิดงานเรียบร้อย", "ขอบคุณครับพี่ ข้อมูลของงานนี้บันทึกแล้ว", "เสร็จสิ้น"],
        fallback: ["อัปเดตสถานะแล้วครับ", "ผมกำลังจัดข้อมูลให้ตรงกับข้อมูลล่าสุด", "อัปเดตแล้ว"]
      },
      actions: { start_travel: "เริ่มเดินทาง", mark_arrived: "ถึงจุดนัดแล้ว", mark_met_customer: "พบลูกค้าแล้ว", start_work: "เริ่มงาน", mark_work_finished: "งานเสร็จแล้ว", confirm_separated: "แยกเรียบร้อย" }
    },
    en: {
      chipLoading: "Loading", chipEmpty: "No active job", chipActive: "Job active", chipExpired: "Session expired", chipOffline: "Connection unavailable",
      loadingKicker: "Latest job", loadingTitle: "Preparing your job details",
      emptyKicker: "No active job", emptyTitle: "There’s no active job to update right now.", checkAgain: "Check again",
      errorKicker: "Job unavailable", errorTitle: "Couldn’t load this job", errorCopy: "Open Model Console again from HYPE.", retry: "Try again",
      today: "Today’s job", dateTime: "Date & time", location: "Location", status: "Status", now: "Current status",
      openMap: "Open map", help: "Get help", helper: "Tart: Update each status only when it actually happens.",
      details: "Job details", jobId: "Job ID", support: "Message the team",
      placeholder: "e.g. Traffic is heavier than expected. I may be about 15 minutes late.", sendHype: "Send via HYPE", helpShort: "Help",
      authTitle: "Your session has expired.", authCopy: "Open Model Console again from HYPE to verify access.",
      loadTitle: "We can’t load the job right now.", loadCopy: "Refresh once more, or reopen Model Console from HYPE.",
      saved: "Status saved.", saveError: "Couldn’t save the status. Try again or contact HYPE.",
      noteFirst: "Type a message first.", openingHype: "Message copied. Opening HYPE…", urgentDefault: "Please have the team check this job immediately.",
      stages: {
        confirmed: ["Job confirmed", "Check the time and location before you start traveling.", "Ready to start"],
        en_route: ["On the way", "Update when you arrive at the meeting point.", "En route"],
        arrived: ["Arrived", "Update after you meet the client.", "Arrived"],
        met_customer: ["Client met", "Check the details before starting the job.", "Client met"],
        work_started: ["Working", "If anything changes, contact the team immediately.", "In progress"],
        work_finished: ["Job finished", "Close the job after you and the client have separated.", "Ready to close"],
        separated: ["Job closed", "Thank you. This job has been recorded.", "Completed"],
        fallback: ["Status updated", "Syncing with the latest job status.", "Updated"]
      },
      actions: { start_travel: "Start traveling", mark_arrived: "I’ve arrived", mark_met_customer: "Client met", start_work: "Start work", mark_work_finished: "Job finished", confirm_separated: "Close job" }
    },
    zh: {
      chipLoading: "加载中", chipEmpty: "暂无进行中的工作", chipActive: "工作进行中", chipExpired: "Session 已过期", chipOffline: "暂时无法连接",
      loadingKicker: "最新工作", loadingTitle: "正在准备工作详情",
      emptyKicker: "暂无进行中的工作", emptyTitle: "目前没有需要更新的工作。", checkAgain: "再次检查",
      errorKicker: "无法打开工作", errorTitle: "无法加载工作详情", errorCopy: "请从 HYPE 重新打开 Model Console。", retry: "重试",
      today: "今日工作", dateTime: "日期和时间", location: "地点", status: "状态", now: "当前状态",
      openMap: "打开地图", help: "获取帮助", helper: "Tart：请在实际发生后再更新状态。",
      details: "工作详情", jobId: "工作编号", support: "联系团队",
      placeholder: "例如：路况较堵，预计会晚到约 15 分钟。", sendHype: "通过 HYPE 发送", helpShort: "帮助",
      authTitle: "Session 已过期。", authCopy: "请从 HYPE 重新打开 Model Console 以验证权限。",
      loadTitle: "暂时无法加载工作。", loadCopy: "请刷新重试，或从 HYPE 重新打开 Model Console。",
      saved: "状态已保存。", saveError: "暂时无法保存状态，请重试或联系 HYPE。",
      noteFirst: "请先输入消息。", openingHype: "消息已复制，正在打开 HYPE…", urgentDefault: "请团队立即协助查看此工作。",
      stages: {
        confirmed: ["工作已确认", "出发前请再次确认时间和地点。", "可以开始"],
        en_route: ["正在前往", "到达会合地点后请更新状态。", "前往中"],
        arrived: ["已到达", "见到客户后再进入下一步。", "已到达"],
        met_customer: ["已见到客户", "开始工作前请再次检查详情。", "已见客户"],
        work_started: ["工作进行中", "如有任何变化，请立即联系团队。", "进行中"],
        work_finished: ["工作已完成", "与客户分开后即可关闭工作。", "等待关闭"],
        separated: ["工作已关闭", "谢谢，此工作已记录。", "已完成"],
        fallback: ["状态已更新", "正在同步最新工作状态。", "已更新"]
      },
      actions: { start_travel: "开始出发", mark_arrived: "已到达", mark_met_customer: "已见客户", start_work: "开始工作", mark_work_finished: "工作完成", confirm_separated: "关闭工作" }
    }
  });

  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => Array.from(root.querySelectorAll(selector));
  const dict = () => COPY[lang] || COPY.th;
  const locale = () => LOCALES[lang] || LOCALES.th;
  let session = null;
  let busy = false;
  let toastTimer = null;
  let mode = "loading";
  let errorKind = "default";

  const stages = ["confirmed", "en_route", "arrived", "met_customer", "work_started", "separated"];
  const next = {
    confirmed: ["start_travel"],
    en_route: ["mark_arrived"],
    arrived: ["mark_met_customer"],
    met_customer: ["start_work"],
    work_started: ["mark_work_finished"],
    work_finished: ["confirm_separated"]
  };

  function installStyle() {
    if (document.querySelector("style[data-mmd-console-i18n]")) return;
    const style = document.createElement("style");
    style.dataset.mmdConsoleI18n = "1";
    style.textContent = `
      #sigil-model-console-v3 .mmd-lang{display:inline-flex;gap:2px;margin-left:auto;padding:3px;border:1px solid rgba(217,185,105,.22);border-radius:999px;background:rgba(0,0,0,.2)}
      #sigil-model-console-v3 .mmd-lang button{min-width:34px;min-height:28px;border:0;border-radius:999px;padding:0 8px;background:transparent;color:#aaa29a;font:900 10px/1 inherit;cursor:pointer}
      #sigil-model-console-v3 .mmd-lang button[aria-pressed="true"]{background:rgba(217,185,105,.13);color:#fff5b1;-webkit-text-fill-color:#fff5b1}
      html[lang="zh-CN"] #sigil-model-console-v3{font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei","Noto Sans Thai","Inter",sans-serif!important}
      @media(max-width:560px){#sigil-model-console-v3 .smcv3-head{flex-wrap:wrap}#sigil-model-console-v3 .mmd-lang{order:3;margin-left:0}}
    `;
    document.head.appendChild(style);
  }

  function ensureLanguageSwitch() {
    if ($("[data-mmd-lang-switch]")) return;
    const head = $(".smcv3-head");
    if (!head) return;
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
    const chip = $("[data-chip]");
    if (chip) head.insertBefore(switcher, chip);
    else head.appendChild(switcher);
    switcher.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-lang]");
      if (button) setLanguage(button.dataset.lang);
    });
  }

  function ensureDateTimeLabel() {
    const firstFact = $(".smcv3-summary .smcv3-fact");
    if (!firstFact) return null;
    Array.from(firstFact.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && /##INLINE\d+##/.test(node.nodeValue || "")) {
        node.nodeValue = (node.nodeValue || "").replace(/##INLINE\d+##/g, "");
      }
    });
    let label = firstFact.querySelector("[data-i18n-date-time]");
    if (!label) {
      label = document.createElement("span");
      label.className = "smcv3-label";
      label.dataset.i18nDateTime = "1";
      firstFact.insertBefore(label, firstFact.firstChild);
    }
    return label;
  }

  function text(selector, value) {
    const node = $(selector);
    if (node) node.textContent = String(value ?? "");
  }

  function view(name) {
    mode = name;
    $$("[data-view]").forEach((element) => {
      element.hidden = element.dataset.view !== name;
    });
  }

  function note(message) {
    const toast = $("[data-toast]");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-show"), 4200);
  }

  function lock(value) {
    busy = Boolean(value);
    root.setAttribute("aria-busy", busy ? "true" : "false");
    root.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  }

  const value = (object, keys, fallback = "—") => {
    for (const key of keys) {
      if (object?.[key] != null && String(object[key]).trim()) return object[key];
    }
    return fallback;
  };

  function state(object) {
    let raw = String(value(object, ["state", "session_state", "status"], "confirmed")).toLowerCase().replace(/[ -]/g, "_");
    return ({ accepted: "confirmed", ready: "confirmed", travelling: "en_route", traveling: "en_route", started_travel: "en_route", met: "met_customer", working: "work_started", active: "work_started", completed: "work_finished", finished: "work_finished", closed: "separated" })[raw] || raw;
  }

  function formatDate(input) {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? input : new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function setChip(value) {
    text("[data-chip]", value);
  }

  function renderPrimaryActions(currentState) {
    const container = $("[data-primary-actions]");
    if (!container) return;
    container.innerHTML = "";
    (next[currentState] || []).forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.action = action;
      button.className = "smc__button smc__gold";
      button.textContent = dict().actions[action] || action;
      container.appendChild(button);
    });
  }

  function render() {
    if (!session) {
      view("empty");
      setChip(dict().chipEmpty);
      return;
    }
    view("work");
    root.classList.add("is-ready");
    root.classList.remove("is-error");
    setChip(dict().chipActive);
    const currentState = state(session);
    const stage = dict().stages[currentState] || dict().stages.fallback;
    const index = Math.max(0, stages.indexOf(currentState === "work_finished" ? "work_started" : currentState));
    text("[data-stage-title]", stage[0]);
    text("[data-stage-copy]", stage[1]);
    text("[data-stage-pill]", stage[2]);
    const fill = $("[data-progress-fill]");
    if (fill) fill.style.width = `${index / (stages.length - 1) * 100}%`;
    $$("[data-step]").forEach((element, stepIndex) => element.classList.toggle("is-active", stepIndex <= index));
    text("[data-session-id]", value(session, ["session_id", "id", "Session ID"]));
    text("[data-job-type]", value(session, ["job_type", "session_type", "Session Name", "job_name"]));
    const start = value(session, ["start_time", "starts_at", "Start Time"], "");
    text("[data-date-time]", start ? formatDate(start) : value(session, ["job_date", "session_date", "Session Date"]));
    text("[data-location]", value(session, ["location_name", "location", "Location"]));
    const map = value(session, ["google_map_url", "map_url", "Google Map URL"], "");
    const mapRow = $("[data-map-row]");
    const mapLink = $("[data-map-link]");
    if (mapRow) mapRow.hidden = !map;
    if (map && mapLink) mapLink.href = map;
    renderPrimaryActions(currentState);
  }

  function applyStaticCopy() {
    const d = dict();
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
    localStorage.setItem(STORAGE_KEY, lang);
    $$("[data-mmd-lang-switch] button[data-lang]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.lang === lang ? "true" : "false"));
    text('[data-view="loading"] .smcv3-kicker', d.loadingKicker);
    text('[data-view="loading"] .smcv3-h2', d.loadingTitle);
    text('[data-view="empty"] .smcv3-kicker', d.emptyKicker);
    text('[data-view="empty"] .smcv3-h2', d.emptyTitle);
    const emptyRefresh = $('[data-view="empty"] [data-refresh]'); if (emptyRefresh) emptyRefresh.textContent = d.checkAgain;
    text('[data-view="error"] .smcv3-kicker', d.errorKicker);
    const errorRefresh = $('[data-view="error"] [data-refresh]'); if (errorRefresh) errorRefresh.textContent = d.retry;
    text('.smcv3-summary > .smcv3-kicker', d.today);
    const dateLabel = ensureDateTimeLabel(); if (dateLabel) dateLabel.textContent = d.dateTime;
    const factLabels = $$('.smcv3-summary .smcv3-fact .smcv3-label');
    if (factLabels[1]) factLabels[1].textContent = d.location;
    if (factLabels[2]) factLabels[2].textContent = d.status;
    const stage = $('[data-stage-title]')?.closest('.smcv3-state');
    const stageKicker = stage?.querySelector('.smcv3-kicker'); if (stageKicker) stageKicker.textContent = d.now;
    if ($('[data-map-link]')) $('[data-map-link]').textContent = d.openMap;
    const urgent = $$('[data-support="urgent"]'); urgent.forEach((node, index) => { node.textContent = index === 0 ? d.help : d.helpShort; });
    text('.smcv3-helper', d.helper);
    const summaries = $$('details.smcv3-card > summary.smcv3-summary-row');
    if (summaries[0]) summaries[0].textContent = d.details;
    if (summaries[1]) summaries[1].textContent = d.support;
    text('details.smcv3-card .smcv3-dt', d.jobId);
    const textarea = $('[data-note]'); if (textarea) textarea.placeholder = d.placeholder;
    const update = $('[data-support="update"]'); if (update) update.textContent = d.sendHype;
    applyModeCopy();
  }

  function applyModeCopy() {
    const d = dict();
    if (mode === "loading") setChip(d.chipLoading);
    if (mode === "empty") setChip(d.chipEmpty);
    if (mode === "work" && session) render();
    if (mode === "error") {
      root.classList.add("is-error");
      if (errorKind === "auth") {
        setChip(d.chipExpired);
        text("[data-error-title]", d.authTitle);
        text("[data-error-copy]", d.authCopy);
      } else {
        setChip(d.chipOffline);
        text("[data-error-title]", d.loadTitle);
        text("[data-error-copy]", d.loadCopy);
      }
    }
  }

  function setLanguage(next) {
    lang = normalizeLang(next);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", lang);
    window.history.replaceState(null, "", url);
    applyStaticCopy();
  }

  async function json(response) {
    try { return await response.json(); } catch (_) { return {}; }
  }

  async function load() {
    if (busy) return;
    lock(true);
    view("loading");
    setChip(dict().chipLoading);
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      const response = await fetch(root.dataset.currentEndpoint, { credentials: "include", headers: { accept: "application/json" }, cache: "no-store", signal: controller.signal });
      clearTimeout(timeout);
      if (response.status === 401 || response.status === 403) {
        root.classList.add("is-error");
        errorKind = "auth";
        view("error");
        applyModeCopy();
        return;
      }
      if (!response.ok) throw new Error(`load_${response.status}`);
      const payload = await json(response);
      session = payload?.ok === false || payload?.session === null ? null : (payload.session || payload.data?.session || payload.data || payload);
      render();
    } catch (_) {
      root.classList.add("is-error");
      errorKind = "load";
      view("error");
      applyModeCopy();
    } finally {
      lock(false);
    }
  }

  async function act(action) {
    if (busy || !session) return;
    lock(true);
    try {
      const response = await fetch(root.dataset.actionEndpoint, { method: "POST", credentials: "include", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ action, session_id: value(session, ["session_id", "id"], "") }) });
      const payload = await json(response);
      if (!response.ok || payload?.ok === false) throw new Error("action_failed");
      note(dict().saved);
      await load();
    } catch (_) {
      note(dict().saveError);
    } finally {
      lock(false);
    }
  }

  function support(kind) {
    const message = $("[data-note]")?.value.trim() || "";
    const id = value(session, ["session_id", "id"], "—");
    if (kind === "update" && !message) {
      note(dict().noteFirst);
      return;
    }
    const clipboard = kind === "urgent"
      ? `URGENT MODEL SUPPORT\nSession: ${id}\n${message || dict().urgentDefault}`
      : `Model Console Update\nSession: ${id}\n${message}`;
    navigator.clipboard?.writeText(clipboard).catch(() => {});
    note(dict().openingHype);
    window.setTimeout(() => { window.location.href = root.dataset.hypeUrl; }, 450);
  }

  installStyle();
  ensureLanguageSwitch();
  applyStaticCopy();
  root.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    const supportButton = event.target.closest("[data-support]");
    if (action) act(action.dataset.action);
    else if (supportButton) support(supportButton.dataset.support);
    else if (event.target.closest("[data-refresh]")) load();
  });
  load();
})();