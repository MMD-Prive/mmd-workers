import { maybeBuildKenjiKnowledgeReply } from "./kenji-knowledge-adapter.js";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const LINE_PROFILE_BASE_URL = "https://api.line.me/v2/bot/profile";
const LINE_RICH_MENU_LINK_URL = "https://api.line.me/v2/bot/user";
const LINE_RICH_MENU_API_URL = "https://api.line.me/v2/bot/richmenu";
const LINE_RICH_MENU_DATA_URL = "https://api-data.line.me/v2/bot/richmenu";
const LINE_DEFAULT_RICH_MENU_URL = "https://api.line.me/v2/bot/user/all/richmenu";
const WORKER_NAME = "member-dashboard-chat-worker";
const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"]);
const LINE_RICH_MENU_SYNC_PATH = "/v1/internal/line/rich-menu/sync";
const LINE_RICH_MENU_PUBLIC_WORLD_BASE_PATH = "/v1/internal/line/rich-menu/public-world";
const LINE_RICH_MENU_DEFAULT_PATH = "/v1/internal/line/rich-menu/default";
const LINE_RICH_MENU_LIST_PATH = "/v1/internal/line/rich-menu/list";
const SERVICE_LINE_RICH_MENU_PUBLIC_WORLD_BASE_PATH = "/__internal/line/rich-menu/public-world";
const SERVICE_LINE_RICH_MENU_PRIVATE_MEMBER_BASE_PATH = "/__internal/line/rich-menu/private-member";
const SERVICE_LINE_RICH_MENU_DEFAULT_PATH = "/__internal/line/rich-menu/default";
const SERVICE_LINE_RICH_MENU_LIST_PATH = "/__internal/line/rich-menu/list";
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

function hasBearerInternalAuth(request = null, env = {}) {
  const bearer = getBearerToken(request);
  const expectedInternalToken = asString(env.INTERNAL_TOKEN);
  return Boolean(expectedInternalToken && bearer && bearer === expectedInternalToken);
}

