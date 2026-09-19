import { json, safeJson, HttpError } from "../lib/http.js";
import { requireInternalToken } from "../lib/guard.js";
import { sendTelegramMessage, telegramNotify, telegramTopics } from "../lib/telegram.js";
import { escapeHtml } from "../lib/util.js";
import { routeHypeNaturalLanguage } from "./hype-natural-language-router.js";
import { CONCIERGE_CAPABILITY_PACK_VERSION, detectSharedConciergeCapability } from "../../shared/concierge-capability-pack-v1.mjs";
import { detectHypeTransactionStart, extractHypeTransactionFields, transactionMissingQuestion, transactionModeLabel } from "./hype-transaction-assistant.js";

const LOCK = "telegram-preview-hype-v20260621a-v1-alias";
const PREVIEW_START = "preview";
const DEFAULT_BOT_USERNAME = "mmdprivebot";
const DEFAULT_PUBLIC_BASE_URL = "https://www.mmdbkk.com";
const DEFAULT_PREVIEW_CHANNEL_URL = "https://t.me/MMDPriveTH";
const TOPIC_SMOKE_CONFIRMATION = "SEND_REDACTED_TOPIC_SMOKE";
const HYPE_PREVIEW_INTRO_CONFIRMATION = "INTRODUCE_HYPE_PREVIEW_V1";

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
          capability_pack: CONCIERGE_CAPABILITY_PACK_VERSION,
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

      if (isHypePreviewIntroPath(path) && req.method === "POST") {
        requireHypePreviewIntroToken(req, env);
        const body = (await safeJson(req)) || {};
        if (clean(body.confirm) !== HYPE_PREVIEW_INTRO_CONFIRMATION) {
          return json({
            ok: false,
            error: "hype_preview_intro_confirmation_required",
            required_confirmation: HYPE_PREVIEW_INTRO_CONFIRMATION,
          }, 400);
        }
        const result = await introduceHypePreview(env);
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

async function introduceHypePreview(env) {
  const botToken = clean(env.TELEGRAM_BOT_TOKEN);
  const configuredChatId = clean(env.TELEGRAM_PREVIEW_CHANNEL_ID || env.TELEGRAM_PREVIEW_GROUP_ID);
  const publicHandle = previewChannelHandle(env);
  const expectedUsername = botUsername(env).replace(/^@/, "").toLowerCase();
  if (!botToken) return { ok: false, error: "missing_telegram_bot_token" };
  if (!configuredChatId && !publicHandle) return { ok: false, error: "missing_telegram_preview_chat_id" };

  const me = await callTelegramApiForPreviewIntro("getMe", null, env);
  const actualUsername = clean(me?.result?.username).replace(/^@/, "").toLowerCase();
  const botId = Number(me?.result?.id);
  if (me?.ok !== true || !Number.isInteger(botId) || actualUsername !== expectedUsername) {
    return {
      ok: false,
      error: "hype_bot_identity_mismatch",
      expected_username: expectedUsername,
      actual_username: actualUsername || null,
    };
  }

  const candidates = [...new Set([configuredChatId, publicHandle].filter(Boolean))];
  let chat = null;
  let resolvedBy = "";
  const attempts = [];

  for (const candidate of candidates) {
    const result = await callTelegramApiForPreviewIntro("getChat", { chat_id: candidate }, env);
    const resultType = clean(result?.result?.type).toLowerCase();
    const resultId = clean(result?.result?.id);
    attempts.push({
      candidate,
      ok: result?.ok === true,
      chat_id: resultId || null,
      chat_type: resultType || null,
      description: sanitizePreviewIntroFailure(result).description,
    });
    if (result?.ok === true && resultId && ["group", "supergroup", "channel"].includes(resultType)) {
      chat = result;
      resolvedBy = candidate === publicHandle ? "public_handle" : "configured_id";
      break;
    }
  }

  const actualChatId = clean(chat?.result?.id);
  const chatType = clean(chat?.result?.type).toLowerCase();
  if (chat?.ok !== true || !actualChatId || !["group", "supergroup", "channel"].includes(chatType)) {
    return {
      ok: false,
      error: "hype_preview_intro_preflight_failed",
      stage: "getChat",
      configured_chat_id: configuredChatId || null,
      public_handle: publicHandle || null,
      attempts,
    };
  }

  const member = await callTelegramApiForPreviewIntro("getChatMember", { chat_id: actualChatId, user_id: botId }, env);
  const membership = clean(member?.result?.status).toLowerCase();
  const allowedMembership = chatType === "channel"
    ? ["creator", "administrator"]
    : ["creator", "administrator", "member"];
  if (member?.ok !== true || !allowedMembership.includes(membership)) {
    return {
      ok: false,
      error: "hype_preview_intro_preflight_failed",
      stage: "getChatMember",
      chat_id: actualChatId,
      chat_type: chatType,
      membership: membership || null,
      telegram: sanitizePreviewIntroFailure(member),
    };
  }

  const linkedGroupId = clean(chat?.result?.linked_chat_id);
  let linkedGroup = {
    id: linkedGroupId || null,
    ready: false,
    type: null,
    membership: null,
  };

  if (chatType === "channel" && linkedGroupId) {
    const linkedChat = await callTelegramApiForPreviewIntro("getChat", { chat_id: linkedGroupId }, env);
    const linkedType = clean(linkedChat?.result?.type).toLowerCase();
    linkedGroup.type = linkedType || null;

    if (linkedChat?.ok === true && clean(linkedChat?.result?.id) === linkedGroupId && ["group", "supergroup"].includes(linkedType)) {
      const linkedMember = await callTelegramApiForPreviewIntro("getChatMember", { chat_id: linkedGroupId, user_id: botId }, env);
      const linkedMembership = clean(linkedMember?.result?.status).toLowerCase();
      linkedGroup.membership = linkedMembership || null;
      linkedGroup.ready = linkedMember?.ok === true && ["creator", "administrator", "member"].includes(linkedMembership);
    }
  }

  const telegram = await sendTelegramMessage({
    chat_id: actualChatId,
    text: hypePreviewIntroText(),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: hypePreviewWelcomeButtons(env),
  }, env);

  if (telegram?.ok !== true || !telegram?.result?.message_id) {
    return {
      ok: false,
      error: "hype_preview_intro_send_failed",
      chat_id: actualChatId,
      chat_type: chatType,
      resolved_by: resolvedBy,
      linked_group: linkedGroup,
      telegram: sanitizePreviewIntroFailure(telegram),
    };
  }

  return {
    ok: true,
    mode: "hype_preview_intro_v1",
    bot_username: actualUsername,
    configured_chat_id: configuredChatId || null,
    public_handle: publicHandle || null,
    resolved_by: resolvedBy,
    chat_id: actualChatId,
    chat_type: chatType,
    linked_group_id: linkedGroup.id,
    linked_group_ready: linkedGroup.ready,
    linked_group_type: linkedGroup.type,
    linked_group_membership: linkedGroup.membership,
    message_id: Number(telegram.result.message_id),
  };
}

function previewChannelHandle(env) {
  const raw = clean(env.TELEGRAM_PREVIEW_CHANNEL_USERNAME);
  if (raw) return raw.startsWith("@") ? raw : `@${raw}`;
  try {
    const url = new URL(previewChannelUrl(env));
    const segment = clean(url.pathname).replace(/^\/+|\/+$/g, "");
    return segment ? `@${segment}` : "@MMDPriveTH";
  } catch {
    return "@MMDPriveTH";
  }
}

function hypePreviewIntroText() {
  return [
    "👋 <b>สวัสดีครับ ผม HYPE</b>",
    "ผู้ช่วย Telegram ของ <b>MMD Privé</b> ประจำห้อง Preview ครับ",
    "",
    "ผมช่วยพาไปสิ่งที่ตรงกับคุณได้ แต่ <b>ผมจะไม่ดึง Model ทุกคนมารวมกัน</b>",
    "การแนะนำ Model ใช้มุมมองที่คุณเลือกไว้ใน MMD เท่านั้น — สำหรับผู้หญิง หรือ LGBT+",
    "ถ้ายังไม่เลือก ระบบจะ hold ไว้ก่อนและให้คุณเลือกเองครับ",
    "",
    "ผมไม่เดาเพศหรือความสนใจจากชื่อ รูป LINE หรือ Telegram",
    "พิมพ์ <b>/commands</b> เพื่อดูสิ่งที่ผมช่วยได้ หรือเลือกมุมมองใน Hall ก่อนครับ",
    "",
    "<b>ใน Preview</b>",
    "<b>/careback</b> — ดู 6 YEARS CARE BACK · Phase 2",
    "<b>/points</b> — ไป MY MMD · Points",
    "<b>/coupons</b> — เปิด Coupon Wallet",
    "",
    "<b>เรื่องของบัญชีส่วนตัว</b>",
    "<b>/status</b> — สถานะสมาชิก / งาน / การชำระ",
    "<b>/next</b> — ตอนนี้ต้องทำอะไรต่อ",
    "<b>/booking</b> — progress งานและการจอง",
    "<b>/payment</b> — สถานะการชำระ / ยอดคงเหลือ / รอตรวจสลิป",
    "",
    "ข้อมูลส่วนตัวผมจะพาไปคุยใน private chat เท่านั้น และจะอ่านจากข้อมูล MMD ที่ยืนยันได้ ไม่เดาเองครับ 🔒",
  ].join("\n");
}

async function callTelegramApiForPreviewIntro(method, payload, env) {
  const botToken = clean(env.TELEGRAM_BOT_TOKEN);
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, payload
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    : { method: "GET" });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) {
    return { ok: false, status: response.status, error: data || null };
  }
  return { ok: true, result: data.result };
}

function sanitizePreviewIntroFailure(value) {
  return {
    ok: value?.ok === true,
    status: Number(value?.status) || null,
    description: clean(value?.error?.description || value?.reason || value?.error || "").slice(0, 180) || null,
  };
}

function requireHypePreviewIntroToken(req, env) {
  const expected = clean(env.HYPE_PREVIEW_INTRO_TOKEN);
  if (!expected) throw new HttpError(503, { ok: false, error: "hype_preview_intro_disabled" });
  const header = clean(req.headers.get("Authorization"));
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1] || clean(req.headers.get("X-HYPE-Preview-Intro-Token"));
  if (!token || !timingSafeEqual(token, expected)) {
    throw new HttpError(401, { ok: false, error: "unauthorized" });
  }
}

