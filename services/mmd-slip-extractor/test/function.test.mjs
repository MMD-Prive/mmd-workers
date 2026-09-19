import assert from "node:assert/strict";
import test from "node:test";

import QRCode from "qrcode";
import sharp from "sharp";

const TOKEN = "test-extractor-token";
globalThis.Netlify = { env: { get: (name) => name === "MMD_SLIP_EXTRACTOR_TOKEN" ? TOKEN : name === "MMD_SLIP_EXTRACTOR_MAX_BYTES" ? "4194304" : "" } };
const { default: handler, config } = await import("../netlify/functions/extract.mjs");

const EMV = "00020101021229370016A0000006770101110113006681234567853037645406100.005802TH6304ABCD";
const request = (path, body, token = TOKEN, mime = "image/png") => new Request(`https://extractor.test${path}`, {
  method: "POST",
  headers: { "content-type": mime, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body,
});

test("health endpoint is public, minimal, and includes an audit request ID", async () => {
  const response = await handler(new Request("https://extractor.test/health"));
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("x-request-id"));
  assert.deepEqual(await response.json(), { ok: true, service: "mmd-slip-extractor" });
});

test("extraction endpoints reject missing and invalid bearer tokens", async () => {
  assert.equal((await handler(request("/v1/extract/qr", Buffer.from("x"), ""))).status, 401);
  assert.equal((await handler(request("/v1/extract/qr", Buffer.from("x"), "wrong"))).status, 401);
});

test("QR endpoint decodes a synthetic image under the normalized contract", async () => {
  const png = await QRCode.toBuffer(EMV, { width: 500 });
  const response = await handler(request("/v1/extract/qr", png));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.provider, "promptpay");
  assert.equal(payload.result.amount_thb, 100);
  assert.equal(Object.hasOwn(payload.result, "paid"), false);
  assert.equal(Object.hasOwn(payload.result, "verified"), false);
});

test("OCR endpoint processes a synthetic English/Thai-compatible slip without persistence", { timeout: 60_000 }, async () => {
  const svg = Buffer.from(`<svg width="1200" height="500" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="40" y="130" font-size="54" font-family="Arial" fill="black">Amount: THB 500.00</text><text x="40" y="230" font-size="54" font-family="Arial" fill="black">Transaction ID: OCR-123456</text><text x="40" y="330" font-size="54" font-family="Arial" fill="black">PromptPay</text></svg>`);
  const png = await sharp(svg).png().toBuffer();
  const response = await handler(request("/v1/extract/ocr", png));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.amount_thb, 500);
  assert.match(payload.result.payment_ref, /OCR-123456/i);
  assert.equal(payload.result.provider, "promptpay");
  assert.equal(JSON.stringify(payload).includes(svg.toString("base64")), false);
});

test("function rejects unsupported MIME and oversized bodies with redacted errors", async () => {
  const unsupported = await handler(request("/v1/extract/qr", Buffer.from("text"), TOKEN, "text/plain"));
  assert.equal(unsupported.status, 415);
  assert.deepEqual(await unsupported.json(), { error: "unsupported_mime" });
  const oversized = await handler(request("/v1/extract/qr", Buffer.alloc(4 * 1024 * 1024 + 1), TOKEN));
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: "image_too_large" });
});

test("function routes are rate limited and do not expose identity or persistence fields", () => {
  assert.deepEqual(config.path, ["/health", "/v1/extract/qr", "/v1/extract/ocr"]);
  assert.equal(config.rateLimit.windowLimit, 30);
  assert.equal(config.rateLimit.windowSize, 60);
  assert.equal(JSON.stringify(config).includes("identity"), false);
});
