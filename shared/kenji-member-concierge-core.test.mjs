import assert from "node:assert/strict";
import {
  buildKenjiMemberReply,
  classifyKenjiMemberIntent,
  getSafeMemberSummary,
  isKenjiMemberLineCandidate,
} from "./kenji-member-concierge-core.mjs";

const summary = getSafeMemberSummary({ display_name: "บอส", active_points: 1280, tier: "VIP" });

assert.equal(classifyKenjiMemberIntent("").intent, "empty");
assert.equal(classifyKenjiMemberIntent("สวัสดีครับ").intent, "greeting");
assert.equal(classifyKenjiMemberIntent("Hi Per").intent, "talk_to_per_ai");
assert.equal(classifyKenjiMemberIntent("hi per").intent, "talk_to_per_ai");
assert.equal(classifyKenjiMemberIntent("hiper").intent, "talk_to_per_ai");
assert.equal(classifyKenjiMemberIntent("hello per").intent, "talk_to_per_ai");
assert.equal(classifyKenjiMemberIntent("สวัสดี เปอร์").intent, "talk_to_per_ai");
assert.equal(classifyKenjiMemberIntent("สวัสดีเปอร์").intent, "talk_to_per_ai");
assert.equal(classifyKenjiMemberIntent("เคนจิ").intent, "talk_to_per_ai");
assert.equal(classifyKenjiMemberIntent("คุยกับ Per AI").intent, "talk_to_per_ai");
assert.equal(classifyKenjiMemberIntent("อยากจองครับ").intent, "booking");
assert.equal(classifyKenjiMemberIntent("ส่งสลิปแล้วครับ").intent, "payment_slip");
assert.equal(classifyKenjiMemberIntent("แต้มผมเท่าไร").intent, "points");
assert.equal(classifyKenjiMemberIntent("VIP ต้องทำยังไง").intent, "vip");
assert.equal(classifyKenjiMemberIntent("SVIP มีแต้ม 1200", summary).intent, "svip");
assert.equal(classifyKenjiMemberIntent("Black Card VIP").intent, "black_card");
assert.equal(classifyKenjiMemberIntent("ต่ออายุสมาชิก").intent, "membership_renewal");
assert.equal(classifyKenjiMemberIntent("แค่ทักทั่วไป", summary).intent, "high_points_fallback");

assert.equal(classifyKenjiMemberIntent("ส่งสลิปแล้ว อยากจอง").intent, "payment_slip");
assert.equal(classifyKenjiMemberIntent("SVIP มีแต้ม 1200", summary).intent, "svip");
assert.equal(classifyKenjiMemberIntent("Black Card VIP").intent, "black_card");

assert.equal(isKenjiMemberLineCandidate("เคนจิ"), true);
assert.equal(isKenjiMemberLineCandidate("ส่งสลิปแล้ว"), true);
assert.equal(isKenjiMemberLineCandidate("random note only"), false);

for (const keyword of ["Public", "Membership Package Public", "Membership Packcage PUBLIC ราคาเท่าไร", "สมัครแพค public", "ต่ออายุ Public", "Public Access", "แพ็กเกจพับลิก", "แพคพับลิค", "จอง public", "ชำระแพค public"]) {
  assert.equal(classifyKenjiMemberIntent(keyword).intent, "public_package_unavailable", keyword);
  const reply = buildKenjiMemberReply(keyword);
  assert.match(reply, /ยังไม่เปิดขายแพ็กเกจ Public/);
  assert.doesNotMatch(reply, /สมัครสมาชิกใหม่|ขั้นตอนสมัคร|https?:|\d+\s*บาท|ส่งสลิป|เลขบัญชี/);
}

for (const keyword of ["Membership Package", "Membership Packcage", "MEMBERSHIP   PACKAGE", "Membership", "แพ็กเกจสมาชิก", "แพคเกจสมาชิก"]) {
  assert.equal(classifyKenjiMemberIntent(keyword).intent, "membership_package", keyword);
  assert.equal(isKenjiMemberLineCandidate(keyword), true, keyword);
  assert.match(buildKenjiMemberReply(keyword), /สมัครสมาชิกใหม่.*ต่ออายุสมาชิกเดิม/);
}
for (const keyword of ["สมัครสมาชิก", "สมัครใหม่", "สมาชิกใหม่", "Membership Package สมัครใหม่"]) {
  assert.equal(classifyKenjiMemberIntent(keyword).intent, "membership_signup", keyword);
  assert.doesNotMatch(buildKenjiMemberReply(keyword), /ครั้งนี้ต้องการสมัครสมาชิกใหม่/);
}
for (const keyword of ["Membership Packcage ราคาเท่าไร", "สวัสดีครับ Membership Package ขอรายละเอียด", "แพ็กเกจสมาชิก มีสิทธิอะไร"]) {
  assert.equal(classifyKenjiMemberIntent(keyword).intent, "membership_details", keyword);
  assert.doesNotMatch(buildKenjiMemberReply(keyword), /ยินดีต้อนรับ|ครั้งนี้ต้องการสมัครสมาชิกใหม่|\d+\s*บาท/);
}
assert.equal(classifyKenjiMemberIntent("Membership Package ต่ออายุ").intent, "membership_renewal");
assert.equal(classifyKenjiMemberIntent("Membership status").intent, "membership_renewal");
assert.equal(classifyKenjiMemberIntent("Membership Package ส่งสลิปแล้ว").intent, "payment_slip");
assert.equal(classifyKenjiMemberIntent("Membership Package จอง").intent, "booking");
assert.equal(classifyKenjiMemberIntent("Membership Black Card").intent, "black_card");
for (const greeting of ["", "สวัสดีครับ", "Hi Per", "เคนจิ"]) {
  assert.match(buildKenjiMemberReply(greeting), /Per.*Membership Package/);
  assert.doesNotMatch(buildKenjiMemberReply(greeting), /Kenji|เคนจิ|HYPE/);
}

const paymentReply = buildKenjiMemberReply("ส่งสลิปแล้ว", summary);
assert.match(paymentReply, /รอตรวจสอบ/);
assert.match(paymentReply, /จนกว่า MMD จะยืนยันยอด/);
assert.match(paymentReply, /03 PAYMENT PROOF/);

const svipReply = buildKenjiMemberReply("SVIP มีแต้ม 1200", summary);
assert.match(svipReply, /Boss Per/);
assert.match(svipReply, /ไม่เปิดสิทธิ์อัตโนมัติ/);

const blackCardReply = buildKenjiMemberReply("Black Card VIP", summary);
assert.match(blackCardReply, /private review/);
assert.match(blackCardReply, /ไม่ใช่การอนุมัติอัตโนมัติ/);

const bookingReply = buildKenjiMemberReply("จอง", summary);
assert.match(bookingReply, /ตรวจความพร้อมก่อนยืนยัน/);
assert.match(bookingReply, /พร้อมวัน เวลา และโซน/);

const pointsReply = buildKenjiMemberReply("แต้ม", summary);
assert.match(pointsReply, /1,280/);

console.log("kenji member concierge core tests passed");
