import test from "node:test";
import assert from "node:assert/strict";
import {
  MODEL_PAYOUT_ADJUSTMENTS_PATH,
  handleModelPayoutAdjustments,
  isModelPayoutAdjustmentRequest,
  readModelPayoutAdjustmentAudit,
} from "./src/model-payout-adjustments.js";

const BASE = "appsV1ILPRfIjkaYg";
const SESSIONS = "tblC98mKWbzmPuNzX";
const ADJUSTMENTS = "tbl2624vwyWkOeP0y";
const MODEL = "recBKaHfxUKs8fkMV";
const SESSION_RECORD = "recSession12345678";
const ENV = {
  AIRTABLE_API_KEY: "test-airtable-token",
  AIRTABLE_BASE_ID: BASE,
  AIRTABLE_TABLE_SESSIONS: SESSIONS,
  AIRTABLE_TABLE_MODEL_PAYOUT_ADJUSTMENTS: ADJUSTMENTS,
};
const ACTOR = { id: "per", role: "owner" };

function sessionFields(overrides = {}) {
  return {
    session_id: "sess_simba_001",
    model_name: "Simba",
    "Canonical Model": [MODEL],
    pay_model_thb: 9000,
    amount_thb: 15000,
    payment_status: "verified",
    ...overrides,
  };
}

function installFetchMock({
  session = sessionFields(),
  existingAdjustment = null,
  patchFails = false,
  createFails = false,
} = {}) {
  const previous = globalThis.fetch;
  const calls = [];
  let currentSession = { id: SESSION_RECORD, fields: { ...session } };
  let adjustment = existingAdjustment;

  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const table = parts[2] || "";
    const recordId = parts[3] || "";
    const body = method === "POST" || method === "PATCH"
      ? await request.clone().json().catch(() => null)
      : null;
    calls.push({ method, url: request.url, table, recordId, body });

    if (table === SESSIONS && method === "GET") {
      return Response.json({ records: [currentSession] });
    }

    if (table === ADJUSTMENTS && method === "GET") {
      const formula = url.searchParams.get("filterByFormula") || "";
      if (formula.includes("idempotency_key")) {
        return Response.json({ records: adjustment ? [adjustment] : [] });
      }
      return Response.json({ records: adjustment ? [adjustment] : [] });
    }

    if (table === ADJUSTMENTS && method === "POST") {
      if (createFails) return Response.json({ error: { message: "fixture create failure" } }, { status: 503 });
      adjustment = {
        id: "recAdjustment12345",
        fields: {
          ...body.fields,
          signed_amount_thb:
            body.fields.direction === "deduct"
              ? -Number(body.fields.amount_thb)
              : Number(body.fields.amount_thb),
        },
      };
      return Response.json(adjustment, { status: 201 });
    }

    if (table === SESSIONS && recordId === SESSION_RECORD && method === "PATCH") {
      if (patchFails) return Response.json({ error: { message: "fixture patch failure" } }, { status: 503 });
      currentSession = {
        id: SESSION_RECORD,
        fields: { ...currentSession.fields, ...(body?.fields || {}) },
      };
      return Response.json(currentSession);
    }

    if (table === ADJUSTMENTS && recordId === adjustment?.id && method === "DELETE") {
      adjustment = null;
      return Response.json({ id: recordId, deleted: true });
    }

    return Response.json({ error: { message: "fixture not found" } }, { status: 404 });
  };

  return {
    calls,
    get session() { return currentSession; },
    get adjustment() { return adjustment; },
    restore() { globalThis.fetch = previous; },
  };
}

