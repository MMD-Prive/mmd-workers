import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_CANONICAL_ORIGIN,
  ADMIN_LOGIN_SESSION_PATH,
  renderApprovedAdminLogin,
} from "./src/admin-login-page.js";

function render() {
  return renderApprovedAdminLogin(
    new Request("https://www.mmdbkk.com/internal/admin/login"),
    { next: "/internal/admin/control-room" },
  );
}

test("admin login exposes one browser-neutral masked credential field", async () => {
  const html = await (await render()).text();

  assert.match(html, /<form[^>]*id="adminLoginForm"[^>]*autocomplete="off"/);
  assert.match(html, /id="adminCredential" type="text" required readonly autocomplete="off"/);
  assert.match(html, /id="adminCredential"[^>]*data-mask="true"/);
  assert.match(html, /data-1p-ignore="true"/);
  assert.match(html, /data-lpignore="true"/);
  assert.match(html, /data-bwignore="true"/);
  assert.match(html, /data-form-type="other"/);
  assert.doesNotMatch(html, /autocomplete="current-password"/);
  assert.doesNotMatch(html, /id="adminCredential"[^>]*name="credential"/);
  assert.doesNotMatch(html, /id="adminCredential"[^>]*type="password"/);
});

test("admin login canonicalizes www browser traffic to the apex admin origin before submit", async () => {
  const response = await render();
  const html = await response.text();

  assert.equal(ADMIN_CANONICAL_ORIGIN, "https://mmdbkk.com");
  assert.equal(response.headers.get("x-mmd-admin-origin"), ADMIN_CANONICAL_ORIGIN);
  assert.equal(response.headers.get("x-mmd-login-ui"), "browser-fetch-v5");
  assert.match(html, /location\.hostname==='www\.mmdbkk\.com'/);
  assert.match(html, /canonical\.hostname='mmdbkk\.com'/);
  assert.match(html, /location\.replace\(canonical\.toString\(\)\)/);
  assert.match(html, /rel="canonical" href="https:\/\/mmdbkk\.com\/internal\/admin\/login"/);
});

test("admin login posts the exact visible credential with an explicit same-origin fetch", async () => {
  const html = await (await render()).text();

  assert.match(html, new RegExp(`action="${ADMIN_LOGIN_SESSION_PATH}"`));
  assert.match(html, /const credential=input\.value/);
  assert.match(html, /const body=new URLSearchParams\(\)/);
  assert.match(html, /body\.set\('credential',credential\)/);
  assert.match(html, /body\.set\('next',nextInput\.value\|\|'\/internal\/admin\/control-room'\)/);
  assert.ok(html.includes(`fetch('${ADMIN_LOGIN_SESSION_PATH}',`));
  assert.match(html, /'Content-Type':'application\/x-www-form-urlencoded;charset=UTF-8'/);
  assert.match(html, /credentials:'same-origin'/);
  assert.match(html, /redirect:'follow'/);
  assert.match(html, /response\.ok&&response\.redirected/);
  assert.match(html, /code===401/);
  assert.match(html, /code===403/);
  assert.match(html, /code===400/);
});

test("admin login preserves secure server-side flow and exposes the production UI marker", async () => {
  const response = await render();
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, private, max-age=0");
  assert.equal(response.headers.get("x-mmd-login-ui"), "browser-fetch-v5");
  assert.equal(response.headers.get("x-mmd-admin-origin"), "https://mmdbkk.com");
  assert.match(response.headers.get("content-security-policy") || "", /connect-src 'self'/);
  assert.match(html, /name="next" value="\/internal\/admin\/control-room"/);
  assert.match(html, /Secure HttpOnly cookie/);
});
