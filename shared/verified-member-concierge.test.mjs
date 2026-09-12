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
console.log("verified member concierge tests passed");
