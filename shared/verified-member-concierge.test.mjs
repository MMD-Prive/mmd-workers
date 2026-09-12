import assert from "node:assert/strict";
import { canonicalRichMenuIntent, generateSafeReply, resolveReplyPolicy } from "./verified-member-concierge.mjs";
assert.equal(canonicalRichMenuIntent({data:"payment"}), "payment_proof");
for (const level of ["guest","public","private"]) {
  const r=generateSafeReply({level,identity_state:"matched",membership_state:"active",intent:"support",display_name:"Kenji"});
  assert.equal(r.level,level); assert.equal(r.source,"verified_member_concierge_v1");
}
assert.equal(resolveReplyPolicy({level:"public",identity_state:"needs_review",membership_state:"active"}).blocked,true);
assert.equal(generateSafeReply({level:"private",identity_state:"blocked",membership_state:"active",intent:"booking"}).next_action,"verify_identity");
assert.equal(generateSafeReply({level:"private",identity_state:"matched",membership_state:"active",intent:"payment"}).next_action,"verify_payment");

const guest = generateSafeReply({level:"guest",identity_state:"matched",membership_state:"active",intent:"support",display_name:"Guest"});
assert.match(guest.text,/HITO/);
assert.match(guest.text,/Public Package/);
assert.doesNotMatch(guest.text,/Kenji|Private|VIP|SVIP|Black/i);

const publicMember = generateSafeReply({level:"public",identity_state:"matched",membership_state:"active",intent:"support",display_name:"Public"});
assert.match(publicMember.text,/เปอร์/);
assert.doesNotMatch(publicMember.text,/สมัครสมาชิก|ต่ออายุ|Kenji/i);

const svip = generateSafeReply({level:"private",identity_state:"matched",membership_state:"active",intent:"support",display_name:"SVIP"});
assert.match(svip.text,/เปอร์/);
assert.doesNotMatch(svip.text,/สมัครสมาชิก|ต่ออายุ|Kenji/i);

const privateKenji = generateSafeReply({level:"private",identity_state:"matched",membership_state:"active",intent:"kenji_ai"});
assert.match(privateKenji.text,/Kenji/);
const publicKenji = generateSafeReply({level:"public",identity_state:"matched",membership_state:"active",intent:"kenji_ai"});
assert.doesNotMatch(publicKenji.text,/Kenji/i);

console.log("verified member concierge tests passed");
