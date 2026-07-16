import { json, safeJson, HttpError } from "../lib/http.js";
import { requireInternalToken } from "../lib/guard.js";
import { sendTelegramMessage, telegramNotify } from "../lib/telegram.js";
import { escapeHtml } from "../lib/util.js";

const LOCK = "telegram-preview-hype-v20260621a-v1-alias";
const PREVIEW_START = "preview";
const DEFAULT_BOT_USERNAME = "mmdprivebot";
const PREVIEW_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PREVIEW_CODE_TTL_SECONDS = 60 * 60 * 24 * 90;

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
        requireInternalToken(req, env);
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
