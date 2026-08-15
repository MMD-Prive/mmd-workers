import assert from "node:assert/strict";
import test from "node:test";

import worker, {
  createConfirmTokenRecord,
  getConfirmTokenTtlSeconds,
  signConfirmToken,
  verifyConfirmToken,
} from "./index.js";

function makeKv() {
  const records = new Map();
  const calls = { get: 0, put: 0 };
  return {
    calls,
    async get(key) {
      calls.get += 1;
      return records.get(key) ?? null;
    },
    async put(key, value, options) {
      calls.put += 1;
      records.set(key, value);
      records.set(`${key}:options`, options);
    },
  };
}

function claims(role, overrides = {}) {
  const now = 2_000_000_000;
  return {
    kind: role === "customer" ? "customer_confirm" : "model_confirm",
    role,
    session_id: "sess_security_test",
    payment_ref: "pay_security_test",
    payment_type: "full",
    iat: now,
    exp: now + 600,
    ...overrides,
  };
}

async function activeToken(env, payload, secret = env.PAYMENT_CONFIRMATION_SIGNING_SECRET) {
  const token = await signConfirmToken(payload, secret);
  await createConfirmTokenRecord(env, token, payload);
  return token;
}

test("dedicated payment confirmation secret validates customer and model purposes", async () => {
  for (const role of ["customer", "model"]) {
    const env = {
      PAYMENT_CONFIRMATION_SIGNING_SECRET: "dedicated-payment-key",
      CONFIRM_KEY: "legacy-key",
      PAY_SESSIONS_KV: makeKv(),
      PAY_TOKEN_TTL_SECONDS: "600",
    };
    const payload = claims(role);
    const token = await activeToken(env, payload);

    assert.deepEqual(
      await verifyConfirmToken(env, token, { expectedRole: role, nowSeconds: payload.iat + 1 }),
      payload
    );
  }
});

test("dedicated secret rejects tokens signed with the migration fallback", async () => {
  const env = {
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "dedicated-payment-key",
    CONFIRM_KEY: "legacy-key",
    PAY_SESSIONS_KV: makeKv(),
  };
  const payload = claims("customer");
  const token = await activeToken(env, payload, env.CONFIRM_KEY);

  await assert.rejects(
    verifyConfirmToken(env, token, { nowSeconds: payload.iat + 1 }),
    /invalid_confirmation_token_signature/
  );
});

test("tampered, expired, and cross-purpose confirmation tokens are rejected", async () => {
  const env = {
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "dedicated-payment-key",
    PAY_SESSIONS_KV: makeKv(),
  };
  const customer = claims("customer");
  const token = await activeToken(env, customer);
  const [encoded, signature] = token.split(".");

  await assert.rejects(
    verifyConfirmToken(env, `${encoded.slice(0, -1)}A.${signature}`, { nowSeconds: customer.iat + 1 }),
    /invalid_confirmation_token/
  );
  await assert.rejects(
    verifyConfirmToken(env, token, { nowSeconds: customer.exp }),
    /confirmation_token_expired/
  );
  await assert.rejects(
    verifyConfirmToken(env, token, { expectedRole: "model", nowSeconds: customer.iat + 1 }),
    /invalid_confirmation_token_purpose/
  );

  const mismatched = claims("customer", { kind: "model_confirm" });
  const mismatchedToken = await activeToken(env, mismatched);
  await assert.rejects(
    verifyConfirmToken(env, mismatchedToken, { nowSeconds: mismatched.iat + 1 }),
    /invalid_confirmation_token_purpose/
  );
});

test("valid signatures still require a matching live KV record", async () => {
  const payload = claims("model");
  const env = {
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "dedicated-payment-key",
    PAY_SESSIONS_KV: makeKv(),
  };
  const token = await signConfirmToken(payload, env.PAYMENT_CONFIRMATION_SIGNING_SECRET);

  await assert.rejects(
    verifyConfirmToken(env, token, { nowSeconds: payload.iat + 1 }),
    /confirmation_token_not_active/
  );
});

test("TTL is bounded to 30 days", () => {
  assert.equal(getConfirmTokenTtlSeconds({ PAY_TOKEN_TTL_SECONDS: "1" }), 60);
  assert.equal(getConfirmTokenTtlSeconds({ PAY_TOKEN_TTL_SECONDS: "999999999" }), 2_592_000);
});

test("verification route is read-only and returns only bounded claims", async () => {
  const kv = makeKv();
  const env = {
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "dedicated-payment-key",
    PAY_SESSIONS_KV: kv,
  };
  const now = Math.floor(Date.now() / 1000);
  const payload = claims("customer", { iat: now, exp: now + 600 });
  const token = await activeToken(env, payload);
  const putsBeforeVerify = kv.calls.put;

  const response = await worker.fetch(
    new Request("https://payments.example/v1/confirm/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token, expected_role: "customer" }),
    }),
    env
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.claims, payload);
  assert.equal(kv.calls.put, putsBeforeVerify, "verification must not mutate KV");
});
