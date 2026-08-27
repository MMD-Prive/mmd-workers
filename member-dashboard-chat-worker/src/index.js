import {
  isRenewalRoute,
  renderRenewalResponse,
} from "./renderers/single-renewal-renderer.js";
import { KenjiModelIdempotency } from "./kenji-model-idempotency.js";
import { generateKenjiModelReply, KENJI_TOTAL_DEADLINE_MS } from "./kenji-model-policy.js";
import { buildProtectedCapabilityReply, decideKenjiCapability, KENJI_CAPABILITIES } from "./kenji-capability-policy.js";
import { parseModelKnowledgeIdAllowlist, selectApprovedLineModelKnowledge } from "./kenji-knowledge-policy.js";

export { KenjiModelIdempotency };

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const LINE_PROFILE_BASE_URL = "https://api.line.me/v2/bot/profile";
const LINE_RICH_MENU_LINK_URL = "https://api.line.me/v2/bot/user";
const LINE_RICH_MENU_API_URL = "https://api.line.me/v2/bot/richmenu";
const LINE_RICH_MENU_DATA_URL = "https://api-data.line.me/v2/bot/richmenu";
const LINE_DEFAULT_RICH_MENU_URL = "https://api.line.me/v2/bot/user/all/richmenu";
const WORKER_NAME = "member-dashboard-chat-worker";
const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"]);
const MEMBER_LIFF_PREFIX = "/member/api/liff/";
const MEMBER_LIFF_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const MEMBER_DASHBOARD_API_PATHS = new Set(["/api/member/dashboard", "/api/member/dashboard/"]);
const MEMBER_LIFF_ID = "2010298002-mbx9kqQn";
const MEMBER_SIGNUP_URL = "https://mmdbkk.com/sigil/member/membership?source=line&intent=signup";
const MEMBER_RENEWAL_URL = "https://mmdbkk.com/sigil/member/membership?source=line&intent=renew";
const LINE_RICH_MENU_SYNC_PATH = "/v1/internal/line/rich-menu/sync";
const LINE_RICH_MENU_PUBLIC_WORLD_BASE_PATH = "/v1/internal/line/rich-menu/public-world";
const LINE_RICH_MENU_DEFAULT_PATH = "/v1/internal/line/rich-menu/default";
const LINE_RICH_MENU_LIST_PATH = "/v1/internal/line/rich-menu/list";
const SERVICE_LINE_RICH_MENU_PUBLIC_WORLD_BASE_PATH = "/__internal/line/rich-menu/public-world";
const SERVICE_LINE_RICH_MENU_PRIVATE_MEMBER_BASE_PATH = "/__internal/line/rich-menu/private-member";
const SERVICE_LINE_RICH_MENU_DEFAULT_PATH = "/__internal/line/rich-menu/default";
const SERVICE_LINE_RICH_MENU_LIST_PATH = "/__internal/line/rich-menu/list";
const DEFAULT_SYNC_TABLE = "MMD — Console Inbox";
const KENJI_MODEL_DEDUPE_TIMEOUT_MS = 300;
const KENJI_MODEL_QUOTA_DEFAULT_LIMIT = 3;
const KENJI_MODEL_QUOTA_DEFAULT_WINDOW_SECONDS = 15 * 60;

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

async function handleMemberLiffFrontGate(request, env) {
  if (!env.MEMBER_PAGES_WORKER?.fetch) {
    return json({ ok: false, error: { code: "LIFF_UPSTREAM_NOT_CONFIGURED", message: "Member identity service is unavailable." } }, 503);
  }

  const upstreamRequest = new Request(request.url, request);
  const upstreamResponse = await env.MEMBER_PAGES_WORKER.fetch(upstreamRequest);
  const headers = new Headers(upstreamResponse.headers);
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-upstream-service", "member-pages-worker");
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}

function asString(value) {
  return String(value || "").trim();
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(asString(value).toLowerCase());
}

