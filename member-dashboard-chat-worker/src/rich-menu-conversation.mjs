export { isCheckptsShortcut } from "./checkpts-command.mjs";

// A delivered menu reply opens a bounded conversation, not general auto-reply.
// State is stored in the existing Conversation Matrix and is never entitlement.
const WINDOW_MS = 30 * 60 * 1000;
const ENTRY = "https://miniapp.line.me/2010862595-yT4DCEMc/";
const pointsAnswer = () => pointsInChatAnswer();
const POINTS_AUTHORITY = "my_mmd_entitlement_resolver_v1";

function membershipStatus(membership = {}) {
  if (membership.member_blocked === true || membership.lifecycle === "blocked") return "ระงับการใช้งานครับ";
  if (membership.lifecycle === "revoked") return "สิทธิ์ถูกยกเลิกแล้วครับ";
  if (["active", "expiring_soon", "grace"].includes(membership.lifecycle)) {
    const label = String(membership.label || "").trim();
    return `${label || "สมาชิก MMD"} (${membership.lifecycle === "grace" ? "ช่วงผ่อนผัน" : "ใช้งานอยู่"}) ครับ`;
  }
  if (membership.lifecycle === "expired") return "หมดอายุแล้วครับ";
  return "ยังไม่พบสิทธิ์สมาชิกที่ใช้งานอยู่ครับ";
}

function membershipExpiry(membership = {}) {
  const level = String(membership.level || "").trim().toLowerCase();
  const label = String(membership.label || "").trim().toLowerCase();
  const lifecycle = String(membership.lifecycle || "").trim().toLowerCase();
  if (level === "svip" || label === "svip") {
    return ["active", "expiring_soon", "grace"].includes(lifecycle)
      ? "SVIP ไม่มีวันหมดอายุปกติครับ"
      : "ให้เปอร์ตรวจสถานะ SVIP เป็นรายบุคคลครับ";
  }
  if (!/^(?:active|expiring_soon|grace|expired)$/.test(lifecycle)) return "ยังไม่มีวันที่ยืนยันได้ครับ";
  const match = String(membership.expire_at || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12 || Number(match[3]) < 1 || Number(match[3]) > 31)
    return "ยังไม่มีวันที่ยืนยันได้ครับ";
  return `${match[3]}/${match[2]}/${match[1]} ครับ`;
}
function checkptsCta(liveTruth = {}, now = Date.now()) {
  const membership = liveTruth.membership || {};
  const lifecycle = String(membership.lifecycle || "").trim().toLowerCase();
  const open = campaignOpen(now);
  const campaign = open
    ? `CARE BACK ถึง 31 ต.ค. 2569: บันทึก Birthday Wish สำเร็จแล้วจึงรับคูปองส่วนตัวสูงสุด 10% ใช้ได้ 1 ครั้ง; ส่วนลดจริงขึ้นกับระดับนายแบบและรูปแบบบริการ. รายละเอียดและโปสเตอร์: ${CARE_BACK_URL}`
    : `ดูสิทธิ์และเงื่อนไขล่าสุดได้ที่ ${CARE_BACK_URL}`;

  if (liveTruth.ok !== true || liveTruth.authority !== POINTS_AUTHORITY || liveTruth.identity_status !== "resolved") {
    return `CTA: ยืนยันบัญชีผ่าน LINE ในหน้า CARE BACK ก่อน เปอร์จะตรวจสถานะให้ครับ. ${campaign}`;
  }
  if (["active", "expiring_soon", "grace"].includes(lifecycle)) {
    if (isCuratedTier(membership)) {
      return `CTA: สิทธิ์ ${String(membership.label || "สมาชิก")} ต้องให้เปอร์ดูแลเป็นรายบุคคลครับ ยังไม่แสดงแพ็กเกจต่ออายุทั่วไป. ${campaign}`;
    }
    if (isPaidPrivateTier(membership) && open) {
      return `CTA: สมาชิกยังใช้งานอยู่ ต่ออายุล่วงหน้าได้ถึง 31 ต.ค. 2569 เท่านั้นครับ. ดูแพ็กเกจต่ออายุ: ${RENEW_URL}. Verify CARE BACK เพิ่มสมาชิก 1 ปีจากวันหมดอายุจริง; Standard ที่เข้าเงื่อนไขเพิ่ม 180 วัน, Premium เพิ่ม 1 ปี. ${campaign}`;
    }
    return `CTA: หน้าต่างต่ออายุล่วงหน้าถึง 31 ต.ค. 2569 ปิดแล้วครับ ส่งคำว่า “คุยกับเปอร์” หากต้องการให้ตรวจทางเลือกต่อไป. ${campaign}`;
  }
  if (lifecycle === "expired") {
    return open
      ? `CTA: สถานะหมดอายุแล้วครับ ยืนยันบัญชีเดิมผ่านหน้า CARE BACK ภายใน 31 ต.ค. เพื่อรับสิทธิ์ต่อสมาชิก 1 ปีนับจากวันที่ Verify สำเร็จ; การสมัครแพ็กเกจภายหลังเป็นอีกขั้นตอนหนึ่ง. ${campaign}`
      : `CTA: สถานะหมดอายุแล้วครับ ส่งคำว่า “คุยกับเปอร์” เพื่อให้ตรวจสิทธิ์กลับมาเป็นรายบุคคลได้ครับ. ${campaign}`;
  }
  if (["blocked", "revoked"].includes(lifecycle)) {
    return `CTA: สถานะนี้ต้องให้เปอร์ตรวจเป็นรายบุคคลก่อนครับ. ${campaign}`;
  }
  return `CTA: สถานะยังแยกไม่ได้ว่า active หรือหมดอายุ กรุณายืนยันบัญชีผ่าน LINE ก่อนครับ. ${campaign}`;
}

