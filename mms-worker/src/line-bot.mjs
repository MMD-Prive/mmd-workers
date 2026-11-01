import { CONCIERGE_CAPABILITY_PACK_VERSION, detectSharedConciergeCapability } from "../../shared/concierge-capability-pack-v1.mjs";
import { RECOVERY_OUTCOME_TAXONOMY_VERSION } from "../../shared/recovery-outcome-taxonomy-v1.mjs";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const MAX_WEBHOOK_BYTES = 64 * 1024;

const SAFE_REPLIES = Object.freeze({
  home: "อยากรู้จัก Male Massage ก่อน เริ่มที่นี่ได้เลยครับ 💚\nhttps://www.mmdbkk.com/male-massage/home",
  booking: "พร้อมให้ MMS ดูแลแล้ว ส่งคำขอจองพร้อมวัน เวลา พื้นที่ และบริการที่สนใจได้ที่นี่ครับ 💚\nhttps://www.mmdbkk.com/male-massage/member/mms-booking\nการส่งคำขอยังไม่ใช่การยืนยันคิว MMS จะตรวจรายละเอียดก่อนครับ",
  services: "ดูบริการ MMS และเลือกแนวทางที่เหมาะกับคุณได้ที่นี่ครับ 💚\nhttps://www.mmdbkk.com/male-massage/therapists/mms\nถ้าต้องการคิวหรือรายละเอียดเฉพาะงาน ให้ MMS ตรวจสอบอีกครั้งครับ",
  my_mms: "MY MMS เป็นพื้นที่ของคุณใน LINE ครับ เปิด Mini App แล้วยืนยันตัวตนก่อนดูข้อมูลที่เชื่อมกับบัญชีของคุณ 💚\nhttps://www.mmdbkk.com/male-massage/my-mms",
  recruit: "สนใจทำงานกับ MMS ลองดูภาพรวมของ Therapist ก่อนครับ ว่างานเป็นแบบไหน แล้วค่อยตัดสินใจสมัคร 💚\nhttps://www.mmdbkk.com/therapists",
  benefits: "อยากรู้ว่าการเป็น MMS Therapist มีอะไรดี ดูหน้านี้ได้เลยครับ 💚\nhttps://www.mmdbkk.com/apply/mms-therapist-benefits\nจำนวนงานและรายได้ขึ้นกับงานจริง MMS ไม่รับประกันล่วงหน้าครับ",
  rules: "ก่อนรับงาน ลองอ่าน Therapist Rules ให้ครบครับ โดยเฉพาะ Brief อุปกรณ์ และการดูแลลูกค้าจนจบงาน 💚\nhttps://www.mmdbkk.com/apply/mms-therapist-rules",
  fast_track: "ยังอยากเตรียมทักษะนวดก่อนเริ่มงาน ดู MMS Fast Track ได้ครับ 💚\nhttps://www.mmdbkk.com/male-massage/apply/mms-fast-track\nรอบเรียนและที่นั่งให้ MMS ยืนยันตามข้อมูลปัจจุบันครับ",
  apply: "พร้อมสมัคร MMS Therapist แล้ว เปิดใบสมัครที่นี่ได้เลยครับ 💚\nhttps://www.mmdbkk.com/apply/mms-therapist\nส่งใบสมัครแล้ว MMS จะตรวจเป็นรายคน การส่งฟอร์มยังไม่ใช่การอนุมัติหรือเปิดรับงานทันทีครับ",
  therapist_login: "ถ้าเป็น MMS Therapist ที่อนุมัติแล้ว เข้า MY Therapist ผ่านหน้านี้ครับ 💚\nhttps://www.mmdbkk.com/male-massage/therapists/login\nใช้ LINE ที่เชื่อมกับโปรไฟล์ MMS; ถ้ายังเข้าไม่ได้ ให้ MMS ตรวจสิทธิ์ก่อนครับ",
  how_to: "อยากรู้ขั้นตอนใช้บริการ MMS ดูหน้านี้ได้เลยครับ 💚\nhttps://www.mmdbkk.com/male-massage/how-to-use\nส่งคำขอจองแล้ว MMS จะตรวจพื้นที่และคิวก่อนยืนยันครับ",
  shop_orders: "เรื่อง MMD Shop ให้เช็กจาก MY MMD โดยตรงนะครับ เพราะสถานะ Order/Payment เป็นข้อมูลสมาชิก\nhttps://www.mmdbkk.com/my-mmd/orders\nถ้าต้องการคุยข้ามระบบต่อ ใช้ HYPE @mmdprivebot ได้ครับ",
  care_back_coupon: "CARE BACK / Coupon เป็นสิทธิ์สมาชิก MMD ครับ พี่เฮนน่ารู้ทางส่งต่อ แต่จะไม่เปิดหรือสร้างสิทธิ์แทนระบบ\nCARE BACK: https://www.mmdbkk.com/promotion/6-years-care-back\nCoupon Wallet: https://www.mmdbkk.com/my-mmd/coupons",
  mms_therapist_options: "อยากให้ MMS ช่วยดูตัวเลือก Therapist ส่งวัน เวลา พื้นที่ และบริการที่สนใจผ่านหน้านี้ได้ครับ 💚\nhttps://www.mmdbkk.com/male-massage/member/mms-booking\nตัวเลือกและคิวต้องให้ MMS ตรวจจากข้อมูลปัจจุบัน ยังไม่ถือว่า Confirm Therapist จนกว่าจะยืนยันครับ",
  hall_model_discovery: "ถ้าหมายถึง Model ฝั่ง MMD Privé ไม่ใช่ MMS ให้เลือกมุมมองผ่าน Hall ก่อนนะครับ HENNA จะไม่เดาเพศ/มุมมองหรือดึง Model ทั้งหมดมาให้\nhttps://www.mmdbkk.com/hall\nเรื่องข้ามระบบใช้ HYPE @mmdprivebot ได้ครับ",
  points_coupon_balance: "Points / Coupon ของ MMD เป็นข้อมูลสมาชิกครับ พี่เฮนน่าจะไม่เดายอดจากแชต MMS และจะไม่อ่าน wallet ของ MMD เอง\nถ้าต้องการดูยอดที่ยืนยันแล้ว เปิด HYPE @mmdprivebot แบบ private ได้ครับ — HYPE อ่านเฉพาะ bounded canonical wallet หลังยืนยันตัวตน\nPoints: https://www.mmdbkk.com/my-mmd/points\nCoupons: https://www.mmdbkk.com/my-mmd/coupons",
});