async function handleTelegramWebhook(update, env) {
  const message = update.message || update.edited_message || null;
  if (!message) return { handled: false, reason: "unsupported_update" };

  const chatId = clean(message.chat?.id);
  if (!chatId) return { handled: false, reason: "missing_chat_id" };

  const joinCleanup = await cleanupConfiguredGroupJoinMessage(message, env);
  if (joinCleanup) return joinCleanup;

  const text = clean(message.text || message.caption || "");
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

  const handoffTransition = parseHypeOwnerHandoffTransition(text);
  if (handoffTransition) {
    return handleHypeOwnerHandoffTransition({
      message,
      chatId,
      telegramUserId: clean(message.from?.id),
      ...handoffTransition,
    }, env);
  }

  const hypeCommand = parseHypeOperatingCommand(text);
  if (hypeCommand) {
    return handleHypeOperatingCommand({
      message,
      chatId,
      command: hypeCommand,
      routing: { source: "explicit", confidence: 1, domain: hypeCommand },
    }, env);
  }

  const transactionStart = detectHypeTransactionStart(message);
  if (transactionStart) {
    return handleHypeTransactionIntake({
      message,
      chatId,
      mode: transactionStart.mode,
      fields: extractHypeTransactionFields(transactionStart.mode, message),
      source: transactionStart.source,
    }, env);
  }

  const naturalRoute = routeHypeNaturalLanguage(text);
  if (naturalRoute.ambiguous === true) {
    return handleHypeIntentClarification({ chatId, route: naturalRoute }, env);
  }
  if (naturalRoute.routed === true && naturalRoute.command) {
    return handleHypeOperatingCommand({
      message,
      chatId,
      command: naturalRoute.command,
      routing: {
        source: "natural_language",
        confidence: naturalRoute.confidence,
        domain: naturalRoute.domain,
      },
    }, env);
  }

  const sharedCapability = detectSharedConciergeCapability(text);
  const sharedCommand = sharedCapabilityToHypeCommand(sharedCapability, text);
  if (sharedCommand) {
    return handleHypeOperatingCommand({
      message,
      chatId,
      command: sharedCommand,
      routing: {
        source: "shared_capability_pack",
        confidence: 0.96,
        domain: sharedCapability,
      },
    }, env);
  }

  // Only look for an unfinished transaction draft after explicit/P4 routing
  // declines the message. This preserves minimal reads for normal status,
  // Points/Coupon routing and ambiguous protected-domain questions.
  const activeDraft = clean(message.chat?.type).toLowerCase() === "private"
    ? await readHypeActiveTransactionDraft(message, env)
    : null;
  if (activeDraft?.active === true && activeDraft.complete !== true) {
    const resumeFields = extractHypeTransactionFields(activeDraft.mode, message);
    if (Object.keys(resumeFields).length > 0) {
      return handleHypeTransactionIntake({
        message,
        chatId,
        mode: activeDraft.mode,
        fields: resumeFields,
        source: "resume",
      }, env);
    }
  }

  if (activeDraft?.active === true && activeDraft.complete !== true && text) {
    return renderHypeActiveDraftPrompt({ chatId, draft: activeDraft }, env);
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

async function handleHypeTransactionIntake({ message, chatId, mode, fields = {}, source = "natural_language" }, env) {
  if (clean(message.chat?.type).toLowerCase() !== "private") {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "Transaction Intake มีข้อมูลส่วนตัวครับ กรุณาเปิดแชตส่วนตัวกับ HYPE แล้วส่งรายละเอียดต่อที่นั่น",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{
          text: "เปิด HYPE แบบส่วนตัว",
          url: `https://t.me/${encodeURIComponent(botUsername(env))}`,
        }]],
      },
    }, env);
    return { handled: true, flow: "hype_transaction_private_required", mode, telegram };
  }

  const telegramUserId = clean(message.from?.id);
  if (!/^\d{5,20}$/.test(telegramUserId)) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "ยังเปิด Transaction Draft ไม่ได้ครับ กรุณาเชื่อม Telegram ผ่าน MY MMD ก่อน",
      disable_web_page_preview: true,
      reply_markup: hypeConnectButtons(env),
    }, env);
    return { handled: true, flow: "hype_transaction_intake", ok: false, code_status: "telegram_identity_invalid", telegram };
  }

  const binding = env.HYPE_CONTEXT_WRITER || env.HYPE_OPERATIONS;
  if (!binding?.fetch) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "ระบบ Transaction Draft ยังไม่พร้อมชั่วคราวครับ ผมจะไม่สร้างรายการแทนด้วยข้อมูลที่ไม่ครบ",
      disable_web_page_preview: true,
    }, env);
    return { handled: true, flow: "hype_transaction_intake", ok: false, code_status: "transaction_runtime_unavailable", telegram };
  }

  let result = null;
  let status = 503;
  try {
    const response = await binding.fetch(new Request("https://admin-worker.internal/__internal/hype/transaction-intake", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-service-binding": "telegram-worker",
      },
      body: JSON.stringify({
        operation: "update",
        telegram_user_id: telegramUserId,
        mode,
        customer_message: clean(message.text || message.caption || "").slice(0, 1000),
        fields,
        source,
      }),
    }));
    status = response.status;
    result = await response.json().catch(() => null);
  } catch {
    result = null;
  }

  if (!(status >= 200 && status < 300 && result?.ok === true)) {
    const connectRequired = result?.state === "connect_required" || result?.error === "canonical_client_unresolved";
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: connectRequired
        ? "ผมต้องเชื่อม Telegram กับ MY MMD ก่อน จึงจะเก็บ intake ต่อเนื่องข้ามข้อความให้ได้ครับ"
        : "Transaction Draft บันทึกไม่สำเร็จครับ ผมจะไม่สร้างรายการจริงจาก draft ที่ไม่ยืนยัน",
      disable_web_page_preview: true,
      reply_markup: connectRequired ? hypeConnectButtons(env) : undefined,
    }, env);
    return {
      handled: true,
      flow: "hype_transaction_intake",
      ok: false,
      code_status: clean(result?.error || "transaction_intake_failed"),
      telegram,
    };
  }

  const telegram = await sendTelegramMessage({
    chat_id: chatId,
    text: renderHypeTransactionDraft(result),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: hypeTransactionButtons(env, result),
  }, env);

  return {
    handled: true,
    flow: `hype_transaction_${mode}`,
    ok: telegram?.ok === true,
    code_status: clean(result.state || "draft"),
    mode,
    draft_id: clean(result.draft_id),
    complete: result.complete === true,
    persisted: result.persisted === true,
    telegram,
  };
}

async function readHypeActiveTransactionDraft(message, env) {
  const telegramUserId = clean(message.from?.id);
  if (!/^\d{5,20}$/.test(telegramUserId)) return null;
  const binding = env.HYPE_CONTEXT_WRITER || env.HYPE_OPERATIONS;
  if (!binding?.fetch) return null;

  try {
    const response = await binding.fetch(new Request("https://admin-worker.internal/__internal/hype/transaction-intake", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-service-binding": "telegram-worker",
      },
      body: JSON.stringify({
        operation: "read",
        telegram_user_id: telegramUserId,
      }),
    }));
    const result = await response.json().catch(() => null);
    return response.ok && result?.ok === true ? result : null;
  } catch {
    return null;
  }
}

async function renderHypeActiveDraftPrompt({ chatId, draft }, env) {
  const telegram = await sendTelegramMessage({
    chat_id: chatId,
    text: [
      `<b>HYPE · ${escapeHtml(transactionModeLabel(draft.mode))}</b>`,
      "",
      "ผมยังเก็บ draft เดิมไว้อยู่ครับ ไม่ต้องเริ่มใหม่",
      escapeHtml(transactionMissingQuestion(draft.mode, draft.missing_fields || [])),
      "",
      "นี่เป็น draft เท่านั้น ยังไม่ได้ confirm งาน / payment / membership / MMS booking ครับ",
    ].join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  }, env);
  return {
    handled: true,
    flow: "hype_transaction_resume_prompt",
    ok: telegram?.ok === true,
    mode: draft.mode,
    draft_id: draft.draft_id || null,
    telegram,
  };
}

function renderHypeTransactionDraft(result = {}) {
  const mode = clean(result.mode);
  const lines = [
    `<b>HYPE · ${escapeHtml(transactionModeLabel(mode))}</b>`,
  ];
  if (clean(result.display_name)) lines.push(escapeHtml(result.display_name));
  lines.push("");

  if (result.state === "already_paid") {
    lines.push("รายการนี้ระบบยืนยันการชำระแล้วครับ ไม่ต้องส่งหลักฐานซ้ำ");
  } else if (result.state === "payment_review_pending") {
    lines.push("หลักฐานของรายการนี้อยู่ระหว่าง MMD ตรวจสอบแล้วครับ ผมจะไม่ให้ส่งซ้ำหรือถือว่า paid ก่อน Payment Authority ยืนยัน");
  } else {
    const fields = result.fields || {};
    const captured = transactionCapturedLines(mode, fields);
    if (captured.length) {
      lines.push("<b>เก็บไว้แล้ว</b>");
      lines.push(...captured.map((line) => `• ${escapeHtml(line)}`));
      lines.push("");
    }

    if (Array.isArray(result.missing_fields) && result.missing_fields.length) {
      lines.push("<b>ยังขาด</b>");
      lines.push(escapeHtml(transactionMissingQuestion(mode, result.missing_fields)));
    } else if (result.state === "payment_intent_required") {
      lines.push("ข้อมูลหลักฐานครบแล้ว แต่ยังไม่มี signed payment intent ที่ HYPE ใช้ส่งหลักฐานให้ได้อย่างปลอดภัยครับ");
      lines.push("เปิด Payment Status เพื่อกลับเข้ารายการจริงก่อน — ผมจะไม่สร้าง payment ref ใหม่ให้เอง");
    } else if (result.canonical_submit?.ready === true) {
      lines.push("<b>Draft พร้อมแล้ว ✅</b>");
      lines.push("ขั้นต่อไปให้คุณเปิดหน้าของระบบจริงเพื่อตรวจและกดส่งเองครับ");
    } else {
      lines.push("Draft เก็บครบแล้ว แต่ canonical authority ยังต้องตรวจสถานะก่อนส่งจริงครับ");
    }
  }

  if (mode === "payment_proof" && result.fields?.evidence_present === true) {
    lines.push("");
    lines.push("ไฟล์ใน Telegram ยังไม่ถือเป็น Payment Evidence ของระบบนะครับ HYPE เก็บเพียงว่า “มีหลักฐาน” และจะไม่เก็บ file_id/raw media ลง Conversation Matrix");
  }

  if (result.persisted !== true) {
    lines.push("");
    lines.push("Draft รอบนี้ยังไม่ผูก LINE continuity จึงอาจไม่ตามต่อข้ามช่องทางได้ครับ");
  }

  lines.push("");
  lines.push("HYPE = prepare only · final submit/verify/confirm เป็นของ canonical backend / MMD");
  return lines.join("\n").slice(0, 3900);
}

function transactionCapturedLines(mode, fields = {}) {
  const out = [];
  if (mode === "booking") {
    if (fields.service_intent) out.push(`Service: ${fields.service_intent}`);
    if (fields.preferred_date) out.push(`Date: ${fields.preferred_date}`);
    if (fields.preferred_time) out.push(`Time: ${fields.preferred_time}`);
    if (fields.area) out.push(`Area: ${fields.area}`);
    if (fields.duration) out.push(`Duration: ${fields.duration}`);
    if (fields.model_preference) out.push(`Model preference: ${fields.model_preference}`);
  } else if (mode === "payment_proof") {
    if (fields.evidence_present) out.push(`Evidence: attached (${fields.evidence_type || "file"})`);
  } else if (mode === "renewal") {
    out.push("Intent: ต่ออายุสถานะปัจจุบัน");
  } else if (mode === "mms") {
    if (fields.recipient_gender) out.push(`Recipient: ${fields.recipient_gender}`);
    if (fields.zone) out.push(`Zone: ${fields.zone}`);
    if (fields.service_date) out.push(`Date: ${fields.service_date}`);
    if (fields.service_time) out.push(`Time: ${fields.service_time}`);
    if (fields.duration_minutes) out.push(`Duration: ${fields.duration_minutes} นาที`);
    if (Array.isArray(fields.skills) && fields.skills.length) out.push(`Service: ${fields.skills.join(", ")}`);
    if (fields.therapist_preference) out.push(`Therapist preference: ${fields.therapist_preference}`);
  }
  return out;
}

function hypeTransactionButtons(env, result = {}) {
  const rows = [];
  const href = clean(result.canonical_submit?.href);
  if (href && result.state !== "collecting") {
    const label = result.mode === "payment_proof"
      ? result.canonical_submit?.route_kind === "signed_payment_proof" ? "เปิดหน้าส่งหลักฐานของรายการนี้" : "เปิด Payment Status"
      : result.mode === "renewal"
        ? "เปิดหน้าต่ออายุ"
        : result.mode === "mms"
          ? "เปิด MMS Pre-booking"
          : "เปิด Booking";
    rows.push([{ text: label, url: publicUrl(env, href) }]);
  }
  rows.push([{ text: "MY MMD", url: publicUrl(env, "/my-mmd/") }]);
  return { inline_keyboard: rows };
}