function pointsInChatAnswer(liveTruth = {}, now = Date.now(), includeCta = false) {
  const cta = includeCta ? "\n" + checkptsCta(liveTruth, now) : "";
  if (liveTruth.ok !== true || liveTruth.authority !== POINTS_AUTHORITY || liveTruth.identity_status !== "resolved") {
    return "สถานะสมาชิก: ตอนนี้ยังตรวจสถานะจากระบบไม่ได้ครับ\nPoints: ยังยืนยันยอดไม่ได้ครับ\nวันหมดอายุ: ยังตรวจไม่ได้ครับ" + cta;
  }
  const points = liveTruth.points || {};
  const verified = points.status === "verified" && Number.isSafeInteger(points.active_points) && points.active_points >= 0;
  const pointText = verified ? `${points.active_points.toLocaleString("th-TH")} Points ครับ` : "ยังยืนยันยอดไม่ได้ครับ";
  return `สถานะสมาชิก: ${membershipStatus(liveTruth.membership)}\nPoints: ${pointText}\nวันหมดอายุ: ${membershipExpiry(liveTruth.membership)}` + cta;
}
const TOPICS = {
  guest: ["membership", "models", "booking", "services", "stories", "support"],
  public: ["support", "models", "booking", "membership", "membership", "support"],
  private: ["support", "models", "booking", "membership", "membership", "support"],
};

export function richMenuConversationStart(navigation, now = Date.now()) {
  const topic = TOPICS[navigation?.menu]?.[navigation?.button];
  return topic ? { topic, expires_at: new Date(now + WINDOW_MS).toISOString() } : null;
}

export function resolveCheckptsShortcut(liveTruth = {}, now = Date.now()) {
  const verified = liveTruth.ok === true && liveTruth.authority === POINTS_AUTHORITY && liveTruth.identity_status === "resolved" &&
    liveTruth.points?.status === "verified" && Number.isSafeInteger(liveTruth.points.active_points) && liveTruth.points.active_points >= 0;
  return {
    text: pointsInChatAnswer(liveTruth, now, true), intent: "points_status", inferred_intent: "points_status",
    reply_source: "my_mmd_points_shortcut_v2", model_attempted: false,
    truth_authority: POINTS_AUTHORITY, truth_status: verified ? "verified" : "unavailable",
    live_truth_used: liveTruth.ok === true, live_truth_verified: verified,
    handoff_required: false, cta_appended: true,
  };
}

