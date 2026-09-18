import assert from "node:assert/strict";
import { canonicalRichMenuIntent, generateSafeReply, resolveReplyPolicy } from "./verified-member-concierge.mjs";
assert.equal(canonicalRichMenuIntent({data:"payment"}), "payment_proof");
assert.equal(canonicalRichMenuIntent({intent:"privacy_request"}), "privacy_request");
assert.equal(canonicalRichMenuIntent({intent:"availability_request"}), "availability_request");
assert.equal(canonicalRichMenuIntent({intent:"human_handoff"}), "human_handoff");

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

for (const canonicalLevel of ["private_standard","private_premium","vip","svip","black_card"]) {
  const active = generateSafeReply({level:"private",identity_state:"matched",membership_state:"active",canonical_membership_level:canonicalLevel,intent:"support",display_name:"Member"});
  assert.match(active.text,/เปอร์/);
  assert.doesNotMatch(active.text,/สมัครสมาชิก|ต่ออายุ|Public Package/i);
}

const expiring = generateSafeReply({level:"private",identity_state:"matched",membership_state:"expiring_soon",intent:"renewal",display_name:"Expiring"});
assert.equal(expiring.next_action,"renew_membership");
assert.match(expiring.text,/ต่ออายุ/);

const expired = generateSafeReply({level:"private",identity_state:"matched",membership_state:"expired",intent:"support",display_name:"Expired"});
assert.equal(expired.next_action,"renew_membership");
assert.match(expired.text,/ต่ออายุ/);
assert.match(expired.text,/ยังไม่เปิดรายการ Private/);

const activeRenewal = generateSafeReply({level:"private",identity_state:"matched",membership_state:"active",intent:"renewal",display_name:"Active"});
assert.notEqual(activeRenewal.next_action,"renew_membership");
assert.doesNotMatch(activeRenewal.text,/ต่ออายุ/);

const privateKenji = generateSafeReply({level:"private",identity_state:"matched",membership_state:"active",intent:"kenji_ai"});
assert.match(privateKenji.text,/Kenji/);
const publicKenji = generateSafeReply({level:"public",identity_state:"matched",membership_state:"active",intent:"kenji_ai"});
assert.doesNotMatch(publicKenji.text,/Kenji/i);

for (const intent of ["privacy_request","availability_request","human_handoff","internal_access"]) {
  const protectedIntent = generateSafeReply({level:"private",identity_state:"matched",membership_state:"active",intent});
  assert.equal(protectedIntent.text,"");
  assert.equal(protectedIntent.next_action,"preserve_existing_intent");
}

console.log("verified member concierge tests passed");
