const BOOKING_START_RE = /(?:อยาก|ขอ|ต้องการ|จะ)\s*(?:จอง|นัด)|(?:จอง|นัด)\s*(?:น้อง|model|นายแบบ|บริการ)/i;
const RENEWAL_START_RE = /(?:อยาก|ขอ|ต้องการ|จะ)\s*ต่ออายุ|^ต่ออายุสมาชิก\s*$/i;
const PROOF_START_RE = /(?:ส่ง|แนบ|อัปโหลด|upload)\s*(?:สลิป|หลักฐาน(?:การชำระเงิน)?)|(?:นี่|นี้)\s*(?:คือ)?\s*สลิป/i;
const MMS_START_RE = /(?:อยาก|ขอ|ต้องการ|จะ)\s*(?:จอง)?\s*(?:mms|นวด)|(?:จอง|นัด)\s*(?:mms|นวด)/i;

const THAI_WEEKDAYS = Object.freeze({
  "อาทิตย์": 0,
  "จันทร์": 1,
  "อังคาร": 2,
  "พุธ": 3,
  "พฤหัส": 4,
  "พฤหัสบดี": 4,
  "ศุกร์": 5,
  "เสาร์": 6,
});

const BOOKING_SERVICES = Object.freeze([
  ["dining", /(?:dinner|dining|ทานข้าว|กินข้าว|ดินเนอร์)/i],
  ["drinks", /(?:drinks?|ดื่ม|บาร์)/i],
  ["event", /(?:event|อีเวนต์|ออกงาน|งานเลี้ยง)/i],
  ["appearance", /(?:appearance|ปรากฏตัว|ร่วมงาน)/i],
  ["private", /(?:private|ส่วนตัว|ไพรเวท)/i],
  ["companion", /(?:companion|เพื่อนเที่ยว|เพื่อนคุย|travel|เที่ยว)/i],
]);

const AREAS = Object.freeze([
  ["Sathorn", /(?:สาทร|sathorn)/i],
  ["Silom", /(?:สีลม|silom)/i],
  ["Sukhumvit", /(?:สุขุมวิท|sukhumvit)/i],
  ["Asok", /(?:อโศก|asok)/i],
  ["Thong Lo", /(?:ทองหล่อ|thong\s*lo|thonglor)/i],
  ["Ekkamai", /(?:เอกมัย|ekkamai)/i],
  ["Rama 9", /(?:พระราม\s*9|rama\s*9)/i],
  ["Ratchada", /(?:รัชดา|ratchada)/i],
  ["Ari", /(?:อารีย์|ari)/i],
  ["Chatuchak", /(?:จตุจักร|chatuchak)/i],
  ["Lat Phrao", /(?:ลาดพร้าว|lat\s*phrao|ladprao)/i],
  ["Bang Na", /(?:บางนา|bang\s*na)/i],
  ["On Nut", /(?:อ่อนนุช|on\s*nut)/i],
  ["Riverside", /(?:ริเวอร์ไซด์|ริมแม่น้ำ|riverside)/i],
  ["Thonburi", /(?:ธนบุรี|thonburi)/i],
  ["Nonthaburi", /(?:นนทบุรี|นนท์|nonthaburi)/i],
  ["Pak Kret", /(?:ปากเกร็ด|pak\s*kret)/i],
]);

const MMS_ZONES = Object.freeze([
  ["sukhumvit", /(?:สุขุมวิท|sukhumvit)/i],
  ["sathorn_silom", /(?:สาทร|สีลม|sathorn|silom)/i],
  ["rama9_ratchada", /(?:พระราม\s*9|รัชดา|rama\s*9|ratchada)/i],
  ["ari_chatuchak", /(?:อารีย์|จตุจักร|ari|chatuchak)/i],
  ["latphrao_raminthra", /(?:ลาดพร้าว|รามอินทรา|lat\s*phrao|ramintra|ram\s*inthra)/i],
  ["onnut_bangna", /(?:อ่อนนุช|บางนา|on\s*nut|bang\s*na)/i],
  ["riverside_oldtown", /(?:ริมแม่น้ำ|ริเวอร์ไซด์|เมืองเก่า|riverside|old\s*town)/i],
  ["thonburi", /(?:ธนบุรี|thonburi)/i],
  ["donmueang_laksi", /(?:ดอนเมือง|หลักสี่|don\s*mueang|lak\s*si)/i],
  ["other_bangkok", /(?:กรุงเทพ|bangkok)/i],
]);