async function handleHypeIntentClarification({ chatId, route }, env) {
  const labels = {
    payment: "/payment — การชำระ / สลิป / ยอดคงเหลือ",
    booking: "/booking — งาน / การจอง / คิว",
    membership: "/membership — สมาชิก / ต่ออายุ / วันหมดอายุ",
    points: "/points — แต้ม",
    coupons: "/coupons — คูปอง",
    careback: "/careback — CARE BACK",
    next: "/next — ขั้นตอนต่อไป",
    status: "/status — ภาพรวมสถานะ",
  };
  const candidates = (Array.isArray(route?.candidates) ? route.candidates : [])
    .slice(0, 3)
    .map((item) => labels[item.command])
    .filter(Boolean);

  const telegram = await sendTelegramMessage({
    chat_id: chatId,
    text: [
      "ผมเห็นว่าข้อความนี้เกี่ยวได้มากกว่าหนึ่งเรื่องครับ เลยไม่อยากเดาแล้วไปอ่านระบบผิดชุด",
      "",
      ...(candidates.length ? candidates : ["/status — ภาพรวมสถานะ", "/booking — งาน/การจอง", "/payment — การชำระ"]),
      "",
      "เลือกเรื่องที่ต้องการได้เลยครับ แล้วผมจะอ่านจาก authority ของเรื่องนั้นโดยตรง",
    ].join("\n"),
    disable_web_page_preview: true,
  }, env);

  return {
    handled: true,
    flow: "hype_intent_clarification",
    ok: true,
    code_status: "ambiguous_intent",
    candidates: (route?.candidates || []).slice(0, 3).map((item) => item.command),
    telegram,
  };
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

async function handleHypeOperatingCommand({ message, chatId, command, routing = {} }, env) {
  if (command === "owner_summary") {
    return handleHypeOwnerSummary({ message, chatId }, env);
  }

  if (command === "help") {
    const group = configuredMemberGroup(chatId, env);
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: group ? hypeMemberGroupCommandText(group) : hypeHelpText(),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: group ? hypeMemberGroupCommandButtons(env, group) : hypeHelpButtons(env),
    }, env);
    return {
      handled: true,
      flow: group ? "hype_member_group_commands" : "hype_operating_help",
      group: group || null,
      telegram,
    };
  }

  const privateChat = clean(message.chat?.type).toLowerCase() === "private";
  if (
    command === "careback"
    || command === "hall"
    || (!privateChat && (command === "points" || command === "coupons"))
  ) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: hypeCanonicalRouteText(command),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: hypeCanonicalRouteButtons(env, command),
    }, env);
    return { handled: true, flow: `hype_operating_${command}_route`, telegram };
  }

  if (!privateChat) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "ข้อมูลบัญชี การส่งต่อ และข้อมูลส่วนตัวจะแสดงเฉพาะใน private chat ครับ กรุณาเปิดแชตส่วนตัวกับ HYPE แล้วพิมพ์ /status, /membership, /points, /coupons, /orders, /next, /booking, /payment, /mms-options, /support, /case, /submit, /progress, /kenji หรือ /human\n\nในกลุ่มนี้พิมพ์ /commands เพื่อดูคู่มือคำสั่งได้ครับ",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{
          text: "เปิดแชตส่วนตัวกับ HYPE",
          url: `https://t.me/${encodeURIComponent(botUsername(env))}`,
        }]],
      },
    }, env);
    return { handled: true, flow: "hype_operating_private_required", telegram };
  }

  const telegramUserId = clean(message.from?.id);
  if (!/^\d{5,20}$/.test(telegramUserId)) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "ยังตรวจสถานะไม่ได้ครับ กรุณาเปิด MY MMD แล้วเชื่อม Telegram ใหม่อีกครั้ง",
      disable_web_page_preview: true,
      reply_markup: hypeConnectButtons(env),
    }, env);
    return { handled: true, flow: "hype_operating_status", ok: false, code_status: "telegram_identity_invalid", telegram };
  }

  if (command === "points" || command === "coupons") {
    return handleHypeMemberWalletCommand({
      chatId,
      telegramUserId,
      command,
    }, env);
  }

  if (command === "orders") {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: [
        "<b>HYPE · MMD SHOP ORDERS</b>",
        "",
        "ผมรับรู้ lane ของ MMD Shop แล้วครับ สถานะ Order/Payment ต้องยึด member-owned order record ใน MY MMD",
        "ตอนนี้ HYPE จะพาไป canonical Orders โดยไม่เดาสถานะจาก Telegram",
      ].join("\n"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: "MY MMD · Orders", url: publicUrl(env, "/my-mmd/orders") }]] },
    }, env);
    return { handled: true, flow: "hype_operating_orders_route", telegram };
  }

  if (command === "mms_options") {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: [
        "<b>HYPE · MMS THERAPIST OPTIONS</b>",
        "",
        "เรื่อง Therapist Options ให้ HENNA / MMS เป็น specialist owner ครับ",
        "HYPE ช่วยเชื่อม context ข้ามระบบได้ แต่ตัวเลือก/คิวจริงต้องมาจาก MMS authority และยังไม่ถือว่า Confirm Therapist จนกว่าจะยืนยัน",
      ].join("\n"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: "MMS Pre-booking", url: publicUrl(env, "/male-massage/member/mms-booking") }],
          [{ text: "MMS Therapist / Services", url: publicUrl(env, "/male-massage/therapists/mms") }],
        ],
      },
    }, env);
    return { handled: true, flow: "hype_operating_mms_options_bridge", telegram };
  }

  if (command === "handoff_status") {
    const binding = env.HYPE_CONTEXT_WRITER || env.HYPE_OPERATIONS;
    if (!binding?.fetch) {
      const telegram = await sendTelegramMessage({
        chat_id: chatId,
        text: "ตอนนี้ HYPE ยังอ่านสถานะ handoff จากระบบกลางไม่ได้ครับ ผมจะไม่เดาว่าทีมรับเรื่องหรือเคสจบแล้ว",
        disable_web_page_preview: true,
        reply_markup: hypeHandoffButtons(env, "per"),
      }, env);
      return { handled: true, flow: "hype_operating_handoff_status", ok: false, code_status: "handoff_status_unavailable", telegram };
    }

    let result = null;
    let status = 503;
    try {
      const response = await binding.fetch(new Request("https://admin-worker.internal/__internal/hype/handoff-status", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mmd-service-binding": "telegram-worker",
        },
        body: JSON.stringify({
          operation: "read",
          telegram_user_id: telegramUserId,
        }),
      }));
      status = response.status;
      result = await response.json().catch(() => null);
    } catch {
      result = null;
    }

    if (status === 404 && result?.state === "connect_required") {
      const telegram = await sendTelegramMessage({
        chat_id: chatId,
        text: "ยังตรวจสถานะเคสไม่ได้ครับ เพราะ Telegram นี้ยังไม่เชื่อมกับ Canonical Client ใน MY MMD",
        disable_web_page_preview: true,
        reply_markup: hypeConnectButtons(env),
      }, env);
      return { handled: true, flow: "hype_operating_handoff_status", ok: false, code_status: "connect_required", telegram };
    }

    if (!(status >= 200 && status < 300 && result?.ok === true)) {
      const telegram = await sendTelegramMessage({
        chat_id: chatId,
        text: "ตอนนี้ HYPE อ่านสถานะ handoff ไม่สำเร็จครับ ผมจะไม่สรุปแทนด้วยข้อมูลที่ไม่ยืนยัน",
        disable_web_page_preview: true,
        reply_markup: hypeHandoffButtons(env, "per"),
      }, env);
      return { handled: true, flow: "hype_operating_handoff_status", ok: false, code_status: "handoff_status_unavailable", telegram };
    }

    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: renderHypeHandoffStatus(result),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: hypeHandoffButtons(env, result.target === "kenji" ? "kenji" : "per"),
    }, env);
    return {
      handled: true,
      flow: "hype_operating_handoff_status",
      ok: true,
      code_status: clean(result.state || "none"),
      handoff_id: clean(result.handoff_id),
      telegram,
    };
  }

  if (command === "handoff_kenji" || command === "handoff_per" || command === "recovery") {
    const contextWriter = env.HYPE_CONTEXT_WRITER;
    if (!contextWriter?.fetch) {
      const telegram = await sendTelegramMessage({
        chat_id: chatId,
        text: "ระบบส่งต่อพร้อม context ยังไม่พร้อมชั่วคราวครับ กรุณาติดต่อ MMD ทาง LINE Official ก่อนครับ",
        disable_web_page_preview: true,
        reply_markup: hypeHandoffButtons(env, command === "handoff_kenji" ? "kenji" : "per"),
      }, env);
      return { handled: true, flow: "hype_supervised_handoff", ok: false, code_status: "context_writer_unavailable", telegram };
    }
    return handleHypeCustomerHandoff({
      message,
      chatId,
      telegramUserId,
      target: command === "handoff_kenji" ? "kenji" : "per",
      command,
    }, env, contextWriter);
  }

  if (command === "transaction_submit" || command === "transaction_progress") {
    const contextWriter = env.HYPE_CONTEXT_WRITER;
    if (!contextWriter?.fetch) {
      const telegram = await sendTelegramMessage({
        chat_id: chatId,
        text: "ระบบ Supervised Execution ยังไม่พร้อมชั่วคราวครับ ผมจะไม่สร้างรายการจริงจาก draft ที่ยังส่งต่อไม่ได้",
        disable_web_page_preview: true,
      }, env);
      return { handled: true, flow: "hype_supervised_execution", ok: false, code_status: "context_writer_unavailable", telegram };
    }
    return handleHypeSupervisedExecution({
      chatId,
      telegramUserId,
      operation: command === "transaction_progress" ? "status" : "execute",
    }, env, contextWriter);
  }

  const binding = env.HYPE_OPERATIONS || env.TELEGRAM_BIND_AUTHORITY;
  if (!binding?.fetch) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "HYPE ยังอ่านสถานะระบบกลางไม่ได้ชั่วคราวครับ กรุณาเปิด MY MMD เพื่อตรวจสถานะล่าสุด",
      disable_web_page_preview: true,
      reply_markup: hypeConnectButtons(env),
    }, env);
    return { handled: true, flow: "hype_operating_status", ok: false, code_status: "operations_unavailable", telegram };
  }

  let result = null;
  let status = 503;
  try {
    const response = await binding.fetch(new Request("https://admin-worker.internal/__internal/hype/operational-status", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-service-binding": "telegram-worker",
      },
      body: JSON.stringify({
        telegram_user_id: telegramUserId,
        intent: {
          type: command === "booking"
            ? "booking"
            : command === "payment"
              ? "payment_status"
              : command === "membership"
                ? "membership_status"
                : "general",
          trigger: command === "next"
            ? "telegram_next"
            : command === "booking"
              ? "telegram_booking"
              : command === "payment"
                ? "telegram_payment"
                : command === "membership"
                  ? "telegram_membership"
                  : "telegram_status",
          raw: clean(message.text || "").slice(0, 500),
          routing_source: clean(routing.source || "explicit").slice(0, 40),
          routing_confidence: Number(routing.confidence || 0),
        },
      }),
    }));
    status = response.status;
    result = await response.json().catch(() => null);
  } catch {
    result = null;
  }

  if (status === 404 && result?.state === "connect_required") {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: [
        "ยังไม่พบ Telegram นี้ในบัญชี MMD ที่ยืนยันแล้วครับ",
        "",
        "เปิด MY MMD → Connect Telegram ก่อน แล้วกลับมาพิมพ์ /status ได้เลยครับ",
      ].join("\n"),
      disable_web_page_preview: true,
      reply_markup: hypeConnectButtons(env),
    }, env);
    return { handled: true, flow: "hype_operating_status", ok: false, code_status: "connect_required", telegram };
  }

  if (!(status >= 200 && status < 300 && result?.ok === true)) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "ตอนนี้ HYPE อ่านสถานะจากระบบกลางไม่สำเร็จครับ กรุณาเช็กใน MY MMD ก่อน โดย HYPE จะไม่เดาสถานะให้",
      disable_web_page_preview: true,
      reply_markup: hypeConnectButtons(env),
    }, env);
    return { handled: true, flow: "hype_operating_status", ok: false, code_status: "live_context_unavailable", telegram };
  }

  const telegram = await sendTelegramMessage({
    chat_id: chatId,
    text: command === "booking"
      ? renderHypeBookingStatus(result)
      : command === "payment"
        ? renderHypePaymentStatus(result)
        : command === "membership"
          ? renderHypeMembershipStatus(result)
          : renderHypeOperatingStatus(result, { nextOnly: command === "next" }),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: command === "booking"
      ? hypeBookingButtons(env, result)
      : command === "payment"
        ? hypePaymentButtons(env, result)
        : command === "membership"
          ? hypeMembershipButtons(env, result)
          : hypeStatusButtons(env, result),
  }, env);

  const continuity = await recordHypeContinuity({
    binding: env.HYPE_CONTEXT_WRITER,
    telegramUserId,
    command,
    customerMessage: clean(message.text || ""),
    projection: result,
  });

  return {
    handled: true,
    flow: command === "next"
      ? "hype_operating_next"
      : command === "booking"
        ? "hype_operating_booking"
        : command === "payment"
          ? "hype_operating_payment"
          : command === "membership"
            ? "hype_operating_membership"
            : "hype_operating_status",
    ok: true,
    readiness: clean(result.readiness || result.state),
    continuity_recorded: continuity.ok === true,
    continuity_state: continuity.state,
    telegram,
  };
}

function parseHypeOwnerHandoffTransition(value) {
  const text = clean(value);
  const match = /^\/(case-ack|case-review|case-resolve|case-notified)(?:@\w+)?\s+(HYPE-(?:PER|KENJI)-\d{14}-[a-f0-9]{8})$/i.exec(text);
  if (!match) return null;
  const stateByCommand = {
    "case-ack": "acknowledged",
    "case-review": "reviewing",
    "case-resolve": "resolved",
    "case-notified": "customer_notified",
  };
  return {
    command: match[1].toLowerCase(),
    state: stateByCommand[match[1].toLowerCase()],
    handoffId: match[2],
  };
}

async function handleHypeOwnerHandoffTransition({ chatId, telegramUserId, state, handoffId }, env) {
  const owner = await verifyHypeOwnerTelegram(telegramUserId, env);
  if (!owner.ok) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: owner.reason === "owner_verification_unavailable"
        ? "ยังตรวจสิทธิ์ Owner ไม่ได้ครับ จึงไม่เปลี่ยนสถานะเคส"
        : "คำสั่งเปลี่ยนสถานะเคสใช้ได้เฉพาะ Per · Owner Mode ครับ",
      disable_web_page_preview: true,
    }, env);
    return {
      handled: true,
      flow: "hype_owner_handoff_transition",
      ok: false,
      code_status: owner.reason || "owner_required",
      telegram,
    };
  }

  const binding = env.HYPE_CONTEXT_WRITER || env.HYPE_OPERATIONS;
  if (!binding?.fetch) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "ระบบ handoff state ยังไม่พร้อมครับ จึงยังไม่เขียนสถานะแทน",
      disable_web_page_preview: true,
    }, env);
    return { handled: true, flow: "hype_owner_handoff_transition", ok: false, code_status: "handoff_status_unavailable", telegram };
  }

  let result = null;
  let status = 503;
  try {
    const response = await binding.fetch(new Request("https://admin-worker.internal/__internal/hype/handoff-status", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-service-binding": "telegram-worker",
      },
      body: JSON.stringify({
        operation: "transition",
        handoff_id: handoffId,
        state,
        actor_role: "owner",
      }),
    }));
    status = response.status;
    result = await response.json().catch(() => null);
  } catch {
    result = null;
  }

  if (!(status >= 200 && status < 300 && result?.ok === true)) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: status === 409
        ? `เปลี่ยนสถานะเคสไม่ได้ครับ · current: ${clean(result?.current_state) || "unknown"} → requested: ${clean(result?.requested_state) || state}`
        : "เขียนสถานะเคสไม่สำเร็จครับ ระบบจะคง state เดิมไว้",
      disable_web_page_preview: true,
    }, env);
    return {
      handled: true,
      flow: "hype_owner_handoff_transition",
      ok: false,
      code_status: clean(result?.error || "handoff_transition_failed"),
      telegram,
    };
  }

  const labels = {
    acknowledged: "รับทราบเคสแล้ว",
    reviewing: "กำลังตรวจสอบ",
    resolved: "แก้ไขแล้ว · ยังไม่ถือว่าแจ้งลูกค้า",
    customer_notified: "แก้ไขแล้วและแจ้งลูกค้าแล้ว",
  };
  const telegram = await sendTelegramMessage({
    chat_id: chatId,
    text: [
      "<b>HYPE · CASE UPDATED</b>",
      `<b>Reference:</b> <code>${escapeHtml(handoffId)}</code>`,
      `<b>Status:</b> ${escapeHtml(labels[state] || state)}`,
      "",
      "อัปเดตเฉพาะ handoff conversation state · ไม่เปลี่ยน Payment / Job / Membership truth",
    ].join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  }, env);

  return {
    handled: true,
    flow: "hype_owner_handoff_transition",
    ok: true,
    code_status: state,
    handoff_id: handoffId,
    telegram,
  };
}

