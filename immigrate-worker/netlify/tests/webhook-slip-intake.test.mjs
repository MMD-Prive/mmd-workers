import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { handler } from "../functions/webhook.js";
import {
  DEFAULT_MAX_AMOUNT_THB,
  MANUAL_SLIP_ACK,
  RETRY_SLIP_ACK,
  SAFE_SLIP_ACK,
  buildProofIdentity,
  buildStagedHandoff,
  downloadLineImage,
  extractPaymentSlip,
  isImageMessage,
  looksLikePaymentSlipContext,
  loadRecentPaymentContext,
  normalizeAmountThb,
  processPaymentSlipImage,
  putPrivateR2Object,
} from "../functions/line-payment-slip-intake.mjs";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const imageEvent = (overrides = {}) => ({
  type: "message",
  webhookEventId: "webhook-event-1",
  replyToken: "reply-token-1",
  source: { type: "user", userId: LINE_USER_ID },
  message: { type: "image", id: "line-message-1" },
  ...overrides,
});

const BASE_ENV = {
  LINE_CHANNEL_SECRET: "line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "line-access-token",
  LINE_AUTO_REPLY_ENABLED: "true",
  LINE_KENJI_AI_ENABLED: "true",
  AIRTABLE_API_KEY: "airtable-key",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_SYNC_TABLE: "MMD — Console Inbox",
  AIRTABLE_TABLE_PAYMENT_PROOFS: "MMD — Payment Proofs",
  CLOUDFLARE_ACCOUNT_ID: "account-id",
  LINE_SLIP_R2_ACCESS_KEY_ID: "r2-access-key",
  LINE_SLIP_R2_SECRET_ACCESS_KEY: "r2-secret-key",
  LINE_SLIP_R2_BUCKET: "private-slip-bucket",
  LINE_SLIP_QR_EXTRACTOR_URL: "https://extractor.test/qr",
  LINE_SLIP_OCR_EXTRACTOR_URL: "https://extractor.test/ocr",
  LINE_SLIP_EXTRACTOR_TOKEN: "extractor-token",
  TELEGRAM_BOT_TOKEN: "telegram-token",
  TELEGRAM_OPS_CHAT_ID: "telegram-chat",
};

