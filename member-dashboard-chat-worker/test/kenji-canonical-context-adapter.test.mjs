import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKenjiLineCanonicalContext,
  KENJI_CANONICAL_CONTEXT_ADAPTER_SCHEMA,
} from "../src/kenji-line-canonical-context-adapter.mjs";
import { buildKenjiConversationMatrix } from "../../ai-worker/src/services/kenji-conversation-matrix.js";

const LINE_USER_ID = "U0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-09-21T12:00:00.000Z");

function event(text = "เช็กสถานะที่จ่ายไปแล้วครับ") {
  return {
    type: "message",
    webhookEventId: "evt-phase2",
    source: { type: "user", userId: LINE_USER_ID },
    message: { type: "text", id: "msg-phase2", text },
    deliveryContext: { isRedelivery: false },
  };
}

function canonicalResolverSnapshot() {
  return {
    schema_version: "my_mmd_entitlement_resolver_v1",
    evaluated_at: NOW.toISOString(),
    fail_closed: true,
    member_blocked: false,
    capability_state: {
      active: ["private_premium"],
      expiring_soon: [],
      grace: [],
      inactive: [],
      recognized: ["private_premium"],
    },
    access: {
      public_service_access: true,
      guest_pass_access: false,
      red_card_request_lane: false,
      private_visibility_envelope: "premium",
      protected_allowlist_required: false,
      protected_capabilities_active: [],
      new_model_reveals_allowed: true,
    },
  };
}

function knownEnv() {
  let adminCalls = 0;
  const env = {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const table = decodeURIComponent(url.pathname.split("/").at(-1));
        if (table === "tblVv58TCbwh5j1fS") {
          return Response.json({
            records: [{
              id: "recClientPhase2",
              fields: {
                line_user_id: LINE_USER_ID,
                nickname: "พี่ต้น",
                "Verification Status": { id: "selVerified", name: "Verified", color: "greenBright" },
                "MMD — Client Intelligence Evidence": ["recEvidenceApproved", "recEvidencePending"],
                "Sensitive Information": "must-not-project",
              },
            }],
          });
        }
        if (table === "tblS6iRgPjYLBqZJh") {
          return Response.json({
            records: [{
              id: "recMatrixPhase2",
              fields: {
                matrix_id: "kcm1_line_safe",
                schema_version: "mmd.kenji_conversation_matrix.v1",
                topic: "payment",
                last_customer_intent: "payment_status",
                conversation_stage: { id: "selAwaiting", name: "awaiting_payment_verification", color: "yellowBright" },
                continuity_summary: "Payment proof was received; official verification remains open.",
                important_open_loops_json: "[\"payment_verification\"]",
                handoff_required: true,
                live_truth_required: true,
                live_truth_domains: [{ id: "selPayment", name: "payment", color: "yellowBright" }],
                state_updated_at: "2026-09-21T11:50:00.000Z",
                state_expires_at: "2026-09-28T11:50:00.000Z",
                matrix_status: { id: "selActive", name: "active", color: "greenBright" },
                version: 7,
                payload_json: "must-not-project",
              },
            }],
          });
        }
        if (table === "tblx7NdfHO5iY6qtg") {
          return Response.json({
            records: [
              {
                id: "recEvidenceApproved",
                fields: {
                  evidence_id: "cie_reviewed_1",
                  "Mentioned Model": ["recModelSafe"],
                  evidence_type: { id: "selPreference", name: "model_preference", color: "blueBright" },
                  normalized_summary: "ชอบการคุยที่อบอุ่นและกระชับ",
                  model_relationship_signal: { id: "selRepeat", name: "repeat_interest", color: "blueBright" },
                  preference_strength: { id: "selStrong", name: "strong", color: "greenBright" },
                  review_status: { id: "selReviewed", name: "reviewed", color: "greenBright" },
                  privacy_level: { id: "selSafe", name: "internal_safe", color: "greenBright" },
                  reviewed_at: "2026-09-20T10:00:00.000Z",
                  raw_note: "must-not-project raw private note",
                },
              },
              {
                id: "recEvidencePending",
                fields: {
                  evidence_id: "cie_pending_1",
                  evidence_type: "service_preference",
                  normalized_summary: "pending summary must-not-project",
                  review_status: "pending",
                  privacy_level: "internal_safe",
                },
              },
            ],
          });
        }
        return Response.json({ records: [] });
      },
    },
    MEMBER_PAGES_WORKER: {
      async fetch(request) {
        const body = await request.json();
        assert.equal(body.line_user_id, LINE_USER_ID);
        assert.equal(body.intent, "membership_status");
        return Response.json({
          ok: true,
          authority: "my_mmd_entitlement_resolver_v1",
          identity_status: "resolved",
          membership: { level: "private_premium", lifecycle: "active", expire_at: "2027-09-21" },
          resolver_snapshot: canonicalResolverSnapshot(),
        });
      },
    },
    INTERNAL_TOKEN: "internal-test-token",
    ADMIN_WORKER: {
      async fetch(request) {
        adminCalls += 1;
        assert.equal(request.headers.get("x-mmd-service-binding"), "member-dashboard-chat-worker");
        const body = await request.json();
        assert.equal(body.client.canonical_client_id, "recClientPhase2");
        assert.equal(body.client.line_user_id, LINE_USER_ID);
        return Response.json({
          ok: true,
          schema: "mmd.kenji_live_context_fanin.v1",
          live_truth_complete: true,
          readiness: "blocked",
          job_live: { status: "pending_review" },
          payment_live: { status: "pending" },
          calendar_live: { status: "not_requested" },
        });
      },
    },
  };
  return { env, adminCalls: () => adminCalls };
}

