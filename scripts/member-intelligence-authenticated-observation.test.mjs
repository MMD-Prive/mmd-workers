import assert from "node:assert/strict";
import test from "node:test";

import {
  OBSERVATION_SCHEMA,
  runAuthenticatedObservation,
} from "./member-intelligence-authenticated-observation.mjs";

const ORIGIN = "https://mmdbkk.com";
const CREDENTIAL = "test-owner-credential-never-log";
const COOKIE = "mmd_admin_gate_v1=test-session-never-log";
const CLIENT_A = "recAAAAAAAAAAAAAA";
const CLIENT_B = "recBBBBBBBBBBBBBB";

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function availableProjection(clientId, overrides = {}) {
  const base = {
    ok: true,
    data_status: "live",
    client_id: clientId,
    identity: {
      status: "canonical",
      verified: true,
      display_name: "Private Customer Name",
      readiness: {
        schema: "mmd.kenji_verified_identity_readiness.v1",
        mode: "read_only",
        status: "verified",
        authority: {
          verification: "Clients.Verification Status",
          alignment: "customer_identity_alignment_read_only_v1",
          rights: "my_mmd_entitlement_resolver_v1",
        },
        evidence: {
          authoritative_verification_present: true,
          alignment_status: "verified_match",
          canonical_client_ready: true,
          reviewed_line_ofc_matched: true,
          verified_liff_session_matched: true,
        },
        blockers: [],
        next_action: "none",
        owner_review_ready: false,
        requires_owner_decision: false,
        kenji_continuity_ready: true,
        automatic_verification_allowed: false,
        identity_mutated: false,
        grants_access: false,
        grants_membership: false,
        grants_points: false,
      },
    },
    ai: {
      advisory_only: true,
      suggested_reply: {
        schema: "mmd.kenji_continuity_operator_draft.v1",
        mode: "operator_draft",
        available: true,
        text: "คุณลูกค้าครับ ผมต่อจากเรื่องเดิมให้ได้เลยครับ ขอเช็กบริบทล่าสุดอีกครั้งก่อนตอบต่อนะครับ",
        channel: "line",
        send_allowed: false,
        requires_owner_review: true,
        reason: "operator_review_required",
        applies: {
          preferred_name: true,
          returning_tone: true,
          continuity_acknowledgement: true,
        },
        guardrails: {
          customer_auto_send: false,
          business_truth_claims: false,
          memory_is_context_only: true,
          protected_truth_refresh_required: false,
        },
      },
      continuity_status: {
        source: "conversation_matrix",
        source_status: "live",
        freshness: "fresh",
        context_only: true,
        live_truth_wins: true,
      },
      runtime_controls: {
        status: "live",
        line_oa_kill_switch: "clear",
        all_mutations_kill_switch: "clear",
        operator_copy_allowed: true,
        reason: "clear",
      },
    },
    authority: { ai: "advisory" },
  };
  return deepMerge(base, overrides);
}

function unavailableProjection(clientId, reason = "active_matrix_required") {
  return {
    ok: true,
    data_status: "live",
    client_id: clientId,
    identity: { status: "canonical", verified: true, display_name: "Another Private Name" },
    ai: {
      advisory_only: true,
      suggested_reply: {
        schema: "mmd.kenji_continuity_operator_draft.v1",
        mode: "operator_draft",
        available: false,
        text: null,
        channel: "line",
        send_allowed: false,
        requires_owner_review: true,
        reason,
        applies: {
          preferred_name: false,
          returning_tone: false,
          continuity_acknowledgement: false,
        },
        guardrails: {
          customer_auto_send: false,
          business_truth_claims: false,
          memory_is_context_only: true,
          protected_truth_refresh_required: false,
        },
      },
    },
    authority: { ai: "advisory" },
  };
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch === undefined ? base : patch;
  const output = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    output[key] = value && typeof value === "object" && !Array.isArray(value)
      ? deepMerge(base?.[key] && typeof base[key] === "object" ? base[key] : {}, value)
      : value;
  }
  return output;
}

