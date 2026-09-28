// Review-only selection. Data adapters must provide verified facts; this module
// never publishes a card, sends an ad, or grants model/customer access.
const DAY_MS = 86_400_000;

function date(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function daysSince(value, now) {
  const when = date(value);
  return Number.isFinite(when) && when <= now ? Math.floor((now - when) / DAY_MS) : -1;
}

function safeId(value) {
  const id = String(value || "").trim();
  return /^rec[A-Za-z0-9]+$/.test(id) ? id : "";
}

function candidate(model, now) {
  const id = safeId(model?.canonical_model_id);
  const ageDays = daysSince(model?.created_at, now);
  const gapDays = model?.last_promoted_at ? daysSince(model.last_promoted_at, now) : ageDays;
  const revenue = Number(model?.verified_completed_revenue_thb);
  if (!id || model?.active !== true || model?.marketing_consent_verified !== true ||
      model?.public_media_approved !== true || model?.promotion_history_complete !== true ||
      model?.completed_revenue_verified !== true || !Number.isFinite(revenue) || revenue < 0 ||
      ageDays < 30 || gapDays < 30) return null;
  return {
    canonical_model_id: id,
    age_days: ageDays,
    days_since_last_promotion: gapDays,
    verified_completed_revenue_thb: revenue,
    // Stable within a month: tenure, confirmed revenue and time without PR.
    score: Math.min(ageDays, 1095) / 1095 * 30 +
      Math.log1p(revenue) / Math.log1p(1_000_000) * 35 +
      Math.min(gapDays, 365) / 365 * 35,
  };
}

export function buildMonthlyModelPromotionReview(models = [], { now = new Date(), maxCandidates = 5 } = {}) {
  const instant = new Date(now);
  if (!Number.isFinite(instant.valueOf())) throw new TypeError("invalid_review_date");
  if (!Array.isArray(models)) throw new TypeError("models_must_be_array");
  const month = instant.toISOString().slice(0, 7);
  const ranked = models.map((model) => candidate(model, instant.valueOf())).filter(Boolean)
    .sort((a, b) => b.score - a.score || a.canonical_model_id.localeCompare(b.canonical_model_id));
  return {
    month,
    mode: "owner_review_only",
    evaluated_at: instant.toISOString(),
    accepted: Math.min(ranked.length, Math.max(0, Math.min(20, Math.floor(maxCandidates) || 0))),
    evidence_missing_or_ineligible: models.length - ranked.length,
    candidates: ranked.slice(0, Math.max(0, Math.min(20, Math.floor(maxCandidates) || 0))),
    publish_authorized: false,
  };
}
