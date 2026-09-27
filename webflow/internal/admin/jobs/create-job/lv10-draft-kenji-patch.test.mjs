import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const patchPath = new URL("./lv10-draft-kenji-patch-v13.js", import.meta.url);

test("right-panel Draft has a working resume action", async () => {
  const js = await readFile(patchPath, "utf8");
  assert.match(js, /data-cj="draftResumeOpen"/);
  assert.match(js, /async function openDraft\(\)/);
  assert.match(js, /localStorage\.getItem\(D\)/);
  assert.match(js, /data-cj-client-index/);
  assert.match(js, /data-cj-model-index/);
  assert.match(js, /clientSearch/);
  assert.match(js, /modelSearch/);
  assert.match(js, /เปิด Draft/);
});

test("Draft resume uses canonical UI search/select instead of trusting stored authority", async () => {
  const js = await readFile(patchPath, "utf8");
  assert.match(js, /selectClient\(d\)/);
  assert.match(js, /selectModel\(d\)/);
  assert.match(js, /choice\.click\(\)/);
  assert.doesNotMatch(js, /state\.client\s*=/);
  assert.doesNotMatch(js, /state\.model\s*=/);
});

test("Kenji asset appears on all five Create Job stage headers", async () => {
  const js = await readFile(patchPath, "utf8");
  assert.match(js, /Kenji%20sigil%20start\.webp/);
  assert.match(js, /\.mmd-cj__card\[data-step\] \.mmd-cj__cardHead/);
  assert.match(js, /function addKenji\(\)/);
  assert.match(js, /MutationObserver/);
  assert.match(js, /Kenji · Draft/);
});