const MMS_SKILLS = Object.freeze([
  ["aroma_therapy_oil", /(?:aroma|oil|น้ำมัน|อโรมา|ผ่อนคลาย)/i],
  ["thai_massage", /(?:thai massage|นวดไทย|คลายเส้น)/i],
  ["sport_massage", /(?:sport|sports|สปอร์ต)/i],
  ["office_syndrome", /(?:office syndrome|ออฟฟิศซินโดรม|แก้อาการนั่ง)/i],
  ["health_fitness_advisor", /(?:health|fitness|โภชนาการ|ออกกำลังกาย)/i],
  ["thai_herbal_compress", /(?:herbal|สมุนไพร|ประคบ)/i],
  ["partner_present", /(?:partner present|มีคู่|มีแฟน|ผู้ติดตาม)/i],
  ["women_massage", /(?:women massage|นวดผู้หญิง|สำหรับผู้หญิง)/i],
]);

export function detectHypeTransactionStart(message = {}) {
  const text = normalize(message.text || message.caption || "");
  if (!text && !hasPaymentNamedDocument(message)) return null;

  if (/^\/book(?:@\w+)?(?:\s|$)/i.test(text)) return result("booking", "explicit");
  if (/^\/(?:proof|slip)(?:@\w+)?(?:\s|$)/i.test(text)) return result("payment_proof", "explicit");
  if (/^\/renew(?:@\w+)?(?:\s|$)/i.test(text)) return result("renewal", "explicit");
  if (/^\/mms(?:@\w+)?(?:\s|$)/i.test(text)) return result("mms", "explicit");

  if (PROOF_START_RE.test(text) || (hasPaymentNamedDocument(message) && /(?:สลิป|slip|receipt|payment|โอน|ชำระ)/i.test(text))) {
    return result("payment_proof", "natural_language");
  }
  if (MMS_START_RE.test(text)) return result("mms", "natural_language");
  if (RENEWAL_START_RE.test(text)) return result("renewal", "natural_language");
  if (BOOKING_START_RE.test(text)) return result("booking", "natural_language");
  return null;
}

export function extractHypeTransactionFields(mode, message = {}, now = new Date()) {
  const text = normalize(message.text || message.caption || "");
  if (mode === "booking") {
    return compact({
      service_intent: firstMatchCode(text, BOOKING_SERVICES),
      preferred_date: parseDate(text, now),
      preferred_time: parseTime(text),
      area: firstMatchCode(text, AREAS),
      duration: parseDurationText(text),
      model_preference: parseModelPreference(text),
    });
  }
  if (mode === "payment_proof") {
    const evidenceType = paymentEvidenceType(message, text);
    return compact({
      evidence_present: Boolean(evidenceType),
      evidence_type: evidenceType,
      customer_note: stripCommand(text, ["proof", "slip"]),
    });
  }
  if (mode === "renewal") {
    return compact({
      intent: "renew",
      customer_note: stripCommand(text, ["renew"]),
    });
  }
  if (mode === "mms") {
    return compact({
      recipient_gender: parseRecipientGender(text),
      zone: firstMatchCode(text, MMS_ZONES),
      service_date: parseDate(text, now),
      service_time: parseTime(text),
      duration_minutes: parseDurationMinutes(text),
      skills: allMatchCodes(text, MMS_SKILLS),
      therapist_preference: parseTherapistPreference(text),
    });
  }
  return {};
}

