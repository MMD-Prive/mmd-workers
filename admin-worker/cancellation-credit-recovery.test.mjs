import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { handleCancellationCreditRecoveryRequest } from "./src/cancellation-credit-recovery.js";

const IDS = Object.freeze({
  proof: "recProof000000000",
  client: "recClient00000000",
  staleClient: "recStale000000000",
  session: "recSession0000000",
  payment: "recPayment0000000",
});
const PROOF_ID = "hist_016267003725dor08189";
const PAYMENT_REF = "016267003725DOR08189";
const RECOVERY_SESSION_ID = `cxl_hist_${PROOF_ID}`;

function historicalNote(reviewState = "pending") {
  return JSON.stringify({
    schema: "mmd_historical_slip_backfill_v1",
    source_type: "line_archive",
    evidence_sha256: "a".repeat(64),
    extraction: { payment_ref: PAYMENT_REF, amount_thb: 4500 },
    review_state: reviewState,
  });
}

function fixture({ staleProofClient = false, officialPayment = false } = {}) {
  const db = {
    proofs: [{
      id: IDS.proof,
      fields: {
        proof_id: PROOF_ID,
        status: "pending",
        payment_ref: PAYMENT_REF,
        amount_thb: 4500,
        Client: staleProofClient ? [IDS.staleClient] : [IDS.client],
        note: historicalNote(),
      },
    }],
    sessions: officialPayment ? [{
      id: IDS.session,
      fields: {
        fldLTq2kZbyRv22IA: RECOVERY_SESSION_ID,
        fldmwuvOaiCFdzzRa: "Cancelled",
        fld6P6if0vDZCeV0C: [IDS.client],
        fldojgjSQLaO0uQLX: PAYMENT_REF,
      },
    }] : [],
    clients: [{ id: IDS.client, fields: { "Client Name (Display)": "บอส 23 ก.ย. 69" } }],
    payments: officialPayment ? [{
      id: IDS.payment,
      fields: {
        "Payment Reference": PAYMENT_REF,
        fld2wdhBvc8xrV6y5: RECOVERY_SESSION_ID,
        fldcrLuJijj7xr0y8: [IDS.client],
        fld5rTIVEF1DXwfe2: 4500,
        fldJ7a0Ube9F0bmRy: "official_verified",
        fldD0mQWTfdmyBAeT: "official_verified",
        fldPNK6qgxCSdaJRM: "2026-09-24T00:37:00.000Z",
        flddkMKy5H8RbFwt9: PAYMENT_REF,
        fld208LCmQZB5llNo: "payments-worker",
      },
    }] : [],
    credits: [],
  };
  const calls = { creates: [], patches: [], downstream: [] };
  const tableFor = (id) => ({
    tblfJfM4Sqag9zrLi: "proofs",
    tblC98mKWbzmPuNzX: "sessions",
    tblVv58TCbwh5j1fS: "clients",
    tblWGGJJOx5eBvBZJ: "payments",
    tblKvhl2zZm9yYBmT: "credits",
  }[id]);
  const env = {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        const tableName = tableFor(parts[2]);
        const recordId = parts[3] || "";
        const rows = db[tableName];
        if (!tableName) throw new Error(`Unknown table ${parts[2]}`);
        if (request.method === "GET" && recordId) {
          const record = rows.find((row) => row.id === recordId);
          return record ? Response.json(record) : Response.json({ error: "not_found" }, { status: 404 });
        }
        if (request.method === "GET") {
          const formula = url.searchParams.get("filterByFormula") || "";
          const wanted = formula.match(/='([^']+)'/)?.[1] || "";
          let matched = rows;
          if (formula.includes("proof_id")) matched = rows.filter((row) => row.fields.proof_id === wanted);
          else if (formula.includes("session_id")) matched = rows.filter((row) => row.fields.session_id === wanted || row.fields.fldLTq2kZbyRv22IA === wanted);
          else if (formula.includes("Payment Reference")) matched = rows.filter((row) => row.fields["Payment Reference"] === wanted);
          else if (formula.includes("source_payment_ref")) matched = rows.filter((row) => row.fields.source_payment_ref === wanted);
          return Response.json({ records: matched });
        }
        if (request.method === "POST") {
          const body = await request.json();
          const fields = body.records?.[0]?.fields || {};
          const id = "recRecovery000000";
          const record = { id, fields };
          rows.push(record);
          calls.creates.push({ tableName, fields });
          return Response.json({ records: [record] }, { status: 201 });
        }
        if (request.method === "PATCH" && recordId) {
          const body = await request.json();
          const record = rows.find((row) => row.id === recordId);
          if (!record) return Response.json({ error: "not_found" }, { status: 404 });
          Object.assign(record.fields, body.fields || {});
          calls.patches.push({ tableName, recordId, fields: body.fields || {} });
          return Response.json(record);
        }
        throw new Error(`Unexpected Airtable request ${request.method} ${url}`);
      },
    },
  };
  return { db, calls, env };
}

function request(body) {
  return new Request("https://mmdbkk.com/v1/admin/cancellation-credit-recovery", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://mmdbkk.com" },
    body: JSON.stringify(body),
  });
}

const actorDeps = { readActor: async () => ({ id: "per", role: "admin" }) };

test("recovery route is wired through the active admin wrapper and both production hosts", () => {
  const wrapper = readFileSync(new URL("./src/job-orchestrator-owner-ops-wrapper.js", import.meta.url), "utf8");
  const wrangler = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
  assert.match(wrapper, /from "\.\/cancellation-credit-recovery\.js"/);
  assert.match(wrangler, /mmdbkk\.com\/v1\/admin\/cancellation-credit-recovery/);
  assert.match(wrangler, /www\.mmdbkk\.com\/v1\/admin\/cancellation-credit-recovery/);
});

