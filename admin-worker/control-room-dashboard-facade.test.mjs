import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

import worker from "./src/admin-login-hero-worker.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const ENV = {
  ADMIN_BEARER: "control_room_dashboard_admin_bearer",
  CONFIRM_KEY: "control_room_dashboard_confirm_key",
  ADMIN_SESSION_SECRET: "control_room_dashboard_session_secret_123456789",
  ALLOWED_ORIGINS: "https://mmdbkk.com,https://www.mmdbkk.com",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
};

async function issueOwnerCookie() {
  const response = await worker.fetch(new Request("https://mmdbkk.com/internal/admin/login/session", {
    method: "POST",
    headers: {
      Origin: "https://mmdbkk.com",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      credential: ENV.ADMIN_BEARER,
      next: "/internal/admin/control-room",
    }),
  }), ENV, {});
  assert.equal(response.status, 303);
  return (response.headers.get("set-cookie") || "").split(";", 1)[0];
}

test("Control Room dashboard requires the credential-bound browser session", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/dashboard", {
    headers: {
      Origin: "https://mmdbkk.com",
      Authorization: `Bearer ${ENV.ADMIN_BEARER}`,
      "X-Confirm-Key": ENV.CONFIRM_KEY,
    },
  }), ENV, {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});

test("credential-bound owner session reaches the canonical dashboard read model", async () => {
  const Cookie = await issueOwnerCookie();
  const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/dashboard", {
    headers: { Origin: "https://mmdbkk.com", Cookie },
  }), ENV, {});
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "admin-worker");
  assert.equal(payload.layer, "core");
  assert.ok(payload.counts && typeof payload.counts === "object");
  assert.ok(Array.isArray(payload.todos));
});

test("dashboard facade rejects non-production public hosts", async () => {
  const Cookie = await issueOwnerCookie();
  const response = await worker.fetch(new Request("https://admin-worker.malemodel-bkk.workers.dev/v1/admin/dashboard", {
    headers: { Cookie },
  }), ENV, {});
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "dashboard_host_not_allowed");
});
