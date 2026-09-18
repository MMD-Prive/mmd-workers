/** Verified Member Concierge + Safe Reply Generator v1. Read-only and fail-closed. */
const CLOSED = new Set(["blocked","suspended","revoked","ambiguous","unresolved","needs_review","pending"]);
const LEVELS = new Set(["guest","public","private"]);
const ACTIVE_MEMBER_STATES = new Set(["active","expiring_soon"]);
const RENEWAL_DUE_STATES = new Set(["expiring_soon","grace","expired","due","eligible"]);
const INTENTS = new Set(["support","membership","renewal","payment_proof","booking","talk_to_per","kenji_ai","about_mmd"]);
const clean = (v) => String(v ?? "").trim();

export function canonicalRichMenuIntent(input = {}) {
  const raw = clean(input.intent || input.postback_intent || input.data).toLowerCase();
  const map = {
    support: "support",
    mmd_support: "support",
    greeting: "support",
    note_only: "support",
    new_follow: "support",
    postback: "support",
    line_event: "support",
    talk_to_per_ai: "support",
    membership: "membership",
    join: "membership",
    membership_signup: "membership",
    renew: "renewal",
    renewal: "renewal",
    membership_renewal: "renewal",
    payment: "payment_proof",
    payment_proof: "payment_proof",
    book: "booking",
    booking: "booking",
    talk_to_per: "talk_to_per",
    per: "talk_to_per",
    per_continuity: "talk_to_per",
    kenji_ai: "kenji_ai",
    about: "about_mmd",
    about_mmd: "about_mmd",
  };
  // Preserve specialized deterministic intents (privacy, availability, human handoff,
  // internal access, etc.) instead of collapsing them into generic support.
  return map[raw] || (INTENTS.has(raw) ? raw : (raw || "support"));
}

export function resolveReplyPolicy(input = {}) {
  const level = clean(input.level || input.membership_level).toLowerCase() || "guest";
  const identity = clean(input.identity_state).toLowerCase() || "unresolved";
  const membership = clean(input.membership_state).toLowerCase() || "unresolved";
  const validLevel = LEVELS.has(level);
  const blocked = CLOSED.has(identity) || CLOSED.has(membership) || !validLevel;
  const active_member = !blocked && level !== "guest" && ACTIVE_MEMBER_STATES.has(membership);
  const renewal_due = !blocked && level !== "guest" && RENEWAL_DUE_STATES.has(membership);
  return {
    level: validLevel ? level : "guest",
    blocked,
    active_member,
    renewal_due,
    allow_private: active_member && level === "private",
    allow_member_data: active_member,
  };
}

export function generateSafeReply(input = {}) {
  const intent = canonicalRichMenuIntent(input);
  const policy = resolveReplyPolicy(input);
  const name = clean(input.display_name);
  const greeting = name ? `สวัสดีครับคุณ${name}` : "สวัสดีครับ";

  if (policy.blocked) {
    return { text: "ขออนุญาตตรวจสอบบัญชีสมาชิกผ่านช่องทางทางการก่อนนะครับ เพื่อความถูกต้องและความเป็นส่วนตัว", silent: false, intent, level: policy.level, next_action: "verify_identity", source: "verified_member_concierge_v1" };
  }

  // Specialized deterministic intents must keep their existing guard/response.
  // Returning an empty text lets the LINE runtime fall through to buildKenjiLineReply.
  if (!INTENTS.has(intent)) {
    return { text: "", silent: true, intent, level: policy.level, next_action: "preserve_existing_intent", source: "verified_member_concierge_v1" };
  }

  // Guest acquisition is deliberately Public-only and is spoken by HITO.
  if (policy.level === "guest") {
    const guestText = `${greeting}\nผม HITO ครับ\n\nถ้าอยากเริ่มใช้ MMD แบบเป็นสมาชิก Public ผมช่วยแนะนำขั้นตอนที่เหมาะกับคุณได้ครับ\nสมัคร Public Package เพื่อเปิดการเข้าถึงข้อมูลสมาชิกและบริการของ MMD ได้เลยครับ`;
    return { text: guestText, silent: false, intent, level: policy.level, next_action: "membership_signup", source: "verified_member_concierge_v1" };
  }

  // Expiring-soon members may remain active while renewal is due. Grace/expired
  // members are restricted: renewal can be offered, but no Private/member visibility is granted.
  if (intent === "renewal" && policy.renewal_due) {
    return { text: `${greeting}\nสถานะบัญชีนี้เข้าเงื่อนไขให้ตรวจเรื่องต่ออายุได้ครับ เปอร์จะเช็กวันหมดอายุและขั้นตอนที่ตรงกับบัญชีก่อนยืนยัน`, silent: false, intent, level: policy.level, next_action: "renew_membership", source: "verified_member_concierge_v1" };
  }

  if (!policy.active_member) {
    if (policy.renewal_due) {
      return { text: `${greeting}\nตอนนี้บัญชีอยู่ในสถานะที่ต้องตรวจเรื่องต่ออายุก่อนครับ ระหว่างนี้จะยังไม่เปิดรายการ Private จนกว่าสถานะทางการจะกลับมา active`, silent: false, intent, level: policy.level, next_action: "renew_membership", source: "verified_member_concierge_v1" };
    }
    return { text: `${greeting}\nขออนุญาตตรวจสถานะบัญชีทางการก่อนครับ ระหว่างนี้จะยังไม่เปิดรายการ Private หรือข้อมูลสำหรับสมาชิก active`, silent: false, intent, level: policy.level, next_action: "review_membership", source: "verified_member_concierge_v1" };
  }

  // Active members never receive a signup/renewal sales pitch unless the resolver
  // explicitly reports an expiring-soon state above.
  if (intent === "talk_to_per") {
    return { text: "ได้ครับ ส่งรายละเอียดให้เปอร์ดูต่อได้เลยครับ", silent: false, intent, level: policy.level, next_action: "human_handoff", source: "verified_member_concierge_v1" };
  }
  if (intent === "payment_proof") {
    return { text: "ส่งหลักฐานการชำระเงินมาได้เลยครับ เปอร์จะให้ระบบตรวจและจับคู่รายการอย่างเป็นทางการก่อนยืนยันครับ", silent: false, intent, level: policy.level, next_action: "verify_payment", source: "verified_member_concierge_v1" };
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

export { CLOSED, LEVELS, ACTIVE_MEMBER_STATES, RENEWAL_DUE_STATES, INTENTS };
