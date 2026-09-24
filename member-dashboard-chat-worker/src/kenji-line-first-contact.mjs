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

function explicitGender(raw) {
  const value = raw.replace(/\s+/g, "").replace(/(?:ครับ|ค่ะ|คะ|นะ)$/, "");
  if (/^(?:ไม่ระบุ|ไม่สะดวกบอก|ข้าม)$/.test(value)) return "prefer_not_to_say";
  if (/^(?:(?:เพศ|เป็น|ฉันเป็น|ผมเป็น|หนูเป็น|เราเป็น))?(?:ผู้หญิง|หญิง)$/.test(value)) return "woman";
  if (/^(?:(?:เพศ|เป็น|ฉันเป็น|ผมเป็น|หนูเป็น|เราเป็น))?(?:ผู้ชาย|ชาย)$/.test(value)) return "man";
  if (/^(?:(?:เพศ|เป็น|ฉันเป็น|ผมเป็น|หนูเป็น|เราเป็น))?(?:นอนไบนารี|nonbinary)$/.test(value)) return "nonbinary";
  return "";
}

function explicitStyle(raw) {
  const value = raw.replace(/\s+/g, "").replace(/(?:ครับ|ค่ะ|คะ|นะ)$/, "");
  const match = /^(?:(?:ชอบ|อยากได้)(?:คน|แบบ|ลุค|สไตล์|แนว)?|(?:ลุค|สไตล์|แนว))?(สุภาพ|อบอุ่น|เท่|เรียบร้อย|สนุก|เป็นกันเอง|เกาหลี|สปอร์ต|คมเข้ม)$/.exec(value);
  return match?.[1] || "";
}

function explicitModelPreference(raw) {
  const value = raw.replace(/\s+/g, "").replace(/(?:ครับ|ค่ะ|คะ|นะ)$/, "");
  if (/^(?:ชอบ|อยากได้)(?:ผู้ชาย|นายแบบ)$/.test(value)) return "man";
  if (/^(?:ชอบ|อยากได้)ผู้หญิง$/.test(value)) return "woman";
  return "";
}

function previousOpening(continuity = {}) {
  if (!continuity.available || continuity.decision === "stale_refresh") return {};
  const state = continuity.matrix?.payload_json?.first_contact_v2;
  return state && typeof state === "object" && !Array.isArray(state) ? state : {};
}

export function decideKenjiLineFirstContact(event = {}, intent = "", continuity = {}) {
  const kind = clean(intent);
  const base = {
    text: "",
    intent: kind,
    reply_source: "first_contact_v2",
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

  const previous = previousOpening(continuity);
  const pair = /^(.{2,25}?)(?:\s+|[,，/|]\s*)(.{2,35})$/.exec(raw);
  const gender = explicitGender(raw) || (pair ? explicitGender(pair[1]) : "");
  const style = explicitStyle(raw) || (pair && gender ? explicitStyle(pair[2]) : "");
  const preferredModelGender = explicitModelPreference(raw);
  // Only an explicit answer is captured. "ชอบผู้ชาย" describes a preference,
  // not the customer's gender, and is never promoted to a profile field.
  if (gender || style || preferredModelGender) {
    return {
      ...base,
      text: "รับทราบครับ สนใจให้น้องช่วยในงานหรือกิจกรรมแบบไหนครับ? บอกคร่าว ๆ ได้เลยครับ",
      first_contact_state: {
        awaiting: "service",
        ...(gender ? { self_reported_gender: gender === "prefer_not_to_say" ? "" : gender } : {}),
        ...(style ? { preferred_style: style } : {}),
        ...(preferredModelGender ? { preferred_model_gender: preferredModelGender } : {}),
      },
    };
  }

  // Short opening phrases and public discovery phrases are explicitly scoped.
  if (kind === "greeting" || kind === "service_guidance" ||
      (kind === "note_only" && /^(?:แนะนำหน่อย|ช่วยแนะนำ(?:หน่อย)?|เริ่ม(?:ยังไง|ตรงไหน)|อยากดู(?:น้อง|ผู้ชาย|นายแบบ)|ดู(?:น้อง|ผู้ชาย|นายแบบ))(?:ครับ|ค่ะ|คะ|นะ)?$/i.test(raw))) {
    return { ...base, text: "ได้ครับ สนใจให้น้องช่วยในงานหรือกิจกรรมแบบไหนครับ? ถ้าสะดวกบอกสไตล์ที่ชอบเพิ่มได้ครับ", first_contact_state: { awaiting: "service" } };
  }
  if (kind === "mmd_companion" ||
      (previous.awaiting === "service" && ["note_only", "context_clarification"].includes(kind) && raw.length <= 100 && /(?:งาน|กิจกรรม|ดินเนอร์|ทานข้าว|กินข้าว|อีเวนต์|เดินทาง|เที่ยว|ออกงาน)/.test(raw))) {
    return { ...base, text: `ได้ครับ ต้องการวันไหนครับ? ระหว่างนี้ดูน้อง ๆ ได้ที่ ${ROUTES.profiles} ครับ`, first_contact_state: { awaiting: "date" } };
  }
  if (previous.awaiting === "date" && kind === "note_only" && raw.length <= 60 &&
      /(?:วัน(?:ที่|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)|พรุ่งนี้|มะรืน|สัปดาห์หน้า|อาทิตย์หน้า|เดือนหน้า|\b\d{1,2}[\/-]\d{1,2}\b)/.test(raw)) {
    return { ...base, text: "ได้ครับ ขอทราบย่านและช่วงเวลาที่สะดวกเพิ่มอีกนิดครับ", first_contact_state: { awaiting: "area_time" } };
  }
  if (previous.awaiting === "area_time" && kind === "note_only" && raw.length <= 100 &&
      /(?:ย่าน|แถว|โซน|เวลา|โมง|ช่วง|สุขุมวิท|สีลม|สาทร|ทองหล่อ|เอกมัย|อโศก|กรุงเทพ|พัทยา|เชียงใหม่)/.test(raw)) {
    return { ...base, text: "รับรายละเอียดเบื้องต้นแล้วครับ เปอร์จะตรวจเรื่องคิวและราคาให้ตรงกับบรีฟก่อนแจ้งกลับครับ", handoff_required: true, handoff_reason: "service_brief:owner_review", first_contact_state: { awaiting: "review" } };
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
