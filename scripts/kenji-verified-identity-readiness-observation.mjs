import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const VERIFIED_IDENTITY_OBSERVATION_SCHEMA = "mmd.kenji_verified_identity_readiness_observation.v1";
export const VERIFIED_IDENTITY_READINESS_SCHEMA = "mmd.kenji_verified_identity_readiness.v1";
export const IDENTITY_EVIDENCE_RECOVERY_SCHEMA = "mmd.kenji_identity_evidence_recovery.v1";
export const IDENTITY_EVIDENCE_OWNER_REVIEW_PROTOCOL_SCHEMA = "mmd.kenji_identity_evidence_owner_review_protocol.v1";
export const IDENTITY_EVIDENCE_OWNER_REVIEW_ADOPTION_SCHEMA = "mmd.kenji_identity_evidence_owner_review_adoption.v1";

const DEFAULT_ORIGIN = "https://mmdbkk.com";
const MAX_SCAN_LIMIT = 24;
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
const SESSION_COOKIE = /^mmd_admin_gate_v1=[^;\r\n]+$/;
const ALLOWED_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const READINESS_STATUSES = new Set([
  "verified",
  "ready_for_owner_verification",
  "review_required",
  "conflict",
  "insufficient_evidence",
  "unavailable",
]);
const ALIGNMENT_STATUSES = new Set([
  "verified_match",
  "review_required",
  "mismatch",
  "insufficient_evidence",
  "unavailable",
]);
const ALLOWED_BLOCKERS = new Set([
  "identity_alignment_mismatch",
  "identity_evidence_unavailable",
  "canonical_line_identity_required",
  "reviewed_line_ofc_required",
  "verified_liff_session_required",
  "owner_verification_status_required",
]);
const NEXT_ACTIONS = Object.freeze({
  verified: "none",
  ready_for_owner_verification: "owner_review_verification_status",
  review_required: "review_identity_evidence",
  conflict: "resolve_identity_conflict",
  insufficient_evidence: "collect_verified_identity_evidence",
  unavailable: "retry_identity_evidence_read",
});
const RECOVERY_STATUS_BY_READINESS = Object.freeze({
  verified: "complete",
  ready_for_owner_verification: "owner_review_ready",
  review_required: "evidence_review",
  conflict: "conflict_locked",
  insufficient_evidence: "evidence_required",
  unavailable: "unavailable_locked",
});
const RECOVERY_PRIORITIES = Object.freeze({
  complete: "complete",
  owner_review_ready: "p3_owner_decision",
  evidence_review: "p1_evidence_review",
  evidence_required: "p2_evidence_collection",
  conflict_locked: "p0_conflict",
  unavailable_locked: "p0_unavailable",
});
const RECOVERY_ACTIONS = new Set([
  "restore_canonical_line_identity",
  "review_line_ofc_evidence",
  "review_liff_identity_evidence",
  "owner_review_verification_status",
  "resolve_identity_conflict",
  "retry_identity_evidence_read",
]);
const PROTOCOL_STATUS_BY_RECOVERY = Object.freeze({
  complete: "complete",
  owner_review_ready: "owner_review_required",
  evidence_review: "evidence_review_required",
  evidence_required: "evidence_capture_required",
  conflict_locked: "conflict_locked",
  unavailable_locked: "unavailable_locked",
});
const PROTOCOL_STEPS = new Set([
  "capture_canonical_line_identity",
  "review_line_ofc_evidence",
  "capture_verified_liff_session",
  "reread_identity_evidence",
  "owner_review_verification_status",
  "resolve_identity_conflict",
  "restore_identity_evidence_read",
]);

class ObservationError extends Error {
  constructor(code) {
    super(code);
    this.name = "ObservationError";
    this.code = code;
  }
}

