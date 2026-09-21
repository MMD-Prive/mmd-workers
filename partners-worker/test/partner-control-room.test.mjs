import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/public-index.ts", import.meta.url), "utf8");
const uiSource = await readFile(new URL("../src/partner-control-room.ts", import.meta.url), "utf8");

test("Partner Control Room exposes the complete authenticated mutation surface", () => {
  for (const route of [
    "/v1/partner/dashboard",
    "/v1/partner/models/change",
    "/v1/partner/models/upload",
    "/v1/partner/jobs/action",
    "/v1/partner/sales/proposal",
    "/v1/partner/private-vault",
    "/v1/partner/telegram/connect"
  ]) assert.match(indexSource, new RegExp(route.replaceAll("/", "\\/")));
});

test("shared model mutations require explicit consent and remain review-gated", () => {
  assert.match(indexSource, /body\.value\.share_with_mmd !== true/);
  assert.match(indexSource, /canonical_model_mutated: false/);
  assert.match(indexSource, /requires_per_approval: true/);
  assert.match(indexSource, /partner_model_scope_forbidden/);
});

test("Partner Private Vault stores ciphertext only and never receives the PIN", () => {
  assert.match(indexSource, /plaintext_received: false/);
  assert.match(indexSource, /partner_private_ciphertext/);
  assert.match(uiSource, /crypto\.subtle\.encrypt/);
  assert.match(uiSource, /crypto\.subtle\.decrypt/);
  assert.match(uiSource, /PBKDF2/);
  assert.doesNotMatch(indexSource, /vault_pin|vaultPin|passphrase/i);
});

test("dashboard copy states the Partner privacy boundary", () => {
  assert.match(pageSource, /MMD ไม่มีสิทธิ์อ่าน/);
  assert.match(pageSource, /Share with MMD/);
  assert.match(pageSource, /Private Vault/);
  assert.match(pageSource, /meta name=\\"referrer\\" content=\\"no-referrer\\"/);
});

test("Control Room includes jobs, models, earnings, Telegram and mobile layout", () => {
  for (const marker of ["Home & Jobs", "Models", "Earnings", "Connect Telegram", "Add model", "data-private-travel"]) {
    assert.match(pageSource + uiSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(uiSource, /@media\(max-width:860px\)/);
  assert.match(uiSource, /@media\(max-width:520px\)/);
});
