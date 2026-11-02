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
    assert.match(html, /static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js|window\.liff/);
    assert.match(html, /allowLogin/);
    assert.match(html, /dialog\.addEventListener\('cancel'/);
    assert.match(html, /data-recovery-close/);
    assert.match(html, /login\.hidden=false/);
    assert.match(html, /บัญชี LINE เปลี่ยนไปจากตอนเริ่มคำขอ/);
    assert.match(html, /member\/api\/liff\/start/);
    assert.match(html, /member\/api\/liff\/recovery/);
    assert.match(html, /generation=0,sessionReady=false/);
    assert.match(html, /function stale\(token\)/);
    assert.match(html, /path\.endsWith\('\/recovery'\)&&!sessionReady/);
    assert.ok(html.indexOf("/member/api/liff/start") < html.indexOf("/member/api/liff/recovery"), "server session binding must precede recovery POST");
    assert.match(html, /login\.hidden=false/);
    assert.match(html, /merge_request_id/);
    assert.doesNotMatch(html, /[?&](?:phone|email)=/i);
    assert.doesNotMatch(html, /redirectUri:[^}]*phone|redirectUri:[^}]*email/i);
  });
}
