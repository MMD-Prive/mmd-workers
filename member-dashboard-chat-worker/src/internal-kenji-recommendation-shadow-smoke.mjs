import { buildKenjiLineCanonicalContext } from "./kenji-line-canonical-context-adapter.mjs";

export const REAL_RECOMMENDATION_SHADOW_SMOKE_MODE = "real_kenji_recommendation";
export const ELIGIBLE_RECOMMENDATION_SHADOW_SMOKE_MODE = "eligible_kenji_recommendation";

const AIRTABLE_API = "https://api.airtable.com/v0";
const CLIENTS_TABLE_FALLBACK = "tblVv58TCbwh5j1fS";
const RECOMMENDATION_URL = "https://admin-worker.local/v1/internal/kenji/recommendations";
const MATRIX_SCHEMA = "mmd.kenji_conversation_matrix.v1";
const MAX_CLIENT_CANDIDATES = 24;
const MAX_ELIGIBLE_ATTEMPTS = 8;
const CONTEXT_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 8_000;
const PRIVATE_ENVELOPES = new Set(["standard", "premium", "vip", "svip", "black_card"]);
const READY_AVAILABILITY = new Set(["available_now", "available_today", "available_soon", "limited"]);

function text(value) {
  return value == null ? "" : String(value).trim();
}

function clientsTable(env = {}) {
  return text(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || CLIENTS_TABLE_FALLBACK);
}

function isLineUserId(value) {
  return /^U[0-9a-f]{32}$/i.test(text(value));
}

function candidatePriority(record = {}) {
  const fields = record?.fields || {};
  const historyCount = Array.isArray(fields["MMD — Customer History Reviews"]) ? fields["MMD — Customer History Reviews"].length : 0;
  const entitlementCount = Array.isArray(fields["MMD — Member Entitlements"]) ? fields["MMD — Member Entitlements"].length : 0;
  const verified = text(fields["Verification Status"]?.name || fields["Verification Status"]).toLowerCase() === "verified";
  return (
    (historyCount > 0 ? 8 : 0) +
    (entitlementCount > 0 ? 4 : 0) +
    (verified ? 2 : 0) +
    Math.min(3, historyCount)
  );
}

