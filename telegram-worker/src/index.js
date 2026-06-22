import { json, safeJson, HttpError } from "../lib/http.js";
import { requireInternalToken } from "../lib/guard.js";
import { telegramNotify } from "../lib/telegram.js";
import { handleHypePreviewApi, handleTelegramWebhook as handleHypePreviewWebhook } from "../lib/hype-preview.js";

function str(value) {
  return String(value ?? "").trim();
}

function allowedOrigins(env) {
  return [
    "https://mmdbkk.com",
    "https://www.mmdbkk.com",
    "https://mmdprive.com",
    "https://www.mmdprive.com",
    "https://mmdprive.webflow.io",
    "https://sigil.mmdbkk.com",
    ...str(env.ALLOWED_ORIGINS).split(",").map((item) => item.trim()).filter(Boolean),
  ];
}

function corsHeaders(req, env) {
  const origin = str(req.headers.get("Origin"));
  const allow = allowedOrigins(env);
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Internal-Token, Authorization",
    "Access-Control-Max-Age": "86400",
  });

  if (origin && (allow.includes(origin) || allow.includes("*"))) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }

  return headers;
}

function withCors(req, env, response) {
  const headers = new Headers(response.headers);
  corsHeaders(req, env).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

function isInternalServiceRequest(req) {
  try {
    const url = new URL(req.url);
    return url.hostname === "telegram-worker.internal";
  } catch {
    return false;
  }
}

async function sendTelegramDebugReply(env, chatId, text, threadId) {
  const token = str(env.TELEGRAM_BOT_TOKEN);
  if (!token) return { ok: false, error: "missing_telegram_bot_token" };

  const body = {
    chat_id: String(chatId),
    text,
    disable_web_page_preview: true,
  };
  if (typeof threadId === "number") body.message_thread_id = threadId;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: data.ok === true,
    status: res.status,
    error_code: typeof data.error_code === "number" ? data.error_code : undefined,
    description: typeof data.description === "string" ? data.description.slice(0, 240) : undefined,
  };
}

async function handleTelegramDebugCommand(update, env) {
  const message = update.message || update.edited_message || {};
  const text = str(message.text);
  if (text !== "/threadid") return json({ ok: true, received: true }, 200);

  const chatId = message?.chat?.id;
  const configuredChatId = str(env.TELEGRAM_CHAT_ID);
  if (!configuredChatId || String(chatId) !== configuredChatId) {
    console.warn("telegram_threadid_rejected", JSON.stringify({
      reason: "chat_mismatch",
      chat_id_present: Boolean(chatId),
      configured_chat_id_present: Boolean(configuredChatId),
    }));
    return json({ ok: false, error: "chat_not_allowed" }, 403);
  }

  const threadId = typeof message.message_thread_id === "number" ? message.message_thread_id : undefined;
  const replyText = [
    "MMD Telegram topic debug",
    `chat_id: ${chatId}`,
    `message_thread_id: ${threadId || "none"}`,
    `message_id: ${message.message_id || "unknown"}`,
    `is_topic_message: ${message.is_topic_message === true ? "true" : "false"}`,
    `forum_topic_created: ${message.forum_topic_created ? "present" : "none"}`,
    `forum_topic_edited: ${message.forum_topic_edited ? "present" : "none"}`,
    `forum_topic_closed: ${message.forum_topic_closed ? "present" : "none"}`,
    `forum_topic_reopened: ${message.forum_topic_reopened ? "present" : "none"}`,
  ].join("\n");
  const reply = await sendTelegramDebugReply(env, chatId, replyText, threadId);
  console.warn("telegram_threadid_result", JSON.stringify({
    ok: reply.ok,
    status: reply.status,
    error_code: reply.error_code,
    description: reply.description,
    chat_id_present: Boolean(chatId),
    thread_id_present: Boolean(threadId),
  }));

  return json({
    ok: reply.ok,
    status: reply.status,
    error_code: reply.error_code,
    description: reply.description,
    chat_id: String(chatId),
    message_thread_id: threadId || null,
    message_id: message.message_id || null,
  }, reply.status >= 200 && reply.status < 500 ? 200 : 500);
}

