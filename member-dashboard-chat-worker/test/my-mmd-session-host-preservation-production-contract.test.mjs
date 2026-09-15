import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

test("production front gate retains the host-only LIFF session preservation contract", async () => {
  const source = await readFile(new URL("../src/my-mmd-bounded-status-front-gate.js", import.meta.url), "utf8");
  assert.match(source, /const SESSION_COOKIE = "__Host-mmd_liff_session"/);
  assert.match(source, /if \(cookieValue\(request, SESSION_COOKIE\)\) return null/);
});
