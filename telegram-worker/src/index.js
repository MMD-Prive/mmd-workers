import { json, safeJson, HttpError } from "../lib/http.js";
import { requireInternalToken } from "../lib/guard.js";
import { sendTelegramMessage, telegramNotify, telegramTopics } from "../lib/telegram.js";
import { escapeHtml } from "../lib/util.js";

const LOCK = "telegram-preview-hype-v20260621a-v1-alias";
const PREVIEW_START = "preview";
const DEFAULT_BOT_USERNAME = "mmdprivebot";
const DEFAULT_PUBLIC_BASE_URL = "https://www.mmdbkk.com";
const DEFAULT_PREVIEW_CHANNEL_URL = "https://t.me/MMDPriveTH";
const TOPIC_SMOKE_CONFIRMATION = "SEND_REDACTED_TOPIC_SMOKE";

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
            topic_smoke: ["/telegram/internal/topics/smoke", "/v1/internal/topics/smoke"],
          },
          telegram_topics: telegramTopics(env).map(({ key, label, thread_id }) => ({ key, label, thread_id })),
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

      if (isTopicSmokePath(path) && req.method === "POST") {
        requireInternalToken(req, env);
        const body = (await safeJson(req)) || {};
        if (body.confirm !== TOPIC_SMOKE_CONFIRMATION) {
          return json({
            ok: false,
            error: "topic_smoke_confirmation_required",
            required_confirmation: TOPIC_SMOKE_CONFIRMATION,
          }, 400);
        }
        const result = await smokeTelegramTopics(body, env);
        return json(result, result.ok ? 200 : 502);
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

async function smokeTelegramTopics(body, env) {
  const chatId = clean(body.chat_id || env.TELEGRAM_CHAT_ID);
  if (!chatId) return { ok: false, error: "missing_telegram_chat_id", results: [] };

  const configured = telegramTopics(env);
  const requested = Array.isArray(body.topics)
    ? new Set(body.topics.map((value) => clean(value).toLowerCase()).filter(Boolean))
    : null;
  const selected = requested ? configured.filter((topic) => requested.has(topic.key)) : configured;
  if (!selected.length) return { ok: false, error: "no_matching_topics", results: [] };

  const runId = `tg-smoke-${Date.now().toString(36)}`;
  const results = [];
  for (const topic of selected) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      message_thread_id: topic.thread_id,
      text: [
        "🧪 <b>MMD TELEGRAM TOPIC CHECK</b>",
        `<b>Topic:</b> ${escapeHtml(topic.label)}`,
        `<b>Route:</b> <code>${escapeHtml(topic.key)}</code> → <code>${topic.thread_id}</code>`,
        `<b>Run:</b> <code>${runId}</code>`,
        "Synthetic / no customer data",
      ].join("\n"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      disable_notification: body.disable_notification !== false,
    }, env);
    results.push({
      key: topic.key,
      label: topic.label,
      thread_id: topic.thread_id,
      ok: telegram?.ok === true,
      status: telegram?.status || null,
      error: telegram?.error?.description || telegram?.reason || null,
      message_id: telegram?.result?.message_id || null,
    });
  }

  return {
    ok: results.every((item) => item.ok),
    run_id: runId,
    tested: results.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
}