function withEnv(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function signedNetlifyEvent(body, secret = BASE_ENV.LINE_CHANNEL_SECRET, signatureOverride = "") {
  const raw = JSON.stringify(body);
  const signature = signatureOverride || crypto.createHmac("sha256", secret).update(raw).digest("base64");
  return { httpMethod: "POST", headers: { "x-line-signature": signature }, body: raw, isBase64Encoded: false };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function pipelineFetch({ qr = {}, ocr = {}, existingProof = null, duplicateRef = null, memberRecord = { id: "recMember" }, lineResponse, r2Status = 200, airtableCreateStatus = 200, telegramStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.includes("api-data.line.me")) {
      if (lineResponse) return lineResponse();
      return new Response(Buffer.from("image-bytes"), { status: 200, headers: { "content-type": "image/jpeg", "content-length": "11" } });
    }
    if (href.includes("r2.cloudflarestorage.com")) return new Response("", { status: r2Status });
    if (href === BASE_ENV.LINE_SLIP_QR_EXTRACTOR_URL) return jsonResponse(qr);
    if (href === BASE_ENV.LINE_SLIP_OCR_EXTRACTOR_URL) return jsonResponse(ocr);
    if (href.includes("api.telegram.org")) return jsonResponse({ ok: telegramStatus === 200 }, telegramStatus);
    if (href.includes("api.airtable.com")) {
      const parsed = new URL(href);
      const formula = parsed.searchParams.get("filterByFormula") || "";
      if (init.method === "POST") return jsonResponse(airtableCreateStatus === 200 ? { id: "recProofCreated", fields: JSON.parse(init.body).fields } : {}, airtableCreateStatus);
      if (formula.includes("{proof_id}=") && !formula.includes("AND(")) return jsonResponse({ records: existingProof ? [existingProof] : [] });
      if (formula.includes("{payment_ref}") && duplicateRef) return jsonResponse({ records: [duplicateRef] });
      if (formula.includes("{line_id}") && memberRecord) return jsonResponse({ records: [memberRecord] });
      return jsonResponse({ records: [] });
    }
    throw new Error(`unexpected fetch: ${href}`);
  };
  return { calls, fetchImpl };
}

test("image detector requires a supported image event and explicit recent payment context", () => {
  assert.equal(isImageMessage(imageEvent()), true);
  assert.equal(looksLikePaymentSlipContext(imageEvent(), []), false);
  assert.equal(looksLikePaymentSlipContext(imageEvent(), ["ส่งสลิปการโอนครับ"]), true);
  assert.equal(looksLikePaymentSlipContext({ type: "message", message: { type: "text", id: "x" } }, ["ส่งสลิป"]), false);
});

test("recent payment context uses a bounded valid formula and nested timestamps", async () => {
  const requests = [];
  const context = await loadRecentPaymentContext({
    env: BASE_ENV,
    lineUserId: LINE_USER_ID,
    now: new Date("2026-08-03T10:00:00Z"),
    fetchImpl: async (url) => {
      requests.push(new URL(url));
      return jsonResponse({ records: [
        { id: "older", createdTime: "2026-08-03T09:55:00Z", fields: { payload_json: JSON.stringify({ raw_text: "ส่งสลิป", received_at: "2026-08-03T09:55:00Z" }) } },
        { id: "newer", createdTime: "2026-08-03T09:59:00Z", fields: { payload_json: JSON.stringify({ raw_text: "ชำระแล้ว", received_at: "2026-08-03T09:59:00Z" }) } },
      ] });
    },
  });
  assert.deepEqual(context, ["ชำระแล้ว", "ส่งสลิป"]);
  assert.equal(requests.length, 1);
  const formula = requests[0].searchParams.get("filterByFormula");
  assert.match(formula, /\{line_user_id\}/);
  assert.match(formula, /IS_AFTER\(CREATED_TIME\(\),DATETIME_PARSE\('2026-08-03T09:45:00\.000Z'\)\)/);
  assert.doesNotMatch(formula, /\{received_at\}/);
  assert.equal(requests[0].searchParams.get("maxRecords"), "20");
});

test("recent payment context falls back to record creation time and fails safely", async () => {
  const fallback = await loadRecentPaymentContext({
    env: BASE_ENV,
    lineUserId: LINE_USER_ID,
    now: new Date("2026-08-03T10:00:00Z"),
    fetchImpl: async () => jsonResponse({ records: [{ id: "fallback", createdTime: "2026-08-03T09:58:00Z", fields: { payload_json: JSON.stringify({ raw_text: "payment proof" }) } }] }),
  });
  assert.deepEqual(fallback, ["payment proof"]);
  const failed = await loadRecentPaymentContext({ env: BASE_ENV, lineUserId: LINE_USER_ID, fetchImpl: async () => jsonResponse({}, 422) });
  assert.deepEqual(failed, []);
});

test("amount normalization accepts positive currency values and rejects unsafe inputs", () => {
  assert.equal(normalizeAmountThb(1250), 1250);
  assert.equal(normalizeAmountThb("1250.129"), 1250.13);
  for (const value of [null, "", "   ", "0", 0, -1, "not-a-number", Number.NaN, Number.POSITIVE_INFINITY, true, [], 0.001]) {
    assert.equal(normalizeAmountThb(value), null, String(value));
  }
  assert.equal(normalizeAmountThb(DEFAULT_MAX_AMOUNT_THB + 0.01), null);
  assert.equal(normalizeAmountThb(501, 500), null);
});

test("LINE image download validates MIME, body, and maximum size", async () => {
  const ok = await downloadLineImage({
    accessToken: "token",
    messageId: "message",
    fetchImpl: async () => new Response(Buffer.from("abc"), { status: 200, headers: { "content-type": "image/png", "content-length": "3" } }),
  });
  assert.equal(ok.mimeType, "image/png");
  assert.equal(ok.byteSize, 3);
  await assert.rejects(
    downloadLineImage({ accessToken: "token", messageId: "message", fetchImpl: async () => new Response("text", { status: 200, headers: { "content-type": "text/plain" } }) }),
    /mime_unsupported/,
  );
  await assert.rejects(
    downloadLineImage({ accessToken: "token", messageId: "message", maxBytes: 2, fetchImpl: async () => new Response(Buffer.from("abc"), { status: 200, headers: { "content-type": "image/png" } }) }),
    /too_large/,
  );
});

test("private R2 upload is signed and failure is fail-closed", async () => {
  const image = { body: Buffer.from("abc"), mimeType: "image/jpeg", byteSize: 3, sha256: crypto.createHash("sha256").update("abc").digest("hex") };
  let request;
  await putPrivateR2Object({
    env: BASE_ENV,
    key: "line-ofc/payment-proofs/2026/08/proof/original.jpg",
    image,
    now: new Date("2026-08-03T00:00:00Z"),
    fetchImpl: async (url, init) => { request = { url, init }; return new Response("", { status: 200 }); },
  });
  assert.match(request.url, /private-slip-bucket/);
  assert.match(request.init.headers.Authorization, /^AWS4-HMAC-SHA256/);
  assert.doesNotMatch(request.url, /r2-secret-key/);
  await assert.rejects(
    putPrivateR2Object({ env: BASE_ENV, key: "x", image, fetchImpl: async () => new Response("", { status: 500 }) }),
    /r2_put_failed_500/,
  );
});

test("extraction runs QR first and OCR only as fallback", async () => {
  const image = { body: Buffer.from("abc"), mimeType: "image/jpeg" };
  const qrCalls = [];
  const qr = await extractPaymentSlip({
    env: BASE_ENV,
    image,
    fetchImpl: async (url) => { qrCalls.push(String(url)); return jsonResponse({ payment_ref: "QR-REF", amount_thb: 500, confidence_score: 0.98 }); },
  });
  assert.equal(qr.extraction_method, "qr");
  assert.deepEqual(qrCalls, [BASE_ENV.LINE_SLIP_QR_EXTRACTOR_URL]);

  const calls = [];
  const ocr = await extractPaymentSlip({
    env: BASE_ENV,
    image,
    fetchImpl: async (url) => {
      calls.push(String(url));
      return String(url).endsWith("/qr") ? jsonResponse({}) : jsonResponse({ payment_ref: "OCR-REF", amount_thb: 600, confidence_score: 0.8 });
    },
  });
  assert.equal(ocr.extraction_method, "ocr");
  assert.deepEqual(calls, [BASE_ENV.LINE_SLIP_QR_EXTRACTOR_URL, BASE_ENV.LINE_SLIP_OCR_EXTRACTOR_URL]);

  const requestQrCalls = [];
  const requestQr = await extractPaymentSlip({
    env: BASE_ENV,
    image,
    fetchImpl: async (url) => {
      requestQrCalls.push(String(url));
      return String(url).endsWith("/qr") ? jsonResponse({ amount_thb: 500, provider: "promptpay", confidence_score: 0.55 }) : jsonResponse({ payment_ref: "OCR-SLIP-REF", amount_thb: 500, confidence_score: 0.9 });
    },
  });
  assert.equal(requestQr.payment_ref, "OCR-SLIP-REF");
  assert.deepEqual(requestQrCalls, [BASE_ENV.LINE_SLIP_QR_EXTRACTOR_URL, BASE_ENV.LINE_SLIP_OCR_EXTRACTOR_URL]);

  const invalidOnly = await extractPaymentSlip({
    env: BASE_ENV,
    image,
    fetchImpl: async () => jsonResponse({ amount_thb: "0", confidence_score: 0.99 }),
  });
  assert.equal(invalidOnly.amount_thb, null);
  assert.equal(invalidOnly.confidence_score, 0);
});

test("duplicate webhook/message returns the existing proof without downloading", async () => {
  const { calls, fetchImpl } = pipelineFetch({ existingProof: { id: "recExisting" } });
  const result = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl });
  assert.equal(result.deduped, true);
  assert.equal(result.state, "pending");
  assert.equal(result.replyText, SAFE_SLIP_ACK);
  assert.equal(calls.some((call) => call.href.includes("api-data.line.me")), false);
});