function parseHypeOperatingCommand(value) {
  const text = clean(value);
  const normalized = text.toLowerCase();
  if (
    /^\/kenji(?:@\w+)?$/i.test(text)
    || ["คุยกับเคนจิ", "ขอคุยกับเคนจิ", "ส่งต่อให้เคนจิ", "ส่งให้เคนจิ", "คุยต่อกับเคนจิ"].includes(normalized)
  ) return "handoff_kenji";
  if (
    /^\/(?:human|handoff)(?:@\w+)?$/i.test(text)
    || ["คุยกับเปอร์", "ขอคุยกับเปอร์", "ส่งต่อให้เปอร์", "ส่งให้เปอร์", "ขอคุยกับคน", "คุยกับทีม", "ส่งต่อให้ทีม"].includes(normalized)
  ) return "handoff_per";
  if (
    /^\/(?:owner|today|per)(?:@\w+)?$/i.test(text)
    || [
      "วันนี้มีอะไรต้องดูบ้าง",
      "วันนี้มีอะไรให้ดูบ้าง",
      "มีอะไรต้องดูบ้าง",
      "สรุปงานวันนี้",
      "สรุปวันนี้",
      "owner summary",
      "owner mode",
    ].includes(normalized)
  ) return "owner_summary";
  if (
    /^\/(?:submit|execute)(?:@\w+)?$/i.test(text)
    || ["ส่ง draft", "ส่งดราฟต์", "ส่งรายการนี้", "ดำเนินการ draft", "ดำเนินการดราฟต์", "ส่งต่อรายการนี้"].includes(normalized)
  ) return "transaction_submit";
  if (
    /^\/(?:progress|draftstatus)(?:@\w+)?$/i.test(text)
    || ["สถานะ draft", "สถานะดราฟต์", "เช็ก draft", "เช็กดราฟต์", "รายการนี้ถึงไหนแล้ว"].includes(normalized)
  ) return "transaction_progress";
  if (/^\/orders?(?:@\w+)?$/i.test(text) || ["ออเดอร์ของฉัน", "ออร์เดอร์ของฉัน", "คำสั่งซื้อของฉัน", "mmd shop orders"].includes(normalized)) return "orders";
  if (/^\/hall(?:@\w+)?$/i.test(text) || ["เปิด hall", "เลือกมุมมอง", "ดู hall"].includes(normalized)) return "hall";
  if (/^\/(?:mms-options|therapists)(?:@\w+)?$/i.test(text) || ["mms options", "ตัวเลือก therapist", "หา therapist"].includes(normalized)) return "mms_options";
  if (/^\/(?:support|recovery)(?:@\w+)?$/i.test(text) || ["แจ้งปัญหา", "ร้องเรียน", "งานมีปัญหา", "บริการมีปัญหา"].includes(normalized)) return "recovery";
  if (/^\/(?:case|handoff-status)(?:@\w+)?$/i.test(text) || ["ตามเคส", "สถานะเคส", "ทีมรับเรื่องแล้วไหม"].includes(normalized)) return "handoff_status";
  if (/^\/status(?:@\w+)?$/i.test(text) || ["สถานะ", "เช็กสถานะ", "ดูสถานะ"].includes(normalized)) return "status";
  if (/^\/membership(?:@\w+)?$/i.test(text) || ["สมาชิก", "สถานะสมาชิก", "เช็กสมาชิก", "เช็คสมาชิก"].includes(normalized)) return "membership";
  if (/^\/next(?:@\w+)?$/i.test(text) || ["ต้องทำอะไรต่อ", "ทำอะไรต่อ", "ขั้นตอนต่อไป"].includes(normalized)) return "next";
  if (/^\/booking(?:@\w+)?$/i.test(text) || ["การจอง", "เช็กการจอง", "เช็กงาน", "งานของฉัน"].includes(normalized)) return "booking";
  if (
    /^\/(?:payment|pay)(?:@\w+)?$/i.test(text)
    || [
      "การชำระเงิน",
      "เช็กการชำระเงิน",
      "เช็กยอด",
      "ยอดคงเหลือ",
      "จ่ายแล้วไหม",
      "ชำระแล้วไหม",
      "สลิปถึงยัง",
      "สลิปถึงไหม",
      "เหลือจ่ายเท่าไหร่",
      "เหลือเท่าไหร่",
    ].includes(normalized)
  ) return "payment";
  if (/^\/points?(?:@\w+)?$/i.test(text) || ["แต้ม", "คะแนน", "ดูคะแนน", "ดูแต้ม"].includes(normalized)) return "points";
  if (/^\/coupons?(?:@\w+)?$/i.test(text) || ["คูปอง", "ดูคูปอง", "คูปองของฉัน"].includes(normalized)) return "coupons";
  if (/^\/careback(?:@\w+)?$/i.test(text) || ["care back", "careback", "โปร 6 ปี", "โปรโมชัน 6 ปี"].includes(normalized)) return "careback";
  if (/^\/(?:help|commands)(?:@\w+)?$/i.test(text) || ["ช่วยอะไรได้บ้าง", "hype ช่วยอะไรได้บ้าง", "คำสั่ง", "ดูคำสั่ง", "commands"].includes(normalized)) return "help";
  return "";
}

function sharedCapabilityToHypeCommand(capability, text = "") {
  if (capability === "shop_orders") return "orders";
  if (capability === "mms_therapist_options") return "mms_options";
  if (capability === "service_recovery") return "recovery";
  if (capability === "closed_loop_handoff") return "handoff_status";
  if (capability === "hall_model_discovery") return "hall";
  if (capability === "care_back_coupon") return "careback";
  if (capability === "points_coupon_balance") {
    return /(?:coupon|คูปอง|voucher)/i.test(String(text || "")) ? "coupons" : "points";
  }
  return "";
}

async function handleHypeSupervisedExecution({ chatId, telegramUserId, operation }, env, binding) {
  let result = null;
  let status = 503;
  try {
    const response = await binding.fetch(new Request("https://admin-worker.internal/__internal/hype/transaction-execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-service-binding": "telegram-worker",
      },
      body: JSON.stringify({
        operation,
        telegram_user_id: telegramUserId,
      }),
    }));
    status = response.status;
    result = await response.json().catch(() => null);
  } catch {
    result = null;
  }

  if (!(status >= 200 && status < 300 && result?.ok === true)) {
    const missing = Array.isArray(result?.missing_fields) ? result.missing_fields : [];
    const text = result?.state === "draft_incomplete"
      ? [
          "Transaction Draft ยังไม่ครบครับ",
          missing.length ? `ยังขาด: ${missing.join(", ")}` : "กรุณาส่งข้อมูลที่ขาดให้ HYPE ก่อน",
          "",
          "ผมจะไม่ execute รายการที่ข้อมูลยังไม่ครบครับ",
        ].join("\n")
      : result?.state === "connect_required" || result?.state === "line_identity_required"
        ? "ต้องเชื่อม MY MMD / LINE identity ให้ครบก่อน ผมจึงจะทำ supervised execution ได้ครับ"
        : "Supervised Execution ยังทำต่อไม่ได้ครับ ผมเก็บ draft เดิมไว้และจะไม่สร้าง business truth แทนระบบ";
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: result?.state === "connect_required" || result?.state === "line_identity_required"
        ? hypeConnectButtons(env)
        : undefined,
    }, env);
    return {
      handled: true,
      flow: "hype_supervised_execution",
      ok: false,
      code_status: clean(result?.state || result?.error || "execution_unavailable"),
      telegram,
    };
  }

  let alert = null;
  if (operation === "execute" && result.replayed !== true && result.ops_alert) {
    try {
      alert = await telegramNotify({
        flow: clean(result.ops_alert.flow || "alerts"),
        text: renderHypeExecutionOperatorAlert(result),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }, env);
    } catch {
      alert = { ok: false, error: "execution_alert_failed" };
    }
  }

  const telegram = await sendTelegramMessage({
    chat_id: chatId,
    text: renderHypeExecutionCustomer(result, operation),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: hypeExecutionButtons(env, result),
  }, env);

  return {
    handled: true,
    flow: operation === "status" ? "hype_supervised_execution_status" : "hype_supervised_execution",
    ok: telegram?.ok === true,
    code_status: clean(result.state || result.execution?.status || "execution_recorded"),
    execution_id: clean(result.execution?.execution_id),
    mode: clean(result.mode || result.execution?.mode),
    replayed: result.replayed === true,
    operator_notified: alert?.ok === true,
    telegram,
  };
}

function renderHypeExecutionCustomer(result = {}, operation = "execute") {
  const receipt = result.execution || {};
  const status = clean(receipt.status || result.state);
  const mode = clean(receipt.mode || result.mode);
  const label = ({
    booking: "Booking",
    payment_proof: "Payment Proof",
    renewal: "Membership Renewal",
    mms: "MMS Pre-booking",
  })[mode] || "Transaction";
  const lines = [`<b>HYPE · P6 ${escapeHtml(label)}</b>`];

  if (operation === "status") {
    if (!receipt.execution_id) {
      lines.push("", "Draft ยังไม่มี supervised execution receipt ครับ");
    } else {
      lines.push("", `<b>Status:</b> ${escapeHtml(status || "unknown")}`);
      lines.push(`<b>Execution:</b> <code>${escapeHtml(clean(receipt.execution_id))}</code>`);
      if (clean(receipt.canonical_ref)) lines.push(`<b>Canonical ref:</b> <code>${escapeHtml(clean(receipt.canonical_ref))}</code>`);

      const observed = result.authority_observation || {};
      if (clean(observed.source)) {
        lines.push("");
        lines.push("<b>Canonical observation</b>");
        lines.push(`• Source: ${escapeHtml(clean(observed.source))}`);
        if (clean(observed.state)) lines.push(`• State: ${escapeHtml(clean(observed.state))}`);
        if (observed.paid === true) lines.push("• Payment: paid ✅");
        else if (observed.review_required === true) lines.push("• Payment: review required");
        if (clean(observed.membership_level)) lines.push(`• Membership: ${escapeHtml(clean(observed.membership_level))}`);
        if (clean(observed.lifecycle)) lines.push(`• Lifecycle: ${escapeHtml(clean(observed.lifecycle))}`);
        if (clean(observed.active_through)) lines.push(`• Active through: ${escapeHtml(clean(observed.active_through))}`);
        if (observed.exact_correlation === true) {
          lines.push("• Correlation: Booking Request → Job ตรงกันแบบ exact");
          if (clean(observed.session_id)) lines.push(`• Session: <code>${escapeHtml(clean(observed.session_id))}</code>`);
          if (clean(observed.job_id)) lines.push(`• Job: <code>${escapeHtml(clean(observed.job_id))}</code>`);
          if (clean(observed.job_state)) lines.push(`• Job state: ${escapeHtml(clean(observed.job_state))}`);
        } else if (clean(observed.correlation_scope)) {
          lines.push(`• Correlation: ${escapeHtml(clean(observed.correlation_scope))}`);
        }
        if (observed.final_confirmation_observed === true) {
          lines.push("• Final confirmation: พบ explicit canonical Job state แล้ว");
        } else {
          lines.push("• Final confirmation: ยังไม่ถือว่ายืนยันจาก observation นี้");
        }
      }
    }
  } else {
    lines.push("");
    lines.push(escapeHtml(clean(result.customer_message) || executionStatusMessage(status)));
    if (result.replayed === true) lines.push("คำสั่งนี้ถูกทำไว้แล้วครับ ระบบคืน receipt เดิมและไม่สร้างรายการซ้ำ");
    if (clean(receipt.execution_id)) lines.push(`<b>Execution:</b> <code>${escapeHtml(clean(receipt.execution_id))}</code>`);
    if (clean(receipt.canonical_ref)) lines.push(`<b>Canonical ref:</b> <code>${escapeHtml(clean(receipt.canonical_ref))}</code>`);
  }

  lines.push("");
  lines.push("HYPE ทำได้เฉพาะ supervised low-risk step — final confirmation/payment/membership/assignment ยังเป็นของ canonical authority ครับ");
  return lines.join("\n").slice(0, 3900);
}

function executionStatusMessage(status) {
  return ({
    materialized: "สร้าง canonical request/pre-booking ระดับ draft แล้วครับ",
    queued: "ส่ง supervised intent เข้า queue แล้วครับ",
    customer_action_required: "เตรียม canonical handoff แล้วครับ ขั้นต่อไปต้องให้คุณเปิดหน้ารายการจริง",
    review_required: "รายการนี้ต้องให้ MMD/canonical authority ตรวจต่อครับ",
    execution_recorded: "มี execution receipt ของรายการนี้แล้วครับ",
    draft_ready: "Draft พร้อม แต่ยังไม่ได้ execute ครับ",
  })[status] || "อัปเดต supervised execution แล้วครับ";
}

