import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");

test("Telegram bot consumes only opaque bind start args through service binding", () => {
  assert.match(source, /\^bind_\[A-Za-z0-9_-\]\{20,60\}\$/);
  assert.match(source, /message\.from\?\.id/);
  assert.match(source, /x-mmd-service-binding": "telegram-worker"/);
  assert.match(source, /https:\/\/admin-worker\.internal\/__internal\/telegram-identity-bind/);
  assert.match(wrangler, /binding = "TELEGRAM_BIND_AUTHORITY"/);
  assert.match(wrangler, /service = "admin-worker"/);
});

test("Telegram binding copy preserves LINE as primary identity", () => {
  assert.match(source, /LINE ยังคงเป็นตัวตนหลัก/);
  assert.match(source, /Telegram Connected ✅/);
});