export function transactionMissingQuestion(mode, missing = []) {
  const labels = {
    service_intent: "ต้องการบริการแบบไหนครับ เช่น Dining / Drinks / Event / Companion",
    preferred_date: "ต้องการวันไหนครับ",
    preferred_time: "ต้องการเวลาเริ่มประมาณกี่โมงครับ",
    area: "ใช้บริการแถวไหนครับ",
    payment_evidence: "แนบสลิป/หลักฐานในข้อความนี้ได้ครับ ผมจะเก็บแค่ว่ามีหลักฐานและพาไปหน้ารับหลักฐานของรายการจริง",
    recipient_gender: "ผู้รับบริการเป็นผู้ชาย / ผู้หญิง / อื่น ๆ / ไม่ประสงค์ระบุครับ (ผมจะไม่เดาจากโปรไฟล์)",
    zone: "ต้องการ MMS โซนไหนครับ เช่น Sukhumvit, Sathorn/Silom, Rama 9/Ratchada",
    service_date: "ต้องการนวดวันไหนครับ",
    service_time: "ต้องการเริ่มกี่โมงครับ",
    skills: "ต้องการบริการอะไรครับ เช่น Aroma Oil, Thai Massage, Sport Massage, Office Syndrome",
  };
  return missing.map((field) => labels[field]).filter(Boolean)[0] || "ข้อมูลหลักครบแล้วครับ";
}

export function transactionModeLabel(mode) {
  return ({
    booking: "Booking Intake",
    payment_proof: "Payment Proof Intake",
    renewal: "Membership Renewal Intake",
    mms: "MMS Pre-booking Intake",
  })[mode] || "Transaction Intake";
}

function result(mode, source) {
  return { mode, source };
}

function parseDate(text, now) {
  const iso = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dmy = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}|25\d{2}))?\b/);
  if (dmy) {
    let year = dmy[3] ? Number(dmy[3]) : bangkokParts(now).year;
    if (year >= 2500) year -= 543;
    return validIso(year, Number(dmy[2]), Number(dmy[1]));
  }

  const base = bangkokDate(now);
  if (/\bวันนี้\b|วันนี้/.test(text)) return isoFromDate(base);
  if (/\bพรุ่งนี้\b|พรุ่งนี้/.test(text)) return isoFromDate(addDays(base, 1));
  if (/มะรืน/.test(text)) return isoFromDate(addDays(base, 2));

  for (const [name, weekday] of Object.entries(THAI_WEEKDAYS)) {
    if (!text.includes(name)) continue;
    let delta = (weekday - base.getUTCDay() + 7) % 7;
    if (delta === 0) delta = 7;
    if (text.includes("นี้") && delta > 6) delta -= 7;
    return isoFromDate(addDays(base, delta));
  }
  return "";
}

