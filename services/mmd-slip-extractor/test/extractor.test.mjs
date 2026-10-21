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
  assert.equal(result.payment_ref, "");
  assert.equal(result.amount_thb, 100);
  assert.equal(Object.hasOwn(result, "paid"), false);
  assert.equal(Object.hasOwn(result, "verified"), false);
});

test("QR decoder does not treat a PromptPay recipient proxy as a transaction reference", async () => {
  const png = await QRCode.toBuffer(EMV, { errorCorrectionLevel: "M", margin: 4, width: 500 });
  const result = await extractQr(png);
  assert.equal(result.provider, "promptpay");
  assert.equal(result.payment_ref, "");
  assert.equal(result.amount_thb, 100);
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
  assert.deepEqual(Object.keys(response.result), ["payment_ref", "amount_thb", "paid_at", "payer_name", "sender_bank", "receiver_bank", "provider", "account_number", "account_name", "account_bank", "confidence_score"]);
  assert.equal(response.result.confidence_score, 1);
  assert.equal(Object.hasOwn(response.result, "status"), false);
  assert.equal(Object.hasOwn(response.result, "paid"), false);
  assert.equal(Object.hasOwn(response.result, "verified"), false);
  assert.equal(Object.hasOwn(response.result, "decision"), false);
});


test("account detail OCR extracts bank, name, and account number", () => {
  const result = normalizeOcrText(`
ธนาคาร กสิกรไทย
ชื่อบัญชี นาย ทดสอบ ระบบ
เลขที่บัญชี 123-4-56789-0
`, 94);
  assert.equal(result.account_bank, "กสิกรไทย");
  assert.equal(result.account_name, "นาย ทดสอบ ระบบ");
  assert.equal(result.account_number, "123-4-56789-0");
  assert.equal(result.amount_thb, null);
  assert.equal(result.payment_ref, "");
});

// Synthetic images exercise the bounded footer retry without storing private slips.
for (const [name, retryText, expectedTime] of [
  ["matching amount fills missing time", "จำนวนเงิน 5000 บาท\n03 ต . ค . 2569 - 21:19", "2026-10-03T14:19:00.000Z"],
  ["different amount never supplies time", "จำนวนเงิน 6000 บาท\n03 ต.ค. 2569 - 21:19", ""],
  ["unknown month is never guessed", "จำนวนเงิน 5000 บาท\n03 ๓. ค . 2569 - 21:19", ""],
  ["conflicting reference never supplies time", "จำนวนเงิน 5000 บาท\n03 ต.ค. 2569 - 21:19\nReference no: OTHER-123456", ""],
]) test(`footer OCR retry: ${name}`, async () => {
  const { default: sharp } = await import("sharp");
  const image = await sharp({ create: { width: 450, height: 600, channels: 3, background: "white" } }).png().toBuffer();
  let calls = 0, terminated = false, parameters;
  const result = await extractOcr(image, async () => ({
    recognize: async () => ({ data: { text: ++calls === 1 ? "จํา น ว น เง ิ น 5,000.00 บ า ท\nReference no: FIRST-123456" : retryText, confidence: 90 } }),
    setParameters: async value => { parameters = value; },
    terminate: async () => { terminated = true; },
  }));
  assert.equal(calls, 2);
  assert.deepEqual(parameters, { tessedit_pageseg_mode: "6" });
  assert.equal(terminated, true);
  assert.equal(result.amount_thb, 5000);
  assert.equal(result.paid_at, expectedTime);
  assert.equal(result.payment_ref, "FIRST-123456");
});
test("failed footer OCR retains the primary evidence and terminates", async () => {
  const { default: sharp } = await import("sharp");
  const image = await sharp({ create: { width: 100, height: 150, channels: 3, background: "white" } }).png().toBuffer();
  let calls = 0, terminated = false;
  const result = await extractOcr(image, async () => ({
    recognize: async () => { if (++calls > 1) throw Error("retry unavailable"); return { data: { text: "Amount: 5000", confidence: 90 } }; },
    setParameters: async () => {}, terminate: async () => { terminated = true; },
  }));
  assert.equal(result.amount_thb, 5000);
  assert.equal(result.paid_at, "");
  assert.equal(terminated, true);
});
