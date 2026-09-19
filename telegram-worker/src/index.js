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
const HYPE_MEMBER_GROUP_INTRO_CONFIRMATION = "INTRODUCE_HYPE_MEMBER_GROUPS_V1";

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

      if (isHypeMemberGroupIntroPath(path) && req.method === "POST") {
        requireHypeMemberGroupIntroToken(req, env);
        const body = (await safeJson(req)) || {};
        if (clean(body.confirm) !== HYPE_MEMBER_GROUP_INTRO_CONFIRMATION) {
          return json({
            ok: false,
            error: "hype_member_group_intro_confirmation_required",
            required_confirmation: HYPE_MEMBER_GROUP_INTRO_CONFIRMATION,
          }, 400);
        }
        const result = await introduceHypeMemberGroups(env);
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

async function introduceHypeMemberGroups(env) {
  const preflight = await preflightHypeMemberGroups(env);
  if (!preflight.ok) return preflight;

  const targets = [
    { key: "premium", label: "PREMIUM", chat_id: preflight.groups.premium.chat_id },
    { key: "standard", label: "STANDARD", chat_id: preflight.groups.standard.chat_id },
  ];
  const sent = [];

  for (const target of targets) {
    const telegram = await sendTelegramMessage({
      chat_id: target.chat_id,
      text: hypeMemberIntroText(target.label),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: hypeMemberIntroButtons(env),
    }, env);

    if (telegram?.ok !== true || !telegram?.result?.message_id) {
      const rollback = [];
      for (const prior of [...sent].reverse()) {
        rollback.push({
          group: prior.group,
          ...(await deleteTelegramMessage({
            chat_id: prior.chat_id,
            message_id: prior.message_id,
          }, env)),
        });
      }
      return {
        ok: false,
        error: "hype_member_group_intro_send_failed",
        failed_group: target.key,
        telegram: sanitizeTelegramFailure(telegram),
        sent,
        rollback,
        preflight: preflight.summary,
      };
    }

    sent.push({
      group: target.key,
      chat_id: target.chat_id,
      message_id: Number(telegram.result.message_id),
    });
  }

  return {
    ok: true,
    mode: "hype_member_group_intro_v1",
    bot_username: preflight.bot.username,
    sent,
    preflight: preflight.summary,
  };
}

async function preflightHypeMemberGroups(env) {
  const botToken = clean(env.TELEGRAM_BOT_TOKEN);
  const expectedUsername = botUsername(env).replace(/^@/, "").toLowerCase();
  const standardId = clean(env.TELEGRAM_STANDARD_GROUP_ID);
  const premiumId = clean(env.TELEGRAM_PREMIUM_GROUP_ID);
  if (!botToken) return { ok: false, error: "missing_telegram_bot_token" };
  if (!standardId || !premiumId) return { ok: false, error: "member_group_ids_not_configured" };

  const getMe = await callTelegramBotApi("getMe", null, env);
  const actualUsername = clean(getMe?.result?.username).replace(/^@/, "").toLowerCase();
  const botId = Number(getMe?.result?.id);
  if (getMe?.ok !== true || !Number.isInteger(botId) || actualUsername !== expectedUsername) {
    return {
      ok: false,
      error: "hype_bot_identity_mismatch",
      expected_username: expectedUsername,
      actual_username: actualUsername || null,
    };
  }

  const groups = {};
  for (const [key, chatId] of [["premium", premiumId], ["standard", standardId]]) {
    const chat = await callTelegramBotApi("getChat", { chat_id: chatId }, env);
    if (chat?.ok !== true || clean(chat?.result?.id) !== chatId || !["group", "supergroup"].includes(clean(chat?.result?.type))) {
      return {
        ok: false,
        error: "hype_member_group_preflight_failed",
        failed_group: key,
        stage: "getChat",
        telegram: sanitizeTelegramFailure(chat),
      };
    }

    const member = await callTelegramBotApi("getChatMember", { chat_id: chatId, user_id: botId }, env);
    const membership = clean(member?.result?.status).toLowerCase();
    if (member?.ok !== true || !["creator", "administrator", "member"].includes(membership)) {
      return {
        ok: false,
        error: "hype_member_group_preflight_failed",
        failed_group: key,
        stage: "getChatMember",
        membership: membership || null,
        telegram: sanitizeTelegramFailure(member),
      };
    }

    groups[key] = {
      chat_id: chatId,
      type: clean(chat.result.type),
      membership,
    };
  }

  return {
    ok: true,
    bot: { id: botId, username: actualUsername },
    groups,
    summary: {
      bot_verified: true,
      premium_ready: true,
      standard_ready: true,
    },
  };
}

async function callTelegramBotApi(method, payload, env) {
  const botToken = clean(env.TELEGRAM_BOT_TOKEN);
  if (!botToken) return { ok: false, error: { description: "missing_telegram_bot_token" } };

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, payload
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    : { method: "GET" });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) {
    return {
      ok: false,
      status: response.status,
      error: data || { description: "telegram_api_error" },
    };
  }
  return { ok: true, result: data.result };
}

