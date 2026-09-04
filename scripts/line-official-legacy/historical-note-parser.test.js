const assert = require("node:assert/strict");
const test = require("node:test");

const { parseHistoricalNote } = require("./historical-note-parser.js");

test("service purchase amount creates proposed_points", () => {
  const parsed = parseHistoricalNote("Service purchase 12,000 THB on 12/05/2024 ref ABCD1234");
  assert.equal(parsed.service_amount, 12000);
  assert.equal(parsed.reconciled_service_amount, 12000);
  assert.equal(parsed.reconciliation_basis, "single_service_amount");
  assert.equal(parsed.historical_service_status, "completed");
  assert.equal(parsed.points_eligible_amount, 12000);
  assert.equal(parsed.proposed_points, 120);
  assert.equal(parsed.points_review_required, false);
});

test("MMD tip amount creates no points but adds customer_detail_json", () => {
  const parsed = parseHistoricalNote("MMD tip 1,000 THB through system");
  assert.equal(parsed.tip_amount_mmd, 1000);
  assert.equal(parsed.proposed_points, 0);
  assert.equal(parsed.points_ineligible_amount, 1000);
  assert.equal(parsed.customer_detail_json.generosity_signal, true);
});

test("direct hand tip creates no points and is detail only", () => {
  const parsed = parseHistoricalNote("Direct hand tip 2,000 THB to model");
  assert.equal(parsed.tip_amount_direct, 2000);
  assert.equal(parsed.proposed_points, 0);
  assert.equal(parsed.customer_detail_json.direct_hand_tip_points_policy, "never_counts_for_points");
});

test("service plus tip counts only service amount", () => {
  const parsed = parseHistoricalNote("Booking service 10,000 THB plus MMD tip 1,000 THB");
  assert.equal(parsed.service_amount, 10000);
  assert.equal(parsed.tip_amount_mmd, 1000);
  assert.equal(parsed.points_eligible_amount, 10000);
  assert.equal(parsed.proposed_points, 100);
});

test("explicit final total wins over gross price, deposit and balance", () => {
  const parsed = parseHistoricalNote([
    "🎯 MMD Confirmation",
    "💵 ยอดรวม: 22,500฿",
    "• Discount 10% From 25,000฿",
    "• มัดจำ 6,750฿ เราค้าง3,000฿",
    "• ชำระหน้างาน 15,750฿",
  ].join("\n"));
  assert.equal(parsed.reconciled_service_amount, 22500);
  assert.equal(parsed.service_amount, 22500);
  assert.equal(parsed.reconciliation_basis, "explicit_final_total");
  assert.equal(parsed.proposed_points, 225);
  assert.equal(parsed.historical_service_status, "completed");
});

test("deposit plus remaining balance is used only when no final total exists", () => {
  const parsed = parseHistoricalNote("Booking service มัดจำ 6,750 บาท และชำระหน้างาน 15,750 บาท");
  assert.equal(parsed.reconciled_service_amount, 22500);
  assert.equal(parsed.reconciliation_basis, "deposit_plus_balance");
  assert.equal(parsed.proposed_points, 225);
});

test("Thai cancellation wording records cancelled and zero points", () => {
  const parsed = parseHistoricalNote("ไม่ได้รับงานค่ะ ขอยกเลิกงานค่ะ");
  assert.equal(parsed.historical_service_status, "cancelled");
  assert.equal(parsed.reconciled_service_amount, 0);
  assert.equal(parsed.service_amount, 0);
  assert.equal(parsed.proposed_points, 0);
  assert.equal(parsed.reconciliation_basis, "cancelled_zero");
  assert.match(parsed.cancellation_evidence, /ยกเลิกงาน/);
  assert.equal(parsed.points_review_required, false);
});

test("cancellation wins even when payment amounts appear in the note", () => {
  const parsed = parseHistoricalNote("Booking service 10,000 THB deposit 3,000 THB ลูกค้ายกเลิกงาน");
  assert.equal(parsed.historical_service_status, "cancelled");
  assert.equal(parsed.reconciled_service_amount, 0);
  assert.equal(parsed.points_eligible_amount, 0);
  assert.equal(parsed.proposed_points, 0);
});

test("English cancellation wording records cancelled", () => {
  const parsed = parseHistoricalNote("Job cancelled by customer");
  assert.equal(parsed.historical_service_status, "cancelled");
  assert.equal(parsed.proposed_points, 0);
});