async function handlePreviewChannelPost(req, body, env) {
  requireInternalToken(req, env);

  const channelId = str(env.TELEGRAM_PREVIEW_CHANNEL_ID);
  const botUsername = str(env.TELEGRAM_BOT_USERNAME || "mmdprivebot");

  if (!channelId) return json({ ok: false, error: "missing_preview_channel_id" }, 500);

  const isDryRun = body?.dry_run === true;

  const text = [
    "สมาชิก Preview Channel ทุกคนมีสิทธิ์รับโค้ดส่วนตัวจาก MMD Privé ครับ",
    "",
    "กดปุ่มด้านล่างเพื่อรับโค้ดของคุณผ่าน @" + botUsername,
    "โค้ดนี้ใช้ได้ 1 ครั้ง และจะมีผลหลังจากระบบตรวจสอบข้อมูลเรียบร้อยแล้วนะครับ",
  ].join("\n");

  const reply_markup = {
    inline_keyboard: [[
      { text: "รับโค้ดส่วนตัว", url: `https://t.me/${botUsername}?start=preview` },
    ]],
  };

  if (isDryRun) {
    return json({ ok: true, dry_run: true, channel_id: channelId, text, reply_markup }, 200);
  }

  const token = str(env.TELEGRAM_BOT_TOKEN);
  if (!token) return json({ ok: false, error: "missing_bot_token" }, 500);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: channelId, text, reply_markup, disable_web_page_preview: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) return json({ ok: false, telegram_error: data }, 502);
  return json({ ok: true, message_id: data.result?.message_id || null }, 200);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(req, env) });
      }

      if (req.method === "GET" && (path === "/" || path === "/health")) {
        return withCors(req, env, json({
          ok: true,
          lock: "telegram-preview-hype-v20260621a",
          worker: "telegram",
          preview_channel_configured: Boolean(env.TELEGRAM_PREVIEW_CHANNEL_ID),
          preview_bot_username: str(env.TELEGRAM_BOT_USERNAME),
        }, 200));
      }

      // Preview channel CTA post — INTERNAL_API_TOKEN required.
      if (path === "/telegram/preview/post" && req.method === "POST") {
        const body = await safeJson(req);
        if (!body) return withCors(req, env, json({ ok: false, error: "invalid_json" }, 400));
        return withCors(req, env, await handlePreviewChannelPost(req, body, env));
      }

      // Telegram webhook. HYPE Preview Intake handles /start preview first.
      // Falls through to existing /threadid debug handler for all other updates.
      if ((path === "/telegram/webhook" || path === "/webhooks/telegram") && req.method === "POST") {
        const update = await safeJson(req);
        if (!update) return withCors(req, env, json({ ok: false, error: "invalid_json" }, 400));
        const hype = await handleHypePreviewWebhook(update, env);
        if (hype.handled) return withCors(req, env, json({ ok: true, received: true, hype }, 200));
        return withCors(req, env, await handleTelegramDebugCommand(update, env));
      }

      // HYPE Preview code lifecycle API — internal-token protected.
      if (path.startsWith("/api/hype/preview/") && req.method === "POST") {
        requireInternalToken(req, env);
        const body = await safeJson(req);
        if (!body) return withCors(req, env, json({ ok: false, error: "invalid_json" }, 400));
        const out = await handleHypePreviewApi(path, body, env);
        return withCors(req, env, json(out.body, out.status));
      }

      // Optional: internal send (ให้ worker อื่นเรียกผ่านตัวนี้)
      if (path === "/telegram/internal/send" && req.method === "POST") {
        if (!isInternalServiceRequest(req)) {
          requireInternalToken(req, env);
        }
        const body = await safeJson(req);
        if (!body) return withCors(req, env, json({ ok: false, error: "invalid_json" }, 400));
        const tg = await telegramNotify(body, env);
        return withCors(req, env, json({ ok: true, telegram: tg }, 200));
      }

      return withCors(req, env, json({ ok: false, error: "not_found" }, 404));
    } catch (err) {
      if (err instanceof HttpError) return withCors(req, env, json(err.body, err.status));
      return withCors(req, env, json({ ok: false, error: "server_error", detail: String(err?.message || err) }, 500));
    }
  },
};
