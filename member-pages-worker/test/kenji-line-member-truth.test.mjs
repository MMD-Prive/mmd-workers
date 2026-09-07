import assert from "node:assert/strict";
import test from "node:test";
import {
  handleKenjiLineMemberTruth,
  projectKenjiLineMemberTruth,
} from "../src/kenji-line-member-truth.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const TEST_KEY = "x".repeat(40);

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
