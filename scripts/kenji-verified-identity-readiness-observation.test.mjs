import assert from "node:assert/strict";
import test from "node:test";

import {
  IDENTITY_EVIDENCE_RECOVERY_SCHEMA,
  VERIFIED_IDENTITY_OBSERVATION_SCHEMA,
  VERIFIED_IDENTITY_READINESS_SCHEMA,
  runVerifiedIdentityReadinessObservation,
} from "./kenji-verified-identity-readiness-observation.mjs";

const ORIGIN = "https://mmdbkk.com";
const CREDENTIAL = "test-owner-credential-never-log";
const COOKIE = "mmd_admin_gate_v1=test-session-never-log";
const CLIENT_A = "recAAAAAAAAAAAAAA";
const CLIENT_B = "recBBBBBBBBBBBBBB";

const STATE = Object.freeze({
  verified: {
    verified: true,
    alignment: "verified_match",
    canonical: true,
    lineOfc: true,
    liff: true,
    blockers: [],
    nextAction: "none",
    ownerReady: false,
    ownerDecision: false,
    kenjiReady: true,
  },
  ready_for_owner_verification: {
    verified: false,
    alignment: "verified_match",
    canonical: true,
    lineOfc: true,
    liff: true,
    blockers: ["owner_verification_status_required"],
    nextAction: "owner_review_verification_status",
    ownerReady: true,
    ownerDecision: true,
    kenjiReady: false,
  },
  review_required: {
    verified: false,
    alignment: "review_required",
    canonical: true,
    lineOfc: false,
    liff: true,
    blockers: ["reviewed_line_ofc_required"],
    nextAction: "review_identity_evidence",
    ownerReady: false,
    ownerDecision: true,
    kenjiReady: false,
  },
  conflict: {
    verified: true,
    alignment: "mismatch",
    canonical: true,
    lineOfc: false,
    liff: true,
    blockers: ["identity_alignment_mismatch"],
    nextAction: "resolve_identity_conflict",
    ownerReady: false,
    ownerDecision: true,
    kenjiReady: false,
  },
  insufficient_evidence: {
    verified: false,
    alignment: "insufficient_evidence",
    canonical: false,
    lineOfc: false,
    liff: false,
    blockers: [
      "canonical_line_identity_required",
      "reviewed_line_ofc_required",
      "verified_liff_session_required",
    ],
    nextAction: "collect_verified_identity_evidence",
    ownerReady: false,
    ownerDecision: true,
    kenjiReady: false,
  },
  unavailable: {
    verified: false,
    alignment: "unavailable",
    canonical: false,
    lineOfc: false,
    liff: false,
    blockers: ["identity_evidence_unavailable"],
    nextAction: "retry_identity_evidence_read",
    ownerReady: false,
    ownerDecision: true,
    kenjiReady: false,
  },
});

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function projection(clientId, status, { dataStatus = "live" } = {}) {
  const state = STATE[status];
  if (!state) throw new Error(`unknown_fixture_status:${status}`);
  const recoveryStatus = {
    verified: "complete",
    ready_for_owner_verification: "owner_review_ready",
    review_required: "evidence_review",
    conflict: "conflict_locked",
    insufficient_evidence: "evidence_required",
    unavailable: "unavailable_locked",
  }[status];
  const priority = {
    complete: "complete",
    owner_review_ready: "p3_owner_decision",
    evidence_review: "p1_evidence_review",
    evidence_required: "p2_evidence_collection",
    conflict_locked: "p0_conflict",
    unavailable_locked: "p0_unavailable",
  }[recoveryStatus];
  const unavailable = recoveryStatus === "unavailable_locked";
  const conflict = recoveryStatus === "conflict_locked";
  const lineStatus = state.lineOfc ? "matched" : status === "review_required" ? "review_required" : conflict ? "mismatch" : "missing";
  const liffStatus = state.liff ? "matched" : "missing";
  const canonicalState = unavailable ? "unavailable" : state.canonical ? "ready" : "required";
  const lineState = unavailable ? "unavailable" : conflict ? "conflict" : lineStatus === "matched" ? "matched" : lineStatus === "review_required" ? "review_required" : "required";
  const liffState = unavailable ? "unavailable" : liffStatus === "matched" ? "matched" : "required";
  const verificationState = state.verified ? "verified" : unavailable ? "unavailable" : recoveryStatus === "owner_review_ready" ? "owner_review_required" : "blocked";
  const recoveryActions = [];
  if (conflict) recoveryActions.push("resolve_identity_conflict");
  else if (unavailable) recoveryActions.push("retry_identity_evidence_read");
  else {
    if (canonicalState !== "ready") recoveryActions.push("restore_canonical_line_identity");
    if (lineState !== "matched") recoveryActions.push("review_line_ofc_evidence");
    if (liffState !== "matched") recoveryActions.push("review_liff_identity_evidence");
    if (recoveryStatus === "owner_review_ready") recoveryActions.push("owner_review_verification_status");
  }
  return {
    ok: true,
    data_status: dataStatus,
    client_id: clientId,
    identity: {
      status: "canonical",
      verified: state.verified,
      display_name: "Private Customer Name",
      private_line_tail: "654321",
      alignment: {
        status: state.alignment,
        canonical_client: { status: state.canonical ? "ready" : "missing", line_tail: "654321" },
        line_ofc: { status: lineStatus, line_tail: "654321" },
        liff: { status: liffStatus, line_tail: "654321" },
      },
      readiness: {
        schema: VERIFIED_IDENTITY_READINESS_SCHEMA,
        mode: "read_only",
        status,
        checked_at: "2026-09-23T00:00:00.000Z",
        authority: {
          verification: "Clients.Verification Status",
          alignment: "customer_identity_alignment_read_only_v1",
          rights: "my_mmd_entitlement_resolver_v1",
        },
        evidence: {
          authoritative_verification_present: state.verified,
          alignment_status: state.alignment,
          canonical_client_ready: state.canonical,
          reviewed_line_ofc_matched: state.lineOfc,
          verified_liff_session_matched: state.liff,
        },
        blockers: [...state.blockers],
        next_action: state.nextAction,
        owner_review_ready: state.ownerReady,
        requires_owner_decision: state.ownerDecision,
        kenji_continuity_ready: state.kenjiReady,
        automatic_verification_allowed: false,
        identity_mutated: false,
        grants_access: false,
        grants_membership: false,
        grants_points: false,
      },
      recovery: {
        schema: IDENTITY_EVIDENCE_RECOVERY_SCHEMA,
        mode: "read_only",
        status: recoveryStatus,
        priority,
        checked_at: "2026-09-23T00:00:00.000Z",
        source_readiness_status: status,
        queue_eligible: recoveryStatus !== "complete",
        owner_review_ready: recoveryStatus === "owner_review_ready",
        evidence: {
          canonical_line_identity: canonicalState,
          reviewed_line_ofc: lineState,
          verified_liff_session: liffState,
          verification_status: verificationState,
        },
        actions: recoveryActions,
        handoff: {
          surface: "customer_360",
          path: "/internal/admin/customer-data",
          client_scope_required: true,
          mutation_control: false,
        },
        authority: {
          verification: "Clients.Verification Status",
          alignment: "customer_identity_alignment_read_only_v1",
          rights: "my_mmd_entitlement_resolver_v1",
          recovery: "identity_evidence_recovery_read_only_v1",
        },
        automatic_recovery_allowed: false,
        automatic_verification_allowed: false,
        verification_status_mutated: false,
        identity_mutated: false,
        customer_send_allowed: false,
        grants_access: false,
        grants_membership: false,
        grants_points: false,
      },
    },
  };
}

