import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/public-index.ts", import.meta.url), "utf8");
const uiSource = await readFile(new URL("../src/partner-control-room.ts", import.meta.url), "utf8");
const wranglerSource = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
const deployWorkflowSource = await readFile(new URL("../../.github/workflows/deploy-partners-worker.yml", import.meta.url), "utf8");

test("Partner Control Room exposes the complete authenticated mutation surface", () => {
  for (const route of [
    "/v1/partner/dashboard",
    "/v1/partner/models/change",
    "/v1/partner/working-system",
    "/v1/partner/models/upload",
    "/v1/partner/jobs/action",
    "/v1/partner/sales/proposal",
    "/v1/partner/private-vault",
    "/v1/partner/telegram/connect"
  ]) assert.match(indexSource, new RegExp(route.replaceAll("/", "\\/")));
});

test("working systems are per-model, versioned and remain server-authoritative", () => {
  for (const marker of [
    '"bridge", "co_partner", "profit_share"',
    "Bridge commission must be between 5% and 10%",
    "Co-Partner source rate must be a valid THB amount",
    "Partner share must be greater than 0% and less than 100%",
    'canonical_agreement_mutated: false',
    'ledger_mutated: false',
    'basis_rule: "payment_truth_net_basis"'
  ]) assert.match(indexSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Boss Per approval activates canonical agreements and supersedes old versions", () => {
  for (const marker of [
    "/v1/partner/admin/working-systems",
    "/v1/partner/admin/working-systems/decision",
    'authority: "boss_per"',
    '[PARTNER_MODEL_CHANGES.status]: "superseded"',
    'canonical_agreement_mutated: true'
  ]) assert.match(indexSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Partner ledger uses verified Payment Truth and idempotent canonical snapshots", () => {
  for (const marker of [
    "/v1/partner/admin/ledger/materialize",
    'normalizeStatus(fieldText(entry, PAYMENT_FIELDS.verification)) === "verified"',
    "commission_idempotency_conflict",
    "rateSnapshot",
    "typeSnapshot",
    "ledger_mutated: true",
    "/v1/partner/admin/ledger/action",
    "payout_reference_required"
  ]) assert.match(indexSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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

test("Telegram is optional in Partner Phase 1 while Payment Truth remains the job-response gate", () => {
  assert.doesNotMatch(indexSource, /partnerHasVerifiedTelegram\(verified\.value\.partnerRecord\)[\s\S]{0,300}telegram_connect_required/);
  assert.match(indexSource, /telegram_optional: true/);
  assert.match(indexSource, /telegram_required_for_job_response: false/);
  assert.match(indexSource, /job_response_ready: true/);
  assert.doesNotMatch(uiSource, /data-telegram-job-gate/);
  assert.match(uiSource, /LINE READY · TELEGRAM OPTIONAL/);
  assert.match(indexSource, /official_verify_required/);
});

test("production routing binds the Partner Control Room page and follows the apex redirect", () => {
  for (const route of ["mmdbkk.com/partner/dashboard*", "www.mmdbkk.com/partner/dashboard*"]) {
    assert.match(wranglerSource, new RegExp(route.replaceAll("/", "\\/")));
    assert.match(deployWorkflowSource, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(deployWorkflowSource, /page="\$\(curl --location /);
  assert.match(deployWorkflowSource, /\.error\.code \/\/ \.error/);
});

test("Lovable uses the canonical Worker contract without widening authority", () => {
  assert.match(wranglerSource, /https:\/\/sigil-partner\.lovable\.app/);
  assert.match(wranglerSource, /https:\/\/id-preview--bc1401f7-c385-48ab-bf5f-41aafc03fa19\.lovable\.app/);
  assert.match(indexSource, /Access-Control-Allow-Headers[^\n]+Idempotency-Key/);
  assert.match(indexSource, /payment_status: paymentStatus/);
  assert.match(indexSource, /confirmation_allowed: isOfficiallyVerifiedPaymentStatus\(paymentStatus\)/);
  assert.match(indexSource, /official_verify_required/);
  assert.match(uiSource, /job\.confirmation_allowed === true/);
  assert.match(uiSource, /รอ Official Verify/);
  assert.match(indexSource, /requested_customer_sell_rate_thb: fieldNumber\(existingRecord/);
});
