import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CLIENT_INTELLIGENCE_AUDIT_PATH,
  CLIENT_INTELLIGENCE_FEEDBACK_SCHEMA,
  handleClientIntelligenceAuditRequest,
  isClientIntelligenceAuditRequest,
} from "./src/client-intelligence-audit.js";

const CLIENT_ID = "recCLIENT12345678";
const ACTOR = { id: "per@example.com", role: "owner" };

function request(body = {}, method = "POST") {
  const options = {
    method,
    headers: { "content-type": "application/json", origin: "https://mmdbkk.com" },
  };
  if (method !== "GET" && method !== "HEAD") options.body = JSON.stringify(body);
  return new Request(`https://mmdbkk.com${CLIENT_INTELLIGENCE_AUDIT_PATH}`, options);
}

function projection(overrides = {}) {
  const base = {
    ok: true,
    client_id: CLIENT_ID,
    identity: {
      status: "canonical",
      verified: true,
      display_name: "วินนี่",
    },
    ai: {
      continuity_status: {
        source_status: "live",
        freshness: "fresh",
        context_only: true,
        live_truth_wins: true,
      },
      suggested_reply: {
        schema: "mmd.kenji_continuity_operator_draft.v1",
        mode: "operator_draft",
        available: true,
        text: "คุณวินนี่ครับ ผมต่อจากเรื่องชำระเงินเดิมให้ได้เลยครับ เดี๋ยวตรวจสถานะล่าสุดก่อนนะครับ",
        send_allowed: false,
        requires_owner_review: true,
        guardrails: {
          customer_auto_send: false,
          business_truth_claims: false,
          memory_is_context_only: true,
        },
      },
      runtime_controls: {
        status: "live",
        line_oa_kill_switch: "clear",
        all_mutations_kill_switch: "clear",
        operator_copy_allowed: true,
      },
    },
  };
  return {
    ...base,
    ...overrides,
    identity: { ...base.identity, ...(overrides.identity || {}) },
    ai: {
      ...base.ai,
      ...(overrides.ai || {}),
      continuity_status: {
        ...base.ai.continuity_status,
        ...(overrides.ai?.continuity_status || {}),
      },
      suggested_reply: {
        ...base.ai.suggested_reply,
        ...(overrides.ai?.suggested_reply || {}),
        guardrails: {
          ...base.ai.suggested_reply.guardrails,
          ...(overrides.ai?.suggested_reply?.guardrails || {}),
        },
      },
      runtime_controls: {
        ...base.ai.runtime_controls,
        ...(overrides.ai?.runtime_controls || {}),
      },
    },
  };
}

