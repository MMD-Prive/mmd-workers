import test from "node:test";
import assert from "node:assert/strict";

import {
  OWNER_MY_MMD_RECOVERY_RPC_PATH,
  handleOwnerMyMmdRecoveryDiagnosticRpc,
} from "../src/owner-my-mmd-recovery-diagnostic.js";

const LINE_ID = `U${"a".repeat(32)}`;
const SECRET = "s".repeat(64);

function internalRequest(body = { line_user_id: LINE_ID }, caller = "admin-worker", host = "member-pages-worker.internal") {
  return new Request(`https://${host}${OWNER_MY_MMD_RECOVERY_RPC_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": caller,
    },
    body: JSON.stringify(body),
  });
}

function env() {
  return {
    LIFF_SESSION_SECRET: SECRET,
    LIFF_IDENTITY_KV: {
      async get(key, format) {
        assert.equal(format, "json");
        if (String(key).startsWith("history-recovery:v2:status:")) {
          return {
            state: "reconciled",
            reason: "note_first_recovery_complete",
            current_points_total: 1250,
            pending_review_count: 0,
            source_note_count: 14,
            candidate_count: 9,
            materialized_count: 8,
            updated_at: "2026-09-19T12:00:00.000Z",
          };
        }
        if (String(key).startsWith("ops:my-mmd:acceptance:")) {
          return {
            version: 1,
            evidence_id: "mmdacc_1234567890abcdef12345678",
            result: "protected_member_resolved",
            tier: "svip",
            tier_source: "my_mmd_entitlement_resolver_v1",
            recorded_at: "2026-09-19T11:30:00.000Z",
            contains_raw_line_id: false,
            contains_session_token: false,
          };
        }
        if (String(key).startsWith("my-mmd:protected-active-through:v1:")) {
          return {
            version: 1,
            active_through: "2028-09-19",
            contains_raw_line_id: false,
          };
        }
        return null;
      },
    },
    MEMBER_STATUS_RESOLVER_SECRET: "r".repeat(64),
    MEMBER_STATUS_RESOLVER: {
      async fetch(request) {
        assert.equal(new URL(request.url).pathname, "/__internal/member-profile/read");
        const body = await request.json();
        assert.equal(body.line_user_id, LINE_ID);
        return Response.json({
          ok: true,
          data: {
            member_exists: true,
            member_id: "mem_test_chen",
            profile: {
              display_name: "เชน",
              membership_status: "active",
              customer_360: {
                member: { membership_status: "active" },
                points: { status: "verified", active_points: 999 },
              },
            },
            entitlement_snapshot: {
              schema_version: "my_mmd_entitlement_resolver_v1",
              source_status: "verified",
              fail_closed: true,
              member_blocked: false,
              capability_state: {
                active: ["svip"],
                grace: [],
                inactive: [],
                recognized: ["svip"],
              },
              access: {
                protected_capabilities_active: ["svip"],
                protected_capabilities_grace: [],
                public_service_access: true,
              },
              entitlements: [{
                capability: "svip",
                lifecycle: "active",
                start_at: null,
                expire_at: null,
              }],
            },
          },
        });
      },
    },
  };
}

test("service-only diagnostic returns reconciled truth without raw LINE identity", async () => {
  const response = await handleOwnerMyMmdRecoveryDiagnosticRpc(internalRequest(), env());
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.ok, true);
  assert.equal(body.membership.label, "SVIP");
  assert.equal(body.membership.active_through, "2028-09-19");
  assert.equal(body.recovery.state, "reconciled");
  assert.equal(body.recovery.terminal, true);
  assert.equal(body.points.value, 1250);
  assert.equal(body.points.source, "history_recovery");
  assert.equal(body.acceptance.evidence_id, "mmdacc_1234567890abcdef12345678");
  assert.equal(body.guardrails.raw_line_user_id_exposed, false);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(LINE_ID));
});

test("diagnostic is invisible on public host or from wrong service caller", async () => {
  const publicHost = await handleOwnerMyMmdRecoveryDiagnosticRpc(
    internalRequest({ line_user_id: LINE_ID }, "admin-worker", "mmdbkk.com"),
    env(),
  );
  assert.equal(publicHost.status, 404);

  const wrongCaller = await handleOwnerMyMmdRecoveryDiagnosticRpc(
    internalRequest({ line_user_id: LINE_ID }, "telegram-worker"),
    env(),
  );
  assert.equal(wrongCaller.status, 404);
});

test("pending recovery never reports canonical-profile zero as final points", async () => {
  const pendingEnv = env();
  pendingEnv.LIFF_IDENTITY_KV = {
    async get(key, format) {
      assert.equal(format, "json");
      if (String(key).startsWith("history-recovery:v2:status:")) {
        return { state: "in_progress", current_points_total: null, updated_at: "2026-09-19T12:00:00.000Z" };
      }
      return null;
    },
  };
  const response = await handleOwnerMyMmdRecoveryDiagnosticRpc(internalRequest(), pendingEnv);
  const body = await response.json();
  assert.equal(body.points.status, "pending");
  assert.equal(body.points.value, null);
});
