import test from "node:test";
import assert from "node:assert/strict";
import { webProofTelegramCaption, proofJobSchedule, proofDocumentDisplayName } from "./proof-notification-caption.mjs";
import { paymentProofReviewUrl } from "../shared/payment-proof-precheck.mjs";

const fixture = () => ({
  proofId: "webproof_0123456789abcdef01234567",
  snapshot: { amount_thb: 7500, payment_stage: "deposit", session_id: "sess_test" },
  jobContext: { status: "exact", client_name: "ลูกค้าทดสอบ", model_name: "โมเดลทดสอบ", job_date: "2026-11-14", start_time: "2026-11-14T10:00:00.000Z", end_time: "2026-11-14T11:30:00.000Z", location_name: "โรงแรมทดสอบ", total_amount_thb: 15000, deposit_due_thb: 7500 },
  route: { topic: "payment", reason: "explicit_service_context" }, precheck: { status: "clear" },
});
const visible = html => html.replace(/<[^>]*>/g, "");

test("job caption contains only the seven owner-requested fields without claiming planned money was received", () => {
  const input = fixture(), original = structuredClone(input), caption = webProofTelegramCaption(input);
  assert.equal(caption.split("\n").length, 7);
  assert.match(caption, /ลูกค้า: <b>ลูกค้าทดสอบ<\/b>/);
  assert.match(caption, /โมเดล: <b>โมเดลทดสอบ<\/b>/);
  assert.match(caption, /สถานะ: รับสลิปมัดจำแล้ว · ยังไม่ยืนยันเงินเข้า/);
  assert.match(caption, /วันงาน: 14 พ.ย. 2026 · 17:00–18:30 น. \(ไทย\)/);
  assert.match(caption, /สถานที่: โรงแรมทดสอบ/);
  assert.match(caption, /บัดเจ็ตรวม: <b>15,000 บาท<\/b>/);
  assert.match(caption, /มัดจำตามรายการ: <b>7,500 บาท<\/b>/);
  assert.doesNotMatch(visible(caption), /sess_|webproof_|pay_|Routing:|Job Match:|2026-11-14T|Official Verify|รับเงินแล้ว/);
  assert.doesNotMatch(caption, /href=/);
  assert.ok(caption.length <= 880);
  assert.deepEqual(input, original);
});

test("Thai wall clocks remain local regardless of host timezone", () => {
  assert.deepEqual(proofJobSchedule({ job_date: "2026-11-14", start_time: "17:00", end_time: "18:30" }), { date: "14 พ.ย. 2026", time: "17:00–18:30 น. (ไทย)" });
  assert.deepEqual(proofJobSchedule({ start_time: "2026-11-14T17:00:00", end_time: "2026-11-14 18:30" }), { date: "14 พ.ย. 2026", time: "17:00–18:30 น. (ไทย)" });
});

test("Bangkok conversion handles day, month and year rollover and cross-midnight jobs", () => {
  assert.deepEqual(proofJobSchedule({ job_date: "2026-12-31", start_time: "2026-12-31T18:00:00Z", end_time: "2026-12-31T19:30:00Z" }), { date: "1 ม.ค. 2027", time: "01:00–02:30 น. (ไทย)" });
  assert.deepEqual(proofJobSchedule({ start_time: "2026-11-14T23:00:00+07:00", end_time: "2026-11-15T01:00:00+07:00" }), { date: "14 พ.ย. 2026", time: "23:00–01:00 (15 พ.ย. 2026) น. (ไทย)" });
});

test("invalid and missing dates or times are not guessed", () => {
  assert.deepEqual(proofJobSchedule({ job_date: "2026-02-30", start_time: "not a date", end_time: "25:00" }), { date: "", time: "" });
  assert.deepEqual(proofJobSchedule({ start_time: "2026-02-30T10:00:00Z" }), { date: "", time: "" });
  assert.match(proofJobSchedule({ start_time: "17:00" }).time, /ยังไม่ระบุเวลาจบ/);
  assert.match(proofJobSchedule({ end_time: "18:30" }).time, /สิ้นสุด 18:30/);
});