test("download and storage failures never claim durable receipt", async () => {
  const cases = [
    ["download", pipelineFetch({ lineResponse: () => new Response("", { status: 503 }) })],
    ["mime", pipelineFetch({ lineResponse: () => new Response("text", { status: 200, headers: { "content-type": "text/plain" } }) })],
    ["oversized", pipelineFetch({ lineResponse: () => new Response(Buffer.from("abc"), { status: 200, headers: { "content-type": "image/png", "content-length": "99999999" } }) })],
    ["empty", pipelineFetch({ lineResponse: () => new Response(Buffer.alloc(0), { status: 200, headers: { "content-type": "image/png" } }) })],
    ["r2", pipelineFetch({ r2Status: 500 })],
  ];
  for (const [name, pipeline] of cases) {
    const result = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl: pipeline.fetchImpl });
    assert.equal(result.ok, false, name);
    assert.equal(result.state, "retry_required", name);
    assert.equal(result.replyText, RETRY_SLIP_ACK, name);
    assert.doesNotMatch(result.replyText, /ได้รับหลักฐานการชำระเงินแล้ว/, name);
    assert.doesNotMatch(JSON.stringify(result), /"(?:status|state)":"(?:paid|verified)"/, name);
    assert.equal(pipeline.calls.some((call) => call.href.includes("api.telegram.org")), true, name);
  }
});

