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

test("campaign names without the word promotion cannot bypass publication evidence", () => {
  for (const message of [
    "CARE BACK", "care-back มีอะไรใหม่", "แคร์แบ็ก 6 ปี",
    "Double Moment", "double-moment 20K", "ส่วนลดล่าสุด", "6 YEARS",
  ]) {
    assert.deepEqual(classifyKenjiPublicCapability(message), {
      capability: "published_promotions", allowed: true, reason: null,
    }, message);
  }
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
    ["คูปองของฉันใช้ได้ไหม", "member_coupon"],
    ["my coupon balance", "member_coupon"],
    ["โปรโมชั่นนี้ของฉันใช้ได้ไหม", "member_coupon"],
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

test("all Public Q&A shortcut prompts stay in the allowed general lane", () => {
  const questions = [
    "MMD คืออะไร", "MY MMD คืออะไร", "Kenji ช่วยอะไรได้บ้าง",
    "บริการ Companion คืออะไร", "เริ่มต้นใช้งานเว็บไซต์อย่างไร", "ติดต่อ MMD ได้ทางไหน",
  ];
  for (const question of questions) {
    assert.equal(classifyKenjiPublicCapability(question).capability, "general_qna", question);
  }
});

test("only the exact general AI intent can be rendered", () => {
  assert.equal(isGeneralKenjiIntent("general"), true);
  assert.equal(isGeneralKenjiIntent(" GENERAL "), true);
  for (const value of ["points_status", "membership_status", "availability_request", "published_promotions", ""]) {
    assert.equal(isGeneralKenjiIntent(value), false, value);
  }
});