function parseHashAllowlist(value) {
  const raw = asString(value);
  if (!raw) return { valid: true, hashes: new Set() };
  const values = raw.split(/[\s,]+/).filter(Boolean);
  if (!values.length || values.some((item) => !/^[a-f0-9]{64}$/.test(item))) return { valid: false, hashes: new Set() };
  return { valid: true, hashes: new Set(values) };
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
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
  const expectedInternalToken = asString(env.INTERNAL_TOKEN);
  return Boolean(expectedInternalToken && bearer && bearer === expectedInternalToken);
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

function isPerContinuityRequest(text = "") {
  const compact = compactLookup(text);
  return [
    "ขอคุยกับเปอร์",
    "เปอร์อยู่ไหม",
    "คุยกับเปอร์ได้ไหม",
    "อยากคุยกับเปอร์",
    "ถามเปอร์หน่อย",
  ].some((phrase) => compact.includes(phrase));
}

export function inferLineIntent(text = "", event = {}) {
  const normalized = normalizeLookup(text);
  if (!normalized) {
    if (event?.type === "follow") return "new_follow";
    if (event?.type === "postback") return "postback";
    return "line_event";
  }

  if (/(human handoff|human agent|คุยกับคน|เจ้าหน้าที่)/i.test(normalized)) return "human_handoff";
  if (/(ข้อมูล|ประวัติ|เบอร์|ไลน์|ชื่อ|โปรไฟล์|payment|สมาชิก).{0,24}(?:ลูกค้าคนอื่น|คนอื่น|สมาชิกคนอื่น)|(?:ลูกค้าคนอื่น|ข้อมูลส่วนตัว|private data|other customer)/i.test(normalized)) return "privacy_request";
  if (/(?:หา|เช็ก|ดู|ขอ).{0,16}(?:model|นายแบบ).{0,20}(?:คืนนี้|วันนี้|พรุ่งนี้|ว่าง|คิว|ตาราง)|(?:model|นายแบบ).{0,20}(?:ว่าง|พร้อม|availability|schedule|ตารางงาน)|(?:ว่างไหม|เช็กคิว|ดูคิว)/i.test(normalized)) return "availability_request";
  if (/(?:จ่าย|ชำระ|โอน|ยอด|เงิน|สลิป|payment|paid).{0,40}(?:ไม่มีใครแก้|ยังไม่แก้|หลายวัน|โต้แย้ง|dispute)|(?:ไม่มีใครแก้|ยังไม่แก้|หลายวัน|โต้แย้ง|dispute).{0,40}(?:จ่าย|ชำระ|โอน|ยอด|เงิน|สลิป|payment|paid)/i.test(normalized)) return "payment_dispute";
  if (/(ร้องเรียน|complaint|ไม่พอใจ|ไม่โอเค|บริการแย่|แย่มาก|มีปัญหา|เรื่องด่วน|อยากให้เปอร์จัดการเอง|escalat|กู้คืน|recover account|บัญชีหาย|เข้าไม่ได้)/i.test(normalized)) return "complaint_escalation";
  if (/(ระบบหลังบ้าน|internal|admin|แอดมิน|สิทธิ์เข้าถึง|ขอ access|access request|token|secret|api key|ฐานข้อมูล|airtable|cloudflare|worker|prompt|คำสั่งระบบ)/i.test(normalized)) return "internal_access";
  if (/(เมื่อกี้|ก่อนหน้านี้|ที่คุยมา|อันแรก|อันนั้น|เรื่องนั้น|เหมือนเดิม|ต่อจากเดิม|ต่อจากเมื่อกี้|as before|the first one|what we discussed)/i.test(normalized)) return "context_clarification";
  if (/(ขอให้เปอร์ตรวจ|ให้เปอร์ดู|ให้ per ดู|manual review|ตรวจเอง)/i.test(normalized)) return "manual_review";
  if (isPerContinuityRequest(text) && /(สลิป|โอน|จ่าย|ชำระ|payment|paid|slip)/i.test(normalized)) return "payment_slip";
  if (isPerContinuityRequest(text) && /(แต้ม|คะแนน|point|points)/i.test(normalized)) return "points";
  if (isPerContinuityRequest(text)) return "per_continuity";
  if (/^(?:อยาก|ขอ)?\s*สมัครสมาชิก(?:ครับ|ค่ะ|นะ)?$/i.test(normalized)) return "membership_signup";
  if (/^(?:ขอ)?\s*ต่ออายุ(?:สมาชิก)?(?:ครับ|ค่ะ|นะ)?$/i.test(normalized)) return "membership_renewal";
  if (isKenjiLineCandidate(text)) return "talk_to_per_ai";
  const isCareBack = /(care\s*back|แคร์\s*แบ็ก|แคร์แบ็ก|6\s*years?|6th\s*anniversary|โปร(?:โมชัน|โมชั่น)?\s*6\s*ปี|phase\s*[12])/i.test(normalized);
  const isPersonalCareBackStatus = /(?:ผม|หนู|ฉัน|ของผม|ของหนู|ของฉัน).{0,16}(?:ได้|มี|เข้า|อยู่).{0,16}(?:180\s*วัน|90\s*วัน|150\s*(?:แต้ม|คะแนน|points?)|250\s*(?:แต้ม|คะแนน|points?)|350\s*(?:แต้ม|คะแนน|points?)|กี่วัน|กี่แต้ม|กี่คะแนน|เท่าไหร่|เท่าไร|กลุ่มไหน|สิทธิ์)|^(?:ผม|หนู|ฉัน)\s*(?:ได้|มี)\s*(?:อะไร|เท่าไหร่|เท่าไร)$|^(?:ของผม|ของหนู|ของฉัน).{0,12}(?:เข้าไหม|ได้ไหม|ได้หรือยัง|อยู่กลุ่มไหน)$/i.test(normalized);
  if (
    (isCareBack || isPersonalCareBackStatus) &&
    /(?:ผม|หนู|ฉัน|เรา|ของผม|ของหนู|ของฉัน).{0,20}(?:ได้อะไร|ได้ไหม|ได้กี่|สถานะ|สิทธิ์|เข้าเกณฑ์|กลุ่มไหน)|(?:เช็ก|ตรวจ|ดู).{0,16}(?:สิทธิ์|สถานะ|คะแนน|แต้ม).{0,24}(?:ผม|หนู|ฉัน|ให้หน่อย)|(?:ผม|หนู|ฉัน).{0,12}(?:อยู่กลุ่ม|เป็นกลุ่ม)/i.test(normalized)
  ) return "care_back_personal_status";
  if (isPersonalCareBackStatus) return "care_back_personal_status";
  if (isCareBack && /(?:black\s*card|แบล็คการ์ด|บัตรด[ำํา]|350\s*(?:แต้ม|คะแนน|points?))/i.test(normalized)) return "care_back_black_card";
  if (isCareBack && /(?:จ่าย|ชำระ|โอน|สลิป|payment|paid|แต้ม.{0,12}(?:เข้า|ได้|มา|เมื่อไหร่|ตอนไหน)|points?.{0,12}(?:credit|add|receive|เมื่อไหร่|ตอนไหน))/i.test(normalized)) return "care_back_payment_points";
  if (/(birthday\s*wish|คำอวยพร|คูปองวันเกิด|คูปอง|coupon)/i.test(normalized) && (isCareBack || /(?:birthday|วันเกิด|wish|10(?:\s*%)?|30\s*วัน)/i.test(normalized))) return "care_back_coupon_wish";
  if (isCareBack && /(?:สมาชิกปัจจุบัน|สมาชิกเดิมที่ยัง|current member|active|grace|ยังไม่หมดอายุ|ต่อวัน|เพิ่มวัน|180\s*วัน)/i.test(normalized)) return "care_back_current_member";
  if (isCareBack && /(?:สมาชิกเดิม|อดีตสมาชิก|former|expired|หมดอายุ|ขาดอายุ|inactive|ต่ออายุ|renew)/i.test(normalized)) return "care_back_expired_member";
  if (isCareBack && /(?:new\s*premium|premium\s*ใหม่|สมาชิกใหม่.{0,12}premium|พรีเมียม.{0,12}(?:ใหม่|กี่แต้ม)|250\s*(?:welcome\s*)?(?:points?|แต้ม|คะแนน))/i.test(normalized)) return "care_back_new_premium";
  if (isCareBack && /(?:new\s*standard|standard\s*ใหม่|สมาชิกใหม่.{0,12}standard|สแตนดาร์ด.{0,12}(?:ใหม่|กี่แต้ม)|150\s*(?:welcome\s*)?(?:points?|แต้ม|คะแนน))/i.test(normalized)) return "care_back_new_standard";
  if (isCareBack && /(?:สมาชิกใหม่|new member|standard|premium|guest\s*pass|เกสต์พาส)/i.test(normalized)) return "care_back_new_member";
  if ((isCareBack || /(?:แต้ม|คะแนน|points?)/i.test(normalized)) && /(?:ย้อนหลัง|ประวัติ|historical|ยอดใช้บริการ|ทุก\s*100|100\s*(?:บาท|thb)|คิดแต้ม|คำนวณแต้ม)/i.test(normalized)) return "care_back_historical_points";
  if (isCareBack && /(?:phase|เฟส|ช่วง|วันไหน|เมื่อไหร่|เริ่ม|สิ้นสุด|หมดเขต|31\s*(?:ส\.?ค\.?|aug)|(?:1|30)\s*(?:ก\.?ย\.?|sep)|สิงหาคม|กันยายน)/i.test(normalized)) return "care_back_dates";
  if (isCareBack) return "care_back_overview";
  if (/(?:ส่ง\s*)?สลิป.{0,20}(?:แต้ม|คะแนน|points?).{0,16}(?:ไม่เข้า|เข้าไหม|เข้าเมื่อไหร่|ตอนไหน)|(?:จ่าย|ชำระ|payment|paid).{0,20}(?:แต้ม|คะแนน|points?).{0,16}(?:ไม่เข้า|เข้าไหม|เข้าเมื่อไหร่|ตอนไหน)/i.test(normalized)) return "care_back_payment_points";
  if (/(?:350\s*(?:แต้ม|คะแนน|points?).{0,20}(?:black\s*card|แบล็คการ์ด|บัตรด[ำํา])|(?:black\s*card|แบล็คการ์ด|บัตรด[ำํา]).{0,20}350\s*(?:แต้ม|คะแนน|points?))/i.test(normalized)) return "care_back_black_card";
  if (/(?:guest\s*pass|เกสต์\s*พาส).{0,20}(?:แต้ม|คะแนน|points?)/i.test(normalized)) return "care_back_new_member";
  if (/(?:หมดอายุ|expired).{0,24}(?:150\s*(?:แต้ม|คะแนน|points?)|ได้อะไร)/i.test(normalized)) return "care_back_expired_member";
  if (/(?:สมัคร\s*)?(?:standard|สแตนดาร์ด).{0,24}(?:ใหม่|วันนี้|150\s*(?:แต้ม|คะแนน|points?)|แต้ม.{0,8}เข้า|ได้อะไร)/i.test(normalized)) return "care_back_new_standard";
  if (/(?:สมัคร\s*)?(?:premium|พรีเมียม|พรีเมี่ยม).{0,24}(?:ใหม่|วันนี้|250\s*(?:แต้ม|คะแนน|points?)|แต้ม.{0,8}เข้า|ได้อะไร)|(?:premium|พรีเมียม|พรีเมี่ยม).{0,12}(?:ได้\s*)?250/i.test(normalized)) return "care_back_new_premium";
  if (/(?:สมาชิกปัจจุบัน|current\s*member).{0,16}(?:ได้อะไร|180\s*วัน|เพิ่มวัน)/i.test(normalized)) return "care_back_current_member";
  if (/(?:กันยายน|september|sep).{0,16}(?:โปร|promotion)|โปร.{0,16}(?:ถึงวันไหน|หมดเมื่อไหร่|หมดเขต)/i.test(normalized)) return "care_back_dates";
  if (/(?:เข้าเพจ|เปิดเพจ|เปิดหน้า|เข้า\s*page|open\s*page).{0,20}(?:คูปอง|coupon)|(?:wish|คำอวยพร).{0,20}(?:10(?:\s*%)?|คูปอง|coupon).{0,12}(?:ได้เลย|ได้ไหม|หรือยัง|เปิด)/i.test(normalized)) return "care_back_coupon_wish";
  if (/(?:\d[\d,\s]*\s*(?:บาท|thb).{0,16}(?:กี่แต้ม|กี่คะแนน|กี่\s*points?)|(?:กี่แต้ม|กี่คะแนน).{0,16}\d[\d,\s]*\s*(?:บาท|thb))/i.test(normalized)) return "care_back_historical_points";
  if (/^(?:ผม|ฉัน|หนู|เรา)?\s*(?:จ่าย|ชำระ|โอน)(?:เงิน)?\s*(?:แล้ว|เรียบร้อยแล้ว)(?:ครับ|ค่ะ|นะ)?$/i.test(normalized)) return "payment_status";
  if (/^(?:สถานะ(?:สมาชิก)?(?:ของ)?ผม|สถานะ(?:สมาชิก)?(?:ของ)?ฉัน|สถานะ(?:สมาชิก)?(?:ของ)?หนู)(?:เป็นยังไง|เป็นอย่างไร|ตอนนี้)?(?:ครับ|ค่ะ)?$/i.test(normalized)) return "membership_status";
  if (/^(?:แต้ม|คะแนน|points?)(?:ของ)?(?:ผม|ฉัน|หนู)?\s*(?:เข้า|เพิ่ม|มา)(?:แล้ว)?(?:หรือยัง|ไหม|หรือเปล่า)?(?:ครับ|ค่ะ)?$/i.test(normalized)) return "points_status";
  if (/(สลิป|โอน|จ่าย|ชำระ|payment|paid|slip)/i.test(normalized)) return "payment_slip";
  if (/(แต้ม|คะแนน|point|points)/i.test(normalized)) return "points";
  if (/(svip|s vip|super\s*vip)/i.test(normalized)) return "svip";
  if (/(black\s*card|แบล็คการ์ด|บัตรดำ)/i.test(normalized)) return "black_card";
  if (/(vip|วีไอพี)/i.test(normalized)) return "vip";
  if (/(massage|male massage|นวด|คลายกล้าม|recovery|wellness|therapist|เทอราปิส)/i.test(normalized)) return "mms_wellness";
  if (/(relax spa|partner venue|ไม่มีสถานที่|ไม่มีที่|สถานที่พร้อมอุปกรณ์|ใช้ร้าน)/i.test(normalized)) return "partner_venue";
  if (/(private talent|specialist|freelancer|special skill|ทักษะพิเศษ|ล่าม|ภาษา|performance|creative|business presence)/i.test(normalized)) return "private_talent";
  if (/(dinner|dining|drinks|event|appearance|social|ทานข้าว|ดินเนอร์|ดื่ม|อีเวนต์|ออกงาน|จอง|book|booking|คิว|นัด|reserve)/i.test(normalized)) return "mmd_companion";
  if (/(สมัคร|member|สมาชิก|renew|ต่ออายุ|upgrade|อัปเกรด|อัพเกรด|standard|premium)/i.test(normalized)) return "membership";
  if (/(ราคา|price|rate|เรท|promotion|โปร|package|แพ็กเกจ|แพคเกจ|เท่าไร|เท่าไหร่)/i.test(normalized)) {
    return "pricing_review";
  }
  if (/(ใช้บริการยังไง|ใช้บริการอย่างไร|เริ่มยังไง|เริ่มอย่างไร|ขั้นตอน|บริการมีอะไร|how\s+to\s+use|how\s+does\s+it\s+work)/i.test(normalized)) {
    return "service_guidance";
  }
  if (/(สวัสดี|hello|hi|hey)/i.test(normalized)) return "greeting";
  return "note_only";
}

const KENJI_KNOWLEDGE_TABLE_FALLBACK = "tblsLd1uVOtG2kHoU";
const LINE_KNOWLEDGE_CHANNEL = "LINE_OFC";
const LINE_KNOWLEDGE_TTL_MS = 60_000;
const LINE_KNOWLEDGE_REPLY_TIMEOUT_MS = 900;
const LINE_MODEL_DEDUPE_LOOKUP_TIMEOUT_MS = 500;
const LINE_FAILURE_FALLBACK = "ขอผมเช็กข้อมูลตรงนี้ก่อนนะครับ";
const LINE_FAILURE_FALLBACK_COOLDOWN_SECONDS = 10 * 60;
const LINE_KNOWLEDGE_CARD_BY_INTENT = Object.freeze({
  talk_to_per_ai: "kenji_per_voice_line_entry_v1",
  payment_slip: "kenji_20_006_payment_proof",
  membership: "kenji_20_008_membership_intake_catalog",
  mmd_companion: "kenji_20_002_route_map",
  mms_wellness: "kenji_20_002_route_map",
  partner_venue: "kenji_20_002_route_map",
  private_talent: "kenji_20_002_route_map",
});

let lineKnowledgeCache = { key: "", expiresAt: 0, cards: [] };

function getKenjiKnowledgeTable(env = {}) {
  return asString(env.AIRTABLE_KENJI_KNOWLEDGE_TABLE_ID || KENJI_KNOWLEDGE_TABLE_FALLBACK);
}

function hasLineKnowledgeChannel(value) {
  const channels = Array.isArray(value) ? value : [value];
  return channels.map((channel) => asString(channel)).includes(LINE_KNOWLEDGE_CHANNEL);
}

function isSafePerVoiceKnowledge(value) {
  const text = asString(value);
  if (!text || text.length > 1600) return false;
  return !/(?:\bkenji\b|เคนจิ|ทีม(?:งาน)?|ระบบ|ชำระ(?:เงิน)?สำเร็จ(?:แล้ว)?|ยืนยัน(?:การ)?ชำระ(?:เงิน)?(?:แล้ว)?|เปิดสมาชิก(?:แล้ว)?|ยืนยัน(?:การ)?จอง(?:แล้ว)?|ได้รับสิทธิ์(?:แล้ว)?)/i.test(text);
}

async function fetchPublishedLineKnowledge(env = {}, options = {}) {
  const apiKey = asString(env.AIRTABLE_API_KEY);
  const baseId = asString(env.AIRTABLE_BASE_ID);
  const table = getKenjiKnowledgeTable(env);
  if (!apiKey || !baseId || !table) return [];

  const key = `${baseId}:${table}`;
  if (lineKnowledgeCache.key === key && lineKnowledgeCache.expiresAt > Date.now()) {
    return lineKnowledgeCache.cards;
  }

  try {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("filterByFormula", 'AND({status}="active",{response_mode}="auto_reply_allowed")');
    ["knowledge_id", "title", "category", "language", "customer_answer", "allowed_channels", "status", "response_mode", "risk_level", "effective_from", "payload_json", "source_path", "source_ref", "internal_instruction", "review_note"].forEach((field) => {
      url.searchParams.append("fields[]", field);
    });

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      signal: options.signal,
    });
    if (!response.ok) return [];

    const payload = await response.json().catch(() => ({}));
    const cards = (Array.isArray(payload?.records) ? payload.records : [])
      .map((record) => withKnowledgeLifecycleMetadata(record?.fields || {}))
      .filter((fields) => (
        asString(fields.status).toLowerCase() === "active" &&
        asString(fields.response_mode).toLowerCase() === "auto_reply_allowed" &&
        hasLineKnowledgeChannel(fields.allowed_channels)
      ));

    lineKnowledgeCache = { key, expiresAt: Date.now() + LINE_KNOWLEDGE_TTL_MS, cards };
    return cards;
  } catch (_) {
    return [];
  }
}

