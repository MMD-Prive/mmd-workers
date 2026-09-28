import { MODEL_SALES_POLICY_VERSION } from "./model-sales-control-v1.mjs";
import {
  KENJI_RECOMMENDATION_AVAILABILITY_SCHEMA,
  boolean,
  finite,
  keywordTokens,
  laneCompatible,
  list,
  normalizeLane,
  parseTime,
  safeDisplayText,
  safeHttpsUrl,
  safeModelKey,
  text,
  token,
  unique,
} from "./kenji-recommendation-contract-v1.mjs";
import { operationalFilterState } from "./kenji-recommendation-context-v1.mjs";

const ALLOWED_STATES = new Set(["available_now", "available_today", "available_soon", "limited", "unavailable", "unknown"]);
const READY_STATES = new Set(["available_now", "available_today", "available_soon", "limited"]);

function maxAge(state) {
  if (state === "available_now") return 15 * 60 * 1000;
  if (state === "available_today") return 6 * 60 * 60 * 1000;
  if (state === "available_soon") return 24 * 60 * 60 * 1000;
  if (state === "limited" || state === "unavailable") return 6 * 60 * 60 * 1000;
  return 0;
}

export function normalizeRecommendationAvailability(snapshot, nowMs) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { state: "unknown", fresh: false, customer_ready: false, reason: "availability_missing", city: "", zones: [], operational_flags: {} };
  }
  const trusted = token(snapshot.schema || snapshot.schema_version || snapshot.source_schema) === KENJI_RECOMMENDATION_AVAILABILITY_SCHEMA;
  let state = token(snapshot.safe_availability_state || snapshot.availability_state || "unknown");
  if (!ALLOWED_STATES.has(state)) state = "unknown";
  const updatedAt = parseTime(snapshot.updated_at || snapshot.snapshot_generated_at);
  const expiresAt = parseTime(snapshot.expires_at);
  const future = updatedAt !== null && updatedAt > nowMs + 60_000;
  const stale = updatedAt === null || maxAge(state) === 0 || nowMs - updatedAt > maxAge(state);
  const expired = expiresAt !== null && expiresAt <= nowMs;
  const missingNowExpiry = state === "available_now" && expiresAt === null;
  const fresh = trusted && !future && !stale && !expired && !missingNowExpiry;
  if (!fresh) state = "unknown";
  const flags = {};
  if (snapshot.operational_flags && typeof snapshot.operational_flags === "object") {
    for (const key of ["burn", "mk", "live"]) {
      if (Object.prototype.hasOwnProperty.call(snapshot.operational_flags, key)) flags[key] = boolean(snapshot.operational_flags[key]);
    }
  }
  return {
    state,
    fresh,
    customer_ready: fresh && READY_STATES.has(state),
    reason: !trusted ? "availability_source_untrusted" : expired ? "availability_expired" : future ? "availability_from_future" : stale ? "availability_stale" : missingNowExpiry ? "available_now_expiry_required" : "availability_fresh",
    updated_at: updatedAt === null ? "" : new Date(updatedAt).toISOString(),
    expires_at: expiresAt === null ? "" : new Date(expiresAt).toISOString(),
    city: safeDisplayText(snapshot.city, 80),
    zones: unique(list(snapshot.zones).map((item) => token(item)).filter(Boolean), 12),
    operational_flags: flags,
  };
}

