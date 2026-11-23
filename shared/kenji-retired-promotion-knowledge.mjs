// Explicitly retired, conflicting pre-November CARE BACK answer cards.
// Preserve the source/history for audit, but do not allow old "published" or
// Airtable "active" flags to re-enable these in any customer-facing read lane.
// A replacement requires a separately approved, revision-bound evidence record.
export const RETIRED_KENJI_PROMOTION_KNOWLEDGE_IDS = Object.freeze([
  "care-back-2026-final-lock-th",
  "kenji_20_011_care_back_2026",
]);

export function isRetiredKenjiPromotionKnowledge(card) {
  const id = String(card?.knowledge_id || card?.id || "").trim().toLowerCase();
  return RETIRED_KENJI_PROMOTION_KNOWLEDGE_IDS.includes(id);
}

// The legacy "published knowledge" endpoint is not the vetted public
// Promotion Evidence Registry. A campaign card may be Airtable "active" while
// its advertised window, policy revision or owner-approved copy is obsolete.
// Hold promotion content here, without changing the original Airtable records
// or operator-visible draft/history routes.
const LEGACY_CAMPAIGN_ID_RE = /^(?:kenji_sep2026_membership_sales_|sigil_kb_20260904_care_back)/i;
const LEGACY_CAMPAIGN_TEXT_RE = /(?:care[\s_-]*back|แคร์[\s_-]*แบ[ก็ค]|double[\s_-]*moment|6[\s_-]*years|6th[\s_-]*anniversary|6[\s_-]*ปี|birthday[\s_-]*wish|คูปองส่วนลด)/i;
const CAMPAIGN_SOURCE_RE = /^(?:\/promotion\/|campaign\/|\/member\/liff\?intent=promo\b)/i;

export function isUnverifiedKenjiPromotionKnowledge(card = {}) {
  if (isRetiredKenjiPromotionKnowledge(card)) return true;
  const id = String(card?.knowledge_id || card?.id || "").trim();
  const category = String(card?.category || card?.payload_json?.category || "").trim().toLowerCase();
  const sources = [card?.source_path, card?.source_ref, card?.payload_json?.source_path, card?.payload_json?.source_ref]
    .filter((value) => typeof value === "string").map((value) => value.trim());
  if (category === "promotion" || LEGACY_CAMPAIGN_ID_RE.test(id) || sources.some((source) => CAMPAIGN_SOURCE_RE.test(source))) return true;
  const campaignCopy = [
    card?.title,
    card?.customer_answer,
    card?.answer,
    card?.payload_json?.customer_answer,
    id,
    ...sources,
  ].filter((part) => typeof part === "string").join(" ");
  return LEGACY_CAMPAIGN_TEXT_RE.test(campaignCopy);
}
