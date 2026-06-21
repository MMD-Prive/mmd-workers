import { json, safeJson, HttpError } from "../lib/http.js";
import { requireInternalToken } from "../lib/guard.js";
import { sendTelegramMessage, telegramNotify } from "../lib/telegram.js";
import { escapeHtml } from "../lib/util.js";

const LOCK = "telegram-preview-hype-v20260621a";
const PREVIEW_START = "preview";
const DEFAULT_BOT_USERNAME = "mmdprivebot";
const PREVIEW_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PREVIEW_CODE_TTL_SECONDS = 60 * 60 * 24 * 90;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (req.method === "GET" && (path === "/" || path === "/health" || path === "/ping")) {
        return json({
          ok: true,
          lock: LOCK,
          worker: "telegram",
          preview_channel_configured: Boolean(clean(env.TELEGRAM_PREVIEW_CHANNEL_ID)),
          preview_bot_username: botUsername(env),
        }, 200);
      }

      if (path === "/telegram/webhook" && req.method === "POST") {
        requireTelegramSecret(req, env);
        const update = await safeJson(req);
        if (!update) return json({ ok: false, error: "invalid_json" }, 400);
        const result = await handleTelegramWebhook(update, env);
        return json({ ok: true, received: true, ...result }, 200);
      }

      if (path === "/telegram/internal/send" && req.method === "POST") {
        requireInternalToken(req, env);
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400);
        const tg = await telegramNotify(body, env);
        return json({ ok: true, telegram: tg }, 200);
      }

      if (path === "/telegram/preview/post" && req.method === "POST") {
        requireInternalToken(req, env);
        const body = (await safeJson(req)) || {};
        const result = await postPreviewChannelCta(body, env);
        const status = result?.telegram?.ok === false ? 502 : 200;
        return json(result, status);
      }

      return json({ ok: false, error: "not_found" }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json(err.body, err.status);
      return json({ ok: false, error: "server_error", detail: String(err?.message || err) }, 500);
    }
  },
};

async function handleTelegramWebhook(update, env) {
  const message = update.message || update.edited_message || null;
  if (!message) return { handled: false, reason: "unsupported_update" };

  const text = clean(message.text || "");
  const chatId = clean(message.chat?.id);
  if (!chatId) return { handled: false, reason: "missing_chat_id" };

  const startArg = parseStartArg(text);
  if (startArg === PREVIEW_START) {
    const record = await issuePreviewPromo(message, env);
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: previewIssuedText(record),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }, env);
    return { handled: true, flow: "preview_start", telegram, code_status: record.status };
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

async function postPreviewChannelCta(body, env) {
  const chatId = clean(body.chat_id || env.TELEGRAM_PREVIEW_CHANNEL_ID);
  if (!chatId) return { ok: false, error: "missing_telegram_preview_channel_id" };

  const text = clean(body.text) || [
    "MMD Privé Preview เปิดให้รับสิทธิ์ส่วนตัวแล้วครับ",
    "",
    "กดรับโค้ดด้านล่างเพื่อให้ HYPE ตรวจสอบและออกโค้ดส่วนตัวให้คุณ",
    "โค้ดใช้ได้ 1 ครั้ง และจะมีผลหลังจากระบบตรวจสอบข้อมูลเรียบร้อยแล้วครับ",
  ].join("\n");

  if (body.dry_run === true) {
    return {
      ok: true,
      dry_run: true,
      chat_id: chatId,
      text,
      reply_markup: previewButtonMarkup(env, body.button_text),
    };
  }

  const telegram = await sendTelegramMessage({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: previewButtonMarkup(env, body.button_text),
  }, env);

  return {
    ok: telegram.ok === true,
    mode: "preview_channel_cta_post",
    chat_id: chatId,
    telegram,
  };
}

async function issuePreviewPromo(message, env) {
  const user = message.from || {};
  const userId = clean(user.id);
  if (!userId) {
    return { status: "blocked", error: "missing_telegram_user_id" };
  }

  const existing = await readPreviewRecord(env, userId);
  if (existing?.promo_code) {
    return { ...existing, status: existing.status || "issued", reissued: true };
  }

  const promoCode = await makePreviewCode(env, userId);
  const record = {
    telegram_user_id: userId,
    telegram_username: clean(user.username) || undefined,
    first_name: clean(user.first_name) || undefined,
    promo_code: promoCode,
    promo_source: "preview_channel",
    status: "issued",
    verification_status: "pending_system_verification",
    issued_at: new Date().toISOString(),
  };

  await writePreviewRecord(env, record);
  return record;
}

