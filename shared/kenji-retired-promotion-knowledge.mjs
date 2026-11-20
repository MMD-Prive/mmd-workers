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
