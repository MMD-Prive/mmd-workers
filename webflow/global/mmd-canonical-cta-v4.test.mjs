import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./mmd-canonical-cta-v4.js", import.meta.url), "utf8");

test("keeps generic member status on /member/dashboard", () => {
  assert.match(source, /const DASHBOARD = "\/member\/dashboard"/);
  assert.match(source, /path === "\/member\/payments"/);
  assert.match(source, /dataset\.dashboardPath = DASHBOARD/);
  assert.doesNotMatch(source, /"\/member\/dashboard"\s*:\s*MY_MMD/);
});

test("restores public access without changing bounded My MMD entry", () => {
  assert.match(source, /path === "\/public\/access"/);
  assert.match(source, /mmd-access-gate/);
  assert.match(source, /buttons\[0\].*LIFF_STATUS/);
  assert.match(source, /buttons\[1\].*MY_MMD/);
});

test("keeps CARE BACK on bounded My MMD and restores the wish link", () => {
  assert.match(source, /path === "\/promotion\/6-years-care-back"/);
  assert.match(source, /dataset\.memberUrl = MY_MMD/);
  assert.match(source, /\[data-wish-link\].*CARE_BACK_WISH/);
  assert.match(source, /path === "\/promotion\/6-years-care-back\/wish"/);
  assert.match(source, /dataset\.dashboardUrl = MY_MMD/);
});

test("restores member promotion and membership dashboard handoffs", () => {
  assert.match(source, /path === "\/member\/promotion"/);
  assert.match(source, /data-mmd-mp10-dashboard/);
  assert.match(source, /path === "\/membership" \|\| path === "\/member\/membership"/);
  assert.match(source, /dataset\.dashboardRoute = DASHBOARD/);
});

test("restores My MMD to LIFF status handoff", () => {
  assert.match(source, /path === "\/member\/my-mmd"/);
  assert.match(source, /miniapp\.line\.me/);
  assert.match(source, /LIFF_STATUS/);
});

test("patches membership benefits to final durations with query-safe dashboard matching", () => {
  assert.match(source, /href\^=\"\/sigil\/member\/dashboard\"/);
  assert.match(source, /patchCareBackTier\(root, "standard", "1 YEAR"/);
  assert.match(source, /patchCareBackTier\(root, "premium", "2 YEARS"/);
  assert.match(source, /CARE BACK · ส\.ค\. 2026 \+180 วัน หลังยืนยัน/);
  assert.match(source, /CARE BACK · ส\.ค\. 2026 \+1 ปี หลังยืนยัน/);
});

test("patches renewal to canonical dashboard and payment-list wording", () => {
  assert.match(source, /path === "\/member\/renewal"/);
  assert.match(source, /href\^=\"\/member\/my-mmd\"/);
  assert.match(source, /สมัครใหม่ 2,999 บาท \/ 2 ปี/);
  assert.match(source, /ไปต่อที่รายการชำระ/);
  assert.doesNotMatch(source, /confirm\/payment-proof/);
});

test("keeps dynamic Webflow content patched after injection", () => {
  assert.match(source, /new MutationObserver/);
  assert.match(source, /childList: true/);
  assert.doesNotThrow(() => new Function(source));
});