function hasServiceBindingAuth(request = null, allowedCallers = []) {
  const service = asString(request?.headers?.get("x-mmd-service-binding"));
  const internal = asString(request?.headers?.get("x-mmd-internal-call")).toLowerCase();
  let serviceHost = "";
  try {
    serviceHost = new URL(request.url).hostname;
  } catch (_) {
    serviceHost = "";
  }
  return serviceHost === "member-dashboard-chat-worker.local" && internal === "true" && allowedCallers.includes(service);
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

function getLineRawEventText(event = {}) {
  if (event?.type === "message" && event?.message?.type === "text") return String(event.message.text || "");
  if (event?.type === "postback") return String(event?.postback?.displayText || event?.postback?.data || "");
  return "";
}

function getLineEventId(event = {}) {
  return asString(event?.message?.id || event?.webhookEventId || event?.replyToken || `evt_${Date.now()}`);
}

function getLineMessageType(event = {}) {
  return asString(event?.message?.type || "");
}

function getLineSourceType(event = {}) {
  return asString(event?.source?.type || "");
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

export function normalizeLinePublicTriggerText(text = "") {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getLinePublicTriggerDiagnostics(text = "") {
  const raw = String(text || "");
  const normalized = normalizeLinePublicTriggerText(raw);
  return {
    normalized_length: normalized.length,
    raw_length: raw.length,
    has_zero_width: /[\u200B\u200C\u200D\uFEFF]/.test(raw),
    has_leading_or_trailing_space: raw !== raw.trim(),
    has_repeated_space: /\s{2,}/.test(raw.replace(/[\u200B\u200C\u200D\uFEFF]/g, "")),
  };
}

function getPublicTriggerCategory(text = "") {
  const spaced = normalizeLinePublicTriggerText(text);
  const compact = spaced.replace(/\s+/g, "");
  if (
    compact === "per" ||
    compact === "hiper" ||
    compact === "helloper" ||
    compact === "คุยกับเปอร์" ||
    compact === "คุยกับเปอร์ครับ" ||
    compact === "คุยกับper" ||
    compact === "คุยกับperครับ" ||
    /\b(?:hi|hello)\s+per\b/i.test(spaced)
  ) {
    return "public_per";
  }
  if (compact === "himmd" || compact === "himmdforenglish" || compact === "english") return "public_english";
  return "unknown";
}

function isPublicSafeTriggerCategory(category = "") {
  return category === "public_per" || category === "public_english";
}

function logLinePublicTriggerSkip(details = {}) {
  console.log("line_public_trigger_skip", JSON.stringify({
    reason: asString(details.reason || "unknown"),
    trigger_category: asString(details.trigger_category || "unknown"),
    auto_reply_enabled: Boolean(details.auto_reply_enabled),
    has_source_user: Boolean(details.has_source_user),
    has_reply_text: Boolean(details.has_reply_text),
    is_public_safe_trigger: Boolean(details.is_public_safe_trigger),
    message_type: asString(details.message_type),
    source_type: asString(details.source_type),
    has_channel_token: Boolean(details.has_channel_token),
    deduped: Boolean(details.deduped),
    normalized_length: Number(details.normalized_length || 0),
    raw_length: Number(details.raw_length || 0),
    has_zero_width: Boolean(details.has_zero_width),
    has_leading_or_trailing_space: Boolean(details.has_leading_or_trailing_space),
    has_repeated_space: Boolean(details.has_repeated_space),
  }));
}

function logLineDeliveryResult(name, result = {}) {
  console.log(name, JSON.stringify({ status: Number(result.status || 0) || undefined }));
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

export async function linkRichMenuToUser(env = {}, lineUserId, richMenuId) {
  const token = asString(env.LINE_CHANNEL_ACCESS_TOKEN);
  const userId = asString(lineUserId);
  const menuId = asString(richMenuId);

  if (!token) return { ok: false, error: "line_token_missing" };
  if (!userId) return { ok: false, error: "line_user_id_missing" };
  if (!menuId) return { ok: false, error: "rich_menu_id_missing" };

  const response = await fetch(`${LINE_RICH_MENU_LINK_URL}/${encodeURIComponent(userId)}/richmenu/${encodeURIComponent(menuId)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });

  if (!response.ok) return { ok: false, error: "line_rich_menu_link_failed", status: response.status };
  return { ok: true, status: response.status };
}

export function getRichMenuIdForTarget(env = {}, target) {
  const normalized = asString(target).toLowerCase();
  if (normalized === "public_member") return asString(env.LINE_RICH_MENU_PUBLIC_ID);
  if (normalized === "private_member") return asString(env.LINE_RICH_MENU_PRIVATE_ID || env.LINE_RICH_MENU_MEMBER_ID);
  if (normalized === "renewal") return asString(env.LINE_RICH_MENU_RENEWAL_ID);
  if (normalized === "blackcard") return asString(env.LINE_RICH_MENU_BLACKCARD_ID);
  return "";
}

function normalizeRichMenuState(value) {
  return asString(value)
    .toLowerCase()
    .replace(/[_\s-]+/g, "_");
}

export function resolveRichMenuTarget(input = {}) {
  const membershipState = normalizeRichMenuState(input.membership_state || input.membershipState || input.member_status);
  const packageState = normalizeRichMenuState(input.package_state || input.packageState || input.package_status);
  const tier = normalizeRichMenuState(input.tier || input.member_tier || input.package_tier);

  if (tier === "blackcard" || tier === "black_card") return "blackcard";
  if (membershipState === "expired" || packageState === "expired" || membershipState === "renewal_due") return "renewal";
  if (membershipState === "active" || packageState === "current" || packageState === "active") return "private_member";
  return "public_member";
}

function richMenuBounds(x, y, width, height) {
  return { x, y, width, height };
}

function mmdbkkMembershipUrl(entryRoute, extra = "") {
  return `https://mmdbkk.com/member/membership?source=line&entry_route=${entryRoute}${extra}`;
}

export function createPublicWorldRichMenuDraft() {
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: "MMD Public World",
    chatBarText: "MMD",
    areas: [
      { bounds: richMenuBounds(0, 0, 833, 843), action: { type: "message", text: "Hi Per" } },
      { bounds: richMenuBounds(834, 0, 833, 843), action: { type: "uri", uri: mmdbkkMembershipUrl("public_membership") } },
      { bounds: richMenuBounds(1667, 0, 833, 843), action: { type: "uri", uri: mmdbkkMembershipUrl("member_status") } },
      { bounds: richMenuBounds(0, 843, 833, 843), action: { type: "uri", uri: mmdbkkMembershipUrl("booking_request", "&service=dinner_travel") } },
      { bounds: richMenuBounds(834, 843, 833, 843), action: { type: "uri", uri: "https://mmdbkk.com/pay/membership?source=line&entry_route=payment_proof" } },
      { bounds: richMenuBounds(1667, 843, 833, 843), action: { type: "message", text: "Hi MMD" } },
    ],
  };
}

export const buildPublicWorldRichMenu = createPublicWorldRichMenuDraft;

export function createPrivateMemberRichMenuDraft() {
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: "MMD Private Member",
    chatBarText: "MMD",
    areas: [
      { bounds: richMenuBounds(0, 0, 833, 843), action: { type: "uri", uri: mmdbkkMembershipUrl("member_status") } },
      { bounds: richMenuBounds(834, 0, 833, 843), action: { type: "uri", uri: mmdbkkMembershipUrl("points") } },
      { bounds: richMenuBounds(1667, 0, 833, 843), action: { type: "uri", uri: mmdbkkMembershipUrl("renewal") } },
      {
        bounds: richMenuBounds(0, 843, 833, 843),
        action: {
          type: "postback",
          data: "mmd_action=private_support&source=private_rich_menu",
          displayText: "Private Support",
        },
      },
      { bounds: richMenuBounds(834, 843, 833, 843), action: { type: "uri", uri: "https://mmdbkk.com/pay/membership?source=line&entry_route=payment_proof" } },
      { bounds: richMenuBounds(1667, 843, 833, 843), action: { type: "message", text: "Hi MMD" } },
    ],
  };
}

function buildMinimalPublicWorldRichMenu() {
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: "MMD Public World Minimal",
    chatBarText: "MMD",
    areas: [{ bounds: richMenuBounds(0, 0, 2500, 1686), action: { type: "message", text: "Hi Per" } }],
  };
}

function buildPublicWorldRichMenuVariant(kind = "full") {
  if (kind === "minimal") return buildMinimalPublicWorldRichMenu();
  const draft = buildPublicWorldRichMenu();
  if (kind === "no-postback") {
    return {
      ...draft,
      areas: draft.areas.map((area, index) => (
        area.action.type === "postback" || index === 5 ? { ...area, action: { type: "message", text: "Hi Per" } } : area
      )),
    };
  }
  if (kind === "message-only") {
    return {
      ...draft,
      areas: draft.areas.map((area) => ({ ...area, action: { type: "message", text: "Hi Per" } })),
    };
  }
  if (kind === "uri-only") {
    return {
      ...draft,
      areas: draft.areas.map((area, index) => ({
        ...area,
        action: { type: "uri", uri: mmdbkkMembershipUrl(index === 0 ? "public_membership" : "member_status") },
      })),
    };
  }
  return draft;
}

function requireLineToken(env = {}) {
  const token = asString(env.LINE_CHANNEL_ACCESS_TOKEN);
  if (!token) return { ok: false, error: "line_token_missing" };
  return { ok: true, token };
}

function safeJsonParse(rawBody) {
  try {
    return JSON.parse(rawBody);
  } catch (_) {
    return null;
  }
}

function lineSafeReason(status = 0) {
  if (status === 400) return "payload_invalid";
  if (status === 401 || status === 403) return "line_auth_failed";
  if (status === 404) return "line_resource_missing";
  if ([429, 500, 502, 503, 504].includes(Number(status))) return "line_upstream_unavailable";
  return "line_api_unknown_error";
}

function sanitizeLineErrorExcerpt(rawText = "") {
  let value = asString(rawText);
  value = value.replace(/authorization\s*[:=]\s*bearer\s+[^\s",}]+/gi, "[auth-redacted]");
  value = value.replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[auth-redacted]");
  value = value.replace(/(channel[_\s-]?access[_\s-]?token|secret|token|api[_\s-]?key)\s*[:=]\s*["']?[^"',}\s]+/gi, "[secret-redacted]");
  value = value.replace(/richmenu-[A-Za-z0-9_-]+/gi, "[richmenu-id-redacted]");
  value = value.replace(/U[a-f0-9]{32}/gi, "[line-user-redacted]");
  return value.slice(0, 300);
}

function safeLineApiError(operation, response, rawText = "", options = {}) {
  const status = Number(response?.status || 0);
  const excerpt = options.debug ? sanitizeLineErrorExcerpt(rawText) : "";
  return {
    ok: false,
    error: "line_api_failed",
    operation,
    line_status: status,
    safe_reason: lineSafeReason(status),
    ...(excerpt ? { line_error_excerpt: excerpt } : {}),
  };
}

async function lineApiJson(env = {}, url, init = {}, options = {}) {
  const token = requireLineToken(env);
  if (!token.ok) return token;
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token.token}`,
        "content-type": "application/json",
        ...(init.headers || {}),
      },
    });
    const rawText = await response.text().catch(() => "");
    const data = rawText ? safeJsonParse(rawText) || {} : {};
    if (!response.ok) return safeLineApiError(options.operation || "line_api_json", response, rawText, options);
    return { ok: true, status: response.status, data };
  } catch (_) {
    return { ok: false, error: "line_api_fetch_failed" };
  }
}

async function lineApiRaw(env = {}, url, init = {}, options = {}) {
  const token = requireLineToken(env);
  if (!token.ok) return token;
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token.token}`,
        ...(init.headers || {}),
      },
    });
    const rawText = await response.text().catch(() => "");
    if (!response.ok) return safeLineApiError(options.operation || "line_api_raw", response, rawText, options);
    return { ok: true, status: response.status };
  } catch (_) {
    return { ok: false, error: "line_api_fetch_failed" };
  }
}

function sanitizeRichMenuList(payload = {}) {
  const richmenus = Array.isArray(payload.richmenus) ? payload.richmenus : [];
  return richmenus.map((menu) => ({
    richMenuId: asString(menu.richMenuId),
    name: asString(menu.name),
    chatBarText: asString(menu.chatBarText),
    selected: menu.selected === true,
    areas_count: Array.isArray(menu.areas) ? menu.areas.length : 0,
  }));
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    return null;
  }
}