async function handleTelegramWebhook(update, env) {
  const message = update.message || update.edited_message || null;
  if (!message) return { handled: false, reason: "unsupported_update" };

  const chatId = clean(message.chat?.id);
  if (!chatId) return { handled: false, reason: "missing_chat_id" };

  const joinCleanup = await cleanupConfiguredGroupJoinMessage(message, env);
  if (joinCleanup) return joinCleanup;

  const text = clean(message.text || "");
  const startArg = parseStartArg(text);
  if (startArg.toLowerCase() === PREVIEW_START) {
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

  if (/^bind_[A-Za-z0-9_-]{20,60}$/.test(startArg)) {
    return handleTelegramIdentityBindStart({ message, chatId, startArg }, env);
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

async function handleTelegramIdentityBindStart({ message, chatId, startArg }, env) {
  const telegramUserId = clean(message.from?.id);
  const telegramUsername = clean(message.from?.username || "");
  if (!/^\d{5,20}$/.test(telegramUserId)) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "เชื่อม Telegram ไม่สำเร็จครับ กรุณากลับไปที่ MMD แล้วกด Connect Telegram ใหม่อีกครั้ง",
      disable_web_page_preview: true,
    }, env);
    return { handled: true, flow: "telegram_identity_bind", ok: false, code_status: "telegram_identity_invalid", telegram };
  }
  const binding = env.TELEGRAM_BIND_AUTHORITY;
  if (!binding?.fetch) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "ระบบเชื่อม Telegram ยังไม่พร้อมชั่วคราวครับ กรุณาลองใหม่อีกครั้งภายหลัง",
      disable_web_page_preview: true,
    }, env);
    return { handled: true, flow: "telegram_identity_bind", ok: false, code_status: "bind_authority_unavailable", telegram };
  }

  let result = null;
  let status = 503;
  try {
    const response = await binding.fetch(new Request("https://admin-worker.internal/__internal/telegram-identity-bind", {
      method: "POST",
      headers: { "content-type": "application/json", "x-mmd-service-binding": "telegram-worker" },
      body: JSON.stringify({
        operation: "consume",
        start_arg: startArg,
        telegram_user_id: telegramUserId,
        telegram_username: telegramUsername,
      }),
    }));
    status = response.status;
    result = await response.json().catch(() => null);
  } catch {
    result = null;
  }

  const connected = status >= 200 && status < 300 && result?.ok === true && result?.telegram_connected === true;
  const role = result?.role === "model" ? "Model" : "Member";
  const text = connected
    ? `เชื่อม Telegram กับ MMD เรียบร้อยแล้วครับ\n\nสถานะ: ${role} · Telegram Connected ✅\nLINE ยังคงเป็นตัวตนหลักของบัญชีนี้`
    : result?.error === "telegram_bind_expired"
      ? "ลิงก์ Connect Telegram หมดอายุแล้วครับ กรุณากลับไปที่ MMD แล้วขอลิงก์ใหม่"
      : result?.error === "telegram_identity_already_bound" || result?.error === "telegram_bind_registry_conflict"
        ? "พบ Telegram binding ที่ต้องให้ MMD ตรวจสอบครับ ระบบจะไม่เปลี่ยนบัญชีเดิมอัตโนมัติ"
        : "เชื่อม Telegram ไม่สำเร็จครับ กรุณากลับไปที่ MMD แล้วกด Connect Telegram ใหม่อีกครั้ง";

  const telegram = await sendTelegramMessage({
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  }, env);
  return {
    handled: true,
    flow: "telegram_identity_bind",
    ok: connected,
    code_status: connected ? "connected" : clean(result?.error || "bind_failed"),
    telegram,
  };
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
    return { ok: false, status: res.status, error: data || null };
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
    flow: "recovery",
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
    "MMD Privé · 6 YEARS CARE BACK — CARE BACK CONTINUES",
    "Phase 2 เปิดถึง 30 กันยายน 2026 ครับ",
    "",
    "Phase 2 ใช้สิทธิ์ชุดเดียวกับช่วง Birthday เดิม ไม่ใช่สิทธิ์รอบสอง และไม่สร้าง claim / coupon / points bonus ซ้ำครับ",
    "กดเช็กสิทธิ์ด้านล่าง → ยืนยันผ่าน LINE/LIFF → ให้ MMD ตรวจสถานะและประวัติที่เชื่อมได้ → ส่ง Birthday Wish ให้บันทึกสำเร็จ",
    "หลัง Wish saved จึงเปิดคูปองส่วนตัว “ส่วนลดสูงสุด 10%” ได้ 1 ครั้ง โดยอัตราจริงขึ้นกับระดับนายแบบ × รูปแบบงาน และสิทธิ์ที่ตรวจสอบได้ครับ",
    "คูปองต้องใช้ยืนยันการจองภายใน 2 เดือนหลัง activation และวันรับบริการอยู่ได้ไม่เกิน 90 วันนับจากวันที่จองเดิมครับ",
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
    "6 YEARS CARE BACK · PHASE 2 — CARE BACK CONTINUES",
    "เปิด 1–30 กันยายน 2026 ครับ",
    "",
    "HYPE จะพาคุณยืนยันผ่าน LINE/LIFF และให้ MMD ตรวจสถานะสมาชิก ประวัติที่เชื่อมได้ และ Points ที่ตรวจสอบได้ก่อนครับ",
    "Phase 2 ใช้สิทธิ์ชุดเดียวกับ Phase 1 ไม่ได้สร้างสิทธิ์ซ้ำ",
    "การยืนยันตัวตนอย่างเดียวยังไม่เปิดคูปอง — ต้องส่ง Birthday Wish และบันทึกสำเร็จก่อนครับ",
    "หลัง Wish saved จึงเปิดคูปองส่วนตัว “ส่วนลดสูงสุด 10%” ได้ 1 ครั้ง โดยอัตราจริงขึ้นกับระดับนายแบบ × รูปแบบงาน และสิทธิ์ที่ตรวจสอบได้ครับ",
  ].join("\n");
}

function previewWelcomeText() {
  return [
    "ยินดีต้อนรับสู่ MMD Privé Preview ครับ",
    "",
    "6 YEARS CARE BACK ตอนนี้อยู่ใน Phase 2 · CARE BACK CONTINUES ถึง 30 กันยายน 2026",
    "สำหรับคนที่มาเห็นแคมเปญหรือรอบลงทะเบียนช้า โดยใช้ policy เดียวกับ Phase 1 และไม่ออกสิทธิ์ซ้ำครับ",
    "",
    "กดเช็กสิทธิ์ด้านล่างเพื่อยืนยันผ่าน LINE/LIFF จากนั้น MMD จะตรวจสถานะและประวัติที่เชื่อมได้",
    "ต้องส่ง Birthday Wish ให้บันทึกสำเร็จก่อน จึงเปิดคูปองส่วนตัว “ส่วนลดสูงสุด 10%” ได้ 1 ครั้งครับ",
  ].join("\n");
}

function previewButtonMarkup(env) {
  return {
    inline_keyboard: [
      [{
        text: "🎁 CARE BACK Phase 2 · เช็กสิทธิ์",
        url: publicUrl(env, "/promotion/6-years-care-back"),
      }],
      [{
        text: "MY MMD / Status",
        url: publicUrl(env, "/member/dashboard"),
      }],
      [{
        text: "Preview Models",
        url: publicUrl(env, "/profiles"),
      }, {
        text: "Apply / Renew Membership",
        url: publicUrl(env, "/sigil/member/membership"),
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
  return clean(match?.[1]);
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

function isTopicSmokePath(path) {
  return path === "/telegram/internal/topics/smoke" || path === "/v1/internal/topics/smoke";
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