test("Phase 2 adapter supplies exact identity, reviewed evidence, fresh Resolver truth, live state, and bounded continuity", async () => {
  const fixture = knownEnv();
  const result = await buildKenjiLineCanonicalContext({
    env: fixture.env,
    event: event(),
    currentIntent: "payment_status",
    now: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.schema, KENJI_CANONICAL_CONTEXT_ADAPTER_SCHEMA);
  assert.equal(result.context_bundle.identity.state, "known");
  assert.equal(result.context_bundle.identity.canonical_client_ref, "client:recClientPhase2");
  assert.equal(result.context_bundle.identity.preferred_name, "พี่ต้น");
  assert.equal(result.context_bundle.customer_context.entitlement_snapshot.schema_version, "my_mmd_entitlement_resolver_v1");
  assert.equal(result.context_bundle.customer_context.entitlement_snapshot.fail_closed, true);
  assert.equal(result.context_bundle.reviewed_preferences.length, 1);
  assert.equal(result.context_bundle.reviewed_preferences[0].normalized_summary, "ชอบการคุยที่อบอุ่นและกระชับ");
  assert.equal(result.context_bundle.prior_model_touches[0].model_key, "recModelSafe");
  assert.equal(result.context_bundle.continuity.last_intent, "payment_status");
  assert.equal(result.context_bundle.continuity.unresolved_threads[0].type, "payment_verification");
  assert.equal(result.context_bundle.live_state.authority, "admin-worker");
  assert.equal(result.context_bundle.live_state.payment_status, "pending");
  assert.equal(result.context_bundle.domain_guard.handoff_required, true);
  assert.equal(result.telemetry.memory_candidate, true);
  assert.equal(result.telemetry.matrix_version, 7);
  assert.equal(fixture.adminCalls(), 1);

  const matrix = buildKenjiConversationMatrix(result.context_bundle, { now: NOW.toISOString() });
  assert.equal(matrix.identity.state, "known");
  assert.equal(matrix.identity.preferred_name, "พี่ต้น");
  assert.equal(matrix.relationship.returning_customer, true);
  assert.equal(matrix.relationship.reviewed_preferences.length, 1);
  assert.equal(matrix.current_state.resolver_snapshot_valid, true);
  assert.equal(matrix.current_state.lifecycle, "active");
  assert.equal(matrix.continuity.last_intent, "payment_status");
  assert.equal(matrix.safety.handoff_required, true);
  assert.equal(matrix.safety.may_confirm_payment, false);
  assert.equal(matrix.safety.memory_is_context_only, true);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, new RegExp(LINE_USER_ID));
  assert.doesNotMatch(serialized, /must-not-project|raw private note|pending summary/i);
  assert.doesNotMatch(serialized, /authorization|internal-test-token/i);
});