function parseTime(text) {
  const clock = text.match(/(?:^|\D)([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*(?:น\.?|นาฬิกา))?/);
  if (clock) return `${String(Number(clock[1])).padStart(2, "0")}:${clock[2]}`;

  const numericHour = text.match(/(?:^|\D)(\d{1,2})\s*(ทุ่ม|โมงเย็น|โมงเช้า|โมง|นาฬิกา)(?:\s*(\d{1,2})\s*นาที)?/);
  if (numericHour) {
    let h = Number(numericHour[1]);
    const suffix = numericHour[2];
    const minute = Math.min(59, Number(numericHour[3] || 0));
    if (suffix === "ทุ่ม" && h >= 1 && h <= 5) h += 18;
    else if (suffix === "โมงเย็น" && h >= 1 && h <= 6) h += 12;
    else if (suffix === "โมงเช้า" && h >= 1 && h <= 11) h = h;
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const thaiHours = [
    ["หนึ่งทุ่ม", "19:00"], ["สองทุ่ม", "20:00"], ["สามทุ่ม", "21:00"],
    ["สี่ทุ่ม", "22:00"], ["ห้าทุ่ม", "23:00"], ["เที่ยงคืน", "00:00"],
    ["เที่ยง", "12:00"],
  ];
  for (const [needle, value] of thaiHours) if (text.includes(needle)) return value;

  const afternoon = text.match(/บ่าย\s*(\d{1,2})(?:\s*โมง)?/);
  if (afternoon) {
    const n = Number(afternoon[1]);
    const h = n >= 1 && n <= 5 ? n + 12 : n;
    if (h >= 12 && h <= 17) return `${String(h).padStart(2, "0")}:00`;
  }
  return "";
}

function parseDurationText(text) {
  const hours = text.match(/(\d+(?:\.\d+)?)\s*ชั่วโมง/);
  if (hours) return `${hours[1]} ชั่วโมง`;
  if (/half\s*day|ครึ่งวัน/i.test(text)) return "half_day";
  if (/full\s*day|เต็มวัน/i.test(text)) return "full_day";
  return "";
}

function parseDurationMinutes(text) {
  const mins = text.match(/(\d{2,3})\s*นาที/);
  if (mins) {
    const value = Number(mins[1]);
    return value >= 60 && value <= 300 ? value : undefined;
  }
  const hours = text.match(/(\d+(?:\.\d+)?)\s*ชั่วโมง/);
  if (hours) {
    const value = Math.round(Number(hours[1]) * 60);
    return value >= 60 && value <= 300 ? value : undefined;
  }
  return undefined;
}

function parseModelPreference(text) {
  const patterns = [
    /(?:น้อง|model|นายแบบ)\s*([A-Za-z][A-Za-z0-9._ -]{1,30})/i,
    /(?:อยากได้|ขอ)\s*([A-Za-z][A-Za-z0-9._ -]{1,30})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return "";
}

function parseTherapistPreference(text) {
  const match = text.match(/(?:therapist|นักบำบัด|หมอนวด)\s*([A-Za-z][A-Za-z0-9._ -]{1,30})/i);
  return match ? match[1].trim() : "";
}

function parseRecipientGender(text) {
  if (/(?:ผู้รับบริการ|สำหรับ)\s*(?:เป็น)?\s*ผู้หญิง|women\s*(?:massage|client)|recipient\s*(?:is\s*)?female/i.test(text)) return "female";
  if (/(?:ผู้รับบริการ|สำหรับ)\s*(?:เป็น)?\s*ผู้ชาย|recipient\s*(?:is\s*)?male/i.test(text)) return "male";
  if (/(?:ผู้รับบริการ|สำหรับ)\s*(?:เป็น)?\s*(?:อื่น|เพศอื่น)|recipient\s*(?:is\s*)?other/i.test(text)) return "other";
  if (/ไม่ประสงค์ระบุ|prefer\s*not\s*to\s*say/i.test(text)) return "prefer_not_to_say";
  return "";
}

function paymentEvidenceType(message, text) {
  const explicit = /(?:สลิป|slip|receipt|หลักฐาน(?:การชำระเงิน)?|โอน|payment proof)/i.test(text);
  if (!explicit) return "";
  if (Array.isArray(message.photo) && message.photo.length) return "photo";
  const doc = message.document || {};
  const mime = String(doc.mime_type || "").toLowerCase();
  if (doc.file_id && (/^image\//.test(mime) || mime === "application/pdf")) return mime === "application/pdf" ? "pdf" : "document_image";
  return "";
}

function hasPaymentNamedDocument(message) {
  const name = String(message.document?.file_name || "");
  return Boolean(message.document?.file_id && /(?:slip|receipt|payment|transfer|สลิป)/i.test(name));
}

function firstMatchCode(text, rows) {
  for (const [code, pattern] of rows) if (pattern.test(text)) return code;
  return "";
}

function allMatchCodes(text, rows) {
  return rows.filter(([, pattern]) => pattern.test(text)).map(([code]) => code);
}

function stripCommand(text, commands) {
  let out = text;
  for (const command of commands) out = out.replace(new RegExp(`^/${command}(?:@\\w+)?\\s*`, "i"), "");
  return out.trim().slice(0, 500);
}

function validIso(year, month, day) {
  if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return isoFromDate(date);
}

function bangkokParts(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function bangkokDate(now) {
  const p = bangkokParts(now);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function isoFromDate(date) {
  return date.toISOString().slice(0, 10);
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (item === "" || item === null || item === undefined) return false;
    if (Array.isArray(item) && item.length === 0) return false;
    return true;
  }));
}

function normalize(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}
