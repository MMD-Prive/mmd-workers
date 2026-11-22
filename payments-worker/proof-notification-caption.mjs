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
  if (route.topic !== "membership" && route.topic !== "mmd_shop") {
    return compactJobProofCaption({ snapshot, jobContext, precheck });
  }
  const reviewUrl = precheck.review_url || paymentProofReviewUrl(proofId, snapshot.session_id);
  const isMembership = route.topic === "membership";
  const title = isMembership ? "💳 สลิปสมาชิกเข้าแล้ว · รอตรวจ"
    : `💳 ${oneLine(route.shop_title)} · สลิปเข้าแล้ว รอตรวจ`;
  const amount = Number(snapshot.amount_thb);
  const amountText = Number.isFinite(amount) && amount > 0 ? `${amount.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท` : "ยังไม่ระบุยอด";
  const stage = stages[snapshot.payment_stage] || (isMembership ? "ค่าสมาชิก" : "ค่าสินค้า");
  const warnings = proofPrecheckLines(precheck);
  const action = reviewUrl ? `<a href="${escape(reviewUrl)}">เปิดรายการในหลังบ้าน</a>` : "เปิดคิวชำระเงินในหลังบ้าน";
  const nextStep = precheck.status === "duplicate" ? "เทียบกับหลักฐานเดิม อย่านับยอดซ้ำ"
    : precheck.status === "needs_review" ? "เทียบข้อมูลสลิปกับรายการในหลังบ้านก่อนยืนยันเงินเข้า"
    : "ตรวจยอดเงินจริงในบัญชีก่อนกดยืนยันเงินเข้า (Official Verify)";
  const footer = ["สถานะ: ยังไม่ยืนยันเงินเข้า", `ขั้นต่อไป: ${nextStep}`, action].join("\n");

  // Reserve the warning and review action first. Reduce only display labels,
  // never slice HTML, truncate a review URL or silently drop a risk warning.
  for (const limit of [64, 40, 24, 12, 4, 0]) {
    const caption = [
      `<b>${label(title, 64)}</b>`, `ยอดตามรายการ: <b>${escape(amountText)}</b> · ${escape(stage)}`,
      limit && inferenceLabel ? `ประเภท: ${label(inferenceLabel, limit)}` : "",
      warnings.map(line => escape(line.replace(" · ยังไม่ยืนยันเงินเข้า", ""))).join("\n"), footer,
    ].filter(Boolean).join("\n\n");
    if (caption.length <= 880) return caption;
  }
  // Canonical URLs and bounded precheck messages normally fit without this.
  // Keep fail-closed review status even for unexpectedly large future input.
  return `<b>💳 รับสลิปแล้ว · ต้องตรวจสอบ</b>\n\n${escape(amountText)} · ${escape(stage)}\nสถานะ: ยังไม่ยืนยันเงินเข้า\n⚠️ ตรวจหลักฐานซ้ำและข้อมูลในคิวชำระเงินก่อนยืนยัน`;
}

// Owner-facing job receipt: diagnostic IDs, review instructions and routing
// remain in the back office. A planned amount is never labelled as received.
export function compactJobProofCaption({ snapshot = {}, jobContext = {}, precheck = {} } = {}) {
  const money = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0
    ? Number(value).toLocaleString("th-TH", { maximumFractionDigits: 2 }) + " บาท" : "ไม่พบข้อมูล";
  const stage = stages[snapshot.payment_stage] || "ชำระเงิน";
  const issue = jobContext.status !== "exact" ? "ยังจับคู่งานไม่ได้"
    : precheck.issues?.includes("existing_payment_proof_not_transfer_dedup") ? "มีหลักฐานเดิม ต้องเทียบสลิป"
    : precheck.status === "duplicate" ? "สลิปซ้ำ อย่านับยอดซ้ำ"
    : precheck.status === "needs_review" ? "ข้อมูลสลิปขัดกัน"
    : precheck.status === "clear" ? `รับสลิป${stage}แล้ว`
    : "ตรวจสลิปยังไม่ครบ";
  const schedule = proofJobSchedule(jobContext);
  const when = [schedule.date, schedule.time].filter(Boolean).join(" · ") || "ไม่พบข้อมูล";
  for (const limit of [64, 40, 24, 12]) {
    const caption = [
      `ลูกค้า: <b>${label(jobContext.client_name || "ไม่พบข้อมูล", limit)}</b>`,
      `โมเดล: <b>${label(jobContext.model_name || "ไม่พบข้อมูล", limit)}</b>`,
      `สถานะ: ${escape(issue)} · ยังไม่ยืนยันเงินเข้า`,
      `วันงาน: ${escape(when)}`,
      `สถานที่: ${label(jobContext.location_name || "ไม่พบข้อมูล", limit)}`,
      `บัดเจ็ตรวม: <b>${escape(money(jobContext.total_amount_thb))}</b>`,
      `มัดจำตามรายการ: <b>${escape(money(jobContext.deposit_due_thb ?? (snapshot.payment_stage === "deposit" ? snapshot.amount_thb : null)))}</b>`,
    ].join("\n");
    if (caption.length <= 880) return caption;
  }
  throw new Error("job_proof_caption_too_long");
}

export function proofDocumentDisplayName(proofId, originalName) {
  const suffix = oneLine(proofId).replace(/[^A-Za-z0-9_-]/g, "").slice(-8);
  const extension = /\.([a-z0-9]{1,10})$/i.exec(oneLine(originalName))?.[1] || "bin";
  return `slip${suffix ? "-" + suffix : ""}.${extension}`;
}