async function readPreviewRecord(env, userId) {
  if (!env.PREVIEW_PROMO_CODES_KV) return null;
  return env.PREVIEW_PROMO_CODES_KV.get(previewUserKey(userId), "json").catch(() => null);
}

async function writePreviewRecord(env, record) {
  if (!env.PREVIEW_PROMO_CODES_KV) return;
  const value = JSON.stringify(record);
  await env.PREVIEW_PROMO_CODES_KV.put(previewUserKey(record.telegram_user_id), value, { expirationTtl: PREVIEW_CODE_TTL_SECONDS });
  await env.PREVIEW_PROMO_CODES_KV.put(previewCodeKey(record.promo_code), value, { expirationTtl: PREVIEW_CODE_TTL_SECONDS });
}

async function makePreviewCode(env, userId) {
  const secret = clean(env.PREVIEW_PROMO_SECRET || env.TELEGRAM_BOT_TOKEN || env.INTERNAL_API_TOKEN || "mmd-preview-channel-v1");
  const bytes = new TextEncoder().encode(`${secret}:${userId}:preview_channel:v1`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += PREVIEW_CODE_ALPHABET[digest[index] % PREVIEW_CODE_ALPHABET.length];
  }
  return code;
}

function previewIssuedText(record) {
  if (record.error) {
    return [
      "ตอนนี้ระบบยังตรวจสอบข้อมูลไม่สมบูรณ์ครับ",
      "",
      "กรุณาลองใหม่อีกครั้ง หรือกลับมากดรับโค้ดภายหลังนะครับ",
      "สิทธิ์จะมีผลหลังจากระบบตรวจสอบเรียบร้อยแล้วเท่านั้นครับ",
    ].join("\n");
  }

  if (record.reissued) {
    return [
      "คุณมีโค้ดส่วนตัวอยู่แล้วครับ",
      "",
      `<code>${escapeHtml(record.promo_code)}</code>`,
      "",
      "โค้ดนี้ใช้ได้ 1 ครั้ง และระบบจะตรวจสอบสิทธิ์ก่อนใช้งานจริงนะครับ",
    ].join("\n");
  }

  return [
    "เข้าสู่ระบบเรียบร้อยครับ",
    "",
    "ผมจะออกโค้ดส่วนลดส่วนตัว 6 ตัวให้ทันที",
    "โค้ดนี้ใช้ได้ 1 ครั้ง และจะมีผลหลังจากระบบตรวจสอบข้อมูลเรียบร้อยแล้วนะครับ",
    "",
    `<code>${escapeHtml(record.promo_code)}</code>`,
  ].join("\n");
}

function previewWelcomeText() {
  return [
    "ยินดีต้อนรับสู่ MMD Privé Preview ครับ",
    "",
    "ช่องนี้สำหรับรับสิทธิ์ Preview และโค้ดส่วนตัวก่อนเข้าใช้งานจริง",
    "กดรับโค้ดด้านล่างได้เลยนะครับ",
    "",
    "โค้ดเป็นสิทธิ์ส่วนตัว ใช้ได้ 1 ครั้ง และจะมีผลหลังจากระบบตรวจสอบข้อมูลเรียบร้อยแล้วครับ",
  ].join("\n");
}

function previewButtonMarkup(env, label) {
  return {
    inline_keyboard: [[{
      text: clean(label) || "รับโค้ดส่วนตัว",
      url: `https://t.me/${botUsername(env)}?start=${PREVIEW_START}`,
    }]],
  };
}

function parseStartArg(text) {
  const match = clean(text).match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  return clean(match?.[1]).toLowerCase();
}

function requireTelegramSecret(req, env) {
  const expected = clean(env.TELEGRAM_WEBHOOK_SECRET);
  if (!expected) return;
  const actual = clean(req.headers.get("X-Telegram-Bot-Api-Secret-Token"));
  if (actual !== expected) throw new HttpError(403, { ok: false, error: "telegram_secret_required" });
}

function previewUserKey(userId) {
  return `preview:user:${userId}`;
}

function previewCodeKey(code) {
  return `preview:code:${code}`;
}

function botUsername(env) {
  return clean(env.TELEGRAM_BOT_USERNAME) || DEFAULT_BOT_USERNAME;
}

function clean(value) {
  return String(value ?? "").trim();
}
