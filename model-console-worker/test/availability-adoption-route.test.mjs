import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

test("owner Model Console reminder resolves exact canonical model and delegates to internal adoption boundary", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    calls.push({
      url: url.toString(),
      method: request.method,
      authorization: request.headers.get("authorization"),
      binding: request.headers.get("x-mmd-service-binding"),
    });

    if (url.pathname === "/v1/admin/auth/me") {
      return Response.json({ ok: true, operator: { id: "owner-test", role: "owner" } });
    }
    if (url.pathname === "/v1/admin/models/list") {
      return Response.json({
        ok: true,
        items: [{
          id: "recModel1234567890",
          fields: {
            unique_key: "mdl_pri_str_master",
            working_name: "Master",
            status: "active",
          },
        }],
      });
    }
    if (url.pathname === "/v1/internal/sigil/availability-adoption/remind") {
      assert.equal(request.method, "POST");
      assert.equal(request.headers.get("x-mmd-service-binding"), "model-console-worker");
      assert.equal(request.headers.get("authorization"), "Bearer internal-secret");
      assert.deepEqual(await request.json(), { model_key: "mdl_pri_str_master" });
      return Response.json({
        ok: true,
        schema: "mmd.availability_adoption_reminder.v1",
        model_key: "mdl_pri_str_master",
        channel: "line",
      });
    }
    if (url.pathname === "/v1/admin/model-console/audit") {
      return Response.json({ ok: true });
    }
    throw new Error("unexpected URL " + url.toString());
  };

  try {
    const response = await worker.fetch(new Request(
      "https://model-console-worker.malemodel-bkk.workers.dev/v1/console/models/recModel1234567890/availability-reminder",
      { method: "POST", headers: { cookie: "mmd_admin_gate_v1=test" } },
    ), {
      SESSION_VALIDATOR_BASE_URL: "https://mmdbkk.com",
      SESSION_VALIDATOR_PATH: "/v1/admin/auth/me",
      ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
      ADMIN_EVENT_LOG_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
      ADMIN_EVENT_LOG_PATH: "/v1/admin/model-console/audit",
      INTERNAL_TOKEN: "internal-secret",
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.model_key, "mdl_pri_str_master");
    assert.equal(body.channel, "line");
    assert.equal(calls.filter(x => new URL(x.url).pathname === "/v1/internal/sigil/availability-adoption/remind").length, 1);
    assert.equal(calls.filter(x => new URL(x.url).pathname === "/v1/admin/model-console/audit").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Model Console public adoption UI stays owner-triggered and has no bulk auto-send action", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /Availability Adoption Phase 2/);
  assert.match(html, /Auto-send ปิดอยู่/);
  assert.match(html, /availability-reminder/);
  assert.match(html, /เตือน LINE/);
  assert.doesNotMatch(html, /เตือนทั้งหมด|sendAll|bulkReminder|autoSendReminder/i);
});
