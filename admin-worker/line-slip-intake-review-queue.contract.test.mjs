import test from "node:test";
import assert from "node:assert/strict";

import { processPaymentSlipImage } from "../immigrate-worker/netlify/functions/line-payment-slip-intake.mjs";
import { handlePaymentReviewRequest } from "./src/payment-review-runtime.js";

test("LINE slip intake creates a pending Payment Proof visible in the admin review queue", async () => {
  const proofs = [];
  const r2Writes = [];
  const member = {
    id: "rec-member-1",
    fields: { "Member ID": "MEM-001", Name: "Ploy Test", Status: "Active" },
  };
  const payment = {
    id: "rec-payment-1",
    fields: {
      "Payment Ref": "PAY-001",
      "Expected Amount": 1500,
      Status: "Awaiting payment",
      "Member": ["rec-member-1"],
    },
  };

  const airtableFetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const table = decodeURIComponent(url.pathname.split("/").at(-1));

    if (table === "Members" && request.method === "GET") {
      return Response.json({ records: [member] });
    }
    if (table === "Payments" && request.method === "GET") {
      return Response.json({ records: [payment] });
    }
    if (table === "MMD — Payment Proofs") {
      if (request.method === "GET") return Response.json({ records: proofs });
      if (request.method === "POST") {
        const body = await request.json();
        const record = {
          id: `rec-proof-${proofs.length + 1}`,
          createdTime: "2026-09-05T10:00:00.000Z",
          fields: body.fields,
        };
        proofs.push(record);
        return Response.json(record, { status: 201 });
      }
    }
    throw new Error(`Unexpected Airtable request: ${request.method} ${table}`);
  };

  const env = {
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    LINE_SLIP_R2: {
      async put(key, value, options) {
        r2Writes.push({ key, value, options });
      },
    },
    AIRTABLE_HTTP: { fetch: airtableFetch },
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_TOKEN: "pat-test",
  };

  const fetchImpl = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api-data.line.me/v2/bot/message/")) {
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    }
    if (url === "https://ocr.example.test/extract") {
      return Response.json({
        payment_ref: "PAY-001",
        amount_thb: 1500,
        paid_at: "2026-09-05T09:59:00.000Z",
        payer_name: "Ploy Test",
        confidence: 0.97,
      });
    }
    throw new Error(`Unexpected external request: ${url}`);
  };

  const intake = await processPaymentSlipImage({
    event: {
      source: { userId: "U-line-test" },
      message: { id: "line-message-001", type: "image" },
      timestamp: Date.parse("2026-09-05T10:00:00.000Z"),
    },
    env: {
      ...env,
      PAYMENT_SLIP_OCR_URL: "https://ocr.example.test/extract",
    },
    fetchImpl,
  });

  assert.equal(intake.ok, true);
  assert.equal(intake.status, "pending");
  assert.equal(proofs.length, 1);
  assert.equal(r2Writes.length, 1);

  const queueResponse = await handlePaymentReviewRequest(
    new Request("https://mmdbkk.com/v1/admin/payments/review-queue?limit=10"),
    env,
    { admin_actor: "ceo@example.test", authenticated: true }
  );
  const queue = await queueResponse.json();

  assert.equal(queueResponse.status, 200);
  assert.equal(queue.ok, true);
  assert.equal(queue.authority, "payments-worker");
  assert.equal(queue.guardrails.browser_can_mark_paid, false);
  assert.equal(queue.items.length, 1);
  assert.equal(queue.items[0].proof_id, intake.proof_id);
  assert.equal(queue.items[0].payment_ref, "PAY-001");
  assert.equal(queue.items[0].evidence_amount_thb, 1500);
  assert.equal(queue.items[0].reviewable, true);
});
