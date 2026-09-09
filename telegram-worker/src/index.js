import { json, safeJson, HttpError } from "../lib/http.js";
import { requireInternalToken } from "../lib/guard.js";
import { sendTelegramMessage, telegramNotify } from "../lib/telegram.js";
import { escapeHtml } from "../lib/util.js";

const LOCK = "telegram-preview-hype-v20260621a-v1-alias";
const PREVIEW_START = "preview";
const DEFAULT_BOT_USERNAME = "mmdprivebot";
const DEFAULT_PUBLIC_BASE_URL = "https://www.mmdbkk.com";
const DEFAULT_PREVIEW_CHANNEL_URL = "https://t.me/MMDPriveTH";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = normalizePath(url.pathname);

    try {
      if (req.method === "GET" && (path === "/" || path === "/health" || path === "/ping")) {
        return json({
          ok: true,
          lock: LOCK,
          worker: "telegram",
          preview_channel_configured: Boolean(clean(env.TELEGRAM_PREVIEW_CHANNEL_ID)),
          preview_bot_username: botUsername(env),
          routes: {
            webhook: ["/telegram/webhook", "/v1/webhook"],
            internal_send: ["/telegram/internal/send", "/v1/internal/send", "/v1/send"],
            complaint_notify: ["/telegram/internal/complaint", "/v1/internal/complaint"],
            preview_post: ["/telegram/preview/post", "/v1/preview/post"],
          },
        }, 200);
      }

      if (isTelegramWebhookPath(path) && req.method === "POST") {
        requireTelegramSecret(req, env);
        const update = await safeJson(req);
        if (!update) return json({ ok: false, error: "invalid_json" }, 400);
        const result = await handleTelegramWebhook(update, env);
        return json({ ok: true, received: true, ...result }, 200);
      }

      if (isInternalSendPath(path) && req.method === "POST") {
        requireInternalToken(req, env, {
          allowServiceSecrets: path === "/telegram/internal/send"
            ? [
                "AUTH_SERVICE_BOOKING_TO_TELEGRAM",
                "AUTH_SERVICE_EVENTS_TO_TELEGRAM",
                "AUTH_SERVICE_STUDIO_TO_TELEGRAM",
                "AUTH_SERVICE_AUTH_TO_TELEGRAM",
                "AUTH_SERVICE_LINE_TO_TELEGRAM",
              ]
            : [],
        });
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400);
        const tg = await telegramNotify(body, env);
        return json({ ok: true, telegram: tg }, 200);
      }

      if (isComplaintInternalPath(path) && req.method === "POST") {
        requireInternalToken(req, env);
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400);
        const result = await postComplaintNotification(body, env);
        const status = result?.telegram?.ok === false ? 502 : 200;
        return json(result, status);
      }

      if (isPreviewPostPath(path) && req.method === "POST") {
        requireInternalToken(req, env);
        const body = (await safeJson(req)) || {};
        const result = await postPreviewChannelCta(body, env);
        const status = result?.telegram?.ok === false ? 502 : 200;
        return json(result, status);
      }

      return json({ ok: false, error: "not_found", path }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json(err.body, err.status);
      return json({ ok: false, error: "server_error", detail: String(err?.message || err) }, 500);
    }
  },
};

async function handleTelegramWebhook(update, env) {
  const message = update.message || update.edited_message || null;
  if (!message) return { handled: false, reason: "unsupported_update" };

  const chatId = clean(message.chat?.id);
  if (!chatId) return { handled: false, reason: "missing_chat_id" };

  const joinCleanup = await cleanupConfiguredGroupJoinMessage(message, env);
  if (joinCleanup) return joinCleanup;

  const text = clean(message.text || "");
  const startArg = parseStartArg(text);
  if (startArg === PREVIEW_START) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: previewVerificationRequiredText(),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: previewButtonMarkup(env),
    }, env);
    return {
      handled: true,
      flow: "preview_start",
      telegram,
      code_status: "verification_required",
    };
  }

  if (text === "/start" || text.toLowerCase().startsWith("/start@")) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: previewWelcomeText(),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: previewButtonMarkup(env),
    }, env);
    return { handled: true, flow: "generic_start", telegram };
  }

  return { handled: false, reason: "no_matching_command" };
}

