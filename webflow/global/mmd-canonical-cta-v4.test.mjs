import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./mmd-canonical-cta-v4.js", import.meta.url), "utf8");

test("routes member login to coupon or canonical My MMD without direct LIFF hop", () => {
  assert.match(source, /const MY_MMD_CANONICAL = "\/my-mmd\/"/);
  assert.match(source, /const COUPON_ENTRY = "\/my-mmd\/coupons"/);
  assert.match(source, /function memberLoginTarget\(\)/);
  assert.match(source, /params\.get\("return_to"\) === "coupon" \? COUPON_ENTRY : MY_MMD_CANONICAL/);
  assert.match(source, /if \(path === "\/member\/login"\)/);
  assert.match(source, /document\.querySelectorAll\("\[data-mml-login\]"\)/);
  assert.doesNotMatch(source, /if \(path === "\/member\/login"\) \{\s*setLinks\("\[data-mml-login\]", LIFF_STATUS\)/);
});

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

test("keeps CARE BACK on bounded My MMD while Wish hands off to the coupon wallet", () => {
  assert.match(source, /path === "\/promotion\/6-years-care-back"/);
  assert.match(source, /dataset\.memberUrl = MY_MMD/);
  assert.match(source, /\[data-wish-link\].*CARE_BACK_WISH/);
  assert.match(source, /path === "\/promotion\/6-years-care-back\/wish"/);
  assert.match(source, /const CARE_BACK_COUPONS = "\/my-mmd\/coupons"/);
  assert.match(source, /dataset\.dashboardUrl = CARE_BACK_COUPONS/);
  assert.match(source, /\/member\/my-mmd.*CARE_BACK_COUPONS/);
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

test("patches renewal to canonical signed one-click payment flow", () => {
  assert.match(source, /path === "\/member\/renewal"/);
  assert.match(source, /setupRenewalFlow\(root\)/);
  assert.match(source, /\/member\/api\/liff\/profile/);
  assert.match(source, /\/member\/api\/liff\/intent/);
  assert.match(source, /\/member\/api\/liff\/package/);
  assert.match(source, /\/member\/api\/liff\/payment-intent/);
  assert.match(source, /payment_stage: "renewal"/);
  assert.match(source, /canonicalPaymentUrl/);
  assert.match(source, /url\.pathname !== "\/sigil\/pay"/);
  assert.match(source, /legacyPay\.hidden = true/);
  assert.match(source, /legacyPaymentLink\.removeAttribute\("href"\)/);
  assert.match(source, /คำนวณเรทและต่ออายุ/);
  assert.match(source, /สมัครใหม่ 2,999 บาท \/ 2 ปี/);
  assert.doesNotMatch(source, /ไปต่อที่รายการชำระ/);
  assert.doesNotMatch(source, /\/member\/payments\?source=renewal/);
  assert.doesNotMatch(source, /confirm\/payment-proof/);
});

test("keeps dynamic Webflow content patched after injection", () => {
  assert.match(source, /new MutationObserver/);
  assert.match(source, /childList: true/);
  assert.doesNotThrow(() => new Function(source));
});


test("global member control uses verified profile and routes to canonical member profile", () => {
  assert.match(source, /mmd-global-member-control-v1/);
  assert.match(source, /\/member\/api\/liff\/profile/);
  assert.match(source, /const PROFILE_PATH="\/member\/profile"/);
  assert.match(source, /dataset\.state="online"/);
});

test("coupon login continuation uses canonical MY MMD coupons route", () => {
  assert.match(source, /const COUPON_ENTRY = "\/my-mmd\/coupons"/);
});


test("mobile global member header stays one row and does not force a two-column navbar", () => {
  const start = source.indexOf('style.id="mmd-global-member-control-v1-style"');
  const end = source.indexOf('document.head.appendChild(style);', start);
  assert.ok(start >= 0 && end > start, "scoped member header style exists");
  const css = source.slice(start, end);
  assert.match(css, /#mmd-global-public-header \.mmdg-inner \.mmdg-nav\{display:none!important\}/);
  assert.match(css, /@media\(max-width:1000px\)/);
  assert.match(css, /@media\(min-width:1001px\)/);
  assert.match(css, /#mmd-global-public-header \.mmdg-menu-button\{display:none!important\}/);
  assert.match(css, /\.mmd-gm-copy\{display:flex;align-items:center/);
  assert.match(css, /\.mmd-gm-copy span\{display:none\}/);
  assert.match(css, /\.mmdg-mobile-menu nav\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.doesNotMatch(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css, /max-width:min\(46vw,210px\)/);
});

test("member identity joins the header without obscuring its mobile menu or changing auth", () => {
  assert.match(source, /function dockMemberChip\(\)/);
  assert.match(source, /inner\.insertBefore\(chip,inner\.querySelector\("\.mmdg-menu-button"\)\)/);
  assert.match(source, /observer\.observe\(document\.body,\{childList:true,subtree:true\}\)/);
  assert.match(source, /fetch\("\/member\/api\/liff\/profile",\{credentials:"same-origin",cache:"no-store"/);
  assert.match(source, /chip\.href=PROFILE_PATH/);
  assert.match(source, /chip\.title="เปิด Member Profile ของ "\+name/);
});
