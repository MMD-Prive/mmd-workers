const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const MAX_WEBHOOK_BYTES = 64 * 1024;

const SAFE_REPLIES = Object.freeze({
  booking: "สวัสดีครับ พี่เฮนน่ารับเรื่องให้ได้ครับ 💚\nหากต้องการจองบริการ กดส่งคำขอจองพร้อมแจ้งวันที่ เวลา พื้นที่ และบริการที่สนใจได้เลยครับ ทีม MMS จะตรวจคิวและยืนยันกลับอีกครั้ง",
  services: "MMS มีบริการนวดถึงที่แบบเป็นส่วนตัวครับ ทั้ง Aroma Oil, Thai, Sport, Office Syndrome, Health/Fitness Advisor, Herbal Compress, Partner-Present และ Women Massage\n\nบอกพี่เฮนน่าได้เลยครับว่าสนใจแบบไหน และต้องการรับบริการบริเวณไหน 💚",
  apply: "สนใจสมัครเป็น Therapist กับ MMS ได้เลยครับ 💚\nกรอกข้อมูลผ่านหน้าใบสมัครอย่างเป็นส่วนตัว แล้วทีมงานจะตรวจประสบการณ์ ทักษะ และติดต่อกลับเป็นรายบุคคลครับ\nhttps://www.mmdbkk.com/apply/mms-therapist",
  how_to: "MMS เป็นบริการส่ง Therapist ที่ผ่านการคัดเลือกไปดูแลคุณตามสถานที่นัดหมายครับ ขั้นแรกส่งคำขอจอง จากนั้นทีมงานจะตรวจบริการ พื้นที่ และคิว Therapist ก่อนยืนยันทุกครั้ง\n\nดูวิธีใช้บริการ: https://www.mmdbkk.com/male-massage/how-to-use",
});

export function lineBotStatus(env) {
  const channelSecret = clean(env.LINE_CHANNEL_SECRET);
  const accessToken = clean(env.LINE_CHANNEL_ACCESS_TOKEN);
  return {
    configured: Boolean(channelSecret && accessToken),
    channel_id: clean(env.MMS_LINE_CHANNEL_ID),
    auto_reply_enabled: enabled(env.LINE_AUTO_REPLY_ENABLED),
    persona: "HENNA",
  };
}

export function classifyHennaIntent(input) {
  const text = normalize(input);
  if (!text) return "ignore";
  if (matches(text, ["สมัคร", "สมัครงาน", "therapist", "job", "ร่วมงาน"])) return "apply";
  if (matches(text, ["วิธีใช้", "ใช้งานยังไง", "ขั้นตอน", "how to", "howto"])) return "how_to";
  if (matches(text, ["บริการอะไร", "มีบริการ", "ประเภทนวด", "นวดอะไร", "service"])) return "services";
  if (matches(text, ["จอง", "นัด", "book", "booking", "เรียก therapist"])) return "booking";
  if (matches(text, ["ราคา", "เท่าไหร่", "ค่าบริการ", "เรท", "price", "rate"])) return "manual_price";
  if (matches(text, ["ว่างไหม", "ใครว่าง", "คิวว่าง", "วันนี้ว่าง", "พรุ่งนี้ว่าง", "available", "availability"])) return "manual_availability";
  if (matches(text, ["แอดมิน", "เจ้าหน้าที่", "คุยกับคน", "คุยกับเปอร์", "พี่เปอร์", "human", "admin"])) return "manual_handoff";
  return "manual_unknown";
}

export function hennaReply(intent) {
  return SAFE_REPLIES[intent] || "";
}

export async function handleMmsLineWebhook(request, env) {
  const rawBody = await readWebhookBody(request);
  const signature = clean(request.headers.get("x-line-signature"));
  const channelSecret = clean(env.LINE_CHANNEL_SECRET);
  if (!channelSecret || !(await verifyLineSignature(rawBody, signature, channelSecret))) {
    return response({ ok: false, error: "invalid_signature" }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return response({ ok: false, error: "invalid_json" }, 400);
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  const results = [];
  for (const event of events) {
    if (event?.type !== "message" || event?.message?.type !== "text") continue;
    const intent = classifyHennaIntent(event.message.text);
    const reply = hennaReply(intent);
    const manual = intent.startsWith("manual_");

    if (manual) {
      await notifyManualHandoff(env, event, intent);
      results.push({ intent, action: "manual_handoff" });
      continue;
    }

    if (!reply || !enabled(env.LINE_AUTO_REPLY_ENABLED)) {
      results.push({ intent, action: "no_reply" });
      continue;
    }

    const sent = await replyLine(env, event.replyToken, reply);
    results.push({ intent, action: sent ? "replied" : "reply_failed" });
  }

  return response({ ok: true, persona: "HENNA", processed: results.length, results }, 200);
}

export async function verifyLineSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return constantTimeEqual(base64(digest), signature);
}

async function replyLine(env, replyToken, text) {
  const token = clean(env.LINE_CHANNEL_ACCESS_TOKEN);
  if (!token || !replyToken) return false;
  const result = await fetch(LINE_REPLY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
  if (!result.ok) {
    console.error(JSON.stringify({ event: "mms_line_reply_failed", status: result.status }));
  }
  return result.ok;
}

async function notifyManualHandoff(env, event, intent) {
  const botToken = clean(env.TELEGRAM_BOT_TOKEN);
  const chatId = clean(env.MMS_TELEGRAM_CHAT_ID);
  if (!botToken || !chatId) return false;
  const sourceType = clean(event?.source?.type || "user").slice(0, 24);
  const messageId = clean(event?.message?.id || "unknown").slice(0, 80);
  const result = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: [
        "🐔 HENNA · MMS LINE ต้องการคนรับช่วง",
        `เหตุผล: ${intent}`,
        `Source: ${sourceType}`,
        `Message ref: ${messageId}`,
        "เปิด LINE Official Account Manager เพื่อตอบลูกค้าครับ",
      ].join("\n"),
      disable_web_page_preview: true,
    }),
  });
  if (!result.ok) console.error(JSON.stringify({ event: "mms_line_handoff_notify_failed", status: result.status }));
  return result.ok;
}

async function readWebhookBody(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_WEBHOOK_BYTES) throw new Error("LINE_WEBHOOK_TOO_LARGE");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_WEBHOOK_BYTES) throw new Error("LINE_WEBHOOK_TOO_LARGE");
  return body;
}

function response(body, status) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function matches(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function clean(value) {
  return String(value || "").replace(/[\r\n\u2028\u2029]/g, "").trim();
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function base64(buffer) {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}
