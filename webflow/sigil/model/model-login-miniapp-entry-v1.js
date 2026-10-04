/* Source mirror for /sigil/model/login canonical LINE entry.
 * Webflow renders [data-model-login] dynamically. When there is no established
 * model session, Verify must enter the Published LINE Mini App directly instead
 * of navigating to a Webflow dashboard URL that then constructs an OAuth
 * redirect_uri from location.href.
 *
 * i18n canon:
 * - TH / EN / ZH use one centralized copy map.
 * - Language source order: ?lang= -> <html lang> -> th.
 * - Browser never changes auth/session/Telegram authority based on language.
 */
(() => {
  "use strict";
  if (location.pathname.replace(/\/+$/, "") !== "/sigil/model/login") return;

  const MODEL_LIFF_URL = "https://miniapp.line.me/2010864854-N34SgCqq";
  const JOB_BOARD_URL = "https://sigil.mmdbkk.com/public/api/jobs";
  const PROFILE_URL = "/v1/model/profile";
  const TELEGRAM_BIND_URL = "/v1/model/telegram/bind";

  const COPY = Object.freeze({
    th: Object.freeze({
      telegramKicker: "TELEGRAM · แจ้งเตือนงาน",
      connectedTitle: "เชื่อม Telegram แล้ว",
      connectedCopy: "พร้อมรับลิงก์ยืนยันงานและข้อความสำคัญจาก MMD โดยตรง",
      connectTitle: "เชื่อม Telegram สำหรับแจ้งงาน",
      connectCopy: "LINE เป็นบัญชีหลัก · Telegram ใช้รับลิงก์ยืนยันงานและข้อความสำคัญ",
      authRequiredTitle: "ยืนยัน LINE เพื่อเชื่อม Telegram",
      authRequiredCopy: "หลังยืนยัน LINE แล้ว กลับมาหน้านี้หรือเข้า Model Dashboard เพื่อเชื่อม Telegram",
      statusTitle: "ตรวจสถานะ Telegram",
      statusCopy: "กดตรวจสถานะอีกครั้งเพื่ออัปเดตการเชื่อมบัญชี",
      bindAuthTitle: "ยืนยัน LINE ก่อนเชื่อม Telegram",
      bindAuthCopy: "LINE จะสร้าง Model session ก่อน แล้วจึงเชื่อม Telegram ได้",
      bindErrorTitle: "เชื่อม Telegram",
      bindErrorCopy: "กดตรวจสถานะแล้วลองเชื่อมอีกครั้งได้ครับ",
      connectButton: "เชื่อม Telegram",
      refreshButton: "ตรวจสถานะ",
      cardLabel: "การเชื่อม Telegram สำหรับรับแจ้งงาน",
    }),
    en: Object.freeze({
      telegramKicker: "TELEGRAM · JOB NOTIFICATIONS",
      connectedTitle: "Telegram connected",
      connectedCopy: "Ready to receive job confirmation links and important messages directly from MMD.",
      connectTitle: "Connect Telegram for job notifications",
      connectCopy: "LINE is your primary account · Telegram receives job confirmation links and important messages.",
      authRequiredTitle: "Verify LINE to connect Telegram",
      authRequiredCopy: "After verifying LINE, return to this page or open Model Dashboard to connect Telegram.",
      statusTitle: "Check Telegram status",
      statusCopy: "Refresh the status to update your account connection.",
      bindAuthTitle: "Verify LINE before connecting Telegram",
      bindAuthCopy: "LINE creates your Model session first, then Telegram can be connected.",
      bindErrorTitle: "Connect Telegram",
      bindErrorCopy: "Refresh the status, then try connecting again.",
      connectButton: "Connect Telegram",
      refreshButton: "Refresh status",
      cardLabel: "Telegram connection for job notifications",
    }),
    zh: Object.freeze({
      telegramKicker: "TELEGRAM · 工作通知",
      connectedTitle: "Telegram 已连接",
      connectedCopy: "可直接接收 MMD 的工作确认链接和重要消息。",
      connectTitle: "连接 Telegram 接收工作通知",
      connectCopy: "LINE 是主要账户 · Telegram 用于接收工作确认链接和重要消息。",
      authRequiredTitle: "验证 LINE 后连接 Telegram",
      authRequiredCopy: "完成 LINE 验证后，请返回此页面或打开 Model Dashboard 连接 Telegram。",
      statusTitle: "检查 Telegram 状态",
      statusCopy: "再次检查状态以更新账户连接信息。",
      bindAuthTitle: "请先验证 LINE",
      bindAuthCopy: "LINE 会先建立 Model session，之后才能连接 Telegram。",
      bindErrorTitle: "连接 Telegram",
      bindErrorCopy: "请先刷新状态，然后再次尝试连接。",
      connectButton: "连接 Telegram",
      refreshButton: "检查状态",
      cardLabel: "用于接收工作通知的 Telegram 连接",
    }),
  });

  function language() {
    const raw = String(
      new URL(location.href).searchParams.get("lang") ||
      document.documentElement.lang ||
      "th"
    ).trim().toLowerCase();

    if (raw === "en" || raw.startsWith("en-")) return "en";
    if (
      raw === "zh" ||
      raw.startsWith("zh-") ||
      raw === "cn" ||
      raw.startsWith("cn-")
    ) return "zh";
    return "th";
  }

  function copy() {
    return COPY[language()] || COPY.th;
  }

  function safeJobId(value) {
    const text = String(value || "").trim();
    return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(text) ? text : "";
  }

  function safeJobBoardNext(value, jobId) {
    const fallback = jobId ? JOB_BOARD_URL + "/" + encodeURIComponent(jobId) : JOB_BOARD_URL;
    const raw = String(value || "").trim();
    if (!raw) return fallback;
    try {
      const next = new URL(raw);
      const path = next.pathname.replace(/\/+$/, "") || "/";
      const allowed = next.protocol === "https:" &&
        next.origin === "https://sigil.mmdbkk.com" &&
        (path === "/public/api/jobs" || /^\/public\/api\/jobs\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(path)) &&
        !next.username && !next.password && !next.hash;
      if (!allowed) return fallback;
      next.search = "";
      return next.toString();
    } catch {
      return fallback;
    }
  }

  function jobBoardContext() {
    const sourceUrl = new URL(location.href);
    if (sourceUrl.searchParams.get("intent") !== "job_board") return null;
    const jobId = safeJobId(sourceUrl.searchParams.get("job_id"));
    const source = String(sourceUrl.searchParams.get("source") || "line_model_group").trim();
    const campaignId = String(sourceUrl.searchParams.get("campaign_id") || "").trim();
    const modelAlias = String(sourceUrl.searchParams.get("model_alias") || "").trim().slice(0, 160);
    const modelRecordId = String(sourceUrl.searchParams.get("model_record_id") || "").trim();
    return {
      intent: "job_board",
      return_to: "public_job_board",
      source: /^[A-Za-z0-9._:-]{1,80}$/.test(source) ? source : "line_model_group",
      job_id: jobId,
      next: safeJobBoardNext(sourceUrl.searchParams.get("next"), jobId),
      campaign_id: /^[A-Za-z0-9._:-]{1,128}$/.test(campaignId) ? campaignId : "",
      model_alias: modelAlias,
      model_record_id: /^[A-Za-z0-9._:-]{1,120}$/.test(modelRecordId) ? modelRecordId : "",
    };
  }

  function target() {
    const url = new URL(`${MODEL_LIFF_URL}/`);
    url.searchParams.set("lang", language());
    const context = jobBoardContext();
    if (!context) {
      url.searchParams.set("source", "model_login");
      return url.toString();
    }
    url.searchParams.set("intent", context.intent);
    url.searchParams.set("source", context.source);
    url.searchParams.set("return_to", context.return_to);
    url.searchParams.set("next", context.next);
    if (context.job_id) url.searchParams.set("job_id", context.job_id);
    if (context.campaign_id) url.searchParams.set("campaign_id", context.campaign_id);
    if (context.model_alias) url.searchParams.set("model_alias", context.model_alias);
    if (context.model_record_id) url.searchParams.set("model_record_id", context.model_record_id);
    return url.toString();
  }

  // Job Board links already express the user's intent. Do not show the generic
  // Model Welcome/Telegram login presentation again; preserve the exact job
  // context and continue straight into the Published LINE Mini App.
  if (jobBoardContext()) {
    location.replace(target());
    return;
  }

  let telegramBusy = false;

  function ensureTelegramStyles() {
    if (document.getElementById("mmd-model-login-telegram-style")) return;
    const style = document.createElement("style");
    style.id = "mmd-model-login-telegram-style";
    style.textContent = [
      ".mmdl-tg-login{margin-top:12px;max-width:520px;padding:12px 13px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px 11px;align-items:center;border:1px solid rgba(126,176,235,.24);border-radius:14px;background:rgba(54,104,160,.08)}",
      ".mmdl-tg-login__icon{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(157,203,255,.32);color:#a7cef8}",
      ".mmdl-tg-login__copy{min-width:0;display:grid;gap:2px}.mmdl-tg-login__copy small{color:#9dcbff;font-size:8px;font-weight:800;letter-spacing:.13em}.mmdl-tg-login__copy strong{color:#f4f8ff;font-size:11.5px}.mmdl-tg-login__copy span{color:#a8afba;font-size:9.5px;line-height:1.5}",
      ".mmdl-tg-login__actions{grid-column:2;display:flex;gap:7px;flex-wrap:wrap}.mmdl-tg-login button{appearance:none;min-height:32px;padding:0 11px;border-radius:999px;border:1px solid rgba(157,203,255,.34);background:rgba(157,203,255,.08);color:#ddebff;font:700 10px/1 inherit}.mmdl-tg-login button[data-tg-connect]{background:#dcecff;color:#162333;border-color:#dcecff}",
      ".mmdl-tg-login.is-connected{border-color:rgba(92,205,143,.28);background:rgba(55,122,82,.08)}",
      "@media(min-width:760px){.mmdl-tg-login{grid-template-columns:auto minmax(0,1fr) auto}.mmdl-tg-login__actions{grid-column:3;grid-row:1}}",
    ].join("");
    document.head.appendChild(style);
  }

  function telegramModel(payload) {
    return payload?.model || payload?.profile || payload || {};
  }

  function applyTelegramStaticCopy(card) {
    const t = copy();
    const kicker = card.querySelector("[data-tg-kicker]");
    const connect = card.querySelector("[data-tg-connect]");
    const refresh = card.querySelector("[data-tg-refresh]");
    if (kicker) kicker.textContent = t.telegramKicker;
    if (connect) connect.textContent = t.connectButton;
    if (refresh) refresh.textContent = t.refreshButton;
    card.setAttribute("aria-label", t.cardLabel);
    card.setAttribute("lang", language());
  }

  function renderTelegram(card, payload) {
    const t = copy();
    const model = telegramModel(payload);
    const title = card.querySelector("[data-tg-title]");
    const copyNode = card.querySelector("[data-tg-copy]");
    const connect = card.querySelector("[data-tg-connect]");
    const refresh = card.querySelector("[data-tg-refresh]");
    const connected = model.telegram_connected === true ||
      String(model.telegram_verification_status || "").toLowerCase() === "verified";
    const username = String(model.telegram_username || "").replace(/^@/, "").trim();

    applyTelegramStaticCopy(card);
    card.classList.toggle("is-connected", connected);
    if (connected) {
      title.textContent = username ? `${t.connectedTitle} · @${username}` : t.connectedTitle;
      copyNode.textContent = t.connectedCopy;
      connect.hidden = true;
      refresh.hidden = true;
      return;
    }

    title.textContent = t.connectTitle;
    copyNode.textContent = t.connectCopy;
    connect.hidden = false;
    refresh.hidden = false;
  }

  async function refreshTelegram(card) {
    if (telegramBusy) return;
    telegramBusy = true;
    const t = copy();
    const title = card.querySelector("[data-tg-title]");
    const copyNode = card.querySelector("[data-tg-copy]");
    const connect = card.querySelector("[data-tg-connect]");
    const refresh = card.querySelector("[data-tg-refresh]");
    applyTelegramStaticCopy(card);
    refresh.disabled = true;

    try {
      const response = await fetch(PROFILE_URL, {
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" },
      });

      if (response.status === 401 || response.status === 403) {
        title.textContent = t.authRequiredTitle;
        copyNode.textContent = t.authRequiredCopy;
        connect.hidden = true;
        refresh.hidden = false;
        return;
      }

      if (!response.ok) throw new Error("profile_unavailable");
      renderTelegram(card, await response.json());
    } catch {
      title.textContent = t.statusTitle;
      copyNode.textContent = t.statusCopy;
      connect.hidden = true;
      refresh.hidden = false;
    } finally {
      telegramBusy = false;
      refresh.disabled = false;
    }
  }

  async function connectTelegram(card) {
    if (telegramBusy) return;
    telegramBusy = true;
    const t = copy();
    const title = card.querySelector("[data-tg-title]");
    const copyNode = card.querySelector("[data-tg-copy]");
    const connect = card.querySelector("[data-tg-connect]");
    const refresh = card.querySelector("[data-tg-refresh]");
    applyTelegramStaticCopy(card);
    connect.disabled = true;
    refresh.disabled = true;

    try {
      const response = await fetch(TELEGRAM_BIND_URL, {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json" },
      });

      if (response.status === 401 || response.status === 403) {
        title.textContent = t.bindAuthTitle;
        copyNode.textContent = t.bindAuthCopy;
        connect.hidden = true;
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) throw new Error("telegram_bind_failed");
      const connectUrl = new URL(String(payload.connect_url || ""));
      if (connectUrl.protocol !== "https:" || connectUrl.hostname !== "t.me") {
        throw new Error("telegram_url_invalid");
      }
      location.assign(connectUrl.toString());
    } catch {
      title.textContent = t.bindErrorTitle;
      copyNode.textContent = t.bindErrorCopy;
      connect.hidden = false;
    } finally {
      telegramBusy = false;
      connect.disabled = false;
      refresh.disabled = false;
    }
  }

  function ensureTelegramCard() {
    const meta = document.querySelector(".mmdl-meta");
    if (!meta || document.querySelector("[data-model-telegram]")) return null;

    ensureTelegramStyles();
    const t = copy();
    const card = document.createElement("aside");
    card.className = "mmdl-tg-login";
    card.setAttribute("data-model-telegram", "1");
    card.setAttribute("role", "status");
    card.setAttribute("aria-live", "polite");
    card.setAttribute("aria-label", t.cardLabel);
    card.setAttribute("lang", language());
    card.innerHTML = '<span class="mmdl-tg-login__icon" aria-hidden="true">↗</span><div class="mmdl-tg-login__copy"><small data-tg-kicker></small><strong data-tg-title></strong><span data-tg-copy></span></div><div class="mmdl-tg-login__actions"><button type="button" data-tg-connect hidden></button><button type="button" data-tg-refresh></button></div>';

    meta.insertAdjacentElement("afterend", card);
    applyTelegramStaticCopy(card);
    card.querySelector("[data-tg-title]").textContent = t.authRequiredTitle;
    card.querySelector("[data-tg-copy]").textContent = t.connectedCopy;
    card.querySelector("[data-tg-connect]")?.addEventListener("click", () => connectTelegram(card));
    card.querySelector("[data-tg-refresh]")?.addEventListener("click", () => refreshTelegram(card));
    setTimeout(() => refreshTelegram(card), 350);
    return card;
  }

  function isMobileWelcome() {
    return Boolean(window.matchMedia && window.matchMedia("(max-width: 759px)").matches);
  }

  function ensureMobileWelcomeStyles() {
    if (document.getElementById("mmd-model-welcome-mobile-v2-style")) return;
    const style = document.createElement("style");
    style.id = "mmd-model-welcome-mobile-v2-style";
    style.textContent = [
      "@media(max-width:759px){",
      "html:has(#mmd-model-welcome-mobile-v2),body:has(#mmd-model-welcome-mobile-v2){margin:0!important;width:100%!important;min-height:100%!important;background:#080807!important;overflow:hidden!important}",
      "#mmd-model-welcome-mobile-v2{position:fixed;inset:0;z-index:2147483000;min-height:100dvh;padding:max(18px,env(safe-area-inset-top)) 18px max(18px,env(safe-area-inset-bottom));display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:radial-gradient(circle at 80% 0%,rgba(155,35,54,.16),transparent 34%),radial-gradient(circle at 10% 90%,rgba(216,178,106,.10),transparent 36%),#080807;color:#f7f1e7;font-family:'LINE Seed Sans TH','Noto Sans Thai',system-ui,sans-serif}",
      "#mmd-model-welcome-mobile-v2 *{box-sizing:border-box}",
      "#mmd-model-welcome-mobile-v2 .mwv2-top{display:flex;align-items:center;justify-content:space-between;gap:12px}",
      "#mmd-model-welcome-mobile-v2 .mwv2-brand{display:grid;gap:2px}",
      "#mmd-model-welcome-mobile-v2 .mwv2-brand b{font:700 14px/1 Georgia,serif;letter-spacing:.16em;color:#e3c37a}",
      "#mmd-model-welcome-mobile-v2 .mwv2-brand span{font-size:8px;font-weight:800;letter-spacing:.18em;color:#77736b}",
      "#mmd-model-welcome-mobile-v2 .mwv2-chip{min-height:28px;padding:0 9px;display:inline-flex;align-items:center;border:1px solid rgba(227,195,122,.20);border-radius:999px;color:#b9b2a6;background:rgba(255,255,255,.02);font-size:8px;font-weight:850;letter-spacing:.10em}",
      "#mmd-model-welcome-mobile-v2 .mwv2-main{display:flex;flex-direction:column;justify-content:center;padding:26px 0 18px}",
      "#mmd-model-welcome-mobile-v2 .mwv2-kicker{margin:0 0 11px;color:#c52d48;font-size:9px;font-weight:900;letter-spacing:.15em}",
      "#mmd-model-welcome-mobile-v2 h1{max-width:340px;margin:0;color:#f7f1e7;font:500 clamp(39px,12vw,58px)/1.02 'LINE Seed Sans TH','Noto Sans Thai',sans-serif;letter-spacing:-.045em}",
      "#mmd-model-welcome-mobile-v2 p{max-width:340px;margin:16px 0 0;color:#aaa398;font-size:13.5px;line-height:1.65}",
      "#mmd-model-welcome-mobile-v2 .mwv2-meta{margin-top:18px;display:flex;gap:7px;flex-wrap:wrap}",
      "#mmd-model-welcome-mobile-v2 .mwv2-meta span{padding:7px 9px;border:1px solid rgba(255,255,255,.08);border-radius:999px;color:#77736b;background:rgba(255,255,255,.018);font-size:9px;font-weight:750}",
      "#mmd-model-welcome-mobile-v2 .mwv2-action{width:100%;min-height:54px;border:0;border-radius:14px;background:#8f2135;color:#fff8ed;font-size:13px;font-weight:900;letter-spacing:.02em;box-shadow:0 16px 38px rgba(143,33,53,.22)}",
      "#mmd-model-welcome-mobile-v2 .mwv2-note{margin:8px auto 0;color:#5e5a54;font-size:9px;line-height:1.4;text-align:center}",
      "}",
    ].join("");
    document.head.appendChild(style);
  }

  function ensureMobileWelcome() {
    if (!isMobileWelcome() || document.getElementById("mmd-model-welcome-mobile-v2")) return;
    ensureMobileWelcomeStyles();

    const context = jobBoardContext();
    const root = document.createElement("main");
    root.id = "mmd-model-welcome-mobile-v2";
    root.dataset.intent = context ? "job_board" : "model_entry";

    const title = context ? "สนใจงานนี้อยู่ใช่ไหม?" : "เริ่มจากข้อมูลสั้น ๆ ก่อน";
    const body = context
      ? "กรอกข้อมูลสั้น ๆ ในขั้นตอนถัดไป เพื่อดูรายละเอียดและไปต่อได้เลย"
      : "บอกข้อมูลพื้นฐานในขั้นตอนถัดไป แล้ว MMD จะพาคุณไปต่อ";
    const chip = context ? "JOB BOARD" : "MY MODEL";
    const meta = context
      ? "<span>เก็บงานเดิมไว้ให้</span><span>ไปต่อจากจุดเดิม</span>"
      : "<span>ใช้เวลาไม่นาน</span><span>ข้อมูลเท่าที่จำเป็น</span>";

    root.innerHTML =
      '<div class="mwv2-top"><div class="mwv2-brand"><b>MMD PRIVÉ</b><span>MODEL APP</span></div><span class="mwv2-chip">' + chip + '</span></div>' +
      '<div class="mwv2-main"><p class="mwv2-kicker">MY MODEL · WELCOME</p><h1>' + title + '</h1><p>' + body + '</p><div class="mwv2-meta">' + meta + '</div></div>' +
      '<div><button class="mwv2-action" type="button">ไปต่อ</button><p class="mwv2-note">ขั้นตอนถัดไปจะพาคุณไปยังข้อมูลที่เกี่ยวข้อง</p></div>';

    root.querySelector(".mwv2-action").addEventListener("click", () => {
      location.assign(target());
    });

    document.body.prepend(root);
  }

  function patch() {
    document.documentElement.dataset.modelLoginLang = language();

    document.querySelectorAll("[data-model-login]").forEach((link) => {
      const href = String(link.getAttribute("href") || "");
      if (!href.includes("flow=verify")) return;
      link.href = target();
      link.setAttribute("data-mmd-canonical-target", "model-line-miniapp");
      link.setAttribute("hreflang", language());
    });

    const card = ensureTelegramCard() || document.querySelector("[data-model-telegram]");
    if (card) applyTelegramStaticCopy(card);
    ensureMobileWelcome();
  }

  patch();
  new MutationObserver(patch).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("focus", () => {
    const card = document.querySelector("[data-model-telegram]");
    if (card) setTimeout(() => refreshTelegram(card), 250);
  });

  window.addEventListener("popstate", patch);
})();