export function lineBotStatus(env) {
  const channelSecret = clean(env.LINE_CHANNEL_SECRET);
  const accessToken = clean(env.LINE_CHANNEL_ACCESS_TOKEN);
  return {
    configured: Boolean(channelSecret && accessToken),
    channel_id: clean(env.MMS_LINE_CHANNEL_ID),
    auto_reply_enabled: enabled(env.LINE_AUTO_REPLY_ENABLED),
    persona: "HENNA",
    capability_pack: CONCIERGE_CAPABILITY_PACK_VERSION,
    recovery_outcome_taxonomy: RECOVERY_OUTCOME_TAXONOMY_VERSION,
  };
}

export function classifyHennaIntent(input) {
  const text = normalize(input);
  if (!text) return "ignore";

  if (matches(text, ["my therapist", "mytherapist", "เข้าแอป therapist", "เข้าแอปเทอราปิส", "login therapist", "เข้าสู่ระบบ therapist", "งานใกล้คุณ", "เปิดรับงาน", "offline therapist", "online therapist"])) return "therapist_login";
  if (matches(text, ["my mms", "mymms", "mini app", "มินิแอป", "แอปสมาชิก mms"])) return "my_mms";
  if (matches(text, ["fast track", "fast-track", "ฟาสต์แทร็ก", "เรียนการนวด", "เรียนก่อนทำงาน", "ฝึกนวด"])) return "fast_track";
  if (matches(text, ["therapist rules", "กติกา therapist", "กฎ therapist", "ข้อกำหนด therapist", "กฎการทำงาน", "กติกาการทำงาน"])) return "rules";
  if (matches(text, ["benefits therapist", "ข้อดีของ therapist", "สิทธิประโยชน์ therapist", "ประโยชน์ therapist", "ข้อดีของงาน", "สิทธิประโยชน์งาน"])) return "benefits";
  if (matches(text, ["อยากเป็น therapist", "งาน therapist", "งานเทอราปิส", "ทำงานกับ mms", "ร่วมงานกับ mms", "งานเสริม mms"])) return "recruit";

  const sharedCapability = detectSharedConciergeCapability(text);
  if (sharedCapability === "shop_orders") return "shop_orders";
  if (sharedCapability === "care_back_coupon") return "care_back_coupon";
  if (sharedCapability === "mms_therapist_options") return "mms_therapist_options";
  if (sharedCapability === "service_recovery") return "manual_recovery";
  if (sharedCapability === "closed_loop_handoff") return "manual_handoff_status";
  if (sharedCapability === "hall_model_discovery") return "hall_model_discovery";
  if (sharedCapability === "points_coupon_balance") return "points_coupon_balance";
  if (matches(text, ["male massage คือ", "mms คือ", "รู้จัก mms", "หน้าแรก mms", "เว็บ mms"])) return "home";
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
  const service = env.TELEGRAM_WORKER;
  const token = clean(env.AUTH_SERVICE_MMS_TO_TELEGRAM);
  if (!service || typeof service.fetch !== "function" || !token) return false;
  const sourceType = clean(event?.source?.type || "user").slice(0, 24);
  const messageId = clean(event?.message?.id || "unknown").slice(0, 80);
  const result = await service.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      flow: intent === "manual_recovery" ? "recovery" : "mms_manual_handoff",
      text: [
        "🐔 HENNA · MMS LINE ต้องการคนรับช่วง",
        `เหตุผล: ${intent}`,
        `Source: ${sourceType}`,
        `Message ref: ${messageId}`,
        intent === "manual_recovery"
          ? "Recovery นี้ให้คง context เดิมและใช้ HYPE/MMD Case lifecycle + canonical outcome taxonomy; ห้ามสรุป resolved/refund/rebooking จากข้อความอย่างเดียว"
          : "เปิด LINE Official Account Manager เพื่อตอบลูกค้าครับ",
      ].join("\n"),
      disable_web_page_preview: true,
    }),
  }));
  const body = await result.json().catch(() => ({}));
  const ok = result.ok && body?.ok === true && body?.telegram?.ok === true;
  if (!ok) console.error(JSON.stringify({ event: "mms_line_handoff_notify_failed", status: result.status }));
  return ok;
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
