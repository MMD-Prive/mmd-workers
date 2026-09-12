import { buildKenjiNextActionPolicy } from "../../shared/kenji-customer-memory-v2.mjs";

const ROUTES = Object.freeze({
  dashboard: "https://mmdbkk.com/member/dashboard",
  membership: "https://mmdbkk.com/sigil/member/membership",
  membershipSignup: "https://mmdbkk.com/sigil/member/membership?source=line&intent=signup",
  membershipRenewal: "https://mmdbkk.com/sigil/member/membership?source=line&intent=renew",
  points: "https://mmdbkk.com/my-mmd/points",
  payments: "https://mmdbkk.com/member/payments",
  history: "https://mmdbkk.com/my-mmd/history",
  mms: "https://mmdbkk.com/male-massage/home",
  partnerVenue: "https://mmdbkk.com/male-massage/therapists/relax-spa",
});

function text(value) {
  return value == null ? "" : String(value).trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean);
    } catch (_) {
      return value.split(",").map(text).filter(Boolean);
    }
  }
  return [];
}

function relationshipOf(continuity = {}) {
  return text(
    continuity?.matrix?.relationship_context ||
    continuity?.relationship_context ||
    "unknown",
  ).toLowerCase() || "unknown";
}

function identityStatusOf(continuity = {}) {
  return text(continuity?.client_record_id || continuity?.matrix?.client_record_id)
    ? "resolved"
    : "candidate";
}

