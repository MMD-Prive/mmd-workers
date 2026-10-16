import assert from "node:assert/strict";
import { buildKenjiMemberReply, classifyKenjiMemberIntent } from "./kenji-member-concierge-core.mjs";

for (const text of ["Membership Package", "Membership Packcage", "แพ็กเกจสมาชิก"]) {
  assert.equal(classifyKenjiMemberIntent(text).intent, "membership_package");
  assert.match(buildKenjiMemberReply(text), /สมัครสมาชิกใหม่.*ต่ออายุสมาชิกเดิม/);
}

assert.equal(classifyKenjiMemberIntent("สมัครสมาชิกใหม่").intent, "membership_signup");
assert.equal(classifyKenjiMemberIntent("Membership Package ราคาเท่าไร").intent, "membership_details");
assert.equal(classifyKenjiMemberIntent("Membership Package Public").intent, "public_package_unavailable");
assert.equal(classifyKenjiMemberIntent("Public package payment").intent, "public_package_unavailable");
assert.equal(classifyKenjiMemberIntent("Public package booking").intent, "public_package_unavailable");
assert.equal(classifyKenjiMemberIntent("Membership Package ต่ออายุ").intent, "membership_renewal");
assert.equal(classifyKenjiMemberIntent("Membership Package ส่งสลิปแล้ว").intent, "payment_slip");
assert.equal(classifyKenjiMemberIntent("Membership Package จอง").intent, "booking");

for (const text of ["Membership Package ราคาเท่าไร", "สมัครสมาชิกใหม่"]) {
  assert.doesNotMatch(buildKenjiMemberReply(text), /\d+\s*บาท|อนุมัติ|ยืนยันการชำระ/);
}