function rankPublishedKnowledge(cards = [], text = "") {
  const normalized = normalizeLookup(text);
  const terms = normalized.split(/\s+/).filter((term) => term.length >= 2);
  if (!terms.length) return [];
  return cards
    .filter((card) => isSafePerVoiceKnowledge(card?.customer_answer))
    .map((card) => {
      const searchable = normalizeLookup([card.title, card.category, card.customer_answer].filter(Boolean).join(" "));
      const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
      return { card, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((item) => item.card);
}

function withKnowledgeLifecycleMetadata(fields = {}) {
  let payload = {};
  try {
    payload = typeof fields.payload_json === "string" ? JSON.parse(fields.payload_json) : (fields.payload_json || {});
  } catch (_) {
    // Malformed lifecycle metadata is retained as an invalid date marker so
    // the grounding policy fails closed rather than silently ignoring it.
    payload = { effective_to: "invalid_payload_json" };
  }
  return {
    ...fields,
    effective_to: payload.effective_to,
    expires_at: payload.expires_at,
    superseded: payload.superseded,
    superseded_by: payload.superseded_by,
  };
}

async function getModelGrounding(env = {}, text = "", deadlineAt = 0) {
  const allowlist = parseModelKnowledgeIdAllowlist(env.LINE_KENJI_MODEL_KNOWLEDGE_IDS);
  if (!allowlist.valid || !allowlist.ids.length) return [];
  const key = `${asString(env.AIRTABLE_BASE_ID)}:${getKenjiKnowledgeTable(env)}`;
  if (lineKnowledgeCache.key === key && lineKnowledgeCache.expiresAt > Date.now()) {
    return rankPublishedKnowledge(selectApprovedLineModelKnowledge(lineKnowledgeCache.cards, { approvedIds: allowlist.ids }), text);
  }
  if (!isEnabled(env.LINE_KENJI_KNOWLEDGE_ENABLED)) return [];
  const remainingMs = Number(deadlineAt) - Date.now();
  if (Number.isFinite(remainingMs) && remainingMs <= 0) return [];
  const timeoutMs = Math.max(1, Math.min(LINE_KNOWLEDGE_REPLY_TIMEOUT_MS, Number.isFinite(remainingMs) ? remainingMs : LINE_KNOWLEDGE_REPLY_TIMEOUT_MS));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_knowledge_timeout"), timeoutMs);
  try {
    return rankPublishedKnowledge(selectApprovedLineModelKnowledge(await fetchPublishedLineKnowledge(env, { signal: controller.signal }), { approvedIds: allowlist.ids }), text);
  } finally {
    clearTimeout(timer);
  }
}

async function getPublishedPerVoiceReply(env = {}, intent = "") {
  const knowledgeId = LINE_KNOWLEDGE_CARD_BY_INTENT[intent];
  if (!knowledgeId) return "";
  const cards = await fetchPublishedLineKnowledge(env);
  const card = cards.find((item) => asString(item.knowledge_id) === knowledgeId);
  const answer = asString(card?.customer_answer);
  return isSafePerVoiceKnowledge(answer) ? answer : "";
}

function getCachedPublishedPerVoiceReply(env = {}, intent = "") {
  const knowledgeId = LINE_KNOWLEDGE_CARD_BY_INTENT[intent];
  const key = `${asString(env.AIRTABLE_BASE_ID)}:${getKenjiKnowledgeTable(env)}`;
  if (!knowledgeId || lineKnowledgeCache.key !== key || lineKnowledgeCache.expiresAt <= Date.now()) return "";
  const card = lineKnowledgeCache.cards.find((item) => asString(item.knowledge_id) === knowledgeId);
  const answer = asString(card?.customer_answer);
  return isSafePerVoiceKnowledge(answer) ? answer : "";
}

export function buildKenjiLineReply(event = {}, profile = {}, options = {}) {
  const text = getLineEventText(event);
  const intent = inferLineIntent(text, event);
  const name = asString(profile?.displayName).split(/\s+/).filter(Boolean)[0] || "";
  const prefix = name ? `คุณ${name} ` : "";

  if (event?.type === "follow") {
    return `สวัสดีครับ ${prefix}ยินดีต้อนรับสู่ MMD Privé พิมพ์เรื่องที่อยากให้ช่วยได้เลยครับ เช่น จองงาน เช็กราคา เช็กนายแบบ หรือเรื่องสมาชิก`;
  }

  if (intent === "per_continuity") {
    return "อยู่ครับ มีอะไรบอกผมได้เลย";
  }

  if (intent === "talk_to_per_ai") {
    return `สวัสดีครับ ${prefix}ยินดีต้อนรับสู่ MMD Privé นะครับ

อยากสมัครสมาชิก / ต่ออายุ เช็กสถานะ สอบถามบริการ หรือมีเคสส่วนตัวให้เปอร์ช่วยดู พิมพ์มาได้เลยครับ

ตอนนี้อยากให้ช่วยเรื่องไหนก่อนครับ
1) สมัครสมาชิก / ต่ออายุ
2) เช็กแพ็กเกจหรือสถานะสมาชิก
3) สอบถามบริการหรือ Companion
4) ส่งรูปหรือโปรไฟล์ที่อยากให้ MMD พิจารณา
5) ให้เปอร์ดูเป็นเคสส่วนตัว

เล่าได้เลยครับ เดี๋ยวเปอร์ช่วยแยกขั้นตอนที่เหมาะให้ครับ`;
  }

  if (intent === "privacy_request") {
    return "ผมไม่สามารถเปิดเผยหรือค้นข้อมูลส่วนตัวของลูกค้าคนอื่นได้ครับ ถ้าต้องการดูข้อมูลของคุณเอง กรุณาใช้ช่องทางยืนยันตัวตนของ MMD ครับ";
  }

  if (intent === "availability_request") {
    return "ผมยังยืนยันคิวหรือความพร้อมของ Companion จากข้อความนี้ไม่ได้ครับ ส่งวัน เวลา พื้นที่ และรูปแบบงานมาได้ แล้ว MMD จะตรวจความพร้อมก่อนยืนยันครับ";
  }

  if (intent === "complaint_escalation") {
    return "ผมอยู่ครับ เล่ารายละเอียดสำคัญและสิ่งที่อยากให้ผมช่วยจัดการได้เลยครับ";
  }

  if (intent === "internal_access") {
    return "ผมช่วยได้เฉพาะข้อมูลและขั้นตอนสำหรับลูกค้าครับ ไม่สามารถเปิดเผยหรือให้สิทธิ์เข้าถึงระบบภายในได้ครับ";
  }

  if (intent === "human_handoff") {
    return "ผมอยู่ครับ ส่งรายละเอียดสำคัญและสิ่งที่ต้องการให้ช่วยไว้ได้เลยครับ";
  }

  if (intent === "context_clarification") {
    return "ผมยังไม่มีบริบทก่อนหน้าในรอบนี้ครับ หมายถึงเรื่องสมาชิก ราคา หรือบริการส่วนไหนครับ";
  }

  if (intent === "care_back_overview") {
    return `${prefix}CARE BACK เป็นสิทธิ์ดูแลกลับที่ MMD ตรวจจากสถานะและประวัติจริงครับ เริ่มจากยืนยันผ่าน LINE แล้วส่ง Birthday Wish ให้บันทึกสำเร็จก่อน คูปองส่วนตัว 10% จึงจะเปิดได้ 1 ครั้งและมีอายุ 30 วันหลัง activation ส่วน Membership และ Points จะมีผลหลัง MMD ตรวจข้อมูล การสมัคร หรือการชำระเงินที่เกี่ยวข้องเรียบร้อยแล้วเท่านั้นครับ`;
  }

  if (intent === "care_back_dates") {
    return `${prefix}CARE BACK Phase 1 สิ้นสุดวันที่ 31 สิงหาคม 2026 และ Phase 2 เปิดวันที่ 1–30 กันยายน 2026 ครับ ทั้งสองช่วงใช้นโยบายสิทธิ์เดียวกัน และการเข้าร่วมในเดือนกันยายนไม่สร้างสิทธิ์ซ้ำครับ`;
  }

  if (intent === "care_back_current_member") {
    return `${prefix}สมาชิกที่มีสถานะ active หรือ grace เมื่อ MMD ตรวจสถานะและวันหมดอายุจริงแล้ว นโยบาย CARE BACK คือขยายอายุสมาชิก 180 วันจากวันหมดอายุจริงครับ ข้อความนี้ยังไม่ใช่การยืนยันว่าได้เพิ่มวันแล้ว`;
  }

  if (intent === "care_back_expired_member") {
    return `${prefix}สมาชิกเดิมที่หมดอายุต้องต่ออายุหรือชำระ และให้ MMD ยืนยันจนสถานะกลับเป็น active หรือ grace ก่อนครับ จากนั้นจึงเข้าเกณฑ์ CARE BACK เพิ่มอายุ 90 วันและ 150 Points ข้อความนี้ยังไม่ใช่การยืนยันสิทธิ์หรือยอดชำระครับ`;
  }

  if (intent === "care_back_new_standard") {
    return `${prefix}สมาชิกใหม่ Standard เข้าเกณฑ์รับ 150 Welcome Points หลัง MMD ตรวจการสมัคร การชำระ และสถานะสมาชิกเรียบร้อยแล้วครับ ข้อความนี้ยังไม่ใช่การยืนยันว่าแต้มเข้าบัญชีแล้ว`;
  }

  if (intent === "care_back_new_premium") {
    return `${prefix}สมาชิกใหม่ Premium เข้าเกณฑ์รับ 250 Welcome Points หลัง MMD ตรวจการสมัคร การชำระ และสถานะสมาชิกเรียบร้อยแล้วครับ ข้อความนี้ยังไม่ใช่การยืนยันว่าแต้มเข้าบัญชีแล้ว`;
  }

  if (intent === "care_back_new_member") {
    return `${prefix}สมาชิกใหม่ Standard เข้าเกณฑ์ 150 Welcome Points และสมาชิกใหม่ Premium เข้าเกณฑ์ 250 Welcome Points หลัง MMD ตรวจการสมัคร การชำระ และสถานะเรียบร้อยแล้วครับ Guest Pass ไม่มี CARE BACK Welcome Points อัตโนมัติ เว้นแต่ MMD จะประกาศกติกาแยก`;
  }

  if (intent === "care_back_coupon_wish") {
    return `${prefix}ต้องส่ง Birthday Wish ให้บันทึกสำเร็จก่อน คูปอง CARE BACK 10% จึงจะพร้อมใช้ครับ คูปองใช้กับรายการที่เข้าเกณฑ์ได้ 1 ครั้ง และมีอายุ 30 วันหลัง activation การยืนยันตัวตนหรือเข้าเพจอย่างเดียวยังไม่เปิดคูปองครับ`;
  }

  if (intent === "care_back_historical_points") {
    if (/10\s*[,\s]?\s*000\s*(?:บาท|thb)/i.test(text)) {
      return `${prefix}ตามอัตรา CARE BACK ยอดใช้บริการย้อนหลัง 10,000 บาทจะเทียบได้ 100 Points เฉพาะเมื่อ MMD ตรวจแล้วว่าเป็นยอดบริการย้อนหลังที่เข้าเกณฑ์ครับ ข้อความนี้เป็นการอธิบายอัตรา 100 บาทต่อ 1 Point ยังไม่ใช่การยืนยันว่าคุณมี 100 Points`;
    }
    return `${prefix}ยอดใช้บริการย้อนหลังที่เข้าเกณฑ์และ MMD ตรวจสอบได้ คิดในอัตรา 100 บาทเท่ากับ 1 Point ครับ คะแนนจะอ้างอิงเฉพาะรายการที่ตรวจสอบได้ และข้อความนี้ยังไม่ใช่การยืนยันยอดคะแนนส่วนตัว`;
  }

  if (intent === "care_back_payment_points") {
    return `${prefix}สลิปเป็นหลักฐานประกอบเท่านั้น ยังไม่ใช่การยืนยันการชำระครับ อายุสมาชิก สิทธิ์ และ Points จะมีผลหลัง MMD ตรวจยอด จับคู่รายการ และอัปเดตสถานะทางการเรียบร้อยแล้ว`;
  }

  if (intent === "care_back_black_card") {
    return `${prefix}คะแนนพิเศษสูงสุด 350 Points ใช้ได้เฉพาะเคสที่ผ่านการคัดเลือกพิเศษที่อนุมัติแล้ว และเป็นเพียงข้อมูลประกอบการพิจารณา Black Card ครับ ไม่ได้รับ Black Card อัตโนมัติ และข้อความนี้ยังไม่ใช่การอนุมัติสิทธิ์`;
  }

  if (intent === "care_back_personal_status") {
    return `${prefix}ผมยังยืนยันจากข้อความนี้ไม่ได้ว่าคุณอยู่กลุ่มไหน ได้สิทธิ์ใด หรือมียอดเท่าไรครับ ต้องตรวจสถานะสมาชิก วันหมดอายุ ประวัติบริการ และรายการชำระที่ยืนยันแล้วของคุณก่อน`;
  }

  if (intent === "payment_slip") {
    return `${prefix}ส่งหลักฐานเข้ามาได้ครับ: https://mmdbkk.com/confirm/payment-proof

เดี๋ยว MMD ตรวจยอดและจับคู่รายการให้ก่อนนะครับ หลักฐานอย่างเดียวยังไม่ถือว่ายืนยันยอดหรืออนุมัติ request ครับ`;
  }

  if (intent === "payment_status") {
    return "ได้ครับ แต่ผมจะไม่ยืนยันการชำระจากข้อความหรือสลิปอย่างเดียว รายการต้องผ่านการตรวจสอบอย่างเป็นทางการของ MMD ก่อนครับ";
  }

  if (intent === "membership_status") {
    return "ผมยังยืนยันสถานะ ระดับสมาชิก หรือวันหมดอายุจากข้อความนี้ไม่ได้ครับ ข้อมูลส่วนตัวต้องตรวจผ่าน My MMD ที่ยืนยันตัวตนสำเร็จก่อนครับ";
  }

  if (intent === "points_status") {
    return "ผมยังยืนยันยอดแต้มและประวัติรายการจากข้อความนี้ไม่ได้ครับ ต้องตรวจจากข้อมูลสมาชิกที่ยืนยันตัวตนและ Points Ledger ทางการก่อนครับ";
  }

  if (intent === "membership_signup") {
    return `สมัครสมาชิกได้ที่นี่ครับ → ${MEMBER_SIGNUP_URL}`;
  }

  if (intent === "membership_renewal") {
    return `เริ่มขั้นตอนต่ออายุสมาชิกได้ที่นี่ครับ → ${MEMBER_RENEWAL_URL}\n\nการต่ออายุและสถานะสมาชิกจะมีผลหลัง MMD ตรวจสอบการชำระและข้อมูลทางการเรียบร้อยแล้วครับ`;
  }

  if (intent === "points") {
    return `รับเรื่องคะแนนสมาชิกแล้วครับ ${prefix}เดี๋ยวเปอร์ขอตรวจยอดและประวัติที่เกี่ยวข้องก่อน แล้วจะแจ้งสถานะที่ตรวจได้ครับ`;
  }

  if (intent === "vip" || intent === "svip" || intent === "black_card") {
    return `รับเรื่องระดับสมาชิกพิเศษแล้วครับ ${prefix}เคสนี้เปอร์ขอดูเป็นรอบส่วนตัวก่อนนะครับ ข้อความในแชตยังไม่ถือว่าอนุมัติสิทธิ์ครับ`;
  }

  if (intent === "mms_wellness") {
    return `${prefix}ถ้าต้องการ male massage หรือ recovery service เดี๋ยวเปอร์ช่วยแยกเป็น MMS Wellness ให้ครับ เลือกได้ทั้ง hotel / home visit หรือ Partner Venue โดย MMD ต้องตรวจรายละเอียดและความเหมาะสมก่อนครับ`;
  }

  if (intent === "partner_venue") {
    return `${prefix}ถ้ายังไม่มีสถานที่ที่เหมาะสม เดี๋ยวเปอร์ช่วยดู Partner Venue อย่าง Relax Spa by 9 ให้ได้ครับ ขั้นตอนนี้เป็น request เพื่อรอตรวจ ยังไม่ใช่การยืนยันคิวครับ`;
  }

  if (intent === "private_talent") {
    return `${prefix}รับ Private Talent & Specialist request ได้ครับ เช่น special skills, wellness, creative, performance, language หรือ business presence แล้วเปอร์จะดูรายละเอียดก่อนพาไปขั้นตอนที่เหมาะครับ`;
  }

  if (intent === "mmd_companion") {
    return `${prefix}รับ MMD Companion request สำหรับ Private Social, Dining, Drinks, Event หรือ Appearance ได้ครับ ส่งวัน เวลา พื้นที่ และรูปแบบงานมาได้เลย แล้ว MMD จะตรวจความเหมาะสมและความพร้อมก่อนยืนยันครับ`;
  }

  if (intent === "membership") {
    return `รับเรื่องสมาชิกแล้วครับ ${prefix}จัดการ MY MMD ได้ที่ https://mmdbkk.com/sigil/member/membership ครับ หน้านี้ใช้สำหรับดูแพ็กเกจ สมัคร ต่ออายุ หรืออัปเกรดสมาชิกได้ โดยสถานะสมาชิกและการชำระเงินจะยืนยันหลัง MMD ตรวจสอบข้อมูลทางการแล้วครับ`;
  }

  if (intent === "pricing_review") {
    return `${prefix}เรื่องราคา เดี๋ยวเปอร์ขอดูรายละเอียดที่เหมาะก่อนนะครับ ถ้าสะดวก แจ้งวัน เวลา โซน และระยะเวลาที่ต้องการไว้ได้เลยครับ`;
  }

  if (intent === "service_guidance") {
    return `${prefix}เริ่มได้ง่ายครับ บอกผมก่อนว่าอยากดูเรื่องสมาชิก ราคา หรือใช้บริการแบบไหน พร้อมวัน เวลา และพื้นที่คร่าว ๆ แล้วผมจะช่วยแยกขั้นตอนที่เหมาะให้ครับ`;
  }

  if (intent === "greeting") {
    return `สวัสดีครับ ${prefix}ต้องการสอบถามเรื่องจองงาน ราคา เช็กนายแบบ หรือสมาชิก พิมพ์มาได้เลยนะครับ`;
  }

  if (intent === "manual_review") return LINE_FAILURE_FALLBACK;

  return "";
}

export async function buildKenjiKnowledgeLineReply(event = {}, profile = {}, env = {}, options = {}) {
  const fallback = buildKenjiLineReply(event, profile, options);
  if (!isEnabled(env.LINE_KENJI_KNOWLEDGE_ENABLED)) return fallback;
  const answer = await getPublishedPerVoiceReply(env, inferLineIntent(getLineEventText(event), event));
  return answer || fallback;
}

async function getFailureFallbackCooldownRequest(event = {}) {
  const lineUserId = getLineUserId({ event });
  if (!lineUserId) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lineUserId));
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return new Request(`https://line-fallback-cooldown.mmd.invalid/${key}`, { method: "GET" });
}

async function claimFailureFallbackWindow(event = {}) {
  // Best-effort anti-spam only: Cache API entries are not persistent and may
  // disappear after eviction or across colos. Never use this as authorization,
  // dedupe correctness, or payment/session/member state; the fallback may
  // occasionally reappear when the cache entry is unavailable.
  try {
    const cache = globalThis.caches?.default;
    if (!cache) return true;
    const request = await getFailureFallbackCooldownRequest(event);
    if (!request) return true;
    if (await cache.match(request)) return false;
    await cache.put(request, new Response("1", {
      headers: { "cache-control": `max-age=${LINE_FAILURE_FALLBACK_COOLDOWN_SECONDS}` },
    }));
    return true;
  } catch (_) {
    return true;
  }
}

export async function resolveKenjiLineReply(event = {}, profile = {}, env = {}, options = {}) {
  const eventText = getLineEventText(event);
  const intent = inferLineIntent(eventText, event);
  const capabilityDecision = decideKenjiCapability({ text: eventText, intent });
  const deterministicReply = buildKenjiLineReply(event, profile, options);
  const deterministicFirst = capabilityDecision.capability !== KENJI_CAPABILITIES.APPROVED_PUBLIC_KNOWLEDGE && capabilityDecision.capability !== KENJI_CAPABILITIES.SAFE_CONVERSATION;
  const cachedKnowledge = isEnabled(env.LINE_KENJI_KNOWLEDGE_ENABLED)
    ? getCachedPublishedPerVoiceReply(env, intent)
    : "";
  const generated = deterministicFirst ? deterministicReply : (cachedKnowledge || deterministicReply);
  if (generated && intent !== "manual_review") {
    return {
      text: generated,
      fallback: false,
      reply_source: (!deterministicFirst && cachedKnowledge) ? "knowledge" : "system_truth",
      model_attempted: false,
      model_success: false,
      model_latency_ms: 0,
      knowledge_hits: (!deterministicFirst && cachedKnowledge) ? 1 : 0,
      guard_blocked: false,
      guard_reason: "",
    };
  }

  if (capabilityDecision.capability === KENJI_CAPABILITIES.PROTECTED_AUTHORITY) {
    return {
      text: buildProtectedCapabilityReply(capabilityDecision),
      fallback: false,
      reply_source: "system_truth",
      model_attempted: false,
      model_success: false,
      model_latency_ms: 0,
      knowledge_hits: 0,
      guard_blocked: true,
      guard_reason: `protected_authority_${capabilityDecision.requested_domain}`,
    };
  }

  let model = {};
  let knowledgeHits = 0;
  if (capabilityDecision.capability === KENJI_CAPABILITIES.SAFE_CONVERSATION && eventText && isEnabled(env.LINE_KENJI_MODEL_ENABLED) && options.modelEligible !== false) {
    const deadlineAt = Number(options.deadlineAt) || (Date.now() + KENJI_TOTAL_DEADLINE_MS);
    const grounding = await getModelGrounding(env, eventText, deadlineAt);
    knowledgeHits = grounding.length;
    model = await generateKenjiModelReply({
      text: eventText,
      knowledge: grounding,
      env,
      deadline_at: deadlineAt,
      capability: capabilityDecision.capability,
      validation_context: {
        inferred_capability: capabilityDecision.capability,
        requested_domain: capabilityDecision.requested_domain,
        deterministic_intent: intent,
        protected_context: capabilityDecision.capability === KENJI_CAPABILITIES.PROTECTED_AUTHORITY || capabilityDecision.capability === KENJI_CAPABILITIES.HUMAN_HANDOFF,
      },
    });
    if (model.success && model.text) {
      return {
        text: model.text,
        fallback: false,
        reply_source: "model",
        model_attempted: model.attempted,
        model_success: model.success,
        model_latency_ms: model.latency_ms,
        knowledge_hits: grounding.length,
        guard_blocked: model.guard_blocked,
        guard_reason: model.guard_reason,
      };
    }
  }

  const needsFallback = intent === "manual_review" || Boolean(getLineEventText(event));
  if (!needsFallback) return { text: "", fallback: false, reply_source: "system_truth", model_attempted: false, model_success: false, model_latency_ms: 0, knowledge_hits: 0, guard_blocked: false, guard_reason: "" };
  const allowed = await claimFailureFallbackWindow(event);
  return {
    text: allowed ? LINE_FAILURE_FALLBACK : "",
    fallback: true,
    reply_source: intent === "manual_review" ? "manual_review" : "fallback",
    model_attempted: Boolean(model.attempted),
    model_success: Boolean(model.success),
    model_latency_ms: Number(model.latency_ms) || 0,
    knowledge_hits: knowledgeHits,
    guard_blocked: Boolean(model.guard_blocked),
    guard_reason: asString(model.guard_reason),
  };
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

  let response;
  try {
    response = await fetch(LINE_REPLY_URL, {
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
  } catch (_) {
    return { ok: false, error: "line_reply_request_failed" };
  }

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

async function findExistingLineEvent(env = {}, eventId = "", inboxId = "", options = {}) {
  const apiKey = asString(env.AIRTABLE_API_KEY);
  const baseId = asString(env.AIRTABLE_BASE_ID);
  const table = getAirtableTable(env);
  if (!apiKey || !baseId || !table || (!eventId && !inboxId)) {
    if (options.throwOnUnavailable) throw new Error("line_inbox_lookup_unconfigured");
    return null;
  }

  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set(
    "filterByFormula",
    `OR({line_id}=\"${encodeFormulaValue(eventId)}\",{inbox_id}=\"${encodeFormulaValue(inboxId)}\")`,
  );

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` },
    signal: options.signal,
  });

  if (!response.ok) {
    if (options.throwOnUnavailable) throw new Error("line_inbox_lookup_failed");
    return null;
  }
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.records) ? payload.records[0] || null : null;
}

function getStableLineMessageId(event = {}) {
  return asString(event?.message?.id || event?.webhookEventId);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function claimKenjiModelEvent(env = {}, event = {}) {
  if (event?.deliveryContext?.isRedelivery === true) return { eligible: false, deduped: true, reason: "line_redelivery" };
  const eventId = getStableLineMessageId(event);
  if (!eventId) return { eligible: false, deduped: false, reason: "stable_message_id_missing" };
  const lineUserId = getLineUserId({ event });
  if (!lineUserId) return { eligible: false, deduped: false, reason: "model_canary_user_missing", canary_eligible: false, rate_limited: false };
  const cohort = parseHashAllowlist(env.LINE_KENJI_MODEL_CANARY_HASHES);
  if (!cohort.valid) return { eligible: false, deduped: false, reason: "model_canary_config_malformed", canary_eligible: false, rate_limited: false };
  const userHash = await sha256Hex(lineUserId);
  if (!cohort.hashes.has(userHash)) return { eligible: false, deduped: false, reason: "model_canary_not_eligible", canary_eligible: false, rate_limited: false };

  // Console Inbox eligibility is resolved before the atomic DO claim so an
  // event rejected before model eligibility does not consume model quota.
  // The DO remains the race-safe message-id and quota correctness gate.
  const inboxController = new AbortController();
  const inboxTimer = setTimeout(() => inboxController.abort("line_inbox_dedupe_timeout"), LINE_MODEL_DEDUPE_LOOKUP_TIMEOUT_MS);
  try {
    const existing = await findExistingLineEvent(env, eventId, `line_${eventId}`, {
      signal: inboxController.signal,
      throwOnUnavailable: true,
    });
    if (existing?.id) return { eligible: false, deduped: true, reason: "message_id_processed", canary_eligible: true, rate_limited: false };
  } catch (_) {
    return { eligible: false, deduped: false, reason: "line_inbox_dedupe_unavailable", canary_eligible: true, rate_limited: false };
  } finally {
    clearTimeout(inboxTimer);
  }

  if (!env.KENJI_MODEL_DEDUPE?.idFromName || !env.KENJI_MODEL_DEDUPE?.get) {
    return { eligible: false, deduped: false, reason: "model_dedupe_binding_missing", canary_eligible: true, rate_limited: false };
  }

  const key = await sha256Hex(eventId);
  const quotaLimit = boundedInteger(env.LINE_KENJI_MODEL_MAX_ATTEMPTS_PER_WINDOW, KENJI_MODEL_QUOTA_DEFAULT_LIMIT, 1, 20);
  const quotaWindowSeconds = boundedInteger(env.LINE_KENJI_MODEL_QUOTA_WINDOW_SECONDS, KENJI_MODEL_QUOTA_DEFAULT_WINDOW_SECONDS, 60, 86400);
  const quotaWindow = Math.floor(Date.now() / (quotaWindowSeconds * 1000));
  const dedupeController = new AbortController();
  const timeout = new Promise((_, reject) => {
    const timer = setTimeout(() => {
      dedupeController.abort("kenji_model_dedupe_timeout");
      reject(Object.assign(new Error("model_dedupe_timeout"), { code: "MODEL_DEDUPE_TIMEOUT" }));
    }, KENJI_MODEL_DEDUPE_TIMEOUT_MS);
    dedupeController.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  });
  try {
    const objectId = env.KENJI_MODEL_DEDUPE.idFromName("kenji-line-model-idempotency-v1");
    const request = env.KENJI_MODEL_DEDUPE.get(objectId).fetch("https://kenji-model-dedupe.internal/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, quota_key: userHash, quota_limit: quotaLimit, quota_window: quotaWindow, quota_window_seconds: quotaWindowSeconds }),
      signal: dedupeController.signal,
    });
    const response = await Promise.race([request, timeout]);
    dedupeController.abort("kenji_model_dedupe_complete");
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok !== true) return { eligible: false, deduped: false, reason: "model_dedupe_unavailable", canary_eligible: true, rate_limited: false, quota_window: quotaWindowSeconds };
    if (result.claimed !== true) return { eligible: false, deduped: true, reason: "message_id_claimed", canary_eligible: true, rate_limited: false, quota_window: quotaWindowSeconds };
    if (result.quota_allowed !== true) return { eligible: false, deduped: false, reason: "model_quota_exceeded", canary_eligible: true, rate_limited: true, quota_window: quotaWindowSeconds };
  } catch (error) {
    dedupeController.abort("kenji_model_dedupe_failed");
    return { eligible: false, deduped: false, reason: error?.code === "MODEL_DEDUPE_TIMEOUT" ? "model_dedupe_timeout" : "model_dedupe_unavailable", canary_eligible: true, rate_limited: false, quota_window: quotaWindowSeconds };
  }

  return { eligible: true, deduped: false, reason: "", canary_eligible: true, rate_limited: false, quota_window: quotaWindowSeconds };
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
  return `https://mmdbkk.com/sigil/member/membership?source=line&entry_route=${entryRoute}${extra}`;
}

function memberLiffUrl(intent = "status", view = "profile") {
  const url = new URL(`https://liff.line.me/${MEMBER_LIFF_ID}`);
  url.searchParams.set("intent", intent);
  url.searchParams.set("view", view);
  return url.toString();
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
      { bounds: richMenuBounds(1667, 0, 833, 843), action: { type: "uri", uri: memberLiffUrl("status", "profile") } },
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
      { bounds: richMenuBounds(0, 0, 833, 843), action: { type: "uri", uri: memberLiffUrl("status", "profile") } },
      { bounds: richMenuBounds(834, 0, 833, 843), action: { type: "uri", uri: memberLiffUrl("status", "points") } },
      { bounds: richMenuBounds(1667, 0, 833, 843), action: { type: "uri", uri: memberLiffUrl("renew", "profile") } },
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

async function syncLineEventAfterReply(env, event, intent, autoReplyEnabled, kenjiEnabled) {
  const lineUserId = getLineUserId({ event });
  const shouldFetchProfile = Boolean(autoReplyEnabled && lineUserId && event?.source?.type === "user" && asString(env.LINE_CHANNEL_ACCESS_TOKEN));
  const profilePromise = shouldFetchProfile ? fetchLineProfile(env, lineUserId) : Promise.resolve(null);
  const knowledgePromise = kenjiEnabled ? fetchPublishedLineKnowledge(env) : Promise.resolve([]);
  const [profile] = await Promise.all([profilePromise, knowledgePromise]);
  return writeLineEventToConsoleInbox(env, event, profile, intent);
}

async function handleLineWebhook(request, env, ctx = null) {
  const rawBody = await request.text();
  const signature = getHeader(request.headers, "x-line-signature");
  const validSignature = await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET);

  if (!validSignature) return json({ ok: false, error: "invalid_signature" }, 401);

  // Cloudflare-only owner lock: handle LINE directly in this worker.
  // Never forward signed events to a legacy or external upstream.

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
    const eventMode = asString(event?.mode).toLowerCase() || "unknown";
    const canGenerateReply = Boolean(autoReplyEnabled && kenjiEnabled && eventMode !== "standby" && getReplyToken(event));
    const capabilityDecision = decideKenjiCapability({ text, intent });
    const needsModelPreflight = Boolean(canGenerateReply && capabilityDecision.capability === KENJI_CAPABILITIES.SAFE_CONVERSATION && isEnabled(env.LINE_KENJI_MODEL_ENABLED));
    const modelDeadlineAt = needsModelPreflight ? Date.now() + KENJI_TOTAL_DEADLINE_MS : 0;
    const modelPreflight = needsModelPreflight
      ? await claimKenjiModelEvent(env, event)
      : { eligible: true, deduped: false, reason: "", canary_eligible: false, rate_limited: false, quota_window: 0 };
    const replyDecision = canGenerateReply && !modelPreflight.deduped
      ? await resolveKenjiLineReply(event, {}, env, { forceReply: autoReplyEnabled, modelEligible: modelPreflight.eligible, deadlineAt: modelDeadlineAt })
      : { text: "", fallback: false, reply_source: null, model_attempted: false, model_success: false, model_latency_ms: 0, knowledge_hits: 0, guard_blocked: false, guard_reason: "" };
    const replyText = replyDecision.text;
    const shouldReply = Boolean(autoReplyEnabled && eventMode !== "standby" && replyText && getReplyToken(event));
    const replyResult = shouldReply ? await sendLineReply(env, getReplyToken(event), replyText, { trusted_event: true }) : null;

    const afterReply = syncLineEventAfterReply(env, event, intent, autoReplyEnabled, kenjiEnabled);
    const canDefer = typeof ctx?.waitUntil === "function";
    let record = { pending: canDefer, deduped: false };
    if (canDefer) {
      ctx.waitUntil(afterReply.catch(() => {
        console.log(JSON.stringify({
          line_webhook: "background_sync_failed",
          event_type: asString(event?.type) || "unknown",
          intent,
        }));
      }));
    } else {
      try {
        record = await afterReply;
      } catch (_) {
        record = { skipped: true, reason: "airtable_sync_failed", deduped: false };
      }
    }

    // Safe operational telemetry: never log message text, user IDs, reply tokens, or secrets.
    // This makes a silent LINE reply diagnosable from `wrangler tail` without exposing customer data.
    console.log(JSON.stringify({
      line_webhook: "reply_diagnostics",
      event_type: asString(event?.type) || "unknown",
      event_mode: eventMode,
      redelivered: Boolean(event?.deliveryContext?.isRedelivery),
      intent,
      auto_reply_enabled: autoReplyEnabled,
      per_voice_enabled: kenjiEnabled,
      reply_token_present: Boolean(getReplyToken(event)),
      inbox_deduped: Boolean(record?.deduped),
      reply_candidate: Boolean(replyText),
      reply_attempted: shouldReply,
      reply_sent: Boolean(replyResult?.ok),
      reply_status: Number.isInteger(replyResult?.status) ? replyResult.status : null,
      reply_error: asString(replyResult?.error) || null,
      reply_source: replyDecision.reply_source || null,
      model_attempted: Boolean(replyDecision.model_attempted),
      model_success: Boolean(replyDecision.model_success),
      model_latency_ms: Number(replyDecision.model_latency_ms) || 0,
      knowledge_hits: Number(replyDecision.knowledge_hits) || 0,
      guard_blocked: Boolean(replyDecision.guard_blocked),
      guard_reason: asString(replyDecision.guard_reason) || null,
      capability: capabilityDecision.capability,
      requested_domain: capabilityDecision.requested_domain,
      protected_context: capabilityDecision.capability === KENJI_CAPABILITIES.PROTECTED_AUTHORITY || capabilityDecision.capability === KENJI_CAPABILITIES.HUMAN_HANDOFF,
      model_output_guard_reason: replyDecision.model_attempted ? (asString(replyDecision.guard_reason) || null) : null,
      model_deduped: Boolean(modelPreflight.deduped),
      model_dedupe_reason: asString(modelPreflight.reason) || null,
      model_canary_eligible: Boolean(modelPreflight.canary_eligible),
      model_rate_limited: Boolean(modelPreflight.rate_limited),
      model_quota_window: Number(modelPreflight.quota_window) || 0,
    }));

    saved.push({
      ok: true,
      type: event?.type || "",
      intent,
      deduped: Boolean(record?.deduped),
      recorded: Boolean(record?.id),
      record_pending: Boolean(record?.pending),
      record_skipped: Boolean(record?.skipped),
      replied: Boolean(replyResult?.ok),
      line_user: Boolean(lineUserId),
      message_id: getLineEventId(event),
    });
  }

  return json({ ok: true, worker: WORKER_NAME, route: "line_webhook", events: events.length, saved });
}

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);

    if (isRenewalRoute(url.pathname)) {
      return renderRenewalResponse(request, env);
    }

    if (url.pathname.startsWith(MEMBER_LIFF_PREFIX) || MEMBER_LIFF_SHELL_PATHS.has(url.pathname) || MEMBER_DASHBOARD_API_PATHS.has(url.pathname)) {
      return handleMemberLiffFrontGate(request, env);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, worker: WORKER_NAME });
    }

    if (request.method === "GET" && LINE_WEBHOOK_PATHS.has(url.pathname)) {
      return json({ ok: true, worker: WORKER_NAME, route: "line_webhook" });
    }

    if (request.method === "POST" && LINE_WEBHOOK_PATHS.has(url.pathname)) {
      return handleLineWebhook(request, env, ctx);
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
