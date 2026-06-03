const assert = require("node:assert/strict");
const test = require("node:test");

const { parseHistoricalNote } = require("./historical-note-parser.js");

test("service purchase amount creates proposed_points", () => {
  const parsed = parseHistoricalNote("Service purchase 12,000 THB on 12/05/2024 ref ABCD1234");
  assert.equal(parsed.service_amount, 12000);
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
