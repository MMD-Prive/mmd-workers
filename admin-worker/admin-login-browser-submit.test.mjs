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

test("admin login exposes one canonical password field without password-manager semantics", async () => {
  const html = await (await render()).text();

  assert.match(html, /<form[^>]*id="adminLoginForm"[^>]*autocomplete="off"/);
  assert.match(html, /id="adminCredential" name="credential" type="password"/);
  assert.match(html, /id="adminCredential"[^>]*readonly[^>]*autocomplete="off"/);
  assert.match(html, /data-1p-ignore="true"/);
  assert.match(html, /data-lpignore="true"/);
  assert.match(html, /data-bwignore="true"/);
  assert.match(html, /data-form-type="other"/);
  assert.doesNotMatch(html, /autocomplete="current-password"/);
  assert.doesNotMatch(html, /adminCredentialSubmit/);
  assert.doesNotMatch(html, /type="hidden" name="credential"/);
});

test("admin login canonicalizes www browser traffic to the apex admin origin before submit", async () => {
  const response = await render();
  const html = await response.text();

  assert.equal(ADMIN_CANONICAL_ORIGIN, "https://mmdbkk.com");
  assert.equal(response.headers.get("x-mmd-admin-origin"), ADMIN_CANONICAL_ORIGIN);
  assert.equal(response.headers.get("x-mmd-login-ui"), "canonical-apex-v4");
  assert.match(html, /location\.hostname==='www\.mmdbkk\.com'/);
  assert.match(html, /canonical\.hostname='mmdbkk\.com'/);
  assert.match(html, /location\.replace\(canonical\.toString\(\)\)/);
  assert.match(html, /rel="canonical" href="https:\/\/mmdbkk\.com\/internal\/admin\/login"/);
});

test("admin login submits the canonical credential field directly after user interaction", async () => {
  const html = await (await render()).text();

  assert.match(html, new RegExp(`action="${ADMIN_LOGIN_SESSION_PATH}"`));
  assert.match(html, /id="adminCredential" name="credential" type="password" required/);
  assert.match(html, /const unlock=\(\)=>\{input\.readOnly=false;\}/);
  assert.match(html, /input\.addEventListener\('pointerdown',unlock,\{once:true\}\)/);
  assert.match(html, /input\.addEventListener\('focus',unlock,\{once:true\}\)/);
  assert.match(html, /form\.addEventListener\('submit'/);
  assert.match(html, /input\.readOnly=true/);
  assert.doesNotMatch(html, /submitValue\.value=input\.value/);
});

test("admin login preserves secure server-side flow and exposes the production UI marker", async () => {
  const response = await render();
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, private, max-age=0");
  assert.equal(response.headers.get("x-mmd-login-ui"), "canonical-apex-v4");
  assert.equal(response.headers.get("x-mmd-admin-origin"), "https://mmdbkk.com");
  assert.match(html, /name="next" value="\/internal\/admin\/control-room"/);
  assert.match(html, /Secure HttpOnly cookie/);
});