test("duplicate payment_ref and low confidence remain review-only", async () => {
  const { fetchImpl } = pipelineFetch({
    qr: { payment_ref: "DUPLICATE-REF", amount_thb: 999, confidence_score: 0.7 },
    duplicateRef: { id: "recDuplicate" },
  });
  const result = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl, now: new Date("2026-08-03T00:00:00Z") });
  assert.equal(result.state, "pending");
  assert.equal(result.reviewRequired, true);
  assert.equal(result.duplicatePaymentRef, true);
  assert.equal(result.replyText, MANUAL_SLIP_ACK);
  assert.doesNotMatch(result.replyText, /ตรวจสอบเรียบร้อยแล้ว/);
});

test("successful intake creates pending LINE OFC evidence with internal provider metadata and never auto-verifies", async () => {
  const { calls, fetchImpl } = pipelineFetch({ qr: { payment_ref: "PAY-12345678", amount_thb: 1200, paid_at: "2026-08-03T01:00:00+07:00", payer_name: "Test", provider: "promptpay", sender_bank: "SCB", receiver_bank: "KBANK", confidence_score: 0.99 } });
  const result = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl, now: new Date("2026-08-03T00:00:00Z") });
  assert.equal(result.ok, true);
  assert.equal(result.state, "pending");
  assert.equal(result.replyText, SAFE_SLIP_ACK);
  const create = calls.find((call) => call.href.includes("api.airtable.com") && call.init.method === "POST");
  const fields = JSON.parse(create.init.body).fields;
  const note = JSON.parse(fields.note);
  assert.equal(fields.channel, "line_ofc");
  assert.equal(fields.status, "pending");
  assert.equal(fields.payment_ref, "PAY-12345678");
  assert.equal(fields.paid_at, "2026-08-03");
  assert.equal(note.provider, "promptpay");
  assert.equal(note.sender_bank, "SCB");
  assert.equal(note.receiver_bank, "KBANK");
  assert.doesNotMatch(create.init.body, /"status":"verified"|"status":"paid"/);
  assert.equal(calls.some((call) => call.href.includes("payments-worker")), false);
});

test("first durable unlinked or incomplete evidence uses manual acknowledgement while persistence failure uses retry", async () => {
  const partial = pipelineFetch({ qr: { payment_ref: "", payer_name: "Test", confidence_score: 0.99 }, ocr: { payer_name: "Test", confidence_score: 0.99 } });
  const partialResult = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl: partial.fetchImpl });
  assert.equal(partialResult.reviewRequired, true);
  assert.equal(partialResult.replyText, MANUAL_SLIP_ACK);

  const orphan = pipelineFetch({ qr: { payment_ref: "PAY-ORPHAN", amount_thb: 100, confidence_score: 0.99 }, memberRecord: null });
  const orphanResult = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl: orphan.fetchImpl });
  assert.equal(orphanResult.reviewRequired, true);
  assert.equal(orphanResult.replyText, MANUAL_SLIP_ACK);

  const failed = pipelineFetch({ qr: { payment_ref: "PAY-FAIL", amount_thb: 100, confidence_score: 0.99 }, airtableCreateStatus: 500 });
  const result = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl: failed.fetchImpl });
  assert.equal(result.state, "retry_required");
  assert.equal(result.replyText, RETRY_SLIP_ACK);
  assert.doesNotMatch(result.replyText, /ได้รับหลักฐานการชำระเงินแล้ว/);
  assert.equal(failed.calls.some((call) => call.href.includes("api.telegram.org")), true);
});

