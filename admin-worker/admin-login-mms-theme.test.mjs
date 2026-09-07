import assert from "node:assert/strict";
import test from "node:test";

import { renderApprovedAdminLogin } from "./src/admin-login-page.js";

const MMS_LOGIN = "https://mmdbkk.com/internal/admin/login?next=/internal/admin/mms";

test("MMS partner login uses cinematic Back Office layout and canonical access scope", async () => {
  const response = renderApprovedAdminLogin(new Request(MMS_LOGIN), {
    next: "/internal/admin/mms",
  });
  const html = await response.text();
  const csp = response.headers.get("content-security-policy") || "";

  assert.equal(response.status, 200);
  assert.match(csp, /font-src https:\/\/cdn\.prod\.website-files\.com/);
  assert.match(html, /data-initial-lane="partner"/);
  assert.match(html, /data-layout="image-a-cinematic"/);

  assert.match(html, /LINESeedSansTH_W_Rg\.woff2/);
  assert.match(html, /LINESeedSansTH_W_Bd\.woff2/);
  assert.match(html, /LINESeedSansTH_W_XBd\.woff2/);
  assert.match(html, /font-synthesis:none/);

  assert.match(html, /BACK OFFICE ACCESS/);
  assert.match(html, /<h1 class="title">Enter your Back Office<\/h1>/);
  assert.match(html, /กรุณาเลือกบัญชีที่ท่านต้องการเข้าถึง/);
  assert.match(html, /MANAGED ACCOUNTS/);
  assert.match(html, /data-lane="owner"[\s\S]*?<b>MMD Privé<\/b><small>SIGIL System<\/small>/);
  assert.match(html, /data-lane="partner"[\s\S]*?<b>MMS<\/b><small>Male Massage<\/small>/);
  assert.match(html, /class="mms-mark"/);
  assert.match(html, /สำหรับ MMS Partner ใช้เข้าสู่ระบบควบคุมการทำงานหลังบ้านของ Male Massage เท่านั้น/);
  assert.match(html, /MMS Partner Operations · Male Massage Back Office/);
  assert.match(html, /Enter Back Office/);

  assert.match(html, /SIGIL Systems/);
  assert.match(html, /Design and Architecture by Per 2025–2026/);
  assert.match(html, /\(อีดอก กูเองค่ะมึง\)/);
  assert.match(html, /SECURE · PRIVATE · INTERNAL/);
  assert.match(html, /PEOPLE<\/span><span>SYSTEMS<\/span><span>A QUIETER<\/span><span>TOMORROW/);

  assert.match(html, /--green:#003704;--green2:#002b03;--green3:#001e02/);
  assert.match(html, /lane\[data-lane="partner"\]\.is-active/);
  assert.match(html, /#22e68c/);
  assert.doesNotMatch(html, /#71937a|#405f4c|#456b55|#6e9279/);
  assert.doesNotMatch(html, /เข้าพื้นที่ทำงานของคุณ/);
});
