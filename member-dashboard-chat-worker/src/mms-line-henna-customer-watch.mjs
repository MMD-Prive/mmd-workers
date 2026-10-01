import { MMS_LINE_RUNTIME_INTERNALS } from "./mms-line-runtime.mjs";

export const HENNA_CUSTOMER_WATCH_VERSION = "henna-customer-watch-mms-wms-v1-20261001";

const MMS_WEBHOOK_PATHS = new Set(["/webhooks/line/mms", "/webhooks/line/mms/"]);
const WMS_EXPLICIT_RE = /(?:\bwms\b|women\s*massage|woman\s*massage|female\s*(?:client|customer|massage)|นวดผู้หญิง|ลูกค้าผู้หญิง|ผู้หญิงจอง|สำหรับผู้หญิง|女性.*(?:按摩|预约|預約)|女士.*(?:按摩|预约|預約))/i;
const BOOKING_RE = /(?:จอง|นัด|book(?:ing)?|pre[- ]?booking|预约|預約)/i;
const LIVE_TRUTH_RE = /(?:ราคา|ค่าบริการ|เรท|price|rate|how much|多少钱|多少錢|价格|價格|ว่างไหม|ใครว่าง|คิวว่าง|available|availability|จ่ายแล้ว|โอนแล้ว|payment status|paid|付款|支付|booking status|confirmed|คอนเฟิร์ม|确认|確認)/i;
const RECOVERY_RE = /(?:มีปัญหา|ปัญหา|ร้องเรียน|complaint|support|ช่วยด้วย|ไม่มา|มาสาย|ผิดนัด|refund|คืนเงิน|เปลี่ยน therapist|rebook|服务.*问题|服務.*問題|投诉|投訴)/i;
const HUMAN_RE = /(?:คุยกับเปอร์|พี่เปอร์|คุยกับคน|แอดมิน|เจ้าหน้าที่|human|admin|operator|人工客服)/i;
const THERAPIST_RE = /(?:therapist|นักนวด|นักบำบัด|เลือกคน|หา therapist|按摩师|按摩師)/i;
const SERVICE_RE = /(?:บริการ|service|massage|นวด|office syndrome|sport|aroma|herbal|partner[- ]?present|按摩)/i;

function text(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalized(value) {
  return text(value, 2000).normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
}

function pathOf(request) {
  try {
    return new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
  } catch (_) {
    return "";
  }
}

function languageOf(value) {
  const raw = text(value, 2000);
  if (/[\u4e00-\u9fff]/.test(raw)) return "zh";
  if (/[ก-๙]/.test(raw)) return "th";
  return "en";
}

async function sha256Short(value, length = 16) {
  const raw = text(value, 2000);
  if (!raw) return "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, length);
}

export function detectHennaCustomerLane(value = "") {
  return WMS_EXPLICIT_RE.test(normalized(value)) ? "wms" : "mms";
}

export function classifyHennaCustomerSignal(value = "", event = {}) {
  const raw = normalized(value);
  const postback = normalized(event?.postback?.data);
  const combined = [raw, postback].filter(Boolean).join(" ");
  if (!combined) return "";
  if (RECOVERY_RE.test(combined) || postback === "mms:menu:support") return "service_recovery";
  if (HUMAN_RE.test(combined)) return "human_handoff";
  if (LIVE_TRUTH_RE.test(combined)) return "live_truth_request";
  if (BOOKING_RE.test(combined) || postback === "mms:menu:my_booking") return "booking_interest";
  if (THERAPIST_RE.test(combined)) return "therapist_options";
  if (WMS_EXPLICIT_RE.test(combined)) return "wms_interest";
  if (SERVICE_RE.test(combined) || postback === "mms:menu:services") return "service_interest";
  return "";
}

function priorityFor(signal) {
  if (["service_recovery", "human_handoff", "live_truth_request"].includes(signal)) return "needs_review";
  if (["booking_interest", "therapist_options", "wms_interest"].includes(signal)) return "lead";
  return "observe";
}

async function sendHennaWatch(env = {}, event = {}, { lane, signal, language }) {
  const service = env.TELEGRAM_WORKER;
  const token = text(env.AUTH_SERVICE_LINE_TO_TELEGRAM || env.INTERNAL_TOKEN, 4096);
  if (!service || typeof service.fetch !== "function") return { ok: false, skipped: true, reason: "telegram_binding_missing" };
  if (!token) return { ok: false, skipped: true, reason: "telegram_auth_missing" };

  const sourceId = text(event?.source?.userId || event?.source?.groupId || event?.source?.roomId, 1000);
  const eventId = text(event?.message?.id || event?.webhookEventId || event?.replyToken, 1000);
  const customerRef = await sha256Short(sourceId, 16);
  const eventRef = await sha256Short(eventId, 16);
  const laneLabel = lane === "wms" ? "WMS" : "MMS";
  const priority = priorityFor(signal);

  const payload = {
    flow: "henna_customer_watch",
    text: [
      `🐔 HENNA · CUSTOMER WATCH · ${laneLabel}`,
      `Signal: ${signal}`,
      `Priority: ${priority}`,
      `Language: ${language}`,
      `Customer ref: ${customerRef}`,
      `Event ref: ${eventRef}`,
      "Source: LINE OA",
      "Mode: watch → verify → handoff",
      "Truth: mms-worker / current canonical state",
      "business_truth_mutated=false",
      "",
      priority === "needs_review"
        ? "ตรวจ current truth ก่อนตอบ/ตัดสินใจ และรับช่วงใน LINE OA เมื่อจำเป็น"
        : "ติดตาม lead จาก current MMS/WMS context โดยไม่เดาคิว ราคา หรือสถานะ",
    ].join("\n"),
    disable_web_page_preview: true,
  };

  const response = await service.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })).catch(() => null);

  const body = await response?.json?.().catch(() => ({}));
  const ok = Boolean(response?.ok && body?.ok === true && body?.telegram?.ok === true);
  if (!ok) {
    console.log(JSON.stringify({
      henna_customer_watch: "delivery_failed",
      lane,
      signal,
      status: Number(response?.status) || 0,
    }));
  }
  return ok ? { ok: true, lane, signal } : { ok: false, lane, signal, reason: "telegram_delivery_failed" };
}