function hypeExecutionButtons(env, result = {}) {
  const rows = [];
  const href = clean(result.execution?.canonical_href);
  if (href) rows.push([{ text: "เปิดรายการในระบบจริง", url: publicUrl(env, href) }]);
  rows.push([{ text: "MY MMD", url: publicUrl(env, "/my-mmd/") }]);
  return { inline_keyboard: rows };
}

function renderHypeExecutionOperatorAlert(result = {}) {
  const receipt = result.execution || {};
  const alert = result.ops_alert || {};
  return [
    `⚙️ <b>${escapeHtml(clean(alert.title) || "HYPE P6 · SUPERVISED EXECUTION")}</b>`,
    `<b>Mode:</b> ${escapeHtml(clean(receipt.mode || result.mode) || "-")}`,
    `<b>Status:</b> ${escapeHtml(clean(receipt.status || result.state) || "-")}`,
    clean(receipt.execution_id) ? `<b>Execution:</b> <code>${escapeHtml(clean(receipt.execution_id))}</code>` : "",
    clean(receipt.canonical_ref) ? `<b>Ref:</b> <code>${escapeHtml(clean(receipt.canonical_ref))}</code>` : "",
    Array.isArray(alert.blockers) && alert.blockers.length ? `<b>Blockers:</b> ${escapeHtml(alert.blockers.join(", "))}` : "",
    "",
    "Protected final action remains pending canonical authority.",
  ].filter(Boolean).join("\n").slice(0, 3500);
}

async function handleHypeCustomerHandoff({ message, chatId, telegramUserId, target, command }, env, binding) {
  let result = null;
  let status = 503;
  try {
    const response = await binding.fetch(new Request("https://admin-worker.internal/__internal/hype/handoff", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-service-binding": "telegram-worker",
      },
      body: JSON.stringify({
        telegram_user_id: telegramUserId,
        target,
        command: target === "kenji" ? "kenji" : "human",
        reason: command === "recovery"
          ? "customer_service_recovery"
          : target === "kenji"
            ? "customer_requested_kenji"
            : "customer_requested_per",
        customer_message: clean(message.text || "").slice(0, 500),
      }),
    }));
    status = response.status;
    result = await response.json().catch(() => null);
  } catch {
    result = null;
  }

  if (status === 404 && result?.state === "connect_required") {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: [
        "ผมยังส่งต่อพร้อมประวัติไม่ได้ครับ เพราะ Telegram นี้ยังไม่ผูกกับ Canonical Client",
        "",
        "เปิด MY MMD → Connect Telegram ก่อน แล้วกลับมาพิมพ์คำสั่งส่งต่ออีกครั้งครับ",
      ].join("\n"),
      disable_web_page_preview: true,
      reply_markup: hypeConnectButtons(env),
    }, env);
    return { handled: true, flow: "hype_supervised_handoff", ok: false, code_status: "connect_required", telegram };
  }

  if (!(status >= 200 && status < 300 && result?.ok === true)) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "ตอนนี้ HYPE เตรียม context สำหรับส่งต่อไม่สำเร็จครับ ผมจะไม่ส่งเคสแบบข้อมูลขาด กรุณาเปิด LINE Official เพื่อติดต่อ MMD โดยตรงครับ",
      disable_web_page_preview: true,
      reply_markup: hypeHandoffButtons(env, target),
    }, env);
    return { handled: true, flow: "hype_supervised_handoff", ok: false, code_status: "handoff_context_unavailable", telegram };
  }

  let alert = null;
  try {
    alert = await telegramNotify({
      flow: "human_handoff",
      text: renderHypeHandoffOperatorAlert(result),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }, env);
    if (alert?.ok === true) {
      await markHypeHandoffSent(binding, result.handoff_id);
    }
  } catch {
    alert = { ok: false, error: "handoff_notify_failed" };
  }

  const lineReady = result.line_continuity_ready === true;
  const destination = target === "kenji" ? "Kenji" : "Per";
  const lines = [
    `ส่งต่อให้ ${destination} แล้วครับ`,
    "",
    lineReady
      ? "ผมบันทึก context จาก HYPE เข้า Conversation Matrix เดียวกับที่ Kenji ใช้แล้ว คุณไม่ต้องเริ่มเล่าเรื่องใหม่ครับ"
      : "ผมเก็บ canonical context ของเคสไว้แล้ว แต่ LINE identity ยังไม่พร้อมสำหรับ cross-channel resume อัตโนมัติครับ",
    target === "kenji"
      ? "เปิด LINE Official แล้วพิมพ์ต่อจากเรื่องเดิมได้เลย Kenji จะ refresh สถานะจริงก่อนตอบหรือทำขั้นตอนถัดไปครับ"
      : alert?.ok === true
        ? "HYPE Ops แจ้ง Per พร้อม context ล่าสุดแล้วครับ ถ้าต้องส่งข้อความเพิ่ม ใช้ LINE Official ได้โดยไม่ต้องเริ่มอธิบายสถานะระบบใหม่ครับ"
        : "Context ถูกเตรียมไว้แล้ว แต่ HYPE ยังยืนยันการส่ง Alert ถึง Per ไม่ได้ กรุณาเปิด LINE Official เพื่อให้ทีมรับช่วงต่อครับ",
    "",
    `Reference: ${clean(result.handoff_id)}`,
  ];

  const telegram = await sendTelegramMessage({
    chat_id: chatId,
    text: lines.join("\n"),
    disable_web_page_preview: true,
    reply_markup: hypeHandoffButtons(env, target),
  }, env);

  return {
    handled: true,
    flow: "hype_supervised_handoff",
    ok: target === "kenji" ? lineReady : alert?.ok === true,
    code_status: target === "kenji"
      ? (lineReady ? "kenji_context_ready" : "kenji_context_without_line_link")
      : (alert?.ok === true ? "per_notified_with_context" : "per_context_ready_notify_unconfirmed"),
    target,
    handoff_id: clean(result.handoff_id),
    line_continuity_ready: lineReady,
    operator_notified: alert?.ok === true,
    telegram,
  };
}

async function recordHypeContinuity({ binding, telegramUserId, command, customerMessage, projection }) {
  if (!binding?.fetch) return { ok: false, state: "context_writer_unavailable" };
  try {
    const response = await binding.fetch(new Request("https://admin-worker.internal/__internal/hype/continuity", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-service-binding": "telegram-worker",
      },
      body: JSON.stringify({
        telegram_user_id: telegramUserId,
        command,
        customer_message: clean(customerMessage).slice(0, 500),
        projection,
      }),
    }));
    const body = await response.json().catch(() => null);
    return { ok: response.ok && body?.ok === true, state: clean(body?.state) };
  } catch {
    return { ok: false, state: "continuity_unavailable" };
  }
}

function renderHypeHandoffOperatorAlert(result = {}) {
  const target = result.target === "kenji" ? "KENJI" : "PER";
  const summary = clean(result.operator_summary).slice(0, 2400);
  return [
    `🤝 <b>HYPE → ${target} HANDOFF</b>`,
    `<b>Reference:</b> <code>${escapeHtml(clean(result.handoff_id) || "-")}</code>`,
    `<b>Client:</b> ${escapeHtml(clean(result.display_name) || "Canonical Client")}`,
    `<b>Cross-channel continuity:</b> ${result.line_continuity_ready === true ? "READY" : "LINE LINK MISSING"}`,
    "",
    escapeHtml(summary),
    "",
    "<b>Owner controls:</b>",
    `<code>/case-ack ${escapeHtml(clean(result.handoff_id) || "-")}</code>`,
    `<code>/case-review ${escapeHtml(clean(result.handoff_id) || "-")}</code>`,
    `<code>/case-resolve ${escapeHtml(clean(result.handoff_id) || "-")}</code>`,
    `<code>/case-notified ${escapeHtml(clean(result.handoff_id) || "-")}</code>`,
    "",
    "<b>Rule:</b> refresh canonical truth before protected action · customer should not be asked to restart the story",
  ].join("\n").slice(0, 3900);
}


function renderHypeHandoffStatus(result = {}) {
  const state = clean(result.state || "none").toLowerCase();
  const labels = {
    prepared: "เตรียม context แล้ว",
    sent: "ส่งต่อไปยังทีมแล้ว",
    acknowledged: "ทีมรับทราบเคสแล้ว",
    reviewing: "ทีมกำลังตรวจสอบ",
    resolved: "ทีมบันทึกว่าแก้ไขแล้ว · ยังไม่ยืนยันว่าลูกค้าได้รับแจ้ง",
    customer_notified: "แก้ไขแล้วและยืนยันว่าแจ้งลูกค้าแล้ว",
    none: "ยังไม่มี handoff ที่กำลังติดตาม",
  };
  const lines = ["<b>HYPE · CASE STATUS</b>", ""];
  if (clean(result.handoff_id)) lines.push(`<b>Reference:</b> <code>${escapeHtml(clean(result.handoff_id))}</code>`);
  if (clean(result.target)) lines.push(`<b>Owner:</b> ${escapeHtml(result.target === "kenji" ? "Kenji" : "Per / MMD Ops")}`);
  lines.push(`<b>Status:</b> ${escapeHtml(labels[state] || state || "unknown")}`);
  if (clean(result.updated_at)) lines.push(`<b>Updated:</b> ${escapeHtml(formatBangkokDateTime(result.updated_at))}`);
  lines.push("");
  lines.push("HYPE แสดงเฉพาะ state ที่ถูกเขียนโดยระบบ/ผู้มีสิทธิ์จริง และจะไม่เดา acknowledgement หรือ resolution เองครับ");
  return lines.join("\n");
}

async function markHypeHandoffSent(binding, handoffId) {
  const ref = clean(handoffId);
  if (!binding?.fetch || !ref) return { ok: false };
  try {
    const response = await binding.fetch(new Request("https://admin-worker.internal/__internal/hype/handoff-status", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-service-binding": "telegram-worker",
      },
      body: JSON.stringify({
        operation: "transition",
        handoff_id: ref,
        state: "sent",
        actor_role: "hype",
      }),
    }));
    const body = await response.json().catch(() => null);
    return { ok: response.ok && body?.ok === true, state: clean(body?.state) };
  } catch {
    return { ok: false };
  }
}

function hypeHandoffButtons(env, target) {
  const rows = [[{ text: target === "kenji" ? "คุยต่อกับ Kenji ใน LINE" : "ติดต่อ MMD ทาง LINE", url: "https://lin.ee/xRqsALs" }]];
  rows.push([{ text: "MY MMD", url: publicUrl(env, "/my-mmd/") }]);
  return { inline_keyboard: rows };
}

async function handleHypeOwnerSummary({ message, chatId }, env) {
  const telegramUserId = clean(message.from?.id);
  const owner = await verifyHypeOwnerTelegram(telegramUserId, env);

  if (!owner.ok) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: owner.reason === "owner_verification_unavailable"
        ? "Owner Summary ยังตรวจสิทธิ์ผู้สั่งไม่ได้ครับ จึงไม่เปิดข้อมูล Ops ให้"
        : "คำสั่งนี้ใช้ได้เฉพาะ Per · Owner Mode ครับ",
      disable_web_page_preview: true,
    }, env);
    return {
      handled: true,
      flow: "hype_owner_summary",
      ok: false,
      code_status: owner.reason || "owner_required",
      telegram,
    };
  }

  const binding = env.HYPE_OPERATIONS || env.TELEGRAM_BIND_AUTHORITY;
  if (!binding?.fetch) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "Owner Summary ยังอ่านระบบกลางไม่ได้ครับ ผมจะไม่สร้างสรุปจากข้อมูลค้างหรือเดาเอง",
      disable_web_page_preview: true,
    }, env);
    return { handled: true, flow: "hype_owner_summary", ok: false, code_status: "operations_unavailable", telegram };
  }

  let result = null;
  let status = 503;
  try {
    const response = await binding.fetch(new Request("https://admin-worker.internal/__internal/hype/owner-summary", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-service-binding": "telegram-worker",
      },
      body: "{}",
    }));
    status = response.status;
    result = await response.json().catch(() => null);
  } catch {
    result = null;
  }

  if (!(status >= 200 && status < 300 && result?.ok === true)) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "Owner Summary อ่าน canonical dashboard ไม่สำเร็จครับ ผมจะไม่สรุปแทนด้วยข้อมูลที่ไม่ยืนยัน",
      disable_web_page_preview: true,
    }, env);
    return { handled: true, flow: "hype_owner_summary", ok: false, code_status: "owner_summary_unavailable", telegram };
  }

  const privateTarget = telegramUserId;
  const privateMessage = await sendTelegramMessage({
    chat_id: privateTarget,
    text: renderHypeOwnerSummary(result),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: hypeOwnerSummaryButtons(env, result),
  }, env);

  if (privateMessage?.ok !== true) {
    const telegram = clean(message.chat?.type).toLowerCase() === "private"
      ? privateMessage
      : await sendTelegramMessage({
          chat_id: chatId,
          text: "ผมตรวจว่าเป็น Per แล้วครับ แต่ยังส่ง Owner Summary เข้า private chat ไม่ได้ กรุณาเปิดแชต @mmdprivebot แล้วกด Start ก่อนครับ",
          disable_web_page_preview: true,
        }, env);
    return {
      handled: true,
      flow: "hype_owner_summary",
      ok: false,
      code_status: "owner_private_delivery_failed",
      telegram,
    };
  }

  if (clean(message.chat?.type).toLowerCase() !== "private") {
    await sendTelegramMessage({
      chat_id: chatId,
      text: "ส่ง Owner Summary ล่าสุดให้ Per ใน private chat แล้วครับ 🔒",
      disable_web_page_preview: true,
    }, env);
  }

  return {
    handled: true,
    flow: "hype_owner_summary",
    ok: true,
    code_status: "owner_summary_delivered_private",
    private_message_id: privateMessage?.result?.message_id || null,
  };
}