function mockProduction({ records, projections, loginStatus = 200, calls = [] }) {
  return async (input, options = {}) => {
    const url = new URL(String(input));
    const method = String(options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || {});
    calls.push({ pathname: url.pathname, method, hasCookie: headers.has("cookie") });

    if (url.pathname === "/internal/admin/login/session") {
      return loginStatus === 200
        ? json({ ok: true, actor: { display_name: "Do Not Emit" } }, 200, { "set-cookie": `${COOKIE}; Path=/; HttpOnly` })
        : json({ ok: false, detail: "Private rejection detail" }, loginStatus);
    }
    if (url.pathname === "/v1/admin/clients/recent" && !headers.has("cookie")) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    if (url.pathname === "/v1/admin/clients/recent") {
      return json({ ok: true, records });
    }
    if (url.pathname === "/v1/admin/clients/intelligence") {
      const clientId = url.searchParams.get("client_id");
      const projection = projections.get(clientId);
      return projection instanceof Response ? projection : json(projection);
    }
    return json({ ok: false }, 404);
  };
}

test("finds an acceptance-ready draft without mutations or private output", async () => {
  const calls = [];
  const fetchImpl = mockProduction({
    calls,
    records: [
      { client_id: CLIENT_A, client_name: "Private Customer Name", phone: "0900000000" },
      { client_id: CLIENT_B, client_name: "Another Private Name" },
    ],
    projections: new Map([
      [CLIENT_A, availableProjection(CLIENT_A)],
      [CLIENT_B, unavailableProjection(CLIENT_B)],
    ]),
  });

  const result = await runAuthenticatedObservation({ origin: ORIGIN, credential: CREDENTIAL, fetchImpl });
  const serialized = JSON.stringify(result);

  assert.equal(result.schema, OBSERVATION_SCHEMA);
  assert.equal(result.status, "human_acceptance_ready");
  assert.equal(result.healthy, true);
  assert.equal(result.human_acceptance_ready, true);
  assert.equal(result.scan.checked_count, 2);
  assert.equal(result.drafts.safe_available_count, 1);
  assert.equal(result.drafts.acceptance_ready_count, 1);
  assert.equal(result.guardrails.feedback_submitted, false);
  assert.equal(result.guardrails.copy_performed, false);
  assert.equal(result.guardrails.audit_written, false);
  for (const privateValue of [CREDENTIAL, COOKIE, CLIENT_A, CLIENT_B, "Private Customer Name", "0900000000", "คุณลูกค้าครับ"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  assert.deepEqual(calls.filter((call) => call.method === "POST").map((call) => call.pathname), ["/internal/admin/login/session"]);
  assert.equal(calls.some((call) => call.pathname.includes("audit")), false);
});

test("reports absence of an eligible draft as a healthy observation", async () => {
  const fetchImpl = mockProduction({
    records: [{ client_id: CLIENT_A, client_name: "Never Emit" }],
    projections: new Map([[CLIENT_A, unavailableProjection(CLIENT_A, "continuity_stale")]]),
  });

  const result = await runAuthenticatedObservation({ credential: CREDENTIAL, fetchImpl });
  assert.equal(result.status, "no_current_eligible_draft");
  assert.equal(result.healthy, true);
  assert.equal(result.human_acceptance_ready, false);
  assert.deepEqual(result.drafts.unavailable_reasons, { continuity_stale: 1 });
});

test("keeps a safe draft locked when runtime copy controls are not clear", async () => {
  const locked = availableProjection(CLIENT_A, {
    ai: {
      runtime_controls: {
        status: "live",
        line_oa_kill_switch: "active",
        all_mutations_kill_switch: "clear",
        operator_copy_allowed: false,
        reason: "kill_switch_active",
      },
    },
  });
  const fetchImpl = mockProduction({
    records: [{ client_id: CLIENT_A }],
    projections: new Map([[CLIENT_A, locked]]),
  });

  const result = await runAuthenticatedObservation({ credential: CREDENTIAL, fetchImpl });
  assert.equal(result.status, "safe_draft_not_copy_ready");
  assert.equal(result.healthy, true);
  assert.equal(result.drafts.safe_available_count, 1);
  assert.equal(result.drafts.acceptance_ready_count, 0);
});

test("fails closed when an available draft violates the safety contract", async () => {
  const unsafe = availableProjection(CLIENT_A, {
    ai: { suggested_reply: { send_allowed: true } },
  });
  const fetchImpl = mockProduction({
    records: [{ client_id: CLIENT_A }],
    projections: new Map([[CLIENT_A, unsafe]]),
  });

  const result = await runAuthenticatedObservation({ credential: CREDENTIAL, fetchImpl });
  assert.equal(result.status, "contract_violation");
  assert.equal(result.healthy, false);
  assert.equal(result.drafts.safety_contract_violation_count, 1);
  assert.equal(JSON.stringify(result).includes(unsafe.ai.suggested_reply.text), false);
});

test("fails closed when a verified draft lacks exact identity readiness", async () => {
  const unsafe = availableProjection(CLIENT_A, {
    identity: {
      readiness: {
        status: "conflict",
        next_action: "resolve_identity_conflict",
        evidence: { alignment_status: "mismatch" },
        blockers: ["identity_alignment_mismatch"],
        requires_owner_decision: true,
        kenji_continuity_ready: false,
      },
    },
  });
  const fetchImpl = mockProduction({
    records: [{ client_id: CLIENT_A }],
    projections: new Map([[CLIENT_A, unsafe]]),
  });

  const result = await runAuthenticatedObservation({ credential: CREDENTIAL, fetchImpl });
  assert.equal(result.status, "contract_violation");
  assert.equal(result.healthy, false);
  assert.equal(result.drafts.safety_contract_violation_count, 1);
  assert.equal(JSON.stringify(result).includes(CLIENT_A), false);
});

test("marks even a partial intelligence endpoint failure as degraded", async () => {
  const fetchImpl = mockProduction({
    records: [{ client_id: CLIENT_A }, { client_id: CLIENT_B }],
    projections: new Map([
      [CLIENT_A, availableProjection(CLIENT_A)],
      [CLIENT_B, json({ ok: false, private_detail: "Never emit this" }, 503)],
    ]),
  });

  const result = await runAuthenticatedObservation({ credential: CREDENTIAL, fetchImpl });
  assert.equal(result.status, "observation_degraded");
  assert.equal(result.healthy, false);
  assert.equal(result.scan.endpoint_error_count, 1);
  assert.deepEqual(result.scan.endpoint_error_buckets, { server_error: 1 });
  assert.equal(JSON.stringify(result).includes("Never emit this"), false);
});

test("fails closed on an HTTP-200 degraded projection", async () => {
  const degraded = {
    ...unavailableProjection(CLIENT_A),
    data_status: "degraded",
  };
  const fetchImpl = mockProduction({
    records: [{ client_id: CLIENT_A }],
    projections: new Map([[CLIENT_A, degraded]]),
  });

  const result = await runAuthenticatedObservation({ credential: CREDENTIAL, fetchImpl });
  assert.equal(result.status, "observation_degraded");
  assert.equal(result.healthy, false);
  assert.equal(result.projections.degraded, 1);
  assert.equal(result.scan.degraded_projection_count, 1);
  assert.equal(result.drafts.unavailable_count, 0);
});

test("rejects a malformed unavailable-draft projection", async () => {
  const malformed = {
    ok: true,
    data_status: "live",
    client_id: CLIENT_A,
    ai: {
      advisory_only: true,
      suggested_reply: {
        available: false,
        reason: "active_matrix_required",
      },
    },
    authority: { ai: "advisory" },
  };
  const fetchImpl = mockProduction({
    records: [{ client_id: CLIENT_A }],
    projections: new Map([[CLIENT_A, malformed]]),
  });

  const result = await runAuthenticatedObservation({ credential: CREDENTIAL, fetchImpl });
  assert.equal(result.status, "contract_violation");
  assert.equal(result.healthy, false);
  assert.equal(result.scan.response_contract_violation_count, 1);
  assert.equal(result.drafts.unavailable_count, 0);
  assert.equal(JSON.stringify(result).includes(CLIENT_A), false);
});

test("bounds scans and never emits rejected login details", async () => {
  const calls = [];
  const rejectedFetch = mockProduction({
    calls,
    records: [],
    projections: new Map(),
    loginStatus: 401,
  });
  await assert.rejects(
    runAuthenticatedObservation({ credential: CREDENTIAL, fetchImpl: rejectedFetch }),
    (error) => error?.code === "owner_login_rejected" && !error.message.includes("Private rejection detail"),
  );

  const records = Array.from({ length: 30 }, (_, index) => ({
    client_id: `rec${String(index).padStart(14, "0")}`,
    client_name: `Private ${index}`,
  }));
  const projections = new Map(records.map((record) => [record.client_id, unavailableProjection(record.client_id)]));
  const boundedCalls = [];
  const boundedFetch = mockProduction({ records, projections, calls: boundedCalls });
  const result = await runAuthenticatedObservation({ credential: CREDENTIAL, scanLimit: 999, fetchImpl: boundedFetch });

  assert.equal(result.scan.limit, 24);
  assert.equal(result.scan.checked_count, 24);
  assert.equal(boundedCalls.filter((call) => call.pathname === "/v1/admin/clients/intelligence").length, 24);
});
