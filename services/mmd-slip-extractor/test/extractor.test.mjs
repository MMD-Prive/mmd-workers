import assert from "node:assert/strict";
import test from "node:test";

import QRCode from "qrcode";

import { extractOcr, extractQr, normalizeOcrText, normalizedResponse, parsePromptPayPayload, readImageRequest, safeBearerMatch } from "../lib/extractor.mjs";

const EMV = "00020101021229370016A0000006770101110113006681234567853037645406100.005802TH6304ABCD";

test("bearer authentication accepts only the configured token", () => {
  assert.equal(safeBearerMatch("Bearer correct-token", "correct-token"), true);
  assert.equal(safeBearerMatch("", "correct-token"), false);
  assert.equal(safeBearerMatch("Bearer wrong-token", "correct-token"), false);
});

test("request validation accepts supported images and rejects invalid input", async () => {
  const request = new Request("https://extractor.test/v1/extract/qr", { method: "POST", headers: { "content-type": "image/png" }, body: Buffer.from("png") });
  assert.equal((await readImageRequest(request, 10)).bytes.length, 3);
  await assert.rejects(readImageRequest(new Request("https://extractor.test", { method: "POST", headers: { "content-type": "text/plain" }, body: "x" })), /unsupported_mime/);
  await assert.rejects(readImageRequest(new Request("https://extractor.test", { method: "POST", headers: { "content-type": "image/jpeg" }, body: "too-large" }), 2), /image_too_large/);
});

test("PromptPay EMV parsing remains extraction-only", () => {
  const result = parsePromptPayPayload(EMV);
  assert.equal(result.provider, "promptpay");
  assert.equal(result.payment_ref, "0066812345678");
  assert.equal(result.amount_thb, 100);
  assert.equal(Object.hasOwn(result, "paid"), false);
  assert.equal(Object.hasOwn(result, "verified"), false);
});

test("QR decoder extracts a synthetic PromptPay payload and returns empty when missing", async () => {
  const png = await QRCode.toBuffer(EMV, { errorCorrectionLevel: "M", margin: 4, width: 500 });
  const result = await extractQr(png);
  assert.equal(result.provider, "promptpay");
  assert.equal(result.payment_ref, "0066812345678");
  const blank = await import("sharp").then(({ default: sharp }) => sharp({ create: { width: 200, height: 200, channels: 4, background: "white" } }).png().toBuffer());
  assert.deepEqual(await extractQr(blank), normalizedResponse().result);
});

test("OCR normalization handles Thai and English slip labels", () => {
  const result = normalizeOcrText("พร้อมเพย์\nจำนวนเงิน: THB 1,250.50\nเลขที่รายการ: TEST-REF-123456\nผู้โอน: SOMCHAI\nธนาคารผู้โอน: SCB\nธนาคารผู้รับ: KBANK", 92);
  assert.equal(result.amount_thb, 1250.5);
  assert.equal(result.payment_ref, "TEST-REF-123456");
  assert.equal(result.provider, "promptpay");
  assert.ok(result.confidence_score > 0.7);
});

test("OCR adapter is replaceable, terminates its worker, and returns normalized evidence only", async () => {
  let terminated = false;
  const factory = async () => ({ recognize: async () => ({ data: { text: "Amount: 500\nTransaction ID: OCR-123456", confidence: 90 } }), terminate: async () => { terminated = true; } });
  const result = await extractOcr(Buffer.from("synthetic"), factory);
  assert.equal(result.amount_thb, 500);
  assert.equal(result.payment_ref, "OCR-123456");
  assert.equal(terminated, true);
  assert.equal(JSON.stringify(normalizedResponse(result)).includes("synthetic"), false);
});

test("normalized contract contains no payment decision fields", () => {
  const response = normalizedResponse({ payment_ref: "R", confidence_score: 2 });
  assert.deepEqual(Object.keys(response.result), ["payment_ref", "amount_thb", "paid_at", "payer_name", "sender_bank", "receiver_bank", "provider", "confidence_score"]);
  assert.equal(response.result.confidence_score, 1);
  assert.equal(Object.hasOwn(response.result, "status"), false);
});
