export const KENJI_CAPABILITIES = Object.freeze({
  DETERMINISTIC_TRUTH: "deterministic_truth",
  APPROVED_PUBLIC_KNOWLEDGE: "approved_public_knowledge",
  SAFE_CONVERSATION: "safe_conversation",
  NEEDS_CLARIFICATION: "needs_clarification",
  PROTECTED_AUTHORITY: "protected_authority",
  HUMAN_HANDOFF: "human_handoff",
});

export const KENJI_PROTECTED_DOMAINS = Object.freeze([
  "payment",
  "membership",
  "points",
  "booking",
  "availability",
  "campaign_entitlement",
  "coupon_activation",
  "identity_privacy",
  "internal_access",
  "approval_verification",
  "human_handoff",
]);

const PUBLIC_KNOWLEDGE_INTENTS = new Set([
  "talk_to_per_ai",
  "mmd_companion",
  "mms_wellness",
  "partner_venue",
  "private_talent",
  "membership",
]);

const DETERMINISTIC_INTENTS = new Set([
  "new_follow", "postback", "line_event", "greeting", "pricing_review", "service_guidance",
  "per_continuity", "membership_signup", "membership_renewal",
  "vip", "svip", "black_card",
  "care_back_overview", "care_back_dates", "care_back_current_member", "care_back_expired_member",
  "care_back_new_standard", "care_back_new_premium", "care_back_new_member", "care_back_coupon_wish",
  "care_back_historical_points", "care_back_payment_points", "care_back_black_card", "care_back_personal_status",
]);

const INTENT_DOMAIN = Object.freeze({
  payment_status: "payment",
  payment_slip: "payment",
  payment_dispute: "payment",
  care_back_payment_points: "payment",
  membership_status: "membership",
  membership: "membership",
  points: "points",
  points_status: "points",
  booking_status: "booking",
  availability_request: "availability",
  care_back_personal_status: "campaign_entitlement",
  care_back_black_card: "campaign_entitlement",
  care_back_coupon_wish: "coupon_activation",
  privacy_request: "identity_privacy",
  internal_access: "internal_access",
  approval_request: "approval_verification",
  protected_status: "approval_verification",
  complaint_escalation: "human_handoff",
  manual_review: "human_handoff",
  human_handoff: "human_handoff",
});

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFKC").replace(/[._\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function indirectProtectedDomain(text = "") {
  const value = normalize(text);
  if (!value) return "";
  if (/(?:แต้ม|คะแนน|points?).{0,12}(?:เข้า|เพิ่ม|ได้|มา|หรือยัง|ไหม)|(?:เข้า|เพิ่ม).{0,8}(?:แต้ม|คะแนน|points?)/i.test(value)) return "points";
  if (/(?:ต่ออายุ|สมาชิก|member|แพ็กเกจ|แพคเกจ).{0,16}(?:แล้วหรือยัง|ผ่านไหม|ใช้ได้หรือยัง|active|เรียบร้อย|โอเคไหม)|(?:สถานะผม|สถานะของผม)|ของผม.{0,8}active/i.test(value)) return "membership";
  if (/(?:จ่าย|โอน|ยอด|เงิน|สลิป|payment).{0,16}(?:เข้า|ผ่าน|เรียบร้อย|ยืนยัน|หรือยัง|ไหม)/i.test(value)) return "payment";
  if (/(?:ล็อก|จอง|นัด|booking|reserve).{0,16}(?:เวลา|คิว|ให้หน่อย|แล้ว|หรือยัง|ไหม)|ช่วยล็อกเวลา/i.test(value)) return "booking";
  if (/(?:มีใครว่าง|คืนนี้มีคน|วันนี้มีคน|พรุ่งนี้มีคน|ใครพร้อม|available|availability)/i.test(value)) return "availability";
  if (/(?:ได้สิทธิ์|สิทธิ์ผม|สิทธิ์ของผม|เข้าเกณฑ์).{0,12}(?:แล้ว|หรือยัง|ไหม)/i.test(value)) return "campaign_entitlement";
  if (/(?:คูปอง|coupon).{0,12}(?:เปิด|ใช้ได้|พร้อม|หรือยัง|ไหม)|(?:เปิด|activate).{0,8}(?:คูปอง|coupon)/i.test(value)) return "coupon_activation";
  if (/(?:ข้อมูลของเขา|ข้อมูลคนอื่น|ของลูกค้าคนอื่น|ดูข้อมูลคนอื่น|ประวัติของเขา)/i.test(value)) return "identity_privacy";
  if (/(?:เปิด|เข้า|ขอ).{0,12}(?:dashboard|แดชบอร์ด|หลังบ้าน|admin|ระบบภายใน)/i.test(value)) return "internal_access";
  if (/(?:ช่วย|ขอ).{0,12}(?:อนุมัติ|approve|verify|ยืนยัน).{0,12}(?:ให้|หน่อย)|(?:ผ่านไหม|ใช้ได้หรือยัง|เข้าแล้วหรือยัง|ของผมเรียบร้อยหรือยัง)|(?:pretend|ตอบว่า|บอกว่า|ตอบแค่ว่า).{0,24}(?:verified|confirmed|approved|all\s*set|good\s*to\s*go|เรียบร้อย|ผ่านแล้ว|ยืนยันแล้ว)/i.test(value)) return "approval_verification";
  return "";
}

