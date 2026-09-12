import test from "node:test";
import assert from "node:assert/strict";

import { processPaymentSlipImage } from "../immigrate-worker/netlify/functions/line-payment-slip-intake.mjs";
import { handlePaymentReviewRequest } from "./src/payment-review-runtime.js";

test("LINE slip intake creates a pending Payment Proof visible in the admin review queue", async () => {
  const proofs = [];
  const r2Writes = [];
  let paymentProofQueueQuery = null;
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
      if (request.method === "GET") {
        if (url.searchParams.get("sort[0][field]")) paymentProofQueueQuery = url;
        return Response.json({ records: proofs });
      }
      if (request.method === "POST") {
        const body = await request.json();
        const fields = body.fields || body.records?.[0]?.fields || {};
        const record = {
          id: `rec-proof-${proofs.length + 1}`,
          createdTime: "2026-09-05T10:00:00.000Z",
          fields,
        };
        proofs.push(record);
        return Response.json(body.records ? { records: [record] } : record, { status: 201 });
      }
    }
    throw new Error(`Unexpected Airtable request: ${request.method} ${table}`);
  };

  const env = {
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    CLOUDFLARE_ACCOUNT_ID: "account-test",
    LINE_SLIP_R2_ACCESS_KEY_ID: "r2-access-key",
    LINE_SLIP_R2_SECRET_ACCESS_KEY: "r2-secret-key",
    LINE_SLIP_R2_BUCKET: "line-slip-test",
    AIRTABLE_HTTP: { fetch: airtableFetch },
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_TOKEN: "pat-test",
    AIRTABLE_TABLE_PAYMENT_PROOFS: "MMD — Payment Proofs",
    AIRTABLE_TABLE_PAYMENT_PROOFS_ID: "MMD — Payment Proofs",
    AIRTABLE_TABLE_MEMBERS: "Members",
    AIRTABLE_TABLE_PAYMENTS: "Payments",
    AIRTABLE_TABLE_PAYMENTS_ID: "Payments",
    LINE_SLIP_EVIDENCE: {
      async get(key) {
        assert.match(key, /^line-ofc\/payment-proofs\/2026\/09\/line_[a-f0-9]{24}\/original\.png$/);
        return {
          body: new Uint8Array([1, 2, 3, 4]),
          httpMetadata: { contentType: "image/png" },
        };
      },
    },
  };

  const fetchImpl = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = request.url;
    if (url.startsWith("https://api.airtable.com/v0/")) {
      return airtableFetch(request);
    }
    if (url.startsWith("https://account-test.r2.cloudflarestorage.com/")) {
      r2Writes.push({ url, method: request.method, headers: request.headers });
      return new Response(null, { status: 200 });
    }
    if (url.startsWith("https://api-data.line.me/v2/bot/message/")) {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "4" },
      });
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
      LINE_SLIP_OCR_EXTRACTOR_URL: "https://ocr.example.test/extract",
    },
    fetchImpl,
  });

  assert.equal(intake.ok, true);
  assert.equal(intake.state, "pending");
  assert.equal(proofs.length, 1);
  assert.equal(r2Writes.length, 1);

  const queueResponse = await handlePaymentReviewRequest(
    new Request("https://mmdbkk.com/v1/admin/payments/review-queue?limit=10"),
    env,
    { id: "ceo@example.test", role: "owner" }
  );
  const queue = await queueResponse.json();

  assert.equal(queueResponse.status, 200);
  assert.equal(queue.ok, true);
  assert.equal(queue.authority, "payments-worker");
  assert.equal(queue.ordering, "created_at_desc");
  assert.equal(queue.guardrails.browser_can_mark_paid, false);
  assert.equal(queue.items.length, 1);
  assert.equal(queue.items[0].proof_id, intake.proofId);
  assert.equal(queue.items[0].payment_ref, "PAY-001");
  assert.equal(queue.items[0].evidence_amount_thb, 1500);
  assert.match(queue.items[0].evidence_preview_url, /^\/v1\/admin\/payments\/evidence\?proof_id=line_/);
  assert.equal(queue.items[0].match_flags.evidence_preview_present, true);
  assert.equal(queue.items[0].review_lane, "owner_review");
  assert.equal(queue.items[0].can_approve, true);
  assert.equal(queue.items[0].reviewable, true);
  assert.ok(paymentProofQueueQuery);
  assert.equal(paymentProofQueueQuery.searchParams.get("sort[0][field]"), "created_at");
  assert.equal(paymentProofQueueQuery.searchParams.get("sort[0][direction]"), "desc");
  assert.match(paymentProofQueueQuery.searchParams.get("filterByFormula") || "", /pending/);

  const evidenceResponse = await handlePaymentReviewRequest(
    new Request(`https://mmdbkk.com${queue.items[0].evidence_preview_url}`),
    env,
    { id: "ceo@example.test", role: "owner" }
  );
  assert.equal(evidenceResponse.status, 200);
  assert.equal(evidenceResponse.headers.get("content-type"), "image/png");
  assert.equal(evidenceResponse.headers.get("cache-control"), "no-store, private");
  assert.deepEqual([...new Uint8Array(await evidenceResponse.arrayBuffer())], [1, 2, 3, 4]);
});

