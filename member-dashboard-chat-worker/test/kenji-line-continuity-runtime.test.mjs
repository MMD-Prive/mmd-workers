import assert from "node:assert/strict";
import test from "node:test";

import { buildConversationMatrixV1 } from "../../shared/kenji-conversation-matrix.mjs";
import {
  buildKenjiPostTurnMatrix,
  resolveKenjiLineContinuity,
  writeKenjiLineMatrixTurn,
} from "../src/kenji-line-continuity-runtime.mjs";

const MATRIX_TABLE = "tblS6iRgPjYLBqZJh";
const NOW = "2026-09-07T12:00:00.000Z";
const ENV = {
  AIRTABLE_API_KEY: "test-key",
  AIRTABLE_BASE_ID: "test-base",
  AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID: MATRIX_TABLE,
  AIRTABLE_TABLE_CLIENTS_ID: "tblVv58TCbwh5j1fS",
};

function event(message = "ได้ยังครับ") {
  return {
    type: "message",
    source: { type: "user", userId: "Utest123" },
    message: { id: "msg-test", type: "text", text: message },
  };
}

function storedFields(hash = "stored-hash") {
  return {
    matrix_id: "kcm1_line_test",
    Client: ["recClient"],
    schema_version: "mmd.kenji_conversation_matrix.v1",
    conversation_id_hash: hash,
    channel: "line_ofc",
    conversation_scope: "line:test",
    topic: "membership",
    subtopic: "premium_renewal",
    relationship_context: "active_member",
    last_customer_intent: "membership_renewal",
    last_customer_action: "submitted_payment_proof",
    conversation_stage: "awaiting_payment_verification",
    awaiting_from: "payment_authority",
    pending_action: "refresh payment truth before answering status",
    do_not_ask_again_json: JSON.stringify(["membership_package", "payment_proof"]),
    important_open_loops_json: JSON.stringify(["payment_verification", "entitlement_refresh"]),
    handoff_required: true,
    handoff_owner: "Per",
    handoff_reason: "payment_status:protected_truth",
    live_truth_required: true,
    live_truth_domains: ["membership", "entitlement", "payment"],
    state_updated_at: "2026-09-07T11:00:00.000Z",
    state_expires_at: "2026-09-14T11:00:00.000Z",
    matrix_status: "active",
    version: 3,
  };
}

