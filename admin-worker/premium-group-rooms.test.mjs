import assert from "node:assert/strict";
import test from "node:test";
import { ROOMS, ROOM_REASON as R, ROOM_STATE as S, evaluateRoom, promoGraceUntilMs, roomConfigured } from "./src/premium-group-cleanup/rooms.js";

const NOW = Date.parse("2026-11-15T00:00:00+07:00");
const GRACE = Date.parse("2026-12-31T23:59:59+07:00");
const e = (capability, lifecycle, over = {}) => ({ capability, lifecycle, source: "airtable", ...over });
const ev = (room, ents, over = {}) => evaluateRoom(room, ents, { now: NOW, promoGraceUntil: GRACE, ...over });

test("standard room: any tier incl. expired stays; non-member is review", () => {
  assert.equal(ev("standard", [e("private_standard", "active")]).state, S.OK);
  const x = ev("standard", [e("private_premium", "expired")]);
  assert.deepEqual([x.state, x.reason], [S.OK, R.EXPIRED_STANDARD_STAYS]);
  assert.equal(ev("standard", []).state, S.REVIEW);
});

test("premium room: entitled ok, expired premium is in promo grace until 31 Dec then candidate", () => {
  assert.equal(ev("premium", [e("private_premium", "active")]).state, S.OK);
  assert.equal(ev("premium", [e("vip", "active")]).state, S.OK);
  assert.deepEqual(ev("premium", [e("private_premium", "expired")]), { state: S.GRACE_PROMO, reason: R.PROMO_GRACE });
  const late = ev("premium", [e("private_premium", "expired")], { now: Date.parse("2027-01-02T00:00:00+07:00") });
  assert.deepEqual(late, { state: S.REMOVE_CANDIDATE, reason: R.EXPIRED_NOT_RENEWED });
  assert.deepEqual(ev("premium", [e("private_premium", "expired")], { promoGraceUntil: 0 }).state, S.REMOVE_CANDIDATE);
});

test("premium room: guest pass ok while live, candidate once ended; standard is below room", () => {
  assert.equal(ev("premium", [e("guest_pass", "active")]).state, S.OK);
  assert.deepEqual(ev("premium", [e("guest_pass", "expired")]), { state: S.REMOVE_CANDIDATE, reason: R.GUEST_PASS_ENDED });
  assert.deepEqual(ev("premium", [e("private_standard", "active")]), { state: S.REMOVE_CANDIDATE, reason: R.TIER_BELOW_ROOM });
});

test("premium room: expired VIP-class is never auto-candidate", () => {
  for (const cap of ["vip", "svip", "black_card"]) assert.deepEqual(ev("premium", [e(cap, "expired")]), { state: S.REVIEW, reason: R.VIP_CLASS_EXPIRED });
});

test("black room: VIP, Black Card and SVIP are ok; expired is per-person review; lower tiers candidate", () => {
  for (const cap of ["vip", "black_card", "svip"]) assert.equal(ev("black", [e(cap, "active")]).state, S.OK);
  assert.deepEqual(ev("black", [e("vip", "expired")]), { state: S.REVIEW, reason: R.VIP_CLASS_EXPIRED });
  assert.deepEqual(ev("black", [e("private_premium", "active")]), { state: S.REMOVE_CANDIDATE, reason: R.TIER_BELOW_ROOM });
});

test("inner chamber: SVIP only; expired SVIP is review; VIP is below room", () => {
  assert.equal(ev("inner", [e("svip", "active")]).state, S.OK);
  assert.equal(ev("inner", [e("svip", "active", { source: "owner_grant" })]).state, S.OK);
  assert.deepEqual(ev("inner", [e("svip", "expired")]), { state: S.REVIEW, reason: R.VIP_CLASS_EXPIRED });
  assert.deepEqual(ev("inner", [e("vip", "active")]), { state: S.REMOVE_CANDIDATE, reason: R.TIER_BELOW_ROOM });
});

test("owner grant / blocked / pending escalate instead of removing", () => {
  assert.deepEqual(ev("premium", [e("private_premium", "expired", { source: "owner_grant" })]), { state: S.REVIEW, reason: R.OWNER_GRANT });
  assert.equal(ev("premium", [e("private_premium", "blocked")]).reason, R.BLOCKED);
  assert.equal(ev("premium", [e("private_premium", "active")], { blocked: true }).reason, R.BLOCKED);
  assert.equal(ev("premium", [e("private_premium", "expired", { member_status: "pending_payment" })]).reason, R.PENDING);
});

test("preview channel is view only and cannot remove", () => {
  assert.equal(ev("preview", [e("private_premium", "expired")]).state, S.VIEW_ONLY);
  assert.equal(ROOMS.preview.canRemove, false);
});

test("room config comes from env only; promo grace parses ISO or is off", () => {
  assert.equal(roomConfigured({ TELEGRAM_PRESENCE_BLACK_ROOM_ID: "-100" }, "black"), true);
  assert.equal(roomConfigured({}, "inner"), false);
  assert.equal(promoGraceUntilMs({ PREMIUM_GROUP_PROMO_GRACE_UNTIL: "2026-12-31T23:59:59+07:00" }), GRACE);
  assert.equal(promoGraceUntilMs({}), 0);
});