test("R2 and Telegram failures do not create a paid or verified state", async () => {
  const r2Failure = pipelineFetch({ r2Status: 500 });
  const failed = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl: r2Failure.fetchImpl });
  assert.equal(failed.state, "retry_required");
  assert.doesNotMatch(failed.replyText, /ตรวจสอบเรียบร้อยแล้ว/);

  const telegramFailure = pipelineFetch({ qr: { payment_ref: "PAY-TELEGRAM", amount_thb: 100, confidence_score: 0.99 }, telegramStatus: 500 });
  const pending = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl: telegramFailure.fetchImpl });
  assert.equal(pending.state, "pending");
  assert.equal(pending.telegram.ok, false);
  assert.equal(pending.replyText, SAFE_SLIP_ACK);
});

test("invalid amounts are excluded from Airtable, deterministic amount matching, and remain review-required", async () => {
  for (const amount of ["", "0", 0, -50, "invalid", Number.POSITIVE_INFINITY, DEFAULT_MAX_AMOUNT_THB + 1]) {
    const pipeline = pipelineFetch({ qr: { payment_ref: "PAY-INVALID-AMOUNT", amount_thb: amount, confidence_score: 0.99 } });
    const result = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl: pipeline.fetchImpl });
    assert.equal(result.reviewRequired, true, String(amount));
    assert.equal(result.replyText, MANUAL_SLIP_ACK, String(amount));
    const create = pipeline.calls.find((call) => call.href.includes("api.airtable.com") && call.init.method === "POST");
    const fields = JSON.parse(create.init.body).fields;
    assert.equal(Object.hasOwn(fields, "amount_thb"), false, String(amount));
    const linkCalls = pipeline.calls.filter((call) => call.href.includes("api.airtable.com") && call.init.method !== "POST");
    assert.equal(linkCalls.some((call) => /\{(?:Amount|amount_thb)\}=/.test(new URL(call.href).searchParams.get("filterByFormula") || "")), false, String(amount));
    assert.doesNotMatch(create.init.body, /"status":"verified"|"status":"paid"/);
  }
});

test("staged payments handoff contract cannot mark paid or mutate benefits", () => {
  const handoff = buildStagedHandoff({ proofId: "proof", extraction: { payment_ref: "ref", amount_thb: 100 }, reviewRequired: false });
  assert.equal(handoff.state, "pending");
  assert.equal(handoff.may_mark_paid, false);
  assert.equal(handoff.may_award_points, false);
  assert.equal(handoff.may_extend_membership, false);
  assert.equal(handoff.may_confirm_session, false);
});

test("acknowledgement contract never claims paid or verified", () => {
  const paidOrVerified = /\b(?:paid|verified)\b|ชำระเงินเรียบร้อย|ยืนยันการชำระเงิน/i;
  for (const acknowledgement of [MANUAL_SLIP_ACK, SAFE_SLIP_ACK, RETRY_SLIP_ACK]) {
    assert.doesNotMatch(acknowledgement, paidOrVerified);
  }
});

test("handler preserves invalid signature rejection", async () => {
  await withEnv(BASE_ENV, async () => {
    const response = await handler(signedNetlifyEvent({ events: [] }, BASE_ENV.LINE_CHANNEL_SECRET, "invalid"));
    assert.equal(response.statusCode, 401);
  });
});

