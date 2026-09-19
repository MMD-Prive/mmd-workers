import { resolveCanonicalKenjiLineClient } from "./kenji-line-canonical-client-resolution.mjs";

export const KENJI_LV5_LINE_SCHEMA = "mmd.kenji_line_operational_concierge.v1";
export const KENJI_LV5_LIVE_RPC_PATH = "/v1/internal/kenji/operational-context/live";

const BOOKING_SIGNAL_RE = /(จอง|book|booking|reserve|นัด|คิว|ว่าง|available|availability|เช็กคิว|เช็คคิว|รับงาน)/i;
const BOOKING_STATUS_RE = /(?:จอง|booking|request|คิว).{0,20}(?:ถึงไหน|สถานะ|คอนเฟิร์ม|confirm(?:ed)?|เรียบร้อย|หรือยัง)|(?:สถานะ).{0,12}(?:จอง|booking|request)/i;
const PAYMENT_SIGNAL_RE = /(สลิป|โอน|จ่าย|ชำระ|payment|paid|deposit|มัดจำ|เครดิต|credit)/i;
const DEPOSIT_TRIGGER_RE = /(?:มัดจำ|deposit)/i;
const LOCATION_PREFIX_RE = /(?:^|[\s,])(?:โซน|แถว|สถานที่|ที่)\s*[:：-]?\s*([^,\n]{2,80})/i;
const DATE_WORDS_RE = /(วันนี้|คืนนี้|พรุ่งนี้|มะรืน|วันที่|วัน\s*(?:จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)/i;
const TIME_WORDS_RE = /(เวลา\s*)?(\d{1,2})[:.](\d{2})|(?:ตี|บ่าย|ทุ่ม)\s*(หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|\d{1,2})|เที่ยงคืน|เที่ยง|สองทุ่ม|หนึ่งทุ่ม/i;
const THAI_MONTHS = Object.freeze({
  "ม.ค.": 1, "มกราคม": 1,
  "ก.พ.": 2, "กุมภาพันธ์": 2,
  "มี.ค.": 3, "มีนาคม": 3,
  "เม.ย.": 4, "เมษายน": 4,
  "พ.ค.": 5, "พฤษภาคม": 5,
  "มิ.ย.": 6, "มิถุนายน": 6,
  "ก.ค.": 7, "กรกฎาคม": 7,
  "ส.ค.": 8, "สิงหาคม": 8,
  "ก.ย.": 9, "กันยายน": 9,
  "ต.ค.": 10, "ตุลาคม": 10,
  "พ.ย.": 11, "พฤศจิกายน": 11,
  "ธ.ค.": 12, "ธันวาคม": 12,
});
const THAI_NUMBERS = Object.freeze({ หนึ่ง: 1, สอง: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9, สิบ: 10 });
const OPERATIONAL_INTENTS = new Set([
  "availability_request",
  "booking_status",
  "payment_status",
  "payment_slip",
  "payment_dispute",
  "care_back_payment_points",
]);

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function token(value) {
  return text(value, 120).toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function lineUserId(event = {}) {
  const value = event?.source?.type === "user" ? text(event?.source?.userId, 80) : "";
  return /^U[0-9a-f]{32}$/i.test(value) ? value : "";
}

function eventText(event = {}) {
  if (event?.type === "message" && event?.message?.type === "text") return text(event.message.text, 1000);
  if (event?.type === "postback") return text(event?.postback?.displayText || event?.postback?.data, 1000);
  return "";
}

function bangkokParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

function isoDateFromOffset(offsetDays = 0, now = new Date()) {
  const p = bangkokParts(now);
  const base = new Date(`${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T12:00:00+07:00`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  const out = bangkokParts(base);
  return `${out.year}-${String(out.month).padStart(2, "0")}-${String(out.day).padStart(2, "0")}`;
}

function normalizeYear(value, fallbackYear) {
  let year = Number(value || fallbackYear);
  if (!Number.isFinite(year)) return fallbackYear;
  if (year >= 2500) year -= 543;
  if (year < 100) year += 2000;
  return year;
}

export function extractOperationalDate(raw = "", now = new Date()) {
  const value = text(raw, 1000);
  if (/มะรืน/.test(value)) return isoDateFromOffset(2, now);
  if (/พรุ่งนี้/.test(value)) return isoDateFromOffset(1, now);
  if (/วันนี้|คืนนี้/.test(value)) return isoDateFromOffset(0, now);

  const slash = value.match(/(?:วันที่\s*)?(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
  if (slash) {
    const current = bangkokParts(now);
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = normalizeYear(slash[3], current.year);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const months = Object.keys(THAI_MONTHS).sort((a, b) => b.length - a.length).map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const thai = value.match(new RegExp(`(?:วันที่\\s*)?(\\d{1,2})\\s*(${months})(?:\\s+(\\d{2,4})(?!:))?`, "i"));
  if (thai) {
    const current = bangkokParts(now);
    const day = Number(thai[1]);
    const month = THAI_MONTHS[thai[2]];
    let year = normalizeYear(thai[3], current.year);
    if (!thai[3]) {
      const candidate = Number(`${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`);
      const today = Number(`${current.year}${String(current.month).padStart(2, "0")}${String(current.day).padStart(2, "0")}`);
      if (candidate < today) year += 1;
    }
    if (day >= 1 && day <= 31 && month) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return "";
}

function thaiNumber(value) {
  const raw = text(value, 20).toLowerCase();
  if (/^\d{1,2}$/.test(raw)) return Number(raw);
  return THAI_NUMBERS[raw] || 0;
}

export function extractOperationalTime(raw = "") {
  const value = text(raw, 1000);
  const clock = value.match(/(?:เวลา\s*)?(\d{1,2})[:.](\d{2})/i);
  if (clock) {
    const hour = Number(clock[1]);
    const minute = Number(clock[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  if (/เที่ยงคืน/.test(value)) return "00:00";
  if (/เที่ยง(?!คืน)/.test(value)) return "12:00";
  const reversed = value.match(/(หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|\d{1,2})\s*ทุ่ม/i);
  if (reversed) {
    const n = thaiNumber(reversed[1]);
    const hour = 18 + n;
    return n && hour <= 23 ? `${String(hour).padStart(2, "0")}:00` : "";
  }
  const thai = value.match(/(ตี|บ่าย|ทุ่ม)\s*(หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|\d{1,2})/i);
  if (!thai) return "";
  const n = thaiNumber(thai[2]);
  if (!n) return "";
  let hour = n;
  if (thai[1] === "ตี") hour = n % 12;
  if (thai[1] === "บ่าย") hour = n === 12 ? 12 : 12 + n;
  if (thai[1] === "ทุ่ม") hour = 18 + n;
  return hour >= 0 && hour <= 23 ? `${String(hour).padStart(2, "0")}:00` : "";
}

function minutesFromTime(value = "") {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function timeFromMinutes(value) {
  if (!Number.isFinite(value)) return "";
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function extractOperationalDurationHours(raw = "") {
  const value = text(raw, 1000);
  const match = value.match(/(?:ระยะเวลา|duration)?\s*(\d+(?:\.\d+)?)\s*(?:ชั่วโมง|ชม\.?|hours?|hrs?)/i);
  const duration = Number(match?.[1] || 0);
  return Number.isFinite(duration) && duration > 0 && duration <= 24 ? duration : 0;
}

export function extractOperationalEndTime(raw = "", startTime = "") {
  const value = text(raw, 1000);
  const range = value.match(/(?:\d{1,2})[:.](?:\d{2})\s*(?:-|–|—|ถึง|to)\s*(\d{1,2})[:.](\d{2})/i);
  if (range) {
    const hour = Number(range[1]);
    const minute = Number(range[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const explicit = value.match(/(?:ถึง|เลิก|สิ้นสุด|end)\s*(?:เวลา)?\s*(\d{1,2})[:.](\d{2})/i);
  if (explicit) {
    const hour = Number(explicit[1]);
    const minute = Number(explicit[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const duration = extractOperationalDurationHours(value);
  const startMinutes = minutesFromTime(startTime);
  return duration && startMinutes !== null ? timeFromMinutes(startMinutes + duration * 60) : "";
}

function parseMoney(value = "", unit = "") {
  const normalized = text(value, 40).replace(/,/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * (/^(?:k|พัน)$/i.test(text(unit, 10)) ? 1000 : 1));
}

function extractLabeledMoney(raw = "", labelPattern = "") {
  const match = text(raw, 1000).match(new RegExp(`(?:${labelPattern})\\s*[:：=]?\\s*(?:บาท\\s*)?([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(k|พัน|บาท|thb)?`, "i"));
  return match ? parseMoney(match[1], match[2]) : 0;
}

export function extractOperationalRate(raw = "") {
  return extractLabeledMoney(raw, "เรท|ราคา|ค่าตัว|ยอดรวม|rate|total");
}

export function extractOperationalDepositAmount(raw = "") {
  return extractLabeledMoney(raw, "มัดจำ|deposit");
}

export function extractOperationalCustomerName(raw = "") {
  const value = text(raw, 1000);
  const match = value.match(/(?:ชื่อลูกค้า|ลูกค้า|client)\s*[:：-]?\s*([^,\n]{2,80})/i);
  if (!match?.[1]) return "";
  return match[1]
    .split(/(?:นายแบบ|model|โมเดล|วันที่|วัน\s|เวลา|ที่|สถานที่|โซน|แถว|เรท|ราคา|ค่าตัว|ยอดรวม|มัดจำ|deposit|rate|total)/i)[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function stripKnownBookingTokens(raw = "") {
  let value = text(raw, 1000)
    .replace(BOOKING_SIGNAL_RE, " ")
    .replace(DATE_WORDS_RE, " ")
    .replace(TIME_WORDS_RE, " ")
    .replace(/(?:เวลา|วันที่|โซน|แถว|สถานที่|ที่)\s*/gi, " ")
    .replace(/(?:ครับ|ค่ะ|คะ|นะ|หน่อย|ให้หน่อย|ได้ไหม|ได้มั้ย)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value;
}

export function extractOperationalModelName(raw = "") {
  const value = text(raw, 1000);
  const explicit = value.match(/(?:ชื่อนายแบบ|นายแบบ|model|โมเดล|ชื่อ(?!ลูกค้า))\s*[:：-]?\s*([A-Za-z0-9ก-๙_-]{2,40})/i);
  if (explicit?.[1]) return explicit[1];
  const afterBooking = value.match(/(?:จอง|book|booking|reserve|นัด)\s+([A-Za-z0-9ก-๙_-]{2,40})/i);
  if (afterBooking?.[1] && !/^(?:วันที่|เวลา|วันนี้|คืนนี้|พรุ่งนี้|มะรืน)$/i.test(afterBooking[1])) return afterBooking[1];
  return "";
}

export function extractOperationalLocation(raw = "", modelName = "") {
  const value = text(raw, 1000);
  const explicit = value.match(LOCATION_PREFIX_RE);
  if (explicit?.[1]) {
    const location = explicit[1]
      .split(/(?:วันที่|เวลา|วันนี้|คืนนี้|พรุ่งนี้|มะรืน|เรท|ราคา|ค่าตัว|ยอดรวม|มัดจำ|deposit|rate|total|ถึง\s*\d)/i)[0]
      .replace(modelName, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (location.length >= 2) return location.slice(0, 120);
  }

  const cleaned = stripKnownBookingTokens(value).replace(modelName, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length >= 2 && cleaned.length <= 80 && !PAYMENT_SIGNAL_RE.test(cleaned)) return cleaned;
  return "";
}

function operationalType(currentIntent = "", raw = "") {
  const intent = token(currentIntent);
  if (intent === "booking_status") return "booking_status";
  if (DEPOSIT_TRIGGER_RE.test(raw)) return "booking";
  if (["payment_status", "payment_slip", "payment_dispute", "care_back_payment_points"].includes(intent) || PAYMENT_SIGNAL_RE.test(raw)) return intent === "payment_slip" ? "payment_slip" : "payment";
  if (intent === "availability_request" || BOOKING_SIGNAL_RE.test(raw)) return "booking";
  return "";
}

export function parseKenjiLv5LineIntent(event = {}, currentIntent = "", now = new Date()) {
  const raw = eventText(event);
  const type = operationalType(currentIntent, raw);
  if (!type) return null;
  if (type === "booking_status") return { type, raw };
  if (type === "payment" || type === "payment_slip") return { type, raw };
  const modelName = extractOperationalModelName(raw);
  const date = extractOperationalDate(raw, now);
  const time = extractOperationalTime(raw);
  const durationHours = extractOperationalDurationHours(raw);
  const endTime = extractOperationalEndTime(raw, time);
  const location = extractOperationalLocation(raw, modelName);
  const depositTriggered = DEPOSIT_TRIGGER_RE.test(raw);
  return {
    type: "booking",
    ...(depositTriggered ? { trigger: "deposit" } : {}),
    model_name: modelName,
    customer_name: extractOperationalCustomerName(raw),
    date,
    time,
    end_time: endTime,
    duration_hours: durationHours,
    location,
    amount_thb: extractOperationalRate(raw),
    deposit_amount_thb: extractOperationalDepositAmount(raw),
    raw,
  };
}

export function isKenjiLv5LineOperationalCandidate(event = {}, currentIntent = "") {
  const raw = eventText(event);
  if (!raw || !lineUserId(event)) return false;
  if (OPERATIONAL_INTENTS.has(token(currentIntent))) return true;
  if (token(currentIntent) === "mmd_companion" && BOOKING_SIGNAL_RE.test(raw)) return true;
  return BOOKING_STATUS_RE.test(raw) || PAYMENT_SIGNAL_RE.test(raw);
}

async function callLiveContext(env = {}, payload = {}) {
  const tokenValue = text(env.INTERNAL_TOKEN, 2000);
  if (!env.ADMIN_WORKER?.fetch || !tokenValue) return { ok: false, status: "unavailable", reason: "admin_worker_binding_unavailable" };
  const response = await env.ADMIN_WORKER.fetch(new Request(`https://admin-worker.local${KENJI_LV5_LIVE_RPC_PATH}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokenValue}`,
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": "member-dashboard-chat-worker",
    },
    body: JSON.stringify(payload),
  }));
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) return { ok: false, status: "unavailable", reason: text(data?.error || `live_context_${response.status}`, 120), data };
  return { ok: true, status: "live", data };
}

function formatBangkokDateTime(value = "") {
  const parsed = Date.parse(text(value, 80));
  if (!Number.isFinite(parsed)) return "";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(parsed));
  } catch {
    return "";
  }
}

function firstAction(context = {}, names = []) {
  const actions = Array.isArray(context.next_actions) ? context.next_actions : [];
  return actions.find((item) => names.includes(text(item?.action))) || null;
}

function missingLabels(values = []) {
  const labels = {
    model_or_service: "ชื่อนายแบบหรือบริการ",
    date: "วันที่",
    time: "เวลา",
    duration_or_end_time: "เวลาสิ้นสุดหรือจำนวนชั่วโมง",
    location: "โซนหรือสถานที่",
    rate: "เรทราคา",
  };
  return values.map((item) => labels[item] || item).filter(Boolean);
}

export function renderKenjiLv5LineReply(context = {}, parsedIntent = {}) {
  if (!context || context.ok !== true) return "";
  const displayName = text(context?.client_360?.display_name, 120);
  const name = displayName ? `${displayName} ` : "";

  if (context.fan_in?.identity_resolution !== "canonical") {
    return `${name}ผมยังผูก LINE นี้กับบัญชี MY MMD ที่ยืนยันแล้วไม่ได้ครับ เปิด MY MMD เพื่อยืนยัน LINE ก่อน แล้วพิมพ์รายละเอียดเดิมมาได้เลยครับ`;
  }

  if (context.entitlement_live?.member_blocked === true || firstAction(context, ["handoff_per"])) {
    return `${name}สถานะสิทธิ์ตอนนี้ต้องตรวจต่อก่อนครับ ผมรับเรื่องไว้ให้แล้ว และจะยังไม่ยืนยันงานหรือเปิดสิทธิ์เพิ่มจนกว่าสถานะจะผ่านการตรวจครับ`;
  }

  if (parsedIntent.type === "booking_status") {
    const jobs = Array.isArray(context?.job_live?.jobs) ? context.job_live.jobs : [];
    if (!jobs.length) return `${name}ตอนนี้ผมยังไม่พบงานที่กำลังดำเนินอยู่จากบัญชีนี้ครับ ถ้ามีเลขงานหรือชื่อนายแบบ ส่งมาได้เลย ผมจะเช็กให้ตรงรายการครับ`;
    const job = jobs[0];
    const when = formatBangkokDateTime(job.start_at);
    const model = text(job.model_name, 120);
    const status = text(job.status, 80) || "กำลังดำเนินการ";
    return `${name}งานล่าสุดที่ผมเห็น${model ? `กับ ${model}` : ""}${when ? ` วันที่ ${when}` : ""} อยู่ที่สถานะ “${status}” ครับ ผมอ้างอิงสถานะปัจจุบันของงานนี้ให้ ไม่ถือว่ามีการเปลี่ยนสถานะใหม่ครับ`;
  }

  if (["payment", "payment_slip"].includes(parsedIntent.type)) {
    if (context.payment_live?.review_required === true || firstAction(context, ["review_payment"])) {
      return `${name}หลักฐานการชำระเงินรายการนี้ยังอยู่ระหว่างตรวจสอบครับ ผมเห็นรายการแล้ว แต่จะยังไม่นับว่าได้รับชำระจนกว่าจะผ่าน Official Verification ครับ`;
    }
    if (context.payment_live?.paid === true) {
      return `${name}รายการชำระเงินที่ผูกกับงานนี้อยู่ในสถานะยืนยันแล้วครับ${context.payment_live?.credit_balance_thb > 0 ? ` และมีเครดิตที่ยืนยันแล้วคงเหลือ ${Number(context.payment_live.credit_balance_thb).toLocaleString("th-TH")} บาท` : ""}`;
    }
    if (Number(context.payment_live?.credit_balance_thb || 0) > 0) {
      return `${name}ตอนนี้มีเครดิตที่ยืนยันแล้วคงเหลือ ${Number(context.payment_live.credit_balance_thb).toLocaleString("th-TH")} บาทครับ ก่อนนำไปใช้กับงานใหม่ ผมจะผูกกับรายการที่ถูกต้องและให้ระบบเงินตรวจอีกครั้งครับ`;
    }
    return `${name}ตอนนี้ยังไม่พบสถานะชำระเงินที่ยืนยันแล้วสำหรับรายการที่เกี่ยวข้องครับ ถ้าเพิ่งโอน ส่งสลิปในแชตนี้ได้เลย แล้วรอ Official Verification ก่อนสถานะจะอัปเดตครับ`;
  }

  const missing = Array.isArray(context.missing) ? context.missing : [];
  if (missing.length || firstAction(context, ["request_missing_input"])) {
    const labels = missingLabels(missing);
    return `${name}ได้ครับ ส่ง${labels.join(" + ")}เพิ่มอีกนิดครับ ผมจะใช้ข้อมูลชุดเดิมต่อ ไม่ต้องเริ่มใหม่`;
  }

  if (context.calendar_live?.status === "unavailable" || firstAction(context, ["offer_alternate_slot"])) {
    const next = formatBangkokDateTime(context?.calendar_live?.conflicts?.[0]?.end_at || context?.calendar?.next_available_start);
    return `${name}ช่วงเวลาที่ขอมาชนกับคิวที่มีอยู่ครับ${next ? ` ช่วงหลัง ${next} เป็นจุดถัดไปที่ควรเช็กต่อ` : ""} ถ้าต้องการ ผมใช้รายละเอียดเดิมแล้วเช็กเวลาอื่นต่อให้ได้ครับ`;
  }

  if (context.live_truth_complete !== true) {
    return `${name}ผมรับรายละเอียดไว้แล้วครับ แต่ข้อมูลสดที่ใช้ยืนยันงานยังมาไม่ครบ จึงยังไม่ยืนยันคิวหรือยอดให้ตอนนี้ ผมจะคงรายละเอียดเดิมไว้และส่งต่อให้ตรวจจากข้อมูลจริงครับ`;
  }

  if (firstAction(context, ["prepare_booking_intent"])) {
    const date = text(parsedIntent.date, 20);
    const time = text(parsedIntent.time, 20);
    const model = text(parsedIntent.model_name, 120);
    const location = text(parsedIntent.location, 120);
    const summary = [model, date, time, location].filter(Boolean).join(" · ");
    return `${name}รายละเอียดครบแล้วครับ${summary ? ` — ${summary}` : ""} คิวที่ขอไม่ชนกับงานที่เห็นตอนนี้ ผมเตรียมรายการไว้เข้าขั้นตอนยืนยันต่อได้เลยครับ โดยยังไม่ถือว่าคอนเฟิร์มจนกว่าจะผ่านการยืนยันสุดท้าย`;
  }

  return "";
}

export async function resolveKenjiLv5LineOperationalDecision({ env = {}, event = {}, currentIntent = "", continuity = {}, parsedIntent: suppliedParsedIntent = null, now = new Date() } = {}) {
  if (!suppliedParsedIntent && !isKenjiLv5LineOperationalCandidate(event, currentIntent)) return null;
  const parsedIntent = suppliedParsedIntent && typeof suppliedParsedIntent === "object"
    ? suppliedParsedIntent
    : parseKenjiLv5LineIntent(event, currentIntent, now);
  if (!parsedIntent) return null;

  const canonical = await resolveCanonicalKenjiLineClient({ env, event }).catch(() => ({ resolved: false, status: "unavailable" }));
  const userId = lineUserId(event);
  const payload = {
    client: {
      canonical_client_id: canonical?.resolved === true ? text(canonical.client_record_id, 120) : "",
      line_user_id: userId,
      display_name: text(canonical?.safe_context?.display_name_for_kenji, 120),
      relationship_context: text(canonical?.relationship_context, 120),
    },
    intent: parsedIntent,
  };
  const live = await callLiveContext(env, payload);
  if (!live.ok || !live.data) {
    return {
      text: "ผมรับรายละเอียดไว้แล้วครับ แต่ตอนนี้ข้อมูลสดสำหรับตรวจงานยังตอบกลับมาไม่ครบ จึงยังไม่ยืนยันคิว ยอด หรือสิทธิ์ให้ก่อนครับ",
      intent: parsedIntent.type,
      reply_source: "lv5_live_fanin_degraded",
      handoff_required: true,
      handoff_reason: live.reason || "lv5_live_context_unavailable",
      operational: { schema: KENJI_LV5_LINE_SCHEMA, status: "degraded" },
    };
  }

  const reply = renderKenjiLv5LineReply(live.data, parsedIntent);
  if (!reply) return null;
  const needsHandoff = live.data.readiness === "blocked" || (Array.isArray(live.data.fan_in?.blockers) && live.data.fan_in.blockers.length > 0);
  return {
    text: reply,
    intent: parsedIntent.type,
    reply_source: "lv5_operational_live",
    handoff_required: needsHandoff,
    handoff_reason: needsHandoff ? `lv5:${(live.data.fan_in?.blockers || live.data.blockers || []).join(",")}`.slice(0, 500) : "",
    truth_authority: "mmd.kenji_live_context_fanin.v1",
    truth_status: live.data.live_truth_complete === true ? "verified_live" : "partial_live",
    live_truth_used: true,
    live_truth_verified: live.data.live_truth_complete === true,
    operational: {
      schema: KENJI_LV5_LINE_SCHEMA,
      phase: "P3_line_operational_concierge",
      readiness: text(live.data.readiness),
      primary_action: text(live.data?.next_actions?.[0]?.action),
      fan_in_sources: live.data?.fan_in?.sources || {},
      continuity_decision: text(continuity?.decision),
    },
  };
}