test("queue keeps a missing amount as null and routes incomplete evidence to system enrichment", async () => {
  const record = {
    id: "rec-proof-incomplete",
    createdTime: "2026-09-12T07:29:00.000Z",
    fields: {
      proof_id: "line_f5ed385d39634d4ca24be658",
      channel: "line_ofc",
      status: "pending",
      note: JSON.stringify({
        schema: "line_payment_evidence_v2",
        r2_key: "line-ofc/payment-proofs/2026/09/line_f5ed385d39634d4ca24be658/original.jpg",
        mime_type: "image/jpeg",
        source_context: "direct_user_payment_followup",
      }),
    },
  };
  const env = {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_TABLE_PAYMENT_PROOFS: "MMD — Payment Proofs",
    AIRTABLE_HTTP: {
      fetch: async () => Response.json({ records: [record] }),
    },
  };
  const response = await handlePaymentReviewRequest(
    new Request("https://mmdbkk.com/v1/admin/payments/review-queue?limit=10"),
    env,
    { id: "per", role: "owner" }
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.items[0].evidence_amount_thb, null);
  assert.equal(payload.items[0].review_lane, "needs_enrichment");
  assert.equal(payload.items[0].can_approve, false);
  assert.deepEqual(payload.items[0].context_issues, [
    "amount_not_extracted",
    "payment_reference_missing",
    "customer_or_job_not_linked",
  ]);
});

test("queue classifies 1,999 THB as Premium renewal and stages identity instead of a dead end", async () => {
  const record = {
    id: "rec-proof-premium-renewal",
    createdTime: "2026-09-12T12:23:00.000Z",
    fields: {
      proof_id: "line_premium_1999",
      channel: "line_ofc",
      status: "pending",
      amount_thb: 1999,
      payment_ref: "016255192331DOR00930",
      payer_name: "พงศกร จ",
      note: JSON.stringify({
        schema: "line_ofc_payment_proof_v1",
        r2_key: "line-ofc/payment-proofs/2026/09/line_premium_1999/original.png",
        mime_type: "image/png",
        source_context: "direct_user_payment_followup",
      }),
    },
  };
  const env = {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_TABLE_PAYMENT_PROOFS: "MMD — Payment Proofs",
    AIRTABLE_HTTP: { fetch: async () => Response.json({ records: [record] }) },
  };
  const response = await handlePaymentReviewRequest(
    new Request("https://mmdbkk.com/v1/admin/payments/review-queue?limit=10"), env, { id: "per", role: "owner" }
  );
  const payload = await response.json();
  const item = payload.items[0];
  assert.equal(item.evidence_amount_thb, 1999);
  assert.equal(item.payment_stage, "membership");
  assert.equal(item.inferred_intent, "renewal");
  assert.equal(item.inferred_package_code, "premium");
  assert.equal(item.inferred_label, "ต่ออายุ Private Premium");
  assert.equal(item.pending_member_profile, true);
  assert.equal(item.identity_state, "pending_identity_match");
  assert.equal(item.can_approve, false);
});

test("evidence reads reject unauthenticated requests, arbitrary keys, and active content", async () => {
  let storageReads = 0;
  const record = { id: 'rec-evidence', fields: { proof_id: 'proof1', note: '{}' } };
  const env = {
    AIRTABLE_BASE_ID: 'app-test', AIRTABLE_API_KEY: 'pat-test',
    AIRTABLE_HTTP: { fetch: async () => Response.json({ records: [record] }) },
    LINE_SLIP_EVIDENCE: { get: async () => { storageReads++; return { body: '<script>bad()</script>', httpMetadata: { contentType: 'text/html' } }; } },
  };
  const request = () => new Request('https://mmdbkk.com/v1/admin/payments/evidence?proof_id=proof1');
  assert.equal((await handlePaymentReviewRequest(request(), env)).status, 401);
  record.fields.note = JSON.stringify({ r2_key: 'line-ofc/direct-user-candidates/private/latest.json' });
  assert.equal((await handlePaymentReviewRequest(request(), env, { id: 'per', role: 'admin' })).status, 404);
  assert.equal(storageReads, 0);
  record.fields.note = JSON.stringify({ r2_key: 'line-ofc/payment-proofs/2026/09/proof1/original.jpg' });
  assert.equal((await handlePaymentReviewRequest(request(), env, { id: 'per', role: 'admin' })).status, 415);
  assert.equal(storageReads, 1);
});