async function cleanupConfiguredGroupJoinMessage(message, env) {
  if (!Array.isArray(message.new_chat_members) || message.new_chat_members.length === 0) return null;

  const cleanupChats = configuredJoinCleanupChats(env);
  if (cleanupChats.size === 0) {
    return { handled: false, reason: "join_cleanup_not_configured" };
  }

  const chatId = clean(message.chat?.id);
  const surface = cleanupChats.get(chatId);
  if (!surface) {
    return { handled: false, reason: "join_message_outside_cleanup_groups" };
  }

  const messageId = Number(message.message_id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return { handled: false, reason: "missing_join_message_id" };
  }

  const deletion = await deleteTelegramMessage({ chat_id: chatId, message_id: messageId }, env);
  return {
    handled: true,
    flow: "telegram_group_join_cleanup",
    surface,
    deleted: deletion.ok === true,
    telegram: deletion,
  };
}

function configuredJoinCleanupChats(env) {
  const chats = new Map();
  const add = (value, surface) => {
    const chatId = clean(value);
    if (chatId) chats.set(chatId, surface);
  };

  // Keep the legacy Standard Group binding while naming the two current
  // surfaces explicitly. A duplicate ID is harmless and resolves to the
  // more specific surface label below.
  add(env.TELEGRAM_STANDARD_GROUP_ID, "standard_group");
  add(env.TELEGRAM_MMD_CHAT_GROUP_ID, "mmd_chat");
  add(env.TELEGRAM_PREVIEW_GROUP_ID || env.TELEGRAM_PREVIEW_CHANNEL_ID, "telegram_preview");
  return chats;
}

async function deleteTelegramMessage(payload, env) {
  const botToken = clean(env.TELEGRAM_BOT_TOKEN);
  if (!botToken) return { ok: false, skipped: true, reason: "missing_telegram_bot_token" };

  const res = await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: clean(payload.chat_id),
      message_id: Number(payload.message_id),
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.ok === false) {
    return {
      ok: false,
      status: res.status,
      error: data || null,
    };
  }

  return { ok: true, result: data?.result ?? true };
}

async function postComplaintNotification(body, env) {
  const complaint = body.complaint || body;
  const evidence = complaint.evidence || body.evidence || {};
  const evidenceCount = evidence.total_files ?? body.evidence_count ?? 0;
  const storage = evidence.binary_storage || body.evidence_storage || "unknown";
  const statement = complaint.statement || complaint.lane_statement || body.statement || "No statement provided.";

  const text = [
    "🚨 <b>SIGIL Recovery Report</b>",
    "",
    `<b>Case:</b> <code>${escapeHtml(complaint.complaint_id || "-")}</code>`,
    `<b>Lane:</b> ${escapeHtml(complaint.lane || "-")}`,
    `<b>Client:</b> ${escapeHtml(complaint.client_name || "-")}`,
    `<b>Model:</b> ${escapeHtml(complaint.model_name || "-")}`,
    `<b>Session:</b> <code>${escapeHtml(complaint.session_id || "-")}</code>`,
    `<b>Evidence:</b> ${escapeHtml(String(evidenceCount))} file(s)`,
    `<b>Storage:</b> ${escapeHtml(storage)}`,
    `<b>Received:</b> ${escapeHtml(complaint.received_at || body.received_at || new Date().toISOString())}`,
    "",
    `<b>Statement:</b> ${escapeHtml(statement).slice(0, 900)}`,
  ].join("\n");

  const telegram = await telegramNotify({
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  }, env);

  return {
    ok: telegram?.ok === true,
    mode: "complaint_internal_notification",
    complaint_id: complaint.complaint_id || null,
    telegram,
  };
}

async function postPreviewChannelCta(body, env) {
  const chatId = clean(body.chat_id || env.TELEGRAM_PREVIEW_CHANNEL_ID);
  if (!chatId) return { ok: false, error: "missing_telegram_preview_channel_id" };

  const text = clean(body.text) || [
    "MMD Privé Preview เปิดให้เช็กสิทธิ์ 6 YEARS CARE BACK แล้วครับ",
    "",
    "กดตรวจสอบสิทธิ์ด้านล่างเพื่อเข้าสู่การยืนยันตัวตนกับ HYPE",
    "โค้ดส่วนตัวจะแสดงหลังจากระบบตรวจสอบข้อมูลสำเร็จแล้วเท่านั้นครับ",
  ].join("\n");

  if (body.dry_run === true) {
    return {
      ok: true,
      dry_run: true,
      chat_id: chatId,
      text,
      reply_markup: previewButtonMarkup(env),
    };
  }

  const telegram = await sendTelegramMessage({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: previewButtonMarkup(env),
  }, env);

  return {
    ok: telegram.ok === true,
    mode: "preview_channel_cta_post",
    chat_id: chatId,
    telegram,
  };
}

