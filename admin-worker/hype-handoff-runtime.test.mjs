import test from "node:test";
import assert from "node:assert/strict";

import {
  HYPE_CONTINUITY_PATH,
  HYPE_HANDOFF_PATH,
  HYPE_HANDOFF_STATUS_PATH,
  HYPE_TRANSACTION_INTAKE_PATH,
  HYPE_SUPERVISED_EXECUTION_PATH,
  handleHypeContinuityRpc,
  handleHypeHandoffRpc,
  handleHypeHandoffStatusRpc,
  handleHypeTransactionIntakeRpc,
  handleHypeSupervisedExecutionRpc,
  normalizeTransactionFields,
  mergeTransactionDraft,
  canonicalTransactionRoute,
  transactionGuardrails,
  executeP6Booking,
  executeP6Mms,
  executeP6PaymentProof,
  executeP6Renewal,
  safeExecutionReceipt,
  p6ExecutionGuardrails,
  buildExecutionId,
  observeP6Authority,
  observeExactBookingCorrelation,
} from "./src/hype-handoff-runtime.js";

const ENV = {
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_API_KEY: "airtable-test-token",
  AIRTABLE_TABLE_CLIENTS_ID: "tblClients",
  AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID: "tblMatrix",
};

function internalRequest(path, body, caller = "telegram-worker") {
  return new Request(`https://admin-worker.internal${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-service-binding": caller,
    },
    body: JSON.stringify(body),
  });
}

test("HYPE continuity and handoff endpoints are service-binding only", async () => {
  const publicContinuity = await handleHypeContinuityRpc(
    new Request(`https://www.mmdbkk.com${HYPE_CONTINUITY_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mmd-service-binding": "telegram-worker" },
      body: "{}",
    }),
    ENV,
  );
  assert.equal(publicContinuity.status, 403);

  const wrongCaller = await handleHypeHandoffRpc(
    internalRequest(HYPE_HANDOFF_PATH, { telegram_user_id: "111111", target: "kenji" }, "browser"),
    ENV,
  );
  assert.equal(wrongCaller.status, 403);

  const statusWrongCaller = await handleHypeHandoffStatusRpc(
    internalRequest(HYPE_HANDOFF_STATUS_PATH, { operation: "read", telegram_user_id: "111111" }, "browser"),
    ENV,
  );
  assert.equal(statusWrongCaller.status, 403);

  const transactionWrongCaller = await handleHypeTransactionIntakeRpc(
    internalRequest(HYPE_TRANSACTION_INTAKE_PATH, { telegram_user_id: "111111", mode: "booking" }, "browser"),
    ENV,
  );
  assert.equal(transactionWrongCaller.status, 403);

  const executionWrongCaller = await handleHypeSupervisedExecutionRpc(
    internalRequest(HYPE_SUPERVISED_EXECUTION_PATH, { telegram_user_id: "111111", operation: "execute" }, "browser"),
    ENV,
  );
  assert.equal(executionWrongCaller.status, 403);
});

test("HYPE continuity writes a bounded cross-channel Matrix row for a linked canonical client", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/tblClients")) {
      return Response.json({
        records: [{
          id: "recClientA1",
          fields: {
            telegram_user_id: "111111",
            telegram_verification_status: "verified",
            line_user_id: "U0123456789abcdef0123456789abcdef",
            "Client Name": "Client A",
          },
        }],
      });
    }

    if (parsed.pathname.endsWith("/tblMatrix") && (!init.method || init.method === "GET")) {
      return Response.json({ records: [] });
    }

    if (parsed.pathname.endsWith("/tblMatrix") && init.method === "POST") {
      const payload = JSON.parse(String(init.body || "{}"));
      writes.push(payload);
      return Response.json({ records: [{ id: "recMatrixA1", fields: payload.records?.[0]?.fields || {} }] });
    }

    throw new Error(`unexpected fetch ${parsed.pathname} ${init.method || "GET"}`);
  };

  try {
    const response = await handleHypeContinuityRpc(internalRequest(HYPE_CONTINUITY_PATH, {
      telegram_user_id: "111111",
      command: "payment",
      customer_message: "เช็กยอด",
      projection: {
        ok: true,
        state: "ready",
        membership: { level: "private_premium", lifecycle: "active", blocked: false },
        job: { active_count: 1, next: { status: "confirmed", model_name: "Model A", start_at: "2026-09-20T19:00:00+07:00" } },
        payment: { status: "pending_review", paid: false, review_required: true, outstanding_amount_thb: 5000 },
        next_action: { action: "review_payment", label: "รอ MMD ตรวจหลักฐาน" },
      },
    }), ENV);

    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.persisted, true);
    assert.equal(body.line_continuity_ready, true);
    assert.equal(writes.length, 1);

    const fields = writes[0].records[0].fields;
    assert.equal(fields.channel, "telegram_hype");
    assert.equal(fields.last_customer_intent, "payment");
    assert.equal(fields.conversation_stage, "awaiting_payment_verification");
    assert.equal(fields.handoff_required, false);
    assert.match(fields.continuity_summary, /Payment proof is awaiting canonical review/);
    assert.match(fields.important_open_loops_json, /payment_verification/);
    assert.match(fields.do_not_ask_again_json, /telegram_identity/);

    const serialized = JSON.stringify(fields);
    assert.doesNotMatch(serialized, /AIRTABLE_API_KEY|airtable-test-token|raw_private_note|payment_ref_raw/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE continuity stays canonical-only when LINE identity is not linked", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let matrixTouched = false;

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/tblClients")) {
      return Response.json({
        records: [{
          id: "recClientA1",
          fields: {
            telegram_user_id: "111111",
            telegram_verification_status: "verified",
            "Client Name": "Client A",
          },
        }],
      });
    }
    matrixTouched = true;
    throw new Error("matrix must not be touched without LINE identity");
  };

  try {
    const response = await handleHypeContinuityRpc(internalRequest(HYPE_CONTINUITY_PATH, {
      telegram_user_id: "111111",
      command: "status",
      projection: { ok: true, state: "ready" },
    }), ENV);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.persisted, false);
    assert.equal(body.state, "canonical_only");
    assert.equal(body.reason, "line_identity_not_linked");
    assert.equal(matrixTouched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});