async function handleRichMenuSync(request, env) {
  if (!hasInternalAuth(request, env)) return json({ ok: false, error: "internal_auth_required" }, 401);
  const body = await readJson(request);
  if (!body || typeof body !== "object") return json({ ok: false, error: "invalid_json" }, 400);

  const lineUserId = getLineUserId(body);
  if (!lineUserId) return json({ ok: false, error: "line_user_id_missing" }, 400);

  const richMenuTarget = resolveRichMenuTarget(body);
  const richMenuId = getRichMenuIdForTarget(env, richMenuTarget);
  if (!richMenuId) return json({ ok: false, error: "rich_menu_id_missing", rich_menu_target: richMenuTarget }, 400);

  const linked = await linkRichMenuToUser(env, lineUserId, richMenuId);
  if (!linked.ok) {
    return json({ ok: false, ...linked, rich_menu_target: richMenuTarget, line_user_id: lineUserId }, linked.error === "line_token_missing" ? 500 : 502);
  }

  return json({ ok: true, linked: true, rich_menu_target: richMenuTarget, line_user_id: lineUserId });
}

function publicWorldDraftResponse() {
  const draft = createPublicWorldRichMenuDraft();
  return json({ ok: true, rich_menu_type: "public_world", draft, rich_menu: draft });
}

