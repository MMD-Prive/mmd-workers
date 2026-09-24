import assert from "node:assert/strict";
import test from "node:test";

import { decideKenjiFirstContactMembership } from "../src/kenji-line-first-contact-membership.mjs";

const userId = "U0123456789abcdef0123456789abcdef";
const event = (text) => ({ type: "message", source: { type: "user", userId }, message: { type: "text", text } });
const authority = "my_mmd_entitlement_resolver_v1";
function envFor(membership, requests, former = null) {
  return { MEMBER_PAGES_WORKER: { fetch: async (request) => {
    requests.push(await request.json());
    return Response.json({ ok: true, authority, identity_status: "resolved", membership, former_private_membership: former });
  } } };
}

test("status lookup uses the LINE identity and latest entitlement, never a remembered label", async () => {
  const requests = [];
  const current = await decideKenjiFirstContactMembership(event("สถานะสมาชิกของผม"), "membership_status", {},
    envFor({ level: "private_premium", label: "Premium", lifecycle: "active", expire_at: "2027-01-12" }, requests));
  assert.deepEqual(requests, [{ line_user_id: userId, intent: "membership_status" }]);
  assert.match(current.text, /Premium.*12 มกราคม 2570/);
  assert.equal(current.live_truth_verified, true);

  const expired = await decideKenjiFirstContactMembership(event("สมาชิกหมดอายุยัง"), "membership", {},
    envFor({ level: "private_standard", label: "Standard", lifecycle: "expired", expire_at: "2026-08-01" }, []));
  assert.match(expired.text, /Standard หมดอายุแล้ว/);
  assert.doesNotMatch(expired.text, /สมัครใหม่|ชำระ/);
});

test("former member can discuss renewal without a payment or access promise", async () => {
  const result = await decideKenjiFirstContactMembership(event("ต่ออายุสมาชิก"), "membership_renewal", {},
    envFor({ level: "private_premium", label: "Premium", lifecycle: "expired" }, []));
  assert.match(result.text, /บัญชีสมาชิกเดิม Premium/);
  assert.match(result.text, /ก่อนชำระ/);
  assert.doesNotMatch(result.text, /โอนเลย|เปิดสิทธิ์แล้ว|สมัครใหม่/);
});

test("active public membership does not hide expired Private membership", async () => {
  const env = envFor({ level: "public_member", label: "Member", lifecycle: "active" }, [],
    { level: "private_premium", label: "Premium", lifecycle: "expired" });
  const status = await decideKenjiFirstContactMembership(event("สถานะสมาชิกของผม"), "membership_status", {}, env);
  assert.match(status.text, /Member.*Premium เดิมหมดอายุแล้ว/);
  const renewal = await decideKenjiFirstContactMembership(event("ต่ออายุสมาชิก"), "membership_renewal", {}, env);
  assert.match(renewal.text, /Premium.*บัญชีเดิมก่อนชำระ/);
});

test("unavailable, restricted, and unresolved truth never claim a tier", async () => {
  const missing = await decideKenjiFirstContactMembership(event("สถานะสมาชิกของผม"), "membership_status", {}, {});
  assert.equal(missing.handoff_required, true);
  assert.equal(missing.live_truth_used, false);
  assert.doesNotMatch(missing.text, /Standard|Premium|VIP/);

  const blocked = await decideKenjiFirstContactMembership(event("ต่ออายุสมาชิก"), "membership_renewal", {},
    envFor({ level: "private_premium", label: "Premium", lifecycle: "blocked", member_blocked: true }, []));
  assert.equal(blocked.handoff_required, true);
  assert.doesNotMatch(blocked.text, /Premium|ต่ออายุและยอด/);
});

test("a new signup keeps safe navigation when no member record is found", async () => {
  const decision = await decideKenjiFirstContactMembership(event("อยากสมัครสมาชิก"), "membership_signup", {}, {});
  assert.match(decision.text, /sigil\/member\/membership/);
  assert.equal(decision.live_truth_used, undefined);
  const known = await decideKenjiFirstContactMembership(event("อยากสมัครสมาชิก"), "membership_signup", { client_record_id: "recKnown" }, {});
  assert.equal(known.handoff_required, true);
});

test("payment context and human takeover cannot be overridden by a membership lookup", async () => {
  const requests = [];
  const env = envFor({ level: "private_standard", label: "Standard", lifecycle: "active" }, requests);
  const proof = await decideKenjiFirstContactMembership(event("ต่ออายุสมาชิก โอนแล้ว ส่งสลิป"), "membership_renewal", {}, env);
  const human = await decideKenjiFirstContactMembership(event("ต่ออายุสมาชิก"), "membership_renewal", { decision: "human_takeover" }, env);
  assert.equal(proof.text, "");
  assert.equal(human.text, "");
  assert.equal(requests.length, 0);
});

test("unrelated greetings do not read membership truth", async () => {
  const requests = [];
  const decision = await decideKenjiFirstContactMembership(event("สวัสดี"), "greeting", {}, envFor({}, requests));
  assert.match(decision.text, /งานหรือกิจกรรม/);
  assert.equal(requests.length, 0);
});