function sanitizeTelegramFailure(value) {
  return {
    ok: value?.ok === true,
    status: Number(value?.status) || null,
    description: clean(value?.error?.description || value?.reason || value?.error || "").slice(0, 180) || null,
  };
}

function hypeMemberIntroText(groupLabel) {
  return [
    "👋 <b>สวัสดีครับ ผม HYPE</b>",
    `ผู้ช่วย Telegram ของ MMD Privé ประจำห้อง <b>${escapeHtml(groupLabel)}</b>`,
    "",
    "ตั้งแต่วันนี้ ถ้าต้องการเช็กทางไป หรือให้ผมช่วยดูว่าต้องทำอะไรต่อ เรียกผมได้เลยครับ",
    "",
    "<b>ใช้ในกลุ่มนี้ได้</b>",
    "<b>/commands</b> — ดูคำสั่งทั้งหมดที่ผมช่วยได้",
    "<b>/points</b> — ไปที่ MY MMD · Points",
    "<b>/coupons</b> — เปิด Coupon Wallet",
    "<b>/careback</b> — ดู 6 YEARS CARE BACK · Phase 2",
    "",
    "<b>เรื่องส่วนตัว</b>",
    "<b>/status</b> — สถานะสมาชิก / งาน / การชำระ",
    "<b>/next</b> — ตอนนี้ต้องทำอะไรต่อ",
    "<b>/booking</b> — progress งานและการจอง",
    "",
    "ถ้าพิมพ์คำสั่งส่วนตัวในกลุ่ม ผมจะไม่เปิดข้อมูลตรงนี้ครับ ผมจะพาไปคุยกันในแชตส่วนตัวแทน 🔒",
    "",
    "ผมอ่านจากระบบ MMD ที่ยืนยันได้เท่านั้น ไม่เดาสถานะ และไม่เปลี่ยนสิทธิ์หรือยืนยันงานแทน MMD/Per ครับ",
    "",
    "เริ่มเรียกผมได้เลยครับ → <b>/commands</b>",
  ].join("\n");
}

function hypeMemberIntroButtons(env) {
  return {
    inline_keyboard: [
      [{ text: "คุยกับ HYPE แบบส่วนตัว", url: `https://t.me/${encodeURIComponent(botUsername(env))}` }],
      [
        { text: "MY MMD", url: publicUrl(env, "/my-mmd/") },
        { text: "Booking", url: publicUrl(env, "/booking") },
      ],
    ],
  };
}

function requireHypeMemberGroupIntroToken(req, env) {
  const expected = clean(env.HYPE_MEMBER_GROUP_INTRO_TOKEN);
  if (!expected) {
    throw new HttpError(503, { ok: false, error: "hype_member_group_intro_disabled" });
  }
  const header = clean(req.headers.get("Authorization"));
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1] || clean(req.headers.get("X-HYPE-Intro-Token"));
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

  const hypeCommand = parseHypeOperatingCommand(text);
  if (hypeCommand) {
    return handleHypeOperatingCommand({ message, chatId, command: hypeCommand }, env);
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

async function handleHypeOperatingCommand({ message, chatId, command }, env) {
  if (command === "help") {
    const group = configuredMemberGroup(chatId, env);
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: group ? hypeMemberGroupCommandText(group) : hypeHelpText(),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: group ? hypeMemberGroupCommandButtons(env) : hypeHelpButtons(env),
    }, env);
    return {
      handled: true,
      flow: group ? "hype_member_group_commands" : "hype_operating_help",
      group: group || null,
      telegram,
    };
  }

  if (command === "points" || command === "coupons" || command === "careback") {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: hypeCanonicalRouteText(command),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: hypeCanonicalRouteButtons(env, command),
    }, env);
    return { handled: true, flow: `hype_operating_${command}_route`, telegram };
  }

  if (clean(message.chat?.type).toLowerCase() !== "private") {
    const telegram = await sendTelegramMessage({
      chat_id: chatId,
      text: "สถานะบัญชีเป็นข้อมูลส่วนตัวครับ กรุณาเปิดแชตส่วนตัวกับ HYPE แล้วพิมพ์ /status, /next หรือ /booking\n\nในกลุ่มนี้พิมพ์ /commands เพื่อดูคู่มือคำสั่งได้ครับ",
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
          type: command === "booking" ? "booking" : "general",
          trigger: command === "next" ? "telegram_next" : command === "booking" ? "telegram_booking" : "telegram_status",
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
      : renderHypeOperatingStatus(result, { nextOnly: command === "next" }),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: command === "booking" ? hypeBookingButtons(env, result) : hypeStatusButtons(env, result),
  }, env);

  return {
    handled: true,
    flow: command === "next" ? "hype_operating_next" : command === "booking" ? "hype_operating_booking" : "hype_operating_status",
    ok: true,
    readiness: clean(result.readiness || result.state),
    telegram,
  };
}

