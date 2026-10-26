// A delivered menu reply opens a bounded conversation, not general auto-reply.
// State is stored in the existing Conversation Matrix and is never entitlement.
const WINDOW_MS = 30 * 60 * 1000;
const ENTRY = "https://miniapp.line.me/2010862595-yT4DCEMc/";
const TOPICS = {
  guest: ["membership", "models", "booking", "services", "stories", "support"],
  public: ["support", "models", "booking", "membership", "membership", "support"],
  private: ["support", "models", "booking", "membership", "membership", "support"],
};

export function richMenuConversationStart(navigation, now = Date.now()) {
  const topic = TOPICS[navigation?.menu]?.[navigation?.button];
  return topic ? { topic, expires_at: new Date(now + WINDOW_MS).toISOString(),
    ...(navigation?.button === 5 ? { entry: "support_button" } : {}) } : null;
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
  } else if (/(คะแนน|แต้ม|points?)/i.test(raw)) {
    answer = `ดูคะแนนที่ระบบตรวจสอบให้บัญชีนี้ได้ที่ ${route("status", "points")} ครับ ผมยังไม่ยืนยันยอดจากข้อความในแชตครับ`;
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
