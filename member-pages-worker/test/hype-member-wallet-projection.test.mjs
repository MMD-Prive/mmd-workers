import test from "node:test";
import assert from "node:assert/strict";

import {
  HYPE_MEMBER_WALLET_PATH,
  handleHypeMemberWallet,
  projectHypeCouponWallet,
  projectHypePoints,
} from "../src/hype-member-wallet-projection.js";

const LINE_ID = "U0123456789abcdef0123456789abcdef";

function request(body, caller = "admin-worker", host = "member-pages-worker.internal") {
  return new Request(`https://${host}${HYPE_MEMBER_WALLET_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": caller,
    },
    body: JSON.stringify(body),
  });
}

function env(overrides = {}) {
  return {
    MEMBER_STATUS_RESOLVER_SECRET: "resolver-secret-0123456789abcdef0123456789",
    LIFF_SESSION_SECRET: "liff-secret-0123456789abcdef01234567890123",
    MEMBER_STATUS_RESOLVER: {
      async fetch() {
        return Response.json({
          ok: true,
          data: {
            member_exists: true,
            member_id: "member-001",
            profile: {
              customer_360: {
                points: {
                  status: "verified",
                  active_points: 321,
                },
              },
            },
          },
        });
      },
    },
    CARE_BACK_STORE: {
      async openOrResume() {
        throw new Error("read-only projection must not open or mutate a claim");
      },
      async readCouponWallet() {
        return {
          status: "ready",
          code: "ABC234",
          approved_discount_percent: 5,
          expires_at: "2026-11-19T16:59:59.999Z",
          single_use: true,
        };
      },
    },
    ...overrides,
  };
}

test("HYPE member wallet endpoint is service-binding only", async () => {
  const wrongCaller = await handleHypeMemberWallet(request({
    line_user_id: LINE_ID,
    scope: "wallet",
  }, "telegram-worker"), env());
  assert.equal(wrongCaller.status, 404);

  const publicHost = await handleHypeMemberWallet(request({
    line_user_id: LINE_ID,
    scope: "wallet",
  }, "admin-worker", "www.mmdbkk.com"), env());
  assert.equal(publicHost.status, 404);
});

test("HYPE member wallet returns verified Points and ready Coupon through bounded projection", async () => {
  let walletInput = null;
  const response = await handleHypeMemberWallet(request({
    line_user_id: LINE_ID,
    scope: "wallet",
  }), env({
    CARE_BACK_STORE: {
      async openOrResume() {
        throw new Error("must remain read-only");
      },
      async readCouponWallet(input) {
        walletInput = input;
        return {
          status: "ready",
          code: "ABC234",
          approved_discount_percent: 5,
          expires_at: "2026-11-19T16:59:59.999Z",
          single_use: true,
          claim_record_id: "must-not-leak",
          matched_member_id: "must-not-leak",
        };
      },
    },
  }));

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.authority, "mmd.hype_member_wallet_projection.v1");
  assert.deepEqual(body.points, {
    status: "verified",
    active_points: 321,
    rate_thb_per_point: 100,
  });
  assert.equal(body.coupon.status, "ready");
  assert.equal(body.coupon.code, "ABC234");
  assert.equal(body.coupon.approved_discount_percent, 5);
  assert.equal(body.coupon.single_use, true);
  assert.equal(walletInput.memberId, "member-001");
  assert.match(walletInput.identityHash, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(body, "member_id"), false);
  assert.doesNotMatch(JSON.stringify(body), /claim_record_id|matched_member_id|line_user_id/i);
  assert.equal(body.guardrails.coupon_activation_allowed, false);
  assert.equal(body.guardrails.coupon_reissue_allowed, false);
});

test("HYPE points projection never turns an unverified or malformed balance into zero", () => {
  assert.deepEqual(projectHypePoints({
    customer_360: { points: { status: "checking", active_points: 0 } },
  }), {
    status: "unavailable",
    active_points: null,
  });

  assert.deepEqual(projectHypePoints({
    customer_360: { points: { status: "verified", active_points: -1 } },
  }), {
    status: "unavailable",
    active_points: null,
  });
});

test("HYPE coupon projection exposes code only for a valid ready wallet", () => {
  const ready = projectHypeCouponWallet({
    status: "ready",
    code: "ABC234",
    approved_discount_percent: 10,
    expires_at: "2026-11-19T16:59:59.999Z",
    single_use: true,
  });
  assert.equal(ready.code, "ABC234");
  assert.equal(ready.approved_discount_percent, 10);

  for (const status of ["wish_required", "verification_required", "used", "expired", "revoked", "invalid"]) {
    const projected = projectHypeCouponWallet({
      status,
      code: "ABC234",
      approved_discount_percent: 10,
      expires_at: "2026-11-19T16:59:59.999Z",
      single_use: true,
    });
    assert.equal(projected.status, status);
    assert.equal(projected.code, null);
    assert.equal(projected.approved_discount_percent, null);
  }

  const malformedReady = projectHypeCouponWallet({
    status: "ready",
    code: "BAD-CODE",
    approved_discount_percent: 10,
  });
  assert.equal(malformedReady.status, "unavailable");
  assert.equal(malformedReady.code, null);
});

test("HYPE coupon read conflicts collapse to review_required without internal conflict details", async () => {
  const response = await handleHypeMemberWallet(request({
    line_user_id: LINE_ID,
    scope: "coupons",
  }), env({
    CARE_BACK_STORE: {
      async openOrResume() {
        throw new Error("must remain read-only");
      },
      async readCouponWallet() {
        const error = new Error("CARE_BACK_CODE_CONFLICT");
        error.name = "CareBackStoreError";
        throw error;
      },
    },
  }));

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.coupon.status, "unavailable");
  assert.doesNotMatch(JSON.stringify(body), /CARE_BACK_CODE_CONFLICT/);
});