test("multiple exact Clients fail identity closed and never invoke protected live fan-in", async () => {
  let adminCalls = 0;
  const env = {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const table = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
        if (table === "tblVv58TCbwh5j1fS") {
          return Response.json({ records: [
            { id: "recClientOne", fields: { nickname: "หนึ่ง" } },
            { id: "recClientTwo", fields: { nickname: "สอง" } },
          ] });
        }
        return Response.json({ records: [] });
      },
    },
    MEMBER_PAGES_WORKER: { fetch: async () => new Response("{}", { status: 503 }) },
    INTERNAL_TOKEN: "internal-test-token",
    ADMIN_WORKER: { fetch: async () => { adminCalls += 1; return Response.json({}); } },
  };

  const result = await buildKenjiLineCanonicalContext({ env, event: event(), currentIntent: "payment_status", now: NOW });
  assert.equal(result.context_bundle.identity.state, "ambiguous");
  assert.equal(result.context_bundle.identity.preferred_name, "");
  assert.deepEqual(result.context_bundle.reviewed_preferences, []);
  assert.equal(result.context_bundle.domain_guard.review_required, true);
  assert.equal(result.telemetry.memory_candidate, false);
  assert.equal(adminCalls, 0);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(LINE_USER_ID));
});


test("reviewed Customer History Reviews supply safe model history and fresh resolver confirmation upgrades exact identity confidence", async () => {
  let adminCalls = 0;
  const env = {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const table = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
        if (table === "tblVv58TCbwh5j1fS") {
          return Response.json({
            records: [{
              id: "recClientHistory",
              fields: {
                line_user_id: LINE_USER_ID,
                nickname: "ลูกค้าเดิม",
                "MMD — Customer History Reviews": ["recHistoryApproved", "recHistoryHeld"],
              },
            }],
          });
        }
        if (table === "tblS6iRgPjYLBqZJh") {
          return Response.json({
            records: [{
              id: "recMatrixHistory",
              fields: {
                matrix_id: "kcm1_history_safe",
                schema_version: "mmd.kenji_conversation_matrix.v1",
                last_customer_intent: "mmd_companion",
                conversation_stage: { id: "selResolved", name: "resolved", color: "greenBright" },
                continuity_summary: "Previous companion conversation resolved.",
                matrix_status: { id: "selActive", name: "active", color: "greenBright" },
                state_updated_at: "2026-09-21T11:30:00.000Z",
                version: 12,
              },
            }],
          });
        }
        if (table === "tblx7NdfHO5iY6qtg") {
          return Response.json({ records: [] });
        }
        if (table === "tblnpDFQMpo8AmNQv") {
          return Response.json({
            records: [
              {
                id: "recHistoryApproved",
                fields: {
                  history_review_id: "hist_safe_1",
                  review_status: { id: "selMaterialized", name: "materialized", color: "greenBright" },
                  decision: { id: "selApprove", name: "approve_service_history", color: "greenBright" },
                  approved_model_text: "Man",
                  approved_service_date: "2024-08-31",
                  approved_service_type: "PN",
                  reviewed_at: "2026-09-13T21:00:00.000Z",
                  review_note: "must-not-project history note",
                  approved_payment_ref: "must-not-project-payment-ref",
                },
              },
              {
                id: "recHistoryHeld",
                fields: {
                  history_review_id: "hist_held_1",
                  review_status: { id: "selNeeds", name: "needs_more_evidence", color: "yellowBright" },
                  decision: { id: "selHold", name: "hold_for_review", color: "yellowBright" },
                  approved_model_text: "MustNotAppear",
                },
              },
            ],
          });
        }
        return Response.json({ records: [] });
      },
    },
    MEMBER_PAGES_WORKER: {
      async fetch(request) {
        const body = await request.json();
        assert.equal(body.line_user_id, LINE_USER_ID);
        return Response.json({
          ok: true,
          authority: "my_mmd_entitlement_resolver_v1",
          identity_status: "resolved",
          membership: { level: "premium", lifecycle: "active", expire_at: "2029-09-10" },
          resolver_snapshot: canonicalResolverSnapshot(),
        });
      },
    },
    INTERNAL_TOKEN: "internal-test-token",
    ADMIN_WORKER: {
      async fetch() {
        adminCalls += 1;
        return Response.json({});
      },
    },
  };

  const result = await buildKenjiLineCanonicalContext({
    env,
    event: event("แนะนำ model ให้หน่อย"),
    currentIntent: "line_event",
    now: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.context_bundle.identity.state, "known");
  assert.equal(result.context_bundle.identity.confidence, "high");
  assert.equal(result.context_bundle.identity.source, "exact_line_canonical_client");
  assert.equal(result.context_bundle.customer_context.entitlement_snapshot.access.private_visibility_envelope, "premium");
  assert.equal(result.context_bundle.prior_model_touches.length, 1);
  assert.equal(result.context_bundle.prior_model_touches[0].model_key, "Man");
  assert.equal(result.context_bundle.prior_model_touches[0].relationship, "completed");
  assert.equal(result.context_bundle.prior_model_touches[0].source, "reviewed_customer_history");
  assert.equal(result.context_bundle.customer_context.evidence_sources.recognition_history.state, "FOUND");
  assert.equal(result.telemetry.adapter_complete, true);
  assert.equal(result.telemetry.memory_candidate, true);
  assert.equal(result.telemetry.review_required, false);
  assert.equal(adminCalls, 0);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /must-not-project|MustNotAppear|payment-ref/i);
  assert.doesNotMatch(serialized, new RegExp(LINE_USER_ID));
});

