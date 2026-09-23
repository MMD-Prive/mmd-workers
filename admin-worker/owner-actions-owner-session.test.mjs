import assert from "node:assert/strict";
import test from "node:test";

import adminWorker, { ADMIN_LOGIN_SESSION_PATH } from "./src/admin-login-hero-worker-core.js";
import { readCredentialBoundAdminActor } from "./src/credential-bound-admin-session.js";

const env = {
  ADMIN_LOGIN_CREDENTIAL: "per-owner-test-credential",
  ADMIN_SESSION_SECRET: "per-owner-test-session-secret",
};

test("Per credential creates an owner-bound admin session for Owner Actions", async () => {
  const login = new Request(`https://mmdbkk.com${ADMIN_LOGIN_SESSION_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://mmdbkk.com",
      "x-mmd-login-fetch": "1",
    },
    body: JSON.stringify({
      action: "owner_login",
      access_code: env.ADMIN_LOGIN_CREDENTIAL,
      next: "/internal/admin/control-room",
    }),
  });

  const response = await adminWorker.fetch(login, env, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    next: "/internal/admin/control-room",
    role: "owner",
  });

  const cookie = response.headers.get("set-cookie");
  assert.match(cookie || "", /mmd_admin_gate_v1=/);
  const actor = await readCredentialBoundAdminActor(new Request(
    "https://www.mmdbkk.com/v1/admin/dashboard/owner-actions",
    { headers: { cookie } },
  ), env);

  assert.deepEqual(actor && {
    id: actor.id,
    role: actor.role,
    auth_method: actor.auth_method,
  }, {
    id: "per",
    role: "owner",
    auth_method: "credential",
  });
});
