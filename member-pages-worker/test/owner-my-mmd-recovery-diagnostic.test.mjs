import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appTestRecovery123",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        assert.match(decodeURIComponent(url.pathname), /MMD — Identity Merge Requests/);
        return Response.json({ records: [{ id: "recMergeABC123", fields: {
          merge_request_id: "IMR-TEST123",
          status: "review_required",
          line_user_id: LINE_ID,
          identity_email: "chen@example.com",
          identity_phone: "+66812345678",
          match_type: "exact_client_phone",
          match_confidence: 92,
          source_path: "/member/api/liff/recovery",
          created_at: "2026-09-19T11:00:00.000Z",
          updated_at: "2026-09-19T11:05:00.000Z",
          payload_json: JSON.stringify({ state: "review_required", match_type: "exact_client_phone", evidence_sources: ["clients_phone"] }),
          "Candidate Client": ["recClient123456"],
        } }] });
      },
    },
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
  assert.equal(body.identity_recovery_request.request_id, "IMR-TEST123");
  assert.equal(body.identity_recovery_request.submitted.email, "chen@example.com");
  assert.equal(body.identity_recovery_request.matching.match_type, "exact_client_phone");
  assert.equal(body.identity_recovery_request.unresolved, true);
  assert.equal(body.guardrails.raw_line_user_id_exposed, false);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(LINE_ID));
});

test("owner can open an unresolved recovery request by reference without a canonical client", async () => {
  const response = await handleOwnerMyMmdRecoveryDiagnosticRpc(
    internalRequest({ merge_request_id: "IMR-TEST123" }),
    env(),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.identity_recovery_request.request_id, "IMR-TEST123");
  assert.equal(body.identity_recovery_request.submitted.email, "chen@example.com");
  assert.equal(body.identity_recovery_request.unresolved, true);
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

test("LINE OFC Points remain visible when the Member profile is unavailable, without inferring membership", async () => {
  const missingProfile = env();
  missingProfile.MEMBER_STATUS_RESOLVER.fetch = async () => Response.json({ ok: false, error: { code: "MEMBER_NOT_FOUND" } }, { status: 404 });
  const response = await handleOwnerMyMmdRecoveryDiagnosticRpc(internalRequest(), missingProfile);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.membership.status, "unavailable");
  assert.equal(body.membership.level, null);
  assert.equal(body.membership.active_through, null);
  assert.equal(body.points.value, 1250);
  assert.equal(body.points.source, "history_recovery");
  assert.equal(body.guardrails.member_profile_available, false);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(LINE_ID));
});

test("missing profile and incomplete history never report a made-up zero balance", async () => {
  const missingBoth = env();
  missingBoth.MEMBER_STATUS_RESOLVER.fetch = async () => Response.json({ ok: false }, { status: 503 });
  missingBoth.LIFF_IDENTITY_KV.get = async () => null;
  const response = await handleOwnerMyMmdRecoveryDiagnosticRpc(internalRequest(), missingBoth);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.membership.status, "unavailable");
  assert.equal(body.points.status, "pending");
  assert.equal(body.points.value, null);
});




test("active member-pages runtime wires the owner diagnostic before customer session flow", async () => {
  const source = await readFile(new URL("../src/runtime-index.js", import.meta.url), "utf8");
  assert.ok(source.includes('from "./owner-my-mmd-recovery-diagnostic.js"'));
  assert.ok(source.includes("isOwnerMyMmdRecoveryDiagnosticRpc(request)"));
  assert.ok(source.includes("handleOwnerMyMmdRecoveryDiagnosticRpc(request, env)"));
  const diagnosticIndex = source.indexOf("isOwnerMyMmdRecoveryDiagnosticRpc(request)");
  const customerFlowIndex = source.indexOf("const shellBoundary = createLiffShellBoundaryTrace");
  assert.ok(diagnosticIndex >= 0 && customerFlowIndex >= 0 && diagnosticIndex < customerFlowIndex);
});


test('reviewed owner refresh bypasses stale preload and reads back refreshed points', async()=>{
  let calls=0;
  const res=await handleOwnerMyMmdRecoveryDiagnosticRpc(internalRequest({line_user_id:LINE_ID,refresh_reviewed:true}),env(),{runRecovery:async input=>{
    calls++;assert.equal(input.lineUserId,LINE_ID);assert.equal(input.forceSourceRefresh,true);
    return {state:'reconciled',current_points_total:1500,pending_review_count:0};
  }});
  const body=await res.json();assert.equal(calls,1);assert.equal(body.points.value,1500);assert.equal(body.guardrails.read_only,false);
});

test('refresh failure never returns stale points as successful', async()=>{
  const res=await handleOwnerMyMmdRecoveryDiagnosticRpc(internalRequest({line_user_id:LINE_ID,refresh_reviewed:true}),env(),{runRecovery:async()=>({state:'blocked',reason:'AIRTABLE_UNAVAILABLE'})});
  assert.equal(res.status,503);assert.equal((await res.json()).ok,false);
});

test('public refresh cannot reach the recovery runner',async()=>{
  let calls=0;
  const res=await handleOwnerMyMmdRecoveryDiagnosticRpc(internalRequest({line_user_id:LINE_ID,refresh_reviewed:true},'admin-worker','www.mmdbkk.com'),env(),{runRecovery:async()=>{calls++;}});
  assert.equal(res.status,404);assert.equal(calls,0);
});

test("legacy hyphenated applied request is read by exact reference with a GET only", async () => {
  const legacy = "IMR-FIXTURE-MEMBERSHIP-20260923";
  const reads = [];
  const response = await handleOwnerMyMmdRecoveryDiagnosticRpc(internalRequest({ merge_request_id: legacy }), {
    AIRTABLE_API_KEY: "fixture-key",
    AIRTABLE_BASE_ID: "appFixture",
    AIRTABLE_HTTP: { async fetch(req) {
      reads.push([req.method, new URL(req.url).searchParams.get("filterByFormula")]);
      return Response.json({ records: [{ fields: { merge_request_id: legacy, status: "applied", line_user_id: LINE_ID } }] });
    } },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(reads, [["GET", `{merge_request_id}='${legacy}'`]]);
  assert.equal(body.identity_recovery_request.found, true);
  assert.equal(body.identity_recovery_request.request_id, legacy);
  assert.equal(body.identity_recovery_request.status, "applied");
  assert.equal(body.guardrails.read_only, true);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(LINE_ID));
});
