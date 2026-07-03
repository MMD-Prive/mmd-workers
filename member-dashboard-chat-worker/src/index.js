const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const WORKER_NAME = "member-dashboard-chat-worker";

const LINE_WEBHOOK_PATHS = new Set([
  "/webhooks/line",
  "/webhooks/line/",
  "/webhook/line",
  "/webhook/line/",
]);

const PUBLIC_MENU_TEXT = [
  "MMD Member Help",
  "Open the member area from the official MMD link.",
  "Payment proof is supporting evidence only until MMD completes official verification.",
  "Dashboard and private actions stay locked until trusted worker state allows them.",
].join("\n");

const PRIVATE_MARKERS = [
  /airtable/gi,
  /record[_\s-]?id/gi,
  /secret/gi,
  /token/gi,
  /authorization/gi,
  /bearer/gi,
  /payment[_\s-]?internal/gi,
  /risk[_\s-]?flag/gi,
  /vip|svip|black\s*card/gi,
  /session[_\s-]?internal/gi,
  /telegram|gmail|r2|kv/gi,
];

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": WORKER_NAME,
    },
  });
}

function asString(value) {
  return String(value || "").trim();
}

function isEnabled(value) {
  return /^(1|true|yes|on)$/i.test(asString(value));
}

function hasTrustedEvent(input = {}, request = null) {
  const header = asString(request?.headers?.get("X-MMD-Trusted-Event")).toLowerCase();
  return input.trusted_event === true || header === "true" || header === "1";
}

function getBearerToken(request = null) {
  const auth = asString(request?.headers?.get("Authorization"));
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return asString(match?.[1]);
}

function hasInternalAuth(request = null, env = {}) {
  const bearer = getBearerToken(request);
  const confirmKey = asString(request?.headers?.get("X-Confirm-Key"));
  const expectedInternalToken = asString(env.INTERNAL_TOKEN);
  const expectedConfirmKey = asString(env.CONFIRM_KEY);

  return Boolean(
    (expectedInternalToken && bearer && bearer === expectedInternalToken) ||
      (expectedConfirmKey && confirmKey && confirmKey === expectedConfirmKey),
  );
}

function sanitizeLineText(value) {
  let text = asString(value);
  for (const marker of PRIVATE_MARKERS) text = text.replace(marker, "[redacted]");
  text = text.replace(/rec[a-zA-Z0-9]{10,}/g, "[redacted]");
  text = text.replace(/pat[a-zA-Z0-9._-]{10,}/g, "[redacted]");
  text = text.replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[redacted]");
  return text.slice(0, 1600);
}

function base64Encode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(binary, "binary").toString("base64");
}

function timingSafeEqual(a, b) {
  const left = asString(a);
  const right = asString(b);
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function signLineBody(secret, rawBody) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return base64Encode(new Uint8Array(signature));
}

async function verifyLineSignature(request, env, rawBody) {
  const secret = asString(env.LINE_CHANNEL_SECRET);
  if (!secret) return { ok: false, status: 500, error: "line_channel_secret_missing" };

  const provided = asString(request.headers.get("x-line-signature"));
  if (!provided) return { ok: false, status: 401, error: "line_signature_missing" };

  const expected = await signLineBody(secret, rawBody);
  if (!timingSafeEqual(expected, provided)) {
    return { ok: false, status: 401, error: "invalid_line_signature" };
  }

  return { ok: true };
}

export function getLineUserId(input = {}) {
  const candidates = [
    input.line_user_id,
    input.lineUserId,
    input.user_id,
    input.userId,
    input.event?.source?.userId,
    input.source?.userId,
  ];

  for (const candidate of candidates) {
    const value = asString(candidate);
    if (/^U[a-f0-9]{32}$/i.test(value)) return value;
  }

  return "";
}

function getLineText(event = {}) {
  if (event.type === "message" && event.message?.type === "text") {
    return asString(event.message.text);
  }
  if (event.type === "postback") return asString(event.postback?.data);
  return "";
}

function inferLineIntent(event = {}) {
  const text = getLineText(event).toLowerCase();
  if (!text && event.type === "follow") return "new_follow";
  if (/สลิป|slip|paid|payment|จ่าย|โอน/.test(text)) return "payment_slip";
  if (/black\s*card|svip|vip/.test(text)) return "vip_blackcard";
  if (/จอง|booking|book|นัด|schedule/.test(text)) return "booking_intake";
  if (/ต่ออายุ|renew|membership|member|สมาชิก/.test(text)) return "membership_question";
  if (/เคนจิ|kenji|hi|hello|สวัสดี|คุยกับ/.test(text)) return "greeting";
  return event.type || "line_event";
}

function buildAirtableUrl(env = {}) {
  const baseId = asString(env.AIRTABLE_BASE_ID);
  const tableName = asString(env.AIRTABLE_SYNC_TABLE) || "MMD — Console Inbox";
  if (!baseId || !tableName) return "";
  return `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`;
}

