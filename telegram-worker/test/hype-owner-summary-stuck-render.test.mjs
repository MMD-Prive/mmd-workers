import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("HYPE owner summary renders bounded cross-system stuck watch", async () => {
  const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /<b>STUCK \/ NEEDS ATTENTION<\/b>/);
  assert.match(source, /ownerStuckKindLabel/);
  assert.match(source, /Read-only operational watch/);
  assert.match(source, /HYPE จะไม่เดาว่าไม่มีงานค้าง/);
});
