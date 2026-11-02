import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const fixtures = [
  "webflow/sigil/member/login-existing-member-dialog.html",
  "webflow/sigil/member/existing-member-dialog.html",
];

for (const file of fixtures) {
  test(`${file} resumes recovery without putting contact data in the URL`, () => {
    const html = fs.readFileSync(file, "utf8");
    assert.match(html, /mmd\.member\.recovery\.draft\.v2/);
    assert.match(html, /DRAFT_TTL=10\*60\*1000/);
    assert.match(html, /sessionStorage\.setItem\(DRAFT_KEY/);
    assert.match(html, /sessionStorage\.removeItem\(DRAFT_KEY/);
    assert.match(html, /getDecodedIDToken/);
    assert.match(html, /บัญชี LINE เปลี่ยนไปจากตอนเริ่มคำขอ/);
    assert.match(html, /member\/api\/liff\/start/);
    assert.match(html, /member\/api\/liff\/recovery/);
    assert.match(html, /merge_request_id/);
    assert.doesNotMatch(html, /[?&](?:phone|email)=/i);
    assert.doesNotMatch(html, /redirectUri:[^}]*phone|redirectUri:[^}]*email/i);
  });
}
