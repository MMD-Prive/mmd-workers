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
  assert.equal(payload.control_room_v2?.schema, "mmd.control_room_v2.system_health.v1");
  assert.equal(payload.control_room_v2?.phase1?.status, "CLOSED");
  assert.equal(payload.control_room_v2?.phase1?.blocking_unresolved_count, 0);
  assert.equal(payload.control_room_v2?.phase0?.accepted_workers, 6);
  assert.equal(payload.control_room_v2?.authority?.read_only, true);
  assert.equal(payload.control_room_v2?.operational_watch?.load_mode, "on_demand");
});

test("dashboard facade rejects non-production public hosts", async () => {
  const Cookie = await issueOwnerCookie();
  const response = await worker.fetch(new Request("https://admin-worker.malemodel-bkk.workers.dev/v1/admin/dashboard", {
    headers: { Cookie },
  }), ENV, {});
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "dashboard_host_not_allowed");
});


test("credential-bound owner session can request explicit live system refresh", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://www.mmdbkk.com/") return new Response(null, { status: 200 });
    if (/\/health(?:$|\?)/.test(url) || url.includes("/mmd-shop/api/health") || url.includes("/v1/pay/slip/evidence/health")) {
      return Response.json({
        ok: true,
        analytics: { posthog_authority: "configured", schema: "mmd_authority_v1" },
      }, { status: 200 });
    }
    throw new Error("unexpected_live_probe_url:" + url);
  };
  try {
    const Cookie = await issueOwnerCookie();
    const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/dashboard?system_health=live", {
      headers: { Origin: "https://mmdbkk.com", Cookie },
    }), {
      ...ENV,
      CF_VERSION_METADATA: {
        id: "admin-version-live-test",
        tag: "gha-live-test",
        timestamp: "2026-09-22T09:30:00Z",
      },
    }, {});
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.control_room_v2?.refresh_mode, "live_on_demand");
    assert.equal(payload.control_room_v2?.systems?.find((item) => item.key === "website")?.evidence_type, "live");
    assert.equal(payload.control_room_v2?.systems?.find((item) => item.key === "workers")?.status, "ok");
    assert.equal(payload.control_room_v2?.systems?.find((item) => item.key === "analytics")?.evidence_type, "live");
    assert.equal(payload.control_room_v2?.release?.admin_worker?.id, "admin-version-live-test");
    assert.equal(payload.control_room_v2?.authority?.business_truth_mutated, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
