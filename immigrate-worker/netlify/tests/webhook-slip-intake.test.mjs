import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { handler } from "../functions/webhook.js";
import {
  SAFE_SLIP_ACK,
  buildProofIdentity,
  buildStagedHandoff,
  downloadLineImage,
  extractPaymentSlip,
  isImageMessage,
  looksLikePaymentSlipContext,
  loadRecentPaymentContext,
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

function pipelineFetch({ qr = {}, ocr = {}, existingProof = null, duplicateRef = null, r2Status = 200, telegramStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.includes("api-data.line.me")) {
      return new Response(Buffer.from("image-bytes"), { status: 200, headers: { "content-type": "image/jpeg", "content-length": "11" } });
    }
    if (href.includes("r2.cloudflarestorage.com")) return new Response("", { status: r2Status });
    if (href === BASE_ENV.LINE_SLIP_QR_EXTRACTOR_URL) return jsonResponse(qr);
    if (href === BASE_ENV.LINE_SLIP_OCR_EXTRACTOR_URL) return jsonResponse(ocr);
    if (href.includes("api.telegram.org")) return jsonResponse({ ok: telegramStatus === 200 }, telegramStatus);
    if (href.includes("api.airtable.com")) {
      const parsed = new URL(href);
      const formula = parsed.searchParams.get("filterByFormula") || "";
      if (init.method === "POST") return jsonResponse({ id: "recProofCreated", fields: JSON.parse(init.body).fields });
      if (formula.includes("{proof_id}=") && !formula.includes("AND(")) return jsonResponse({ records: existingProof ? [existingProof] : [] });
      if (formula.includes("{payment_ref}") && duplicateRef) return jsonResponse({ records: [duplicateRef] });
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

test("recent payment context is time-bounded and sorted newest-first", async () => {
  let requested;
  await loadRecentPaymentContext({
    env: BASE_ENV,
    lineUserId: LINE_USER_ID,
    now: new Date("2026-08-03T10:00:00Z"),
    fetchImpl: async (url) => { requested = new URL(url); return jsonResponse({ records: [] }); },
  });
  assert.match(requested.searchParams.get("filterByFormula"), /IS_AFTER\(\{received_at\}/);
  assert.match(requested.searchParams.get("filterByFormula"), /2026-08-03T09:45:00\.000Z/);
  assert.equal(requested.searchParams.get("sort[0][field]"), "received_at");
  assert.equal(requested.searchParams.get("sort[0][direction]"), "desc");
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
});

test("duplicate webhook/message returns the existing proof without downloading", async () => {
  const { calls, fetchImpl } = pipelineFetch({ existingProof: { id: "recExisting" } });
  const result = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl });
  assert.equal(result.deduped, true);
  assert.equal(result.state, "pending");
  assert.equal(calls.some((call) => call.href.includes("api-data.line.me")), false);
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

test("partial extraction and post-storage persistence failure remain review-only and alert Ops", async () => {
  const partial = pipelineFetch({ qr: { payment_ref: "", payer_name: "Test", confidence_score: 0.99 }, ocr: { payer_name: "Test", confidence_score: 0.99 } });
  const partialResult = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl: partial.fetchImpl });
  assert.equal(partialResult.reviewRequired, true);

  const failed = pipelineFetch({ qr: { payment_ref: "PAY-FAIL", amount_thb: 100, confidence_score: 0.99 } });
  const originalFetch = failed.fetchImpl;
  const result = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl: async (url, init = {}) => {
    if (String(url).includes("api.airtable.com") && init.method === "POST") return jsonResponse({}, 500);
    return originalFetch(url, init);
  }});
  assert.equal(result.state, "manual_review");
  assert.equal(failed.calls.some((call) => call.href.includes("api.telegram.org")), true);
});

test("R2 and Telegram failures do not create a paid or verified state", async () => {
  const r2Failure = pipelineFetch({ r2Status: 500 });
  const failed = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl: r2Failure.fetchImpl });
  assert.equal(failed.state, "manual_review");
  assert.doesNotMatch(failed.replyText, /ตรวจสอบเรียบร้อยแล้ว/);

  const telegramFailure = pipelineFetch({ qr: { payment_ref: "PAY-TELEGRAM", amount_thb: 100, confidence_score: 0.99 }, telegramStatus: 500 });
  const pending = await processPaymentSlipImage({ env: BASE_ENV, event: imageEvent(), fetchImpl: telegramFailure.fetchImpl });
  assert.equal(pending.state, "pending");
  assert.equal(pending.telegram.ok, false);
});

test("staged payments handoff contract cannot mark paid or mutate benefits", () => {
  const handoff = buildStagedHandoff({ proofId: "proof", extraction: { payment_ref: "ref", amount_thb: 100 }, reviewRequired: false });
  assert.equal(handoff.state, "pending");
  assert.equal(handoff.may_mark_paid, false);
  assert.equal(handoff.may_award_points, false);
  assert.equal(handoff.may_extend_membership, false);
  assert.equal(handoff.may_confirm_session, false);
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
          return jsonResponse({ records: [{ id: "recContext", fields: { payload_json: JSON.stringify({ raw_text: "ส่งสลิปการโอนครับ" }) } }] });
        }
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