test("unresolved jobs remain visibly blocked from casual confirmation", () => {
  const caption = webProofTelegramCaption({ ...fixture(), jobContext: { status: "unresolved" } });
  assert.match(caption, /ยังจับคู่งานไม่ได้/);
  assert.match(caption, /ยังไม่ยืนยันเงินเข้า/);
  assert.doesNotMatch(caption, /EXACT/);
});

for (const status of ["duplicate", "needs_review", "unavailable"]) {
  test(`${status} status warnings survive very long escaped labels`, () => {
    const input = fixture();
    input.jobContext.client_name = '<b>"&ลูกค้า'.repeat(30);
    input.jobContext.model_name = "ชื่อโมเดลยาว".repeat(30);
    input.jobContext.location_name = "โรงแรมที่อยู่ยาว".repeat(30);
    input.precheck = { status, review_url: paymentProofReviewUrl("webproof_primary", "sess_primary"), matches: [{ channel: "line_ofc" }] };
    const caption = webProofTelegramCaption(input);
    assert.ok(caption.length <= 880, `${status}: ${caption.length}`);
    assert.doesNotMatch(caption, /href=/);
    if (status === "duplicate") assert.match(caption, /อย่านับยอดซ้ำ/);
    if (status === "needs_review") assert.match(caption, /ข้อมูลสลิปขัดกัน/);
    if (status === "unavailable") assert.match(caption, /ตรวจสลิปยังไม่ครบ/);
    assert.equal((caption.match(/<b>/g) || []).length, (caption.match(/<\/b>/g) || []).length);
    assert.doesNotMatch(caption, /<b>"&ลูกค้า/);
  });
}

test("different evidence for the same payment preserves its specific warning", () => {
  const caption = webProofTelegramCaption({ ...fixture(), precheck: { status: "needs_review", issues: ["existing_payment_proof_not_transfer_dedup"] } });
  assert.match(caption, /มีหลักฐานเดิม ต้องเทียบสลิป/);
});

test("all canonical stage labels stay understandable and unknown stages are not guessed", () => {
  for (const [stage, expected] of Object.entries({ deposit: "มัดจำ", full: "เต็มจำนวน", final: "ยอดคงเหลือ", tips: "ทิป", other: "ชำระเงิน" })) {
    const input = fixture(); input.snapshot.payment_stage = stage;
    assert.ok(webProofTelegramCaption(input).includes(expected));
  }
});

test("membership and shop routes preserve their identities without irrelevant job warnings", () => {
  for (const topic of ["membership", "mmd_shop"]) {
    const caption = webProofTelegramCaption({ ...fixture(), route: { topic, shop_title: "MMD Shop" }, inferenceLabel: "Premium Membership" });
    assert.match(caption, topic === "membership" ? /สลิปสมาชิก/ : /MMD Shop/);
    assert.doesNotMatch(caption, /ยังจับคู่งานไม่ได้|ลูกค้า:|โมเดล:/);
  }
});

test("missing total never reuses the deposit as the total budget", () => {
  const input = fixture(); delete input.jobContext.total_amount_thb;
  const caption = webProofTelegramCaption(input);
  assert.match(caption, /บัดเจ็ตรวม: <b>ไม่พบข้อมูล<\/b>/);
  assert.match(caption, /มัดจำตามรายการ: <b>7,500 บาท<\/b>/);
});

test("a paid-looking input cannot promote an upload notification to received money", () => {
  const input = fixture(); input.snapshot.payment_status = "paid"; input.snapshot.verification_status = "verified";
  const caption = webProofTelegramCaption(input);
  assert.match(caption, /ยังไม่ยืนยันเงินเข้า/);
  assert.doesNotMatch(caption, /ชำระเงินผ่าน|ธนาคารยืนยัน|รับเงินแล้ว/);
});

test("attachment display name is short, safe and retains the type and reference suffix", () => {
  assert.equal(proofDocumentDisplayName("webproof_0123456789abcdef01234567", "original.jpeg"), "slip-01234567.jpeg");
  assert.equal(proofDocumentDisplayName("webproof_01234567", "original.pdf"), "slip-01234567.pdf");
  assert.equal(proofDocumentDisplayName("", "<script>"), "slip.bin");
});
