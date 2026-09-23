// A deliberately small LINE opening lane. The OA greeting owns the follow
// event; this lane responds only after a customer sends a text message.
const ROUTES = Object.freeze({
  profiles: "https://mmdbkk.com/profiles",
  membership: "https://mmdbkk.com/member/membership",
  mmsLine: "https://lin.ee/NkfXMu7",
});

const HANDOFF_INTENTS = new Set([
  "human_handoff", "per_continuity", "manual_review", "complaint_escalation",
  "payment_slip", "payment_status", "payment_dispute", "membership_status",
  "points", "points_status", "privacy_request", "internal_access",
  "availability_request", "booking_status", "model_lookup",
  "model_access_verification", "vip", "svip", "black_card",
]);

function clean(value) {
  return String(value ?? "").trim();
}

export function decideKenjiLineFirstContact(event = {}, intent = "") {
  const kind = clean(intent);
  const base = {
    text: "",
    intent: kind,
    reply_source: "first_contact_v1",
    handoff_required: false,
    handoff_reason: "",
    guard_blocked: false,
    guard_reason: "",
  };

  if (event.type !== "message" || event.message?.type !== "text" || event.source?.type !== "user") {
    return { ...base, guard_blocked: true, guard_reason: "first_contact_text_dm_only" };
  }
  const raw = clean(event.message.text);
  if (!raw || raw.length > 600) return { ...base, guard_blocked: true, guard_reason: "first_contact_text_out_of_scope" };
  if (/(?:สลิป|ชำระ|โอน(?:เงิน)?|จ่าย(?:เงิน)?|คืนเงิน|refund|payment|paid|สิทธิ์|สถานะ|คะแนน|แต้ม|ร้องเรียน|ข้อมูลส่วนตัว|บัตรดำ|black\s*card|svip|vip)/i.test(raw)) {
    return { ...base, handoff_required: true, handoff_reason: "sensitive_text:owner_review", guard_blocked: true, guard_reason: "first_contact_sensitive_text" };
  }
  if (HANDOFF_INTENTS.has(kind) || kind.startsWith("care_back_") || kind === "private_talent") {
    return {
      ...base,
      handoff_required: true,
      handoff_reason: `${kind || "unknown"}:owner_review`,
      guard_blocked: true,
      guard_reason: "first_contact_protected_intent",
    };
  }

  // Do not interpret an arbitrary note as a request to start a conversation.
  // Short opening phrases and public discovery phrases are explicitly scoped.
  if (kind === "greeting" || kind === "service_guidance" ||
      (kind === "note_only" && /^(?:แนะนำหน่อย|ช่วยแนะนำ(?:หน่อย)?|เริ่ม(?:ยังไง|ตรงไหน)|อยากดู(?:น้อง|ผู้ชาย|นายแบบ)|ดู(?:น้อง|ผู้ชาย|นายแบบ))(?:ครับ|ค่ะ|คะ|นะ)?$/i.test(raw))) {
    return { ...base, text: "สวัสดีครับ วันนี้อยากให้ช่วยเรื่องไหนครับ? ดูน้อง ๆ ผู้ชายสำหรับงานหรือกิจกรรม เรื่องสมาชิก หรือรายการที่เคยคุยไว้ บอกมาได้เลยครับ" };
  }
  if (kind === "mmd_companion") {
    return { ...base, text: `ได้ครับ เล่าให้ฟังหน่อยว่าเป็นงานหรือกิจกรรมแบบไหน และต้องการวันไหนครับ ระหว่างนี้ดูน้อง ๆ ได้ที่ ${ROUTES.profiles} ครับ` };
  }
  if (kind === "mms_wellness") {
    return { ...base, text: `งานนวดชายดูแลผ่าน LINE Official ของ MMS โดยเฉพาะครับ ติดต่อได้ที่ ${ROUTES.mmsLine}`, reply_source: "mms_line_redirect" };
  }
  if (["membership", "membership_signup", "private_membership_signup", "membership_renewal"].includes(kind)) {
    return { ...base, text: `เรื่องสมาชิกเริ่มดูได้ที่ ${ROUTES.membership} ครับ ถ้าเคยเป็นสมาชิกอยู่แล้ว บอกว่าอยากเช็กสถานะหรือต่ออายุ เดี๋ยวพาไปตรวจใน MY MMD ครับ` };
  }
  if (kind === "pricing_review") {
    return { ...base, text: "บอกประเภทงาน วันที่ ระยะเวลา และย่านที่ต้องการมาก่อนได้ครับ เดี๋ยวเปอร์ตรวจราคาให้ตรงกับบรีฟครับ", handoff_required: true, handoff_reason: "pricing_review:owner_review" };
  }

  return { ...base, guard_blocked: true, guard_reason: "first_contact_out_of_scope" };
}