async function verifyHypeOwnerTelegram(telegramUserId, env) {
  if (!/^\d{5,20}$/.test(clean(telegramUserId))) {
    return { ok: false, reason: "owner_identity_invalid" };
  }

  const opsChatId = clean(env.TELEGRAM_CHAT_ID || env.TELEGRAM_OPS_CHAT_ID || env.HYPE_CHAT_ID);
  if (!opsChatId) return { ok: false, reason: "owner_verification_unavailable" };

  let member;
  try {
    member = await callTelegramApiForPreviewIntro("getChatMember", {
      chat_id: opsChatId,
      user_id: Number(telegramUserId),
    }, env);
  } catch {
    return { ok: false, reason: "owner_verification_unavailable" };
  }

  const status = clean(member?.result?.status).toLowerCase();
  return status === "creator"
    ? { ok: true, reason: "", status }
    : { ok: false, reason: member?.ok === true ? "owner_required" : "owner_verification_unavailable", status };
}

function renderHypeOwnerSummary(result = {}) {
  const counts = result.counts || {};
  const review = result.review_required || {};
  const calendar = result.calendar || {};
  const jobs = result.jobs || {};
  const alerts = Array.isArray(result.alerts) ? result.alerts : [];
  const clients = result.clients || {};
  const actions = Array.isArray(result.next_actions) ? result.next_actions : [];
  const lines = [
    "<b>HYPE · PER OWNER SUMMARY</b>",
    escapeHtml(clean(result.bangkok_date) || "วันนี้"),
    "",
    `<b>Focus:</b> ${escapeHtml(clean(result.focus?.title) || "ยังไม่มีเรื่องด่วน")}`,
  ];

  if (clean(result.focus?.text)) lines.push(escapeHtml(result.focus.text));
  lines.push("");
  lines.push("<b>REVIEW REQUIRED</b>");
  lines.push(`• Payment Review: ${Number(counts.payment_review || 0)}`);
  lines.push(`• Historical Recovery: ${Number(counts.historical_recovery || 0)}`);
  lines.push(`• Membership: ${Number(counts.membership_review || 0)}`);
  lines.push(`• Jobs / Confirm: ${Number(counts.jobs_need_confirm || 0)}`);

  lines.push("");
  lines.push("<b>CALENDAR / JOB</b>");
  lines.push(`• วันนี้: ${Array.isArray(calendar.today_jobs) ? calendar.today_jobs.length : 0} งาน`);
  lines.push(`• พรุ่งนี้: ${Array.isArray(calendar.tomorrow_jobs) ? calendar.tomorrow_jobs.length : 0} งาน`);
  lines.push(`• Reconfirm pending: ${Number(calendar.tomorrow_reconfirm?.pending || 0)} · overdue: ${Number(calendar.tomorrow_reconfirm?.overdue || 0)}`);

  const topJobs = Array.isArray(jobs.items) ? jobs.items.slice(0, 3) : [];
  if (topJobs.length) {
    lines.push("");
    lines.push("<b>งานที่ควรเห็นตอนนี้</b>");
    for (const job of topJobs) {
      lines.push(`• ${escapeHtml(compactOwnerText([
        job.job_id,
        job.model_name,
        job.client_name,
        job.status,
        job.time,
      ]))}`);
    }
  }

  const payments = Array.isArray(review.payment) ? review.payment.slice(0, 3) : [];
  if (payments.length) {
    lines.push("");
    lines.push("<b>Payments รอตรวจ</b>");
    for (const item of payments) {
      lines.push(`• ${escapeHtml(compactOwnerText([
        item.client_name,
        Number(item.amount_thb || 0) > 0 ? formatThb(item.amount_thb) : "",
        item.text,
      ]))}`);
    }
  }

  if (alerts.length) {
    lines.push("");
    lines.push("<b>Alerts / Needs Per</b>");
    for (const item of alerts.slice(0, 3)) {
      lines.push(`• ${escapeHtml(compactOwnerText([item.title, item.text]))}`);
    }
  }

  if (Array.isArray(clients.display_names) && clients.display_names.length) {
    lines.push("");
    lines.push(`<b>Client context:</b> ${escapeHtml(clients.display_names.slice(0, 6).join(", "))}`);
  }

  if (actions.length) {
    lines.push("");
    lines.push("<b>ทำต่อ</b>");
    for (const item of actions.slice(0, 4)) {
      lines.push(`${Number(item.priority || 0) || "•"}. ${escapeHtml(clean(item.label) || "เปิดตรวจ")}`);
    }
  }

  lines.push("");
  lines.push("Read-only summary · เปอร์เป็นผู้ยืนยัน action ที่เปลี่ยน business truth");
  return lines.join("\n").slice(0, 3900);
}

function hypeOwnerSummaryButtons(env, result = {}) {
  const rows = [];
  for (const item of (Array.isArray(result.next_actions) ? result.next_actions : []).slice(0, 4)) {
    const href = clean(item.href);
    if (!/^\/internal\//.test(href)) continue;
    rows.push([{ text: clean(item.label) || "เปิดตรวจ", url: publicUrl(env, href) }]);
  }
  if (!rows.length) rows.push([{ text: "Owner Control Room", url: publicUrl(env, "/internal/admin/control-room") }]);
  return { inline_keyboard: rows };
}

function compactOwnerText(parts) {
  return parts.map((part) => clean(part)).filter(Boolean).join(" · ").slice(0, 360);
}

async function handleHypeMemberWalletCommand({ chatId, telegramUserId, command }, env) {
  const binding = env.HYPE_OPERATIONS;
  if (!binding?.fetch) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "ตอนนี้ HYPE ยังอ่าน Member Wallet จากระบบกลางไม่ได้ครับ กรุณาเปิด MY MMD เพื่อตรวจข้อมูลล่าสุด",
      disable_web_page_preview: true,
      reply_markup: hypeCanonicalRouteButtons(env, command),
    }, env);
    return { handled: true, flow: `hype_operating_${command}_inline`, ok: false, code_status: "wallet_unavailable", telegram };
  }

  let result = null;
  let status = 503;
  try {
    const response = await binding.fetch(new Request("https://admin-worker.internal/__internal/hype/member-wallet", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-service-binding": "telegram-worker",
      },
      body: JSON.stringify({
        telegram_user_id: telegramUserId,
        scope: command,
      }),
    }));
    status = response.status;
    result = await response.json().catch(() => null);
  } catch {
    result = null;
  }

  if (status === 404 && result?.state === "connect_required") {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "ยังอ่านข้อมูลส่วนตัวไม่ได้ครับ กรุณาเชื่อม Telegram กับ MY MMD ก่อน",
      disable_web_page_preview: true,
      reply_markup: hypeConnectButtons(env),
    }, env);
    return { handled: true, flow: `hype_operating_${command}_inline`, ok: false, code_status: "connect_required", telegram };
  }

  if (status === 409 && result?.state === "line_identity_required") {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "บัญชี Telegram นี้เชื่อมกับ Client แล้ว แต่ยังไม่มี LINE identity ที่ใช้ยืนยัน Member Wallet ครับ กรุณาเปิด MY MMD ผ่าน LINE ก่อน",
      disable_web_page_preview: true,
      reply_markup: hypeConnectButtons(env),
    }, env);
    return { handled: true, flow: `hype_operating_${command}_inline`, ok: false, code_status: "line_identity_required", telegram };
  }

  if (!(status >= 200 && status < 300 && result?.ok === true)) {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: result?.state === "review_required"
        ? "Member Wallet มีข้อมูลที่ต้องให้ MMD ตรวจสอบก่อนครับ HYPE จะไม่เดายอดหรือสถานะคูปองให้"
        : "ตอนนี้ HYPE อ่าน Member Wallet จาก canonical authority ไม่สำเร็จครับ กรุณาเปิด MY MMD เพื่อตรวจข้อมูลล่าสุด",
      disable_web_page_preview: true,
      reply_markup: hypeCanonicalRouteButtons(env, command),
    }, env);
    return {
      handled: true,
      flow: `hype_operating_${command}_inline`,
      ok: false,
      code_status: clean(result?.state || "wallet_unavailable"),
      telegram,
    };
  }

  const telegram = await sendTelegramMessage({
    chat_id: chatId,
    text: command === "points"
      ? renderHypePointsInline(result)
      : renderHypeCouponInline(result),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: hypeCanonicalRouteButtons(env, command),
  }, env);

  return {
    handled: true,
    flow: `hype_operating_${command}_inline`,
    ok: telegram?.ok === true,
    code_status: command === "points"
      ? clean(result.points?.status || "unavailable")
      : clean(result.coupon?.status || "unavailable"),
    telegram,
  };
}

function renderHypePointsInline(result = {}) {
  const points = result.points || {};
  const lines = ["<b>HYPE · POINTS</b>"];
  if (clean(result.display_name)) lines.push(escapeHtml(result.display_name));
  lines.push("");

  if (clean(points.status) === "verified" && Number.isInteger(Number(points.active_points)) && Number(points.active_points) >= 0) {
    lines.push(`<b>Active Points:</b> ${Number(points.active_points).toLocaleString("en-US")} Points`);
    lines.push("<b>Rate:</b> 100 THB = 1 Point");
    lines.push("");
    lines.push("ยอดนี้เป็น bounded read จาก Member Points authority ณ ตอนที่ตรวจครับ");
  } else {
    lines.push("ตอนนี้ยังไม่มียอด Points ที่ canonical source ยืนยันได้ครับ");
    lines.push("HYPE จะไม่ตีความยอดที่ไม่ verified เป็น 0");
  }

  lines.push("");
  lines.push("HYPE อ่านอย่างเดียว · ไม่เพิ่ม ลด ย้อนรายการ หรือแก้ Points Ledger ครับ");
  return lines.join("\n");
}

function renderHypeCouponInline(result = {}) {
  const coupon = result.coupon || {};
  const state = clean(coupon.status).toLowerCase();
  const labels = {
    ready: "พร้อมใช้",
    wish_required: "รอ Birthday Wish",
    verification_required: "รอตรวจสิทธิ์",
    used: "ใช้แล้ว",
    expired: "หมดอายุ",
    revoked: "ถูกระงับ",
    invalid: "ต้องให้ MMD ตรวจสอบ",
    review_required: "ต้องให้ MMD ตรวจสอบ",
    unavailable: "ยังตรวจสอบไม่ได้",
  };
  const lines = ["<b>HYPE · COUPON WALLET</b>"];
  if (clean(result.display_name)) lines.push(escapeHtml(result.display_name));
  lines.push("");
  lines.push(`<b>Status:</b> ${escapeHtml(labels[state] || "ยังตรวจสอบไม่ได้")}`);

  if (state === "ready" && /^[A-HJ-NP-Z2-9]{6}$/.test(clean(coupon.code))) {
    lines.push(`<b>Code:</b> <code>${escapeHtml(clean(coupon.code))}</code>`);
    if (Number.isInteger(Number(coupon.approved_discount_percent)) && Number(coupon.approved_discount_percent) > 0) {
      lines.push(`<b>Approved discount:</b> ${Number(coupon.approved_discount_percent)}%`);
    } else {
      lines.push("<b>Discount:</b> ยืนยันตาม Model / รูปแบบงานเมื่อใช้สิทธิ์");
    }
    if (clean(coupon.expires_at)) lines.push(`<b>Expires:</b> ${escapeHtml(formatDateOnly(coupon.expires_at))}`);
    if (coupon.single_use === true) lines.push("<b>Use:</b> 1 ครั้ง");
  } else if (state === "wish_required") {
    lines.push("ส่ง Birthday Wish ใน CARE BACK ก่อน ระบบจึงจะตรวจขั้นคูปองต่อได้ครับ");
  } else if (state === "verification_required") {
    lines.push("สิทธิ์คูปองยังรอ canonical verification ครับ");
  }

  lines.push("");
  lines.push("HYPE อ่าน Coupon Wallet อย่างเดียว และไม่ activate / reissue / เปลี่ยนส่วนลดเองครับ");
  return lines.join("\n");
}

