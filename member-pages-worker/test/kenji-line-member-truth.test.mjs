import assert from "node:assert/strict";
import test from "node:test";
import {
  handleKenjiLineMemberTruth,
  projectKenjiLineMemberTruth,
} from "../src/kenji-line-member-truth.js";
import {
  handleKenjiLineMemberTruthHealth,
  inspectKenjiLineMemberTruthHealth,
} from "../src/kenji-line-member-truth-health.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const TEST_KEY = "x".repeat(40);
const SYNTHETIC_LINE_USER_ID = `U${"0".repeat(32)}`;

function request(headers = {}) {
  return new Request("https://member-pages-worker.internal/__internal/kenji/member-truth", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": "member-dashboard-chat-worker",
      ...headers,
    },
    body: JSON.stringify({ line_user_id: LINE_USER_ID }),
  });
}

function healthRequest(headers = {}) {
  return new Request("https://member-pages-worker.internal/__internal/kenji/member-truth/health", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": "member-dashboard-chat-worker",
      ...headers,
    },
    body: "{}",
  });
}

function verifiedSnapshot() {
  return {
    schema_version: "my_mmd_entitlement_resolver_v1",
    source_status: "verified",
    fail_closed: true,
    member_blocked: false,
    capability_state: {
      active: ["svip"],
      expiring_soon: [],
      grace: [],
      inactive: [],
      recognized: ["svip"],
    },
    access: {
      public_service_access: true,
      private_visibility_envelope: "svip",
    },
    entitlements: [{
      entitlement_id: "internal-row",
      capability: "svip",
      lifecycle: "active",
      expire_at: "",
      source_ref: "internal-source",
    }],
  };
}

function envWith(snapshot = verifiedSnapshot()) {
  return {
    MEMBER_STATUS_RESOLVER_SECRET: TEST_KEY,
    MEMBER_STATUS_RESOLVER: {
      async fetch(req) {
        assert.equal(new URL(req.url).pathname, "/__internal/member-profile/read");
        assert.equal(req.headers.get("x-mmd-member-resolver-secret"), TEST_KEY);
        const body = await req.json();
        assert.equal(body.line_user_id, LINE_USER_ID);
        assert.equal(body.purpose, "liff_member_profile_read");
        return Response.json({
          ok: true,
          data: {
            member_exists: true,
            member_id: "member-test",
            profile: {
              display_name: "Joeka",
              customer_360: {
                points: { status: "verified", active_points: 88 },
              },
            },
            entitlement_snapshot: snapshot,
          },
        });
      },
    },
  };
}

function healthEnv(responseFactory = null) {
  return {
    MEMBER_STATUS_RESOLVER_SECRET: TEST_KEY,
    MEMBER_STATUS_RESOLVER: {
      async fetch(req) {
        assert.equal(new URL(req.url).pathname, "/__internal/member-profile/read");
        assert.equal(req.headers.get("x-mmd-member-resolver-secret"), TEST_KEY);
        const body = await req.json();
        assert.equal(body.line_user_id, SYNTHETIC_LINE_USER_ID);
        assert.equal(body.purpose, "liff_member_profile_read");
        return responseFactory
          ? responseFactory()
          : Response.json({ ok: true, data: { member_exists: false } });
      },
    },
  };
}

test("returns a bounded verified SVIP truth projection without raw LINE identity", async () => {
  const response = await handleKenjiLineMemberTruth(request(), envWith());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.authority, "my_mmd_entitlement_resolver_v1");
  assert.equal(payload.identity_status, "resolved");
  assert.equal(payload.display_name, "Joeka");
  assert.deepEqual(payload.membership, {
    level: "svip",
    label: "SVIP",
    lifecycle: "active",
    expire_at: "",
    public_service_access: true,
    private_visibility_envelope: "svip",
    member_blocked: false,
  });
  assert.deepEqual(payload.points, { status: "verified", active_points: 88 });
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes(LINE_USER_ID), false);
  assert.equal(serialized.includes("internal-row"), false);
  assert.equal(serialized.includes("internal-source"), false);
  assert.equal(serialized.includes(TEST_KEY), false);
});

test("service endpoint is not reachable without the exact internal caller contract", async () => {
  const response = await handleKenjiLineMemberTruth(
    request({ "x-mmd-service-binding": "other-worker" }),
    envWith(),
  );
  assert.equal(response.status, 404);
});

test("fails closed when canonical entitlement snapshot is not verified", async () => {
  const snapshot = { ...verifiedSnapshot(), source_status: "unavailable" };
  const response = await handleKenjiLineMemberTruth(request(), envWith(snapshot));
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.status, "unavailable");
});

test("projection does not turn blocked membership into an active grant", () => {
  const snapshot = { ...verifiedSnapshot(), member_blocked: true };
  const projected = projectKenjiLineMemberTruth({
    profile: { display_name: "Known customer" },
    snapshot,
  });
  assert.equal(projected.membership.lifecycle, "blocked");
  assert.equal(projected.membership.public_service_access, false);
  assert.equal(projected.membership.private_visibility_envelope, "none");
});

test("member truth health proves resolver binding, secret, auth contract, and no-member read without customer data", async () => {
  const response = await handleKenjiLineMemberTruthHealth(healthRequest(), healthEnv());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {
    schema: "mmd.kenji_member_truth_health.v1",
    configured: true,
    resolver_binding_present: true,
    resolver_secret_present: true,
    upstream_http_status: 200,
    ok: true,
    status: "ready",
  });
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes(TEST_KEY), false);
  assert.equal(serialized.includes(SYNTHETIC_LINE_USER_ID), false);
});

test("member truth health distinguishes missing resolver configuration", async () => {
  const health = await inspectKenjiLineMemberTruthHealth({});
  assert.equal(health.ok, false);
  assert.equal(health.status, "resolver_config_missing");
  assert.equal(health.resolver_binding_present, false);
  assert.equal(health.resolver_secret_present, false);
  assert.equal(health.upstream_http_status, 0);
});

test("member truth health distinguishes resolver auth rejection without exposing credentials", async () => {
  const response = await handleKenjiLineMemberTruthHealth(
    healthRequest(),
    healthEnv(() => Response.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 })),
  );
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.status, "resolver_auth_rejected");
  assert.equal(payload.upstream_http_status, 404);
  assert.equal(JSON.stringify(payload).includes(TEST_KEY), false);
});

test("member truth health endpoint is private to the member-dashboard service caller", async () => {
  const response = await handleKenjiLineMemberTruthHealth(
    healthRequest({ "x-mmd-service-binding": "other-worker" }),
    healthEnv(),
  );
  assert.equal(response.status, 404);
});
