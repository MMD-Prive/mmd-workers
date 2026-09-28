import { buildKenjiConversationMatrix } from "./kenji-conversation-matrix.js";

const SCHEMA = "mmd.kenji_member_chat.v1";

function text(value, max = 500) {
  return value == null ? "" : String(value).trim().replace(/\s+/g, " ").slice(0, max);
}

export function inferKenjiMemberIntent(message) {
  const value = text(message).toLowerCase();
  if (!value) return "general";
  if (/(point|points|แต้ม|คะแนน)/i.test(value)) return "points_status";
  if (/(member|membership|สมาชิก|ต่ออายุ|renew|tier|สิทธิ์สมาชิก)/i.test(value)) return "membership_status";
  if (/(จ่าย|ชำระ|payment|สลิป|โอน|ยอดเงิน|receipt)/i.test(value)) return "payment_status";
  if (/(จอง|booking|คิว|นัด|availability|ว่างไหม)/i.test(value)) return "availability_request";
  if (/(private|sigil|vip|svip|black\s*card|แบล็ค|ไพรเวท)/i.test(value)) return "model_access_verification";
  if (/(history|ประวัติ|ย้อนหลัง|เคยใช้)/i.test(value)) return "history";
  if (/(care|ร้องเรียน|หลังบริการ|privacy|ความเป็นส่วนตัว)/i.test(value)) return "care";
  return "general";
}

function actionFor(intent) {
  const map = {
    membership_status: { label: "เปิด Membership", url: "/my-mmd/membership" },
    points_status: { label: "เปิด Points", url: "/my-mmd/points" },
    payment_status: { label: "เปิด Payments", url: "/my-mmd/payments" },
    availability_request: { label: "เปิด Booking", url: "/booking" },
    model_access_verification: { label: "เปิด SIGIL", url: "/sigil/start" },
    history: { label: "เปิด History", url: "/my-mmd/history" },
    care: { label: "เปิด Private Care", url: "/sigil/recovery" },
  };
  return map[intent] || null;
}

function lifecycleLabel(value) {
  const map = {
    active: "ใช้งานอยู่",
    expiring_soon: "ใกล้หมดอายุ",
    grace: "ช่วงผ่อนผัน",
    expired: "หมดอายุ",
    inactive: "ยังไม่ใช้งาน",
    blocked: "ถูกจำกัด",
  };
  return map[text(value, 40).toLowerCase()] || "กำลังตรวจสอบ";
}

function composeReply({ intent, matrix, truth }) {
  const membership = truth?.membership || {};
  const points = truth?.points || {};
  const name = text(matrix?.identity?.preferred_name, 100);
  const prefix = name ? `${name} · ` : "";

  if (intent === "membership_status") {
    if (matrix?.current_state?.resolver_snapshot_valid === true) {
      return `${prefix}สมาชิกที่ระบบยืนยันตอนนี้คือ ${text(membership.label, 80) || "Member"} · ${lifecycleLabel(membership.lifecycle)} ครับ`;
    }
    return `${prefix}ตอนนี้ผมยังยืนยันสถานะสมาชิกไม่ได้ครับ ผมจะไม่เดาแทนระบบ`;
  }
  if (intent === "points_status") {
    if (points?.status === "verified" && Number.isFinite(Number(points.active_points))) {
      return `${prefix}Points ที่ระบบยืนยันตอนนี้ ${Math.floor(Number(points.active_points)).toLocaleString("en-US")} แต้มครับ`;
    }
    return `${prefix}ตอนนี้ Points ยังอยู่ระหว่างตรวจสอบครับ ผมจะไม่คำนวณจากข้อความหรือสลิปเอง`;
  }
  if (intent === "payment_status") {
    return `${prefix}ผมช่วยพาไปดูรายการชำระเงินได้ครับ แต่การยืนยันยอดต้องยึดสถานะจาก Payments เท่านั้น`;
  }
  if (intent === "availability_request") {
    return `${prefix}ผมช่วยพาไปเริ่มหรือเช็ก Booking ได้ครับ คิวจะถือว่ายืนยันเมื่อระบบยืนยันจริงเท่านั้น`;
  }
  if (intent === "model_access_verification") {
    const caps = Array.isArray(matrix?.current_state?.capabilities) ? matrix.current_state.capabilities : [];
    const privateCap = caps.find((item) => String(item).startsWith("private_visibility:"));
    return privateCap
      ? `${prefix}ผมเห็นขอบเขต Private Access ที่ระบบอนุญาตแล้วครับ เดี๋ยวพาไปต่อใน SIGIL ได้`
      : `${prefix}ผมยังไม่ยืนยัน Private Access เพิ่มจากข้อความเองครับ ให้ระบบตรวจสิทธิ์ปัจจุบันก่อน`;
  }
  if (intent === "history") {
    return `${prefix}ผมพาไปดูประวัติที่เปิดเผยได้และระบบยืนยันแล้วใน MY MMD ได้ครับ`;
  }
  if (intent === "care") {
    return `${prefix}เรื่องหลังบริการหรือเรื่องละเอียดอ่อนส่งผ่าน Private Care ได้ครับ จะเข้าทางดูแลที่เหมาะสมกว่า`;
  }
  return `${prefix}บอกผมได้เลยครับว่าต้องการให้จัดการเรื่องไหน ผมจะใช้ข้อมูล MY MMD ที่ยืนยันแล้วและพาไปขั้นตอนที่ถูกต้อง`;
}

export function buildKenjiMemberChat(input = {}) {
  const message = text(input.message, 800);
  if (!message) throw new TypeError("message is required");
  const intent = inferKenjiMemberIntent(message);
  const contextBundle = {
    ...(input.context_bundle && typeof input.context_bundle === "object" ? input.context_bundle : {}),
    current_message: message,
    current_intent: intent,
    evaluated_at: input.context_bundle?.evaluated_at || new Date().toISOString(),
  };
  const matrix = buildKenjiConversationMatrix(contextBundle);
  const truth = input.member_truth && typeof input.member_truth === "object" ? input.member_truth : {};
  return {
    schema_version: SCHEMA,
    read_only: true,
    intent,
    reply: composeReply({ intent, matrix, truth }),
    action: actionFor(intent),
    matrix,
    safety: {
      ...matrix.safety,
      customer_side_effects: false,
      source_of_truth_mutated: false,
    },
  };
}

export const KENJI_MEMBER_CHAT_SCHEMA = SCHEMA;
