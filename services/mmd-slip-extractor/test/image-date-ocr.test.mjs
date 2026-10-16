import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { extractOcr } from "../lib/extractor.mjs";

test(
  "actual offline OCR reads an unlabeled amount and English short date without QR/reference",
  { timeout: 60000 },
  async () => {
    const lines = [
      "Transfer successful",
      "12 Oct 26, 9:25 AM",
      "6,000.00",
      "Fee 0.00",
    ];
    const svg = `<svg width="1200" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/>${lines.map((line, i) => `<text x="50" y="${100 + i * 110}" font-size="56" font-family="Arial" fill="black">${line}</text>`).join("")}</svg>`;
    for (const format of ["png", "jpeg", "webp"]) {
      const image = await sharp(Buffer.from(svg))[format]().toBuffer(),
        result = await extractOcr(image);
      assert.equal(result.amount_thb, 6000, format);
      assert.equal(result.paid_at, "2026-10-12T02:25:00.000Z", format);
      assert.equal(result.payment_ref, "");
    }
  },
);
