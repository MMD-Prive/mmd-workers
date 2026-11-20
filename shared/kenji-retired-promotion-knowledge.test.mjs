import test from "node:test";
import assert from "node:assert/strict";
import {
  RETIRED_KENJI_PROMOTION_KNOWLEDGE_IDS,
  isRetiredKenjiPromotionKnowledge,
  isUnverifiedKenjiPromotionKnowledge,
} from "./kenji-retired-promotion-knowledge.mjs";

test("the original retired IDs stay explicitly archived", () => {
  assert.equal(RETIRED_KENJI_PROMOTION_KNOWLEDGE_IDS.length, 2);
  for (const id of RETIRED_KENJI_PROMOTION_KNOWLEDGE_IDS) {
    assert.equal(isRetiredKenjiPromotionKnowledge({ knowledge_id: id }), true);
    assert.equal(isUnverifiedKenjiPromotionKnowledge({ knowledge_id: id }), true);
  }
});

test("unverified campaign copy is quarantined regardless of active/published labels", () => {
  const cases = [
    { knowledge_id: "kenji_sep2026_membership_sales_01_overview", status: "active", category: "membership" },
    { knowledge_id: "kenji_sep2026_membership_sales_02_double_moment", workflow_stage: "published", category: "membership" },
    { knowledge_id: "kenji_sep2026_membership_sales_03_care_back", category: "membership" },
    { knowledge_id: "kenji_sep2026_membership_sales_08_wish_coupon", category: "membership" },
    { knowledge_id: "sigil_kb_20260904_care_back_coupon_booking_flow_001", response_mode: "draft_only" },
    { knowledge_id: "random_active_campaign", category: "promotion", status: "active" },
    { knowledge_id: "unknown", title: "Double Moment 180 days", category: "membership" },
    { knowledge_id: "unknown", source_path: "/promotion/6-years-care-back", category: "faq" },
    { knowledge_id: "unknown", customer_answer: "CARE BACK ให้เครดิตที่ยืนยันแล้ว 180 วัน", category: "faq" },
    { knowledge_id: "unknown", customer_answer: "คูปองส่วนลดแคมเปญเดือนกันยายน", category: "membership" },
  ];
  for (const card of cases) {
    assert.equal(isUnverifiedKenjiPromotionKnowledge(card), true, JSON.stringify(card));
  }
});

test("non-campaign guidance is not removed from published knowledge", () => {
  for (const card of [
    { knowledge_id: "kenji_20_001_role", title: "Kenji member concierge role", category: "admin_policy" },
    { knowledge_id: "kenji_20_006_payment_proof", title: "Payment proof handoff", category: "payment", source_path: "/member/payments" },
    { knowledge_id: "mmd_generic_info", title: "MMD คืออะไร", category: "faq", customer_answer: "ข้อมูลทั่วไปเกี่ยวกับ MMD" },
  ]) {
    assert.equal(isUnverifiedKenjiPromotionKnowledge(card), false, JSON.stringify(card));
  }
});
