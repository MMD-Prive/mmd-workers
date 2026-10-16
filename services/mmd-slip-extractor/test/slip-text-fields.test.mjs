import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOcrText } from "../lib/extractor.mjs";

// Synthetic layouts, not bank-certified fixtures or real customer slips.
const fixtures = [
  [
    "English standalone / AM",
    "Transfer successful\n12 Oct 26, 9:25 AM\n6,000.00\nFee 0.00\nReference no: SYNTHETIC-123456",
    6000,
    "2026-10-12T02:25:00.000Z",
  ],
  [
    "Thai abbreviated / Buddhist year",
    "โอนเงินสำเร็จ\n15 ต.ค. 2569 เวลา 09:25 น.\nจำนวนเงิน 1,250.50 บาท\nค่าธรรมเนียม 0.00",
    1250.5,
    "2026-10-15T02:25:00.000Z",
  ],
  [
    "Thai full month / short Buddhist year",
    "15 ตุลาคม 69 21:05:09\nยอดเงินที่โอน\n2,000.00\nค่าธรรมเนียม\n0.00",
    2000,
    "2026-10-15T14:05:09.000Z",
  ],
  [
    "Numeric day-first",
    "15/10/2026 09:25\nAmount: THB 850.00\nBalance THB 99,000.00",
    850,
    "2026-10-15T02:25:00.000Z",
  ],
  [
    "Numeric Buddhist year",
    "15-10-2569 เวลา 09.25 น.\nยอดโอน 300 บาท",
    300,
    "2026-10-15T02:25:00.000Z",
  ],
  [
    "English full month / PM",
    "15 October 2026 9:25 PM\nTHB 500.00\nFee THB 0.00",
    500,
    "2026-10-15T14:25:00.000Z",
  ],
  [
    "English month first / midnight",
    "October 15, 2026 12:05 AM\nTransfer amount\n1,750.00 THB",
    1750,
    "2026-10-14T17:05:00.000Z",
  ],
  [
    "Noon / currency suffix",
    "15 Oct 26 12:05 PM\n700.00 THB",
    700,
    "2026-10-15T05:05:00.000Z",
  ],
  [
    "Thai numerals",
    "๑๕ ต.ค. ๒๕๖๙ เวลา ๐๙:๒๕\nจำนวนเงิน: ๑,๒๕๐.๕๐ บาท",
    1250.5,
    "2026-10-15T02:25:00.000Z",
  ],
  [
    "Separate date and time lines",
    "Date: 2026/10/15\nTime: 09:25:10\nAmount\nTHB 900.00",
    900,
    "2026-10-15T02:25:10.000Z",
  ],
  [
    "Explicit UTC",
    "2026-10-15T02:25:00Z\nAmount: 400",
    400,
    "2026-10-15T02:25:00.000Z",
  ],
  [
    "Explicit offset",
    "2026-10-15T09:25:00+07:00\n฿400.00",
    400,
    "2026-10-15T02:25:00.000Z",
  ],
];
for (const [name, text, amount, time] of fixtures)
  test(name, () => {
    const result = normalizeOcrText(text, 92);
    assert.equal(result.amount_thb, amount);
    assert.equal(result.paid_at, time);
    assert.equal(Object.hasOwn(result, "verified"), false);
  });
test("optional reference label is parsed without requiring QR", () => {
  const r = normalizeOcrText(fixtures[0][1], 90);
  assert.equal(r.payment_ref, "SYNTHETIC-123456");
  assert.equal(
    normalizeOcrText("Amount: 100\n15 Oct 26 09:25").payment_ref,
    "",
  );
});
test("never guess a missing date, time, amount, or ambiguous reading", () => {
  for (const text of [
    "15 Oct 26\nAmount: 100",
    "09:25\nAmount: 100",
    "31/02/2026 09:25",
    "15 Oct 26 25:10",
    "15 Oct 26 09:60",
    "15 Oct 26 09:25\n16 Oct 26 09:25",
    "15 Oct 26 09:25+15:00",
  ])
    assert.equal(normalizeOcrText(text).paid_at, "", text);
  for (const text of [
    "Fee: THB 25.00\nAccount: 1234567890",
    "1,250.00\n2,000.00",
    "Amount: 100\nAmount: 200",
    "Amount: -100",
    "1,25.00 THB",
    "Amount: 1,25.00",
    "Reference no: 125000",
  ])
    assert.equal(normalizeOcrText(text).amount_thb, null, text);
});
test("labeled amount wins over unrelated decimal numbers and preserves cents", () => {
  const r = normalizeOcrText(
    "9.25\nAmount: 1,234.56 THB\n100.00\nFee: THB 5.00\nBalance THB 50000.00",
  );
  assert.equal(r.amount_thb, 1234.56);
});