function parseHypeOperatingCommand(value) {
  const text = clean(value);
  const normalized = text.toLowerCase();
  if (/^\/status(?:@\w+)?$/i.test(text) || ["สถานะ", "เช็กสถานะ", "ดูสถานะ"].includes(normalized)) return "status";
  if (/^\/next(?:@\w+)?$/i.test(text) || ["ต้องทำอะไรต่อ", "ทำอะไรต่อ", "ขั้นตอนต่อไป"].includes(normalized)) return "next";
  if (/^\/booking(?:@\w+)?$/i.test(text) || ["การจอง", "เช็กการจอง", "เช็กงาน", "งานของฉัน"].includes(normalized)) return "booking";
  if (/^\/points?(?:@\w+)?$/i.test(text) || ["แต้ม", "คะแนน", "ดูคะแนน", "ดูแต้ม"].includes(normalized)) return "points";
  if (/^\/coupons?(?:@\w+)?$/i.test(text) || ["คูปอง", "ดูคูปอง", "คูปองของฉัน"].includes(normalized)) return "coupons";
  if (/^\/careback(?:@\w+)?$/i.test(text) || ["care back", "careback", "โปร 6 ปี", "โปรโมชัน 6 ปี"].includes(normalized)) return "careback";
  if (/^\/(?:help|commands)(?:@\w+)?$/i.test(text) || ["ช่วยอะไรได้บ้าง", "hype ช่วยอะไรได้บ้าง", "คำสั่ง", "ดูคำสั่ง", "commands"].includes(normalized)) return "help";
  return "";
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
  if (command === "points") {
    return [
      "<b>HYPE · POINTS</b>",
      "",
      "ยอด Points ที่เป็นทางการอ่านจาก MMD — Points Ledger ผ่าน MY MMD ครับ",
      "HYPE จะไม่ทำสำเนายอดใน Telegram เพื่อไม่ให้ยอดคลาดเคลื่อนจากระบบจริง",
      "",
      "กด <b>MY MMD · Points</b> ด้านล่างเพื่อดูยอดและประวัติที่ยืนยันแล้วได้เลยครับ",
    ].join("\n");
  }
  if (command === "coupons") {
    return [
      "<b>HYPE · COUPONS</b>",
      "",
      "คูปองที่พร้อมใช้ / ใช้แล้ว / หมดอายุ ให้ยึด Coupon Wallet ใน MY MMD เป็นตัวจริงครับ",
      "สำหรับ CARE BACK Phase 2 ต้องเชื่อมสิทธิ์และ Birthday Wish ตาม policy ก่อนคูปองจะพร้อมใช้",
      "",
      "กด <b>MY MMD · Coupons</b> เพื่อดูสถานะล่าสุดได้เลยครับ",
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
  if (id === clean(env.TELEGRAM_PREMIUM_GROUP_ID || "-1001668261779")) return "premium";
  if (id === clean(env.TELEGRAM_STANDARD_GROUP_ID || "-1002073919780")) return "standard";
  return "";
}

function hypeMemberGroupCommandText(group) {
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

function hypeMemberGroupCommandButtons(env) {
  return {
    inline_keyboard: [
      [{ text: "คุยกับ HYPE แบบส่วนตัว", url: `https://t.me/${encodeURIComponent(botUsername(env))}` }],
      [
        { text: "MY MMD", url: publicUrl(env, "/my-mmd/") },
        { text: "Booking", url: publicUrl(env, "/booking") },
      ],
      [
        { text: "Points", url: publicUrl(env, "/my-mmd/points") },
        { text: "Coupons", url: publicUrl(env, "/my-mmd/coupons") },
      ],
    ],
  };
}

function hypeHelpText() {
  return [
    "<b>HYPE · Telegram Operating Concierge</b>",
    "",
    "<b>/status</b> — ดูสถานะสมาชิก งาน และการชำระ",
    "<b>/next</b> — ดูว่าตอนนี้ต้องทำอะไรต่อ",
    "<b>/booking</b> — ดู progress งาน/การจองที่ระบบยืนยันได้",
    "<b>/points</b> — ไปยังยอด Points canonical ใน MY MMD",
    "<b>/coupons</b> — ไปยัง Coupon Wallet canonical ใน MY MMD",
    "<b>/careback</b> — ดู CARE BACK Phase 2",
    "<b>/help</b> — ดูเมนูนี้",
    "",
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

function isHypeMemberGroupIntroPath(path) {
  return path === "/telegram/internal/member-groups/introduce-hype"
    || path === "/v1/internal/member-groups/introduce-hype";
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