function existingActionCue(answer = "", action = {}) {
  const value = text(answer);
  if (!value) return false;
  const type = text(action.type);
  const route = text(action.route);
  if (type === "open_action_route") return route ? value.includes(route) : /https?:\/\//i.test(value);
  if (type === "handoff_per") return /(?:ส่ง(?:เรื่อง|เคส).{0,20}(?:ให้|หา)\s*Per|ให้\s*Per.{0,16}(?:ดู|ตรวจ|พิจารณา)|เปอร์.{0,16}(?:ดู|ตรวจ|พิจารณา)|เล่า.{0,20}(?:ได้เลย|มาได้))/i.test(value);
  return /(?:ส่ง(?:วัน|เวลา|โซน|หลักฐาน|รายละเอียด|ข้อมูล|ประเภท|ความสามารถ)|แจ้ง(?:วัน|เวลา|โซน|รายละเอียด)|บอกผม|พิมพ์\s*[“\"']?|มาได้เลย|ส่งมาได้เลย)/i.test(value);
}

function noAction(reason = "not_actionable") {
  return {
    schema: "mmd.kenji_next_action.v1",
    type: "none",
    label: "",
    route: "",
    customer_text: "",
    reason,
  };
}

function paymentStatusAction(continuity = {}) {
  const matrix = continuity?.matrix || {};
  const stage = text(matrix.conversation_stage || continuity.conversation_stage);
  const doNotAskAgain = new Set([
    ...list(matrix.do_not_ask_again),
    ...list(continuity.do_not_ask_again),
  ]);
  const proofAlreadyKnown = stage === "awaiting_payment_verification" || doNotAskAgain.has("payment_proof");

  if (proofAlreadyKnown) {
    return {
      schema: "mmd.kenji_next_action.v1",
      type: "continue_in_chat",
      label: "ตามรายการเดิม",
      route: "",
      customer_text: "ถ้าส่งหลักฐานไว้แล้ว ไม่ต้องส่งซ้ำครับ ถ้าจะให้ผมตามต่อจากรายการเดิม พิมพ์ “มีอัปเดตไหม” ได้เลยครับ",
      reason: "payment_proof_already_known_continue_existing_thread",
    };
  }

  return {
    schema: "mmd.kenji_next_action.v1",
    type: "open_action_route",
    label: "ดูรายการชำระเงิน",
    route: ROUTES.payments,
    customer_text: `เปิดรายการชำระเงินตรงนี้ได้เลยครับ → ${ROUTES.payments} หน้านี้จะพาไปขั้นตอนของรายการเดิม ถ้ามี payment ref หรือส่งหลักฐานไว้แล้ว ไม่ต้องสร้างหรือส่งซ้ำครับ`,
    reason: "payment_status_uses_canonical_member_payments_route",
  };
}

export function resolveKenjiNextAction({ intent = "", decision = {}, continuity = {} } = {}) {
  const value = text(intent || decision.intent).toLowerCase();
  const policy = buildKenjiNextActionPolicy({
    relationship_context: relationshipOf(continuity),
    identity_status: identityStatusOf(continuity),
  });

  if (!text(decision.text)) return { ...noAction("no_customer_reply"), policy };

  let action = noAction();
  if (value === "membership_status") {
    action = {
      schema: "mmd.kenji_next_action.v1",
      type: "open_action_route",
      label: "ดูสถานะและสิทธิ์สมาชิก",
      route: ROUTES.dashboard,
      customer_text: `ถ้าจะดูสถานะ ระดับสมาชิก วันหมดอายุ และสิทธิ์ล่าสุด เปิด MY MMD Home ตรงนี้ได้เลยครับ → ${ROUTES.dashboard}`,
      reason: "membership_status_uses_canonical_member_dashboard",
    };
  } else if (value === "membership_signup") {
    action = {
      schema: "mmd.kenji_next_action.v1",
      type: "open_action_route",
      label: "เริ่มสมัครสมาชิก",
      route: ROUTES.membershipSignup,
      customer_text: `เริ่มสมัครสมาชิกจากหน้าทางการนี้ได้เลยครับ → ${ROUTES.membershipSignup}`,
      reason: "membership_signup_uses_reviewed_membership_intake",
    };
  } else if (value === "membership_renewal") {
    action = {
      schema: "mmd.kenji_next_action.v1",
      type: "open_action_route",
      label: "เริ่มต่ออายุสมาชิก",
      route: ROUTES.membershipRenewal,
      customer_text: `เริ่มต่ออายุจาก Membership Intake ของบัญชีนี้ได้เลยครับ → ${ROUTES.membershipRenewal} สถานะจะเปลี่ยนหลัง MMD ตรวจข้อมูลและการชำระทางการแล้วเท่านั้นครับ`,
      reason: "membership_renewal_uses_reviewed_membership_intake",
    };
  } else if (value === "membership") {
    action = {
      schema: "mmd.kenji_next_action.v1",
      type: "open_action_route",
      label: "เปิด Membership Intake",
      route: ROUTES.membership,
      customer_text: `เปิด Membership Intake ได้ที่นี่ครับ → ${ROUTES.membership}`,
      reason: "membership_uses_canonical_reviewed_intake",
    };
  } else if (value === "points_status") {
    action = {
      schema: "mmd.kenji_next_action.v1",
      type: "open_action_route",
      label: "ดู Points ล่าสุด",
      route: ROUTES.points,
      customer_text: `ถ้าจะดูยอดล่าสุด เปิด My MMD > Points ตรงนี้ได้เลยครับ → ${ROUTES.points}`,
      reason: "points_status_has_safe_self_service_next_step",
    };
  } else if (["payment_slip", "payment_status"].includes(value)) {
    action = paymentStatusAction(continuity);
  } else if (value === "booking_status") {
    action = {
      schema: "mmd.kenji_next_action.v1",
      type: "open_action_route",
      label: "ดูรายการและสถานะ Booking",
      route: ROUTES.history,
      customer_text: `เปิด My MMD > History เพื่อดูรายการและสถานะล่าสุดได้เลยครับ → ${ROUTES.history}`,
      reason: "booking_status_uses_verified_member_history",
    };
  } else if (["mmd_companion", "availability_request", "pricing_review"].includes(value)) {
    action = {
      schema: "mmd.kenji_next_action.v1",
      type: "request_missing_input",
      label: "ส่ง Booking Brief",
      route: "",
      customer_text: "ส่งบริการหรือคนที่สนใจ พร้อมวัน เวลา พื้นที่ ระยะเวลา และรูปแบบงานมาได้เลยครับ MMD จะตรวจราคาและความพร้อมก่อนยืนยันครับ",
      reason: "booking_intake_collects_non_sensitive_brief_before_review",
    };
  } else if (value === "mms_wellness") {
    action = {
      schema: "mmd.kenji_next_action.v1",
      type: "open_action_route",
      label: "เปิด MMS Wellness",
      route: ROUTES.mms,
      customer_text: `ดูบริการและเริ่มทาง MMS ได้ที่นี่ครับ → ${ROUTES.mms} คิวและ Therapist ต้องรอตรวจความพร้อมก่อนคอนเฟิร์มครับ`,
      reason: "mms_wellness_stays_in_canonical_mms_lane",
    };
  } else if (value === "partner_venue") {
    action = {
      schema: "mmd.kenji_next_action.v1",
      type: "open_action_route",
      label: "ดู Partner Venue",
      route: ROUTES.partnerVenue,
      customer_text: `ดู Partner Venue ได้ที่นี่ครับ → ${ROUTES.partnerVenue} หน้านี้เป็นข้อมูลประกอบ request และยังไม่ใช่การยืนยันสถานที่หรือคิวครับ`,
      reason: "partner_venue_uses_public_venue_route_without_confirmation",
    };
  } else if (value === "private_talent") {
    action = {
      schema: "mmd.kenji_next_action.v1",
      type: "request_missing_input",
      label: "ส่ง Private Talent Brief",
      route: "",
      customer_text: "ส่งประเภทความสามารถ วันที่ เวลา พื้นที่ และสิ่งที่ต้องการให้ช่วยมาได้ครับ ผมจะจัดเป็น Private Talent request ให้ Per/MMD review ต่อครับ",
      reason: "private_talent_collects_bounded_brief_for_owner_review",
    };
  } else if (value === "aftercare") {
    action = {
      schema: "mmd.kenji_next_action.v1",
      type: "open_action_route",
      label: "เปิด Session History",
      route: ROUTES.history,
      customer_text: `เปิด Session ล่าสุดใน My MMD > History แล้วใช้ปุ่ม Aftercare ของรายการนั้นครับ → ${ROUTES.history} ผมจะไม่สร้างลิงก์ Session หรือ Private Care ขึ้นเองครับ`,
      reason: "aftercare_requires_backend_issued_session_action",
    };
  } else if (value === "payment_dispute") {
    action = {
      schema: "mmd.kenji_next_action.v1",
      type: "handoff_per",
      label: "ส่งเคสให้ Per ตรวจ",
      route: "",
      customer_text: "ส่งวันที่ ยอด และหลักฐานที่เกี่ยวข้องมาได้เลยครับ เดี๋ยวผมส่งให้ Per ตรวจเคสนี้ต่อ",
      reason: "payment_dispute_requires_owner_review",
    };
  } else if (value === "internal_access") {
    action = {
      schema: "mmd.kenji_next_action.v1",
      type: "request_missing_input",
      label: "ระบุจุดที่เข้าไม่ได้",
      route: "",
      customer_text: "บอกชื่อหน้าหรือส่วนที่เข้าไม่ได้มาได้ครับ เดี๋ยวผมพาไปตรวจสิทธิ์ให้ตรงจุด",
      reason: "internal_access_needs_specific_target",
    };
  }

  return { ...action, policy };
}

export function applyKenjiNextAction(decision = {}, options = {}) {
  const action = resolveKenjiNextAction({
    intent: options.intent || decision.intent,
    decision,
    continuity: options.continuity || {},
  });
  const baseText = text(decision.text);
  const mayAppend = action.type !== "none" && text(action.customer_text) && !existingActionCue(baseText, action);
  const shapedText = mayAppend
    ? `${baseText}\n\n${text(action.customer_text)}`.slice(0, 1600)
    : baseText;

  return {
    ...decision,
    text: shapedText,
    next_action: {
      schema: action.schema,
      type: action.type,
      label: action.label,
      route: action.route,
      reason: action.reason,
    },
    next_action_policy: action.policy,
    cta_type: action.type,
    cta_label: action.label,
    cta_route: action.route,
    cta_appended: mayAppend,
  };
}

export { ROUTES as KENJI_NEXT_ACTION_ROUTES };
