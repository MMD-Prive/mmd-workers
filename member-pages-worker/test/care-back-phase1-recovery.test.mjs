import assert from "node:assert/strict";
import { test } from "node:test";

import {
  approveCareBackPhase1RecoveryDiscount,
  memberAppRecoveryCare,
  memberAppRecoveryCoupons,
  readCareBackPhase1Recovery,
} from "../src/care-back-phase1-recovery.js";

const LINE_ID = `U${"a".repeat(32)}`;
const RECOVERY_ID = "CB6-P1-TEST";
const RECOVERY_RECORD_ID = "recAAAAAAAAAAAAAA";
const PROMO_RECORD_ID = "recBBBBBBBBBBBBBB";

function env({ wishText = "สุขสันต์ 6 ปีครับ", promoStatus = "active", usedCount = 0 } = {}) {
  let promo = {
    id: PROMO_RECORD_ID,
    fields: {
      code: "ABC234",
      campaign_code: "6-years-care-back",
      status: promoStatus,
      activated_at: "2026-09-16T00:00:00.000Z",
      expires_at: "2026-11-16T00:00:00.000Z",
      max_uses: 1,
      used_count: usedCount,
      benefit_type: "discount_percent",
    },
  };
  const recovery = {
    id: RECOVERY_RECORD_ID,
    fields: {
      recovery_id: RECOVERY_ID,
      line_user_id: LINE_ID,
      campaign_id: "6-years-care-back",
      display_name: "Recovery Customer",
      evidence_kind: wishText ? "actual_wish" : "submission_failed",
      wish_text: wishText,
      wish_equivalent_completed: true,
      approval_status: "issued",
      approved_at: "2026-09-16T00:00:00.000Z",
      coupon_code: "ABC234",
      "Promo Code": [PROMO_RECORD_ID],
      activated_at: "2026-09-16T00:00:00.000Z",
      expires_at: "2026-11-16T00:00:00.000Z",
    },
  };
  const calls = [];
  return {
    calls,
    env: {
      AIRTABLE_API_KEY: "airtable-test-key",
      AIRTABLE_BASE_ID: "app_test",
      AIRTABLE_HTTP: {
        async fetch(request) {
          const url = new URL(request.url);
          calls.push({ method: request.method, url: url.toString() });
          if (request.method === "GET" && url.pathname.includes("CARE%20BACK%20Recovery%20Authorizations")) {
            return Response.json({ records: [recovery] });
          }
          if (request.method === "GET" && url.pathname.endsWith(`/${PROMO_RECORD_ID}`)) {
            return Response.json(promo);
          }
          if (request.method === "PATCH" && url.pathname.endsWith(`/${PROMO_RECORD_ID}`)) {
            const body = await request.json();
            promo = { id: PROMO_RECORD_ID, fields: { ...promo.fields, ...body.fields } };
            return Response.json(promo);
          }
          throw new Error(`unexpected Airtable request ${request.method} ${url}`);
        },
      },
    },
  };
}

test("recovery is bound to exact LINE evidence and exposes one active coupon without fixed rate", async () => {
  const setup = env();
  const recovery = await readCareBackPhase1Recovery(setup.env, LINE_ID);
  assert.equal(recovery.recovery_id, RECOVERY_ID);
  assert.equal(recovery.code, "ABC234");
  assert.equal(recovery.customer_state, "ready");
  assert.equal(recovery.approved_discount_percent, null);
  assert.equal(recovery.wish_text, "สุขสันต์ 6 ปีครับ");
  assert.deepEqual(memberAppRecoveryCoupons(recovery)[0], {
    id: `care-back-recovery-${RECOVERY_ID}`,
    title: "CARE BACK",
    description: "คูปองกู้คืนจากช่วงที่ระบบส่งคำอวยพรขัดข้อง · ระบบจะตรวจสอบส่วนลดจริงเมื่อจอง",
    state: "issued",
    approvedDiscountPercent: null,
    issuedAt: "2026-09-16T00:00:00.000Z",
    expiresAt: "2026-11-16T00:00:00.000Z",
    reference: "ABC234",
    recovery: true,
  });
});

test("submission-failed recovery never invents Wish text", async () => {
  const setup = env({ wishText: "" });
  const recovery = await readCareBackPhase1Recovery(setup.env, LINE_ID);
  const care = memberAppRecoveryCare(recovery);
  assert.equal(care.stage, "wish_saved");
  assert.equal("wish" in care, false);
});

test("trusted recovery approval calculates Standard VIP 7 percent on the server", async () => {
  const setup = env();
  const approved = await approveCareBackPhase1RecoveryDiscount(setup.env, {
    lineUserId: LINE_ID,
    modelLevel: "Standard Models",
    jobFormat: "VIP",
  });
  assert.equal(approved.approved_discount_percent, 7);
  assert.equal(approved.customer_state, "ready");
  assert.ok(setup.calls.some((call) => call.method === "PATCH"));
});

test("used recovery coupon cannot be approved again", async () => {
  const setup = env({ usedCount: 1 });
  await assert.rejects(
    approveCareBackPhase1RecoveryDiscount(setup.env, {
      lineUserId: LINE_ID,
      modelLevel: "Premium",
      jobFormat: "VIP",
    }),
    (error) => error?.code === "CARE_BACK_RECOVERY_USED",
  );
});
