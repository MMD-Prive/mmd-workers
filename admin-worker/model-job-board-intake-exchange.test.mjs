import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./src/model-liff-worker-legacy.js", import.meta.url), "utf8");

test("unlinked Job Board visitor returns review-required instead of generic model_not_linked failure", () => {
  assert.match(source, /const intent = clean\(body\?\.intent \|\| body\?\.entry_intent\)\.toLowerCase\(\)/);
  assert.match(source, /model\.error === "model_not_linked" && intent === "job_board"/);
  assert.match(source, /state: "identity_review_required"/);
  assert.match(source, /}, 202, request, env\)/);
});

test("ordinary unlinked Model login remains fail-closed", () => {
  assert.match(source, /return json\(\{ ok: false, error: model\.error \}, model\.status, request, env\)/);
});