export function resolveRichMenuConversation(event = {}, continuity = {}, now = Date.now()) {
  const state = continuity.matrix?.payload_json?.rich_menu_v1;
  const expires = Date.parse(state?.expires_at);
  if (!continuity.available || continuity.decision === "stale_refresh" ||
      continuity.matrix?.handoff_required === true || state?.closed === true ||
      !Number.isFinite(expires) || expires <= now || expires > now + WINDOW_MS ||
      !Object.values(TOPICS).some(topics => topics.includes(state?.topic))) return null;
  if (event.type !== "message" || event.message?.type !== "text" || event.source?.type !== "user") return null;
  const raw = String(event.message.text || "").trim();
  if (!raw || raw.length > 600) return null;

  let answer, intent = "support", handoff = false;
  const route = (intent, view) => `${ENTRY}?intent=${intent}&view=${view}`;
  // Sensitive topics take precedence over membership keywords and remembered topics.
  if (/(สลิป|ชำระ|โอน(?:เงิน)?|จ่าย(?:เงิน)?|คืนเงิน|refund|payment|paid|ร้องเรียน|ข้อมูลส่วนตัว|บัตรดำ|black\s*card|svip|\bvip\b)/i.test(raw)) {
    answer = "รับข้อความแล้วครับ เรื่องการชำระเงิน สิทธิ์ หรือข้อมูลส่วนตัวต้องให้ MMD ตรวจสอบก่อน รอเปอร์ดูแลต่อในแชตนี้ครับ ข้อความนี้ยังไม่ยืนยันการชำระเงินหรือเปิดสิทธิ์ครับ";
    intent = "manual_review";
    handoff = true;
  } else if (/(standard|premium|สแตนดาร์ด|พรีเมียม|คุยกับ\s*(?:เปอร์|per)|ติดต่อ\s*(?:เปอร์|per)|เจ้าหน้าที่|คุยกับคน)/i.test(raw)) {
    answer = "รับข้อความแล้วครับ พิมพ์รายละเอียดที่อยากให้เปอร์ช่วยดูต่อในแชตนี้ได้เลย เรื่อง Standard / Premium ต้องรอเปอร์ตรวจตัวเลือกและเงื่อนไขก่อน ยังไม่มีการสมัคร ชำระเงิน หรือเปิดสิทธิ์จากข้อความนี้ครับ";
    intent = "human_handoff";
    handoff = true;
  } else if (/(ต่ออายุ|renew)/i.test(raw)) {
    answer = `เริ่มตรวจตัวเลือกต่ออายุของบัญชีเดิมได้ที่ ${route("renew", "package")} ครับ สถานะจะเปลี่ยนหลังการตรวจสอบทางการเท่านั้นครับ`;
    intent = "membership_renewal";
  } else if (/(คะแนน|แต้ม|points?|\bcheckpts\b)/i.test(raw)) {
    answer = pointsAnswer();
    intent = "points_status";
  } else if (/(สถานะ|หมดอายุ|สิทธิ์|status)/i.test(raw)) {
    answer = `ตรวจสถานะของบัญชีนี้ผ่าน MY MMD ได้ที่ ${route("status", "overview")} ครับ การกดเมนูหรือส่งข้อความไม่ได้เปิดสิทธิ์สมาชิกครับ`;
    intent = "membership_status";
  } else if (/(สมัคร|สมาชิก|แพ็กเกจ|membership)/i.test(raw) ||
      (state.topic === "membership" && /(ราคา|เรท|เท่าไหร่|เท่าไร)/i.test(raw)) ||
      (state.topic === "membership" && /^(?:สนใจ|ขอรายละเอียด|รายละเอียด|ยังไง)(?:ครับ|ค่ะ|คะ|นะ)?$/.test(raw))) {
    answer = `ดูตัวเลือกสมาชิกได้ที่ ${route("signup", "signup")} ครับ ถ้าสนใจ Standard / Premium พิมพ์ชื่อแพ็กเกจในแชตนี้เพื่อให้เปอร์ตรวจเงื่อนไขต่อได้ครับ`;
    intent = "membership_signup";
  } else if (/^(?:สวัสดี|hi|hello|เคนจิ|kenji|แนะนำหน่อย|ช่วยหน่อย)[\s!]*(?:ครับ|ค่ะ|คะ|นะ)?$/i.test(raw)) {
    answer = "สอบถามเรื่องสมาชิก ต่ออายุ หรือสถานะได้เลยครับ ถ้าต้องการให้เปอร์ดูแล พิมพ์ “คุยกับเปอร์” ได้ครับ";
  } else {
    // Unbounded text and booking/model requests remain in the existing inbound
    // queue for Per. Do not infer availability or start another model runtime.
    answer = "รับรายละเอียดแล้วครับ เพิ่มวัน เวลา พื้นที่ หรือเรื่องที่ต้องการให้ช่วยได้ในแชตนี้ รอเปอร์ตรวจและตอบกลับก่อนยืนยันราคา คิว หรือการจองครับ";
    intent = "human_handoff";
    handoff = true;
  }
  return {
    text: answer, intent, inferred_intent: intent,
    reply_source: "rich_menu_conversation_v1", model_attempted: false,
    handoff_required: handoff, handoff_reason: handoff ? "rich_menu:owner_review" : "",
    rich_menu_state: { ...state, closed: handoff },
    continuity_topic: state.topic, cta_appended: false,
  };
}
