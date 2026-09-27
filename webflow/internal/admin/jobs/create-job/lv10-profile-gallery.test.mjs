import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const file = new URL("./lv10-profile-gallery-v14.js", import.meta.url);

test("LV7 gallery is capped at 8 and supports client + model search responses", async () => {
  const js = await readFile(file, "utf8");
  assert.match(js, /a\.length>=8/);
  assert.match(js, /\/v1\/admin\/clients\/lineage-lookup/);
  assert.match(js, /\/v1\/admin\/clients\/recent/);
  assert.match(js, /\/v1\/admin\/models\/search/);
  assert.match(js, /profile_photos/);
});

test("gallery is mobile-first and desktop is intentionally not near fullscreen", async () => {
  const js = await readFile(file, "utf8");
  assert.match(js, /max-width:680px/);
  assert.match(js, /max-height:78vh/);
  assert.match(js, /@media\(min-width:768px\)/);
  assert.match(js, /max-height:88dvh/);
});

test("gallery supports arrows, keyboard navigation, counter, thumbnails and zoom", async () => {
  const js = await readFile(file, "utf8");
  assert.match(js, /data-g-prev/);
  assert.match(js, /data-g-next/);
  assert.match(js, /ArrowLeft/);
  assert.match(js, /ArrowRight/);
  assert.match(js, /data-g-count/);
  assert.match(js, /data-g-strip/);
  assert.match(js, /data-g-plus/);
  assert.match(js, /data-g-minus/);
  assert.match(js, /data-g-reset/);
});


test("empty Client gallery can sync current LINE photo into Profile Photo history", async () => {
  const js = await readFile(file, "utf8");
  assert.match(js, /\/v1\/admin\/clients\/profile-photo\/sync/);
  assert.match(js, /function openClient\(record,focus\)/);
  assert.match(js, /client_id:record\.client_id/);
  assert.match(js, /const synced=Array\.isArray\(body\.profile_photos\)\?body\.profile_photos\.slice\(0,8\):\[\]/);
  assert.match(js, /record\.profile_photos=synced/);
  assert.match(js, /บันทึกรูป LINE ล่าสุดเข้า Profile Photo แล้ว/);
});