test("Historical Backfill page exposes the guarded three-step recovery card", () => {
  const ui = readFileSync(new URL("../webflow/internal/admin/payments/historical-payment-context-v3.js", import.meta.url), "utf8");
  assert.match(ui, /\/v1\/admin\/cancellation-credit-recovery/);
  assert.match(ui, /\/v1\/admin\/clients\/lineage-lookup/);
  assert.match(ui, /identity_correction_confirmed/);
  assert.match(ui, /window\.confirm\('ยืนยันสลิปนี้เป็นมัดจำ/);
  assert.match(ui, /window\.confirm\('ยืนยันออกเครดิต/);
});

function prepareBody(overrides = {}) {
  return {
    action: "prepare",
    proof_id: PROOF_ID,
    client_id: IDS.client,
    model_name: "Book EI",
    job_type: "PN",
    job_date: "2026-09-24",
    start_time: "01:00",
    end_time: "02:30",
    location_name: "Customer location",
    google_map_url: "https://maps.app.goo.gl/mq4DGTASiPSxt6U77",
    service_amount_thb: 15000,
    model_payout_thb: 10000,
    cancellation_reason: "Book ไม่ตรงปก",
    source_label: "LINE OFC",
    ...overrides,
  };
}

test("stale proof identity requires explicit correction, then creates only a cancelled recovery session", async () => {
  const state = fixture({ staleProofClient: true });
  const blocked = await handleCancellationCreditRecoveryRequest(request(prepareBody()), state.env, null, actorDeps);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error.code, "IDENTITY_CORRECTION_CONFIRMATION_REQUIRED");
  assert.equal(state.db.sessions.length, 0);
  assert.equal(state.db.payments.length, 0);
  assert.equal(state.db.credits.length, 0);

  const approved = await handleCancellationCreditRecoveryRequest(request(prepareBody({
    identity_correction_confirmed: true,
    identity_correction_reason: "สลิปเก่าผูก alias ผิด ต้องย้ายไป canonical ลูกค้าคนนี้",
  })), state.env, null, actorDeps);
  assert.equal(approved.status, 201);
  const result = await approved.json();
  assert.equal(result.ok, true);
  assert.equal(result.action, "prepared");
  assert.equal(result.identity_corrected, true);
  assert.equal(state.db.sessions.length, 1);
  const session = state.db.sessions[0].fields;
  assert.equal(session.fldmwuvOaiCFdzzRa, "Cancelled");
  assert.deepEqual(session.fld6P6if0vDZCeV0C, [IDS.client]);
  assert.equal(session.fldojgjSQLaO0uQLX, PAYMENT_REF);
  assert.equal(session.fldhwC79ndbnEXSZz, 15000);
  assert.equal(session.fldlTO5aNfqUmlNWm, 10000);
  assert.deepEqual(state.db.proofs[0].fields.fldQB8ZZ9WSanCNzr, [IDS.client]);
  assert.equal(state.db.payments.length, 0);
  assert.equal(state.db.credits.length, 0);
});

test("only owner/admin roles can use the cancellation credit authority", async () => {
  const state = fixture();
  const response = await handleCancellationCreditRecoveryRequest(request(prepareBody()), state.env, null, {
    readActor: async () => ({ id: "partner", role: "mms_partner" }),
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "RECOVERY_OWNER_ROLE_REQUIRED");
  assert.equal(state.db.sessions.length, 0);
});

test("credit is blocked until the source payment is officially verified", async () => {
  const state = fixture({ officialPayment: false });
  state.db.sessions.push({
    id: IDS.session,
    fields: {
      fldLTq2kZbyRv22IA: RECOVERY_SESSION_ID,
      fldmwuvOaiCFdzzRa: "Cancelled",
      fld6P6if0vDZCeV0C: [IDS.client],
      fldojgjSQLaO0uQLX: PAYMENT_REF,
    },
  });
  const response = await handleCancellationCreditRecoveryRequest(request({ action: "issue_credit", proof_id: PROOF_ID }), state.env, null, {
    ...actorDeps,
    delegatedWorker: { fetch: async () => { throw new Error("must_not_reach_credit_writer"); } },
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "RECOVERY_PAYMENT_NOT_OFFICIALLY_VERIFIED");
});

test("credit handoff uses the payment-authority received amount and stable idempotency key", async () => {
  const state = fixture({ officialPayment: true });
  const response = await handleCancellationCreditRecoveryRequest(request({ action: "issue_credit", proof_id: PROOF_ID }), state.env, null, {
    ...actorDeps,
    delegatedWorker: {
      async fetch(forwarded) {
        state.calls.downstream.push({
          url: forwarded.url,
          idempotency: forwarded.headers.get("idempotency-key"),
          body: await forwarded.json(),
        });
        return Response.json({ ok: true, credit: { recordId: "recCredit0000000" } }, { status: 201 });
      },
    },
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).ok, true);
  assert.equal(state.calls.downstream.length, 1);
  assert.equal(state.calls.downstream[0].body.amount_thb, 4500);
  assert.equal(state.calls.downstream[0].body.reason, "client_cancel_no_penalty");
  assert.equal(state.calls.downstream[0].idempotency, `cancellation-credit:${IDS.proof}:${IDS.client}`);
});
