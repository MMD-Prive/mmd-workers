import test from "node:test";
import assert from "node:assert/strict";

import {
  HYPE_MEMBER_WALLET_PATH,
  handleHypeMemberWalletRpc,
} from "./src/hype-member-wallet.js";

function request(body, caller = "telegram-worker") {
  return new Request(`https://admin-worker.internal${HYPE_MEMBER_WALLET_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-service-binding": caller,
    },
    body: JSON.stringify(body),
  });
}

function baseEnv(overrides = {}) {
  return {
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_API_KEY: "test-token",
    AIRTABLE_TABLE_CLIENTS_ID: "tblClients",
    ...overrides,
  };
}

test("HYPE member wallet admin bridge is Telegram service-binding only", async () => {
  const response = await handleHypeMemberWalletRpc(request({
    telegram_user_id: "111111",
    scope: "points",
  }, "browser"), baseEnv());
  assert.equal(response.status, 403);
});

test("HYPE member wallet bridge resolves verified Telegram to canonical LINE before member authority read", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let upstream = null;

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/tblClients")) {
      return Response.json({
        records: [{
          id: "recClientA1",
          fields: {
            telegram_user_id: "111111",
            telegram_verification_status: "verified",
            line_user_id: "U0123456789abcdef0123456789abcdef",
            "Client Name": "Client A",
          },
        }],
      });
    }
    throw new Error(`unexpected fetch ${parsed.pathname}`);
  };

  try {
    const response = await handleHypeMemberWalletRpc(request({
      telegram_user_id: "111111",
      scope: "coupons",
    }), baseEnv({
      MEMBER_PAGES_MEMBER_WALLET: {
        async fetch(req) {
          upstream = {
            url: req.url,
            headers: Object.fromEntries(req.headers.entries()),
            body: JSON.parse(await req.clone().text()),
          };
          return Response.json({
            ok: true,
            authority: "mmd.hype_member_wallet_projection.v1",
            identity_status: "resolved",
            scope: "coupons",
            points: { status: "not_requested", active_points: null },
            coupon: {
              status: "ready",
              code: "ABC234",
              approved_discount_percent: 5,
              expires_at: "2026-11-19T16:59:59.999Z",
              single_use: true,
              internal_claim: "must-not-pass",
            },
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.display_name, "Client A");
    assert.equal(body.scope, "coupons");
    assert.equal(body.coupon.code, "ABC234");
    assert.equal(body.coupon.approved_discount_percent, 5);
    assert.equal(Object.hasOwn(body.coupon, "internal_claim"), false);
    assert.equal(body.guardrails.canonical_identity_required, true);
    assert.equal(body.guardrails.coupon_activation_allowed, false);

    assert.equal(new URL(upstream.url).pathname, "/__internal/hype/member-wallet");
    assert.equal(upstream.headers["x-mmd-internal-call"], "true");
    assert.equal(upstream.headers["x-mmd-service-binding"], "admin-worker");
    assert.deepEqual(upstream.body, {
      line_user_id: "U0123456789abcdef0123456789abcdef",
      scope: "coupons",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE member wallet bridge fails closed when Telegram is not canonically linked", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalled = false;

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/tblClients")) return Response.json({ records: [] });
    throw new Error(`unexpected fetch ${parsed.pathname}`);
  };

  try {
    const response = await handleHypeMemberWalletRpc(request({
      telegram_user_id: "111111",
      scope: "points",
    }), baseEnv({
      MEMBER_PAGES_MEMBER_WALLET: {
        async fetch() {
          upstreamCalled = true;
          throw new Error("must not call member authority without canonical identity");
        },
      },
    }));
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.equal(body.state, "connect_required");
    assert.equal(upstreamCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE member wallet bridge fails closed when canonical Client has no LINE identity", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalled = false;

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/tblClients")) {
      return Response.json({
        records: [{
          id: "recClientA1",
          fields: {
            telegram_user_id: "111111",
            telegram_verification_status: "verified",
            "Client Name": "Client A",
          },
        }],
      });
    }
    throw new Error(`unexpected fetch ${parsed.pathname}`);
  };

  try {
    const response = await handleHypeMemberWalletRpc(request({
      telegram_user_id: "111111",
      scope: "points",
    }), baseEnv({
      MEMBER_PAGES_MEMBER_WALLET: {
        async fetch() {
          upstreamCalled = true;
          throw new Error("must not call without line identity");
        },
      },
    }));
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.equal(body.state, "line_identity_required");
    assert.equal(upstreamCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
