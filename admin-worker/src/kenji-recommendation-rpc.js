import { KENJI_MODEL_ACCESS_POLICY_VERSION, resolveKenjiModelAccess } from "./kenji-model-access-rpc.js";
import { MODEL_SALES_POLICY_VERSION } from "../../shared/model-sales-control-v1.mjs";
import { buildKenjiRecommendations } from "../../shared/kenji-recommendation-layer-v1.mjs";
import {
  boundedRecommendationCustomerContext,
  mapRecommendationCandidates,
  readRecommendationAvailability,
  recommendationSourceProjection,
} from "./kenji-recommendation-context-adapter.js";
import {
  fetchKenjiRecommendationProfiles,
  KenjiRecommendationSourceError,
  shortlistRecommendationProfiles,
} from "./kenji-recommendation-profile-source.js";

export const KENJI_RECOMMENDATION_RPC_PATH = "/v1/internal/kenji/recommendations";
export const KENJI_RECOMMENDATION_RPC_SCHEMA = "mmd.kenji_recommendation_rpc.v1";
export const KENJI_RECOMMENDATION_MODE_ENV = "KENJI_RECOMMENDATION_MODE";

const ACTIVE_RECOMMENDATION_MODES = new Set(["shadow", "service_only"]);

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, max);
}

function recommendationMode(env = {}) {
  return clean(env[KENJI_RECOMMENDATION_MODE_ENV], 40).toLowerCase();
}

export async function resolveKenjiRecommendationPreview(env = {}, body = {}, options = {}) {
  const lineUserId = clean(body.line_user_id, 80);
  if (!/^U[A-Za-z0-9_-]{16,64}$/.test(lineUserId)) return { ok: false, error: "canonical_line_identity_required" };
  const now = clean(options.now || body.evaluated_at || new Date().toISOString(), 100);
  if (!Number.isFinite(Date.parse(now))) return { ok: false, error: "invalid_evaluated_at" };
  const profileProvider = options.profileProvider || ((currentEnv) => fetchKenjiRecommendationProfiles(currentEnv, options.fetchImpl || fetch));
  const modelAccessResolver = options.modelAccessResolver || resolveKenjiModelAccess;
  let profiles;
  try {
    profiles = await profileProvider(env);
  } catch (error) {
    if (error instanceof KenjiRecommendationSourceError) throw error;
    throw new KenjiRecommendationSourceError("keyword_profile_source_unavailable");
  }
  if (!Array.isArray(profiles)) throw new KenjiRecommendationSourceError("keyword_profile_source_invalid");
  const shortlist = shortlistRecommendationProfiles(profiles, body);
  const candidates = await mapRecommendationCandidates(shortlist, async (profile) => {
    let access;
    try {
      access = await modelAccessResolver(env, {
        line_user_id: lineUserId,
        query: profile.model_key,
        requested_at: body?.request?.requested_at || now,
        work_lane: body?.request?.work_lane || body?.request?.service || "",
      }, { fetchImpl: options.fetchImpl || fetch });
    } catch {
      throw new KenjiRecommendationSourceError("model_access_source_unavailable");
    }
    if (access?.status !== "match" || !access?.model?.model_code) return null;
    const availability = await readRecommendationAvailability(env, access.model.model_code, options.availabilityProvider);
    return {
      model_key: access.model.model_code,
      safe_display_name: access.model.working_name || profile.working_name,
      model_lane: profile.model_lane,
      access_allowed: true,
      safe_keywords: profile.safe_keywords,
      summary: access.model.summary || profile.summary,
      image_url: access.model.image_url || "",
      is_new_release: profile.is_new_release,
      release_status: profile.release_status,
      availability,
      sales: access.model.sales ? { ...access.model.sales, policy_version: MODEL_SALES_POLICY_VERSION } : null,
    };
  });

  const result = buildKenjiRecommendations({
    evaluated_at: now,
    permission_gate: { applied: true, policy_version: KENJI_MODEL_ACCESS_POLICY_VERSION, evaluated_at: now },
    request: body.request && typeof body.request === "object" ? body.request : {},
    customer_context: boundedRecommendationCustomerContext(body.customer_context),
    candidates: candidates.filter(Boolean),
  }, { now });
  return {
    ...result,
    rpc_schema: KENJI_RECOMMENDATION_RPC_SCHEMA,
    source: { profiles: "published_model_keyword_profiles", access: KENJI_MODEL_ACCESS_POLICY_VERSION, sales: MODEL_SALES_POLICY_VERSION, ...recommendationSourceProjection() },
    discovery: { scanned_profiles: profiles.length, shortlisted_profiles: shortlist.length, access_matched_candidates: candidates.filter(Boolean).length },
  };
}

function bearerToken(request) {
  const match = clean(request.headers.get("authorization"), 2000).match(/^Bearer\s+(.+)$/i);
  return clean(match?.[1], 1000);
}

function authorized(request, env = {}) {
  let hostname = "";
  try { hostname = new URL(request.url).hostname; } catch { return false; }
  return hostname === "admin-worker.local"
    && clean(request.headers.get("x-mmd-internal-call")).toLowerCase() === "true"
    && clean(request.headers.get("x-mmd-service-binding")) === "member-dashboard-chat-worker"
    && clean(env.INTERNAL_TOKEN, 1000)
    && bearerToken(request) === clean(env.INTERNAL_TOKEN, 1000);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private" } });
}

export function isKenjiRecommendationRpcRequest(path, method = "") {
  return path === KENJI_RECOMMENDATION_RPC_PATH
    && ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(String(method).toUpperCase());
}

export async function handleKenjiRecommendationRpc(request, env = {}, options = {}) {
  if (!authorized(request, env)) return json({ ok: false, error: "internal_auth_required" }, 401);
  if (request.method.toUpperCase() !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const mode = recommendationMode(env);
  if (!ACTIVE_RECOMMENDATION_MODES.has(mode)) {
    return json({ ok: false, error: "recommendation_layer_disabled" }, 503);
  }
  const contentType = clean(request.headers.get("content-type")).split(";", 1)[0].toLowerCase();
  if (contentType !== "application/json") return json({ ok: false, error: "invalid_content_type" }, 415);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_json" }, 400);
  try {
    const result = await resolveKenjiRecommendationPreview(env, body, options);
    if (result.ok === false && ["canonical_line_identity_required", "invalid_evaluated_at"].includes(result.error)) return json(result, 400);
    return json({ ...result, deployment_mode: mode });
  } catch (error) {
    if (error instanceof KenjiRecommendationSourceError) return json({ ok: false, error: error.code }, 503);
    return json({ ok: false, error: "recommendation_failed" }, 500);
  }
}
