import assert from "node:assert/strict";
import test from "node:test";

// Read LINE_PER_AI_REPLY_COPY directly from the bundle without importing the full worker.
// Importing the worker triggers subprotocol registrations; we only need the constant value here.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(__dir, "index.js"), "utf-8");

// Extract LINE_PER_AI_REPLY_COPY value from the bundle source
const match = bundle.match(/var LINE_PER_AI_REPLY_COPY = `([\s\S]*?)`;/);
assert.ok(match, "LINE_PER_AI_REPLY_COPY not found in bundle");
const REPLY_COPY = match[1];
const STALE_SIGIL_TRUST_INME_URL = `https://sigil.mmdbkk.com/${["trust", "inme"].join("/")}`;

test("LINE_PER_AI_REPLY_COPY contains canonical renewal URL", () => {
  assert.ok(
    REPLY_COPY.includes("https://mmdbkk.com/sigil/pay/renewal"),
    `Expected canonical URL in reply copy. Got:\n${REPLY_COPY}`
  );
});

test("LINE_PER_AI_REPLY_COPY does not contain stale sigil.mmdbkk.com/trust/inme URL", () => {
  assert.ok(
    !REPLY_COPY.includes(STALE_SIGIL_TRUST_INME_URL),
    "Reply copy must not contain stale sigil.mmdbkk.com/trust/inme"
  );
});

test("LINE_PER_AI_REPLY_COPY does not contain bare /trust/inme as final CTA", () => {
  assert.ok(
    !REPLY_COPY.includes("https://sigil.mmdbkk.com"),
    "Reply copy must not reference sigil.mmdbkk.com host"
  );
});