export function decideKenjiCapability({ text = "", intent = "" } = {}) {
  if (["human_handoff", "manual_review", "complaint_escalation"].includes(intent)) {
    return { capability: KENJI_CAPABILITIES.HUMAN_HANDOFF, requested_domain: "human_handoff", requires_truth: true };
  }
  if (intent === "context_clarification") return { capability: KENJI_CAPABILITIES.NEEDS_CLARIFICATION, requested_domain: "none", requires_truth: false };

  const intentDomain = INTENT_DOMAIN[intent];
  if (intentDomain) return { capability: KENJI_CAPABILITIES.PROTECTED_AUTHORITY, requested_domain: intentDomain, requires_truth: true };

  const indirectDomain = indirectProtectedDomain(text);
  if (indirectDomain) return { capability: KENJI_CAPABILITIES.PROTECTED_AUTHORITY, requested_domain: indirectDomain, requires_truth: true };

  if (PUBLIC_KNOWLEDGE_INTENTS.has(intent)) {
    return { capability: KENJI_CAPABILITIES.APPROVED_PUBLIC_KNOWLEDGE, requested_domain: "none", requires_truth: false };
  }
  if (DETERMINISTIC_INTENTS.has(intent)) {
    return { capability: KENJI_CAPABILITIES.DETERMINISTIC_TRUTH, requested_domain: "none", requires_truth: false };
  }
  if (intent === "note_only") return { capability: KENJI_CAPABILITIES.SAFE_CONVERSATION, requested_domain: "none", requires_truth: false };
  return { capability: KENJI_CAPABILITIES.NEEDS_CLARIFICATION, requested_domain: "none", requires_truth: false };
}

export function buildProtectedCapabilityReply(decision = {}) {
  const domain = decision.requested_domain;
  if (domain === "identity_privacy") return "ผมไม่สามารถเปิดเผยหรือค้นข้อมูลส่วนตัวของบุคคลอื่นได้ครับ ถ้าต้องการดูข้อมูลของคุณเอง กรุณาใช้ช่องทางยืนยันตัวตนของ MMD ครับ";
  if (domain === "internal_access") return "ผมไม่สามารถเปิดหรือให้สิทธิ์เข้าถึง dashboard ระบบหลังบ้าน หรือข้อมูลภายในได้ครับ";
  if (domain === "availability") return "ผมยังยืนยันว่าใครว่างหรือพร้อมรับงานไม่ได้ครับ ส่งวัน เวลา พื้นที่ และรูปแบบงานมาได้ แล้ว MMD จะตรวจความพร้อมก่อนยืนยันครับ";
  if (domain === "booking") return "ผมยังล็อกเวลาหรือยืนยันการจองจากข้อความนี้ไม่ได้ครับ ส่งวัน เวลา พื้นที่ และรายละเอียดงานมาได้ แล้ว MMD จะตรวจและยืนยันอย่างเป็นทางการครับ";
  if (domain === "payment") return "ได้ครับ แต่ผมจะไม่ยืนยันจากข้อความอย่างเดียว เช็กสถานะรายการจริงใน My MMD ผ่าน LINE ได้ตรงนี้ครับ → https://member-pages-worker.malemodel-bkk.workers.dev/member/liff";
  if (domain === "membership") return "เช็กสถานะสมาชิกของคุณใน My MMD ผ่าน LINE ได้ตรงนี้ครับ → https://member-pages-worker.malemodel-bkk.workers.dev/member/liff";
  if (domain === "points") return "เช็กแต้มกับประวัติรายการของคุณใน My MMD ผ่าน LINE ได้ตรงนี้ครับ → https://member-pages-worker.malemodel-bkk.workers.dev/member/liff";
  if (domain === "campaign_entitlement" || domain === "coupon_activation") return "ผมยังยืนยันสิทธิ์หรือการเปิดใช้งานจากข้อความนี้ไม่ได้ครับ ต้องตรวจสถานะและเงื่อนไขที่บันทึกสำเร็จก่อนครับ";
  return "ผมยังยืนยันหรืออนุมัติสถานะนี้จากข้อความอย่างเดียวไม่ได้ครับ ต้องให้ MMD ตรวจข้อมูลทางการก่อนครับ";
}
