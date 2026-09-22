import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CLIENT_INTELLIGENCE_AUDIT_PATH,
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
  const response = await handleClientIntelligenceAuditRequest(
    request({ action: "copy", client_id: CLIENT_ID, owner_review_confirmed: true }),
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
