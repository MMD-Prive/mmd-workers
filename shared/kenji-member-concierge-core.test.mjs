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

const paymentReply = buildKenjiMemberReply("ส่งสลิปแล้ว", summary);
assert.match(paymentReply, /supporting evidence/);
assert.match(paymentReply, /official verification/);
assert.match(paymentReply, /fund matching/);

const svipReply = buildKenjiMemberReply("SVIP มีแต้ม 1200", summary);
assert.match(svipReply, /Boss Per/);
assert.match(svipReply, /ไม่ได้ปลดล็อกจากแต้มอัตโนมัติ/);

const blackCardReply = buildKenjiMemberReply("Black Card VIP", summary);
assert.match(blackCardReply, /private review/);
assert.match(blackCardReply, /automatic approval/);

const bookingReply = buildKenjiMemberReply("จอง", summary);
assert.match(bookingReply, /ผมช่วยพาไปขั้นตอนการจองได้ครับ/);
assert.match(bookingReply, /ขอเช็กสถานะสมาชิก/);

const pointsReply = buildKenjiMemberReply("แต้ม", summary);
assert.match(pointsReply, /1,280/);

console.log("kenji member concierge core tests passed");
