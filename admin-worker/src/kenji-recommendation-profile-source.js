import {
  KENJI_RECOMMENDATION_CONTEXT_SCHEMA,
  keywordTokens,
  normalizeLane,
  safeDisplayText,
  safeModelKey,
  text,
  token,
  unique,
} from "../../shared/kenji-recommendation-contract-v1.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const PROFILE_TABLE_FALLBACK = "MMD — Model Keyword Profiles";
const MAX_PROFILE_SCAN = 300;
const MAX_DISCOVERY_CANDIDATES = 12;
const ACTIVE_PROFILE_STATES = new Set(["active", "approved", "published", "live"]);
const REVIEWED_STATES = new Set(["approved", "reviewed", "verified", "materialized"]);

export class KenjiRecommendationSourceError extends Error {
  constructor(code = "recommendation_source_unavailable") {
    super(code);
    this.name = "KenjiRecommendationSourceError";
    this.code = code;
  }
}

function rawList(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/[\n,|]/);
}

function firstField(fields = {}, names = []) {
  for (const name of names) {
    const value = fields?.[name];
    if (Array.isArray(value) && value.length) return value;
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return "";
}

function boolish(value) {
  if (value === true || value === false) return value;
  return ["1", "true", "yes", "on", "active", "approved"].includes(token(value));
}

export function projectKenjiRecommendationProfile(record = {}) {
  const fields = record.fields && typeof record.fields === "object" ? record.fields : {};
  const modelKey = safeModelKey(firstField(fields, ["model_key", "model_code", "model_lookup_key", "unique_key"]));
  const status = token(firstField(fields, ["status", "profile_status"]));
  if (!modelKey || !ACTIVE_PROFILE_STATES.has(status)) return null;
  const customerSafeInfo = safeDisplayText(firstField(fields, ["customer_safe_info", "customer_safe_summary"]), 800);
  const customerSafeRemark = safeDisplayText(firstField(fields, ["customer_safe_remark", "safe_remark"]), 500);
  const positiveDescription = safeDisplayText(firstField(fields, ["positive_sensitive_description"]), 500);
  const lane = normalizeLane(firstField(fields, [
    "model_lane", "service_lane", "orientation_label", "orientation",
    "model_orientation", "model_gender", "Model Gender",
  ]));
  const releaseStatus = token(firstField(fields, ["release_status", "new_release_status"]));
  const isNewRelease = boolish(firstField(fields, ["is_new_release", "new_release"])) || releaseStatus === "new_release";
  return {
    model_key: modelKey,
    working_name: safeDisplayText(firstField(fields, ["working_name", "display_name", "Display Name"]), 120),
    model_lane: lane,
    safe_keywords: unique([
      ...keywordTokens(firstField(fields, ["search_aliases", "aliases"]), 24),
      ...keywordTokens(customerSafeInfo, 20),
      ...keywordTokens(customerSafeRemark, 16),
      ...keywordTokens(positiveDescription, 16),
    ], 48),
    summary: customerSafeInfo || customerSafeRemark,
    is_new_release: isNewRelease,
    release_status: isNewRelease ? "new_release" : "",
  };
}

export function recommendationDiscoveryContext(body = {}) {
  const request = body.request && typeof body.request === "object" ? body.request : {};
  const customer = body.customer_context && typeof body.customer_context === "object" ? body.customer_context : {};
  const identity = customer.identity && typeof customer.identity === "object" ? customer.identity : {};
  const safety = customer.safety && typeof customer.safety === "object" ? customer.safety : {};
  const mayPersonalize = text(customer.schema_version, 100) === KENJI_RECOMMENDATION_CONTEXT_SCHEMA
    && customer.context_only === true
    && customer.live_truth_wins === true
    && token(identity.state) === "known"
    && token(identity.confidence) === "high"
    && safety.may_personalize === true
    && safety.review_required !== true
    && safety.stale !== true;
  const terms = [...keywordTokens(request.preferences, 20)];
  const touched = new Set();
  if (mayPersonalize) {
    for (const item of rawList(customer.reviewed_preferences)) {
      if (!item || typeof item !== "object" || !REVIEWED_STATES.has(token(item.review_status || item.status))) continue;
      terms.push(...keywordTokens(item.normalized_summary || item.customer_safe_summary || item.summary || item.preference, 12));
    }
    for (const item of rawList(customer.prior_model_touches)) {
      const key = safeModelKey(typeof item === "string" ? item : item?.model_key || item?.model_ref || item?.key);
      if (key) touched.add(key.toLowerCase());
    }
  }
  return { terms: unique(terms, 32), touched };
}

export function shortlistRecommendationProfiles(profiles = [], body = {}) {
  const context = recommendationDiscoveryContext(body);
  return profiles
    .map((profile) => {
      const keywords = new Set(profile.safe_keywords || []);
      let score = context.terms.filter((term) => keywords.has(term)).length * 10;
      if (context.touched.has(profile.model_key.toLowerCase())) score += 18;
      if (profile.is_new_release && score > 0) score += 5;
      return { profile, score };
    })
    .sort((left, right) => right.score - left.score || left.profile.model_key.localeCompare(right.profile.model_key))
    .slice(0, MAX_DISCOVERY_CANDIDATES)
    .map((item) => item.profile);
}

export async function fetchKenjiRecommendationProfiles(env = {}, fetchImpl = fetch) {
  const apiKey = text(env.AIRTABLE_API_KEY, 1200);
  const baseId = text(env.AIRTABLE_BASE_ID, 200);
  const table = text(env.AIRTABLE_TABLE_MODEL_KEYWORD_PROFILES_ID || env.AIRTABLE_TABLE_MODEL_KEYWORD_PROFILES || PROFILE_TABLE_FALLBACK, 200);
  if (!apiKey || !baseId || !table) throw new KenjiRecommendationSourceError("keyword_profile_source_unconfigured");
  const records = [];
  let offset = "";
  do {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    let response;
    try {
      response = await fetchImpl(url.toString(), { method: "GET", headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } });
    } catch {
      throw new KenjiRecommendationSourceError("keyword_profile_source_unavailable");
    }
    if (!response.ok) throw new KenjiRecommendationSourceError("keyword_profile_source_unavailable");
    const payload = await response.json().catch(() => ({}));
    records.push(...(Array.isArray(payload?.records) ? payload.records : []));
    offset = text(payload?.offset, 200);
  } while (offset && records.length < MAX_PROFILE_SCAN);
  return records.slice(0, MAX_PROFILE_SCAN).map(projectKenjiRecommendationProfile).filter(Boolean);
}
