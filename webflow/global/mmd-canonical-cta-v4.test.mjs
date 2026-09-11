import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./mmd-canonical-cta-v4.js", import.meta.url), "utf8");

test("keeps generic member status on /member/dashboard", () => {
  assert.match(source, /let d='\/member\/dashboard'/);
  assert.match(source, /p=='\/member\/payments'/);
  assert.match(source, /dataset\.dashboardPath=d/);
});

test("keeps CARE BACK on the bounded My MMD handoff", () => {
  assert.match(source, /p=='\/promotion\/6-years-care-back'/);
  assert.match(source, /memberUrl=y/);
  assert.match(source, /p=='\/promotion\/6-years-care-back\/wish'/);
  assert.match(source, /dashboardUrl=y/);
});

test("patches membership benefits to final durations", () => {
  assert.match(source, /c\(r,'standard','1 YEAR','CARE BACK · ส\.ค\. 2026 \+180 วัน หลังยืนยัน'\)/);
  assert.match(source, /c\(r,'premium','2 YEARS','CARE BACK · ส\.ค\. 2026 \+1 ปี หลังยืนยัน'\)/);
});

test("patches renewal to canonical dashboard and payment-list wording", () => {
  assert.match(source, /p=='\/member\/renewal'/);
  assert.match(source, /s\('a\[href="\/member\/my-mmd"\]',d,r\)/);
  assert.match(source, /สมัครใหม่ 2,999 บาท \/ 2 ปี/);
  assert.match(source, /ไปต่อที่รายการชำระ/);
  assert.doesNotMatch(source, /confirm\/payment-proof/);
});