function privateMemberDraftResponse() {
  const draft = createPrivateMemberRichMenuDraft();
  return json({ ok: true, rich_menu_type: "private_member", draft, rich_menu: draft });
}

async function validatePublicWorldRichMenu(env, options = {}) {
  const draft = buildPublicWorldRichMenuVariant(options.variant || "full");
  const result = await lineApiJson(env, `${LINE_RICH_MENU_API_URL}/validate`, {
    method: "POST",
    body: JSON.stringify(draft),
  }, {
    operation: "rich_menu_validate",
    debug: options.debug === true,
  });
  if (!result.ok) return result;
  return { ok: true, validated: true, variant: options.variant || "full" };
}

async function validatePrivateMemberRichMenu(env, options = {}) {
  const draft = createPrivateMemberRichMenuDraft();
  const result = await lineApiJson(env, `${LINE_RICH_MENU_API_URL}/validate`, {
    method: "POST",
    body: JSON.stringify(draft),
  }, {
    operation: "rich_menu_validate",
    debug: options.debug === true,
  });
  if (!result.ok) return result;
  return { ok: true, validated: true, rich_menu_type: "private_member" };
}

async function createPublicWorldRichMenu(env) {
  const draft = buildPublicWorldRichMenu();
  const result = await lineApiJson(env, LINE_RICH_MENU_API_URL, {
    method: "POST",
    body: JSON.stringify(draft),
  }, { operation: "rich_menu_create" });
  if (!result.ok) return result;
  return {
    ok: true,
    created: true,
    rich_menu_type: "public_world",
    rich_menu_id: asString(result.data?.richMenuId || result.data?.rich_menu_id),
  };
}

