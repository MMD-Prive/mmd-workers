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
    includesAny(dense, [
      "คุยกับเคนจิ",
      "คุยกับperai",
      "คุยกับเปอร์ai",
      "ขอคุยกับเคนจิ",
      "ขอคุยกับperai",
      "hiper",
      "helloper",
      "สวัสดีเปอร์",
    ]) ||
    /\b(?:hi|hello)\s+per\b/i.test(text)
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
      return `สวัสดีครับ ${name} เลือกหัวข้อจากเมนูได้เลยครับ ผมจะพาไปยังขั้นตอนที่ตรงกับเรื่องที่ต้องการครับ`;
    case INTENTS.GREETING:
      return `สวัสดีครับ ${name} วันนี้ต้องการให้ช่วยเรื่องไหนครับ เลือกจากเมนูด้านล่างได้เลยครับ`;
    case INTENTS.TALK_TO_PER_AI:
      return `ได้ครับ ${name} ผม Kenji ผู้ช่วยสมาชิกของ MMD Privé ครับ บอกเรื่องที่ต้องการได้เลยครับ ผมจะช่วยจัดเข้าขั้นตอนที่ถูกต้องให้ครับ`;
    case INTENTS.BOOKING:
      return `ได้ครับ ${name} ถ้าต้องการจอง ส่งบริการหรือนายแบบที่สนใจ พร้อมวัน เวลา และโซนมาได้เลยครับ ผมจะรวบรวมบรีฟให้ตรวจความพร้อมก่อนยืนยันครับ${statusLine}`;
    case INTENTS.MODEL_AVAILABILITY:
      return `ได้ครับ ${name} ส่งชื่อนายแบบ วันที่ เวลา และโซนที่ต้องการมาได้เลยครับ ผมจะช่วยจัดข้อมูลเพื่อเช็กคิวก่อนยืนยันครับ`;
    case INTENTS.PAYMENT_SLIP:
      return `รับทราบครับ ${name} ส่งสลิปหรือหลักฐานการโอนได้เลยครับ ผมจะรับเข้า official verification ให้ตรวจยอดและจับคู่กับรายการที่ถูกต้องก่อนยืนยันครับ`;
    case INTENTS.POINTS:
      if (summary.active_points > 0) return `ตอนนี้แต้มที่ยืนยันได้ของ${name}คือ ${formatPoints(summary.active_points)} points ครับ หากต้องการใช้แต้มดูสิทธิ์หรือการอัปเกรด ผมจะพาไปตรวจเงื่อนไขของสมาชิกต่อครับ`;
      return `ตอนนี้ยังไม่พบแต้มที่ยืนยันได้จาก LINE นี้ครับ ให้เปิด Member Home เพื่อตรวจสถานะก่อน หรือส่งเรื่องให้ตรวจข้อมูลสมาชิกอย่างเป็นทางการได้ครับ`;
    case INTENTS.VIP:
      return `เรื่อง VIP ต้องตรวจจากสถานะสมาชิกและหลักฐานที่เกี่ยวข้องก่อนครับ ผมรับเรื่องไว้จัดเข้าการตรวจสอบให้ได้ แต่จะไม่สรุปหรือเปิดสิทธิ์ให้อัตโนมัติครับ`;
    case INTENTS.SVIP:
      return `เรื่อง SVIP ต้องให้ Boss Per พิจารณาเป็นรายเคสครับ แต้มเพียงอย่างเดียวไม่เปิดสิทธิ์อัตโนมัติ ผมช่วยรวบรวมข้อมูลเพื่อส่งเข้า review ได้ครับ`;
    case INTENTS.BLACK_CARD:
      return `เรื่อง Black Card ต้องผ่าน private review ครับ ไม่ใช่การอนุมัติอัตโนมัติ ผมช่วยจัดข้อมูลสมาชิกเพื่อส่งเข้าการตรวจสอบแบบส่วนตัวได้ครับ`;
    case INTENTS.MEMBERSHIP_RENEWAL:
      return `ได้ครับ ${name} ปุ่มนี้ใช้สำหรับตรวจสถานะและต่ออายุสมาชิกครับ${statusLine} หากชำระเงินแล้ว ส่งหลักฐานมาได้ และรอ official verification ก่อนสิทธิ์จะอัปเดตครับ`;
    case INTENTS.PRICING_RATE:
      return `เรื่องราคาและเรทต้องอ้างอิงบริการ นายแบบ วันเวลา และรายละเอียดงานครับ ส่งบรีฟมาได้เลย ผมจะจัดข้อมูลให้ตรวจราคาและเงื่อนไขที่ตรงกับงานครับ`;
    case INTENTS.HIGH_POINTS_FALLBACK:
      return `ตอนนี้แต้มของ${name}อยู่ในระดับที่ควรตรวจสิทธิ์เพิ่มเติมครับ แต่ยังไม่ใช่การยืนยัน VIP, SVIP หรือ Black Card อัตโนมัติ ผมช่วยพาไปขั้นตอนตรวจสมาชิกที่ถูกต้องได้ครับ`;
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