function fail(code) {
  throw new ObservationError(code);
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeOrigin(value) {
  let url;
  try {
    url = new URL(clean(value) || DEFAULT_ORIGIN);
  } catch {
    fail("origin_invalid");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") fail("origin_invalid");
  if (!ALLOWED_ORIGINS.has(url.origin)) fail("origin_not_allowed");
  return url.origin;
}

function normalizeScanLimit(value) {
  const parsed = Number.parseInt(String(value ?? MAX_SCAN_LIMIT), 10);
  if (!Number.isFinite(parsed)) return MAX_SCAN_LIMIT;
  return Math.max(1, Math.min(parsed, MAX_SCAN_LIMIT));
}

async function safeFetch(fetchImpl, url, options, errorCode) {
  try {
    return await fetchImpl(url, options);
  } catch {
    fail(errorCode);
  }
}

async function safeJson(response, errorCode) {
  try {
    return await response.json();
  } catch {
    fail(errorCode);
  }
}

function statusBucket(status) {
  if (status === 401 || status === 403) return "authorization_error";
  if (status === 404) return "not_found";
  if (status === 408 || status === 429) return "retryable";
  if (status >= 500) return "server_error";
  return "other_http_error";
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function exactBooleans(value, expected) {
  return Object.entries(expected).every(([key, required]) => value?.[key] === required);
}

function safeReadinessContract(payload) {
  const identity = payload?.identity || {};
  const readiness = identity.readiness || {};
  const authority = readiness.authority || {};
  const evidence = readiness.evidence || {};
  const status = clean(readiness.status).toLowerCase();
  const alignmentStatus = clean(evidence.alignment_status).toLowerCase();
  const blockers = Array.isArray(readiness.blockers) ? readiness.blockers.map((item) => clean(item).toLowerCase()) : [];

  if (identity.status !== "canonical"
    || typeof identity.verified !== "boolean"
    || readiness.schema !== VERIFIED_IDENTITY_READINESS_SCHEMA
    || readiness.mode !== "read_only"
    || !READINESS_STATUSES.has(status)
    || authority.verification !== "Clients.Verification Status"
    || authority.alignment !== "customer_identity_alignment_read_only_v1"
    || authority.rights !== "my_mmd_entitlement_resolver_v1"
    || typeof evidence.authoritative_verification_present !== "boolean"
    || evidence.authoritative_verification_present !== identity.verified
    || !ALIGNMENT_STATUSES.has(alignmentStatus)
    || typeof evidence.canonical_client_ready !== "boolean"
    || typeof evidence.reviewed_line_ofc_matched !== "boolean"
    || typeof evidence.verified_liff_session_matched !== "boolean"
    || blockers.length > 4
    || new Set(blockers).size !== blockers.length
    || blockers.some((item) => !ALLOWED_BLOCKERS.has(item))
    || readiness.next_action !== NEXT_ACTIONS[status]
    || readiness.automatic_verification_allowed !== false
    || readiness.identity_mutated !== false
    || readiness.grants_access !== false
    || readiness.grants_membership !== false
    || readiness.grants_points !== false) return false;

  const exactMatch = alignmentStatus === "verified_match"
    && evidence.canonical_client_ready === true
    && evidence.reviewed_line_ofc_matched === true
    && evidence.verified_liff_session_matched === true;
  const expectedBlockers = [];
  if (status === "conflict") expectedBlockers.push("identity_alignment_mismatch");
  if (status === "unavailable") expectedBlockers.push("identity_evidence_unavailable");
  if (!evidence.canonical_client_ready && status !== "unavailable") expectedBlockers.push("canonical_line_identity_required");
  if (!evidence.reviewed_line_ofc_matched && !["conflict", "unavailable"].includes(status)) {
    expectedBlockers.push("reviewed_line_ofc_required");
  }
  if (!evidence.verified_liff_session_matched && !["conflict", "unavailable"].includes(status)) {
    expectedBlockers.push("verified_liff_session_required");
  }
  if (status === "ready_for_owner_verification") expectedBlockers.push("owner_verification_status_required");
  if (blockers.length !== expectedBlockers.length
    || blockers.some((blocker, index) => blocker !== expectedBlockers[index])) return false;

  if (status === "verified") {
    return identity.verified === true
      && exactMatch
      && blockers.length === 0
      && exactBooleans(readiness, {
        owner_review_ready: false,
        requires_owner_decision: false,
        kenji_continuity_ready: true,
      });
  }
  if (status === "ready_for_owner_verification") {
    return identity.verified === false
      && exactMatch
      && blockers.length === 1
      && blockers[0] === "owner_verification_status_required"
      && exactBooleans(readiness, {
        owner_review_ready: true,
        requires_owner_decision: true,
        kenji_continuity_ready: false,
      });
  }
  if (status === "conflict") {
    return alignmentStatus === "mismatch"
      && blockers.includes("identity_alignment_mismatch")
      && exactBooleans(readiness, {
        owner_review_ready: false,
        requires_owner_decision: true,
        kenji_continuity_ready: false,
      });
  }
  if (status === "review_required") {
    return alignmentStatus === "review_required"
      && exactBooleans(readiness, {
        owner_review_ready: false,
        requires_owner_decision: true,
        kenji_continuity_ready: false,
      });
  }
  if (status === "insufficient_evidence") {
    return alignmentStatus === "insufficient_evidence"
      && exactBooleans(readiness, {
        owner_review_ready: false,
        requires_owner_decision: true,
        kenji_continuity_ready: false,
      });
  }
  return alignmentStatus === "unavailable"
    && blockers.includes("identity_evidence_unavailable")
    && exactBooleans(readiness, {
      owner_review_ready: false,
      requires_owner_decision: true,
      kenji_continuity_ready: false,
    });
}

function safeRecoveryContract(payload) {
  const identity = payload?.identity || {};
  const readiness = identity.readiness || {};
  const alignment = identity.alignment || {};
  const recovery = identity.recovery || {};
  const evidence = recovery.evidence || {};
  const status = RECOVERY_STATUS_BY_READINESS[clean(readiness.status)];
  const unavailable = status === "unavailable_locked";
  const conflict = status === "conflict_locked";
  const canonicalState = unavailable
    ? "unavailable"
    : readiness?.evidence?.canonical_client_ready === true ? "ready" : "required";
  const lineStatus = clean(alignment?.line_ofc?.status);
  const liffStatus = clean(alignment?.liff?.status);
  const lineState = unavailable
    ? "unavailable"
    : conflict ? "conflict"
      : lineStatus === "matched" ? "matched"
        : lineStatus === "review_required" ? "review_required" : "required";
  const liffState = unavailable
    ? "unavailable"
    : liffStatus === "matched" ? "matched"
      : liffStatus === "review_required" ? "review_required" : "required";
  const verificationState = readiness?.evidence?.authoritative_verification_present === true
    ? "verified"
    : unavailable ? "unavailable"
      : status === "owner_review_ready" ? "owner_review_required" : "blocked";
  const expectedActions = [];
  if (conflict) expectedActions.push("resolve_identity_conflict");
  else if (unavailable) expectedActions.push("retry_identity_evidence_read");
  else {
    if (canonicalState !== "ready") expectedActions.push("restore_canonical_line_identity");
    if (lineState !== "matched") expectedActions.push("review_line_ofc_evidence");
    if (liffState !== "matched") expectedActions.push("review_liff_identity_evidence");
    if (status === "owner_review_ready") expectedActions.push("owner_review_verification_status");
  }
  const actions = Array.isArray(recovery.actions) ? recovery.actions.map((item) => clean(item)) : [];

  return Boolean(status)
    && recovery.schema === IDENTITY_EVIDENCE_RECOVERY_SCHEMA
    && recovery.mode === "read_only"
    && recovery.status === status
    && recovery.priority === RECOVERY_PRIORITIES[status]
    && recovery.checked_at === readiness.checked_at
    && recovery.source_readiness_status === readiness.status
    && recovery.queue_eligible === (status !== "complete")
    && recovery.owner_review_ready === (status === "owner_review_ready")
    && evidence.canonical_line_identity === canonicalState
    && evidence.reviewed_line_ofc === lineState
    && evidence.verified_liff_session === liffState
    && evidence.verification_status === verificationState
    && actions.length <= 4
    && new Set(actions).size === actions.length
    && actions.every((action) => RECOVERY_ACTIONS.has(action))
    && actions.length === expectedActions.length
    && actions.every((action, index) => action === expectedActions[index])
    && recovery?.handoff?.surface === "customer_360"
    && recovery?.handoff?.path === "/internal/admin/customer-data"
    && recovery?.handoff?.client_scope_required === true
    && recovery?.handoff?.mutation_control === false
    && recovery?.authority?.verification === "Clients.Verification Status"
    && recovery?.authority?.alignment === "customer_identity_alignment_read_only_v1"
    && recovery?.authority?.rights === "my_mmd_entitlement_resolver_v1"
    && recovery?.authority?.recovery === "identity_evidence_recovery_read_only_v1"
    && recovery.automatic_recovery_allowed === false
    && recovery.automatic_verification_allowed === false
    && recovery.verification_status_mutated === false
    && recovery.identity_mutated === false
    && recovery.customer_send_allowed === false
    && recovery.grants_access === false
    && recovery.grants_membership === false
    && recovery.grants_points === false;
}

function safeEvidenceOwnerReviewProtocolContract(payload) {
  const identity = payload?.identity || {};
  const readiness = identity.readiness || {};
  const recovery = identity.recovery || {};
  const protocol = identity.evidence_protocol || {};
  const capture = protocol.capture || {};
  const review = protocol.review || {};
  const authority = protocol.authority || {};
  const status = PROTOCOL_STATUS_BY_RECOVERY[clean(recovery.status)];
  const unavailable = status === "unavailable_locked";
  const conflict = status === "conflict_locked";
  const canonicalState = unavailable
    ? "unavailable"
    : readiness?.evidence?.canonical_client_ready === true ? "ready" : "capture_required";
  const lineState = unavailable
    ? "unavailable"
    : conflict ? "conflict"
      : recovery?.evidence?.reviewed_line_ofc === "matched" ? "matched"
        : recovery?.evidence?.reviewed_line_ofc === "review_required" ? "review_required" : "capture_required";
  const liffState = unavailable
    ? "unavailable"
    : recovery?.evidence?.verified_liff_session === "matched" ? "matched"
      : recovery?.evidence?.verified_liff_session === "review_required" ? "review_required" : "capture_required";
  const expectedSteps = [];
  if (conflict) expectedSteps.push("resolve_identity_conflict");
  else if (unavailable) expectedSteps.push("restore_identity_evidence_read");
  else if (status === "owner_review_required") {
    expectedSteps.push("reread_identity_evidence", "owner_review_verification_status");
  } else if (status !== "complete") {
    if (canonicalState === "capture_required") expectedSteps.push("capture_canonical_line_identity");
    if (lineState !== "matched") expectedSteps.push("review_line_ofc_evidence");
    if (liffState !== "matched") expectedSteps.push("capture_verified_liff_session");
    expectedSteps.push("reread_identity_evidence");
  }
  const steps = Array.isArray(protocol.steps) ? protocol.steps.map((item) => clean(item)) : [];

  return Boolean(status)
    && protocol.schema === IDENTITY_EVIDENCE_OWNER_REVIEW_PROTOCOL_SCHEMA
    && protocol.mode === "read_only"
    && protocol.status === status
    && protocol.checked_at === readiness.checked_at
    && protocol.source_readiness_status === readiness.status
    && protocol.source_recovery_status === recovery.status
    && protocol.manual_source_capture_required === (status === "evidence_capture_required" || status === "evidence_review_required")
    && capture.canonical_client === canonicalState
    && capture.reviewed_line_ofc === lineState
    && capture.verified_liff_session === liffState
    && steps.length <= 4
    && new Set(steps).size === steps.length
    && steps.every((step) => PROTOCOL_STEPS.has(step))
    && steps.length === expectedSteps.length
    && steps.every((step, index) => step === expectedSteps[index])
    && review.fresh_read_required === true
    && review.verification_status_authority === "Clients.Verification Status"
    && review.owner_decision_required === (status === "owner_review_required")
    && protocol?.handoff?.surface === "customer_360"
    && protocol?.handoff?.path === "/internal/admin/customer-data"
    && protocol?.handoff?.client_scope_required === true
    && protocol?.handoff?.mutation_control === false
    && authority.verification === "Clients.Verification Status"
    && authority.alignment === "customer_identity_alignment_read_only_v1"
    && authority.rights === "my_mmd_entitlement_resolver_v1"
    && authority.protocol === "identity_evidence_owner_review_read_only_v1"
    && protocol.evidence_written === false
    && protocol.automatic_recovery_allowed === false
    && protocol.automatic_verification_allowed === false
    && protocol.verification_status_mutated === false
    && protocol.identity_mutated === false
    && protocol.customer_send_allowed === false
    && protocol.grants_access === false
    && protocol.grants_membership === false
    && protocol.grants_points === false;
}

function classify({ counts, endpointErrors, contractViolations, degradedProjections }) {
  if (contractViolations > 0) return { status: "contract_violation", healthy: false };
  if (endpointErrors > 0 || degradedProjections > 0 || counts.unavailable > 0) {
    return { status: "observation_degraded", healthy: false };
  }
  if (counts.conflict > 0) return { status: "identity_conflict_detected", healthy: false };
  if (counts.ready_for_owner_verification > 0) return { status: "owner_review_ready", healthy: true };
  if (counts.verified > 0 && Object.values(counts).reduce((sum, value) => sum + value, 0) === counts.verified) {
    return { status: "verified_identity_ready", healthy: true };
  }
  if (Object.values(counts).some((value) => value > 0)) return { status: "identity_evidence_pending", healthy: true };
  return { status: "no_current_candidates", healthy: true };
}

export function deriveOwnerEvidenceReviewAdoption({
  status,
  healthy,
  scan,
  owner_review_protocol: ownerReviewProtocol,
}) {
  const counts = ownerReviewProtocol?.counts || {};
  const number = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const ownerReviewDue = number(counts.owner_review_required);
  const evidenceWorkPending = number(counts.evidence_review_required) + number(counts.evidence_capture_required);
  const locked = number(counts.conflict_locked) + number(counts.unavailable_locked);
  const complete = number(counts.complete);
  const candidates = number(scan?.candidate_count);
  const checked = number(scan?.checked_count);

  let adoptionStatus = "no_current_candidates";
  if (healthy !== true) adoptionStatus = status === "identity_conflict_detected" ? "blocked_conflict" : "observation_degraded";
  else if (ownerReviewDue > 0) adoptionStatus = "owner_review_due";
  else if (evidenceWorkPending > 0) adoptionStatus = "evidence_work_pending";
  else if (complete > 0) adoptionStatus = "no_owner_action";

  return {
    schema: IDENTITY_EVIDENCE_OWNER_REVIEW_ADOPTION_SCHEMA,
    mode: "aggregate_read_only",
    status: adoptionStatus,
    cadence: "weekly",
    observation_source: "kenji_verified_identity_readiness",
    queue: {
      candidates_checked: checked,
      owner_review_due: ownerReviewDue,
      evidence_work_pending: evidenceWorkPending,
      locked,
      complete,
      client_scope_required: true,
      handoff_path: "/internal/admin/member-intelligence",
    },
    guardrails: {
      evidence_written: false,
      automatic_verification_allowed: false,
      verification_status_mutated: false,
      identity_mutated: false,
      customer_send_allowed: false,
      customer_identifiers_emitted: false,
      human_decision_required: true,
    },
  };
}

export async function runVerifiedIdentityReadinessObservation({
  origin = DEFAULT_ORIGIN,
  credential,
  scanLimit = MAX_SCAN_LIMIT,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") fail("fetch_unavailable");
  const safeOrigin = normalizeOrigin(origin);
  const secret = clean(credential);
  if (!secret) fail("credential_missing");
  const limit = normalizeScanLimit(scanLimit);

  const loginResponse = await safeFetch(fetchImpl, `${safeOrigin}/internal/admin/login/session`, {
    method: "POST",
    headers: {
      Origin: safeOrigin,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-MMD-Login-Fetch": "1",
    },
    body: new URLSearchParams({
      credential: secret,
      next: "/internal/admin/member-intelligence",
    }).toString(),
    redirect: "manual",
  }, "owner_login_unavailable");
  const loginPayload = await safeJson(loginResponse, "owner_login_response_invalid");
  if (loginResponse.status !== 200 || loginPayload?.ok !== true) fail("owner_login_rejected");
  const cookie = clean(loginResponse.headers.get("set-cookie")).split(";", 1)[0];
  if (!SESSION_COOKIE.test(cookie)) fail("owner_session_cookie_missing");

  const unauthenticatedRecent = await safeFetch(fetchImpl, `${safeOrigin}/v1/admin/clients/recent`, {
    method: "GET",
    headers: { Origin: safeOrigin, Accept: "application/json" },
    redirect: "manual",
  }, "unauthenticated_boundary_unavailable");
  if (unauthenticatedRecent.status !== 401) fail("unauthenticated_boundary_not_closed");

  const headers = { Origin: safeOrigin, Cookie: cookie, Accept: "application/json" };
  const recentResponse = await safeFetch(fetchImpl, `${safeOrigin}/v1/admin/clients/recent`, {
    method: "GET",
    headers,
    redirect: "manual",
  }, "recent_clients_unavailable");
  if (recentResponse.status !== 200) fail(`recent_clients_${statusBucket(recentResponse.status)}`);
  const recentPayload = await safeJson(recentResponse, "recent_clients_response_invalid");
  if (recentPayload?.ok !== true || !Array.isArray(recentPayload.records)) fail("recent_clients_contract_invalid");

  const ids = [];
  const seen = new Set();
  for (const record of recentPayload.records) {
    const id = clean(record?.client_id);
    if (record?.manual_public_only === true || !RECORD_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }

  const counts = Object.fromEntries([...READINESS_STATUSES].map((status) => [status, 0]));
  const blockerCounts = {};
  const recoveryCounts = Object.fromEntries(Object.values(RECOVERY_STATUS_BY_READINESS).map((status) => [status, 0]));
  const recoveryActionCounts = {};
  const protocolCounts = Object.fromEntries(Object.values(PROTOCOL_STATUS_BY_RECOVERY).map((status) => [status, 0]));
  const protocolStepCounts = {};
  const endpointErrorBuckets = {};
  let checkedCount = 0;
  let projectionCount = 0;
  let degradedProjectionCount = 0;
  let endpointErrorCount = 0;
  let contractViolationCount = 0;

  for (const id of ids) {
    checkedCount += 1;
    let response;
    try {
      response = await fetchImpl(
        `${safeOrigin}/v1/admin/clients/intelligence?client_id=${encodeURIComponent(id)}`,
        { method: "GET", headers, redirect: "manual" },
      );
    } catch {
      endpointErrorCount += 1;
      increment(endpointErrorBuckets, "network_error");
      continue;
    }
    if (response.status !== 200) {
      endpointErrorCount += 1;
      increment(endpointErrorBuckets, statusBucket(response.status));
      continue;
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      contractViolationCount += 1;
      continue;
    }
    if (payload?.ok !== true || clean(payload?.client_id) !== id) {
      contractViolationCount += 1;
      continue;
    }
    projectionCount += 1;
    const dataStatus = clean(payload.data_status).toLowerCase();
    if (dataStatus === "degraded") {
      degradedProjectionCount += 1;
      continue;
    }
    if (dataStatus !== "live" && dataStatus !== "empty") {
      contractViolationCount += 1;
      continue;
    }
    if (!safeReadinessContract(payload) || !safeRecoveryContract(payload) || !safeEvidenceOwnerReviewProtocolContract(payload)) {
      contractViolationCount += 1;
      continue;
    }

    const readiness = payload.identity.readiness;
    const recovery = payload.identity.recovery;
    const protocol = payload.identity.evidence_protocol;
    increment(counts, readiness.status);
    for (const blocker of readiness.blockers) increment(blockerCounts, blocker);
    increment(recoveryCounts, recovery.status);
    for (const action of recovery.actions) increment(recoveryActionCounts, action);
    increment(protocolCounts, protocol.status);
    for (const step of protocol.steps) increment(protocolStepCounts, step);
  }

  const result = classify({
    counts,
    endpointErrors: endpointErrorCount,
    contractViolations: contractViolationCount,
    degradedProjections: degradedProjectionCount,
  });

  const observation = {
    schema: VERIFIED_IDENTITY_OBSERVATION_SCHEMA,
    mode: "authenticated_read_only",
    status: result.status,
    healthy: result.healthy,
    owner_review_ready: result.status === "owner_review_ready",
    scan: {
      limit,
      candidate_count: ids.length,
      checked_count: checkedCount,
      projection_count: projectionCount,
      degraded_projection_count: degradedProjectionCount,
      endpoint_error_count: endpointErrorCount,
      endpoint_error_buckets: Object.fromEntries(Object.entries(endpointErrorBuckets).sort(([a], [b]) => a.localeCompare(b))),
      contract_violation_count: contractViolationCount,
    },
    readiness: {
      counts,
      blocker_counts: Object.fromEntries(Object.entries(blockerCounts).sort(([a], [b]) => a.localeCompare(b))),
    },
    recovery: {
      schema: IDENTITY_EVIDENCE_RECOVERY_SCHEMA,
      counts: recoveryCounts,
      action_counts: Object.fromEntries(Object.entries(recoveryActionCounts).sort(([a], [b]) => a.localeCompare(b))),
    },
    owner_review_protocol: {
      schema: IDENTITY_EVIDENCE_OWNER_REVIEW_PROTOCOL_SCHEMA,
      counts: protocolCounts,
      step_counts: Object.fromEntries(Object.entries(protocolStepCounts).sort(([a], [b]) => a.localeCompare(b))),
    },
    guardrails: {
      names_emitted: false,
      customer_identifiers_emitted: false,
      line_tails_emitted: false,
      automatic_recovery_possible: false,
      evidence_written: false,
      owner_review_protocol_mutated: false,
      verification_status_mutated: false,
      identity_merged: false,
      membership_or_access_mutated: false,
      customer_send_possible: false,
      human_decision_required: true,
    },
  };
  observation.owner_review_adoption = deriveOwnerEvidenceReviewAdoption(observation);
  return observation;
}

function safeErrorCode(error) {
  const code = clean(error?.code);
  return /^[a-z0-9_]{1,80}$/.test(code) ? code : "unexpected_error";
}

function githubSummary(result) {
  return [
    "## Kenji Verified Identity Readiness",
    "",
    `- Status: \`${result.status}\``,
    `- Healthy: \`${result.healthy}\``,
    `- Candidates checked: \`${result.scan.checked_count}\` (bounded to \`${result.scan.limit}\`)`,
    `- Verified: \`${result.readiness.counts.verified}\``,
    `- Ready for Per review: \`${result.readiness.counts.ready_for_owner_verification}\``,
    `- Evidence pending: \`${result.readiness.counts.review_required + result.readiness.counts.insufficient_evidence}\``,
    `- Conflicts: \`${result.readiness.counts.conflict}\``,
    `- Recovery queue: \`${result.recovery.counts.evidence_required + result.recovery.counts.evidence_review + result.recovery.counts.owner_review_ready + result.recovery.counts.conflict_locked + result.recovery.counts.unavailable_locked}\``,
    `- LINE OFC evidence actions: \`${result.recovery.action_counts.review_line_ofc_evidence || 0}\``,
    `- LIFF evidence actions: \`${result.recovery.action_counts.review_liff_identity_evidence || 0}\``,
    `- Owner review protocol: \`${result.owner_review_protocol.counts.owner_review_required || 0}\` ready · \`${result.owner_review_protocol.counts.evidence_capture_required || 0}\` capture required`,
    `- Weekly owner adoption: \`${result.owner_review_adoption.status}\` · \`${result.owner_review_adoption.queue.owner_review_due}\` review due · \`${result.owner_review_adoption.queue.evidence_work_pending}\` evidence work pending`,
    "- Authority: Clients.Verification Status; readiness never verifies or merges identity",
    "- Privacy: aggregate counts only; no names, record IDs, LINE tails, credentials, or session values emitted",
    "",
  ].join("\n");
}

async function main() {
  try {
    const result = await runVerifiedIdentityReadinessObservation({
      origin: process.env.ORIGIN || DEFAULT_ORIGIN,
      credential: process.env.ADMIN_SMOKE_CREDENTIAL,
      scanLimit: process.env.OBSERVATION_SCAN_LIMIT,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, githubSummary(result), "utf8");
      } catch {
        // The bounded JSON result remains authoritative when summary rendering is unavailable.
      }
    }
    if (result.healthy !== true) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`verified_identity_readiness_failed:${safeErrorCode(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