async function withFetch(mock, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("follow-up on renewal payment thread resolves to payment_status", async () => {
  const continuity = await withFetch(async (url) => {
    const parsed = new URL(String(url));
    const filter = parsed.searchParams.get("filterByFormula") || "";
    const hash = filter.match(/=\"([^\"]+)/)?.[1] || "stored-hash";
    return new Response(JSON.stringify({ records: [{ id: "recMatrix", fields: storedFields(hash) }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, () => resolveKenjiLineContinuity({ env: ENV, event: event(), currentIntent: "unknown", now: NOW }));

  assert.equal(continuity.available, true);
  assert.equal(continuity.decision, "continuation");
  assert.equal(continuity.reason, "continuation_cue_with_open_thread");
  assert.equal(continuity.effective_intent, "payment_status");
  assert.equal(continuity.conversation_stage, "awaiting_payment_verification");
  assert.deepEqual(continuity.do_not_ask_again, ["membership_package", "payment_proof"]);
  assert.ok(continuity.live_truth_domains.includes("payment"));
});

test("post-turn matrix keeps open payment state without claiming verification", () => {
  const prior = buildConversationMatrixV1({
    matrix_id: "kcm1_line_test",
    client_record_id: "recClient",
    conversation_id_hash: "abc123",
    channel: "line_ofc",
    conversation_scope: "line:test",
    topic: "membership",
    subtopic: "premium_renewal",
    relationship_context: "active_member",
    last_customer_intent: "membership_renewal",
    conversation_stage: "awaiting_payment_verification",
    awaiting_from: "payment_authority",
    do_not_ask_again: ["membership_package", "payment_proof"],
    important_open_loops: ["payment_verification", "entitlement_refresh"],
    live_truth_domains: ["membership", "entitlement", "payment"],
    version: 3,
  });
  const continuity = {
    schema: "mmd.kenji_continuity_resolver.v1",
    decision: "continuation",
    reason: "continuation_cue_with_open_thread",
    topic: "membership",
    subtopic: "premium_renewal",
    effective_intent: "payment_status",
    conversation_stage: "awaiting_payment_verification",
    do_not_ask_again: ["membership_package", "payment_proof"],
    important_open_loops: ["payment_verification", "entitlement_refresh"],
    live_truth_required: true,
    live_truth_domains: ["membership", "entitlement", "payment"],
    conversation_hash: "abc123",
    client_record_id: "recClient",
    matrix_record_id: "recMatrix",
    storage_status: "ready",
    matrix: prior,
  };

  const matrix = buildKenjiPostTurnMatrix({
    continuity,
    decision: { intent: "payment_status", handoff_required: true, handoff_reason: "payment_status:protected_truth", reply_source: "seed_handoff" },
    delivered: false,
    attempted: false,
    lastEventId: "kai_line_msg-test",
    now: NOW,
  });

  assert.equal(matrix.conversation_stage, "awaiting_payment_verification");
  assert.equal(matrix.awaiting_from, "payment_authority");
  assert.equal(matrix.last_customer_intent, "payment_status");
  assert.equal(matrix.last_customer_action, "followed_up_on_open_thread");
  assert.deepEqual(matrix.do_not_ask_again, ["membership_package", "payment_proof"]);
  assert.ok(matrix.important_open_loops.includes("payment_verification"));
  assert.match(matrix.last_confirmed_outcome, /not confirmed/i);
  assert.equal(matrix.version, 4);
});

test("write-back PATCH contains bounded state and no raw customer message", async () => {
  let posted = null;
  const continuity = {
    schema: "mmd.kenji_continuity_resolver.v1",
    decision: "continuation",
    reason: "continuation_cue_with_open_thread",
    topic: "membership",
    subtopic: "premium_renewal",
    effective_intent: "payment_status",
    conversation_stage: "awaiting_payment_verification",
    do_not_ask_again: ["membership_package", "payment_proof"],
    important_open_loops: ["payment_verification", "entitlement_refresh"],
    live_truth_required: true,
    live_truth_domains: ["membership", "entitlement", "payment"],
    conversation_hash: "abc123",
    client_record_id: "recClient",
    matrix_record_id: "recMatrix",
    storage_status: "ready",
    matrix: {
      ...buildConversationMatrixV1({
        matrix_id: "kcm1_line_test",
        client_record_id: "recClient",
        conversation_id_hash: "abc123",
        channel: "line_ofc",
        conversation_scope: "line:test",
        topic: "membership",
        relationship_context: "active_member",
        last_customer_intent: "membership_renewal",
        conversation_stage: "awaiting_payment_verification",
        do_not_ask_again: ["membership_package", "payment_proof"],
        important_open_loops: ["payment_verification", "entitlement_refresh"],
        live_truth_domains: ["membership", "entitlement", "payment"],
        version: 3,
      }),
      payload_json: {
        booking_draft_v1: {
          schema: "mmd.kenji_booking_accumulator.v1",
          draft_id: "kbd1_keep_me",
          model_name: "EMs16",
          amount_thb: 15000,
        },
      },
    },
  };

  const result = await withFetch(async (_url, init = {}) => {
    assert.equal(init.method, "PATCH");
    posted = JSON.parse(init.body);
    return new Response(JSON.stringify({ records: [{ id: "recMatrix", fields: posted.records[0].fields }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, () => writeKenjiLineMatrixTurn({
    env: ENV,
    continuity,
    decision: { intent: "payment_status", handoff_required: true, handoff_reason: "payment_status:protected_truth", reply_source: "seed_handoff" },
    delivered: false,
    attempted: false,
    lastEventId: "kai_line_msg-test",
    now: NOW,
  }));

  assert.equal(result.id, "recMatrix");
  assert.equal(posted.records[0].fields.conversation_stage, "awaiting_payment_verification");
  assert.equal(posted.records[0].fields.last_customer_intent, "payment_status");
  assert.deepEqual(JSON.parse(posted.records[0].fields.do_not_ask_again_json), ["membership_package", "payment_proof"]);
  const payload = JSON.parse(posted.records[0].fields.payload_json);
  assert.equal(payload.booking_draft_v1.draft_id, "kbd1_keep_me");
  assert.equal(payload.booking_draft_v1.model_name, "EMs16");
  assert.equal(payload.booking_draft_v1.amount_thb, 15000);
  const serialized = JSON.stringify(posted);
  assert.equal(serialized.includes("ได้ยังครับ"), false);
  assert.equal(serialized.includes("Utest123"), false);
});


test("opening profile is stored in chat context only after LINE delivery", async () => {
  const prior = buildConversationMatrixV1({
    matrix_id: "kcm1_line_opening", conversation_id_hash: "opening-hash", channel: "line_ofc",
    conversation_scope: "line:opening", topic: "greeting", version: 1,
  });
  const continuity = {
    storage_status: "ready", conversation_hash: "opening-hash", matrix_record_id: "recOpening",
    decision: "continuation", effective_intent: "note_only",
    matrix: { ...prior, payload_json: { first_contact_v2: { awaiting: "service", preferred_style: "สุภาพ" } } },
  };
  const writes = [];
  await withFetch(async (_url, init = {}) => {
    const fields = JSON.parse(init.body).records[0].fields;
    writes.push(JSON.parse(fields.payload_json));
    return Response.json({ records: [{ id: "recOpening", fields }] });
  }, async () => {
    for (const delivered of [false, true]) {
      await writeKenjiLineMatrixTurn({ env: ENV, continuity, decision: {
        intent: "note_only", reply_source: "first_contact_v2",
        first_contact_state: { awaiting: "service", self_reported_gender: "woman" },
      }, delivered, attempted: true, now: NOW });
    }
  });
  assert.equal(writes.length, 2);
  assert.equal(writes[0].first_contact_v2.self_reported_gender, undefined);
  assert.equal(writes[1].first_contact_v2.self_reported_gender, "woman");
  assert.equal(writes[1].first_contact_v2.preferred_style, "สุภาพ");
  assert.equal(writes[1].first_contact_v2.updated_at, NOW);
});


test("active model context maps a short tonight follow-up to guarded availability", async () => {
  const continuity = await withFetch(async (url) => {
    const parsed = new URL(String(url));
    const filter = parsed.searchParams.get("filterByFormula") || "";
    const hash = filter.match(/=\"([^\"]+)/)?.[1] || "stored-hash";
    const fields = {
      ...storedFields(hash),
      topic: "model_lookup",
      last_customer_intent: "model_lookup",
      last_customer_action: "asked:model_lookup",
      conversation_stage: "in_progress",
      awaiting_from: "none",
      pending_action: "continue current conversation",
      important_open_loops_json: "[]",
      handoff_required: false,
      handoff_owner: "none",
      handoff_reason: "",
      live_truth_required: false,
      live_truth_domains: [],
      payload_json: JSON.stringify({
        active_model_v1: { model_code: "MX17", working_name: "Jasper", updated_at: NOW },
      }),
    };
    return new Response(JSON.stringify({ records: [{ id: "recMatrix", fields }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, () => resolveKenjiLineContinuity({ env: ENV, event: event("คืนนี้"), currentIntent: "note_only", now: NOW }));

  assert.equal(continuity.available, true);
  assert.equal(continuity.effective_intent, "availability_request");
  assert.equal(continuity.matrix.payload_json.active_model_v1.model_code, "MX17");
  assert.equal(continuity.matrix.payload_json.active_model_v1.working_name, "Jasper");
});

test("successful model access persists only bounded active model identity in Matrix", async () => {
  let posted = null;
  const prior = {
    ...buildConversationMatrixV1({
      matrix_id: "kcm1_line_model",
      client_record_id: "recClient",
      conversation_id_hash: "modelhash",
      channel: "line_ofc",
      conversation_scope: "line:model",
      topic: "model_lookup",
      relationship_context: "known_customer",
      last_customer_intent: "model_lookup",
      conversation_stage: "in_progress",
      version: 1,
    }),
    payload_json: {},
  };
  const continuity = {
    schema: "mmd.kenji_continuity_resolver.v1",
    decision: "new_topic",
    reason: "no_open_thread",
    topic: "model_lookup",
    effective_intent: "model_lookup",
    conversation_hash: "modelhash",
    client_record_id: "recClient",
    matrix_record_id: "recMatrix",
    storage_status: "ready",
    matrix: prior,
  };

  await withFetch(async (_url, init = {}) => {
    posted = JSON.parse(init.body);
    return new Response(JSON.stringify({ records: [{ id: "recMatrix", fields: posted.records[0].fields }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, () => writeKenjiLineMatrixTurn({
    env: ENV,
    continuity,
    decision: {
      intent: "model_lookup",
      reply_source: "model_access",
      handoff_required: false,
      model_context: { model_code: "MX17", working_name: "Jasper", rate: 999999, availability: "invented" },
    },
    delivered: true,
    attempted: true,
    lastEventId: "kai_line_model",
    now: NOW,
  }));

  const payload = JSON.parse(posted.records[0].fields.payload_json);
  assert.deepEqual(
    { model_code: payload.active_model_v1.model_code, working_name: payload.active_model_v1.working_name },
    { model_code: "MX17", working_name: "Jasper" },
  );
  assert.equal(Object.hasOwn(payload.active_model_v1, "rate"), false);
  assert.equal(Object.hasOwn(payload.active_model_v1, "availability"), false);
});


test("model browse preference maps explicit model gender without changing customer gender", async () => {
  const continuity = await withFetch(async (url) => {
    const parsed = new URL(String(url));
    const filter = parsed.searchParams.get("filterByFormula") || "";
    const hash = filter.match(/=\"([^\"]+)/)?.[1] || "stored-hash";
    const fields = {
      ...storedFields(hash),
      topic: "model_browse",
      last_customer_intent: "model_browse",
      last_customer_action: "asked:model_browse",
      conversation_stage: "in_progress",
      awaiting_from: "customer",
      pending_action: "continue current conversation",
      important_open_loops_json: "[]",
      handoff_required: false,
      handoff_owner: "none",
      handoff_reason: "",
      live_truth_required: false,
      live_truth_domains: [],
      payload_json: JSON.stringify({
        model_browse_v1: { awaiting: "model_gender", updated_at: NOW },
      }),
    };
    return Response.json({ records: [{ id: "recMatrix", fields }] });
  }, () => resolveKenjiLineContinuity({ env: ENV, event: event("ผู้ชาย"), currentIntent: "note_only", now: NOW }));

  assert.equal(continuity.available, true);
  assert.equal(continuity.effective_intent, "model_browse_gender");
  assert.equal(continuity.matrix.payload_json.model_browse_v1.awaiting, "model_gender");
});

test("delivered model browse preference is stored separately from customer identity", async () => {
  let posted = null;
  const prior = {
    ...buildConversationMatrixV1({
      matrix_id: "kcm1_line_browse",
      client_record_id: "recClient",
      conversation_id_hash: "browsehash",
      channel: "line_ofc",
      conversation_scope: "line:browse",
      topic: "model_browse",
      relationship_context: "known_customer",
      last_customer_intent: "model_browse",
      conversation_stage: "in_progress",
      version: 1,
    }),
    payload_json: {
      first_contact_v2: { self_reported_gender: "woman", awaiting: "service" },
      model_browse_v1: { awaiting: "model_gender", updated_at: NOW },
    },
  };
  const continuity = {
    schema: "mmd.kenji_continuity_resolver.v1",
    decision: "ambiguous",
    reason: "open_thread_but_message_not_specific_enough",
    topic: "model_browse",
    effective_intent: "model_browse_gender",
    conversation_hash: "browsehash",
    client_record_id: "recClient",
    matrix_record_id: "recMatrix",
    storage_status: "ready",
    matrix: prior,
  };

  await withFetch(async (_url, init = {}) => {
    posted = JSON.parse(init.body);
    return Response.json({ records: [{ id: "recMatrix", fields: posted.records[0].fields }] });
  }, () => writeKenjiLineMatrixTurn({
    env: ENV,
    continuity,
    decision: {
      intent: "model_browse_gender",
      reply_source: "model_browse_preference",
      handoff_required: false,
      model_browse_state: { awaiting: "model_name", preferred_model_gender: "man" },
    },
    delivered: true,
    attempted: true,
    lastEventId: "kai_line_browse",
    now: NOW,
  }));

  const payload = JSON.parse(posted.records[0].fields.payload_json);
  assert.equal(payload.model_browse_v1.awaiting, "model_name");
  assert.equal(payload.model_browse_v1.preferred_model_gender, "man");
  assert.equal(payload.first_contact_v2.self_reported_gender, "woman");
  assert.equal(Object.hasOwn(payload.model_browse_v1, "self_reported_gender"), false);
});
