// Presentation only. Payment, job matching and verification truth stay upstream.
import { paymentProofReviewUrl, proofPrecheckLines } from "../shared/payment-proof-precheck.mjs";

const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const stages = { deposit: "มัดจำ", full: "เต็มจำนวน", final: "ยอดคงเหลือ", balance: "ยอดคงเหลือ", tips: "ทิป", membership: "สมาชิก", renewal: "ต่ออายุสมาชิก", shop: "ค่าสินค้า" };
const oneLine = value => String(value ?? "").replace(/\s+/g, " ").trim();
const escape = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const segments = new Intl.Segmenter("th", { granularity: "grapheme" });
function label(value, limit) {
  const units = [...segments.segment(oneLine(value))].map(item => item.segment);
  return escape(units.length > limit ? units.slice(0, limit - 1).join("") + "…" : units.join(""));
}
function dateLabel(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return "";
  const [, year, month, day] = match.map(Number), date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${day} ${months[month - 1]} ${year}`;
}
function schedulePart(value) {
  const raw = oneLine(value);
  // Offset-bearing timestamps are instants. Wall-clock values are already Thai
  // local time; never let the host machine's timezone reinterpret them.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(raw) && dateLabel(raw.slice(0, 10)) && Number.isFinite(Date.parse(raw))) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(raw)).map(part => [part.type, part.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  }
  const local = /^(?:(\d{4}-\d{2}-\d{2})[T ])?([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/.exec(raw);
  if (local && (!local[1] || dateLabel(local[1]))) return { date: local[1] || "", time: `${local[2]}:${local[3]}` };
  return { date: "", time: "" };
}

export function proofJobSchedule(job = {}) {
  const start = schedulePart(job.start_time), end = schedulePart(job.end_time);
  const date = start.date || (dateLabel(oneLine(job.job_date)) ? oneLine(job.job_date) : "") || end.date;
  const endDay = end.date && date && end.date !== date ? ` (${dateLabel(end.date)})` : "";
  const time = start.time && end.time ? `${start.time}–${end.time}${endDay}` : start.time ? `${start.time} · ยังไม่ระบุเวลาจบ` : end.time ? `สิ้นสุด ${end.time}${endDay}` : "";
  return { date: dateLabel(date), time: time ? `${time} น. (ไทย)` : "" };
}

export function webProofTelegramCaption({ proofId, snapshot = {}, jobContext = {}, precheck = {}, route = {}, inferenceLabel = "" } = {}) {
  const reviewUrl = precheck.review_url || paymentProofReviewUrl(proofId, snapshot.session_id);
  const title = route.topic === "membership" ? "💳 สลิปสมาชิกเข้าแล้ว · รอตรวจ"
    : route.topic === "mmd_shop" ? `💳 ${oneLine(route.shop_title)} · สลิปเข้าแล้ว รอตรวจ`
    : "💳 สลิปลูกค้าเข้าแล้ว · รอตรวจ";
  const amount = Number(snapshot.amount_thb);
  const amountText = Number.isFinite(amount) && amount > 0 ? `${amount.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท` : "ยังไม่ระบุยอด";
  const stage = stages[snapshot.payment_stage] || "ตรวจรอบชำระในงาน";
  const job = route.topic !== "membership" && route.topic !== "mmd_shop";
  const schedule = proofJobSchedule(jobContext);
  const warnings = [...(job && jobContext.status !== "exact" ? ["⚠️ ยังจับคู่งานไม่ได้ · ตรวจงานก่อนยืนยันเงินเข้า"] : []), ...proofPrecheckLines(precheck)];
  const action = reviewUrl ? `<a href="${escape(reviewUrl)}">ตรวจและยืนยันเงินเข้า (Official Verify)</a>` : "⚠️ เปิดคิวชำระเงินเพื่อตรวจงานนี้";
  const footer = ["ยังไม่ยืนยันเงินเข้า · ยังไม่ปล่อยลิงก์ลูกค้า / โมเดล", "ตรวจเงินจริงก่อนกดปุ่มด้านล่าง", action].join("\n");

  // Reserve the warning and review action first. Reduce only display labels,
  // never slice HTML, truncate a review URL or silently drop a risk warning.
  for (const limit of [64, 40, 24, 12, 4, 0]) {
    const details = [];
    if (limit && job) {
      if (jobContext.client_name) details.push(`ลูกค้า: <b>${label(jobContext.client_name, limit)}</b>`);
      if (jobContext.model_name) details.push(`โมเดล: <b>${label(jobContext.model_name, limit)}</b>`);
      if (schedule.date) details.push(`วันที่: ${schedule.date}`);
      if (schedule.time) details.push(`เวลา: ${schedule.time}`);
      if (jobContext.location_name) details.push(`สถานที่: ${label(jobContext.location_name, limit)}`);
    } else if (limit && inferenceLabel) details.push(`ประเภท: ${label(inferenceLabel, limit)}`);
    const caption = [
      `<b>${label(title, 64)}</b>`, `ยอดตามรายการ: <b>${escape(amountText)}</b> · ${escape(stage)}`,
      details.join("\n"), warnings.map(line => escape(line.replace(" · ยังไม่ยืนยันเงินเข้า", ""))).join("\n"), footer,
    ].filter(Boolean).join("\n\n");
    if (caption.length <= 880) return caption;
  }
  // Canonical URLs and bounded precheck messages normally fit without this.
  // Keep fail-closed review status even for unexpectedly large future input.
  return `<b>💳 รับสลิปแล้ว · ต้องตรวจสอบ</b>\n\n${escape(amountText)} · ${escape(stage)}\nยังไม่ยืนยันเงินเข้า · ยังไม่ปล่อยลิงก์ลูกค้า / โมเดล\n⚠️ ตรวจหลักฐานซ้ำและข้อมูลในคิวชำระเงินก่อนยืนยัน`;
}

export function proofDocumentDisplayName(proofId, originalName) {
  const suffix = oneLine(proofId).replace(/[^A-Za-z0-9_-]/g, "").slice(-8);
  const extension = /\.([a-z0-9]{1,10})$/i.exec(oneLine(originalName))?.[1] || "bin";
  return `slip${suffix ? "-" + suffix : ""}.${extension}`;
}
