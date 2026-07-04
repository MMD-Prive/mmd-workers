const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const LINE_PROFILE_BASE_URL = "https://api.line.me/v2/bot/profile";
const WORKER_NAME = "member-dashboard-chat-worker";
const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"]);
const DEFAULT_SYNC_TABLE = "MMD — Console Inbox";

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
  return ["1", "true", "yes", "on"].includes(asString(value).toLowerCase());
}

function getHeader(headers, name) {
  return asString(headers?.get?.(name));
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
  return text.slice(0, 1600);
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function timingSafeStringEqual(a, b) {
  const left = asString(a);
  const right = asString(b);
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export async function createLineSignature(rawBody, channelSecret) {
  const secret = asString(channelSecret);
  if (!secret) return "";
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(String(rawBody || "")));
  return bytesToBase64(signature);
}

export async function verifyLineSignature(rawBody, signature, channelSecret) {
  const expected = await createLineSignature(rawBody, channelSecret);
  return timingSafeStringEqual(expected, signature);
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

function getReplyToken(event = {}) {
  return asString(event.replyToken);
}

function getLineEventText(event = {}) {
  if (event?.type === "message" && event?.message?.type === "text") return asString(event.message.text);
  if (event?.type === "postback") return asString(event?.postback?.displayText || event?.postback?.data);
  return "";
}

function getLineEventId(event = {}) {
  return asString(event?.message?.id || event?.webhookEventId || event?.replyToken || `evt_${Date.now()}`);
}

function normalizeLookup(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[._\-]+/g, " ")
    .replace(/[^a-z0-9ก-๙\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactLookup(value) {
  return normalizeLookup(value).replace(/\s+/g, "");
}

export function isKenjiLineCandidate(text = "") {
  const compact = compactLookup(text);
  const spaced = normalizeLookup(text);
  return Boolean(
    compact.includes("kenji") ||
      compact.includes("เคนจิ") ||
      compact.includes("hiper") ||
      compact.includes("helloper") ||
      compact.includes("perai") ||
      compact.includes("เปอร์ai") ||
      compact.includes("เปอร์เอไอ") ||
      compact.includes("สวัสดีเปอร์") ||
      compact.includes("คุยกับเปอร์") ||
      compact.includes("คุยกับเคนจิ") ||
      compact.includes("ขอคุยกับเปอร์") ||
      compact.includes("ติดต่อเปอร์") ||
      /\b(?:hi|hello)\s+per\b/i.test(spaced),
  );
}

export function inferLineIntent(text = "", event = {}) {
  const normalized = normalizeLookup(text);
  if (!normalized) {
    if (event?.type === "follow") return "new_follow";
    if (event?.type === "postback") return "postback";
    return "line_event";
  }

  if (isKenjiLineCandidate(text)) return "talk_to_per_ai";
  if (/(สลิป|โอน|จ่าย|ชำระ|payment|paid|slip)/i.test(normalized)) return "payment_slip";
  if (/(แต้ม|คะแนน|point|points)/i.test(normalized)) return "points";
  if (/(svip|s vip|super\s*vip)/i.test(normalized)) return "svip";
  if (/(black\s*card|แบล็คการ์ด|บัตรดำ)/i.test(normalized)) return "black_card";
  if (/(vip|วีไอพี)/i.test(normalized)) return "vip";
  if (/(จอง|book|booking|คิว|นัด|reserve)/i.test(normalized)) return "create_session";
  if (/(สมัคร|member|สมาชิก|renew|ต่ออายุ|upgrade|อัปเกรด|อัพเกรด)/i.test(normalized)) return "membership";
  if (/(ราคา|price|rate|เรท|promotion|โปร|package|แพ็กเกจ|แพคเกจ|เท่าไร|เท่าไหร่)/i.test(normalized)) {
    return "pricing_review";
  }
  if (/(สวัสดี|hello|hi|hey)/i.test(normalized)) return "greeting";
  return "note_only";
}

function buildGenericAck(prefix = "") {
  return `รับข้อความแล้วครับ ${prefix}Kenji ส่งเข้าระบบ MMD แล้วครับ เดี๋ยวทีมงานตรวจสอบและตอบกลับให้นะครับ`;
}

export function buildKenjiLineReply(event = {}, profile = {}, options = {}) {
  const text = getLineEventText(event);
  const intent = inferLineIntent(text, event);
  const name = asString(profile?.displayName).split(/\s+/).filter(Boolean)[0] || "";
  const prefix = name ? `คุณ${name} ` : "";

  if (event?.type === "follow") {
    return `สวัสดีครับ ${prefix}ยินดีต้อนรับสู่ MMD Privé พิมพ์เรื่องที่ต้องการให้ช่วยได้เลยครับ เช่น จองงาน เช็กราคา เช็กนายแบบ หรือเรื่องสมาชิก`;
  }

  if (intent === "talk_to_per_ai") {
    return `สวัสดีครับ ${prefix}ผมคือ Kenji AI ของ MMD Privé ครับ\n\nผมช่วยรับเรื่อง จัดข้อมูลเบื้องต้น และส่งให้ Per ตรวจสอบเมื่อเป็นเคสที่ต้องดูเป็นพิเศษครับ\n\nตอนนี้อยากให้ผมช่วยเรื่องไหนก่อนครับ\n1) สมัครสมาชิกหรือต่ออายุ\n2) เช็กแพ็กเกจหรือสถานะสมาชิก\n3) สอบถามบริการหรือนายแบบ\n4) ส่งรูปหรือโปรไฟล์ให้ MMD พิจารณา\n5) ให้ Per ดูเป็นเคสส่วนตัว`;
  }

  if (intent === "payment_slip") {
    return `รับหลักฐานไว้ให้ระบบตรวจรายการแล้วครับ ${prefix}หลักฐานการชำระเงินเป็นข้อมูลประกอบการตรวจสอบ สถานะจะอัปเดตหลังยอดจริงถูกตรวจสอบเรียบร้อยแล้วครับ`;
  }

  if (intent === "points") {
    return `รับเรื่องคะแนนสมาชิกแล้วครับ ${prefix}เดี๋ยวส่งให้ระบบตรวจยอดและประวัติที่เกี่ยวข้องก่อนแจ้งสถานะที่ถูกต้องครับ`;
  }

  if (intent === "vip" || intent === "svip" || intent === "black_card") {
    return `รับเรื่องระดับสมาชิกพิเศษแล้วครับ ${prefix}เคสนี้ต้องให้ Per ตรวจสอบเป็นรอบส่วนตัวก่อน ไม่มีการอนุมัติอัตโนมัติจากข้อความในแชตครับ`;
  }

  if (intent === "create_session") {
    return `รับเรื่องจองงานแล้วครับ ${prefix}ผมช่วยจัดข้อมูลเบื้องต้นให้ได้ แต่ต้องตรวจสถานะสมาชิก เงื่อนไข และความพร้อมของนายแบบก่อนยืนยันทุกครั้งครับ`;
  }

  if (intent === "membership") {
    return `รับเรื่องสมาชิกแล้วครับ ${prefix}เดี๋ยวช่วยจัดข้อมูลให้ระบบตรวจสอบก่อนแจ้งขั้นตอนที่เหมาะสมต่อไปครับ`;
  }

  if (intent === "pricing_review") {
    return `สอบถามเรทกับผมตรงนี้ได้เลยครับ ${prefix}เดี๋ยวส่งให้ทีมตรวจสอบรายละเอียดที่เหมาะสมก่อนแจ้งกลับนะครับ ถ้าสะดวก แจ้งวัน เวลา โซน และระยะเวลาที่ต้องการไว้ได้เลยครับ`;
  }

  if (intent === "greeting") {
    return `สวัสดีครับ ${prefix}ต้องการสอบถามเรื่องจองงาน ราคา เช็กนายแบบ หรือสมาชิก พิมพ์มาได้เลยนะครับ`;
  }

  if (options.forceReply || text) return buildGenericAck(prefix);
  return "";
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

export async function deliverLinePublicMenu(env = {}, lineUserId, options = {}) {
  return deliverLineText(env, lineUserId, PUBLIC_MENU_TEXT, options);
}

async function sendLineReply(env = {}, replyToken, text, options = {}) {
  const token = asString(env.LINE_CHANNEL_ACCESS_TOKEN);
  const safeText = sanitizeLineText(text);
  const reply = asString(replyToken);

  if (!options.trusted_event) return { ok: false, error: "trusted_event_required" };
  if (!token) return { ok: false, error: "line_token_missing" };
  if (!reply) return { ok: false, error: "reply_token_missing" };
  if (!safeText) return { ok: false, error: "line_text_missing" };

  const response = await fetch(LINE_REPLY_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      replyToken: reply,
      messages: [{ type: "text", text: safeText }],
    }),
  });

  if (!response.ok) return { ok: false, error: "line_reply_failed", status: response.status };
  return { ok: true, status: response.status };
}

async function fetchLineProfile(env = {}, userId = "") {
  const token = asString(env.LINE_CHANNEL_ACCESS_TOKEN);
  const id = asString(userId);
  if (!token || !id) return null;

  try {
    const response = await fetch(`${LINE_PROFILE_BASE_URL}/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });

    if (!response.ok) return null;
    return response.json().catch(() => null);
  } catch (_) {
    return null;
  }
}

function getAirtableTable(env = {}) {
  return asString(env.AIRTABLE_SYNC_TABLE || env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || DEFAULT_SYNC_TABLE);
}

function encodeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function findExistingLineEvent(env = {}, eventId = "", inboxId = "") {
  const apiKey = asString(env.AIRTABLE_API_KEY);
  const baseId = asString(env.AIRTABLE_BASE_ID);
  const table = getAirtableTable(env);
  if (!apiKey || !baseId || !table || (!eventId && !inboxId)) return null;

  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set(
    "filterByFormula",
    `OR({line_id}=\"${encodeFormulaValue(eventId)}\",{inbox_id}=\"${encodeFormulaValue(inboxId)}\")`,
  );

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.records) ? payload.records[0] || null : null;
}

function buildConsoleInboxRecord(event = {}, profile = null, intent = "") {
  const eventId = getLineEventId(event);
  const inboxId = `line_${eventId}`;
  const text = getLineEventText(event);
  const lineUserId = getLineUserId({ event });

  return {
    fields: {
      inbox_id: inboxId,
      source: "line",
      intent: intent || inferLineIntent(text, event),
      member_name: asString(profile?.displayName),
      line_user_id: lineUserId,
      line_id: eventId,
      admin_note: text || `[${event?.type || "unknown"}] LINE event`,
      payload_json: JSON.stringify({
        source_channel: "line",
        source_user_id: lineUserId,
        source_message_id: eventId,
        received_at: new Date().toISOString(),
        parsed_intent: intent || inferLineIntent(text, event),
        raw_text: text,
      }),
      status: "new",
    },
  };
}

async function writeLineEventToConsoleInbox(env = {}, event = {}, profile = null, intent = "") {
  const apiKey = asString(env.AIRTABLE_API_KEY);
  const baseId = asString(env.AIRTABLE_BASE_ID);
  const table = getAirtableTable(env);
  const eventId = getLineEventId(event);
  const inboxId = `line_${eventId}`;

  if (!apiKey || !baseId || !table) {
    return { skipped: true, reason: "airtable_env_missing", deduped: false };
  }

  const existing = await findExistingLineEvent(env, eventId, inboxId);
  if (existing?.id) return { id: existing.id, deduped: true };

  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(buildConsoleInboxRecord(event, profile, intent)),
  });

  if (!response.ok) return { skipped: true, reason: "airtable_write_failed", status: response.status, deduped: false };
  const payload = await response.json().catch(() => ({}));
  return { id: payload?.id || "", deduped: false };
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
  const rawBody = await request.text();
  const signature = getHeader(request.headers, "x-line-signature");
  const validSignature = await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET);

  if (!validSignature) return json({ ok: false, error: "invalid_signature" }, 401);

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (_) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const events = Array.isArray(body.events) ? body.events : [];
  const autoReplyEnabled = isEnabled(env.LINE_AUTO_REPLY_ENABLED);
  const kenjiEnabled = isEnabled(env.LINE_KENJI_AI_ENABLED);
  const saved = [];

  for (const event of events) {
    const text = getLineEventText(event);
    const lineUserId = getLineUserId({ event });
    const intent = inferLineIntent(text, event);
    const shouldFetchProfile = Boolean(autoReplyEnabled && lineUserId && event?.source?.type === "user" && asString(env.LINE_CHANNEL_ACCESS_TOKEN));
    const profile = shouldFetchProfile ? await fetchLineProfile(env, lineUserId) : null;
    const record = await writeLineEventToConsoleInbox(env, event, profile, intent);
    const replyText = kenjiEnabled ? buildKenjiLineReply(event, profile, { forceReply: autoReplyEnabled }) : "";
    const shouldReply = Boolean(autoReplyEnabled && !record?.deduped && replyText && getReplyToken(event));
    const replyResult = shouldReply ? await sendLineReply(env, getReplyToken(event), replyText, { trusted_event: true }) : null;

    saved.push({
      ok: true,
      type: event?.type || "",
      intent,
      deduped: Boolean(record?.deduped),
      recorded: Boolean(record?.id),
      record_skipped: Boolean(record?.skipped),
      replied: Boolean(replyResult?.ok),
      line_user: Boolean(lineUserId),
      message_id: getLineEventId(event),
    });
  }

  return json({ ok: true, worker: WORKER_NAME, route: "line_webhook", events: events.length, saved });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, worker: WORKER_NAME });
    }

    if (request.method === "GET" && LINE_WEBHOOK_PATHS.has(url.pathname)) {
      return json({ ok: true, worker: WORKER_NAME, route: "line_webhook" });
    }

    if (request.method === "POST" && LINE_WEBHOOK_PATHS.has(url.pathname)) {
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
