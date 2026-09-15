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
assert.equal(membership.cta_route, "https://mmdbkk.com/member/dashboard");
assert.equal(membership.cta_appended, true);
assert.match(membership.text, /MY MMD Home/);
assert.match(membership.text, /https:\/\/mmdbkk\.com\/member\/dashboard/);
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

const signup = applyKenjiNextAction({
  text: "สมัครสมาชิกได้ที่นี่ครับ → https://mmdbkk.com/sigil/member/membership?source=line&intent=signup",
  intent: "membership_signup",
}, { continuity: {} });
assert.equal(signup.cta_type, "open_action_route");
assert.equal(signup.cta_route, "https://mmdbkk.com/sigil/member/membership?source=line&intent=signup");
assert.equal(signup.cta_appended, false);

const renewal = applyKenjiNextAction({
  text: "เริ่มขั้นตอนต่ออายุสมาชิกได้ที่นี่ครับ → https://mmdbkk.com/sigil/member/membership?source=line&intent=renew",
  intent: "membership_renewal",
}, { continuity: {} });
assert.equal(renewal.cta_type, "open_action_route");
assert.equal(renewal.cta_route, "https://mmdbkk.com/sigil/member/membership?source=line&intent=renew");
assert.equal(renewal.cta_appended, false);
assert.doesNotMatch(renewal.text, /สถานะ.*(?:เปลี่ยนแล้ว|active แล้ว)|อนุมัติแล้ว/i);

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
assert.doesNotMatch(protectedPaymentReply, /ชำระ(?:เงิน)?สำเร็จ(?:แล้ว)?|อนุมัติแล้ว|(?:ได้รับการ)?ยืนยัน(?:การ)?ชำระ(?:เงิน)?แล้ว/i);

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
  text: "ดูสถานะล่าสุดได้ที่ https://mmdbkk.com/member/dashboard ครับ",
  intent: "membership_status",
}, { continuity: {} });
assert.equal(existingCta.cta_type, "open_action_route");
assert.equal(existingCta.cta_appended, false);
assert.equal((existingCta.text.match(/https:\/\/mmdbkk\.com\/member\/dashboard/g) || []).length, 1);

const availability = applyKenjiNextAction({
  text: "ส่งวัน เวลา โซน และชื่อคนที่อยากเช็กมาได้เลยครับ",
  intent: "availability_request",
}, { continuity: {} });
assert.equal(availability.cta_type, "request_missing_input");
assert.equal(availability.cta_appended, false);
assert.equal(availability.text, "ส่งวัน เวลา โซน และชื่อคนที่อยากเช็กมาได้เลยครับ");

const mms = applyKenjiNextAction({
  text: "ถ้าต้องการ recovery ผมแยกเป็น MMS Wellness ให้ครับ เลือกได้ทั้ง hotel / home visit หรือ Partner Venue ครับ",
  intent: "mms_wellness",
}, { continuity: {} });
assert.equal(mms.cta_type, "open_action_route");
assert.equal(mms.cta_route, "https://mmdbkk.com/male-massage/home");
assert.equal(mms.cta_appended, true);
assert.match(mms.text, /https:\/\/mmdbkk\.com\/male-massage\/home/);
assert.doesNotMatch(mms.text, /คิว(?:ได้รับการ)?ยืนยันแล้ว|Therapist พร้อมแล้ว/i);

const mmsCardAlreadyLinked = applyKenjiNextAction({
  text: "ดูภาพรวมและเริ่มทางที่เหมาะได้ที่ https://mmdbkk.com/male-massage/home ครับ",
  intent: "mms_wellness",
}, { continuity: {} });
assert.equal(mmsCardAlreadyLinked.cta_appended, false);
assert.equal((mmsCardAlreadyLinked.text.match(/https:\/\/mmdbkk\.com\/male-massage\/home/g) || []).length, 1);

const partnerVenue = applyKenjiNextAction({
  text: "ผมช่วยแยกเป็น Partner Venue ให้ได้ครับ แต่ยังไม่ใช่การยืนยันคิวครับ",
  intent: "partner_venue",
}, { continuity: {} });
assert.equal(partnerVenue.cta_route, "https://mmdbkk.com/male-massage/therapists/relax-spa");
assert.match(partnerVenue.text, /Relax Spa|partner-venue|therapists\/relax-spa/i);
assert.doesNotMatch(partnerVenue.text, /ยืนยันสถานที่แล้ว|ยืนยันคิวแล้ว/i);

const privateTalent = applyKenjiNextAction({
  text: "รับ Private Talent & Specialist request ได้ครับ",
  intent: "private_talent",
}, { continuity: {} });
assert.equal(privateTalent.cta_type, "request_missing_input");
assert.equal(privateTalent.cta_route, "");
assert.match(privateTalent.text, /ประเภทความสามารถ.*วันที่.*เวลา.*พื้นที่/);
assert.match(privateTalent.text, /Per\/MMD review/);

const bookingStatus = applyKenjiNextAction({
  text: "ผมยังคอนเฟิร์มการจองจากข้อความอย่างเดียวไม่ได้ครับ",
  intent: "booking_status",
}, { continuity: {} });
assert.equal(bookingStatus.cta_type, "open_action_route");
assert.equal(bookingStatus.cta_route, "https://mmdbkk.com/my-mmd/history");
assert.match(bookingStatus.text, /My MMD > History/);
assert.doesNotMatch(bookingStatus.text, /ยืนยันการจองแล้ว|confirmed/i);

const aftercare = applyKenjiNextAction({
  text: "Aftercare เปิดจาก Session ที่พร้อมใน My MMD ครับ",
  intent: "aftercare",
}, { continuity: {} });
assert.equal(aftercare.cta_type, "open_action_route");
assert.equal(aftercare.cta_route, "https://mmdbkk.com/my-mmd/history");
assert.match(aftercare.text, /ปุ่ม Aftercare ของรายการนั้น/);
assert.doesNotMatch(aftercare.text, /\/aftercare\?t=|\/sigil\/recovery\?t=/);

const dispute = applyKenjiNextAction({
  text: "เคสนี้ต้องตรวจรายการก่อนครับ",
  intent: "payment_dispute",
}, { continuity: {} });
assert.equal(dispute.cta_type, "handoff_per");
assert.equal(dispute.cta_appended, true);
assert.match(dispute.text, /Per/);
assert.match(dispute.text, /วันที่ ยอด และหลักฐาน/);

console.log("kenji next-action CTA tests passed");