function isAllowedRichMenuImageUrl(rawUrl = "") {
  try {
    const url = new URL(asString(rawUrl));
    return url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

async function uploadPublicWorldRichMenuImage(env, input = {}) {
  const richMenuId = asString(input.rich_menu_id || input.richMenuId);
  const imageUrl = asString(input.image_url || input.imageUrl);
  if (!richMenuId) return { ok: false, error: "rich_menu_id_missing" };
  if (!imageUrl) return { ok: false, error: "image_url_missing" };
  if (!isAllowedRichMenuImageUrl(imageUrl)) return { ok: false, error: "image_url_invalid" };
  const imagePath = new URL(imageUrl).pathname.toLowerCase();
  if (!/\.(?:jpe?g|png)$/.test(imagePath)) return { ok: false, error: "rich_menu_image_type_invalid" };

  let imageResponse;
  try {
    imageResponse = await fetch(imageUrl);
  } catch (_) {
    return { ok: false, error: "rich_menu_image_fetch_failed" };
  }
  if (!imageResponse.ok) return { ok: false, error: "rich_menu_image_fetch_failed", status: imageResponse.status };

  const contentType = asString(imageResponse.headers.get("content-type")).toLowerCase();
  if (!["image/png", "image/jpeg"].includes(contentType)) {
    return { ok: false, error: "rich_menu_image_content_type_invalid", content_type: contentType || "unknown" };
  }
  const body = await imageResponse.arrayBuffer();
  const result = await lineApiRaw(env, `${LINE_RICH_MENU_DATA_URL}/${encodeURIComponent(richMenuId)}/content`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  }, { operation: "rich_menu_image_upload" });
  if (!result.ok) return { ...result, error: "rich_menu_image_upload_failed" };
  return { ok: true, image_uploaded: true, rich_menu_type: "public_world", rich_menu_id: richMenuId };
}

async function setPublicWorldDefault(env, input = {}) {
  const richMenuId = asString(input.rich_menu_id || input.richMenuId);
  if (!richMenuId) return { ok: false, error: "rich_menu_id_missing" };
  const result = await lineApiRaw(env, `${LINE_DEFAULT_RICH_MENU_URL}/${encodeURIComponent(richMenuId)}`, {
    method: "POST",
  }, { operation: "rich_menu_set_default" });
  if (!result.ok) return result;
  return { ok: true, default_set: true, rich_menu_type: "public_world", rich_menu_id: richMenuId };
}

async function publishPublicWorldRichMenu(env, input = {}) {
  const imageUrl = asString(input.image_url || input.imageUrl);
  if (!imageUrl) return { ok: false, error: "rich_menu_image_required" };

  const validated = await validatePublicWorldRichMenu(env);
  if (!validated.ok) return validated;

  const created = await createPublicWorldRichMenu(env);
  if (!created.ok) return created;

  const uploaded = await uploadPublicWorldRichMenuImage(env, { ...input, rich_menu_id: created.rich_menu_id });
  if (!uploaded.ok) {
    return {
      ok: false,
      created: true,
      image_uploaded: false,
      default_set: false,
      error: uploaded.error || "rich_menu_image_upload_failed",
      rich_menu_type: "public_world",
      rich_menu_id: created.rich_menu_id,
    };
  }

  const defaultSet = await setPublicWorldDefault(env, { rich_menu_id: created.rich_menu_id });
  if (!defaultSet.ok) {
    return { ok: false, created: true, image_uploaded: true, default_set: false, error: defaultSet.error, rich_menu_type: "public_world", rich_menu_id: created.rich_menu_id };
  }

  return {
    ok: true,
    validated: true,
    created: true,
    image_uploaded: true,
    default_set: true,
    rich_menu_type: "public_world",
    rich_menu_id: created.rich_menu_id,
  };
}

async function handleRichMenuDefault(request, env) {
  if (!hasInternalAuth(request, env)) return json({ ok: false, error: "internal_auth_required" }, 401);
  const result = await lineApiJson(env, LINE_DEFAULT_RICH_MENU_URL, { method: "GET" }, { operation: "rich_menu_default" });
  if (!result.ok) return json(result, result.error === "line_token_missing" ? 500 : 502);
  return json({ ok: true, rich_menu_id: asString(result.data?.richMenuId || result.data?.rich_menu_id) });
}

async function handleRichMenuList(request, env) {
  if (!hasInternalAuth(request, env)) return json({ ok: false, error: "internal_auth_required" }, 401);
  const result = await lineApiJson(env, `${LINE_RICH_MENU_API_URL}/list`, { method: "GET" }, { operation: "rich_menu_list" });
  if (!result.ok) return json(result, result.error === "line_token_missing" ? 500 : 502);
  return json({ ok: true, richmenus: sanitizeRichMenuList(result.data) });
}

function richMenuStatus(result, fallback = 200) {
  if (result.ok) return fallback;
  if (result.error === "line_token_missing") return 500;
  if ([
    "rich_menu_id_missing",
    "rich_menu_image_required",
    "image_url_missing",
    "image_url_invalid",
    "rich_menu_image_type_invalid",
    "rich_menu_image_content_type_invalid",
  ].includes(result.error)) {
    return 400;
  }
  return result.status || 502;
}

async function handlePublicWorldRichMenuRoute(request, env, path, serviceBound = false) {
  if (!serviceBound && !hasInternalAuth(request, env)) return json({ ok: false, error: "internal_auth_required" }, 401);
  const base = serviceBound ? SERVICE_LINE_RICH_MENU_PUBLIC_WORLD_BASE_PATH : LINE_RICH_MENU_PUBLIC_WORLD_BASE_PATH;
  const debug = new URL(request.url).searchParams.get("debug") === "1" && (serviceBound || hasBearerInternalAuth(request, env));

  if (request.method === "POST" && path === `${base}/draft`) return publicWorldDraftResponse();
  if (request.method === "POST" && path === `${base}/validate`) {
    const result = await validatePublicWorldRichMenu(env, { debug });
    return json(result, result.ok ? 200 : richMenuStatus(result));
  }
  if (request.method === "POST" && path === `${base}/validate-minimal`) {
    const result = await validatePublicWorldRichMenu(env, { variant: "minimal", debug });
    return json(result, result.ok ? 200 : richMenuStatus(result));
  }
  if (request.method === "POST" && path === `${base}/validate-no-postback`) {
    const result = await validatePublicWorldRichMenu(env, { variant: "no-postback", debug });
    return json(result, result.ok ? 200 : richMenuStatus(result));
  }
  if (request.method === "POST" && path === `${base}/validate-message-only`) {
    const result = await validatePublicWorldRichMenu(env, { variant: "message-only", debug });
    return json(result, result.ok ? 200 : richMenuStatus(result));
  }
  if (request.method === "POST" && path === `${base}/validate-uri-only`) {
    const result = await validatePublicWorldRichMenu(env, { variant: "uri-only", debug });
    return json(result, result.ok ? 200 : richMenuStatus(result));
  }
  if (request.method === "POST" && path === `${base}/create`) {
    const result = await createPublicWorldRichMenu(env);
    return json(result, result.ok ? 200 : richMenuStatus(result));
  }
  if (request.method === "POST" && path === `${base}/upload-image`) {
    const result = await uploadPublicWorldRichMenuImage(env, await readJson(request));
    return json(result, result.ok ? 200 : richMenuStatus(result));
  }
  if (request.method === "POST" && path === `${base}/set-default`) {
    const result = await setPublicWorldDefault(env, await readJson(request));
    return json(result, result.ok ? 200 : richMenuStatus(result));
  }
  if (request.method === "POST" && path === `${base}/publish`) {
    if (serviceBound && !hasServiceBindingAuth(request, ["admin-worker"])) return json({ ok: false, error: "internal_auth_required" }, 401);
    const result = await publishPublicWorldRichMenu(env, await readJson(request));
    return json(result, result.ok ? 200 : richMenuStatus(result));
  }
  return json({ ok: false, error: "not_found" }, 404);
}

async function handlePrivateMemberRichMenuRoute(request, env, path) {
  if (request.method === "POST" && path === `${SERVICE_LINE_RICH_MENU_PRIVATE_MEMBER_BASE_PATH}/draft`) return privateMemberDraftResponse();
  if (request.method === "POST" && path === `${SERVICE_LINE_RICH_MENU_PRIVATE_MEMBER_BASE_PATH}/validate`) {
    const debug = new URL(request.url).searchParams.get("debug") === "1";
    const result = await validatePrivateMemberRichMenu(env, { debug });
    return json(result, result.ok ? 200 : richMenuStatus(result));
  }
  return json({ ok: false, error: "not_found" }, 404);
}

async function handleServiceBoundRichMenuRoute(request, env, path) {
  if (!hasServiceBindingAuth(request, ["admin-worker"])) return json({ ok: false, error: "internal_auth_required" }, 401);
  if (path.startsWith(`${SERVICE_LINE_RICH_MENU_PUBLIC_WORLD_BASE_PATH}/`)) return handlePublicWorldRichMenuRoute(request, env, path, true);
  if (path.startsWith(`${SERVICE_LINE_RICH_MENU_PRIVATE_MEMBER_BASE_PATH}/`)) return handlePrivateMemberRichMenuRoute(request, env, path);
  if (request.method === "GET" && path === SERVICE_LINE_RICH_MENU_DEFAULT_PATH) {
    const result = await lineApiJson(env, LINE_DEFAULT_RICH_MENU_URL, { method: "GET" }, { operation: "rich_menu_default" });
    if (!result.ok) return json(result, richMenuStatus(result));
    return json({ ok: true, rich_menu_id: asString(result.data?.richMenuId || result.data?.rich_menu_id) });
  }
  if (request.method === "GET" && path === SERVICE_LINE_RICH_MENU_LIST_PATH) {
    const result = await lineApiJson(env, `${LINE_RICH_MENU_API_URL}/list`, { method: "GET" }, { operation: "rich_menu_list" });
    if (!result.ok) return json(result, richMenuStatus(result));
    return json({ ok: true, richmenus: sanitizeRichMenuList(result.data) });
  }
  return json({ ok: false, error: "not_found" }, 404);
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
  const hasChannelToken = Boolean(asString(env.LINE_CHANNEL_ACCESS_TOKEN));
  const saved = [];

  if (events.length === 0) {
    logLinePublicTriggerSkip({
      reason: "no_events",
      auto_reply_enabled: autoReplyEnabled,
      has_channel_token: hasChannelToken,
    });
  }

  for (const event of events) {
    const text = getLineEventText(event);
    const rawText = getLineRawEventText(event);
    const lineUserId = getLineUserId({ event });
    const intent = inferLineIntent(text, event);
    const messageType = getLineMessageType(event);
    const sourceType = getLineSourceType(event);
    const replyToken = getReplyToken(event);
    const triggerDiagnostics = getLinePublicTriggerDiagnostics(rawText);
    const triggerCategory = getPublicTriggerCategory(rawText);
    const isPublicSafeTrigger = isPublicSafeTriggerCategory(triggerCategory);
    const shouldFetchProfile = Boolean(autoReplyEnabled && lineUserId && event?.source?.type === "user" && hasChannelToken);
    const profile = shouldFetchProfile ? await fetchLineProfile(env, lineUserId) : null;
    const record = await writeLineEventToConsoleInbox(env, event, profile, intent);
    const replyText = kenjiEnabled ? buildKenjiLineReply(event, profile, { forceReply: autoReplyEnabled }) : "";
    const knowledgeReply = autoReplyEnabled && event?.type === "message" && event?.message?.type === "text"
      ? await maybeBuildKenjiKnowledgeReply({ env, userId: lineUserId, messageText: text, fetchImpl: globalThis.fetch })
      : null;
    const finalReplyText = knowledgeReply || replyText;
    const baseSkipDetails = {
      trigger_category: triggerCategory,
      auto_reply_enabled: autoReplyEnabled,
      has_source_user: Boolean(lineUserId),
      has_reply_text: Boolean(finalReplyText),
      is_public_safe_trigger: isPublicSafeTrigger,
      message_type: messageType,
      source_type: sourceType,
      has_channel_token: hasChannelToken,
      deduped: Boolean(record?.deduped),
      ...triggerDiagnostics,
    };
    let skipReason = "";
    let replyResult = null;
    let pushResult = null;

    if (event?.type !== "message") {
      skipReason = "unsupported_event_type";
    } else if (messageType !== "text") {
      skipReason = "unsupported_message_type";
    } else if (!autoReplyEnabled) {
      skipReason = "auto_reply_disabled";
    } else if (record?.deduped) {
      skipReason = "deduped";
    } else if (!finalReplyText) {
      skipReason = "missing_reply_text";
    } else if (!hasChannelToken) {
      skipReason = "missing_channel_token";
    } else if (replyToken) {
      replyResult = await sendLineReply(env, replyToken, finalReplyText, { trusted_event: true });
      logLineDeliveryResult(replyResult?.ok ? "line_reply_success" : "line_reply_failed", replyResult);
      if (!replyResult?.ok) skipReason = "reply_not_allowed";
    } else if (!isPublicSafeTrigger) {
      skipReason = "no_public_trigger_match";
    } else if (!lineUserId) {
      skipReason = "missing_source_user";
    } else {
      pushResult = await deliverLineText(env, lineUserId, finalReplyText, { trusted_event: true });
      logLineDeliveryResult(pushResult?.ok ? "line_push_fallback_success" : "line_push_fallback_failed", pushResult);
      if (!pushResult?.ok) skipReason = "push_not_allowed";
    }

    if (skipReason) logLinePublicTriggerSkip({ ...baseSkipDetails, reason: skipReason });

    saved.push({
      ok: true,
      type: event?.type || "",
      intent,
      deduped: Boolean(record?.deduped),
      recorded: Boolean(record?.id),
      record_skipped: Boolean(record?.skipped),
      replied: Boolean(replyResult?.ok),
      pushed: Boolean(pushResult?.ok),
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

    if (
      url.pathname.startsWith(`${SERVICE_LINE_RICH_MENU_PUBLIC_WORLD_BASE_PATH}/`) ||
      url.pathname.startsWith(`${SERVICE_LINE_RICH_MENU_PRIVATE_MEMBER_BASE_PATH}/`) ||
      url.pathname === SERVICE_LINE_RICH_MENU_DEFAULT_PATH ||
      url.pathname === SERVICE_LINE_RICH_MENU_LIST_PATH
    ) {
      return handleServiceBoundRichMenuRoute(request, env, url.pathname);
    }

    if (request.method === "POST" && url.pathname === LINE_RICH_MENU_SYNC_PATH) {
      return handleRichMenuSync(request, env);
    }

    if (url.pathname.startsWith(`${LINE_RICH_MENU_PUBLIC_WORLD_BASE_PATH}/`)) {
      return handlePublicWorldRichMenuRoute(request, env, url.pathname, false);
    }

    if (request.method === "GET" && url.pathname === LINE_RICH_MENU_DEFAULT_PATH) {
      return handleRichMenuDefault(request, env);
    }

    if (request.method === "GET" && url.pathname === LINE_RICH_MENU_LIST_PATH) {
      return handleRichMenuList(request, env);
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
