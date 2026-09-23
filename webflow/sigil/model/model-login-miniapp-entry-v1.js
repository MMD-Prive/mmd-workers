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

  function target() {
    const url = new URL(`${MODEL_LIFF_URL}/`);
    url.searchParams.set("lang", language());
    url.searchParams.set("source", "model_login");
    return url.toString();
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
  }

  patch();
  new MutationObserver(patch).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("focus", () => {
    const card = document.querySelector("[data-model-telegram]");
    if (card) setTimeout(() => refreshTelegram(card), 250);
  });

  window.addEventListener("popstate", patch);
})();
