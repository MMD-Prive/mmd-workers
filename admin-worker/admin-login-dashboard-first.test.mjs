import assert from "node:assert/strict";
import test from "node:test";

import { enforceOwnerDashboardFirst } from "./src/admin-login-hero-worker.js";
import { ADMIN_OWNER_DASHBOARD_PATH } from "./src/admin-login-hero-worker-core.js";

const loginRequest = (headers = {}) => new Request(
  "https://mmdbkk.com/internal/admin/login/session",
  { method: "POST", headers },
);

function sessionHeaders(role = "admin", next = "") {
  return {
    "x-mmd-admin-login": "session-created",
    "x-mmd-admin-role": role,
    "x-mmd-admin-next": next,
    "set-cookie": "mmd_admin_gate_v1=test; Path=/; HttpOnly; Secure; SameSite=Lax",
  };
}

test("owner JSON login without a selected task lands on Console", async () => {
  const input = new Response(
    JSON.stringify({ ok: true, next: "/internal/admin/payments", role: "admin" }),
    {
      status: 200,
      headers: {
        ...sessionHeaders("admin"),
        "content-type": "application/json; charset=utf-8",
      },
    },
  );

  const output = await enforceOwnerDashboardFirst(loginRequest({ "x-mmd-login-fetch": "1" }), input);
  const body = await output.json();

  assert.equal(ADMIN_OWNER_DASHBOARD_PATH, "/internal/admin/console");
  assert.equal(body.next, "/internal/admin/console");
  assert.equal(output.headers.get("x-mmd-admin-next"), "/internal/admin/console");
  assert.equal(output.headers.get("x-mmd-admin-post-login"), "console-first");
  assert.match(output.headers.get("set-cookie") || "", /mmd_admin_gate_v1=test/);
});

test("owner redirect login without a selected task lands on Console", async () => {
  const input = new Response(null, {
    status: 303,
    headers: {
      ...sessionHeaders("admin"),
      location: "https://mmdbkk.com/internal/admin/payments",
    },
  });

  const output = await enforceOwnerDashboardFirst(loginRequest(), input);
  assert.equal(output.status, 303);
  assert.equal(output.headers.get("location"), "https://mmdbkk.com/internal/admin/console");
  assert.equal(output.headers.get("x-mmd-admin-next"), "/internal/admin/console");
});

test("MMS partner keeps the dedicated MMS landing page", async () => {
  const input = new Response(
    JSON.stringify({ ok: true, next: "/internal/admin/mms", role: "mms_partner" }),
    {
      status: 200,
      headers: {
        ...sessionHeaders("mms_partner", "/internal/admin/mms"),
        "content-type": "application/json; charset=utf-8",
      },
    },
  );

  const output = await enforceOwnerDashboardFirst(loginRequest({ "x-mmd-login-fetch": "1" }), input);
  const body = await output.json();
  assert.equal(body.next, "/internal/admin/mms");
  assert.equal(output.headers.get("x-mmd-admin-next"), "/internal/admin/mms");
  assert.equal(output.headers.get("x-mmd-admin-post-login"), null);
});

test("non-login responses are untouched", async () => {
  const request = new Request("https://mmdbkk.com/internal/admin/payments");
  const input = new Response("ok", { status: 200, headers: { "x-test": "keep" } });
  const output = await enforceOwnerDashboardFirst(request, input);
  assert.equal(output, input);
  assert.equal(await output.text(), "ok");
});


test("owner login resumes the exact Refund Ops task", async () => {
  const refundNext = "/internal/admin/refunds?inbox_id=refund_manual_man_20260929_pay_mulcs8o4&action=upload";
  const input = new Response(null, {
    status: 303,
    headers: {
      ...sessionHeaders("owner"),
      "x-mmd-admin-next": refundNext,
      location: refundNext,
    },
  });

  const output = await enforceOwnerDashboardFirst(loginRequest(), input);
  assert.equal(output.status, 303);
  assert.equal(output.headers.get("location"), "https://mmdbkk.com" + refundNext);
  assert.equal(output.headers.get("x-mmd-admin-next"), refundNext);
  assert.equal(output.headers.get("x-mmd-admin-post-login"), "resume-refund-ops");
});
