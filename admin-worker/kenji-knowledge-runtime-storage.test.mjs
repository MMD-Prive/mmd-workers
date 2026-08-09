import assert from "node:assert/strict";
import test from "node:test";

import { handleKenjiKnowledgeRequest } from "./src/kenji-knowledge-runtime.js";

const ENV = {
  ADMIN_BEARER: "test_admin_bearer",
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
      Authorization: `Bearer ${ENV.ADMIN_BEARER}`,
      ...(init.headers || {}),
    },
  });
}

test("published runtime returns Airtable cards instead of readiness-only empty state", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    assert.match(String(url), /api\.airtable\.com\/v0\/appsV1ILPRfIjkaYg\/tblsLd1uVOtG2kHoU/);
    assert.equal(init.headers.Authorization, "Bearer test_airtable_key");
    return Response.json({
      records: [
        {
          id: "recKnowledge001",
          createdTime: "2026-08-09T16:30:28.000Z",
          fields: {
            knowledge_id: "kenji_20_006_payment_proof",
            title: "Kenji AI 2.0 — Payment Proof Handoff",
            category: "payment",
            language: "th",
            customer_answer: "MMD จะรับหลักฐานไว้ตรวจยอดจริงก่อนอัปเดตขั้นตอนถัดไป",
            internal_instruction: "Proof is evidence only.",
            status: "active",
            response_mode: "handoff_required",
            risk_level: "critical",
            effective_from: "2026-08-09",
          },
        },
      ],
    });
  };

  try {
    const response = await handleKenjiKnowledgeRequest(request("/v1/internal/kenji/knowledge/published"), ENV);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.mode, "published_runtime");
    assert.equal(body.data_status, "live");
    assert.equal(body.storage.persisted, true);
    assert.equal(body.cards.length, 1);
    assert.equal(body.cards[0].knowledge_id, "kenji_20_006_payment_proof");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("draft endpoint persists a Knowledge Board record when Airtable is configured", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(init.method, "POST");
    const payload = JSON.parse(init.body);
    assert.equal(payload.records[0].fields.knowledge_id, "kenji_runtime_test");
    assert.equal(payload.records[0].fields.status, "active");
    return Response.json({
      records: [
        {
          id: "recRuntimeDraft",
          createdTime: "2026-08-09T16:40:00.000Z",
          fields: payload.records[0].fields,
        },
      ],
    });
  };

  try {
    const response = await handleKenjiKnowledgeRequest(request("/v1/admin/kenji/knowledge/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        knowledge_id: "kenji_runtime_test",
        title: "Runtime test",
        category: "admin_policy",
        customer_answer: "รับหลักฐานแล้ว · รอตรวจยอดจริง",
        status: "active",
      }),
    }), ENV);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.storage.persisted, true);
    assert.equal(body.record_id, "recRuntimeDraft");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("static fallback still prevents empty published cards when Airtable env is missing", async () => {
  const response = await handleKenjiKnowledgeRequest(request("/v1/internal/kenji/knowledge/published"), {
    ADMIN_BEARER: ENV.ADMIN_BEARER,
    ALLOWED_ORIGINS: ENV.ALLOWED_ORIGINS,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.storage.persisted, false);
  assert.ok(body.cards.length >= 6);
});
