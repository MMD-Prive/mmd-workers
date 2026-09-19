import test from "node:test";
import assert from "node:assert/strict";

import worker from "./index.review-wrapper.js";

test("production entrypoint bounds invalid confirmation tokens to 401", async () => {
  const response = await worker.fetch(
    new Request("https://sigil.mmdbkk.com/v1/confirm/verify", {
      method: "POST",
      headers: {
        Origin: "https://mmdbkk.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ t: "invalid.invalid", expected_role: "customer" }),
    }),
    {
      PAYMENT_CONFIRMATION_SIGNING_SECRET: "test-signing-secret",
      PAY_SESSIONS_KV: {
        async get() { return null; },
        async put() {},
      },
    },
    {},
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "invalid_confirmation_token" });
});
