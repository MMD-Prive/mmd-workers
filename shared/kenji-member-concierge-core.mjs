const HIGH_POINTS_THRESHOLD = 1200;

const INTENTS = Object.freeze({
  EMPTY: "empty",
  GREETING: "greeting",
  BOOKING: "booking",
  PAYMENT_SLIP: "payment_slip",
  POINTS: "points",
  VIP: "vip",
  SVIP: "svip",
  BLACK_CARD: "black_card",
  MEMBERSHIP_RENEWAL: "membership_renewal",
  PRICING_RATE: "pricing_rate",
  MODEL_AVAILABILITY: "model_availability",
  TALK_TO_PER_AI: "talk_to_per_ai",
  HIGH_POINTS_FALLBACK: "high_points_fallback",
  GENERAL: "general",
});

function toText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalize(value) {
  return toText(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  return normalize(value).replace(/\s+/g, "");
}

function asFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function getPointsBalance(memberSummary) {
  if (!memberSummary || typeof memberSummary !== "object") return null;
  return asFiniteNumber(memberSummary.active_points ?? memberSummary.points_balance ?? memberSummary.points?.balance);
}

function formatPoints(value) {
  const number = asFiniteNumber(value);
  if (number === null) return "";
  return number.toLocaleString("en-US");
}

export function getSafeMemberSummary(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const activePoints = getPointsBalance(source);
  return {
    display_name: toText(source.display_name || source.name || source.line_display_name),
    membership_status: toText(source.membership_status || source.status || "LINE Member"),
    tier: toText(source.tier || source.member_tier || "Preview"),
    active_points: activePoints === null ? 0 : activePoints,
    points_updated_at: toText(source.points_updated_at),
    renewal_status: toText(source.renewal_status || "unknown"),
    line_user_id_redacted: redactLineUserId(source.line_user_id || source.lineUserId),
  };
}

function redactLineUserId(value) {
  const text = toText(value);
  if (!text) return "";
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

export function classifyKenjiMemberIntent(input, memberSummary = {}) {
  const text = normalize(input);
  const dense = compact(input);
  const summary = getSafeMemberSummary(memberSummary);

  if (!text) return { intent: INTENTS.EMPTY, confidence: 1 };

  if (includesAny(text, ["black card", "blackcard", "บัตรดำ"])) {
    return { intent: INTENTS.BLACK_CARD, confidence: 0.98 };
  }

  if (includesAny(text, ["svip", "s vip", "super vip", "เอสวีไอพี"])) {
    return { intent: INTENTS.SVIP, confidence: 0.98 };
  }

  if (includesAny(text, ["ส่งสลิป", "สลิป", "slip", "payment proof", "โอนแล้ว", "โอน", "ชำระ", "จ่ายแล้ว", "paid"])) {
    return { intent: INTENTS.PAYMENT_SLIP, confidence: 0.96 };
  }

  if (includesAny(text, ["จอง", "booking", "book", "reserve", "appointment", "session", "คิว", "นัด", "ว่าง", "available", "availability", "เช็กคิว", "เช็คคิว"])) {
    return { intent: INTENTS.BOOKING, confidence: 0.95 };
  }

  if (includesAny(text, ["สมาชิก", "ต่ออายุ", "renew", "renewal", "membership", "member", "status hub", "หมดอายุ"])) {
    return { intent: INTENTS.MEMBERSHIP_RENEWAL, confidence: 0.92 };
  }

  const hasPointsIntent = includesAny(text, ["แต้ม", "points", "point", "คะแนน"]);
  if (!hasPointsIntent && includesAny(text, ["ราคา", "เรท", "rate", "price", "pricing", "แพ็กเกจ", "แพคเกจ", "เท่าไร", "เท่าไหร่", "กี่บาท"])) {
    return { intent: INTENTS.PRICING_RATE, confidence: 0.9 };
  }

  if (includesAny(text, ["vip", "วีไอพี"])) {
    return { intent: INTENTS.VIP, confidence: 0.9 };
  }

  if (hasPointsIntent) {
    return { intent: INTENTS.POINTS, confidence: 0.9 };
  }

  if (
    includesAny(text, ["kenji", "kenji ai", "per ai", "เคนจิ", "เปอร์ ai"]) ||
    includesAny(dense, ["คุยกับเคนจิ", "คุยกับperai", "คุยกับเปอร์ai", "ขอคุยกับเคนจิ", "ขอคุยกับperai"])
  ) {
    return { intent: INTENTS.TALK_TO_PER_AI, confidence: 0.9 };
  }

  if (includesAny(text, ["สวัสดี", "hello", "hi", "hey", "ดีครับ", "ดีค่ะ"])) {
    return { intent: INTENTS.GREETING, confidence: 0.75 };
  }

  if (summary.active_points >= HIGH_POINTS_THRESHOLD) {
    return { intent: INTENTS.HIGH_POINTS_FALLBACK, confidence: 0.65 };
  }

  return { intent: INTENTS.GENERAL, confidence: 0.45 };
}

export function isKenjiMemberLineCandidate(text) {
  const classified = classifyKenjiMemberIntent(text, {});
  return ![INTENTS.EMPTY, INTENTS.GENERAL, INTENTS.HIGH_POINTS_FALLBACK].includes(classified.intent);
}

export function buildKenjiMemberReply(input, memberSummary = {}, options = {}) {
  const summary = getSafeMemberSummary(memberSummary);
  const classified = classifyKenjiMemberIntent(input, summary);
  const name = summary.display_name ? `พี่${summary.display_name}` : "พี่";
  const statusLine = buildStatusLine(summary);
  const lineOfficialChatUrl = toText(options.lineOfficialChatUrl);

  switch (classified.intent) {
    case INTENTS.EMPTY:
      return `สวัสดีครับ ${name} ผม Kenji ครับ พิมพ์เรื่องที่อยากให้ช่วยได้เลย เช่น จอง, ส่งสลิป, แต้ม, ต่ออายุสมาชิก, VIP, SVIP หรือ Black Card ครับ`;
    case INTENTS.GREETING:
      return `สวัสดีครับ ${name} ผม Kenji ครับ วันนี้ให้ผมช่วยเรื่องสมาชิก จองงาน แต้ม หรือส่งหลักฐานชำระเงินได้เลยครับ`;
    case INTENTS.TALK_TO_PER_AI:
      return `ได้ครับ ${name} ผม Kenji ผู้ช่วยสมาชิกของ MMD Privé ครับ ผมช่วยจัดเรื่องให้เป็นขั้นตอน และส่งต่อเคสที่ต้องให้ Per ตรวจสอบได้ครับ วันนี้อยากให้ผมช่วยเรื่องไหนก่อนครับ`;
    case INTENTS.BOOKING:
      return `ผมช่วยพาไปขั้นตอนการจองได้ครับ แต่ขอเช็กสถานะสมาชิก เงื่อนไข และความพร้อมก่อนนะครับ${statusLine} ถ้ามีนายแบบ วัน เวลา และโซนที่ต้องการ ส่งมาได้เลยครับ`;
    case INTENTS.MODEL_AVAILABILITY:
      return `รับทราบครับ ${name} เดี๋ยวผมช่วยจัดข้อมูลเพื่อให้ Per หรือระบบเช็กสถานะนายแบบและความพร้อมก่อนยืนยันการจองนะครับ`;
    case INTENTS.PAYMENT_SLIP:
      return `รับทราบครับ ${name} สลิปหรือหลักฐานการโอนเป็น supporting evidence เท่านั้นนะครับ ยังไม่ถือเป็นการยืนยันยอด การยืนยันต้องผ่าน official verification และ fund matching ก่อนครับ`;
    case INTENTS.POINTS:
      if (summary.active_points > 0) return `ตอนนี้ผมเห็นแต้มของ${name}ประมาณ ${formatPoints(summary.active_points)} points ครับ แต้มช่วยประกอบการดูแลได้ แต่การอัปเกรดหรือสิทธิ์พิเศษต้องตรวจตามเงื่อนไขล่าสุดก่อนครับ`;
      return `ผมช่วยเช็กแต้มผ่านสถานะสมาชิกให้ได้ครับ ตอนนี้ยังไม่มีแต้มที่ยืนยันได้ใน LINE นี้ ขอเช็กจาก Member Home / Status Hub หรือให้ทีมตรวจสถานะล่าสุดก่อนนะครับ`;
    case INTENTS.VIP:
      return `VIP ดูจากหลายสัญญาณประกอบกันได้ครับ เช่น สถานะสมาชิก ประวัติการใช้งาน แต้ม และการตรวจสอบจากทีม แต่ยังไม่ใช่การอัปเกรดอัตโนมัติหรือการการันตีสิทธิ์นะครับ`;
    case INTENTS.SVIP:
      return `SVIP ต้องพิจารณาเป็นรายเคสโดย Boss Per เท่านั้นครับ และไม่ได้ปลดล็อกจากแต้มอัตโนมัติ ผมช่วยรวบรวมข้อมูลให้เข้าทาง review ที่ถูกต้องได้ครับ`;
    case INTENTS.BLACK_CARD:
      return `Black Card เป็น private review เท่านั้นครับ ไม่ใช่ automatic approval ผมช่วยเตรียมบริบทสมาชิกให้ทีมตรวจแบบส่วนตัวและปลอดภัยได้ครับ`;
    case INTENTS.MEMBERSHIP_RENEWAL:
      return `ผมช่วยดูเรื่องสถานะสมาชิกหรือต่ออายุได้ครับ${statusLine} ถ้ามีหลักฐานชำระเงิน ส่งได้ครับ แต่การยืนยันยังต้องผ่าน official verification และ fund matching ก่อนนะครับ`;
    case INTENTS.PRICING_RATE:
      return `สอบถามเรทกับผมได้ครับ เดี๋ยวผมช่วยรับเรื่องและส่งให้ Per/Ewvon ตรวจสอบราคา รายละเอียด และเงื่อนไขที่เหมาะสมก่อนแจ้งกลับนะครับ`;
    case INTENTS.HIGH_POINTS_FALLBACK:
      return `แต้มของ${name}ดูแข็งแรงครับ แต่ผมจะไม่สรุป VIP, SVIP หรือ Black Card ให้อัตโนมัติ ถ้าพี่ต้องการ ผมช่วยพาไปเช็กขั้นตอนสมาชิกที่เหมาะสมต่อได้ครับ`;
    default:
      return `ผมช่วยดูเรื่องสมาชิก จองงาน แต้ม การชำระเงิน VIP, SVIP หรือ Black Card ได้ครับ${lineOfficialChatUrl ? ` ถ้าต้องส่งต่อให้ทีม ผมจะพาไปทาง official flow ให้ครับ` : ""}`;
  }
}

function buildStatusLine(summary) {
  const parts = [];
  if (summary.membership_status) parts.push(`สถานะ: ${summary.membership_status}`);
  if (summary.tier) parts.push(`tier: ${summary.tier}`);
  if (summary.active_points > 0) parts.push(`แต้ม: ${formatPoints(summary.active_points)}`);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

export { HIGH_POINTS_THRESHOLD, INTENTS };