function post(body, origin = "https://mmdbkk.com") {
  return new Request(`https://mmdbkk.com${MODEL_PAYOUT_ADJUSTMENTS_PATH}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("route matcher accepts GET/POST only", () => {
  assert.equal(isModelPayoutAdjustmentRequest(MODEL_PAYOUT_ADJUSTMENTS_PATH, "GET"), true);
  assert.equal(isModelPayoutAdjustmentRequest(MODEL_PAYOUT_ADJUSTMENTS_PATH, "POST"), true);
  assert.equal(isModelPayoutAdjustmentRequest(MODEL_PAYOUT_ADJUSTMENTS_PATH, "DELETE"), false);
  assert.equal(isModelPayoutAdjustmentRequest("/v1/admin/other", "POST"), false);
});

test("owner can add travel allowance without changing customer amount fields", async () => {
  const mock = installFetchMock();
  try {
    const response = await handleModelPayoutAdjustments(
      post({
        session_id: "sess_simba_001",
        direction: "add",
        adjustment_type: "travel",
        amount_thb: 1000,
        note: "ค่าเดินทาง",
        idempotency_key: "simba-travel-20260918-001",
      }),
      ENV,
      ACTOR,
    );
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.session.session_id, "sess_simba_001");
    assert.equal(body.session.model_name, "Simba");
    assert.equal(body.session.current_payout_thb, 10000);
    assert.equal(body.adjustment.payout_before_thb, 9000);
    assert.equal(body.adjustment.amount_thb, 1000);
    assert.equal(body.adjustment.signed_amount_thb, 1000);
    assert.equal(body.adjustment.payout_after_thb, 10000);
    assert.equal(body.adjustment.adjustment_type, "travel");
    assert.equal(mock.session.fields.pay_model_thb, 10000);
    assert.equal(mock.session.fields.amount_thb, 15000);
    assert.equal(mock.session.fields.payment_status, "verified");

    const create = mock.calls.find((call) => call.table === ADJUSTMENTS && call.method === "POST");
    assert.deepEqual(create.body.fields.Session, [SESSION_RECORD]);
    assert.deepEqual(create.body.fields.Model, [MODEL]);
    assert.equal(create.body.fields.created_by, "per");

    const patch = mock.calls.find((call) => call.table === SESSIONS && call.method === "PATCH");
    assert.deepEqual(patch.body.fields, { pay_model_thb: 10000 });

    assert.equal(body.session.customer_amount_thb, undefined);
    assert.equal(body.session.payment_status, undefined);
    assert.equal(body.adjustment.payment_ref, undefined);
    assert.equal(body.adjustment.deposit_thb, undefined);
  } finally {
    mock.restore();
  }
});

test("deduction cannot drive model payout below zero", async () => {
  const mock = installFetchMock({ session: sessionFields({ pay_model_thb: 500 }) });
  try {
    const response = await handleModelPayoutAdjustments(
      post({
        session_id: "sess_simba_001",
        direction: "deduct",
        adjustment_type: "correction",
        amount_thb: 1000,
        note: "reverse mistaken allowance",
        idempotency_key: "deduct-too-large-001",
      }),
      ENV,
      ACTOR,
    );
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.equal(body.error, "resulting_payout_invalid");
    assert.equal(mock.calls.some((call) => call.method === "POST" && call.table === ADJUSTMENTS), false);
  } finally {
    mock.restore();
  }
});

test("canonical Model link is required before payout can be changed", async () => {
  const mock = installFetchMock({ session: sessionFields({ "Canonical Model": [] }) });
  try {
    const response = await handleModelPayoutAdjustments(
      post({
        session_id: "sess_simba_001",
        direction: "add",
        adjustment_type: "bonus",
        amount_thb: 500,
        idempotency_key: "bonus-001",
      }),
      ENV,
      ACTOR,
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "canonical_model_link_required");
  } finally {
    mock.restore();
  }
});

test("same idempotency key never applies an adjustment twice", async () => {
  const existing = {
    id: "recExistingAdjust1",
    fields: {
      adjustment_id: "mpa_existing",
      Session: [SESSION_RECORD],
      Model: [MODEL],
      session_id: "sess_simba_001",
      model_name: "Simba",
      direction: "add",
      adjustment_type: "travel",
      amount_thb: 1000,
      signed_amount_thb: 1000,
      payout_before_thb: 9000,
      payout_after_thb: 10000,
      note: "ค่าเดินทาง",
      created_by: "per",
      created_at: "2026-09-18T12:00:00.000Z",
      source: "mmd_owner_model_payout_adjustment_v1",
      idempotency_key: "simba-travel-20260918-001",
    },
  };
  const mock = installFetchMock({
    session: sessionFields({ pay_model_thb: 10000 }),
    existingAdjustment: existing,
  });
  try {
    const response = await handleModelPayoutAdjustments(
      post({
        session_id: "sess_simba_001",
        direction: "add",
        adjustment_type: "travel",
        amount_thb: 1000,
        idempotency_key: "simba-travel-20260918-001",
      }),
      ENV,
      ACTOR,
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.replayed, true);
    assert.equal(body.session.current_payout_thb, 10000);
    assert.equal(mock.calls.some((call) => call.method === "PATCH"), false);
    assert.equal(mock.calls.some((call) => call.method === "POST"), false);
  } finally {
    mock.restore();
  }
});

test("failed Session patch removes the provisional adjustment row", async () => {
  const mock = installFetchMock({ patchFails: true });
  try {
    const response = await handleModelPayoutAdjustments(
      post({
        session_id: "sess_simba_001",
        direction: "add",
        adjustment_type: "waiting",
        amount_thb: 500,
        idempotency_key: "waiting-001",
      }),
      ENV,
      ACTOR,
    );
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error, "session_payout_update_failed");
    assert.equal(mock.adjustment, null);
    assert.equal(mock.session.fields.pay_model_thb, 9000);
  } finally {
    mock.restore();
  }
});

test("POST is credential-bound and same-origin only", async () => {
  const mock = installFetchMock();
  try {
    const unauthorized = await handleModelPayoutAdjustments(
      post({ session_id: "sess_simba_001" }),
      ENV,
      null,
    );
    assert.equal(unauthorized.status, 401);

    const wrongRole = await handleModelPayoutAdjustments(
      post({ session_id: "sess_simba_001" }),
      ENV,
      { id: "mms", role: "mms_partner" },
    );
    assert.equal(wrongRole.status, 403);

    const crossOrigin = await handleModelPayoutAdjustments(
      post({
        session_id: "sess_simba_001",
        direction: "add",
        adjustment_type: "travel",
        amount_thb: 1000,
      }, "https://evil.example"),
      ENV,
      ACTOR,
    );
    assert.equal(crossOrigin.status, 403);
    assert.equal((await crossOrigin.json()).error, "forbidden_origin");
  } finally {
    mock.restore();
  }
});


test("read-only payout audit proves the adjustment chain and flags a mismatched current total", async () => {
  const existing = {
    id: "recExistingAdjust2",
    fields: {
      adjustment_id: "mpa_audit",
      Session: [SESSION_RECORD],
      Model: [MODEL],
      session_id: "sess_simba_001",
      model_name: "Simba",
      direction: "add",
      adjustment_type: "travel",
      amount_thb: 1000,
      signed_amount_thb: 1000,
      payout_before_thb: 9000,
      payout_after_thb: 10000,
      note: "travel",
      created_by: "per",
      created_at: "2026-09-18T12:00:00.000Z",
      source: "mmd_owner_model_payout_adjustment_v1",
      idempotency_key: "audit-chain-001",
    },
  };
  const mock = installFetchMock({
    session: sessionFields({ pay_model_thb: 10500, created_at: "2026-09-18T10:00:00.000Z" }),
    existingAdjustment: existing,
  });
  try {
    const result = await readModelPayoutAdjustmentAudit(ENV, "sess_simba_001");
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.session.current_payout_thb, 10500);
    assert.equal(result.body.integrity.starting_payout_thb, 9000);
    assert.equal(result.body.integrity.adjustment_net_thb, 1000);
    assert.equal(result.body.integrity.expected_current_payout_thb, 10000);
    assert.equal(result.body.integrity.actual_current_payout_thb, 10500);
    assert.equal(result.body.integrity.needs_reconciliation, true);
    assert.equal(result.body.integrity.issues[0].code, "model_payout_current_total_mismatch");
  } finally {
    mock.restore();
  }
});

test("read-only payout audit passes a continuous immutable adjustment chain", async () => {
  const existing = {
    id: "recExistingAdjust3",
    fields: {
      adjustment_id: "mpa_clean",
      Session: [SESSION_RECORD],
      Model: [MODEL],
      session_id: "sess_simba_001",
      model_name: "Simba",
      direction: "add",
      adjustment_type: "bonus",
      amount_thb: 500,
      signed_amount_thb: 500,
      payout_before_thb: 9000,
      payout_after_thb: 9500,
      created_by: "per",
      created_at: "2026-09-18T12:00:00.000Z",
      source: "mmd_owner_model_payout_adjustment_v1",
      idempotency_key: "audit-clean-001",
    },
  };
  const mock = installFetchMock({
    session: sessionFields({ pay_model_thb: 9500 }),
    existingAdjustment: existing,
  });
  try {
    const result = await readModelPayoutAdjustmentAudit(ENV, "sess_simba_001");
    assert.equal(result.status, 200);
    assert.equal(result.body.integrity.ok, true);
    assert.equal(result.body.integrity.issue_count, 0);
    assert.equal(result.body.policy.immutable_ledger, true);
  } finally {
    mock.restore();
  }
});
