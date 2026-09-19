import test from "node:test";
import assert from "node:assert/strict";

import {
  HYPE_CONTINUITY_PATH,
  HYPE_HANDOFF_PATH,
  handleHypeContinuityRpc,
  handleHypeHandoffRpc,
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