test("valid signed handler event performs the narrow image-slip intake and safe reply", async () => {
  await withEnv(BASE_ENV, async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      const href = String(url);
      calls.push({ href, init });
      if (href.includes("/profile/")) return jsonResponse({ displayName: "Test Client" });
      if (href.includes("api-data.line.me")) return new Response(Buffer.from("image-bytes"), { status: 200, headers: { "content-type": "image/jpeg" } });
      if (href.includes("r2.cloudflarestorage.com")) return new Response("", { status: 200 });
      if (href === BASE_ENV.LINE_SLIP_QR_EXTRACTOR_URL) return jsonResponse({ payment_ref: "PAY-HANDLER", amount_thb: 500, provider: "promptpay", confidence_score: 0.99 });
      if (href.includes("api.telegram.org")) return jsonResponse({ ok: true });
      if (href.includes("api.line.me/v2/bot/message/reply")) return jsonResponse({ ok: true });
      if (href.includes("api.airtable.com")) {
        const parsed = new URL(href);
        const formula = parsed.searchParams.get("filterByFormula") || "";
        if (init.method === "POST") {
          return href.includes(encodeURIComponent("MMD — Payment Proofs"))
            ? jsonResponse({ id: "recProof" })
            : jsonResponse({ id: "recConsole" });
        }
        if (formula.includes("{line_user_id}")) {
          const receivedAt = new Date().toISOString();
          return jsonResponse({ records: [{ id: "recContext", createdTime: receivedAt, fields: { payload_json: JSON.stringify({ raw_text: "ส่งสลิปการโอนครับ", received_at: receivedAt }) } }] });
        }
        if (href.includes("/Members?") && formula.includes("{line_id}")) return jsonResponse({ records: [{ id: "recMember" }] });
        return jsonResponse({ records: [] });
      }
      throw new Error(`unexpected fetch: ${href}`);
    };
    try {
      const response = await handler(signedNetlifyEvent({ events: [imageEvent()] }));
      assert.equal(response.statusCode, 200);
      const payload = JSON.parse(response.body);
      assert.equal(payload.saved[0].payment_slip_intake.ok, true);
      assert.equal(payload.saved[0].payment_slip_intake.state, "pending");
      assert.equal(payload.saved[0].replied, true);
      assert.equal(calls.filter((call) => call.href.includes("api-data.line.me")).length, 1);
      assert.equal(calls.filter((call) => call.href.includes("r2.cloudflarestorage.com")).length, 1);
      assert.equal(calls.some((call) => call.href.includes("payments-worker")), false);
      const replyCall = calls.find((call) => call.href.includes("/message/reply"));
      assert.equal(JSON.parse(replyCall.init.body).messages[0].text, SAFE_SLIP_ACK);
      const proofCreateIndex = calls.findIndex((call) => call.href.includes(encodeURIComponent("MMD — Payment Proofs")) && call.init.method === "POST");
      const replyIndex = calls.findIndex((call) => call.href.includes("/message/reply"));
      assert.ok(proofCreateIndex >= 0 && proofCreateIndex < replyIndex);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("LINE reply failure is redacted and returns a retryable webhook error", async () => {
  await withEnv(BASE_ENV, async () => {
    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    const logs = [];
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      const href = String(url);
      calls.push({ href, init });
      if (href.includes("/profile/")) return jsonResponse({ displayName: "Test Client" });
      if (href.includes("api-data.line.me")) return new Response(Buffer.from("image-bytes"), { status: 200, headers: { "content-type": "image/jpeg" } });
      if (href.includes("r2.cloudflarestorage.com")) return new Response("", { status: 200 });
      if (href === BASE_ENV.LINE_SLIP_QR_EXTRACTOR_URL) return jsonResponse({ payment_ref: "PAY-REPLY-FAIL", amount_thb: 500, confidence_score: 0.99 });
      if (href.includes("api.telegram.org")) return jsonResponse({ ok: true });
      if (href.includes("api.line.me/v2/bot/message/reply")) return jsonResponse({}, 500);
      if (href.includes("api.airtable.com")) {
        const formula = new URL(href).searchParams.get("filterByFormula") || "";
        if (init.method === "POST") return href.includes(encodeURIComponent("MMD — Payment Proofs")) ? jsonResponse({ id: "recProof" }) : jsonResponse({ id: "recConsole" });
        if (formula.includes("CREATED_TIME()")) return jsonResponse({ records: [{ id: "recContext", createdTime: new Date().toISOString(), fields: { payload_json: JSON.stringify({ raw_text: "ส่งสลิป", received_at: new Date().toISOString() }) } }] });
        if (href.includes("/Members?") && formula.includes("{line_id}")) return jsonResponse({ records: [{ id: "recMember" }] });
        return jsonResponse({ records: [] });
      }
      throw new Error(`unexpected fetch: ${href}`);
    };
    console.error = (value) => logs.push(String(value));
    try {
      const response = await handler(signedNetlifyEvent({ events: [imageEvent()] }));
      assert.equal(response.statusCode, 502);
      assert.deepEqual(JSON.parse(response.body), { ok: false, error: "line_payment_slip_reply_failed", processed: 0 });
      assert.equal(logs.length, 1);
      assert.match(logs[0], /line_payment_slip_reply_failed/);
      assert.doesNotMatch(logs[0], /telegram-token|r2-secret-key|PAY-REPLY-FAIL|line-message-1/);
      assert.equal(calls.some((call) => call.href.includes("api.line.me/v2/bot/message/reply")), true);
      const proofCreateIndex = calls.findIndex((call) => call.href.includes(encodeURIComponent("MMD — Payment Proofs")) && call.init.method === "POST");
      const replyIndex = calls.findIndex((call) => call.href.includes("api.line.me/v2/bot/message/reply"));
      assert.ok(proofCreateIndex >= 0 && proofCreateIndex < replyIndex);
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalError;
    }
  });
});

test("LINE redelivery can acknowledge an idempotently existing durable proof", async () => {
  await withEnv(BASE_ENV, async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      const href = String(url);
      calls.push({ href, init });
      if (href.includes("/profile/")) return jsonResponse({ displayName: "Test Client" });
      if (href.includes("api.line.me/v2/bot/message/reply")) return jsonResponse({ ok: true });
      if (href.includes("api.airtable.com")) {
        const formula = new URL(href).searchParams.get("filterByFormula") || "";
        if (formula.includes("CREATED_TIME()")) {
          const receivedAt = new Date().toISOString();
          return jsonResponse({ records: [{ id: "recContext", createdTime: receivedAt, fields: { payload_json: JSON.stringify({ raw_text: "ส่งสลิป", received_at: receivedAt }) } }] });
        }
        if (formula.includes("{proof_id}=")) return jsonResponse({ records: [{ id: "recExistingProof" }] });
        if (formula.includes("{inbox_id}")) return jsonResponse({ records: [{ id: "recExistingInbox" }] });
        return jsonResponse({ records: [] });
      }
      throw new Error(`unexpected fetch: ${href}`);
    };
    try {
      const event = imageEvent({ deliveryContext: { isRedelivery: true } });
      const response = await handler(signedNetlifyEvent({ events: [event] }));
      assert.equal(response.statusCode, 200);
      const payload = JSON.parse(response.body);
      assert.equal(payload.saved[0].payment_slip_intake.deduped, true);
      assert.equal(payload.saved[0].replied, true);
      assert.equal(calls.some((call) => call.href.includes("api-data.line.me")), false);
      const replyCall = calls.find((call) => call.href.includes("/message/reply"));
      assert.equal(JSON.parse(replyCall.init.body).messages[0].text, SAFE_SLIP_ACK);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("handler preserves non-slip image fallback and performs no slip download", async () => {
  await withEnv(BASE_ENV, async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      const href = String(url);
      calls.push(href);
      if (href.includes("api.airtable.com") && init.method === "POST") return jsonResponse({ id: "recConsole" });
      if (href.includes("api.airtable.com")) return jsonResponse({ records: [] });
      if (href.includes("api.line.me/v2/bot/message/reply")) return jsonResponse({ ok: true });
      return jsonResponse({ ok: true });
    };
    try {
      const response = await handler(signedNetlifyEvent({ events: [imageEvent()] }));
      assert.equal(response.statusCode, 200);
      const payload = JSON.parse(response.body);
      assert.equal(payload.saved[0].payment_slip_intake, null);
      assert.equal(calls.some((url) => url.includes("api-data.line.me")), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
