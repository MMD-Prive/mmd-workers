import assert from "node:assert/strict";
import test from "node:test";

import { renderApprovedAdminLogin } from "./src/admin-login-page.js";

const MMS_LOGIN = "https://mmdbkk.com/internal/admin/login?next=/internal/admin/mms";

test("MMS partner login uses Image A back-office layout and canonical MMS styling", async () => {
  const response = renderApprovedAdminLogin(new Request(MMS_LOGIN), {
    next: "/internal/admin/mms",
  });
  const html = await response.text();
  const csp = response.headers.get("content-security-policy") || "";

  assert.equal(response.status, 200);
  assert.match(csp, /font-src https:\/\/cdn\.prod\.website-files\.com/);
  assert.match(html, /data-initial-lane="partner"/);
  assert.match(html, /data-active-lane="partner"/);

  assert.match(html, /LINESeedSansTH_W_Rg\.woff2/);
  assert.match(html, /LINESeedSansTH_W_Bd\.woff2/);
  assert.match(html, /LINESeedSansTH_W_XBd\.woff2/);
  assert.match(html, /font-synthesis:none/);
  assert.match(html, /\.title\{[^}]*font-family:Georgia[^}]*font-weight:400;line-height:1\.02/);

  assert.match(html, /--green:#003704;--green2:#002b03;--green3:#001e02/);
  assert.match(html, /data-lane="partner"[^>]*role="tab"/);
  assert.match(html, /data-lane="partner"\]\.is-active\{[^}]*rgba\(0,55,4/);
  assert.doesNotMatch(html, /#71937a|#405f4c|#456b55|#6e9279/);

  assert.match(html, /BACK OFFICE ACCESS/);
  assert.match(html, /<h1 class="title">Enter your Back Office<\/h1>/);
  assert.match(html, /กรุณาเลือกบัญชีที่ท่านต้องการเข้าถึง/);
  assert.match(html, /MANAGED ACCOUNTS/);
  assert.match(html, /MMD_Prive%CC%81_logo_signature_transparent%20Final\.webp/);
  assert.match(html, /MMS%20Login%20Button\.webp/);
  assert.match(html, /<b>MMD Privé<\/b><small>SIGIL Systems<\/small>/);
  assert.match(html, /<b>MMS<\/b><small>Male Massage<\/small>/);
  assert.match(html, /สำหรับ MMS Partner ใช้เข้าสู่ระบบควบคุมการทำงานหลังบ้านของ Male Massage เท่านั้น/);
  assert.match(html, /Enter Back Office/);

  assert.match(html, /class="hero-mantra"/);
  assert.match(html, /People<\/span><span>Systems<\/span><span>A Quieter<\/span><span>Tomorrow/);
  assert.match(html, /SECURE · PRIVATE · INTERNAL/);
  assert.match(html, /SIGIL Systems<\/b><br>Design and Architecture by Per 2025–2026 \(อีดอก กูเองค่ะมึง\)/);
  assert.match(response.headers.get("x-mmd-login-ui") || "", /browser-fetch-v5/);
});