function buildInboxId(event = {}) {
  const messageId = asString(event.message?.id);
  const webhookEventId = asString(event.webhookEventId);
  const suffix = messageId || webhookEventId || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `line_${suffix}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
}

async function writeLineEventToAirtable(env = {}, event = {}, profile = {}) {
  const apiKey = asString(env.AIRTABLE_API_KEY);
  const url = buildAirtableUrl(env);
  if (!apiKey || !url) return { ok: false, skipped: "airtable_not_configured" };

  const text = sanitizeLineText(getLineText(event));
  const intent = inferLineIntent(event);
  const lineUserId = getLineUserId(event);
  const payload = {
    route: "/webhooks/line",
    worker: WORKER_NAME,
    event_type: event.type || "unknown",
    message_type: event.message?.type || "",
    reply_token_present: Boolean(event.replyToken),
    text_preview: text.slice(0, 200),
    profile,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        inbox_id: buildInboxId(event),
        source: "line",
        intent,
        line_user_id: lineUserId,
        line_id: lineUserId,
        admin_note: text || `LINE ${event.type || "event"}`,
        payload_json: JSON.stringify(payload),
        status: "received",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return { ok: false, error: "airtable_write_failed", status: response.status, detail: errorText.slice(0, 300) };
  }

  const result = await response.json().catch(() => ({}));
  return { ok: true, id: result.id || "" };
}

export async function deliverLineText(env = {}, lineUserId, text, options = {}) {
  const token = asString(env.LINE_CHANNEL_ACCESS_TOKEN);
  const to = asString(lineUserId);
  const safeText = sanitizeLineText(text);

  if (!options.trusted_event) return { ok: false, error: "trusted_event_required" };
  if (!token) return { ok: false, error: "line_token_missing" };
  if (!to) return { ok: false, error: "line_user_id_missing" };
  if (!safeText) return { ok: false, error: "line_text_missing" };

  const response = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text: safeText }],
    }),
  });

  if (!response.ok) {
    return { ok: false, error: "line_push_failed", status: response.status };
  }

  return { ok: true, status: response.status };
}

async function replyLineText(env = {}, replyToken, text) {
  const token = asString(env.LINE_CHANNEL_ACCESS_TOKEN);
  const safeReplyToken = asString(replyToken);
  const safeText = sanitizeLineText(text);

  if (!token || !safeReplyToken || !safeText) return { ok: false, skipped: "line_reply_not_configured" };

  const response = await fetch(LINE_REPLY_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      replyToken: safeReplyToken,
      messages: [{ type: "text", text: safeText }],
    }),
  });

  if (!response.ok) return { ok: false, error: "line_reply_failed", status: response.status };
  return { ok: true, status: response.status };
}

function buildSafeAutoReply(intent) {
  if (intent === "greeting" || intent === "new_follow") {
    return "สวัสดีครับ ผม Kenji จาก MMD Privé รับเรื่องให้แล้วครับ หากเป็นการจอง งานสมาชิก หรือส่งหลักฐานชำระเงิน ทีมจะตรวจสอบก่อนยืนยันทุกครั้งครับ";
  }
  if (intent === "booking_intake") {
    return "รับเรื่องจองแล้วครับ รบกวนแจ้งวัน เวลาโดยประมาณ ระยะเวลา และพื้นที่ที่สะดวก ทีมจะตรวจสอบสถานะสมาชิก เงื่อนไข และความพร้อมก่อนยืนยันครับ";
  }
  return "";
}

export async function deliverLinePublicMenu(env = {}, lineUserId, options = {}) {
  return deliverLineText(env, lineUserId, PUBLIC_MENU_TEXT, options);
}

export async function pushLinePublicMenu(input = {}, env = {}, request = null) {
  const trusted = hasTrustedEvent(input, request);
  if (!trusted) return { ok: false, error: "trusted_event_required" };

  const lineUserId = getLineUserId(input);
  if (!lineUserId) return { ok: false, error: "line_user_id_missing" };

  return deliverLinePublicMenu(env, lineUserId, { trusted_event: true });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    return null;
  }
}

async function handleLineWebhook(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const rawBody = await request.text();
  const signature = await verifyLineSignature(request, env, rawBody);
  if (!signature.ok) return json({ ok: false, error: signature.error }, signature.status);

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (_) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const events = Array.isArray(body.events) ? body.events : [];
  const processed = [];

  for (const event of events) {
    const intent = inferLineIntent(event);
    const airtable = await writeLineEventToAirtable(env, event).catch((error) => ({
      ok: false,
      error: "airtable_exception",
      detail: String(error?.message || error || "unknown").slice(0, 300),
    }));

    let reply = { ok: false, skipped: "auto_reply_disabled" };
    if (isEnabled(env.LINE_AUTO_REPLY_ENABLED)) {
      const text = buildSafeAutoReply(intent);
      if (text) reply = await replyLineText(env, event.replyToken, text);
    }

    processed.push({
      type: event.type || "unknown",
      intent,
      airtable_ok: Boolean(airtable.ok),
      reply_ok: Boolean(reply.ok),
      error: airtable.ok ? undefined : airtable.error || airtable.skipped,
    });
  }

  return json({ ok: true, events: events.length, processed });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, worker: WORKER_NAME });
    }

    if (LINE_WEBHOOK_PATHS.has(url.pathname)) {
      return handleLineWebhook(request, env);
    }

    if (request.method === "POST" && url.pathname === "/v1/internal/line/public-menu-fallback") {
      if (!hasInternalAuth(request, env)) return json({ ok: false, error: "internal_auth_required" }, 401);

      const body = await readJson(request);
      if (!body || typeof body !== "object") return json({ ok: false, error: "invalid_json" }, 400);

      const result = await pushLinePublicMenu(body, env, request);
      return json(result, result.ok ? 200 : 400);
    }

    return json({ ok: false, error: "not_found" }, 404);
  },
};