test("all locked cancellation variants exclude service spend", () => {
  for (const wording of [
    "Cancel",
    "Cancelled",
    "Canceled",
    "ยกเลิก",
    "ยกเลิกงาน",
    "งานยกเลิก",
    "ขอยกเลิกงาน",
    "ลูกค้ายกเลิก",
    "ไม่เกิดงาน",
    "ไม่ได้เกิดงาน",
    "ไม่ได้รับงาน",
  ]) {
    const parsed = parseHistoricalNote(`Booking service 25,000 THB มัดจำ 7,500 THB balance 17,500 THB ${wording}`);
    assert.equal(parsed.historical_service_status, "cancelled", wording);
    assert.equal(parsed.reconciled_service_amount, 0, wording);
    assert.equal(parsed.points_eligible_amount, 0, wording);
    assert.equal(parsed.proposed_points, 0, wording);
    assert.equal(parsed.reconciliation_basis, "cancelled_zero", wording);
  }
});

test("ambiguous cancellation wording fails closed to review", () => {
  const parsed = parseHistoricalNote("Booking service 10,000 THB ยังไม่แน่ใจว่าจะยกเลิกงานไหม");
  assert.equal(parsed.historical_service_status, "review_required");
  assert.equal(parsed.points_review_required, true);
  assert.ok(parsed.points_parse_warnings.includes("cancellation_status_review_required"));
});

test("points use floor rounding at locked 100 THB rate", () => {
  for (const [amount, expected] of [[690, 6], [1499, 14], [14999, 149], [22500, 225]]) {
    const parsed = parseHistoricalNote(`Booking service ${amount.toLocaleString("en-US")} THB`);
    assert.equal(parsed.proposed_points, expected, String(amount));
  }
});

test("renewal fee note is review-required and creates no points", () => {
  const parsed = parseHistoricalNote("Renewal fee 3,000 THB paid");
  assert.equal(parsed.renewal_fee_amount, 3000);
  assert.equal(parsed.proposed_points, 0);
  assert.equal(parsed.points_review_required, true);
  assert.ok(parsed.points_parse_warnings.includes("renewal_fee_not_auto_counted"));
});

test("membership fee note is review-required and creates no points", () => {
  const parsed = parseHistoricalNote("Membership fee 5,000 THB");
  assert.equal(parsed.membership_fee_amount, 5000);
  assert.equal(parsed.proposed_points, 0);
  assert.equal(parsed.points_review_required, true);
  assert.ok(parsed.points_parse_warnings.includes("membership_fee_not_auto_counted"));
});

test("referral note creates referral_bonus_candidate and review-required", () => {
  const parsed = parseHistoricalNote("Referral bonus candidate for member");
  assert.equal(parsed.referral_bonus_candidate, true);
  assert.equal(parsed.points_review_required, true);
  assert.ok(parsed.points_parse_warnings.includes("referral_bonus_review_required"));
});

test("promotion note creates promotion_bonus_candidate and review-required", () => {
  const parsed = parseHistoricalNote("Promotion campaign bonus candidate");
  assert.equal(parsed.promotion_bonus_candidate, true);
  assert.equal(parsed.points_review_required, true);
  assert.ok(parsed.points_parse_warnings.includes("promotion_bonus_review_required"));
});

test("ambiguous amount/date note requires review", () => {
  const parsed = parseHistoricalNote("12/05/2024 paid 3000");
  assert.equal(parsed.unknown_amount, 3000);
  assert.equal(parsed.points_review_required, true);
  assert.ok(parsed.points_parse_warnings.includes("ambiguous_amount_requires_review"));
});

test("Thai/common date formats are detected for review evidence", () => {
  const parsed = parseHistoricalNote("ใช้บริการ 10,000 บาท วันที่ 12 พ.ค. 2567");
  assert.deepEqual(parsed.note_detected_dates, ["12 พ.ค. 2567"]);
  assert.equal(parsed.service_amount, 10000);
  assert.equal(parsed.proposed_points, 100);
});

test("raw note is preserved exactly", () => {
  const parsed = parseHistoricalNote("  Booking service 1,000 THB\n");
  assert.equal(parsed.raw_note, "  Booking service 1,000 THB\n");
  assert.equal(parsed.service_amount, 1000);
});

test("empty or no useful note creates no points", () => {
  const parsed = parseHistoricalNote("");
  assert.equal(parsed.proposed_points, 0);
  assert.equal(parsed.points_eligible_amount, 0);
  assert.equal(parsed.points_review_required, false);
});