function auditEnv(capture) {
  return {
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_API_KEY: "patTest",
    AIRTABLE_TABLE_ACCESS_LOG: "System — Access Log",
    AIRTABLE_HTTP: {
      async fetch(url, init) {
        capture.value = { url, init, body: JSON.parse(init.body) };
        return new Response(JSON.stringify({ records: [{ id: "recAudit" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  };
}

async function issueFeedbackReceipt(capture, overrides = {}) {
  const response = await handleClientIntelligenceAuditRequest(
    request({
      action: "feedback",
      client_id: CLIENT_ID,
      owner_review_confirmed: true,
      feedback_schema: CLIENT_INTELLIGENCE_FEEDBACK_SCHEMA,
      outcome: "accepted",
      reason_code: "ready_as_is",
    }),
    auditEnv(capture),
    ACTOR,
    { loadProjection: async () => projection(overrides) },
  );
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.copy_eligible, true);
  assert.match(body.feedback_receipt, /^v1\./);
  return body.feedback_receipt;
}

test("operator draft audit route is exact POST-only", () => {
  assert.equal(isClientIntelligenceAuditRequest(CLIENT_INTELLIGENCE_AUDIT_PATH, "POST"), true);
  assert.equal(isClientIntelligenceAuditRequest(`${CLIENT_INTELLIGENCE_AUDIT_PATH}/extra`, "POST"), false);
  assert.equal(isClientIntelligenceAuditRequest(CLIENT_INTELLIGENCE_AUDIT_PATH, "GET"), false);
});

test("active admin entrypoint keeps audit credential-bound and same-origin", async () => {
  const source = await readFile(new URL("./src/admin-login-hero-worker-pre-model-line-link.js", import.meta.url), "utf8");
  assert.match(source, /path === CLIENT_INTELLIGENCE_AUDIT_PATH/);
  assert.match(source, /request\.headers\.get\("Origin"\) !== url\.origin/);
  assert.match(source, /readCredentialBoundAdminActor\(request, env\)/);
  assert.match(source, /handleClientIntelligenceAuditRequest\(request, env, actor\)/);
});

test("safe copy authorization writes only bounded hashed audit fields", async () => {
  const capture = {};
  const feedbackReceipt = await issueFeedbackReceipt(capture);
  const response = await handleClientIntelligenceAuditRequest(
    request({
      action: "copy",
      client_id: CLIENT_ID,
      owner_review_confirmed: true,
      feedback_receipt: feedbackReceipt,
    }),
    auditEnv(capture),
    ACTOR,
    { loadProjection: async () => projection() },
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  assert.equal(body.audit_state, "copy_authorized");
  assert.equal(body.customer_delivery_attempted, false);
  assert.equal(body.business_truth_mutated, false);
  assert.match(capture.value.url, /System%20%E2%80%94%20Access%20Log$/);
  assert.deepEqual(
    Object.keys(capture.value.body.records[0].fields).sort(),
    ["Action", "Event ID", "Result"].sort(),
  );
  assert.equal(
    capture.value.body.records[0].fields.Action,
    "client.intelligence.operator_draft.copy_authorized",
  );
  assert.equal(capture.value.body.records[0].fields.Result, "success");
  const stored = JSON.stringify(capture.value.body);
  assert.doesNotMatch(stored, /recCLIENT12345678|วินนี่|เรื่องชำระเงิน|per@example\.com|operator_draft\.v1/);
});

test("copy audit requires explicit owner review and a clear runtime control snapshot", async () => {
  const noReview = await handleClientIntelligenceAuditRequest(
    request({ action: "copy", client_id: CLIENT_ID }),
    {},
    ACTOR,
    { loadProjection: async () => projection() },
  );
  assert.equal(noReview.status, 422);
  assert.equal((await noReview.json()).error, "owner_review_confirmation_required");

  const killed = await handleClientIntelligenceAuditRequest(
    request({ action: "copy", client_id: CLIENT_ID, owner_review_confirmed: true }),
    {},
    ACTOR,
    {
      loadProjection: async () => projection({
        ai: { runtime_controls: { operator_copy_allowed: false, line_oa_kill_switch: "active" } },
      }),
    },
  );
  assert.equal(killed.status, 423);
  assert.equal((await killed.json()).error, "kill_switch_active");

  const unknown = await handleClientIntelligenceAuditRequest(
    request({ action: "copy", client_id: CLIENT_ID, owner_review_confirmed: true }),
    {},
    ACTOR,
    {
      loadProjection: async () => projection({
        ai: { runtime_controls: { status: "unavailable", operator_copy_allowed: false } },
      }),
    },
  );
  assert.equal(unknown.status, 503);
  assert.equal((await unknown.json()).error, "runtime_control_unavailable");
});

test("view audit remains observable while an active kill switch keeps copy locked", async () => {
  const capture = {};
  const response = await handleClientIntelligenceAuditRequest(
    request({ action: "view", client_id: CLIENT_ID }),
    auditEnv(capture),
    ACTOR,
    {
      loadProjection: async () => projection({
        ai: { runtime_controls: { operator_copy_allowed: false, line_oa_kill_switch: "active" } },
      }),
    },
  );
  assert.equal(response.status, 201);
  assert.equal((await response.json()).audit_state, "view_recorded");
  assert.equal(capture.value.body.records[0].fields.Action, "client.intelligence.operator_draft.viewed");
});

test("operator feedback stores one bounded outcome without customer or draft content", async () => {
  const capture = {};
  const response = await handleClientIntelligenceAuditRequest(
    request({
      action: "feedback",
      client_id: CLIENT_ID,
      owner_review_confirmed: true,
      feedback_schema: CLIENT_INTELLIGENCE_FEEDBACK_SCHEMA,
      outcome: "needs_edit",
      reason_code: "tone_adjustment",
    }),
    auditEnv(capture),
    ACTOR,
    { loadProjection: async () => projection() },
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.audit_state, "feedback_recorded");
  assert.equal(body.feedback_schema, CLIENT_INTELLIGENCE_FEEDBACK_SCHEMA);
  assert.deepEqual(body.operator_feedback, {
    outcome: "needs_edit",
    reason_code: "tone_adjustment",
  });
  assert.equal(body.operator_feedback_recorded, true);
  assert.equal(body.copy_eligible, true);
  assert.match(body.feedback_receipt, /^v1\./);
  assert.match(body.feedback_receipt_expires_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(body.customer_delivery_attempted, false);
  assert.equal(body.business_truth_mutated, false);
  assert.deepEqual(
    Object.keys(capture.value.body.records[0].fields).sort(),
    ["Action", "Event ID", "Result"].sort(),
  );
  assert.equal(
    capture.value.body.records[0].fields.Action,
    "client.intelligence.operator_draft.feedback.needs_edit.tone_adjustment",
  );
  const stored = JSON.stringify(capture.value.body);
  assert.doesNotMatch(stored, /recCLIENT12345678|วินนี่|เรื่องชำระเงิน|per@example\.com|operator_draft\.v1/);
  assert.doesNotMatch(body.feedback_receipt, /recCLIENT12345678|วินนี่|เรื่องชำระเงิน|per@example\.com/);
});

test("feedback remains available for observation while a kill switch keeps copy locked", async () => {
  const capture = {};
  const response = await handleClientIntelligenceAuditRequest(
    request({
      action: "feedback",
      client_id: CLIENT_ID,
      owner_review_confirmed: true,
      feedback_schema: CLIENT_INTELLIGENCE_FEEDBACK_SCHEMA,
      outcome: "rejected",
      reason_code: "stale_context",
    }),
    auditEnv(capture),
    ACTOR,
    {
      loadProjection: async () => projection({
        ai: { runtime_controls: { operator_copy_allowed: false, line_oa_kill_switch: "active" } },
      }),
    },
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.audit_state, "feedback_recorded");
  assert.equal(body.copy_eligible, false);
  assert.equal(body.feedback_receipt, null);
  assert.equal(
    capture.value.body.records[0].fields.Action,
    "client.intelligence.operator_draft.feedback.rejected.stale_context",
  );
});

test("copy requires a fresh feedback receipt bound to actor and current draft", async () => {
  const missing = await handleClientIntelligenceAuditRequest(
    request({ action: "copy", client_id: CLIENT_ID, owner_review_confirmed: true }),
    auditEnv({}),
    ACTOR,
    { loadProjection: async () => projection() },
  );
  assert.equal(missing.status, 409);
  assert.equal((await missing.json()).error, "operator_feedback_receipt_required");

  const capture = {};
  const receipt = await issueFeedbackReceipt(capture);
  const tampered = `${receipt.slice(0, -1)}${receipt.endsWith("a") ? "b" : "a"}`;
  const invalidSignature = await handleClientIntelligenceAuditRequest(
    request({
      action: "copy",
      client_id: CLIENT_ID,
      owner_review_confirmed: true,
      feedback_receipt: tampered,
    }),
    auditEnv({}),
    ACTOR,
    { loadProjection: async () => projection() },
  );
  assert.equal(invalidSignature.status, 409);

  const wrongActor = await handleClientIntelligenceAuditRequest(
    request({
      action: "copy",
      client_id: CLIENT_ID,
      owner_review_confirmed: true,
      feedback_receipt: receipt,
    }),
    auditEnv({}),
    { id: "another-owner@example.com", role: "owner" },
    { loadProjection: async () => projection() },
  );
  assert.equal(wrongActor.status, 409);

  const changedDraft = await handleClientIntelligenceAuditRequest(
    request({
      action: "copy",
      client_id: CLIENT_ID,
      owner_review_confirmed: true,
      feedback_receipt: receipt,
    }),
    auditEnv({}),
    ACTOR,
    {
      loadProjection: async () => projection({
        ai: { suggested_reply: { text: "คุณวินนี่ครับ ผมจะตรวจเรื่องเดิมจากระบบล่าสุดให้นะครับ" } },
      }),
    },
  );
  assert.equal(changedDraft.status, 409);
});

test("copy rejects an expired feedback receipt", async () => {
  const issuedAt = Date.parse("2026-09-22T12:00:00.000Z");
  const feedback = await handleClientIntelligenceAuditRequest(
    request({
      action: "feedback",
      client_id: CLIENT_ID,
      owner_review_confirmed: true,
      feedback_schema: CLIENT_INTELLIGENCE_FEEDBACK_SCHEMA,
      outcome: "accepted",
      reason_code: "ready_as_is",
    }),
    auditEnv({}),
    ACTOR,
    {
      loadProjection: async () => projection(),
      now: () => issuedAt,
    },
  );
  const receipt = (await feedback.json()).feedback_receipt;
  assert.match(receipt, /^v1\./);

  const expired = await handleClientIntelligenceAuditRequest(
    request({
      action: "copy",
      client_id: CLIENT_ID,
      owner_review_confirmed: true,
      feedback_receipt: receipt,
    }),
    auditEnv({}),
    ACTOR,
    {
      loadProjection: async () => projection(),
      now: () => issuedAt + (11 * 60 * 1000),
    },
  );
  assert.equal(expired.status, 409);
  assert.equal((await expired.json()).error, "operator_feedback_receipt_required");
});

test("feedback rejects unreviewed, mismatched, free-text, and unknown-field payloads", async () => {
  const attempts = [
    {
      body: {
        action: "feedback",
        client_id: CLIENT_ID,
        feedback_schema: CLIENT_INTELLIGENCE_FEEDBACK_SCHEMA,
        outcome: "accepted",
        reason_code: "ready_as_is",
      },
      status: 422,
      error: "owner_review_confirmation_required",
    },
    {
      body: {
        action: "feedback",
        client_id: CLIENT_ID,
        owner_review_confirmed: true,
        feedback_schema: CLIENT_INTELLIGENCE_FEEDBACK_SCHEMA,
        outcome: "accepted",
        reason_code: "tone_adjustment",
      },
      status: 422,
      error: "invalid_operator_feedback",
    },
    {
      body: {
        action: "feedback",
        client_id: CLIENT_ID,
        owner_review_confirmed: true,
        feedback_schema: CLIENT_INTELLIGENCE_FEEDBACK_SCHEMA,
        outcome: "needs_edit",
        reason_code: "free text from operator",
      },
      status: 422,
      error: "invalid_operator_feedback",
    },
    {
      body: {
        action: "feedback",
        client_id: CLIENT_ID,
        owner_review_confirmed: true,
        feedback_schema: CLIENT_INTELLIGENCE_FEEDBACK_SCHEMA,
        outcome: "rejected",
        reason_code: "wrong_context",
        edited_text: "must never be accepted",
      },
      status: 400,
      error: "invalid_request_fields",
    },
  ];

  for (const attempt of attempts) {
    const response = await handleClientIntelligenceAuditRequest(
      request(attempt.body),
      {},
      ACTOR,
      { loadProjection: async () => projection() },
    );
    assert.equal(response.status, attempt.status);
    assert.equal((await response.json()).error, attempt.error);
  }
});

test("audit fails closed for non-owner actors and unsafe or unavailable drafts", async () => {
  const delegate = await handleClientIntelligenceAuditRequest(
    request({ action: "view", client_id: CLIENT_ID }),
    {},
    { id: "delegate", role: "delegate" },
    { loadProjection: async () => projection() },
  );
  assert.equal(delegate.status, 403);

  for (const unsafe of [
    projection({ client_id: "recOTHER123456789" }),
    projection({ identity: { verified: false } }),
    projection({ ai: { continuity_status: { freshness: "stale" } } }),
    projection({ ai: { continuity_status: { live_truth_wins: false } } }),
    projection({ ai: { suggested_reply: { send_allowed: true } } }),
    projection({ ai: { suggested_reply: { available: false, text: null } } }),
    projection({ ai: { suggested_reply: { guardrails: { customer_auto_send: true } } } }),
  ]) {
    const response = await handleClientIntelligenceAuditRequest(
      request({ action: "view", client_id: CLIENT_ID }),
      {},
      ACTOR,
      { loadProjection: async () => unsafe },
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "operator_draft_unavailable");
  }
});
