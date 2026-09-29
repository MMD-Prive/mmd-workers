import test from "node:test";
import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";

import {
  handleRefundOpsInternalIntake,
  handleRefundOpsRequest,
} from "./src/refund-ops.js";

if (!globalThis.File) globalThis.File = NodeFile;

const BASE_ID = "appTestRefund";
const TABLE = "tblRefundInbox";
const TOKEN = "airtable-token";
const LINE_ID = "U" + "a".repeat(32);

function env(extra = {}) {
  return {
    AIRTABLE_BASE_ID: BASE_ID,
    AIRTABLE_API_KEY: TOKEN,
    AIRTABLE_TABLE_CONSOLE_INBOX_ID: TABLE,
    CONFIRM_KEY: "refund-signing-secret",
    ...extra,
  };
}

function internalIntake(body) {
  return new Request("https://admin-worker.internal/v1/internal/refund-ops/intake", {
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-mmd-internal-call":"true",
      "x-mmd-service-binding":"member-dashboard-chat-worker",
    },
    body:JSON.stringify(body),
  });
}

test("same-job refund account change is flagged without overwriting prior evidence", async () => {
  const originalFetch = globalThis.fetch;
  const created = [];
  const priorFingerprint = "1".repeat(64);
  const nextFingerprint = "2".repeat(64);
  const prior = {
    id:"recPriorRefund",
    fields:{
      inbox_id:"refund_prior",
      line_user_id:LINE_ID,
      intent:"refund_bank_detail",
      created_at:"2026-09-29T03:00:00.000Z",
      payload_json:JSON.stringify({
        schema:"mmd_refund_bank_detail_v1",
        purpose:"refund",
        job_id:"JOB-FILM-J-001",
        account_fingerprint:priorFingerprint,
        account_number_masked:"•••• 1234",
      }),
    },
  };

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    const formula = url.searchParams.get("filterByFormula") || "";
    if (method === "GET" && formula.includes("{inbox_id}")) return Response.json({ records:[] });
    if (method === "GET" && formula.includes("{line_user_id}")) return Response.json({ records:[prior] });
    if (method === "POST") {
      const body = JSON.parse(init.body || "{}");
      created.push(body.fields);
      return Response.json({ id:"recNewRefund", fields:body.fields });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  try {
    const response = await handleRefundOpsInternalIntake(internalIntake({
      inbox_id:"refund_new",
      line_user_id:LINE_ID,
      customer_name:"แมน",
      purpose:"refund",
      bank_name:"กสิกรไทย",
      account_name_masked:"ม••",
      account_number_masked:"•••• 9876",
      account_fingerprint:nextFingerprint,
      private_detail_key:"line-ofc/bank-details/new/detail.json",
      source_image_key:"line-ofc/bank-details/new/original.jpg",
      job_id:"JOB-FILM-J-001",
    }), env());

    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.account_changed, true);
    assert.equal(payload.account_change_review_required, true);
    assert.equal(payload.previous_account_inbox_id, "refund_prior");
    assert.equal(created.length, 1);
    const stored = JSON.parse(created[0].payload_json);
    assert.equal(stored.account_changed, true);
    assert.equal(stored.account_change_review_required, true);
    assert.equal(stored.account_fingerprint, nextFingerprint);
    assert.equal(stored.previous_account_inbox_id, "refund_prior");
    assert.match(created[0].admin_note, /ACCOUNT CHANGED/);
    assert.doesNotMatch(created[0].payload_json, /123-4-56789-0/);
    assert.equal(stored.money_truth_mutated, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("different account on another job is not falsely promoted to ACCOUNT CHANGED", async () => {
  const originalFetch = globalThis.fetch;
  const created = [];
  const prior = {
    id:"recPriorRefund",
    fields:{
      inbox_id:"refund_prior",
      line_user_id:LINE_ID,
      intent:"refund_bank_detail",
      created_at:"2026-09-29T03:00:00.000Z",
      payload_json:JSON.stringify({
        purpose:"refund",
        job_id:"OTHER-JOB",
        account_fingerprint:"1".repeat(64),
      }),
    },
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    const formula = url.searchParams.get("filterByFormula") || "";
    if (method === "GET" && formula.includes("{inbox_id}")) return Response.json({ records:[] });
    if (method === "GET" && formula.includes("{line_user_id}")) return Response.json({ records:[prior] });
    if (method === "POST") {
      const body = JSON.parse(init.body || "{}");
      created.push(body.fields);
      return Response.json({ id:"recNewRefund", fields:body.fields });
    }
    throw new Error("unexpected fetch");
  };
  try {
    const response = await handleRefundOpsInternalIntake(internalIntake({
      inbox_id:"refund_new_other",
      line_user_id:LINE_ID,
      purpose:"refund",
      account_number_masked:"•••• 9876",
      account_fingerprint:"2".repeat(64),
      job_id:"JOB-FILM-J-001",
    }), env());
    const payload = await response.json();
    assert.equal(payload.account_changed, false);
    assert.equal(JSON.parse(created[0].payload_json).account_changed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("owner receipt upload completes task, calls LINE notifier, and signed media reads private R2", async () => {
  const originalFetch = globalThis.fetch;
  const objects = new Map();
  const record = {
    id:"recRefundTask",
    fields:{
      inbox_id:"refund_receipt_test",
      line_user_id:LINE_ID,
      member_name:"แมน",
      status:"new",
      admin_note:"Refund account received",
      payload_json:JSON.stringify({
        schema:"mmd_refund_bank_detail_v1",
        purpose:"refund",
        job_id:"JOB-FILM-J-001",
        customer_name:"แมน",
        money_truth_mutated:false,
      }),
    },
  };
  const lineCalls = [];
  const bucket = {
    async put(key, value, options = {}) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value);
      objects.set(key, { bytes, options });
    },
    async get(key) {
      const found = objects.get(key);
      if (!found) return null;
      return {
        body:found.bytes,
        size:found.bytes.byteLength,
        httpMetadata:{ contentType:found.options?.httpMetadata?.contentType || "application/octet-stream" },
      };
    },
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    const formula = url.searchParams.get("filterByFormula") || "";
    if (method === "GET" && formula.includes("{inbox_id}")) return Response.json({ records:[record] });
    if (method === "PATCH") {
      const body = JSON.parse(init.body || "{}");
      Object.assign(record.fields, body.fields || {});
      return Response.json({ id:record.id, fields:record.fields });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  const e = env({
    LINE_SLIP_EVIDENCE:bucket,
    MEMBER_DASHBOARD_CHAT_WORKER:{
      async fetch(request) {
        const body = await request.json();
        lineCalls.push({ url:request.url, headers:Object.fromEntries(request.headers), body });
        return Response.json({ ok:true, status:"sent", mode:"image", money_truth_mutated:false });
      },
    },
  });

  try {
    const form = new FormData();
    form.append("inbox_id", "refund_receipt_test");
    form.append("file", new File([new Uint8Array([1,2,3,4])], "receipt.jpg", { type:"image/jpeg" }));
    const response = await handleRefundOpsRequest(new Request("https://www.mmdbkk.com/v1/admin/refunds/receipt", {
      method:"POST",
      body:form,
    }), e, { isAuthed:async () => true });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, "completed");
    assert.equal(payload.money_truth_mutated, false);
    assert.equal(payload.line_notification.sent, true);
    assert.equal(lineCalls.length, 1);
    assert.equal(lineCalls[0].url, "https://member-dashboard-chat-worker.local/__internal/line/refund-receipt-notify");
    assert.equal(lineCalls[0].headers["x-mmd-service-binding"], "admin-worker");
    assert.equal(lineCalls[0].body.line_user_id, LINE_ID);
    assert.match(lineCalls[0].body.receipt_url, /^https:\/\/www\.mmdbkk\.com\/refund-receipt\/media\?/);
    assert.equal(lineCalls[0].body.money_truth_mutated, false);

    const stored = JSON.parse(record.fields.payload_json);
    assert.match(stored.receipt_r2_key, /^owner-refund-receipts\//);
    assert.equal(stored.customer_receipt_delivery_status, "sent");
    assert.equal(stored.customer_receipt_delivery_mode, "image");
    assert.equal(stored.money_truth_mutated, false);

    const media = await handleRefundOpsRequest(new Request(lineCalls[0].body.receipt_url), e, { isAuthed:async () => false });
    assert.equal(media.status, 200);
    assert.equal(media.headers.get("content-type"), "image/jpeg");
    assert.match(media.headers.get("cache-control"), /no-store/);
    assert.deepEqual([...new Uint8Array(await media.arrayBuffer())], [1,2,3,4]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
