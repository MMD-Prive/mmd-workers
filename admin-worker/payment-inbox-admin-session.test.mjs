import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

import adminWorker from "./src/admin-login-hero-worker.js";
import { readCredentialBoundAdminActor } from "./src/credential-bound-admin-session.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const env = {
  ADMIN_LOGIN_CREDENTIAL: "payment-inbox-admin-session-test",
};

test("credential login issues an admin actor usable by the payment review guard", async () => {
  const login = await adminWorker.fetch(
    new Request("https://www.mmdbkk.com/internal/admin/login/session", {
      method: "POST",
      headers: {
        Origin: "https://www.mmdbkk.com",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        credential: env.ADMIN_LOGIN_CREDENTIAL,
        next: "/internal/admin/payments",
      }),
    }),
    env,
    {}
  );

  assert.equal(login.status, 303);
  const cookie = (login.headers.get("set-cookie") || "").split(";", 1)[0];
  assert.match(cookie, /^mmd_admin_gate_v1=/);

  const actor = await readCredentialBoundAdminActor(
    new Request("https://www.mmdbkk.com/v1/admin/payments/review-queue", {
      headers: { Cookie: cookie },
    }),
    env
  );

  assert.deepEqual(
    { id: actor?.id, role: actor?.role },
    { id: "per", role: "admin" }
  );
});
