/* Source mirror for /sigil/model/login canonical LINE entry.
 * Webflow renders [data-model-login] dynamically. When there is no established
 * model session, Verify must enter the Published LINE Mini App directly instead
 * of navigating to a Webflow dashboard URL that then constructs an OAuth
 * redirect_uri from location.href.
 */
(() => {
  "use strict";
  if (location.pathname.replace(/\/+$/, "") !== "/sigil/model/login") return;

  const MODEL_LIFF_URL = "https://miniapp.line.me/2010864854-N34SgCqq";
  const PROFILE_URL = "/v1/model/profile";
  const TELEGRAM_BIND_URL = "/v1/model/telegram/bind";

  function language() {
    const raw = String(new URL(location.href).searchParams.get("lang") || document.documentElement.lang || "th").toLowerCase();
    if (raw === "en" || raw.startsWith("en-")) return "en";
    if (raw === "zh" || raw.startsWith("zh-")) return "zh";
    return "th";
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

  function renderTelegram(card, payload) {
    const model = telegramModel(payload);
    const title = card.querySelector("[data-tg-title]");
    const copy = card.querySelector("[data-tg-copy]");
    const connect = card.querySelector("[data-tg-connect]");
    const refresh = card.querySelector("[data-tg-refresh]");
    const connected = model.telegram_connected === true ||
      String(model.telegram_verification_status || "").toLowerCase() === "verified";
    const username = String(model.telegram_username || "").replace(/^@/, "").trim();

    card.classList.toggle("is-connected", connected);
    if (connected) {
      title.textContent = username ? `Telegram Connected · @${username}` : "Telegram Connected";
      copy.textContent = "พร้อมรับลิงก์ยืนยันงานและข้อความสำคัญจาก MMD โดยตรง";
      connect.hidden = true;
      refresh.hidden = true;
      return;
    }
    title.textContent = "เชื่อม Telegram สำหรับแจ้งงาน";
    copy.textContent = "LINE เป็นบัญชีหลัก · Telegram ใช้รับลิงก์ยืนยันงานและข้อความสำคัญ";
    connect.hidden = false;
    refresh.hidden = false;
  }

  async function refreshTelegram(card) {
    if (telegramBusy) return;
    telegramBusy = true;
    const title = card.querySelector("[data-tg-title]");
    const copy = card.querySelector("[data-tg-copy]");
    const connect = card.querySelector("[data-tg-connect]");
    const refresh = card.querySelector("[data-tg-refresh]");
    refresh.disabled = true;
    try {
      const response = await fetch(PROFILE_URL, {
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (response.status === 401 || response.status === 403) {
        title.textContent = "ยืนยัน LINE เพื่อเชื่อม Telegram";
        copy.textContent = "หลังยืนยัน LINE แล้วกลับมาหน้านี้หรือเข้า Model Dashboard เพื่อเชื่อม Telegram";
        connect.hidden = true;
        refresh.hidden = false;
        return;
      }
      if (!response.ok) throw new Error("profile_unavailable");
      renderTelegram(card, await response.json());
    } catch {
      title.textContent = "ตรวจสถานะ Telegram";
      copy.textContent = "กดตรวจสถานะอีกครั้งเพื่ออัปเดตการเชื่อมบัญชี";
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
    const title = card.querySelector("[data-tg-title]");
    const copy = card.querySelector("[data-tg-copy]");
    const connect = card.querySelector("[data-tg-connect]");
    const refresh = card.querySelector("[data-tg-refresh]");
    connect.disabled = true;
    refresh.disabled = true;
    try {
      const response = await fetch(TELEGRAM_BIND_URL, {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (response.status === 401 || response.status === 403) {
        title.textContent = "ยืนยัน LINE ก่อนเชื่อม Telegram";
        copy.textContent = "LINE จะสร้าง Model session ก่อน แล้วจึงเชื่อม Telegram ได้";
        connect.hidden = true;
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) throw new Error("telegram_bind_failed");
      const connectUrl = new URL(String(payload.connect_url || ""));
      if (connectUrl.protocol !== "https:" || connectUrl.hostname !== "t.me") throw new Error("telegram_url_invalid");
      location.assign(connectUrl.toString());
    } catch {
      title.textContent = "เชื่อม Telegram";
      copy.textContent = "กดตรวจสถานะแล้วลองเชื่อมอีกครั้งได้ครับ";
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
    const card = document.createElement("aside");
    card.className = "mmdl-tg-login";
    card.setAttribute("data-model-telegram", "1");
    card.setAttribute("role", "status");
    card.setAttribute("aria-live", "polite");
    card.innerHTML = '<span class="mmdl-tg-login__icon" aria-hidden="true">↗</span><div class="mmdl-tg-login__copy"><small>TELEGRAM · JOB NOTIFICATIONS</small><strong data-tg-title>ยืนยัน LINE เพื่อเชื่อม Telegram</strong><span data-tg-copy>ใช้รับลิงก์ยืนยันงานและข้อความสำคัญจาก MMD โดยตรง</span></div><div class="mmdl-tg-login__actions"><button type="button" data-tg-connect hidden>เชื่อม Telegram</button><button type="button" data-tg-refresh>ตรวจสถานะ</button></div>';
    meta.insertAdjacentElement("afterend", card);
    card.querySelector("[data-tg-connect]")?.addEventListener("click", () => connectTelegram(card));
    card.querySelector("[data-tg-refresh]")?.addEventListener("click", () => refreshTelegram(card));
    setTimeout(() => refreshTelegram(card), 350);
    return card;
  }

  function patch() {
    document.querySelectorAll("[data-model-login]").forEach((link) => {
      const href = String(link.getAttribute("href") || "");
      if (!href.includes("flow=verify")) return;
      link.href = target();
      link.setAttribute("data-mmd-canonical-target", "model-line-miniapp");
    });
    ensureTelegramCard();
  }

  patch();
  new MutationObserver(patch).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("focus", () => {
    const card = document.querySelector("[data-model-telegram]");
    if (card) setTimeout(() => refreshTelegram(card), 250);
  });
})();
