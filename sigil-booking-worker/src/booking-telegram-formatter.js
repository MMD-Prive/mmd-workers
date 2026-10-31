const EMPTY = "ไม่ระบุ";
const CANONICAL_ADMIN_ORIGIN = "https://sigil.mmdbkk.com";
const CANONICAL_ADMIN_PATH = "/internal/admin/control-room";

export function buildBookingTelegramText({ body = {}, fields = {} } = {}) {
  const resolver = parseObject(fields.resolver_payload_json);
  const search = resolver.customer_search && typeof resolver.customer_search === "object" ? resolver.customer_search : {};
  const client = first(fields.client_nickname, fields["Contact Name"], body.client_nickname, body.client_name);
  const model = first(fields["Selected Model Name"], fields.model_search_query, search.preferred_model_name, body.model, "รอเลือก");
  const date = first(fields["Preferred Date"], body.preferred_date, body.date);
  const time = first(fields["Preferred Time"], body.preferred_time, body.time);
  const duration = first(body.duration_minutes ? `${body.duration_minutes} นาที` : "", body.duration);
  const when = [formatThaiDate(date), time, duration].filter(Boolean).join(" · ") || EMPTY;
  const place = [body.city, body.google_address].map(str).filter(Boolean).join(" · ") || EMPTY;
  const status = statusLabel(fields["Request Status"] || fields.status || body.status, fields.member_status);
  const qa = isQa(body, fields);

  return [
    "🕯️ <b>MMD Booking</b>",
    qa ? "🧪 <b>ทดสอบเท่านั้น</b>" : "",
    `ลูกค้า: <b>${escHtml(client || EMPTY)}</b>`,
    `โมเดล: ${escHtml(model || "รอเลือก")}`,
    `วันเวลา: ${escHtml(when)}`,
    `สถานที่: ${escHtml(place)}`,
    `สถานะ: <b>${escHtml(status)}</b>`,
    "",
    "<b>PREPARE ONLY</b> · รอเปอร์ตรวจและกดอนุมัติก่อนทุกครั้ง",
    "ยังไม่ยืนยันงาน / โมเดล / การชำระเงิน",
  ].filter(Boolean).join("\n");
}

export function buildBookingTelegramReplyMarkup(adminUrl = "") {
  const url = str(adminUrl);
  if (!url || !isSafeAdminUrl(url)) return undefined;
  return { inline_keyboard: [[{ text: "เปิดงาน", url }]] };
}

function isSafeAdminUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.origin !== CANONICAL_ADMIN_ORIGIN || parsed.username || parsed.password || parsed.hash) return false;
    if (!parsed.pathname.startsWith(CANONICAL_ADMIN_PATH)) return false;
    for (const key of parsed.searchParams.keys()) if (/token|secret|auth|key|signature/i.test(key)) return false;
    return true;
  } catch (_) { return false; }
}

function statusLabel(value, memberStatus) {
  const token = normalize(value);
  if (["expired", "inactive", "cancelled", "canceled", "lapsed"].includes(token)) return "หมดอายุ · รอตรวจสอบ";
  return normalize(memberStatus) === "expired" ? "สมาชิกหมดอายุ · รอตรวจสอบ" : "รอเปอร์ตรวจสอบ";
}

function formatThaiDate(value) {
  const source = str(value);
  const match = source.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i);
  if (!match) return source;
  const months = { Jan: "ม.ค.", Feb: "ก.พ.", Mar: "มี.ค.", Apr: "เม.ย.", May: "พ.ค.", Jun: "มิ.ย.", Jul: "ก.ค.", Aug: "ส.ค.", Sep: "ก.ย.", Oct: "ต.ค.", Nov: "พ.ย.", Dec: "ธ.ค." };
  const month = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  return `${Number(match[2])} ${months[month]}${match[3] ? ` ${Number(match[3]) + 543}` : ""}`;
}

function parseObject(value) { try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return parsed && typeof parsed === "object" ? parsed : {}; } catch (_) { return {}; } }
function isQa(body, fields) { return [body, fields].some((source) => Object.values(source || {}).some((value) => /test|qa|dummy|ทดสอบ/i.test(str(value)))); }
function first(...values) { return values.map(str).find(Boolean) || ""; }
function normalize(value) { return str(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function str(value) { return value == null ? "" : String(value).trim(); }
function escHtml(value) { return str(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