function mockProduction({ records, projections, loginStatus = 200, calls = [] }) {
  return async (input, options = {}) => {
    const url = new URL(String(input));
    const method = String(options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || {});
    calls.push({ pathname: url.pathname, method, hasCookie: headers.has("cookie") });

    if (url.pathname === "/internal/admin/login/session") {
      return loginStatus === 200
        ? json({ ok: true, actor: { display_name: "Private Owner" } }, 200, { "set-cookie": `${COOKIE}; Path=/; HttpOnly` })
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
      const value = projections.get(clientId);
      return value instanceof Response ? value : json(value);
    }
    return json({ ok: false }, 404);
  };
}

test("reports aggregate owner-review readiness without private output or mutations", async () => {
  const calls = [];
  const fetchImpl = mockProduction({
    calls,
    records: [
      { client_id: CLIENT_A, client_name: "Private Customer Name", phone: "0900000000" },
      { client_id: CLIENT_B, client_name: "Another Private Name" },
    ],
    projections: new Map([
      [CLIENT_A, projection(CLIENT_A, "ready_for_owner_verification")],
      [CLIENT_B, projection(CLIENT_B, "verified", { dataStatus: "empty" })],
    ]),
  });

  const result = await runVerifiedIdentityReadinessObservation({
    origin: ORIGIN,
    credential: CREDENTIAL,
    fetchImpl,
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.schema, VERIFIED_IDENTITY_OBSERVATION_SCHEMA);
  assert.equal(result.status, "owner_review_ready");
  assert.equal(result.healthy, true);
  assert.equal(result.owner_review_ready, true);
  assert.equal(result.scan.checked_count, 2);
  assert.equal(result.readiness.counts.verified, 1);
  assert.equal(result.readiness.counts.ready_for_owner_verification, 1);
  assert.deepEqual(result.readiness.blocker_counts, { owner_verification_status_required: 1 });
  assert.equal(result.recovery.schema, IDENTITY_EVIDENCE_RECOVERY_SCHEMA);
  assert.equal(result.recovery.counts.complete, 1);
  assert.equal(result.recovery.counts.owner_review_ready, 1);
  assert.deepEqual(result.recovery.action_counts, { owner_review_verification_status: 1 });
  assert.equal(result.guardrails.automatic_recovery_possible, false);
  assert.equal(result.guardrails.verification_status_mutated, false);
  assert.equal(result.guardrails.identity_merged, false);
  assert.equal(result.guardrails.customer_send_possible, false);
  for (const privateValue of [
    CREDENTIAL,
    COOKIE,
    CLIENT_A,
    CLIENT_B,
    "Private Customer Name",
    "Another Private Name",
    "0900000000",
    "654321",
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.deepEqual(calls.filter((call) => call.method === "POST").map((call) => call.pathname), [
    "/internal/admin/login/session",
  ]);
});

test("fails closed when any sampled identity evidence conflicts", async () => {
  const fetchImpl = mockProduction({
    records: [{ client_id: CLIENT_A }, { client_id: CLIENT_B }],
    projections: new Map([
      [CLIENT_A, projection(CLIENT_A, "ready_for_owner_verification")],
      [CLIENT_B, projection(CLIENT_B, "conflict")],
    ]),
  });

  const result = await runVerifiedIdentityReadinessObservation({ credential: CREDENTIAL, fetchImpl });
  assert.equal(result.status, "identity_conflict_detected");
  assert.equal(result.healthy, false);
  assert.equal(result.owner_review_ready, false);
  assert.equal(result.readiness.counts.conflict, 1);
  assert.equal(result.recovery.counts.conflict_locked, 1);
  assert.equal(result.recovery.action_counts.resolve_identity_conflict, 1);
  assert.deepEqual(result.readiness.blocker_counts, {
    identity_alignment_mismatch: 1,
    owner_verification_status_required: 1,
  });
});

test("marks unavailable evidence and endpoint failures as degraded", async () => {
  const fetchImpl = mockProduction({
    records: [{ client_id: CLIENT_A }, { client_id: CLIENT_B }],
    projections: new Map([
      [CLIENT_A, projection(CLIENT_A, "unavailable")],
      [CLIENT_B, json({ ok: false, private_detail: "Never emit" }, 503)],
    ]),
  });

  const result = await runVerifiedIdentityReadinessObservation({ credential: CREDENTIAL, fetchImpl });
  assert.equal(result.status, "observation_degraded");
  assert.equal(result.healthy, false);
  assert.equal(result.scan.endpoint_error_count, 1);
  assert.deepEqual(result.scan.endpoint_error_buckets, { server_error: 1 });
  assert.equal(result.readiness.counts.unavailable, 1);
  assert.equal(JSON.stringify(result).includes("Never emit"), false);
});

test("rejects inconsistent readiness as a contract violation", async () => {
  const malformed = projection(CLIENT_A, "verified");
  malformed.identity.readiness.evidence.authoritative_verification_present = false;
  malformed.identity.readiness.automatic_verification_allowed = true;
  const fetchImpl = mockProduction({
    records: [{ client_id: CLIENT_A }],
    projections: new Map([[CLIENT_A, malformed]]),
  });

  const result = await runVerifiedIdentityReadinessObservation({ credential: CREDENTIAL, fetchImpl });
  assert.equal(result.status, "contract_violation");
  assert.equal(result.healthy, false);
  assert.equal(result.scan.contract_violation_count, 1);
  assert.equal(result.readiness.counts.verified, 0);
  assert.equal(JSON.stringify(result).includes(CLIENT_A), false);
});

test("rejects an identity recovery projection that permits automatic mutation", async () => {
  const malformed = projection(CLIENT_A, "insufficient_evidence");
  malformed.identity.recovery.automatic_recovery_allowed = true;
  malformed.identity.recovery.verification_status_mutated = true;
  malformed.identity.recovery.actions = ["owner_review_verification_status"];
  const fetchImpl = mockProduction({
    records: [{ client_id: CLIENT_A }],
    projections: new Map([[CLIENT_A, malformed]]),
  });

  const result = await runVerifiedIdentityReadinessObservation({ credential: CREDENTIAL, fetchImpl });
  assert.equal(result.status, "contract_violation");
  assert.equal(result.healthy, false);
  assert.equal(result.scan.contract_violation_count, 1);
  assert.equal(result.recovery.counts.evidence_required, 0);
  assert.equal(JSON.stringify(result).includes(CLIENT_A), false);
});

test("bounds scans and never emits rejected login details", async () => {
  const rejectedFetch = mockProduction({
    records: [],
    projections: new Map(),
    loginStatus: 401,
  });
  await assert.rejects(
    runVerifiedIdentityReadinessObservation({ credential: CREDENTIAL, fetchImpl: rejectedFetch }),
    (error) => error?.code === "owner_login_rejected" && !error.message.includes("Private rejection detail"),
  );

  const records = Array.from({ length: 30 }, (_, index) => ({
    client_id: `rec${String(index).padStart(14, "0")}`,
    client_name: `Private ${index}`,
  }));
  const projections = new Map(
    records.map((record) => [record.client_id, projection(record.client_id, "insufficient_evidence")]),
  );
  const calls = [];
  const boundedFetch = mockProduction({ records, projections, calls });
  const result = await runVerifiedIdentityReadinessObservation({
    credential: CREDENTIAL,
    scanLimit: 999,
    fetchImpl: boundedFetch,
  });

  assert.equal(result.status, "identity_evidence_pending");
  assert.equal(result.healthy, true);
  assert.equal(result.scan.limit, 24);
  assert.equal(result.scan.checked_count, 24);
  assert.equal(calls.filter((call) => call.pathname === "/v1/admin/clients/intelligence").length, 24);
  assert.equal(result.recovery.counts.evidence_required, 24);
  assert.equal(result.recovery.action_counts.review_line_ofc_evidence, 24);
  assert.equal(result.recovery.action_counts.review_liff_identity_evidence, 24);
});
