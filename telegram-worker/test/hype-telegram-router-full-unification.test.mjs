import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ACTIVE_RUNTIME_FILES = [
  "../../mms-worker/src/index.js",
  "../../mms-worker/src/line-bot.mjs",
  "../../sigil-worker/src/public-model-notify.js",
  "../../himai-chat-worker/src/shop-alerts.js",
  "../../himai-chat-worker/src/mmd-shop-checkout.js",
  "../../partners-worker/src/index.ts",
  "../../payments-worker/index.js",
  "../../payments-worker/index.with-slip-evidence.js",
  "../../payments-worker/lib/telegram.js",
  "../../payments-worker/shop-payment-v1.js",
  "../../payments-worker/canonical-confirm-link.js",
];

const ROUTER_CONFIGS = [
  ["../../mms-worker/wrangler.jsonc", "AUTH_SERVICE_MMS_TO_TELEGRAM"],
  ["../../sigil-worker/wrangler.toml", "AUTH_SERVICE_SIGIL_TO_TELEGRAM"],
  ["../../himai-chat-worker/wrangler.toml", "AUTH_SERVICE_HIMAI_TO_TELEGRAM"],
  ["../../partners-worker/wrangler.toml", "AUTH_SERVICE_PARTNERS_TO_TELEGRAM"],
  ["../../payments-worker/wrangler.merged.toml", "AUTH_SERVICE_PAYMENTS_TO_TELEGRAM"],
];

const DEPLOY_WORKFLOWS = [
  ["../../.github/workflows/deploy-mms-worker.yml", "AUTH_SERVICE_MMS_TO_TELEGRAM"],
  ["../../.github/workflows/deploy-sigil-worker.yml", "AUTH_SERVICE_SIGIL_TO_TELEGRAM"],
  ["../../.github/workflows/deploy-himai-chat-worker.yml", "AUTH_SERVICE_HIMAI_TO_TELEGRAM"],
  ["../../.github/workflows/deploy-partners-worker.yml", "AUTH_SERVICE_PARTNERS_TO_TELEGRAM"],
  ["../../.github/workflows/deploy-payments-worker.yml", "AUTH_SERVICE_PAYMENTS_TO_TELEGRAM"],
];

async function source(relative) {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

test("declared active runtime senders cannot call Telegram Bot API directly", async () => {
  for (const relative of ACTIVE_RUNTIME_FILES) {
    const text = await source(relative);
    assert.doesNotMatch(text, /https:\/\/api\.telegram\.org\/bot/i, relative);
    assert.match(text, /telegram-worker\.internal\/telegram\/internal\/send/, relative);
  }
});

test("every migrated runtime has a canonical telegram-worker binding", async () => {
  for (const [relative] of ROUTER_CONFIGS) {
    const text = await source(relative);
    assert.match(text, /TELEGRAM_WORKER/, relative);
    assert.match(text, /telegram-worker/, relative);
  }
});

test("every migrated runtime service auth is provisioned by its production deploy workflow", async () => {
  for (const [relative, secret] of DEPLOY_WORKFLOWS) {
    const text = await source(relative);
    assert.match(text, new RegExp(secret), relative);
    assert.match(text, /telegram-worker\/wrangler\.toml/, relative);
  }
});

test("dedicated production closure waits for domain deploys and requires a live configured router probe", async () => {
  const text = await source("../../.github/workflows/telegram-router-production-closure.yml");
  for (const workflow of ["Deploy mms-worker","Deploy sigil-worker","Deploy himai-chat-worker","Deploy partners-worker","Deploy payments-worker"]) {
    assert.match(text, new RegExp(workflow.replace(/[.*+?^\${}()|[\\]\\]/g, "\\test("payments deploy closes the loop with a live configured router probe", async () => {
  const text = await source("../../.github/workflows/deploy-payments-worker.yml");
  assert.match(text, /\/telegram\/internal\/router\/health\?probe=1/);
  assert.match(text, /registry_version!=="2026-09-21\.2"/);
  assert.match(text, /status!=="configured"/);
  assert.match(text, /legacy_direct_senders\|\|0/);
});")));
  }
  assert.match(text, /\/telegram\/internal\/router\/health\?probe=1/);
  assert.match(text, /registry_version!=="2026-09-21\.2"/);
  assert.match(text, /status!=="configured"/);
  assert.match(text, /legacy_direct_senders\|\|0/);
  assert.match(text, /service_auth_configured===true/);
});
