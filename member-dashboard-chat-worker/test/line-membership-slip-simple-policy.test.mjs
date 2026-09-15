import test from "node:test";
import assert from "node:assert/strict";

import { LINE_GROUP_INGRESS_INTERNALS as internals } from "../src/line-group-ingress-front-gate.js";

const {
  hasMembershipPaymentContext,
  hasPaymentContext,
  hasPaymentFollowupContext,
  membershipPaymentAcceptedByOwnerPolicy,
} = internals;

test("recognises colloquial Thai renewal wording", () => {
  assert.equal(hasPaymentContext("งั้นต่อให้หน่อยได้ไหมครับ"), true);
  assert.equal(hasMembershipPaymentContext("งั้นต่อให้หน่อยได้ไหมครับ"), true);
  assert.equal(hasPaymentContext("ขอสมัครสมาชิกครับ"), true);
});

test("numeric follow-up can promote a waiting slip candidate", () => {
  assert.equal(hasPaymentFollowupContext("233-2-98800-1"), true);
  assert.equal(hasPaymentFollowupContext("1999"), true);
});

test("accepts a positive numeric membership slip without receiving-bank matching", () => {
  assert.equal(membershipPaymentAcceptedByOwnerPolicy({
    route: { topic: "membership", should_alert: false },
    extraction: { amount_thb: 1999, receiver_bank: "any-mmd-account" },
    contextText: "ต่ออายุสมาชิก",
  }), true);
});

test("membership language is enough even when route has not resolved yet", () => {
  assert.equal(membershipPaymentAcceptedByOwnerPolicy({
    route: { topic: "payment", should_alert: false },
    extraction: { amount_thb: 1999 },
    contextText: "งั้นต่อให้หน่อยได้ไหมครับ",
  }), true);
});

test("does not accept zero, missing amount, conflict, or ordinary service context", () => {
  assert.equal(membershipPaymentAcceptedByOwnerPolicy({
    route: { topic: "membership", should_alert: false },
    extraction: { amount_thb: 0 },
    contextText: "ต่ออายุสมาชิก",
  }), false);
  assert.equal(membershipPaymentAcceptedByOwnerPolicy({
    route: { topic: "membership", should_alert: false },
    extraction: {},
    contextText: "สมัครสมาชิก",
  }), false);
  assert.equal(membershipPaymentAcceptedByOwnerPolicy({
    route: { topic: "membership", should_alert: true },
    extraction: { amount_thb: 1999 },
    contextText: "ต่ออายุสมาชิก",
  }), false);
  assert.equal(membershipPaymentAcceptedByOwnerPolicy({
    route: { topic: "payment", should_alert: false },
    extraction: { amount_thb: 2500 },
    contextText: "มัดจำงาน",
  }), false);
});
