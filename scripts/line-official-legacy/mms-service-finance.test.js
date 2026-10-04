const test = require("node:test");
const assert = require("node:assert/strict");
const { auditMmsServiceFinance } = require("./mms-service-finance.js");
test("MMS shares include course plus travel, not course alone", () => {
  const result = auditMmsServiceFinance({ course_fee: 2000, travel_fee: 500, total_amount: 2500, mms_share: 750, therapist_share: 1750 });
  assert.equal(result.status, "ready_for_review");
  assert.equal(result.expected_mms_share_thb, 750);
  assert.equal(result.expected_therapist_share_thb, 1750);
  assert.equal(result.payout_verified, false);
});
test("missing travel differs from explicit zero", () => {
  assert.equal(auditMmsServiceFinance({ course_fee: 2000 }).calculated_full_amount_thb, null);
  assert.equal(auditMmsServiceFinance({ course_fee: 2000, travel_fee: 0 }).calculated_full_amount_thb, 2000);
});
test("full amount and reported shares must reconcile independently", () => {
  const result = auditMmsServiceFinance({ course_fee: 2000, travel_fee: 500, total_amount: 2400, mms_share: 700, therapist_share: 1700 });
  assert.ok(result.warnings.includes("full_amount_mismatch"));
  assert.ok(result.warnings.includes("mms_share_mismatch"));
  assert.ok(result.warnings.includes("therapist_share_mismatch"));
});
test("explicit Thai note labels preserve decimals and do not count deposits as a second revenue", () => {
  const result = auditMmsServiceFinance({}, "ค่าคอร์ส: 2,000.50 บาท\nค่าเดินทาง: 300 บาท\nยอดเต็ม: 2300.50 บาท\nส่วน MMS: 690.15 บาท\nส่วน Therapist: 1610.35 บาท\nมัดจำ: 1000 บาท");
  assert.equal(result.status, "ready_for_review");
  assert.equal(result.calculated_full_amount_thb, 2300.5);
  assert.equal(result.expected_mms_share_thb + result.expected_therapist_share_thb, 2300.5);
});
test("multiple visits and unlabeled amounts remain review-required", () => {
  assert.equal(auditMmsServiceFinance({}, "ค่าคอร์ส: 2000\nค่าเดินทาง: 300\nค่าคอร์ส: 2000\nค่าเดินทาง: 300").status, "review_required");
  assert.equal(auditMmsServiceFinance({}, "2020-10-04\n2500\n30%\n70%").calculated_full_amount_thb, null);
});
