/** Verified Member Concierge + Safe Reply Generator v1. Read-only and fail-closed. */
const CLOSED = new Set(["blocked","suspended","revoked","ambiguous","unresolved","needs_review"]);
const LEVELS = new Set(["guest","public","private"]);
const INTENTS = new Set(["support","membership","renewal","payment_proof","booking","talk_to_per","kenji_ai","about_mmd"]);
const clean = (v) => String(v ?? "").trim();
export function canonicalRichMenuIntent(input = {}) {
  const raw = clean(input.intent || input.postback_intent || input.data).toLowerCase();
  const map = { "support":"support","mmd_support":"support","membership":"membership","join":"membership","renew":"renewal","payment":"payment_proof","payment_proof":"payment_proof","book":"booking","booking":"booking","talk_to_per":"talk_to_per","per":"talk_to_per","kenji_ai":"kenji_ai","about":"about_mmd" };
  return map[raw] || (INTENTS.has(raw) ? raw : "support");
}
export function resolveReplyPolicy(input = {}) {
  const level = clean(input.level || input.membership_level).toLowerCase() || "guest";
  const identity = clean(input.identity_state).toLowerCase() || "unresolved";
  const membership = clean(input.membership_state).toLowerCase() || "unresolved";
  const blocked = CLOSED.has(identity) || CLOSED.has(membership) || !LEVELS.has(level);
  return { level: LEVELS.has(level) ? level : "guest", blocked, allow_private: !blocked && level === "private", allow_member_data: !blocked && level !== "guest" };
}
export function generateSafeReply(input = {}) {
  const intent = canonicalRichMenuIntent(input);
  const policy = resolveReplyPolicy(input);
  const name = clean(input.display_name);
  const greeting = name ? `สวัสดีครับคุณ${name}` : "สวัสดีครับ";
  const activeMember = policy.allow_member_data;

  if (policy.blocked) {
    return { text: "ขออนุญาตตรวจสอบบัญชีสมาชิกผ่านช่องทางทางการก่อนนะครับ เพื่อความถูกต้องและความเป็นส่วนตัว", silent: false, intent, level: policy.level, next_action: "verify_identity", source: "verified_member_concierge_v1" };
  }

  // Guest acquisition is deliberately Public-only and is spoken by HITO.
  if (!activeMember) {
    const guestText = `${greeting}\nผม HITO ครับ\n\nถ้าอยากเริ่มใช้ MMD แบบเป็นสมาชิก Public ผมช่วยแนะนำขั้นตอนที่เหมาะกับคุณได้ครับ\nสมัคร Public Package เพื่อเปิดการเข้าถึงข้อมูลสมาชิกและบริการของ MMD ได้เลยครับ`;
    return { text: guestText, silent: false, intent, level: policy.level, next_action: "membership_signup", source: "verified_member_concierge_v1" };
  }

  if (intent === "talk_to_per") {
    return { text: "ได้ครับ ส่งรายละเอียดให้เปอร์ดูต่อได้เลยครับ", silent: false, intent, level: policy.level, next_action: "human_handoff", source: "verified_member_concierge_v1" };
  }
  if (intent === "payment_proof") {
    return { text: "ส่งหลักฐานการชำระเงินมาได้เลยครับ เปอร์จะให้ระบบตรวจและจับคู่รายการอย่างเป็นทางการก่อนยืนยันครับ", silent: false, intent, level: policy.level, next_action: "verify_payment", source: "verified_member_concierge_v1" };
  }
  if (intent === "renewal") {
    return { text: "ได้ครับ เปอร์จะตรวจสถานะและขั้นตอนที่ตรงกับบัญชีนี้ก่อนครับ", silent: false, intent, level: policy.level, next_action: "renew_membership", source: "verified_member_concierge_v1" };
  }
  if (intent === "booking") {
    return { text: `ได้ครับ${name ? ` คุณ${name}` : ""} ส่งบริการ วันที่ เวลา และโซนมาได้เลยครับ เปอร์จะจัดบรีฟเพื่อตรวจความพร้อมก่อนยืนยันครับ`, silent: false, intent, level: policy.level, next_action: "collect_booking_brief", source: "verified_member_concierge_v1" };
  }
  if (intent === "kenji_ai" && policy.allow_private) {
    return { text: "ได้ครับ ถ้าเรื่องนี้ต้องดูรายละเอียดต่อ Kenji ช่วยเปอร์ประสานให้ได้ครับ", silent: false, intent, level: policy.level, next_action: "kenji_private_assist", source: "verified_member_concierge_v1" };
  }

  return {
    text: `${greeting}\nวันนี้ให้เปอร์ช่วยเรื่องงาน การนัดหมาย การเข้าถึงรายการที่เหมาะกับบัญชี หรือประสานเรื่องส่วนตัวได้เลยครับ`,
    silent: false,
    intent,
    level: policy.level,
    next_action: "continue",
    source: "verified_member_concierge_v1",
  };
}
export { CLOSED, LEVELS, INTENTS };