test("exact Client identity remains medium confidence when fresh resolver identity is unavailable", async () => {
  const env = {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const table = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
        if (table === "tblVv58TCbwh5j1fS") {
          return Response.json({
            records: [{
              id: "recClientMedium",
              fields: {
                line_user_id: LINE_USER_ID,
                nickname: "ลูกค้าเดิม",
                "MMD — Customer History Reviews": ["recHistoryApproved"],
              },
            }],
          });
        }
        if (table === "tblS6iRgPjYLBqZJh") {
          return Response.json({
            records: [{
              id: "recMatrixMedium",
              fields: {
                matrix_id: "kcm1_medium",
                schema_version: "mmd.kenji_conversation_matrix.v1",
                conversation_stage: { id: "selResolved", name: "resolved", color: "greenBright" },
                matrix_status: { id: "selActive", name: "active", color: "greenBright" },
                version: 1,
              },
            }],
          });
        }
        if (table === "tblnpDFQMpo8AmNQv") {
          return Response.json({
            records: [{
              id: "recHistoryApproved",
              fields: {
                review_status: { id: "selMaterialized", name: "materialized", color: "greenBright" },
                decision: { id: "selApprove", name: "approve_service_history", color: "greenBright" },
                approved_model_text: "Man",
              },
            }],
          });
        }
        return Response.json({ records: [] });
      },
    },
    MEMBER_PAGES_WORKER: {
      async fetch() {
        return new Response("{}", { status: 503 });
      },
    },
  };

  const result = await buildKenjiLineCanonicalContext({
    env,
    event: event("ต่อจากเดิม"),
    currentIntent: "line_event",
    now: NOW,
  });

  assert.equal(result.context_bundle.identity.state, "known");
  assert.equal(result.context_bundle.identity.confidence, "medium");
  assert.equal(result.context_bundle.domain_guard.review_required, true);
  assert.equal(result.telemetry.adapter_complete, false);
});
