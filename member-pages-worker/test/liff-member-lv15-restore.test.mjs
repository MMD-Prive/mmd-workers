import assert from "node:assert/strict";
import test from "node:test";
import { handleLiffMemberShell } from "../src/liff-member-shell.js";
import { resolveVerifiedCustomerBrand } from "../src/liff-customer-brand-v6.js";
import { MY_MMD_LIFF_LV15_CSS } from "../src/liff-member-lv15-style.js";

function render(intent = "status") {
  return handleLiffMemberShell(
    new Request("https://mmdbkk.com/member/liff?intent=" + intent),
    { LINE_LIFF_ID: "2010862595-yT4DCEMc" },
  );
}

test("LV15 is mounted once after V4 and the trusted private/public brand styles", async () => {
  const res = render();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control") || "", /no-store/);
  const html = await res.text();
  assert.match(html, /data-mmd-liff-compact="v4" data-mmd-graphics="v6" data-brand-audience="unresolved" data-mmd-liff-level="15"/);
  assert.equal(html.split("Level 15 shell skin").length - 1, 0, "React-only LV15 CSS must not be blindly copied to Worker markup");
  assert.equal(html.split("MY MMD LV15 \/ Worker presentation bridge").length - 1, 1);
  assert.ok(html.indexOf("MY MMD LV15 / Worker presentation bridge") > html.indexOf("--v4-bg:#0b0e10"));
  assert.ok(html.indexOf("MY MMD LV15 / Worker presentation bridge") > html.indexOf("--v4-bg:#111210"), "LV15 must load after the existing private brand CSS");
  assert.match(html, /data-mmd-liff-digital="v3"/);
  assert.match(html, /data-mmd-graphics="v6"/);
});

test("LV15 styles only activate for verified backend-selected brand after entry", () => {
  const selectors = [...MY_MMD_LIFF_LV15_CSS.matchAll(/body\[data-mmd-liff-level="15"\][^{]+\{/g)].map(x => x[0]);
  assert.ok(selectors.length > 25, "expected a fully scoped desktop/mobile skin");
  for (const sel of selectors) {
    assert.match(sel, /\.app-entered:not\(\.signup-mode\)/);
    assert.match(sel, /data-brand-audience=/);
  }
  assert.match(MY_MMD_LIFF_LV15_CSS, /#f6f1e8/);
  assert.match(MY_MMD_LIFF_LV15_CSS, /#a91d35/);
  assert.match(MY_MMD_LIFF_LV15_CSS, /#0b0a08/);
  assert.match(MY_MMD_LIFF_LV15_CSS, /#dcc48e/);
  assert.equal(resolveVerifiedCustomerBrand({brand_audience:"sigil"}, "canonical_member_account_v1"), "private");
  assert.equal(resolveVerifiedCustomerBrand({brand_audience:"public"}, "canonical_member_account_v1"), "public");
  assert.equal(resolveVerifiedCustomerBrand({brand_audience:"sigil"}, "unverified"), "unresolved");
  assert.equal(resolveVerifiedCustomerBrand({}, "canonical_member_account_v1"), "unresolved");
});

test("Presentation cannot hide protected fields, infer entitlements or replace session runtime", async () => {
  assert.doesNotMatch(MY_MMD_LIFF_LV15_CSS, /fetch\(|localStorage|sessionStorage|window\.liff|document\.cookie|dataset\.world|data-tier|data-membership|display:\s*none\s*!important/i);
  const html = await render().text();
  for (const invariant of [
    'id="points-total"', 'id="points-history"', 'id="renewal-card"',
    'id="renewal-action"', 'id="digital-mission"', 'id="digital-mission-eta"',
    'id="digital-news-feed"', 'id="digital-unread"', 'id="credit-wallet"',
    'id="v2-history"', 'id="care-back-content"', 'id="coupon-wallet"',
    'id="minimal-member-display"', 'id="member-logout"',
    'id="digital-snapshot"', 'id="digital-greeting"',
  ]) {
    if (invariant === 'id="digital-snapshot"') {
      assert.match(html, /class="digital-snapshot"/);
    } else {
      assert.ok(html.includes(invariant), invariant);
    }
  }
  assert.match(html, /getIDToken\(\)/);
  assert.match(html, /\/member\/api\/liff\/start/);
  assert.match(html, /<nav class="digital-dock"[^>]*>/);
  assert.match(html, /<details class="digital-news-disclosure"/);
});

test("Signup remains on its unchanged flow; LV15 supplies keyboard/touch/reduced-motion safety", async () => {
  const signup = await render("signup").text();
  assert.match(signup, /class="signup-mode app-entered world-public"/);
  assert.match(signup, /id="signup-packages"/);
  assert.match(signup, /id="signup-line-entry"/);
  assert.match(signup, /data-mmd-liff-level="15"/);
  assert.match(MY_MMD_LIFF_LV15_CSS, /\.app-entered:not\(\.signup-mode\)/);
  assert.match(MY_MMD_LIFF_LV15_CSS, /min-height:64px/);
  assert.match(MY_MMD_LIFF_LV15_CSS, /safe-area-inset-bottom/);
  assert.match(MY_MMD_LIFF_LV15_CSS, /:focus-visible/);
  assert.match(MY_MMD_LIFF_LV15_CSS, /prefers-reduced-motion:reduce/);
  assert.match(MY_MMD_LIFF_LV15_CSS, /@media\(max-width:360px\)/);
});
