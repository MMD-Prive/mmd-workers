import test from "node:test";
import assert from "node:assert/strict";
import {
  KENJI_PUBLIC_ALLOWED_CAPABILITIES,
  classifyKenjiPublicCapability,
  isGeneralKenjiIntent,
} from "../src/kenji-public-capability-policy.js";

test("Public Kenji exposes only general Q&A and published promotions", () => {
  assert.deepEqual([...KENJI_PUBLIC_ALLOWED_CAPABILITIES], ["general_qna", "published_promotions"]);
  assert.deepEqual(classifyKenjiPublicCapability("MMD คืออะไร"), {
    capability: "general_qna",
    allowed: true,
    reason: null,
  });
  assert.deepEqual(classifyKenjiPublicCapability("โปรโมชั่นล่าสุด"), {
    capability: "published_promotions",
    allowed: true,
    reason: null,
  });
});

test("restricted account and operational lanes fail closed", () => {
  const cases = [
    ["เช็ก Points", "points"],
    ["ใครว่างคืนนี้", "availability"],
    ["ช่วยจอง", "booking"],
    ["ขอเข้า SIGIL", "private_access"],
    ["ยอดชำระเงิน", "payment"],
    ["ประวัติของฉัน", "history"],
    ["ส่งเรื่องหลังบริการ", "care"],
    ["สมาชิกหมดอายุหรือยัง", "member_record"],
    ["ขอข้อมูลสมาชิกคนอื่น", "customer_record"],
  ];
  for (const [message, capability] of cases) {
    assert.deepEqual(classifyKenjiPublicCapability(message), {
      capability,
      allowed: false,
      reason: capability,
    });
  }
});

test("only the exact general AI intent can be rendered", () => {
  assert.equal(isGeneralKenjiIntent("general"), true);
  assert.equal(isGeneralKenjiIntent(" GENERAL "), true);
  for (const value of ["points_status", "membership_status", "availability_request", "published_promotions", ""]) {
    assert.equal(isGeneralKenjiIntent(value), false, value);
  }
});