export function normalizeRecommendationCandidate(raw = {}, context = {}) {
  const modelKey = safeModelKey(raw.model_key || raw.model_code);
  const displayName = safeDisplayText(raw.safe_display_name || raw.working_name, 120);
  if (!modelKey || !displayName || raw.access_allowed !== true) return null;
  const modelKeyLower = modelKey.toLowerCase();
  if (context.touches.negative.has(modelKeyLower)) return null;
  const modelLane = normalizeLane(raw.model_lane || raw.lane);
  if (!laneCompatible(context.request.lane, modelLane)) return null;

  const sales = raw.sales && typeof raw.sales === "object" ? raw.sales : {};
  if (text(sales.policy_version, 120) !== MODEL_SALES_POLICY_VERSION || sales.sellable !== true || token(sales.visibility || "off") === "off") return null;
  const availability = normalizeRecommendationAvailability(raw.availability, context.nowMs);
  if (availability.fresh && availability.state === "unavailable") return null;
  if (context.request.city && availability.city && token(availability.city) !== context.request.city) return null;
  const zoneMatches = context.request.zones.filter((zone) => availability.zones.includes(zone));
  if (context.request.zones.length && availability.zones.length && !zoneMatches.length) return null;
  const operationalState = operationalFilterState(context.request.operational_filters, availability.operational_flags);
  if (operationalState === "mismatch") return null;

  const keywords = new Set(unique([
    ...keywordTokens(raw.safe_keywords || raw.keywords, 32),
    ...keywordTokens(raw.search_aliases, 16),
    ...keywordTokens(raw.safe_tags, 16),
  ], 48));
  const requestMatches = context.request.preferences.filter((value) => keywords.has(value));
  const historyMatches = context.preferences.positive.filter((value) => keywords.has(value));
  if (context.preferences.negative.some((value) => keywords.has(value))) return null;

  const rate = finite(sales.customer_rate_thb);
  const priceVisible = sales.price_visible === true && rate !== null;
  if (priceVisible && context.request.budget_max_thb !== null && rate > context.request.budget_max_thb) return null;
  const priceReady = context.request.budget_max_thb === null || priceVisible;
  const cityReady = !context.request.city || (availability.city && token(availability.city) === context.request.city);
  const zoneReady = !context.request.zones.length || zoneMatches.length > 0;
  const locationReady = Boolean(cityReady && zoneReady);

  const touchedPositive = context.touches.positive.has(modelKeyLower);
  const touchedNeutral = context.touches.neutral.has(modelKeyLower);
  const touchedBefore = touchedPositive || touchedNeutral;
  const isNewRelease = raw.is_new_release === true || token(raw.release_status) === "new_release";
  const newReleaseRelevant = isNewRelease && !touchedBefore && (requestMatches.length > 0 || historyMatches.length > 0);
  if (isNewRelease && !touchedBefore && !newReleaseRelevant) return null;

  let score = Math.min(24, requestMatches.length * 8) + Math.min(18, historyMatches.length * 6) + Math.min(12, zoneMatches.length * 6);
  score += availability.state === "available_now" ? 18 : availability.state === "available_today" ? 14 : availability.state === "available_soon" ? 10 : availability.state === "limited" ? 4 : 0;
  if (priceVisible && context.request.budget_max_thb !== null && rate <= context.request.budget_max_thb) score += 6;
  if (touchedPositive) score += 6;
  else if (touchedNeutral) score += 2;
  if (newReleaseRelevant) score += 7;

  const reasons = [];
  if (requestMatches.length) reasons.push("request_preference_match");
  if (historyMatches.length) reasons.push("reviewed_history_match");
  if (zoneMatches.length) reasons.push("zone_match");
  if (availability.customer_ready) reasons.push(availability.state);
  if (priceVisible && context.request.budget_max_thb !== null && rate <= context.request.budget_max_thb) reasons.push("budget_match");
  if (touchedPositive) reasons.push("positive_prior_model_touch");
  if (newReleaseRelevant) reasons.push("new_release_relevant");

  const customerReady = availability.customer_ready && locationReady && priceReady && operationalState === "match";
  const reviewReason = !availability.customer_ready ? availability.reason : !locationReady ? "location_verification_required" : !priceReady ? "price_verification_required" : operationalState !== "match" ? "operational_filter_verification_required" : "review_required";
  return {
    model_key: modelKey,
    safe_display_name: displayName,
    summary: safeDisplayText(raw.summary || raw.customer_safe_summary, 500),
    image_url: safeHttpsUrl(raw.image_url || raw.safe_image_url),
    model_lane: modelLane,
    availability,
    sales: {
      policy_version: MODEL_SALES_POLICY_VERSION,
      sellable: true,
      visibility: token(sales.visibility) || "on",
      customer_rate_thb: priceVisible ? rate : null,
      price_visible: priceVisible,
      requires_per_approval: sales.requires_per_approval === true,
      term_summary: safeDisplayText(sales.term_summary, 240),
      rule_version: Number.isInteger(Number(sales.rule_version)) ? Number(sales.rule_version) : null,
    },
    is_new_release: isNewRelease,
    score,
    match_reasons: unique(reasons, 10),
    customer_ready: customerReady,
    review_reason: reviewReason,
  };
}

export function compareRecommendationCandidates(left, right) {
  if (right.score !== left.score) return right.score - left.score;
  if (left.is_new_release !== right.is_new_release) return left.is_new_release ? 1 : -1;
  return left.model_key.localeCompare(right.model_key);
}

export function publicRecommendation(candidate) {
  return {
    model_key: candidate.model_key,
    safe_display_name: candidate.safe_display_name,
    ...(candidate.summary ? { summary: candidate.summary } : {}),
    ...(candidate.image_url ? { image_url: candidate.image_url } : {}),
    model_lane: candidate.model_lane,
    availability: { state: candidate.availability.state, updated_at: candidate.availability.updated_at, expires_at: candidate.availability.expires_at, city: candidate.availability.city, zones: candidate.availability.zones },
    sales: candidate.sales,
    match_reasons: candidate.match_reasons,
    is_new_release: candidate.is_new_release,
    safe_next_action: candidate.sales.requires_per_approval ? "per_review_before_offer" : "continue_to_booking_review",
  };
}
