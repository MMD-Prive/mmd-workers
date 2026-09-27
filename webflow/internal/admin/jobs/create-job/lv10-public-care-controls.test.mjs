import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const markupPath = new URL("./lv10-public-brief-v12.html", import.meta.url);
const runtimePath = new URL("./lv10-runtime-v11.js", import.meta.url);

test("public care count is a fixed 1-5 selector with default 1", async () => {
  const html = await readFile(markupPath, "utf8");

  assert.match(html, /data-cj='publicCareCount'/);
  assert.doesNotMatch(
    html,
    /type='number'[^>]*data-cj='publicCareCount'|data-cj='publicCareCount'[^>]*type='number'/,
    "care count must not regress to a free numeric input",
  );

  for (let n = 1; n <= 5; n += 1) {
    assert.match(html, new RegExp(`<option value='${n}'(?: selected)?>${n} คน<\\/option>`));
  }
  assert.match(html, /<option value='1' selected>1 คน<\/option>/);
  assert.doesNotMatch(html, /<option value='0'/);
});

test("public care mode is explicit and defaults to overall care", async () => {
  const html = await readFile(markupPath, "utf8");
  assert.match(html, /data-cj='publicCareMode'/);
  assert.match(html, /<option value='overall' selected>ดูแลรวม ๆ ในงาน<\/option>/);
  assert.match(html, /<option value='brief_only'>ดูแลตามหน้าที่ที่ได้รับบรีฟเท่านั้น<\/option>/);
});

test("runtime persists, validates, and submits care mode safely", async () => {
  const js = await readFile(runtimePath, "utf8");
  assert.match(js, /care_mode:careMode/);
  assert.match(js, /j\.care_count>=1&&j\.care_count<=5/);
  assert.match(js, /by\('publicCareCount'\)\.value='1'/);
  assert.match(js, /by\('publicCareMode'\)\.value='overall'/);
  assert.match(js, /'publicCareCount','publicCareMode','publicSpecialToggle'/);
});
