import assert from "node:assert/strict";
import test from "node:test";

import { renderApprovedAdminLogin } from "./src/admin-login-page.js";

const MMS_LOGIN = "https://mmdbkk.com/internal/admin/login?next=/internal/admin/mms";

test("MMS partner login uses canonical Thai fonts and MMS forest palette", async () => {
  const response = renderApprovedAdminLogin(new Request(MMS_LOGIN), {
    next: "/internal/admin/mms",
  });
  const html = await response.text();
  const csp = response.headers.get("content-security-policy") || "";

  assert.equal(response.status, 200);
  assert.match(csp, /font-src https:\/\/cdn\.prod\.website-files\.com/);
  assert.match(html, /data-initial-lane="partner"/);

  assert.match(html, /LINESeedSansTH_W_Rg\.woff2/);
  assert.match(html, /LINESeedSansTH_W_Bd\.woff2/);
  assert.match(html, /LINESeedSansTH_W_XBd\.woff2/);
  assert.match(html, /font-synthesis:none/);
  assert.match(html, /\.title\{[^}]*font-weight:800;line-height:1\.16;letter-spacing:-\.018em/);

  assert.match(html, /--green:#003704;--green2:#002b03;--green3:#001e02/);
  assert.match(html, /\.partner-panel \.go\{[^}]*linear-gradient\(104deg,var\(--green\) 0%,var\(--green2\) 52%,var\(--green3\) 100%\)[^}]*color:#fff;[^}]*-webkit-text-fill-color:#fff/);
  assert.doesNotMatch(html, /#71937a|#405f4c|#456b55|#6e9279/);
});
