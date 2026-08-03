import { createHash, timingSafeEqual } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";

import jsQR from "jsqr";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

const require = createRequire(import.meta.url);
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const EMPTY_RESULT = Object.freeze({
  payment_ref: "",
  amount_thb: null,
  paid_at: "",
  payer_name: "",
  sender_bank: "",
  receiver_bank: "",
  provider: "",
  confidence_score: 0,
});

const clean = (value) => String(value ?? "").trim();
const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function emptyResult() {
  return { ...EMPTY_RESULT };
}

export function safeBearerMatch(header, expected) {
  const supplied = clean(header).replace(/^Bearer\s+/i, "");
  const wanted = clean(expected);
  if (!supplied || !wanted) return false;
  const left = Buffer.from(createHash("sha256").update(supplied).digest());
  const right = Buffer.from(createHash("sha256").update(wanted).digest());
  return timingSafeEqual(left, right);
}

export async function readImageRequest(request, maxBytes = DEFAULT_MAX_BYTES) {
  const mimeType = clean(request.headers.get("content-type")).split(";", 1)[0].toLowerCase();
  if (!MIME_TYPES.has(mimeType)) throw Object.assign(new Error("unsupported_mime"), { status: 415 });
  const limit = Math.min(Math.max(Number(maxBytes) || DEFAULT_MAX_BYTES, 1), DEFAULT_MAX_BYTES);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw Object.assign(new Error("image_too_large"), { status: 413 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length) throw Object.assign(new Error("image_empty"), { status: 400 });
  if (bytes.length > limit) throw Object.assign(new Error("image_too_large"), { status: 413 });
  return { bytes, mimeType };
}

function parseTlv(payload) {
  const fields = [];
  for (let offset = 0; offset + 4 <= payload.length;) {
    const tag = payload.slice(offset, offset + 2);
    const size = Number(payload.slice(offset + 2, offset + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(size) || size < 0 || offset + 4 + size > payload.length) break;
    fields.push({ tag, value: payload.slice(offset + 4, offset + 4 + size) });
    offset += 4 + size;
  }
  return fields;
}

export function parsePromptPayPayload(payload) {
  const raw = clean(payload);
  const result = emptyResult();
  if (!/^000201/.test(raw)) return result;
  const top = parseTlv(raw);
  const get = (tag) => top.find((item) => item.tag === tag)?.value || "";
  const merchant = top.find((item) => Number(item.tag) >= 26 && Number(item.tag) <= 51);
  const merchantFields = merchant ? parseTlv(merchant.value) : [];
  const aid = merchantFields.find((item) => item.tag === "00")?.value || "";
  const amount = Number(get("54"));
  result.amount_thb = Number.isFinite(amount) && amount > 0 ? amount : null;
  result.provider = aid.includes("A000000677010111") ? "promptpay" : "emv_qr";
  result.confidence_score = result.amount_thb != null ? 0.55 : 0;
  return result;
}

export async function extractQr(bytes) {
  const decoded = await sharp(bytes, { failOn: "error", limitInputPixels: 25_000_000 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const code = jsQR(new Uint8ClampedArray(decoded.data), decoded.info.width, decoded.info.height, { inversionAttempts: "attemptBoth" });
  if (!code?.data) return emptyResult();
  const parsed = parsePromptPayPayload(code.data);
  if (!parsed.payment_ref && parsed.amount_thb == null) {
    parsed.provider = "qr";
    parsed.confidence_score = 0;
  }
  return parsed;
}

function firstMatch(text, expressions) {
  for (const expression of expressions) {
    const match = text.match(expression);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
}

export function normalizeOcrText(text, confidence = 0) {
  const raw = clean(text).replace(/\r/g, "");
  const result = emptyResult();
  result.amount_thb = (() => {
    const value = firstMatch(raw, [/(?:จำนวนเงิน|ยอดเงิน|amount)\s*[:：]?\s*(?:THB|฿)?\s*([\d,]+(?:\.\d{1,2})?)/i, /(?:THB|฿)\s*([\d,]+(?:\.\d{1,2})?)/i]);
    const amount = Number(value.replace(/,/g, ""));
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  })();
  result.payment_ref = firstMatch(raw, [/(?:เลขที่รายการ|รหัสรายการ|transaction\s*(?:id|ref(?:erence)?)|reference)\s*[:：#]?\s*([A-Z0-9-]{6,64})/i]);
  result.payer_name = firstMatch(raw, [/(?:จาก|ผู้โอน|ชื่อผู้โอน|sender|from)\s*[:：]?\s*([^\n]{2,80})/i]);
  result.sender_bank = firstMatch(raw, [/(?:ธนาคารผู้โอน|sender\s*bank|from\s*bank)\s*[:：]?\s*([^\n]{2,60})/i]);
  result.receiver_bank = firstMatch(raw, [/(?:ธนาคารผู้รับ|receiver\s*bank|to\s*bank)\s*[:：]?\s*([^\n]{2,60})/i]);
  result.paid_at = firstMatch(raw, [/(20\d{2}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}:\d{2}(?::\d{2})?)/]);
  result.provider = /พร้อมเพย์|promptpay/i.test(raw) ? "promptpay" : "bank_transfer";
  const useful = [result.payment_ref, result.amount_thb, result.paid_at, result.payer_name].filter(Boolean).length;
  result.confidence_score = useful ? clamp((Number(confidence) / 100) * Math.min(1, 0.55 + useful * 0.12)) : 0;
  return result;
}

function languageFile(language) {
  return require.resolve(`@tesseract.js-data/${language}/4.0.0/${language}.traineddata.gz`);
}

async function localLanguagePath() {
  const target = join(tmpdir(), "mmd-slip-extractor-tessdata");
  await mkdir(target, { recursive: true });
  await Promise.all(["tha", "eng"].map((language) => copyFile(languageFile(language), join(target, `${language}.traineddata.gz`))));
  return target;
}

export async function extractOcr(bytes, workerFactory = createWorker) {
  const langPath = await localLanguagePath();
  const worker = await workerFactory(["tha", "eng"], 1, { langPath, cacheMethod: "none", logger: () => {} });
  try {
    const { data = {} } = await worker.recognize(bytes);
    return normalizeOcrText(data.text, data.confidence);
  } finally {
    await worker.terminate();
  }
}

export function normalizedResponse(result) {
  return { result: { ...EMPTY_RESULT, ...(result || {}), confidence_score: clamp(result?.confidence_score) } };
}
