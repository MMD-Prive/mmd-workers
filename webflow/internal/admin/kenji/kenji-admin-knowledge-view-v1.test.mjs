import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./kenji-admin-knowledge-view-v1.js", import.meta.url), "utf8");

test("Knowledge has a canonical query view inside Kenji Admin", () => {
  assert.match(source, /knowledgeViewV1/);
  assert.match(source, /data-tab=\"knowledge\"/);
  assert.match(source, /currentView\(\) !== \"knowledge\"/);
  assert.match(source, /updateView\(\"knowledge\"/);
  assert.match(source, /ความรู้ของ Kenji/);
});

test("Knowledge deep link reuses the existing Worker-backed Knowledge tab", () => {
  assert.match(source, /\.ka__nav \[data-tab=\"knowledge\"\]/);
  assert.match(source, /button\.click\(\)/);
  assert.doesNotMatch(source, /api\.airtable\.com|AIRTABLE_API_KEY|Authorization:\s*[\"']Bearer/);
});

test("Knowledge is presented as a simple owner library", () => {
  for (const copy of ["เรื่องที่ Kenji รู้แล้ว", "ค้นหาจากชื่อหรือคำตอบ", "คำตอบที่ Kenji ใช้", "รายละเอียดระบบ", "สอน \/ แก้ความรู้"]) {
    assert.match(source, new RegExp(copy));
  }
  for (const status of ["ใช้อยู่", "ยังไม่ใช้งาน", "กำลังตรวจ", "พร้อมใช้", "ต้องแก้"]) {
    assert.match(source, new RegExp(status));
  }
  assert.match(source, /MutationObserver/);
  assert.match(source, /data-model-line-link-entry/);
  assert.match(source, /งานที่ต้องดู/);
  assert.match(source, /พร้อมใช้งาน/);
});

test("Knowledge library remains presentation-only and read-only", () => {
  assert.doesNotMatch(source, /method:\s*[\"']POST[\"']/);
  assert.doesNotMatch(source, /\/review|\/qa|\/publish/);
  assert.match(source, /data-kk-teach/);
  assert.match(source, /สอน Kenji/);
});

test("leaving Knowledge removes only the view query state", () => {
  assert.match(source, /url\.searchParams\.delete\(\"view\"\)/);
  assert.match(source, /pushState/);
  assert.match(source, /popstate/);
});