export async function observeHennaCustomerWatch(request, env = {}) {
  if (String(request?.method || "GET").toUpperCase() !== "POST" || !MMS_WEBHOOK_PATHS.has(pathOf(request))) {
    return { ok: true, skipped: true, reason: "not_mms_webhook_post" };
  }

  const rawBody = await request.text();
  const signature = text(request.headers.get("x-line-signature"), 256);
  const secret = text(env.MMS_LINE_CHANNEL_SECRET, 512);
  if (!secret || !(await MMS_LINE_RUNTIME_INTERNALS.verifyLineSignature(rawBody, signature, secret))) {
    return { ok: false, skipped: true, reason: "signature_rejected" };
  }

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (_) {
    return { ok: false, skipped: true, reason: "invalid_json" };
  }

  const summary = { ok: true, notified: 0, skipped: 0, failed: 0, lanes: { mms: 0, wms: 0 } };
  for (const event of Array.isArray(body?.events) ? body.events : []) {
    if (event?.deliveryContext?.isRedelivery === true || event?.source?.type !== "user") {
      summary.skipped += 1;
      continue;
    }

    const messageText = event?.type === "message" && event?.message?.type === "text"
      ? text(event.message.text, 2000)
      : "";
    const postbackData = event?.type === "postback" ? text(event?.postback?.data, 1000) : "";
    if (!messageText && !postbackData) {
      summary.skipped += 1;
      continue;
    }

    const input = [messageText, postbackData].filter(Boolean).join(" ");
    const signal = classifyHennaCustomerSignal(input, event);
    if (!signal) {
      summary.skipped += 1;
      continue;
    }

    const lane = detectHennaCustomerLane(input);
    const language = languageOf(messageText || postbackData);
    const result = await sendHennaWatch(env, event, { lane, signal, language });
    if (result.ok) {
      summary.notified += 1;
      summary.lanes[lane] += 1;
    } else if (result.skipped) {
      summary.skipped += 1;
    } else {
      summary.failed += 1;
    }
  }

  return summary;
}

export const HENNA_CUSTOMER_WATCH_INTERNALS = Object.freeze({
  detectHennaCustomerLane,
  classifyHennaCustomerSignal,
  languageOf,
  priorityFor,
  version: HENNA_CUSTOMER_WATCH_VERSION,
});
