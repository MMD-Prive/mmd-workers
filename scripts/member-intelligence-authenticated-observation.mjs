import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const OBSERVATION_SCHEMA = "mmd.kenji_continuity_authenticated_observation.v1";

const DEFAULT_ORIGIN = "https://mmdbkk.com";
const MAX_SCAN_LIMIT = 24;
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
const SESSION_COOKIE = /^mmd_admin_gate_v1=[^;\r\n]+$/;
const ALLOWED_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const ALLOWED_CHANNELS = new Set(["line", "line_oa", "line_ofc", "liff"]);
const ALLOWED_UNAVAILABLE_REASONS = new Set([
  "active_matrix_required",
  "canonical_client_not_resolved",
  "continuity_authority_boundary_required",
  "continuity_review_required",
  "continuity_stale",
  "customer_safe_name_required",
  "high_confidence_identity_required",
  "line_channel_required",
  "matrix_freshness_unavailable",
  "matrix_stale_or_expired",
  "matrix_version_required",
  "open_conversation_stage_required",
  "phase4_mode_off",
  "reviewed_returning_relationship_required",
  "unsupported_phase4_mode",
  "verified_canonical_identity_required",
  "verified_open_thread_required",
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
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    fail("origin_invalid");
  }
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

function emptyProjectionCounts() {
  return { live: 0, degraded: 0, empty: 0, other: 0 };
}

function projectionBucket(value) {
  const status = clean(value).toLowerCase();
  return ["live", "degraded", "empty"].includes(status) ? status : "other";
}

function unavailableReason(value) {
  const reason = clean(value).toLowerCase();
  return ALLOWED_UNAVAILABLE_REASONS.has(reason) ? reason : "other_unavailable";
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function safeDraftContract(payload) {
  const identity = payload?.identity || {};
  const ai = payload?.ai || {};
  const draft = ai.suggested_reply || {};
  const applies = draft.applies || {};
  const guards = draft.guardrails || {};
  const continuity = ai.continuity_status || {};
  const authority = payload?.authority || {};
  const text = typeof draft.text === "string" ? draft.text.trim() : "";
  const textSafe = text.length > 0
    && text.length <= 360
    && !/[\r\n\t]/u.test(text)
    && !/https?:|www\.|(?:bearer|authorization|password|secret|token|cookie)|\brec[A-Za-z0-9]{14}\b|\bU[A-Za-z0-9_-]{20,}\b/iu.test(text);

  return identity.status === "canonical"
    && identity.verified === true
    && ai.advisory_only === true
    && authority.ai === "advisory"
    && draft.schema === "mmd.kenji_continuity_operator_draft.v1"
    && draft.mode === "operator_draft"
    && draft.available === true
    && textSafe
    && ALLOWED_CHANNELS.has(clean(draft.channel).toLowerCase())
    && draft.send_allowed === false
    && draft.requires_owner_review === true
    && draft.reason === "operator_review_required"
    && applies.preferred_name === true
    && applies.returning_tone === true
    && applies.continuity_acknowledgement === true
    && guards.customer_auto_send === false
    && guards.business_truth_claims === false
    && guards.memory_is_context_only === true
    && typeof guards.protected_truth_refresh_required === "boolean"
    && continuity.source === "conversation_matrix"
    && continuity.source_status === "live"
    && continuity.freshness === "fresh"
    && continuity.context_only === true
    && continuity.live_truth_wins === true;
}

function copyReadyContract(payload) {
  const runtime = payload?.ai?.runtime_controls || {};
  return payload?.data_status === "live"
    && runtime.status === "live"
    && runtime.line_oa_kill_switch === "clear"
    && runtime.all_mutations_kill_switch === "clear"
    && runtime.operator_copy_allowed === true
    && runtime.reason === "clear";
}

function classifyResult({ ready, safe, violations, endpointErrors }) {
  if (violations > 0) return { status: "contract_violation", healthy: false };
  if (endpointErrors > 0) return { status: "observation_degraded", healthy: false };
  if (ready > 0) return { status: "human_acceptance_ready", healthy: true };
  if (safe > 0) return { status: "safe_draft_not_copy_ready", healthy: true };
  return { status: "no_current_eligible_draft", healthy: true };
}

export async function runAuthenticatedObservation({
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

  const authenticatedHeaders = {
    Origin: safeOrigin,
    Cookie: cookie,
    Accept: "application/json",
  };
  const recentResponse = await safeFetch(fetchImpl, `${safeOrigin}/v1/admin/clients/recent`, {
    method: "GET",
    headers: authenticatedHeaders,
    redirect: "manual",
  }, "recent_clients_unavailable");
  if (recentResponse.status !== 200) fail(`recent_clients_${statusBucket(recentResponse.status)}`);
  const recentPayload = await safeJson(recentResponse, "recent_clients_response_invalid");
  if (recentPayload?.ok !== true || !Array.isArray(recentPayload.records)) {
    fail("recent_clients_contract_invalid");
  }

  const ids = [];
  const seen = new Set();
  for (const record of recentPayload.records) {
    const id = clean(record?.client_id);
    if (record?.manual_public_only === true || !RECORD_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }

  const projectionCounts = emptyProjectionCounts();
  const unavailableReasons = {};
  const endpointErrorBuckets = {};
  let checkedCount = 0;
  let projectionCount = 0;
  let unavailableDraftCount = 0;
  let safeDraftCount = 0;
  let acceptanceReadyCount = 0;
  let safetyContractViolationCount = 0;
  let responseContractViolationCount = 0;
  let endpointErrorCount = 0;

  for (const id of ids) {
    checkedCount += 1;
    let response;
    try {
      response = await fetchImpl(
        `${safeOrigin}/v1/admin/clients/intelligence?client_id=${encodeURIComponent(id)}`,
        {
          method: "GET",
          headers: authenticatedHeaders,
          redirect: "manual",
        },
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
      responseContractViolationCount += 1;
      continue;
    }
    if (payload?.ok !== true || clean(payload?.client_id) !== id) {
      responseContractViolationCount += 1;
      continue;
    }

    projectionCount += 1;
    increment(projectionCounts, projectionBucket(payload.data_status));
    const draft = payload?.ai?.suggested_reply || {};
    if (draft.available !== true) {
      unavailableDraftCount += 1;
      increment(unavailableReasons, unavailableReason(draft.reason));
      continue;
    }

    if (!safeDraftContract(payload)) {
      safetyContractViolationCount += 1;
      continue;
    }
    safeDraftCount += 1;
    if (copyReadyContract(payload)) acceptanceReadyCount += 1;
  }

  const violationCount = safetyContractViolationCount + responseContractViolationCount;
  const classification = classifyResult({
    ready: acceptanceReadyCount,
    safe: safeDraftCount,
    violations: violationCount,
    endpointErrors: endpointErrorCount,
  });
  const orderedReasons = Object.fromEntries(Object.entries(unavailableReasons).sort(([a], [b]) => a.localeCompare(b)));
  const orderedEndpointErrors = Object.fromEntries(Object.entries(endpointErrorBuckets).sort(([a], [b]) => a.localeCompare(b)));

  return {
    schema: OBSERVATION_SCHEMA,
    mode: "authenticated_read_only",
    status: classification.status,
    healthy: classification.healthy,
    human_acceptance_ready: acceptanceReadyCount > 0,
    scan: {
      limit,
      candidate_count: ids.length,
      checked_count: checkedCount,
      projection_count: projectionCount,
      endpoint_error_count: endpointErrorCount,
      endpoint_error_buckets: orderedEndpointErrors,
      response_contract_violation_count: responseContractViolationCount,
    },
    projections: projectionCounts,
    drafts: {
      unavailable_count: unavailableDraftCount,
      safe_available_count: safeDraftCount,
      acceptance_ready_count: acceptanceReadyCount,
      safety_contract_violation_count: safetyContractViolationCount,
      unavailable_reasons: orderedReasons,
    },
    guardrails: {
      feedback_submitted: false,
      copy_performed: false,
      audit_written: false,
      customer_send_possible: false,
      customer_content_emitted: false,
      customer_identifiers_emitted: false,
      business_truth_mutated: false,
      human_decision_required: true,
    },
  };
}

function safeErrorCode(error) {
  const code = clean(error?.code);
  return /^[a-z0-9_]{1,80}$/.test(code) ? code : "unexpected_error";
}

function githubSummary(result) {
  return [
    "## Member Intelligence authenticated observation",
    "",
    `- Status: \`${result.status}\``,
    `- Healthy: \`${result.healthy}\``,
    `- Human acceptance ready: \`${result.human_acceptance_ready}\``,
    `- Candidates checked: \`${result.scan.checked_count}\` (bounded to \`${result.scan.limit}\`)`,
    `- Safe drafts: \`${result.drafts.safe_available_count}\``,
    `- Copy-ready drafts: \`${result.drafts.acceptance_ready_count}\``,
    "- Privacy: no names, record IDs, draft text, credential, or session value emitted",
    "- Authority: read-only observation; no feedback, copy audit, customer send, or business-truth mutation",
    "",
  ].join("\n");
}

async function main() {
  try {
    const result = await runAuthenticatedObservation({
      origin: process.env.ORIGIN || DEFAULT_ORIGIN,
      credential: process.env.ADMIN_SMOKE_CREDENTIAL,
      scanLimit: process.env.OBSERVATION_SCAN_LIMIT,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, githubSummary(result), "utf8");
      } catch {
        // A summary is optional; the bounded JSON result remains authoritative.
      }
    }
    if (result.healthy !== true) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`member_intelligence_observation_failed:${safeErrorCode(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
