import { readTransferAmount, readTransferTime, readBankReference } from "./slip-text-fields.mjs";
import { createHash, timingSafeEqual } from "node:crypto";
import { copyFile, mkdtemp } from "node:fs/promises";
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
  account_number: "",
  account_name: "",
  account_bank: "",
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
  result.amount_thb = readTransferAmount(raw);
  result.payment_ref = readBankReference(raw);
  result.payer_name = firstMatch(raw, [/(?:จาก|ผู้โอน|ชื่อผู้โอน|sender|from)\s*[:：]?\s*([^\n]{2,80})/i]);
  result.sender_bank = firstMatch(raw, [/(?:ธนาคารผู้โอน|sender\s*bank|from\s*bank)\s*[:：]?\s*([^\n]{2,60})/i]);
  result.receiver_bank = firstMatch(raw, [/(?:ธนาคารผู้รับ|receiver\s*bank|to\s*bank)\s*[:：]?\s*([^\n]{2,60})/i]);
  result.account_number = firstMatch(raw, [
    /(?:เลข(?:ที่)?บัญชี|account\s*(?:no\.?|number)|a\/c)\s*[:：#]?\s*([0-9][0-9\s-]{7,24}[0-9])/i,
    /(?:บัญชี)\s*[:：#]?\s*([0-9][0-9\s-]{7,24}[0-9])/i,
  ]).replace(/\s+/g, "");
  result.account_name = firstMatch(raw, [
    /(?:ชื่อบัญชี|account\s*name|ชื่อผู้รับ)\s*[:：]?\s*([^\n]{2,80})/i,
  ]);
  result.account_bank = firstMatch(raw, [
    /(?:ธนาคาร|bank)\s*[:：]?\s*([^\n]{2,60})/i,
  ]);
  result.paid_at = readTransferTime(raw);
  result.provider = /พร้อมเพย์|promptpay/i.test(raw) ? "promptpay" : "bank_transfer";
  const useful = [result.payment_ref, result.amount_thb, result.paid_at, result.payer_name, result.account_number, result.account_name].filter(Boolean).length;
  result.confidence_score = useful ? clamp((Number(confidence) / 100) * Math.min(1, 0.55 + useful * 0.12)) : 0;
  return result;
}

function languageFile(language) {
  return require.resolve(`@tesseract.js-data/${language}/4.0.0/${language}.traineddata.gz`);
}

let languagePath;
async function localLanguagePath() {
  // Never overwrite a language file while another OCR worker is reading it.
  // Each process owns one fully initialized directory of bundled language data.
  languagePath ??= (async () => {
    const target = await mkdtemp(join(tmpdir(), "mmd-slip-extractor-tessdata-"));
    await Promise.all(["tha", "eng"].map((language) => copyFile(languageFile(language), join(target, `${language}.traineddata.gz`))));
    return target;
  })().catch(error => { languagePath = null; throw error; });
  return languagePath;
}

export async function extractOcr(bytes, workerFactory = createWorker) {
  const langPath = await localLanguagePath();
  const worker = await workerFactory(["tha", "eng"], 1, { langPath, cacheMethod: "none", logger: () => {} });
  try {
    const { data = {} } = await worker.recognize(bytes);
    const primary = normalizeOcrText(data.text, data.confidence);
    if (primary.amount_thb == null || primary.paid_at || typeof worker.setParameters !== "function") return primary;
    // A small, patterned slip may lose its footer date in full-page OCR. Retry
    // the lower evidence area once, retaining the original reading on failure.
    try {
      const image = sharp(bytes, { failOn: "error", limitInputPixels: 25_000_000 });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) return primary;
      const top = Math.floor(metadata.height * 2 / 3);
      const footer = await image.extract({ left: 0, top, width: metadata.width, height: metadata.height - top })
        .resize({ width: Math.min(1600, metadata.width * 3) }).grayscale().normalize().png().toBuffer();
      await worker.setParameters({ tessedit_pageseg_mode: "6" });
      const { data: retry = {} } = await worker.recognize(footer);
      const alternate = normalizeOcrText(retry.text, retry.confidence);
      // A crop can fill a missing timestamp only when its amount corroborates
      // the full image. Conflicting fields remain unresolved for review.
      if (alternate.amount_thb !== primary.amount_thb || !alternate.paid_at ||
          (primary.payment_ref && alternate.payment_ref && primary.payment_ref !== alternate.payment_ref)) return primary;
      return { ...primary, paid_at: alternate.paid_at,
        confidence_score: Math.min(primary.confidence_score, alternate.confidence_score) };
    } catch {
      return primary;
    }
  } finally {
    await worker.terminate();
  }
}

export function normalizedResponse(result) {
  return { result: { ...EMPTY_RESULT, ...(result || {}), confidence_score: clamp(result?.confidence_score) } };
}