function previewVerificationRequiredText() {
  return [
    "ยินดีต้อนรับสู่ 6 YEARS CARE BACK ครับ",
    "",
    "HYPE จะพาคุณตรวจสอบตัวตนและสิทธิ์ก่อน",
    "โค้ดส่วนตัวจะแสดงหลังจากระบบตรวจสอบข้อมูลสำเร็จแล้วเท่านั้นครับ",
  ].join("\n");
}

function previewWelcomeText() {
  return [
    "ยินดีต้อนรับสู่ MMD Privé Preview ครับ",
    "",
    "ช่องนี้ใช้สำหรับเริ่มตรวจสอบสิทธิ์ 6 YEARS CARE BACK",
    "กดตรวจสอบสิทธิ์ด้านล่างเพื่อยืนยันตัวตนกับ HYPE ได้เลยครับ",
    "",
    "โค้ดเป็นสิทธิ์ส่วนตัว ใช้ได้ 1 ครั้ง และจะแสดงหลังจากระบบตรวจสอบข้อมูลสำเร็จแล้วเท่านั้นครับ",
  ].join("\n");
}

function previewButtonMarkup(env) {
  return {
    inline_keyboard: [
      [{
        text: "🎁 เช็กสิทธิ์ 6 YEARS CARE BACK",
        url: publicUrl(env, "/promotion/6-years-care-back"),
      }],
      [{
        text: "My Code / Status",
        url: publicUrl(env, "/member/dashboard"),
      }],
      [{
        text: "Preview Models",
        url: publicUrl(env, "/profiles"),
      }, {
        text: "Apply / Renew Membership",
        url: publicUrl(env, "/pay/membership"),
      }],
      [{
        text: "Help / How It Works",
        url: publicUrl(env, "/promotion/6-years-care-back#how-it-works"),
      }],
      [{
        text: "Back to Preview Channel",
        url: previewChannelUrl(env),
      }],
    ],
  };
}

function publicUrl(env, path) {
  const base = clean(env.MMD_PUBLIC_BASE_URL || env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, "");
  const normalizedPath = `/${clean(path).replace(/^\/+/, "")}`;
  return `${base}${normalizedPath}`;
}

function previewChannelUrl(env) {
  return clean(env.TELEGRAM_PREVIEW_CHANNEL_URL || env.PREVIEW_CHANNEL_URL) || DEFAULT_PREVIEW_CHANNEL_URL;
}

function parseStartArg(text) {
  const match = clean(text).match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  return clean(match?.[1]).toLowerCase();
}

function requireTelegramSecret(req, env) {
  const expected = clean(env.TELEGRAM_WEBHOOK_SECRET_TOKEN);
  if (!expected) return;
  const actual = clean(req.headers.get("X-Telegram-Bot-Api-Secret-Token"));
  if (!actual || !timingSafeEqual(actual, expected)) {
    throw new HttpError(401, { ok: false, error: "unauthorized" });
  }
}

function timingSafeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let index = 0; index < max; index++) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return diff === 0;
}

function isTelegramWebhookPath(path) {
  return path === "/telegram/webhook" || path === "/v1/webhook";
}

function isInternalSendPath(path) {
  return path === "/telegram/internal/send" || path === "/v1/internal/send" || path === "/v1/send";
}

function isComplaintInternalPath(path) {
  return path === "/telegram/internal/complaint" || path === "/v1/internal/complaint";
}

function isPreviewPostPath(path) {
  return path === "/telegram/preview/post" || path === "/v1/preview/post";
}

function normalizePath(path = "") {
  const p = String(path || "/").replace(/\/{2,}/g, "/");
  return p.length > 1 ? p.replace(/\/$/, "") : p;
}

function botUsername(env) {
  return clean(env.TELEGRAM_BOT_USERNAME) || DEFAULT_BOT_USERNAME;
}

function clean(value) {
  return String(value ?? "").trim();
}