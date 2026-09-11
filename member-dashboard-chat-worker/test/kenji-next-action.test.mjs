import assert from "node:assert/strict";
import {
  applyKenjiNextAction,
  resolveKenjiNextAction,
} from "../src/kenji-line-next-action.mjs";
import {
  buildProtectedCapabilityReply,
  decideKenjiCapability,
} from "../src/kenji-capability-policy.js";

const membership = applyKenjiNextAction({
  text: "ผมยังยืนยันสถานะ ระดับสมาชิก หรือวันหมดอายุจากข้อความนี้ไม่ได้ครับ",
  intent: "membership_status",
}, {
  continuity: {
    client_record_id: "recClient",
    matrix: {
      relationship_context: "svip_relationship",
      conversation_stage: "awaiting_entitlement_refresh",
    },
  },
});
assert.equal(membership.cta_type, "open_action_route");
assert.equal(membership.cta_route, "https://mmdbkk.com/my-mmd/membership");
assert.equal(membership.cta_appended, true);
assert.match(membership.text, /My MMD > Membership/);
assert.match(membership.text, /https:\/\/mmdbkk\.com\/my-mmd\/membership/);
assert.equal(membership.next_action_policy.max_primary_cta, 1);
assert.equal(membership.next_action_policy.relationship_mode, "known_customer_continuation");
assert.doesNotMatch(membership.text, /อนุมัติสิทธิ์|ได้รับสิทธิ์แล้ว|เปิดสิทธิ์แล้ว/i);

const points = applyKenjiNextAction({
  text: "ผมยังยืนยันยอดแต้มจากข้อความนี้ไม่ได้ครับ",
  intent: "points_status",
}, { continuity: {} });
assert.equal(points.cta_type, "open_action_route");
assert.equal(points.cta_route, "https://mmdbkk.com/my-mmd/points");
assert.match(points.text, /My MMD > Points/);

const protectedPayment = decideKenjiCapability({
  intent: "payment_slip",
  text: "ส่งสลิปแล้ว",
});
assert.equal(protectedPayment.capability, "protected_authority");
assert.equal(protectedPayment.requested_domain, "payment");
const protectedPaymentReply = buildProtectedCapabilityReply(protectedPayment);
assert.match(protectedPaymentReply, /https:\/\/mmdbkk\.com\/member\/payments/);
assert.match(protectedPaymentReply, /ไม่ต้องสร้างรายการหรือส่งหลักฐานซ้ำ/);
assert.doesNotMatch(protectedPaymentReply, /confirm\/payment-proof/);
assert.doesNotMatch(protectedPaymentReply, /ชำระ(?:เงิน)?สำเร็จ|อนุมัติแล้ว|ยืนยัน(?:การ)?ชำระ(?:เงิน)?(?:แล้ว)?/i);

const paymentKnown = resolveKenjiNextAction({
  intent: "payment_status",
  decision: { text: "ได้ครับ แต่ผมจะไม่ยืนยันการชำระจากข้อความหรือสลิปอย่างเดียว" },
  continuity: {
    matrix: {
      conversation_stage: "awaiting_payment_verification",
      do_not_ask_again: ["payment_proof"],
    },
  },
});
assert.equal(paymentKnown.type, "continue_in_chat");
assert.equal(paymentKnown.route, "");
assert.match(paymentKnown.customer_text, /ไม่ต้องส่งซ้ำ/);
assert.match(paymentKnown.customer_text, /มีอัปเดตไหม/);
assert.doesNotMatch(paymentKnown.customer_text, /confirm\/payment-proof/);

const paymentNeedsAction = resolveKenjiNextAction({
  intent: "payment_status",
  decision: { text: "ได้ครับ แต่ผมจะไม่ยืนยันการชำระจากข้อความหรือสลิปอย่างเดียว" },
  continuity: { matrix: { conversation_stage: "in_progress", do_not_ask_again: [] } },
});
assert.equal(paymentNeedsAction.type, "open_action_route");
assert.equal(paymentNeedsAction.route, "https://mmdbkk.com/member/payments");
assert.match(paymentNeedsAction.customer_text, /รายการชำระเงิน/);
assert.match(paymentNeedsAction.customer_text, /ไม่ต้องสร้างหรือส่งซ้ำ/);
assert.doesNotMatch(paymentNeedsAction.customer_text, /confirm\/payment-proof/);

const existingCta = applyKenjiNextAction({
  text: "ดูสถานะล่าสุดได้ที่ https://mmdbkk.com/my-mmd/membership ครับ",
  intent: "membership_status",
}, { continuity: {} });
assert.equal(existingCta.cta_type, "open_action_route");
assert.equal(existingCta.cta_appended, false);
assert.equal((existingCta.text.match(/https:\/\/mmdbkk\.com\/my-mmd\/membership/g) || []).length, 1);

const availability = applyKenjiNextAction({
  text: "ส่งวัน เวลา โซน และชื่อคนที่อยากเช็กมาได้เลยครับ",
  intent: "availability_request",
}, { continuity: {} });
assert.equal(availability.cta_type, "none");
assert.equal(availability.cta_appended, false);
assert.equal(availability.text, "ส่งวัน เวลา โซน และชื่อคนที่อยากเช็กมาได้เลยครับ");

const dispute = applyKenjiNextAction({
  text: "เคสนี้ต้องตรวจรายการก่อนครับ",
  intent: "payment_dispute",
}, { continuity: {} });
assert.equal(dispute.cta_type, "handoff_per");
assert.equal(dispute.cta_appended, true);
assert.match(dispute.text, /Per/);
assert.match(dispute.text, /วันที่ ยอด และหลักฐาน/);

console.log("kenji next-action CTA tests passed");
