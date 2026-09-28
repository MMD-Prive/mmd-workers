import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const doc = await readFile(new URL("./MMD_MODEL_PAYOUT_DISCLOSURE_V1.md", import.meta.url), "utf8");

test("model payout disclosure keeps public and model pricing separate", () => {
  assert.match(doc, /Client Price and Model Payout are separate amounts/);
  assert.match(doc, /Public pages must never expose internal payout/);
  assert.match(doc, /MMD MODEL shows the worker\/model the exact payout/);
});

test("confidential talent path and extension authority are locked", () => {
  assert.match(doc, /https:\/\/t\.me\/mmdapply/);
  assert.match(doc, /MY MMD extension request → MMD MODEL approve\/decline/);
  assert.match(doc, /Until `mmd_confirmed`/);
});

test("after-midnight payout rules are explicit", () => {
  assert.match(doc, /OT before 00:00: client ฿990\/hour → worker ฿650\/hour/);
  assert.match(doc, /OT after 00:00: client ฿1,490\/hour → worker ฿1,000\/hour/);
  assert.match(doc, /OT after 03:00: client ฿1,790\/hour → worker ฿1,200\/hour/);
  assert.match(doc, /must never be double-charged/);
});
