import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./confidential-talent-cta-v1.html", import.meta.url), "utf8");

test("public profile page offers a controlled confidential-work path", () => {
  assert.match(source, /FOR MMD PROFILES · CONFIDENTIAL WORK/);
  assert.match(source, /https:\/\/t\.me\/mmdapply/);
  assert.match(source, /MMD MODEL ACCEPTANCE/);
  assert.match(source, /เรทถึงตัวจะไม่ถูกเปิดเผยบนหน้า Public/);
});

test("confidential CTA opens Telegram safely", () => {
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
});
