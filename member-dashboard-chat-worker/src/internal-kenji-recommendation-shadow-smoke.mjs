import { buildKenjiLineCanonicalContext } from "./kenji-line-canonical-context-adapter.mjs";

export const REAL_RECOMMENDATION_SHADOW_SMOKE_MODE = "real_kenji_recommendation";

const AIRTABLE_API = "https://api.airtable.com/v0";
const CLIENTS_TABLE_FALLBACK = "tblVv58TCbwh5j1fS";
const RECOMMENDATION_URL = "https://admin-worker.local/v1/internal/kenji/recommendations";
const MATRIX_SCHEMA = "mmd.kenji_conversation_matrix.v1";
const MAX_CLIENT_CANDIDATES = 6;
const REQUEST_TIMEOUT_MS = 8_000;

function text(value) {
  return value == null ? "" : String(value).trim();
}

function clientsTable(env = {}) {
  return text(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || CLIENTS_TABLE_FALLBACK);
}

function isLineUserId(value) {
  return /^U[0-9a-f]{32}$/i.test(text(value));
}

async function listVerifiedCanonicalLineIds(env = {}, fetchImpl = fetch) {
  const apiKey = text(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = clientsTable(env);
  if (!apiKey || !baseId || !table) return [];

  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "25");
  url.searchParams.set("pageSize", "25");
  url.searchParams.set("filterByFormula", 'AND(LOWER({Verification Status}&"")="verified",LEN({line_user_id}&"")=33)');
  url.searchParams.append("fields[]", "line_user_id");

  try {
    const response = await fetchImpl(url.toString(), {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({}));
    const ids = [];
    for (const record of Array.isArray(payload?.records) ? payload.records : []) {
      const lineUserId = text(record?.fields?.line_user_id);
      if (isLineUserId(lineUserId) && !ids.includes(lineUserId)) ids.push(lineUserId);
      if (ids.length >= MAX_CLIENT_CANDIDATES) break;
    }
    return ids;
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
  if (Array.isArray(bundle.reviewed_preferences) && bundle.reviewed_preferences.length) score += 1;
  if (Array.isArray(bundle.prior_model_touches) && bundle.prior_model_touches.length) score += 1;
  return score;
}

async function selectRealCanonicalContext(env = {}, options = {}) {
  const candidateProvider = options.candidateProvider || listVerifiedCanonicalLineIds;
  const contextBuilder = options.contextBuilder || buildKenjiLineCanonicalContext;
  const lineIds = await candidateProvider(env, options.fetchImpl || fetch);
  let best = null;

  for (const lineUserId of lineIds.slice(0, MAX_CLIENT_CANDIDATES)) {
    let adapted;
    try {
      adapted = await contextBuilder({
        env,
        event: {
          type: "message",
          source: { type: "user", userId: lineUserId },
          message: { type: "text", text: "model recommendation shadow smoke" },
        },
        currentIntent: "model_recommendation",
        now: new Date(),
      });
    } catch {
      continue;
    }
    if (adapted?.ok !== true || adapted?.context_bundle?.identity?.state !== "known") continue;
    const candidate = { lineUserId, adapted, score: contextScore(adapted) };
    if (!best || candidate.score > best.score) best = candidate;
    if (
      adapted?.context_bundle?.identity?.confidence === "high" &&
      adapted?.telemetry?.adapter_complete === true &&
      adapted?.telemetry?.memory_candidate === true
    ) break;
  }
  return best;
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

  const adapted = selection.adapted;
  const bundle = adapted.context_bundle || {};
  const customerContext = recommendationCustomerContext(adapted);
  const body = {
    line_user_id: selection.lineUserId,
    evaluated_at: new Date().toISOString(),
    request: recommendationRequest(adapted),
    customer_context: customerContext,
  };

  const upstream = await (options.recommendationCaller || callRecommendation)(env, body);
  const result = upstream?.payload || {};
  const guardrails = result?.guardrails || {};
  const safeGuardrails = {
    auto_send_allowed: guardrails.auto_send_allowed === true,
    booking_confirmed: guardrails.booking_confirmed === true,
    payment_confirmed: guardrails.payment_confirmed === true,
    entitlement_mutated: guardrails.entitlement_mutated === true,
    source_rate_exposed: guardrails.source_rate_exposed === true,
    raw_notes_exposed: guardrails.raw_notes_exposed === true,
  };

  const safe = result?.ok === true &&
    result?.deployment_mode === "shadow" &&
    safeGuardrails.auto_send_allowed === false &&
    safeGuardrails.booking_confirmed === false &&
    safeGuardrails.payment_confirmed === false &&
    safeGuardrails.entitlement_mutated === false &&
    safeGuardrails.source_rate_exposed === false &&
    safeGuardrails.raw_notes_exposed === false;

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
      context_receipt: {
        identity_state: text(bundle?.identity?.state),
        identity_confidence: text(bundle?.identity?.confidence),
        adapter_complete: adapted?.telemetry?.adapter_complete === true,
        memory_candidate: adapted?.telemetry?.memory_candidate === true,
        matrix_version: Math.max(0, Number(adapted?.telemetry?.matrix_version) || 0),
        review_required: bundle?.domain_guard?.review_required === true || adapted?.telemetry?.review_required === true,
        reviewed_preference_count: Array.isArray(bundle.reviewed_preferences) ? bundle.reviewed_preferences.length : 0,
        prior_model_touch_count: Array.isArray(bundle.prior_model_touches) ? bundle.prior_model_touches.length : 0,
        personalization_allowed: customerContext.safety.may_personalize === true,
        rights_authority: text(bundle?.rights_authority),
      },
      recommendation_receipt: {
        http_status: Number(upstream?.status) || 0,
        upstream_ok: result?.ok === true,
        deployment_mode: text(result?.deployment_mode),
        customer_ready: result?.customer_ready === true,
        recommendation_count: Math.max(0, Number(result?.recommendation_count) || 0),
        review_candidate_count: Array.isArray(result?.review_candidates) ? result.review_candidates.length : 0,
        new_release_included: result?.new_release?.included === true,
        recommendations: sanitizeRecommendationItems(result?.recommendations),
        review_candidates: sanitizeReviewCandidates(result?.review_candidates),
      },
      guardrails: safeGuardrails,
      error: safe ? "" : text(result?.error?.code || result?.error || "shadow_contract_rejected").slice(0, 120),
    },
  };
}

export const REAL_RECOMMENDATION_SHADOW_SMOKE_INTERNALS = Object.freeze({
  CLIENTS_TABLE_FALLBACK,
  RECOMMENDATION_URL,
  MATRIX_SCHEMA,
  listVerifiedCanonicalLineIds,
  selectRealCanonicalContext,
  recommendationCustomerContext,
  recommendationRequest,
});
