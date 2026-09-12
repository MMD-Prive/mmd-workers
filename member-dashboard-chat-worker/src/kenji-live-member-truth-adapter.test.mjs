import assert from "node:assert/strict";
import { resolveKenjiLiveMemberContext } from "./kenji-live-member-truth-adapter.mjs";
const env={MEMBER_PAGES_WORKER:{fetch:async req=>{const b=await req.json();assert.equal(b.line_user_id,"U1234567890abcdef1234567890abcdef");assert.equal(b.intent,"");return new Response(JSON.stringify({ok:true,authority:"my_mmd_entitlement_resolver_v1",identity_status:"resolved",display_name:"Per",membership:{level:"private_premium",lifecycle:"active"}}));}}};
const result=await resolveKenjiLiveMemberContext(env,"U1234567890abcdef1234567890abcdef","booking");
assert.equal(result.level,"private"); assert.equal(result.live_truth,true); assert.equal(result.membership_state,"active");
assert.equal(await resolveKenjiLiveMemberContext({}, "U1234567890abcdef1234567890abcdef","booking"),null);
console.log("kenji live member truth adapter tests passed");
