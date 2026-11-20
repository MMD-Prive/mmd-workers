import assert from "node:assert/strict";
import test from "node:test";

import { handleKenjiPublicKnowledgeRequest } from "./src/kenji-public-knowledge-runtime.js";

const ENV = {
  ALLOWED_ORIGINS: "https://mmdbkk.com,https://www.mmdbkk.com",
  AIRTABLE_API_KEY: "test_airtable_key",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_KENJI_KNOWLEDGE_TABLE_ID: "tblsLd1uVOtG2kHoU",
};

function request(path, init = {}) {
  return new Request(`https://mmdbkk.com${path}`, {
    ...init,
    headers: {
      Origin: "https://mmdbkk.com",
      ...(init.headers || {}),
    },
  });
}

test("public published runtime works without admin auth and strips internal fields", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    assert.match(String(url), /api\.airtable\.com\/v0\/appsV1ILPRfIjkaYg\/tblsLd1uVOtG2kHoU/);
    assert.equal(init.headers.Authorization, "Bearer test_airtable_key");
    return Response.json({
      records: [
        {
          id: "recPaymentProof",
          createdTime: "2026-08-09T16:30:28.000Z",
          fields: {
            knowledge_id: "kenji_20_006_payment_proof",
            title: "Kenji AI 2.0 — Payment Proof Handoff",
            category: "payment",
            language: "th",
            customer_answer: "MMD จะรับหลักฐานไว้ตรวจยอดจริงก่อนอัปเดตขั้นตอนถัดไป",
            internal_instruction: "Proof is evidence only. Do not expose this field.",
            review_note: "Internal note must not leak.",
            owner: "Boss Per",
            status: "active",
            response_mode: "handoff_required",
            risk_level: "critical",
            effective_from: "2026-08-09",
            source_path: "/confirm/payment-proof",
          },
        },
        {
          id: "recDeployGate",
          createdTime: "2026-08-09T17:27:44.000Z",
          fields: {
            knowledge_id: "kenji_20_010_cloudflare_deploy_gate",
            title: "Kenji AI 2.0 — Cloudflare Deploy Gate",
            customer_answer: "Cloudflare deploy status should stay internal.",
            status: "active",
          },
        },
        {
          id: "recObsoleteCareBack",
          fields: {
            knowledge_id: "kenji_20_011_care_back_2026",
            title: "Old CARE BACK auto-reply",
            category: "promotion",
            language: "th",
            customer_answer: "Legacy 10% coupon available for 30 days.",
            status: "active",
          },
        },
        {
          id: "recLegacySeptemberSales",
          fields: {
            knowledge_id: "kenji_sep2026_membership_sales_02_double_moment",
            title: "Double Moment 180 days — old published",
            category: "membership", status: "active",
            response_mode: "auto_reply_allowed",
            customer_answer: "Double Moment validity 180 days",
          },
        },
        {
          id: "recLegacyCouponFlow",
          fields: {
            knowledge_id: "sigil_kb_20260904_care_back_coupon_booking_flow_001",
            title: "CARE BACK Coupon to Booking",
            category: "promotion", status: "active",
            customer_answer: "Old Wish coupon flow",
          },
        },
        {
          id: "recUnknownActiveCampaign",
          fields: {
            knowledge_id: "new_campaign_without_proof",
            title: "A newly active campaign with no approved publication revision",
            category: "promotion", status: "active",
            customer_answer: "Unverified member offer",
          },
        },
        {
          id: "recPaymentProofDuplicate",
          createdTime: "2026-08-09T16:31:28.000Z",
          fields: {
            knowledge_id: "kenji_20_006_payment_proof",
            title: "Duplicate payment proof card",
            category: "payment",
            language: "th",
            customer_answer: "This duplicate must not replace the first canonical Airtable row.",
            status: "active",
            response_mode: "handoff_required",
            risk_level: "critical",
          },
        },
      ],
    });
  };

  try {
    const response = await handleKenjiPublicKnowledgeRequest(request("/v1/public/kenji/knowledge/published"), ENV);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.mode, "public_published_runtime");
    assert.equal(body.data_status, "live");
    assert.ok(body.count >= 6);
    assert.deepEqual(body.coverage, {
      airtable_count: 1,
      canonical_fallback_count: body.count - 1,
    });
    assert.equal(body.cards[0].knowledge_id, "kenji_20_006_payment_proof");
    assert.equal(body.cards[0].customer_answer, "MMD จะรับหลักฐานไว้ตรวจยอดจริงก่อนอัปเดตขั้นตอนถัดไป");
    assert.equal(Object.hasOwn(body.cards[0], "internal_instruction"), false);
    assert.equal(Object.hasOwn(body.cards[0], "review_note"), false);
    assert.equal(Object.hasOwn(body.cards[0], "owner"), false);
    assert.equal(Object.hasOwn(body.cards[0], "payload_json"), false);
    assert.equal(body.cards.some((card) => /cloudflare|deploy/i.test(card.title || card.knowledge_id)), false);
    assert.equal(body.cards.filter((card) => card.knowledge_id === "kenji_20_006_payment_proof").length, 1);
    assert.equal(body.cards.some((card) => card.knowledge_id === "kenji_20_011_care_back_2026"), false);
    assert.equal(body.cards.some((card) => /kenji_sep2026_membership_sales_|care_back_coupon_booking_flow|new_campaign_without_proof/.test(card.knowledge_id)), false);
    assert.equal(Object.hasOwn(body.storage, "base_id"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public published runtime falls back to static public cards without Airtable env", async () => {
  const response = await handleKenjiPublicKnowledgeRequest(request("/v1/public/kenji/knowledge/published"), {
    ALLOWED_ORIGINS: ENV.ALLOWED_ORIGINS,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mode, "public_published_runtime");
  assert.equal(body.data_status, "static_fallback");
  assert.equal(body.storage.persisted, false);
  assert.equal(body.coverage.canonical_fallback_count, 0);
  assert.ok(body.cards.length >= 5);
  assert.equal(body.cards.some((card) => Object.hasOwn(card, "internal_instruction")), false);
  assert.equal(body.cards.some((card) => card.knowledge_id === "kenji_20_011_care_back_2026"), false);
});

test("public endpoint supports HEAD without exposing a body", async () => {
  const response = await handleKenjiPublicKnowledgeRequest(request("/v1/public/kenji/knowledge/published", { method: "HEAD" }), {
    ALLOWED_ORIGINS: ENV.ALLOWED_ORIGINS,
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});