test("HYPE Shop recovery correlates canonical Order Payment Fulfillment and reuses one open Case reference", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let matrixRecord = null;
  const matrixWrites = [];
  let shopReads = 0;

  const clientRecord = {
    id: "recClientA1",
    fields: {
      telegram_user_id: "111111",
      telegram_verification_status: "verified",
      line_user_id: "U0123456789abcdef0123456789abcdef",
      "Client Name": "Client A",
    },
  };

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const method = String(init.method || "GET").toUpperCase();

    if (parsed.pathname.endsWith("/tblClients/recClientA1")) {
      return Response.json(clientRecord);
    }
    if (parsed.pathname.endsWith("/tblClients")) {
      return Response.json({ records: [clientRecord] });
    }
    if (parsed.pathname.endsWith("/tblMatrix") && method === "GET") {
      return Response.json({ records: matrixRecord ? [matrixRecord] : [] });
    }
    if (parsed.pathname.endsWith("/tblMatrix") && (method === "POST" || method === "PATCH")) {
      const payload = JSON.parse(String(init.body || "{}"));
      matrixWrites.push(payload);
      const row = payload.records[0];
      matrixRecord = {
        id: row.id || "recMatrixShop1",
        fields: {
          ...(matrixRecord?.fields || {}),
          ...(row.fields || {}),
        },
      };
      return Response.json({ records: [matrixRecord] });
    }

    // Other live fan-in reads are allowed to resolve empty. Recovery correlation
    // is independently grounded by the bounded Shop authority below.
    if (parsed.hostname === "api.airtable.com") return Response.json({ records: [] });
    throw new Error(`unexpected fetch ${parsed.pathname} ${method}`);
  };

  const shopBinding = {
    async fetch(request) {
      shopReads += 1;
      const body = JSON.parse(await request.clone().text());
      assert.equal(body.line_user_id, "U0123456789abcdef0123456789abcdef");
      return Response.json({
        ok: true,
        authority: "mmd.hype_shop_orders_projection.v1",
        orders: [{
          order_id: "MMD-ORDER-001",
          order_date: "2026-09-18T10:00:00.000Z",
          order_status: "confirmed",
          payment_status: "paid",
          total_thb: 2500,
          items: [],
          fulfillment: {
            state: "shipped",
            delivery_method: "delivery",
            courier: "Example Express",
            tracking_number: "TRACK123",
          },
        }],
        correlation: {
          requested_order_id: null,
          exact_owned_match: false,
          auto_correlation_allowed: true,
          candidate_count: 1,
          candidate_order_id: "MMD-ORDER-001",
          method: "single_recent_owned_order",
        },
      });
    },
  };

  try {
    const runtimeEnv = {
      ...ENV,
      MEMBER_PAGES_SHOP_ORDERS: shopBinding,
    };

    const first = await handleHypeHandoffRpc(internalRequest(HYPE_HANDOFF_PATH, {
      telegram_user_id: "111111",
      target: "per",
      command: "recovery",
      reason: "customer_service_recovery",
      customer_message: "GG Water ยังไม่ถึงเลย",
    }), runtimeEnv);
    const firstBody = await first.json();

    assert.equal(first.status, 200);
    assert.equal(firstBody.ok, true);
    assert.equal(firstBody.recovery_correlation.correlated, true);
    assert.equal(firstBody.recovery_correlation.order_id, "MMD-ORDER-001");
    assert.equal(firstBody.recovery_correlation.payment_status, "paid");
    assert.equal(firstBody.recovery_correlation.fulfillment_state, "shipped");
    assert.equal(firstBody.recovery_correlation.case_ref, firstBody.handoff_id);
    assert.match(firstBody.operator_summary, /MMD-ORDER-001/);
    assert.match(firstBody.operator_summary, /Payment paid/);
    assert.match(firstBody.operator_summary, /Fulfillment shipped/);

    const stored = JSON.parse(matrixRecord.fields.payload_json);
    assert.equal(stored.recovery_correlation.order_id, "MMD-ORDER-001");
    assert.equal(stored.recovery_correlation.case_ref, firstBody.handoff_id);
    assert.match(matrixRecord.fields.important_open_loops_json, /shop_recovery/);
    assert.match(matrixRecord.fields.do_not_ask_again_json, /shop_order_reference/);

    // Simulate the owning operator advancing the same case before the customer
    // follows up again. Correlation refresh must never move the state backwards.
    stored.handoff_tracking = {
      ...stored.handoff_tracking,
      state: "reviewing",
      updated_at: "2026-09-19T12:15:00.000Z",
      actor_role: "owner",
    };
    matrixRecord.fields.payload_json = JSON.stringify(stored);
    matrixRecord.fields.conversation_stage = "handoff_reviewing";

    const second = await handleHypeHandoffRpc(internalRequest(HYPE_HANDOFF_PATH, {
      telegram_user_id: "111111",
      target: "per",
      command: "recovery",
      reason: "customer_service_recovery",
      customer_message: "GG Water ยังไม่ถึงครับ ช่วยตามต่อ",
    }), runtimeEnv);
    const secondBody = await second.json();

    assert.equal(second.status, 200);
    assert.equal(secondBody.handoff_id, firstBody.handoff_id);
    assert.equal(secondBody.recovery_correlation.case_ref, firstBody.handoff_id);
    const refreshed = JSON.parse(matrixRecord.fields.payload_json);
    assert.equal(refreshed.handoff_tracking.state, "reviewing");
    assert.equal(refreshed.handoff_tracking.actor_role, "owner");
    assert.equal(matrixRecord.fields.conversation_stage, "handoff_reviewing");
    assert.match(matrixRecord.fields.last_confirmed_outcome, /context refreshed without changing authority state/);
    assert.equal(shopReads, 2);
    assert.equal(matrixWrites.length, 2);

    const serialized = JSON.stringify(matrixRecord.fields);
    assert.doesNotMatch(serialized, /address_line|phone|PRIVATE ADMIN NOTE|payment_mutated":true|refund/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("ambiguous Shop recovery offers safe options and customer selection binds one owned Order to the same Case", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let matrixRecord = null;
  const matrixWrites = [];
  let shopReads = 0;

  const clients = [
    {
      id: "recClientA1",
      fields: {
        telegram_user_id: "111111",
        telegram_verification_status: "verified",
        line_user_id: "U0123456789abcdef0123456789abcdef",
        "Client Name": "Client A",
      },
    },
    {
      id: "recClientB2",
      fields: {
        telegram_user_id: "222222",
        telegram_verification_status: "verified",
        line_user_id: "Uffffffffffffffffffffffffffffffff",
        "Client Name": "Client B",
      },
    },
  ];

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const method = String(init.method || "GET").toUpperCase();
    if (parsed.pathname.endsWith("/tblClients/recClientA1")) return Response.json(clients[0]);
    if (parsed.pathname.endsWith("/tblClients/recClientB2")) return Response.json(clients[1]);
    if (parsed.pathname.endsWith("/tblClients")) return Response.json({ records: clients });
    if (parsed.pathname.endsWith("/tblMatrix") && method === "GET") {
      return Response.json({ records: matrixRecord ? [matrixRecord] : [] });
    }
    if (parsed.pathname.endsWith("/tblMatrix") && (method === "POST" || method === "PATCH")) {
      const payload = JSON.parse(String(init.body || "{}"));
      matrixWrites.push(payload);
      const row = payload.records[0];
      matrixRecord = {
        id: row.id || "recMatrixPicker1",
        fields: { ...(matrixRecord?.fields || {}), ...(row.fields || {}) },
      };
      return Response.json({ records: [matrixRecord] });
    }
    if (parsed.hostname === "api.airtable.com") return Response.json({ records: [] });
    throw new Error(\`unexpected fetch \${parsed.pathname} \${method}\`);
  };

  const shopBinding = {
    async fetch(request) {
      shopReads += 1;
      const body = JSON.parse(await request.clone().text());
      assert.equal(body.line_user_id, "U0123456789abcdef0123456789abcdef");
      if (body.order_id === "MMD-ORDER-B") {
        return Response.json({
          ok: true,
          authority: "mmd.hype_shop_orders_projection.v1",
          orders: [{
            order_id: "MMD-ORDER-B",
            order_date: "2026-09-17T10:00:00.000Z",
            order_status: "confirmed",
            payment_status: "paid",
            total_thb: 4500,
            items: [{ item_name: "GG Water 50ml", quantity: 1, line_total_thb: 4500, status: "confirmed" }],
            fulfillment: { state: "shipped", courier: "Example", tracking_number: "TRACK-B" },
          }],
          correlation: {
            requested_order_id: "MMD-ORDER-B",
            exact_owned_match: true,
            auto_correlation_allowed: true,
            candidate_count: 1,
            candidate_order_id: "MMD-ORDER-B",
            candidate_order_ids: ["MMD-ORDER-B"],
            method: "explicit_owned_order_id",
          },
        });
      }
      return Response.json({
        ok: true,
        authority: "mmd.hype_shop_orders_projection.v1",
        orders: [
          {
            order_id: "MMD-ORDER-A",
            order_date: "2026-09-18T10:00:00.000Z",
            order_status: "confirmed",
            payment_status: "paid",
            total_thb: 2500,
            items: [{ item_name: "GG Water 25ml", quantity: 1, line_total_thb: 2500, status: "confirmed" }],
            fulfillment: { state: "confirmed" },
          },
          {
            order_id: "MMD-ORDER-B",
            order_date: "2026-09-17T10:00:00.000Z",
            order_status: "confirmed",
            payment_status: "paid",
            total_thb: 4500,
            items: [{ item_name: "GG Water 50ml", quantity: 1, line_total_thb: 4500, status: "confirmed" }],
            fulfillment: { state: "shipped" },
          },
        ],
        correlation: {
          requested_order_id: null,
          exact_owned_match: false,
          auto_correlation_allowed: false,
          candidate_count: 2,
          candidate_order_id: null,
          candidate_order_ids: ["MMD-ORDER-A", "MMD-ORDER-B"],
          method: "ambiguous_recent_owned_orders",
        },
      });
    },
  };

  try {
    const runtimeEnv = { ...ENV, MEMBER_PAGES_SHOP_ORDERS: shopBinding };
    const opened = await handleHypeHandoffRpc(internalRequest(HYPE_HANDOFF_PATH, {
      telegram_user_id: "111111",
      target: "per",
      command: "recovery",
      customer_message: "GG Water ยังไม่ถึง ช่วยตาม Order ให้หน่อย",
    }), runtimeEnv);
    const openedBody = await opened.json();

    assert.equal(opened.status, 200);
    assert.equal(openedBody.recovery_correlation.state, "ambiguous");
    assert.equal(openedBody.recovery_correlation.correlated, false);
    assert.equal(openedBody.recovery_correlation.options.length, 2);
    assert.deepEqual(
      openedBody.recovery_correlation.options.map((item) => item.order_id),
      ["MMD-ORDER-A", "MMD-ORDER-B"],
    );
    assert.equal(openedBody.recovery_case.domain, "mmd_shop");
    assert.equal(openedBody.recovery_case.outcome_code, "intake_received");
    assert.equal(openedBody.recovery_case.case_ref, openedBody.handoff_id);

    const serializedOpen = JSON.stringify(openedBody.recovery_correlation.options);
    assert.doesNotMatch(serializedOpen, /address|phone|tracking_number|internal_record|note/i);

    const storedBefore = JSON.parse(matrixRecord.fields.payload_json);
    storedBefore.handoff_tracking = {
      ...storedBefore.handoff_tracking,
      state: "reviewing",
      updated_at: "2026-09-19T12:30:00.000Z",
      actor_role: "owner",
    };
    storedBefore.recovery_case = {
      ...storedBefore.recovery_case,
      state: "reviewing",
      actor_role: "owner",
      updated_at: "2026-09-19T12:30:00.000Z",
    };
    matrixRecord.fields.payload_json = JSON.stringify(storedBefore);
    matrixRecord.fields.conversation_stage = "handoff_reviewing";

    const selected = await handleHypeHandoffStatusRpc(internalRequest(HYPE_HANDOFF_STATUS_PATH, {
      operation: "select_recovery_order",
      telegram_user_id: "111111",
      handoff_id: openedBody.handoff_id,
      selection_index: 1,
    }), runtimeEnv);
    const selectedBody = await selected.json();

    assert.equal(selected.status, 200);
    assert.equal(selectedBody.ok, true);
    assert.equal(selectedBody.handoff_id, openedBody.handoff_id);
    assert.equal(selectedBody.recovery_correlation.order_id, "MMD-ORDER-B");
    assert.equal(selectedBody.recovery_correlation.method, "customer_selected_owned_order");
    assert.equal(selectedBody.recovery_correlation.selected_by, "customer");
    assert.equal(selectedBody.recovery_correlation.selection_locked, true);

    const storedAfter = JSON.parse(matrixRecord.fields.payload_json);
    assert.equal(storedAfter.handoff_tracking.state, "reviewing");
    assert.equal(storedAfter.handoff_tracking.actor_role, "owner");
    assert.equal(storedAfter.recovery_case.case_ref, openedBody.handoff_id);
    assert.equal(storedAfter.recovery_case.domain, "mmd_shop");
    assert.equal(storedAfter.recovery_correlation.order_id, "MMD-ORDER-B");
    assert.equal(storedAfter.business_truth_mutated, false);
    assert.match(matrixRecord.fields.do_not_ask_again_json, /shop_order_reference/);

    const replay = await handleHypeHandoffStatusRpc(internalRequest(HYPE_HANDOFF_STATUS_PATH, {
      operation: "select_recovery_order",
      telegram_user_id: "111111",
      handoff_id: openedBody.handoff_id,
      selection_index: 1,
    }), runtimeEnv);
    const replayBody = await replay.json();
    assert.equal(replay.status, 200);
    assert.equal(replayBody.replayed, true);
    assert.equal(replayBody.handoff_id, openedBody.handoff_id);

    const foreign = await handleHypeHandoffStatusRpc(internalRequest(HYPE_HANDOFF_STATUS_PATH, {
      operation: "select_recovery_order",
      telegram_user_id: "222222",
      handoff_id: openedBody.handoff_id,
      selection_index: 0,
    }), runtimeEnv);
    const foreignBody = await foreign.json();
    assert.equal(foreign.status, 404);
    assert.equal(foreignBody.error, "handoff_not_found");

    assert.equal(shopReads, 3);
    assert.ok(matrixWrites.length >= 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Booking and MMS recovery share the canonical Case lifecycle and domain taxonomy", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    ["งาน booking พรุ่งนี้มีปัญหา น้องมาสาย", "booking"],
    ["MMS Therapist มาสายครับ อยากให้ช่วยตาม", "mms"],
  ];

  try {
    for (const [message, expectedDomain] of cases) {
      let matrixRecord = null;
      const clientRecord = {
        id: "recClientA1",
        fields: {
          telegram_user_id: "111111",
          telegram_verification_status: "verified",
          line_user_id: "U0123456789abcdef0123456789abcdef",
          "Client Name": "Client A",
        },
      };

      globalThis.fetch = async (url, init = {}) => {
        const parsed = new URL(String(url));
        const method = String(init.method || "GET").toUpperCase();
        if (parsed.pathname.endsWith("/tblClients/recClientA1")) return Response.json(clientRecord);
        if (parsed.pathname.endsWith("/tblClients")) return Response.json({ records: [clientRecord] });
        if (parsed.pathname.endsWith("/tblMatrix") && method === "GET") {
          return Response.json({ records: matrixRecord ? [matrixRecord] : [] });
        }
        if (parsed.pathname.endsWith("/tblMatrix") && (method === "POST" || method === "PATCH")) {
          const payload = JSON.parse(String(init.body || "{}"));
          const row = payload.records[0];
          matrixRecord = {
            id: row.id || "recMatrixRecovery",
            fields: { ...(matrixRecord?.fields || {}), ...(row.fields || {}) },
          };
          return Response.json({ records: [matrixRecord] });
        }
        if (parsed.hostname === "api.airtable.com") return Response.json({ records: [] });
        throw new Error(\`unexpected fetch \${parsed.pathname}\`);
      };

      const opened = await handleHypeHandoffRpc(internalRequest(HYPE_HANDOFF_PATH, {
        telegram_user_id: "111111",
        target: "per",
        command: "recovery",
        customer_message: message,
      }), ENV);
      const openedBody = await opened.json();

      assert.equal(opened.status, 200);
      assert.equal(openedBody.recovery_case.domain, expectedDomain);
      assert.equal(openedBody.recovery_case.state, "prepared");
      assert.equal(openedBody.recovery_case.outcome_code, "intake_received");
      assert.equal(openedBody.recovery_case.taxonomy_version, "mmd-recovery-outcome-taxonomy-v1-20260919");
      assert.equal(openedBody.recovery_case.business_truth_mutated, false);

      const stored = JSON.parse(matrixRecord.fields.payload_json);
      assert.equal(stored.recovery_case.domain, expectedDomain);
      assert.equal(stored.recovery_case.case_ref, openedBody.handoff_id);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Recovery case cannot resolve without a terminal domain outcome and rejects cross-domain outcomes", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let matrixRecord = {
    id: "recMatrixOutcome1",
    fields: {
      Client: ["recClientA1"],
      pending_reference: "HYPE-PER-20260919120000-deadbeef",
      version: 3,
      payload_json: JSON.stringify({
        handoff_id: "HYPE-PER-20260919120000-deadbeef",
        handoff_target: "per",
        handoff_tracking: {
          id: "HYPE-PER-20260919120000-deadbeef",
          target: "per",
          state: "reviewing",
          updated_at: "2026-09-19T12:30:00.000Z",
          actor_role: "owner",
        },
        recovery_case: {
          schema: "mmd.recovery_case.v1",
          taxonomy_version: "mmd-recovery-outcome-taxonomy-v1-20260919",
          case_ref: "HYPE-PER-20260919120000-deadbeef",
          domain: "mmd_shop",
          state: "reviewing",
          outcome_code: "intake_received",
          actor_role: "owner",
        },
      }),
    },
  };

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const method = String(init.method || "GET").toUpperCase();
    if (parsed.pathname.endsWith("/tblMatrix") && method === "GET") {
      return Response.json({ records: [matrixRecord] });
    }
    if (parsed.pathname.endsWith("/tblMatrix") && method === "PATCH") {
      const payload = JSON.parse(String(init.body || "{}"));
      matrixRecord = {
        ...matrixRecord,
        fields: { ...matrixRecord.fields, ...payload.records[0].fields },
      };
      return Response.json({ records: [matrixRecord] });
    }
    throw new Error(\`unexpected fetch \${parsed.pathname} \${method}\`);
  };

  try {
    const missing = await handleHypeHandoffStatusRpc(internalRequest(HYPE_HANDOFF_STATUS_PATH, {
      operation: "transition",
      handoff_id: "HYPE-PER-20260919120000-deadbeef",
      state: "resolved",
      actor_role: "owner",
    }), ENV);
    const missingBody = await missing.json();
    assert.equal(missing.status, 409);
    assert.equal(missingBody.error, "recovery_terminal_outcome_required");
    assert.ok(missingBody.allowed_outcomes.includes("reshipment_arranged"));

    const wrongDomain = await handleHypeHandoffStatusRpc(internalRequest(HYPE_HANDOFF_STATUS_PATH, {
      operation: "transition",
      handoff_id: "HYPE-PER-20260919120000-deadbeef",
      state: "resolved",
      actor_role: "owner",
      recovery_outcome_code: "therapist_replacement_arranged",
    }), ENV);
    const wrongDomainBody = await wrongDomain.json();
    assert.equal(wrongDomain.status, 409);
    assert.equal(wrongDomainBody.error, "recovery_outcome_invalid_for_state");

    const resolved = await handleHypeHandoffStatusRpc(internalRequest(HYPE_HANDOFF_STATUS_PATH, {
      operation: "transition",
      handoff_id: "HYPE-PER-20260919120000-deadbeef",
      state: "resolved",
      actor_role: "owner",
      recovery_outcome_code: "reshipment_arranged",
    }), ENV);
    const resolvedBody = await resolved.json();

    assert.equal(resolved.status, 200);
    assert.equal(resolvedBody.state, "resolved");
    assert.equal(resolvedBody.recovery_case.domain, "mmd_shop");
    assert.equal(resolvedBody.recovery_case.outcome_code, "reshipment_arranged");
    assert.equal(resolvedBody.recovery_case.outcome_terminal, true);
    assert.equal(resolvedBody.recovery_case.business_truth_mutated, false);

    const stored = JSON.parse(matrixRecord.fields.payload_json);
    assert.equal(stored.handoff_tracking.state, "resolved");
    assert.equal(stored.recovery_case.outcome_code, "reshipment_arranged");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE handoff status reads only the explicitly recorded operator state", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/tblClients")) {
      return Response.json({
        records: [{
          id: "recClientA1",
          fields: {
            telegram_user_id: "111111",
            telegram_verification_status: "verified",
            line_user_id: "U0123456789abcdef0123456789abcdef",
            "Client Name": "Client A",
          },
        }],
      });
    }
    if (parsed.pathname.endsWith("/tblMatrix") && (!init.method || init.method === "GET")) {
      return Response.json({
        records: [{
          id: "recMatrixA1",
          fields: {
            pending_reference: "HYPE-PER-20260919120000-deadbeef",
            state_updated_at: "2026-09-19T12:01:00.000Z",
            payload_json: JSON.stringify({
              handoff_id: "HYPE-PER-20260919120000-deadbeef",
              handoff_target: "per",
              handoff_tracking: {
                id: "HYPE-PER-20260919120000-deadbeef",
                target: "per",
                state: "reviewing",
                updated_at: "2026-09-19T12:01:00.000Z",
                actor_role: "owner",
              },
            }),
          },
        }],
      });
    }
    throw new Error(`unexpected fetch ${parsed.pathname} ${init.method || "GET"}`);
  };

  try {
    const response = await handleHypeHandoffStatusRpc(internalRequest(HYPE_HANDOFF_STATUS_PATH, {
      operation: "read",
      telegram_user_id: "111111",
    }), ENV);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.state, "reviewing");
    assert.equal(body.handoff_id, "HYPE-PER-20260919120000-deadbeef");
    assert.equal(body.target, "per");
    assert.equal(body.guardrails.protected_business_truth_mutated, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("HYPE /case refreshes exact owned Shop truth instead of presenting a stale stored snapshot", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let shopReadBody = null;

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/tblClients")) {
      return Response.json({
        records: [{
          id: "recClientA1",
          fields: {
            telegram_user_id: "111111",
            telegram_verification_status: "verified",
            line_user_id: "U0123456789abcdef0123456789abcdef",
            "Client Name": "Client A",
          },
        }],
      });
    }
    if (parsed.pathname.endsWith("/tblMatrix") && (!init.method || init.method === "GET")) {
      return Response.json({
        records: [{
          id: "recMatrixA1",
          fields: {
            pending_reference: "HYPE-PER-20260919120000-deadbeef",
            state_updated_at: "2026-09-19T12:01:00.000Z",
            payload_json: JSON.stringify({
              handoff_id: "HYPE-PER-20260919120000-deadbeef",
              handoff_target: "per",
              handoff_tracking: {
                id: "HYPE-PER-20260919120000-deadbeef",
                target: "per",
                state: "reviewing",
                updated_at: "2026-09-19T12:01:00.000Z",
                actor_role: "owner",
              },
              recovery_correlation: {
                domain: "mmd_shop",
                state: "correlated",
                correlated: true,
                case_ref: "HYPE-PER-20260919120000-deadbeef",
                order_id: "MMD-ORDER-001",
                payment_status: "pending",
                fulfillment_state: "confirmed",
              },
            }),
          },
        }],
      });
    }
    throw new Error(`unexpected fetch ${parsed.pathname} ${init.method || "GET"}`);
  };

  try {
    const response = await handleHypeHandoffStatusRpc(internalRequest(HYPE_HANDOFF_STATUS_PATH, {
      operation: "read",
      telegram_user_id: "111111",
    }), {
      ...ENV,
      MEMBER_PAGES_SHOP_ORDERS: {
        async fetch(request) {
          shopReadBody = JSON.parse(await request.clone().text());
          return Response.json({
            ok: true,
            authority: "mmd.hype_shop_orders_projection.v1",
            orders: [{
              order_id: "MMD-ORDER-001",
              order_date: "2026-09-18T10:00:00.000Z",
              order_status: "confirmed",
              payment_status: "paid",
              total_thb: 2500,
              items: [],
              fulfillment: {
                state: "shipped",
                courier: "Example Express",
                tracking_number: "TRACK123",
              },
            }],
            correlation: {
              requested_order_id: "MMD-ORDER-001",
              exact_owned_match: true,
              auto_correlation_allowed: true,
              candidate_count: 1,
              candidate_order_id: "MMD-ORDER-001",
              method: "explicit_owned_order_id",
            },
          });
        },
      },
    });

    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.state, "reviewing");
    assert.equal(body.recovery_correlation.order_id, "MMD-ORDER-001");
    assert.equal(body.recovery_correlation.payment_status, "paid");
    assert.equal(body.recovery_correlation.fulfillment_state, "shipped");
    assert.equal(body.recovery_correlation.tracking_number, "TRACK123");
    assert.equal(body.recovery_correlation.live_refresh_status, "fresh");
    assert.match(body.recovery_correlation.refreshed_at, /^2026-/);
    assert.deepEqual(shopReadBody, {
      line_user_id: "U0123456789abcdef0123456789abcdef",
      order_id: "MMD-ORDER-001",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE handoff transition writes conversation state only and rejects backwards state", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  let currentState = "sent";
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/tblMatrix") && (!init.method || init.method === "GET")) {
      return Response.json({
        records: [{
          id: "recMatrixA1",
          fields: {
            pending_reference: "HYPE-PER-20260919120000-deadbeef",
            matrix_status: "active",
            version: 2,
            payload_json: JSON.stringify({
              handoff_id: "HYPE-PER-20260919120000-deadbeef",
              handoff_target: "per",
              handoff_tracking: {
                id: "HYPE-PER-20260919120000-deadbeef",
                target: "per",
                state: currentState,
                updated_at: "2026-09-19T12:00:30.000Z",
                actor_role: "hype",
              },
            }),
          },
        }],
      });
    }
    if (parsed.pathname.endsWith("/tblMatrix") && init.method === "PATCH") {
      const payload = JSON.parse(String(init.body || "{}"));
      writes.push(payload);
      const nextPayload = JSON.parse(payload.records[0].fields.payload_json);
      currentState = nextPayload.handoff_tracking.state;
      return Response.json({ records: [{ id: "recMatrixA1", fields: payload.records[0].fields }] });
    }
    throw new Error(`unexpected fetch ${parsed.pathname} ${init.method || "GET"}`);
  };

  try {
    const response = await handleHypeHandoffStatusRpc(internalRequest(HYPE_HANDOFF_STATUS_PATH, {
      operation: "transition",
      handoff_id: "HYPE-PER-20260919120000-deadbeef",
      state: "acknowledged",
      actor_role: "owner",
    }), ENV);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.state, "acknowledged");
    assert.equal(body.guardrails.payment_mutated, false);
    assert.equal(writes.length, 1);

    const serialized = JSON.stringify(writes[0]);
    assert.match(serialized, /handoff_acknowledged/);
    const writtenPayload = JSON.parse(writes[0].records[0].fields.payload_json);
    assert.equal(writtenPayload.handoff_tracking.state, "acknowledged");
    assert.equal(writtenPayload.handoff_tracking.actor_role, "owner");
    assert.doesNotMatch(serialized, /payment_status|job_status|membership_status|entitlement_grant/i);

    const backwards = await handleHypeHandoffStatusRpc(internalRequest(HYPE_HANDOFF_STATUS_PATH, {
      operation: "transition",
      handoff_id: "HYPE-PER-20260919120000-deadbeef",
      state: "sent",
      actor_role: "owner",
    }), ENV);
    const backwardsBody = await backwards.json();
    assert.equal(backwards.status, 409);
    assert.equal(backwardsBody.error, "handoff_transition_invalid");
    assert.equal(backwardsBody.current_state, "acknowledged");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("P5 transaction helpers prepare booking and MMS drafts without protected truth", () => {
  const booking = mergeTransactionDraft("booking", {}, normalizeTransactionFields("booking", {
    service_intent: "dining",
    preferred_date: "2026-09-25",
    preferred_time: "19:30",
    area: "Sathorn",
    model_preference: "Book EI",
    payment_ref: "must-not-copy",
    canonical_client_id: "must-not-copy",
  }));

  assert.equal(booking.complete, true);
  assert.deepEqual(booking.missing_fields, []);
  assert.equal(booking.fields.service_intent, "dining");
  assert.equal(booking.fields.area, "Sathorn");
  assert.equal(Object.hasOwn(booking.fields, "payment_ref"), false);
  assert.equal(Object.hasOwn(booking.fields, "canonical_client_id"), false);

  const mms = mergeTransactionDraft("mms", {}, normalizeTransactionFields("mms", {
    zone: "sathorn_silom",
    service_date: "2026-09-26",
    service_time: "20:00",
    skills: ["aroma_therapy_oil"],
  }));
  assert.equal(mms.complete, false);
  assert.deepEqual(mms.missing_fields, ["recipient_gender"]);
});

test("P5 payment proof stores evidence presence only and never raw Telegram media identifiers", () => {
  const proof = normalizeTransactionFields("payment_proof", {
    evidence_present: true,
    evidence_type: "photo",
    file_id: "AgAC-secret-file-id",
    file_unique_id: "secret-unique-id",
    payment_ref: "pay-secret",
  });
  assert.deepEqual(proof, {
    evidence_present: true,
    evidence_type: "photo",
  });

  const guardrails = transactionGuardrails();
  assert.equal(guardrails.raw_payment_media_persisted, false);
  assert.equal(guardrails.payment_verified, false);
  assert.equal(guardrails.business_truth_mutated, false);
});

test("P5 canonical transaction routes preserve lane authority and only accept signed payment handoff", () => {
  const privateRenewal = canonicalTransactionRoute("renewal", {
    entitlement_live: { membership_level: "private_premium", lifecycle: "active" },
  });
  assert.equal(privateRenewal.href, "/sigil/member/membership?intent=renew");

  const publicRenewal = canonicalTransactionRoute("renewal", {
    entitlement_live: { membership_level: "public_member", lifecycle: "active" },
  });
  assert.equal(publicRenewal.href, "/pay/membership");

  const signedProof = canonicalTransactionRoute("payment_proof", {
    next_actions: [{ href: "/sigil/pay?t=abcDEF_123", action: "continue_payment" }],
  });
  assert.equal(signedProof.kind, "signed_payment_proof");
  assert.equal(signedProof.href, "/sigil/pay?t=abcDEF_123");

  const unsafeProof = canonicalTransactionRoute("payment_proof", {
    next_actions: [{ href: "https://evil.example/pay?t=secret" }],
  });
  assert.equal(unsafeProof.kind, "payment_status_resume");
  assert.equal(unsafeProof.href, "/member/payments");
});


test("P6 execution IDs are deterministic for the same draft and lane", async () => {
  const a = await buildExecutionId("HYPE-DRAFT-BOOKING-ABC123", "booking");
  const b = await buildExecutionId("HYPE-DRAFT-BOOKING-ABC123", "booking");
  const other = await buildExecutionId("HYPE-DRAFT-BOOKING-ABC123", "mms");
  assert.equal(a, b);
  assert.notEqual(a, other);
  assert.match(a, /^HYPE-EXEC-BOOKING-[a-f0-9]{16}$/);
});

test("P6 booking refuses canonical materialization until explicit Model preference exists", async () => {
  const result = await executeP6Booking({}, {
    draft: {
      fields: {
        service_intent: "dining",
        preferred_date: "2026-09-25",
        preferred_time: "19:30",
        area: "Sathorn",
      },
    },
  });
  assert.equal(result.status, "review_required");
  assert.equal(result.details.blocker, "model_preference_required");
  assert.equal(result.canonical_href, "/booking");
});

test("P6 payment proof only prepares the canonical signed handoff and never verifies payment", () => {
  const ready = executeP6PaymentProof({
    route: { kind: "signed_payment_proof", href: "/sigil/pay?t=signed_123" },
    draft: { fields: { evidence_present: true, evidence_type: "photo" } },
  });
  assert.equal(ready.status, "customer_action_required");
  assert.equal(ready.authority, "payments-worker");
  assert.equal(ready.canonical_href, "/sigil/pay?t=signed_123");
  assert.equal(ready.details.raw_media_transferred, false);
  assert.equal(ready.details.payment_verified, false);
  assert.equal(ready.details.payment_marked_paid, false);

  const missingIntent = executeP6PaymentProof({
    route: { kind: "payment_status_resume", href: "/member/payments" },
    draft: { fields: { evidence_present: true } },
  });
  assert.equal(missingIntent.status, "review_required");
  assert.equal(missingIntent.canonical_href, "/member/payments");
});

test("P6 renewal queues current-package intent without granting or renewing membership", () => {
  const result = executeP6Renewal({
    route: { kind: "private_renewal_entry", href: "/sigil/member/membership?intent=renew" },
  });
  assert.equal(result.status, "queued");
  assert.equal(result.details.package_change_requested, false);
  assert.equal(result.details.membership_renewed, false);
  assert.equal(result.details.entitlement_granted, false);
});

test("P6 MMS creates an idempotent canonical prebooking without inventing duration", { concurrency: false }, async () => {
  const seen = [];
  const env = {
    MMS_WORKER: {
      async fetch(request) {
        const body = JSON.parse(await request.text());
        seen.push(body);
        return Response.json({
          ok: true,
          prebooking: {
            prebooking_id: "mmspre_1234567890abcdef12345678",
            status: "Options Ready",
          },
          matched_therapist_ids: ["therapist_a"],
          storage: { coordinator: "persisted", airtable: "synced" },
        }, { status: 201 });
      },
    },
  };

  const result = await executeP6Mms(env, {
    executionId: "HYPE-EXEC-MMS-abcdef1234567890",
    canonicalClientId: "recClientA1",
    lineUserId: "U0123456789abcdef0123456789abcdef",
    draft: {
      fields: {
        recipient_gender: "female",
        zone: "sukhumvit",
        service_date: "2026-09-26",
        service_time: "20:00",
        skills: ["aroma_therapy_oil"],
      },
    },
  });

  assert.equal(result.status, "materialized");
  assert.equal(result.authority, "mms-worker");
  assert.equal(result.details.booking_confirmed, false);
  assert.equal(result.details.therapist_confirmed, false);
  assert.equal(seen.length, 1);
  assert.equal(Object.hasOwn(seen[0], "duration_minutes"), false);
  assert.equal(seen[0].idempotency_key, "HYPE-EXEC-MMS-abcdef1234567890");
});

test("P6 MMS preserves explicit Therapist preference by forcing review instead of dropping it", async () => {
  let called = false;
  const result = await executeP6Mms({
    MMS_WORKER: {
      async fetch() {
        called = true;
        throw new Error("should not call MMS worker");
      },
    },
  }, {
    executionId: "HYPE-EXEC-MMS-abcdef1234567890",
    canonicalClientId: "recClientA1",
    lineUserId: "U0123456789abcdef0123456789abcdef",
    draft: {
      fields: {
        recipient_gender: "female",
        zone: "sukhumvit",
        service_date: "2026-09-26",
        service_time: "20:00",
        skills: ["aroma_therapy_oil"],
        therapist_preference: "Therapist A",
      },
    },
  });

  assert.equal(result.status, "review_required");
  assert.equal(result.details.blocker, "therapist_preference_requires_canonical_resolution");
  assert.equal(called, false);
});

test("P6 receipts expose only bounded customer-safe execution fields", () => {
  const safe = safeExecutionReceipt({
    schema: "mmd.hype_supervised_execution.v1",
    execution_id: "HYPE-EXEC-BOOKING-abcdef1234567890",
    draft_id: "HYPE-DRAFT-BOOKING-ABC123",
    mode: "booking",
    status: "materialized",
    authority: "sigil-booking-worker",
    canonical_ref: "kenji_ref_123",
    canonical_href: "https://evil.example/internal/admin?token=secret",
    replay_safe: true,
    created_at: "2026-09-19T10:00:00.000Z",
    details: {
      mutation_scope: "booking_request_draft_only",
      final_confirmation: false,
      payment_confirmed: false,
      secret: "must-not-copy",
    },
  });
  assert.equal(safe.canonical_href, "");
  assert.equal(Object.hasOwn(safe.details, "secret"), false);
  assert.equal(safe.details.final_confirmation, false);

  const guardrails = p6ExecutionGuardrails();
  assert.equal(guardrails.idempotent, true);
  assert.equal(guardrails.payment_marked_paid, false);
  assert.equal(guardrails.job_confirmed, false);
  assert.equal(guardrails.membership_renewed, false);
  assert.equal(guardrails.mms_booking_confirmed, false);
});



test("P6 booking observation correlates booking_ref to the exact canonical Session and Job", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    seen.push({
      path: parsed.pathname,
      formula: parsed.searchParams.get("filterByFormula"),
      maxRecords: parsed.searchParams.get("maxRecords"),
    });

    if (parsed.pathname.endsWith("/tblBookingRequests")) {
      return Response.json({
        records: [{
          id: "recBookingA1",
          fields: {
            booking_ref: "kenji_0123456789abcdef01234567",
            resolver_payload_json: JSON.stringify({
              job_creation_state: "created",
              job_receipt: {
                session_id: "sess_exact_001",
                payment_ref: "pay_hidden_from_projection",
              },
            }),
          },
        }],
      });
    }
    if (parsed.pathname.endsWith("/tblSessions")) {
      return Response.json({
        records: [{
          id: "recSessionA1",
          fields: {
            session_id: "sess_exact_001",
            job_id: "JOB-EXACT-001",
            session_state: "confirmed",
          },
        }],
      });
    }
    if (parsed.pathname.endsWith("/tblJobs")) {
      return Response.json({
        records: [{
          id: "recJobA1",
          fields: {
            session_id: "sess_exact_001",
            job_id: "JOB-EXACT-001",
            status: "confirmed",
            "Internal Notes": "must not leak",
          },
        }],
      });
    }
    throw new Error(`unexpected fetch ${parsed.pathname}`);
  };

  try {
    const observation = await observeExactBookingCorrelation({
      AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
      AIRTABLE_API_KEY: "test-token",
      AIRTABLE_TABLE_BOOKING_REQUESTS_ID: "tblBookingRequests",
      AIRTABLE_TABLE_SESSIONS: "tblSessions",
      AIRTABLE_TABLE_JOBS: "tblJobs",
    }, {
      mode: "booking",
      status: "materialized",
      canonical_ref: "kenji_0123456789abcdef01234567",
    });

    assert.equal(observation.source, "sigil-booking-worker");
    assert.equal(observation.exact_correlation, true);
    assert.equal(observation.correlation_scope, "booking_ref_to_job_exact");
    assert.equal(observation.booking_ref, "kenji_0123456789abcdef01234567");
    assert.equal(observation.session_id, "sess_exact_001");
    assert.equal(observation.job_id, "JOB-EXACT-001");
    assert.equal(observation.session_state, "confirmed");
    assert.equal(observation.job_state, "confirmed");
    assert.equal(observation.final_confirmation_observed, true);
    assert.equal(observation.inference_used, false);
    assert.equal(Object.hasOwn(observation, "payment_ref"), false);
    assert.equal(Object.hasOwn(observation, "customer_confirmation_url"), false);
    assert.equal(Object.hasOwn(observation, "model_confirmation_url"), false);

    assert.equal(seen.length, 3);
    assert.equal(seen.every((item) => item.maxRecords === "2"), true);
    assert.match(seen[0].formula, /booking_ref/);
    assert.match(seen[1].formula, /session_id/);
    assert.match(seen[2].formula, /session_id/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("P6 booking observation does not infer a Job when booking receipt has no session_id", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    reads += 1;
    if (parsed.pathname.endsWith("/tblBookingRequests")) {
      return Response.json({
        records: [{
          id: "recBookingA1",
          fields: {
            booking_ref: "kenji_0123456789abcdef01234567",
            resolver_payload_json: JSON.stringify({
              job_creation_state: "review_required",
            }),
          },
        }],
      });
    }
    throw new Error("must not read Session or Job without exact job_receipt.session_id");
  };

  try {
    const observation = await observeExactBookingCorrelation({
      AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
      AIRTABLE_API_KEY: "test-token",
      AIRTABLE_TABLE_BOOKING_REQUESTS_ID: "tblBookingRequests",
      AIRTABLE_TABLE_SESSIONS: "tblSessions",
      AIRTABLE_TABLE_JOBS: "tblJobs",
    }, {
      status: "materialized",
      canonical_ref: "kenji_0123456789abcdef01234567",
    });

    assert.equal(reads, 1);
    assert.equal(observation.exact_correlation, false);
    assert.equal(observation.state, "review_required");
    assert.equal(observation.correlation_scope, "booking_ref_exact_no_job_receipt");
    assert.equal(observation.final_confirmation_observed, false);
    assert.equal(Object.hasOwn(observation, "session_id"), false);
    assert.equal(Object.hasOwn(observation, "job_id"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("P6 booking exact correlation fails closed on duplicate session/job matches", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/tblBookingRequests")) {
      return Response.json({
        records: [{
          id: "recBookingA1",
          fields: {
            booking_ref: "kenji_0123456789abcdef01234567",
            resolver_payload_json: JSON.stringify({
              job_creation_state: "created",
              job_receipt: { session_id: "sess_conflict_001" },
            }),
          },
        }],
      });
    }
    if (parsed.pathname.endsWith("/tblSessions")) {
      return Response.json({
        records: [
          { id: "recSessionA1", fields: { session_id: "sess_conflict_001" } },
          { id: "recSessionA2", fields: { session_id: "sess_conflict_001" } },
        ],
      });
    }
    if (parsed.pathname.endsWith("/tblJobs")) return Response.json({ records: [] });
    throw new Error(`unexpected fetch ${parsed.pathname}`);
  };

  try {
    const observation = await observeExactBookingCorrelation({
      AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
      AIRTABLE_API_KEY: "test-token",
      AIRTABLE_TABLE_BOOKING_REQUESTS_ID: "tblBookingRequests",
      AIRTABLE_TABLE_SESSIONS: "tblSessions",
      AIRTABLE_TABLE_JOBS: "tblJobs",
    }, {
      status: "materialized",
      canonical_ref: "kenji_0123456789abcdef01234567",
    });

    assert.equal(observation.exact_correlation, false);
    assert.equal(observation.state, "job_correlation_conflict");
    assert.equal(observation.conflict, true);
    assert.equal(observation.final_confirmation_observed, false);
    assert.equal(observation.inference_used, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("P6 authority observation reads Payment truth without inferring it from the execution receipt", async () => {
  const observation = await observeP6Authority({}, {
    mode: "payment_proof",
    status: "customer_action_required",
  }, {
    payment_live: {
      status: "pending_review",
      paid: false,
      review_required: true,
      outstanding_amount_thb: 5000,
    },
  });

  assert.equal(observation.source, "payments-worker");
  assert.equal(observation.state, "review_required");
  assert.equal(observation.paid, false);
  assert.equal(observation.review_required, true);
  assert.equal(observation.final_confirmation_observed, false);
  assert.equal(observation.inference_used, false);
});

test("P6 authority observation reads MMS prebooking state by canonical ref without exposing Therapist IDs", async () => {
  let path = "";
  const observation = await observeP6Authority({
    MMS_WORKER: {
      async fetch(request) {
        path = new URL(request.url).pathname;
        return Response.json({
          ok: true,
          prebooking: {
            prebooking_id: "mmspre_1234567890abcdef12345678",
            status: "Options Ready",
            sync_status: "synced",
          },
        });
      },
    },
  }, {
    mode: "mms",
    status: "materialized",
    canonical_ref: "mmspre_1234567890abcdef12345678",
  }, {});

  assert.equal(path, "/internal/mms/prebookings/mmspre_1234567890abcdef12345678");
  assert.equal(observation.source, "mms-worker");
  assert.equal(observation.state, "Options Ready");
  assert.equal(observation.final_confirmation_observed, false);
  assert.equal(Object.hasOwn(observation, "matched_therapist_ids"), false);
});