async function listCanonicalCandidateLineIds(env = {}, fetchImpl = fetch) {
  const apiKey = text(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = clientsTable(env);
  if (!apiKey || !baseId || !table) return [];

  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "100");
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("filterByFormula", 'LEN({line_user_id}&"")=33');
  url.searchParams.append("fields[]", "line_user_id");
  url.searchParams.append("fields[]", "Verification Status");
  url.searchParams.append("fields[]", "MMD — Member Entitlements");
  url.searchParams.append("fields[]", "MMD — Customer History Reviews");

  try {
    const response = await fetchImpl(url.toString(), {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({}));
    const rows = [];
    const seen = new Set();
    for (const record of Array.isArray(payload?.records) ? payload.records : []) {
      const lineUserId = text(record?.fields?.line_user_id);
      if (!isLineUserId(lineUserId) || seen.has(lineUserId)) continue;
      seen.add(lineUserId);
      rows.push({ lineUserId, priority: candidatePriority(record) });
    }
    return rows
      .sort((left, right) => right.priority - left.priority)
      .slice(0, MAX_CLIENT_CANDIDATES)
      .map((item) => item.lineUserId);
  } catch {
    return [];
  }
}

function contextScore(adapted = {}) {
  const bundle = adapted?.context_bundle || {};
  const telemetry = adapted?.telemetry || {};
  let score = 0;
  if (bundle?.identity?.state === "known") score += 4;
  if (bundle?.identity?.confidence === "high") score += 4;
  if (telemetry.adapter_complete === true) score += 4;
  if (telemetry.memory_candidate === true) score += 3;
  if (Number(telemetry.matrix_version) > 0) score += 2;
  if (Array.isArray(bundle.reviewed_preferences) && bundle.reviewed_preferences.length) score += Math.min(4, bundle.reviewed_preferences.length);
  if (Array.isArray(bundle.prior_model_touches) && bundle.prior_model_touches.length) score += Math.min(4, bundle.prior_model_touches.length);
  return score;
}

function eligibilityProjection(adapted = {}) {
  const bundle = adapted?.context_bundle || {};
  const telemetry = adapted?.telemetry || {};
  const snapshot = bundle?.customer_context?.entitlement_snapshot || {};
  const access = snapshot?.access || {};
  const capability = snapshot?.capability_state || {};
  const envelope = text(access.private_visibility_envelope).toLowerCase();
  const reviewedPreferenceCount = Array.isArray(bundle.reviewed_preferences) ? bundle.reviewed_preferences.length : 0;
  const priorModelTouchCount = Array.isArray(bundle.prior_model_touches) ? bundle.prior_model_touches.length : 0;
  const hasReviewedHistory = reviewedPreferenceCount + priorModelTouchCount > 0;
  const activeCapabilityCount = Array.isArray(capability.active) ? capability.active.length : 0;
  const recognizedCapabilityCount = Array.isArray(capability.recognized) ? capability.recognized.length : 0;
  const eligible = (
    bundle?.identity?.state === "known" &&
    bundle?.identity?.confidence === "high" &&
    telemetry.adapter_complete === true &&
    telemetry.review_required !== true &&
    bundle?.domain_guard?.review_required !== true &&
    snapshot?.member_blocked !== true &&
    PRIVATE_ENVELOPES.has(envelope) &&
    (activeCapabilityCount > 0 || recognizedCapabilityCount > 0) &&
    hasReviewedHistory
  );
  return {
    eligible,
    private_visibility_envelope: PRIVATE_ENVELOPES.has(envelope) ? envelope : "none",
    active_capability_count: activeCapabilityCount,
    recognized_capability_count: recognizedCapabilityCount,
    reviewed_preference_count: reviewedPreferenceCount,
    prior_model_touch_count: priorModelTouchCount,
    has_reviewed_history: hasReviewedHistory,
  };
}

async function buildCandidateContext(env, lineUserId, contextBuilder) {
  try {
    const adapted = await contextBuilder({
      env,
      event: {
        type: "message",
        source: { type: "user", userId: lineUserId },
        message: { type: "text", text: "model recommendation shadow smoke" },
      },
      currentIntent: "model_recommendation",
      now: new Date(),
    });
    if (adapted?.ok !== true || adapted?.context_bundle?.identity?.state !== "known") return null;
    return {
      lineUserId,
      adapted,
      eligibility: eligibilityProjection(adapted),
      score: contextScore(adapted),
    };
  } catch {
    return null;
  }
}

async function mapWithConcurrency(values, limit, mapper) {
  const items = Array.isArray(values) ? values : [];
  if (!items.length) return [];
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

async function selectRealCanonicalContext(env = {}, options = {}) {
  const candidateProvider = options.candidateProvider || listCanonicalCandidateLineIds;
  const contextBuilder = options.contextBuilder || buildKenjiLineCanonicalContext;
  const lineIds = await candidateProvider(env, options.fetchImpl || fetch);
  const contexts = (await mapWithConcurrency(
    lineIds.slice(0, MAX_CLIENT_CANDIDATES),
    CONTEXT_CONCURRENCY,
    (lineUserId) => buildCandidateContext(env, lineUserId, contextBuilder),
  )).filter(Boolean);
  return contexts.sort((left, right) => right.score - left.score)[0] || null;
}

async function selectEligibleCanonicalContexts(env = {}, options = {}) {
  const candidateProvider = options.candidateProvider || listCanonicalCandidateLineIds;
  const contextBuilder = options.contextBuilder || buildKenjiLineCanonicalContext;
  const lineIds = await candidateProvider(env, options.fetchImpl || fetch);
  const contexts = (await mapWithConcurrency(
    lineIds.slice(0, MAX_CLIENT_CANDIDATES),
    CONTEXT_CONCURRENCY,
    (lineUserId) => buildCandidateContext(env, lineUserId, contextBuilder),
  )).filter((item) => item?.eligibility?.eligible === true);
  return contexts
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_ELIGIBLE_ATTEMPTS);
}

function recommendationCustomerContext(adapted = {}) {
  const bundle = adapted?.context_bundle || {};
  const telemetry = adapted?.telemetry || {};
  const matrix = bundle.conversation_matrix || {};
  const matrixValid = text(matrix.schema_version) === MATRIX_SCHEMA;
  const highConfidence = bundle?.identity?.state === "known" && bundle?.identity?.confidence === "high";
  const reviewRequired = bundle?.domain_guard?.review_required === true || telemetry.review_required === true;
  return {
    schema_version: matrixValid ? MATRIX_SCHEMA : "",
    context_only: true,
    live_truth_wins: true,
    identity: {
      state: text(bundle?.identity?.state),
      confidence: text(bundle?.identity?.confidence),
    },
    safety: {
      may_personalize: matrixValid && highConfidence && !reviewRequired,
      review_required: reviewRequired,
      stale: false,
    },
    reviewed_preferences: Array.isArray(bundle.reviewed_preferences) ? bundle.reviewed_preferences.slice(0, 8) : [],
    prior_model_touches: Array.isArray(bundle.prior_model_touches) ? bundle.prior_model_touches.slice(0, 8) : [],
  };
}

function recommendationRequest(adapted = {}) {
  const preferences = (Array.isArray(adapted?.context_bundle?.reviewed_preferences)
    ? adapted.context_bundle.reviewed_preferences
    : [])
    .map((item) => text(item?.normalized_summary))
    .filter(Boolean)
    .slice(0, 8);
  return { preferences };
}

async function callRecommendation(env = {}, body = {}) {
  const internalToken = text(env.INTERNAL_TOKEN);
  if (!env.ADMIN_WORKER?.fetch || !internalToken) {
    return { status: 503, payload: { ok: false, error: "admin_worker_binding_missing" } };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("real_recommendation_shadow_smoke_timeout"), REQUEST_TIMEOUT_MS);
  try {
    const response = await env.ADMIN_WORKER.fetch(new Request(RECOMMENDATION_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${internalToken}`,
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
        "x-mmd-diagnostic": "real-canonical-recommendation-shadow-smoke",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }));
    return {
      status: response.status,
      payload: await response.json().catch(() => ({ ok: false, error: "recommendation_non_json" })),
    };
  } catch {
    return { status: 502, payload: { ok: false, error: "recommendation_request_failed" } };
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeRecommendationItems(items = []) {
  return (Array.isArray(items) ? items : []).slice(0, 3).map((item) => ({
    model_key: text(item?.model_key).slice(0, 40),
    customer_rate_thb: Number.isFinite(Number(item?.sales?.customer_rate_thb)) ? Number(item.sales.customer_rate_thb) : null,
    price_visible: item?.sales?.price_visible === true,
    availability_state: text(item?.availability?.state).slice(0, 40),
    match_reasons: Array.isArray(item?.match_reasons) ? item.match_reasons.map((reason) => text(reason).slice(0, 80)).slice(0, 8) : [],
    is_new_release: item?.is_new_release === true,
    safe_next_action: text(item?.safe_next_action).slice(0, 80),
  }));
}

function sanitizeReviewCandidates(items = []) {
  return (Array.isArray(items) ? items : []).slice(0, 5).map((item) => ({
    model_key: text(item?.model_key).slice(0, 40),
    reason: text(item?.reason).slice(0, 80),
    safe_next_action: text(item?.safe_next_action).slice(0, 80),
  }));
}

function safeGuardrails(result = {}) {
  const guardrails = result?.guardrails || {};
  return {
    auto_send_allowed: guardrails.auto_send_allowed === true,
    booking_confirmed: guardrails.booking_confirmed === true,
    payment_confirmed: guardrails.payment_confirmed === true,
    entitlement_mutated: guardrails.entitlement_mutated === true,
    source_rate_exposed: guardrails.source_rate_exposed === true,
    raw_notes_exposed: guardrails.raw_notes_exposed === true,
  };
}

function guardrailsPass(guard = {}) {
  return (
    guard.auto_send_allowed === false &&
    guard.booking_confirmed === false &&
    guard.payment_confirmed === false &&
    guard.entitlement_mutated === false &&
    guard.source_rate_exposed === false &&
    guard.raw_notes_exposed === false
  );
}

function recommendationsAreCustomerReady(result = {}) {
  const recommendations = sanitizeRecommendationItems(result?.recommendations);
  if (recommendations.length < 1 || recommendations.length > 3) return false;
  return recommendations.every((item) => (
    Number.isFinite(item.customer_rate_thb) &&
    item.customer_rate_thb > 0 &&
    item.price_visible === true &&
    READY_AVAILABILITY.has(item.availability_state)
  ));
}

function contextReceipt(adapted = {}, eligibility = eligibilityProjection(adapted)) {
  const bundle = adapted?.context_bundle || {};
  const customerContext = recommendationCustomerContext(adapted);
  return {
    identity_state: text(bundle?.identity?.state),
    identity_confidence: text(bundle?.identity?.confidence),
    adapter_complete: adapted?.telemetry?.adapter_complete === true,
    memory_candidate: adapted?.telemetry?.memory_candidate === true,
    matrix_version: Math.max(0, Number(adapted?.telemetry?.matrix_version) || 0),
    review_required: bundle?.domain_guard?.review_required === true || adapted?.telemetry?.review_required === true,
    reviewed_preference_count: eligibility.reviewed_preference_count,
    prior_model_touch_count: eligibility.prior_model_touch_count,
    personalization_allowed: customerContext.safety.may_personalize === true,
    rights_authority: text(bundle?.rights_authority),
    private_access_active: eligibility.eligible === true,
    private_visibility_envelope: eligibility.private_visibility_envelope,
    active_capability_count: eligibility.active_capability_count,
    recognized_capability_count: eligibility.recognized_capability_count,
  };
}

function recommendationReceipt(upstream = {}) {
  const result = upstream?.payload || {};
  return {
    http_status: Number(upstream?.status) || 0,
    upstream_ok: result?.ok === true,
    deployment_mode: text(result?.deployment_mode),
    customer_ready: result?.customer_ready === true,
    recommendation_count: Math.max(0, Number(result?.recommendation_count) || 0),
    review_candidate_count: Array.isArray(result?.review_candidates) ? result.review_candidates.length : 0,
    new_release_included: result?.new_release?.included === true,
    discovery: {
      scanned_profiles: Math.max(0, Number(result?.discovery?.scanned_profiles) || 0),
      shortlisted_profiles: Math.max(0, Number(result?.discovery?.shortlisted_profiles) || 0),
      access_matched_candidates: Math.max(0, Number(result?.discovery?.access_matched_candidates) || 0),
    },
    recommendations: sanitizeRecommendationItems(result?.recommendations),
    review_candidates: sanitizeReviewCandidates(result?.review_candidates),
  };
}

async function recommendationForSelection(env, selection, options = {}) {
  const adapted = selection.adapted;
  const customerContext = recommendationCustomerContext(adapted);
  const body = {
    line_user_id: selection.lineUserId,
    evaluated_at: new Date().toISOString(),
    request: recommendationRequest(adapted),
    customer_context: customerContext,
  };
  const upstream = await (options.recommendationCaller || callRecommendation)(env, body);
  return { upstream, customerContext };
}

export async function runRealKenjiRecommendationShadowSmoke(env = {}, options = {}) {
  const selection = await (options.contextSelector || selectRealCanonicalContext)(env, options);
  if (!selection?.lineUserId || !selection?.adapted) {
    return {
      status: 409,
      payload: {
        ok: false,
        mode: REAL_RECOMMENDATION_SHADOW_SMOKE_MODE,
        read_only: true,
        shadow_only: true,
        canonical_context_real: false,
        customer_side_effects: false,
        error: "real_verified_canonical_context_unavailable",
      },
    };
  }

  const { upstream } = await recommendationForSelection(env, selection, options);
  const result = upstream?.payload || {};
  const guard = safeGuardrails(result);
  const safe = result?.ok === true && result?.deployment_mode === "shadow" && guardrailsPass(guard);

  return {
    status: safe ? 200 : upstream.status >= 400 ? upstream.status : 502,
    payload: {
      ok: safe,
      mode: REAL_RECOMMENDATION_SHADOW_SMOKE_MODE,
      read_only: true,
      shadow_only: true,
      caller: "member-dashboard-chat-worker",
      canonical_context_real: true,
      customer_side_effects: false,
      context_receipt: contextReceipt(selection.adapted, selection.eligibility),
      recommendation_receipt: recommendationReceipt(upstream),
      guardrails: guard,
      error: safe ? "" : text(result?.error?.code || result?.error || "shadow_contract_rejected").slice(0, 120),
    },
  };
}

export async function runEligibleKenjiRecommendationShadowSmoke(env = {}, options = {}) {
  const selections = options.eligibleSelections
    ? await options.eligibleSelections(env, options)
    : await selectEligibleCanonicalContexts(env, options);

  if (!Array.isArray(selections) || !selections.length) {
    return {
      status: 409,
      payload: {
        ok: false,
        mode: ELIGIBLE_RECOMMENDATION_SHADOW_SMOKE_MODE,
        read_only: true,
        shadow_only: true,
        caller: "member-dashboard-chat-worker",
        canonical_context_real: false,
        eligible_client_found: false,
        customer_side_effects: false,
        error: "eligible_private_client_with_reviewed_history_unavailable",
      },
    };
  }

  const attempts = [];
  for (const selection of selections.slice(0, MAX_ELIGIBLE_ATTEMPTS)) {
    const { upstream } = await recommendationForSelection(env, selection, options);
    const result = upstream?.payload || {};
    const guard = safeGuardrails(result);
    const receipt = recommendationReceipt(upstream);
    const safe = result?.ok === true && result?.deployment_mode === "shadow" && guardrailsPass(guard);
    const ready = safe && result?.customer_ready === true && recommendationsAreCustomerReady(result);
    attempts.push({
      safe,
      ready,
      http_status: receipt.http_status,
      scanned_profiles: receipt.discovery.scanned_profiles,
      shortlisted_profiles: receipt.discovery.shortlisted_profiles,
      access_matched_candidates: receipt.discovery.access_matched_candidates,
      recommendation_count: receipt.recommendation_count,
      review_candidate_count: receipt.review_candidate_count,
    });

    if (!ready) continue;

    return {
      status: 200,
      payload: {
        ok: true,
        mode: ELIGIBLE_RECOMMENDATION_SHADOW_SMOKE_MODE,
        read_only: true,
        shadow_only: true,
        caller: "member-dashboard-chat-worker",
        canonical_context_real: true,
        eligible_client_found: true,
        customer_side_effects: false,
        attempted_eligible_clients: attempts.length,
        context_receipt: contextReceipt(selection.adapted, selection.eligibility),
        recommendation_receipt: receipt,
        guardrails: guard,
        error: "",
      },
    };
  }

  const last = attempts[attempts.length - 1] || {};
  return {
    status: 409,
    payload: {
      ok: false,
      mode: ELIGIBLE_RECOMMENDATION_SHADOW_SMOKE_MODE,
      read_only: true,
      shadow_only: true,
      caller: "member-dashboard-chat-worker",
      canonical_context_real: true,
      eligible_client_found: true,
      customer_side_effects: false,
      attempted_eligible_clients: attempts.length,
      diagnostics: {
        max_scanned_profiles: Math.max(0, ...attempts.map((item) => item.scanned_profiles || 0)),
        max_shortlisted_profiles: Math.max(0, ...attempts.map((item) => item.shortlisted_profiles || 0)),
        max_access_matched_candidates: Math.max(0, ...attempts.map((item) => item.access_matched_candidates || 0)),
        max_recommendation_count: Math.max(0, ...attempts.map((item) => item.recommendation_count || 0)),
        max_review_candidate_count: Math.max(0, ...attempts.map((item) => item.review_candidate_count || 0)),
        last_http_status: Number(last.http_status) || 0,
      },
      error: "eligible_clients_found_but_no_customer_ready_recommendation",
    },
  };
}

export const REAL_RECOMMENDATION_SHADOW_SMOKE_INTERNALS = Object.freeze({
  CLIENTS_TABLE_FALLBACK,
  RECOMMENDATION_URL,
  MATRIX_SCHEMA,
  listCanonicalCandidateLineIds,
  candidatePriority,
  selectRealCanonicalContext,
  selectEligibleCanonicalContexts,
  eligibilityProjection,
  recommendationCustomerContext,
  recommendationRequest,
  recommendationsAreCustomerReady,
});