function renderHypeOperatingStatus(result = {}, { nextOnly = false } = {}) {
  const member = result.membership || {};
  const job = result.job || {};
  const payment = result.payment || {};
  const next = result.next_action || null;
  const lines = ["<b>HYPE · MMD STATUS</b>"];

  if (clean(result.display_name)) lines.push(escapeHtml(result.display_name));
  lines.push("");

  if (!nextOnly) {
    lines.push(`<b>สมาชิก:</b> ${escapeHtml(membershipLabel(member.level))} · ${escapeHtml(lifecycleLabel(member.lifecycle || member.status))}`);
    if (clean(member.expire_at)) lines.push(`<b>Active through:</b> ${escapeHtml(formatDateOnly(member.expire_at))}`);

    if (Number(job.active_count || 0) > 0) {
      lines.push(`<b>งาน:</b> ${Number(job.active_count)} งานกำลังดำเนินการ`);
      if (job.next?.model_name) lines.push(`<b>Model:</b> ${escapeHtml(job.next.model_name)}`);
      if (job.next?.start_at) lines.push(`<b>เวลา:</b> ${escapeHtml(formatBangkokDateTime(job.next.start_at))}`);
    } else {
      lines.push("<b>งาน:</b> ยังไม่มีงานที่กำลังดำเนินการ");
    }

    lines.push(`<b>การชำระ:</b> ${escapeHtml(paymentLabel(payment))}`);
    if (Number(payment.outstanding_amount_thb || 0) > 0) {
      lines.push(`<b>ยอดคงเหลือ:</b> ${escapeHtml(formatThb(payment.outstanding_amount_thb))}`);
    }
    if (Number(payment.credit_balance_thb || 0) > 0) {
      lines.push(`<b>เครดิตที่ยืนยันแล้ว:</b> ${escapeHtml(formatThb(payment.credit_balance_thb))}`);
    }
  }

  lines.push("");
  lines.push(`<b>ขั้นตอนต่อไป:</b> ${escapeHtml(clean(next?.label) || "ยังไม่มี action ที่ต้องทำตอนนี้")}`);
  if (result.state === "partial") {
    lines.push("");
    lines.push("ข้อมูลบางส่วนกำลังรอระบบต้นทาง HYPE จึงแสดงเฉพาะส่วนที่ยืนยันได้ครับ");
  }
  lines.push("");
  lines.push("HYPE อ่านสถานะจากระบบจริงเท่านั้น และจะไม่ mark paid / grant membership / confirm job เองครับ");
  return lines.join("\n");
}

function renderHypeMembershipStatus(result = {}) {
  const member = result.membership || {};
  const next = result.next_action || null;
  const lines = ["<b>HYPE · MEMBERSHIP STATUS</b>"];

  if (clean(result.display_name)) lines.push(escapeHtml(result.display_name));
  lines.push("");
  lines.push(`<b>สถานะ:</b> ${escapeHtml(membershipLabel(member.level))} · ${escapeHtml(lifecycleLabel(member.lifecycle || member.status))}`);

  if (clean(member.expire_at)) {
    lines.push(`<b>Active through:</b> ${escapeHtml(formatDateOnly(member.expire_at))}`);
  }

  if (member.blocked === true) {
    lines.push("<b>Access:</b> ต้องให้ MMD ตรวจสิทธิ์ก่อน · HYPE จะไม่เปิดสิทธิ์แทนระบบ");
  }

  lines.push("");
  lines.push(`<b>ขั้นตอนต่อไป:</b> ${escapeHtml(clean(next?.label) || "ยังไม่มี action เรื่องสมาชิกที่ต้องทำตอนนี้")}`);

  if (result.state === "partial") {
    lines.push("");
    lines.push("ข้อมูลบางส่วนยังรอระบบต้นทาง HYPE จะแสดงเฉพาะสถานะสมาชิกที่ยืนยันได้ครับ");
  }

  lines.push("");
  lines.push("HYPE อ่านจาก Entitlement Resolver เท่านั้น และจะไม่ grant / renew / upgrade สมาชิกเองครับ");
  return lines.join("\n");
}

function hypeMembershipButtons(env, result = {}) {
  const rows = [];
  const next = result.next_action || {};
  if (clean(next.href)) rows.push([{ text: clean(next.label) || "ดำเนินการต่อ", url: publicUrl(env, next.href) }]);
  rows.push([{ text: "Membership", url: publicUrl(env, "/member/membership") }]);
  rows.push([{ text: "MY MMD", url: publicUrl(env, "/my-mmd/") }]);
  return { inline_keyboard: rows };
}

function renderHypePaymentStatus(result = {}) {
  const payment = result.payment || {};
  const job = result.job || {};
  const next = result.next_action || null;
  const lines = ["<b>HYPE · PAYMENT STATUS</b>"];

  if (clean(result.display_name)) lines.push(escapeHtml(result.display_name));
  lines.push("");

  if (payment.paid === true) {
    lines.push("<b>สถานะ:</b> ยืนยันการชำระแล้ว ✅");
  } else if (payment.review_required === true || clean(payment.status).toLowerCase() === "pending_review") {
    lines.push("<b>สถานะ:</b> ได้รับข้อมูลแล้ว · รอตรวจสอบหลักฐาน");
    lines.push("HYPE ยังไม่ถือว่ายอดนี้ชำระสำเร็จจนกว่าระบบ Payment Authority จะยืนยันครับ");
  } else {
    lines.push(`<b>สถานะ:</b> ${escapeHtml(paymentLabel(payment))}`);
  }

  if (Number(payment.outstanding_amount_thb || 0) > 0) {
    lines.push(`<b>ยอดคงเหลือที่ระบบยืนยัน:</b> ${escapeHtml(formatThb(payment.outstanding_amount_thb))}`);
  }
  if (Number(payment.credit_balance_thb || 0) > 0) {
    lines.push(`<b>เครดิตที่ยืนยันแล้ว:</b> ${escapeHtml(formatThb(payment.credit_balance_thb))}`);
  }

  if (Number(job.active_count || 0) > 0 && job.next?.payment_state) {
    lines.push(`<b>สถานะในงานล่าสุด:</b> ${escapeHtml(paymentLabel({ ...payment, status: job.next.payment_state }))}`);
  }

  lines.push("");
  lines.push(`<b>ขั้นตอนต่อไป:</b> ${escapeHtml(clean(next?.label) || paymentNextActionLabel(payment))}`);

  if (result.state === "partial") {
    lines.push("");
    lines.push("ข้อมูลบางส่วนยังรอระบบต้นทาง HYPE จะแสดงเฉพาะสิ่งที่ยืนยันได้ครับ");
  }

  lines.push("");
  lines.push("HYPE อ่านจาก Payment Authority เท่านั้น และจะไม่ mark paid, เดายอด หรือรับรองสลิปเองครับ");
  return lines.join("\n");
}

function paymentNextActionLabel(payment = {}) {
  if (payment.paid === true) return "ยังไม่มี action เรื่องการชำระที่ต้องทำตอนนี้";
  if (payment.review_required === true || clean(payment.status).toLowerCase() === "pending_review") {
    return "รอ MMD ตรวจสอบหลักฐานการชำระเงิน";
  }
  if (Number(payment.outstanding_amount_thb || 0) > 0) return "ดำเนินการชำระยอดคงเหลือ";
  return "เปิด MY MMD เพื่อตรวจสถานะการชำระล่าสุด";
}

function hypePaymentButtons(env, result = {}) {
  const rows = [];
  const next = result.next_action || {};
  if (clean(next.href)) rows.push([{ text: clean(next.label) || "ดำเนินการต่อ", url: publicUrl(env, next.href) }]);
  rows.push([{ text: "MY MMD · Payments", url: publicUrl(env, "/member/payments") }]);
  rows.push([{ text: "MY MMD", url: publicUrl(env, "/my-mmd/") }]);
  return { inline_keyboard: rows };
}

function renderHypeBookingStatus(result = {}) {
  const job = result.job || {};
  const payment = result.payment || {};
  const next = result.next_action || null;
  const lines = ["<b>HYPE · BOOKING STATUS</b>"];
  if (clean(result.display_name)) lines.push(escapeHtml(result.display_name));
  lines.push("");

  if (Number(job.active_count || 0) > 0) {
    lines.push(`<b>งานที่กำลังดำเนินการ:</b> ${Number(job.active_count)} งาน`);
    if (job.next?.status) lines.push(`<b>สถานะงาน:</b> ${escapeHtml(bookingJobLabel(job.next.status))}`);
    if (job.next?.model_name) lines.push(`<b>Model:</b> ${escapeHtml(job.next.model_name)}`);
    if (job.next?.start_at) lines.push(`<b>วันเวลา:</b> ${escapeHtml(formatBangkokDateTime(job.next.start_at))}`);
    if (job.next?.payment_state || payment.status) {
      lines.push(`<b>การชำระ:</b> ${escapeHtml(paymentLabel({ ...payment, status: payment.status || job.next?.payment_state }))}`);
    }
  } else {
    lines.push("ยังไม่มีงานที่กำลังดำเนินการใน snapshot ที่ HYPE ยืนยันได้ครับ");
  }

  lines.push("");
  lines.push(`<b>ขั้นตอนต่อไป:</b> ${escapeHtml(clean(next?.label) || (Number(job.active_count || 0) > 0 ? "รอระบบอัปเดตขั้นตอนถัดไป" : "เริ่ม Booking ใหม่ได้จากปุ่มด้านล่าง"))}`);
  lines.push("");
  lines.push("HYPE แสดงเฉพาะสถานะที่ระบบยืนยันแล้ว และไม่ confirm คิวหรือ assign Model เองครับ");
  return lines.join("\n");
}

function bookingJobLabel(value) {
  const key = clean(value).toLowerCase();
  return ({
    draft: "Draft",
    pending: "กำลังรอตรวจ",
    awaiting_payment: "รอชำระเงิน",
    awaiting_deposit: "รอมัดจำ",
    pending_review: "รอตรวจสอบ",
    confirmed: "ยืนยันแล้ว",
    scheduled: "นัดหมายแล้ว",
    in_progress: "กำลังดำเนินการ",
    completed: "เสร็จสิ้น",
    cancelled: "ยกเลิก",
  })[key] || clean(value) || "กำลังตรวจสอบ";
}

function hypeCanonicalRouteText(command) {
  if (command === "hall") {
    return [
      "<b>HYPE · MODEL / HALL DISCOVERY</b>",
      "",
      "ก่อนดู Model ให้เลือกมุมมองใน Hall ด้วยตัวเองครับ",
      "HYPE จะไม่เดาเพศ/ความสนใจจากชื่อ รูป LINE/Telegram หรือประวัติ และจะไม่ดึง Model ทั้งหมดมาให้",
      "",
      "Hall audience ที่คุณเลือกเองเป็นตัวกำหนดสิ่งที่ระบบอนุญาตให้เห็น",
    ].join("\n");
  }
  if (command === "points") {
    return [
      "<b>HYPE · POINTS</b>",
      "",
      "ยอด Points ที่เป็นทางการอ่านจาก MMD — Points Ledger ผ่าน Member Wallet authority ครับ",
      "ในห้องกลุ่ม HYPE จะไม่แสดง Points balance ส่วนตัว",
      "",
      "เปิดแชตส่วนตัวกับ HYPE เพื่ออ่านยอด verified แบบ bounded หรือกด <b>MY MMD · Points</b> เพื่อดูรายละเอียดครับ",
    ].join("\n");
  }
  if (command === "coupons") {
    return [
      "<b>HYPE · COUPONS</b>",
      "",
      "คูปองที่พร้อมใช้ / ใช้แล้ว / หมดอายุ ให้ยึด Coupon Wallet ใน MY MMD เป็นตัวจริงครับ",
      "ในห้องกลุ่ม HYPE จะไม่แสดง Coupon code หรือสถานะบัญชีส่วนตัว",
      "",
      "เปิดแชตส่วนตัวกับ HYPE เพื่ออ่าน bounded wallet หรือกด <b>MY MMD · Coupons</b> เพื่อดูรายละเอียดครับ",
    ].join("\n");
  }
  return [
    "<b>6 YEARS CARE BACK · PHASE 2</b>",
    "CARE BACK CONTINUES · 1–30 กันยายน 2026",
    "",
    "ใช้ policy เดียวกับ Phase 1 และไม่สร้าง claim / coupon / Points bonus ซ้ำครับ",
    "ยืนยันผ่าน LINE/LIFF → MMD ตรวจสถานะและประวัติ → Birthday Wish saved → จึงเปิดคูปองส่วนตัว “ส่วนลดสูงสุด 10%” ตามสิทธิ์ที่ตรวจสอบได้",
  ].join("\n");
}

function hypeCanonicalRouteButtons(env, command) {
  if (command === "hall") {
    return { inline_keyboard: [[{ text: "เลือกมุมมองใน Hall", url: publicUrl(env, "/hall") }]] };
  }
  if (command === "points") {
    return { inline_keyboard: [[{ text: "MY MMD · Points", url: publicUrl(env, "/my-mmd/points") }]] };
  }
  if (command === "coupons") {
    return {
      inline_keyboard: [
        [{ text: "MY MMD · Coupons", url: publicUrl(env, "/my-mmd/coupons") }],
        [{ text: "CARE BACK Phase 2", url: publicUrl(env, "/promotion/6-years-care-back") }],
      ],
    };
  }
  return {
    inline_keyboard: [
      [{ text: "CARE BACK Phase 2 · เช็กสิทธิ์", url: publicUrl(env, "/promotion/6-years-care-back") }],
      [{ text: "MY MMD · Coupons", url: publicUrl(env, "/my-mmd/coupons") }],
    ],
  };
}

function hypeBookingButtons(env, result = {}) {
  const rows = [];
  const next = result.next_action || {};
  if (clean(next.href)) rows.push([{ text: clean(next.label) || "ดำเนินการต่อ", url: publicUrl(env, next.href) }]);
  rows.push([{ text: "Booking", url: publicUrl(env, "/booking") }]);
  rows.push([{ text: "MY MMD", url: publicUrl(env, "/my-mmd/") }]);
  return { inline_keyboard: rows };
}

