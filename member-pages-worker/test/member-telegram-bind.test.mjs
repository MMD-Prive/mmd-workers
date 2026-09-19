import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("../src/member-telegram-bind.js", import.meta.url), "utf8");

test("member Telegram binding requires verified LIFF session and stays optional", () => {
  assert.match(source, /__Host-mmd_liff_session/);
  assert.match(source, /LIFF_SESSION_SECRET/);
  assert.match(source, /LIFF_IDENTITY_KV/);
  assert.match(source, /resolveCanonicalClientForLine/);
  assert.match(source, /telegram_verification_status/);
  assert.match(source, /connect_required/);
});

test("member Telegram start token is opaque and stores only hash", () => {
  assert.match(source, /bind_\$\{raw\}/);
  assert.match(source, /sha256Hex\(startArg\)/);
  assert.match(source, /token_hash:tokenHash/);
  assert.doesNotMatch(source, /start=.*line_user_id/);
  assert.doesNotMatch(source, /start=.*client\.id/);
});
