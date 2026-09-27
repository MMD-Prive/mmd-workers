import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const jsPath = new URL("./lv11-owner-composer-v1.js", import.meta.url);
const cssPath = new URL("./lv11-owner-composer-v1.css", import.meta.url);

test("LV11 keeps Create Job as presentation/operator continuity only", async () => {
  const js = await readFile(jsPath, "utf8");
  assert.match(js, /mmd-create-job-lv11-owner-composer/);
  assert.match(js, /JOB FLOW/);
  assert.match(js, /KENJI/);
  assert.match(js, /function ensureDraft/);
  assert.match(js, /async function resumeDraft/);
  assert.match(js, /data-cj-client-index/);
  assert.match(js, /data-cj-model-index/);
  assert.doesNotMatch(js, /state\.client\s*=/);
  assert.doesNotMatch(js, /state\.model\s*=/);
});

test("LV11 profile gallery is capped at 8 and uses canonical Client photo sync", async () => {
  const js = await readFile(jsPath, "utf8");
  assert.match(js, /a\.length>=8/);
  assert.match(js, /slice\(0,8\)/);
  assert.match(js, /\/v1\/admin\/clients\/profile-photo\/sync/);
  assert.match(js, /ArrowLeft/);
  assert.match(js, /ArrowRight/);
  assert.match(js, /data-g-strip/);
});

test("LV11 does not add a global fetch interceptor or MutationObserver loop", async () => {
  const js = await readFile(jsPath, "utf8");
  assert.doesNotMatch(js, /window\.fetch\s*=/);
  assert.doesNotMatch(js, /new MutationObserver/);
});

test("LV11 exposes Needs You and compact responsive owner workspace", async () => {
  const js = await readFile(jsPath, "utf8");
  const css = await readFile(cssPath, "utf8");
  assert.match(js, /NEEDS YOU/);
  assert.match(js, /function renderNeeds/);
  assert.match(css, /grid-template-columns:158px minmax\(0,1fr\)/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 304px/);
  assert.match(css, /@media\(max-width:799px\)/);
  assert.match(css, /mmd-cj__galleryDialog/);
  assert.match(css, /-webkit-text-fill-color:currentColor/);
});