function configuredMemberGroup(chatId, env) {
  const id = clean(chatId);
  if (!id) return "";
  if (id === clean(env.TELEGRAM_PREVIEW_GROUP_ID || env.TELEGRAM_PREVIEW_CHANNEL_ID)) return "preview";
  if (id === clean(env.TELEGRAM_PREMIUM_GROUP_ID || "-1001668261779")) return "premium";
  if (id === clean(env.TELEGRAM_STANDARD_GROUP_ID || "-1002073919780")) return "standard";
  return "";
}

function hypeMemberGroupCommandText(group) {
  if (group === "preview") {
    return [
      "<b>HYPE · PREVIEW COMMANDS</b>",
      "",
      "ใน Preview ผมจะไม่ดึง Model ทุกคนรวมกันครับ",
      "ผมใช้มุมมองที่ลูกค้าเลือกไว้ใน MMD เท่านั้น: สำหรับผู้หญิง หรือ LGBT+",
      "ถ้ายังไม่เลือก = hold ก่อน ไม่เดาเพศ/ความสนใจ และไม่โชว์ทั้งหมด",
      "",
      "<b>/commands</b> หรือ <b>/help</b> — ดูคู่มือ",
      "<b>/careback</b> — CARE BACK Phase 2",
      "<b>/points</b> — MY MMD · Points",
      "<b>/coupons</b> — MY MMD · Coupon Wallet",
      "",
      "<b>ข้อมูลส่วนตัว</b> เช่น /status, /next, /booking ผมจะพาไปคุยใน private chat เท่านั้นครับ 🔒",
    ].join("\n");
  }

  const label = group === "premium" ? "PREMIUM" : "STANDARD";
  return [
    `<b>HYPE · ${label} GROUP COMMANDS</b>`,
    "",
    "HYPE ใช้งานในกลุ่มนี้ได้ครับ โดยแยกคำสั่งสาธารณะกับข้อมูลส่วนตัวให้ชัดเจน",
    "",
    "<b>ใช้ในกลุ่มได้</b>",
    "<b>/commands</b> หรือ <b>/help</b> — ดูคู่มือคำสั่ง",
    "<b>/points</b> — ไปที่ MY MMD · Points",
    "<b>/coupons</b> — ไปที่ MY MMD · Coupon Wallet",
    "<b>/careback</b> — ดู CARE BACK Phase 2",
    "",
    "<b>ข้อมูลส่วนตัว — HYPE จะพาไปแชตส่วนตัว</b>",
    "<b>/status</b> — สถานะสมาชิก / งาน / การชำระ",
    "<b>/next</b> — ขั้นตอนที่ต้องทำต่อ",
    "<b>/booking</b> — progress งานและการจอง",
    "",
    "HYPE จะไม่แสดงชื่อ Model ของงาน, ยอดชำระ, Points balance, Coupon code หรือสถานะบัญชีส่วนตัวในกลุ่มครับ",
  ].join("\n");
}

function hypeMemberGroupCommandButtons(env, group = "") {
  const rows = [];
  if (group === "preview") {
    rows.push([{ text: "เลือกมุมมองใน Hall", url: publicUrl(env, "/hall") }]);
  }
  rows.push([{ text: "คุยกับ HYPE แบบส่วนตัว", url: `https://t.me/${encodeURIComponent(botUsername(env))}` }]);
  rows.push([
    { text: "MY MMD", url: publicUrl(env, "/my-mmd/") },
    { text: "Booking", url: publicUrl(env, "/booking") },
  ]);
  rows.push([
    { text: "Points", url: publicUrl(env, "/my-mmd/points") },
    { text: "Coupons", url: publicUrl(env, "/my-mmd/coupons") },
  ]);
  return { inline_keyboard: rows };
}

function hypeHelpText() {
  return [
    "<b>HYPE · Telegram Operating Concierge</b>",
    "",
    "<b>/status</b> — ดูสถานะสมาชิก งาน และการชำระ",
    "<b>/membership</b> — ดูระดับสมาชิก สถานะ และวันหมดอายุ",
    "<b>/book</b> — เริ่ม Booking Intake draft",
    "<b>/proof</b> — เตรียม Payment Proof handoff",
    "<b>/renew</b> — เตรียม Membership Renewal",
    "<b>/mms</b> — เริ่ม MMS Pre-booking draft",
    "<b>/submit</b> — ให้ HYPE ทำ supervised low-risk step จาก draft ปัจจุบัน",
    "<b>/progress</b> — ดู execution receipt / สถานะของ draft ล่าสุด",
    "<b>/next</b> — ดูว่าตอนนี้ต้องทำอะไรต่อ",
    "<b>/booking</b> — ดู progress งาน/การจองที่ระบบยืนยันได้",
    "<b>/payment</b> — ดูสถานะการชำระ ยอดคงเหลือ และสถานะตรวจสลิป",
    "<b>/points</b> — ดูยอด Points ที่ canonical source ยืนยันแล้ว",
    "<b>/coupons</b> — ดูสถานะ Coupon Wallet แบบ bounded read",
    "<b>/careback</b> — ดู CARE BACK Phase 2",
    "<b>/orders</b> — เปิด MMD Shop Orders",
    "<b>/hall</b> — เลือกมุมมอง Model discovery โดยไม่เดาเพศ/ความสนใจ",
    "<b>/mms-options</b> — ส่งต่อ Therapist discovery ให้ HENNA / MMS",
    "<b>/support</b> — เปิด Service Recovery พร้อม context",
    "<b>/case</b> — ดูกติกา Closed-loop handoff / ติดตามเคส",
    "<b>/kenji</b> — ส่งต่อให้ Kenji พร้อม context เดิม",
    "<b>/human</b> — ส่งต่อให้ Per / ทีม พร้อม context เดิม",
    "<b>/help</b> — ดูเมนูนี้",
    "",
    "พิมพ์เป็นภาษาคนได้ด้วย เช่น “งานวันศุกร์โอเคยัง”, “สมาชิกหมดเมื่อไหร่”, “สลิปถึงยัง” หรือ “คูปองใช้ได้ไหม”",
    "ถ้าจะเริ่มรายการใหม่ พิมพ์เช่น “อยากจอง”, “ขอต่ออายุ”, “ส่งสลิป” หรือ “อยากจองนวด” แล้วผมจะเก็บ draft ให้ทีละส่วนครับ",
    "HYPE จะ route ไป authority ที่ตรงเรื่อง และถ้าข้อความกำกวมจะถามก่อนแทนการเดาครับ",
    "HYPE ช่วยเชื่อม Telegram Identity, ดูสถานะจากระบบ MMD, พาไป MY MMD / Promotion และจัด route ให้ถูกขั้นตอนได้ครับ",
    "ข้อมูลส่วนตัวจะแสดงเฉพาะในแชตส่วนตัว และ HYPE ไม่ถือ final authority แทน MMD/Per",
  ].join("\n");
}

function hypeHelpButtons(env) {
  return {
    inline_keyboard: [
      [{ text: "MY MMD", url: publicUrl(env, "/my-mmd/") }],
      [
        { text: "Points", url: publicUrl(env, "/my-mmd/points") },
        { text: "Coupons", url: publicUrl(env, "/my-mmd/coupons") },
      ],
      [{ text: "CARE BACK Phase 2", url: publicUrl(env, "/promotion/6-years-care-back") }],
      [
        { text: "Orders", url: publicUrl(env, "/my-mmd/orders") },
        { text: "Hall", url: publicUrl(env, "/hall") },
      ],
      [{ text: "Booking", url: publicUrl(env, "/booking") }],
    ],
  };
}

function hypeConnectButtons(env) {
  return {
    inline_keyboard: [
      [{ text: "เปิด MY MMD", url: publicUrl(env, "/my-mmd/") }],
      [{ text: "CARE BACK Phase 2", url: publicUrl(env, "/promotion/6-years-care-back") }],
    ],
  };
}

function hypeStatusButtons(env, result = {}) {
  const rows = [];
  const next = result.next_action || {};
  if (clean(next.href)) rows.push([{ text: clean(next.label) || "ดำเนินการต่อ", url: publicUrl(env, next.href) }]);
  rows.push([{ text: "MY MMD", url: publicUrl(env, "/my-mmd/") }]);
  rows.push([{ text: "CARE BACK Phase 2", url: publicUrl(env, "/promotion/6-years-care-back") }]);
  return { inline_keyboard: rows };
}

function membershipLabel(value) {
  const key = clean(value).toLowerCase();
  return ({
    public_member: "Member",
    red_card: "Red Card",
    private_standard: "Standard",
    private_premium: "Premium",
    vip: "VIP",
    svip: "SVIP",
    black_card: "Black Card",
    guest_pass: "Guest Pass",
    none: "ยังไม่มีสถานะสมาชิก",
  })[key] || clean(value) || "ยังไม่มีสถานะสมาชิก";
}

function lifecycleLabel(value) {
  const key = clean(value).toLowerCase();
  return ({
    active: "Active",
    grace: "Grace",
    inactive: "Inactive",
    expired: "Expired",
    blocked: "Blocked",
    suspended: "Suspended",
    revoked: "Revoked",
    recognized: "Recognized",
    unavailable: "กำลังตรวจสอบ",
    unknown: "กำลังตรวจสอบ",
  })[key] || clean(value) || "กำลังตรวจสอบ";
}

function paymentLabel(payment = {}) {
  if (payment.paid === true) return "ยืนยันแล้ว";
  if (payment.review_required === true) return "รอตรวจสอบหลักฐาน";
  const key = clean(payment.status).toLowerCase();
  return ({
    pending: "กำลังรอ",
    pending_review: "รอตรวจสอบ",
    awaiting_payment: "รอชำระเงิน",
    awaiting_deposit: "รอมัดจำ",
    unpaid: "ยังไม่ชำระ",
    unknown: "ยังไม่มีสถานะที่ยืนยัน",
    unavailable: "กำลังตรวจสอบ",
  })[key] || clean(payment.status) || "ยังไม่มีสถานะที่ยืนยัน";
}

function formatThb(value) {
  const n = Number(value);
  return `${Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "0"} บาท`;
}

function formatDateOnly(value) {
  const raw = clean(value);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return raw;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(parsed));
}

function formatBangkokDateTime(value) {
  const raw = clean(value);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return raw;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function hypePreviewJoinWelcomeText() {
  return [
    "👋 <b>ยินดีต้อนรับสู่ MMD Privé Preview ครับ</b>",
    "",
    "ผม <b>HYPE</b> ผู้ช่วย Telegram ของ MMD",
    "ถ้าอยากดูว่าผมช่วยอะไรได้บ้าง พิมพ์ <b>/commands</b> ได้เลยครับ",
    "",
    "<b>ก่อนแนะนำ Model ผมจะไม่ดึงทุกคนมาให้ดูรวมกัน</b>",
    "ผมใช้มุมมองที่คุณเลือกไว้ใน MMD เท่านั้น — สำหรับผู้หญิง หรือ LGBT+",
    "ถ้ายังไม่เคยเลือก ระบบจะ hold ไว้ก่อนและให้คุณเลือกเองครับ",
    "",
    "ผมไม่เดาเพศหรือความสนใจจากชื่อ รูป LINE หรือ Telegram ของคุณ",
    "เลือกมุมมองใน Hall ก่อน แล้วผมค่อยพาไปยังสิ่งที่ตรงกับคุณครับ",
    "",
    "ข้อมูลสมาชิก งาน การจอง หรือการชำระ ผมจะพาไปคุยในแชตส่วนตัวเพื่อไม่ให้ข้อมูลส่วนตัวขึ้นในกลุ่มครับ 🔒",
  ].join("\n");
}

function hypePreviewWelcomeButtons(env) {
  return {
    inline_keyboard: [
      [{ text: "เลือกมุมมองใน Hall", url: publicUrl(env, "/hall") }],
      [{ text: "คุยกับ HYPE แบบส่วนตัว", url: `https://t.me/${encodeURIComponent(botUsername(env))}` }],
      [
        { text: "MY MMD", url: publicUrl(env, "/my-mmd/") },
        { text: "CARE BACK Phase 2", url: publicUrl(env, "/promotion/6-years-care-back") },
      ],
    ],
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

  let welcome = null;
  if (surface === "telegram_preview") {
    const humanMembers = message.new_chat_members.filter((member) => member && member.is_bot !== true);
    if (humanMembers.length > 0) {
      welcome = await sendTelegramMessage({
        chat_id: chatId,
        text: hypePreviewJoinWelcomeText(),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: hypePreviewWelcomeButtons(env),
      }, env);
    }
  }

  return {
    handled: true,
    flow: "telegram_group_join_cleanup",
    surface,
    deleted: deletion.ok === true,
    telegram: deletion,
    welcome_sent: welcome?.ok === true,
    welcome,
  };
}

function configuredJoinCleanupChats(env) {
  const chats = new Map();
  const add = (value, surface) => {
    const chatId = clean(value);
    if (chatId) chats.set(chatId, surface);
  };

  add(env.TELEGRAM_STANDARD_GROUP_ID, "standard_group");
  add(env.TELEGRAM_PREMIUM_GROUP_ID, "premium_group");
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

function isHypePreviewIntroPath(path) {
  return path === "/telegram/internal/preview/introduce-hype"
    || path === "/v1/internal/preview/introduce-hype";
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
