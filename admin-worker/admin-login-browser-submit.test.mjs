import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_LOGIN_SESSION_PATH,
  renderApprovedAdminLogin,
} from "./src/admin-login-page.js";

function render() {
  return renderApprovedAdminLogin(
    new Request("https://www.mmdbkk.com/internal/admin/login"),
    { next: "/internal/admin/control-room" },
  );
}

test("admin login exposes one canonical direct field without password-manager semantics", async () => {
  const html = await (await render()).text();

  assert.match(html, /<form[^>]*id="adminLoginForm"[^>]*autocomplete="off"/);
  assert.match(html, /id="adminCredential" name="credential" type="text"/);
  assert.match(html, /id="adminCredential"[^>]*autocomplete="off"/);
  assert.match(html, /id="adminCredential"[^>]*data-1p-ignore="true"/);
  assert.match(html, /id="adminCredential"[^>]*data-lpignore="true"/);
  assert.match(html, /id="adminCredential"[^>]*data-bwignore="true"/);
  assert.match(html, /id="adminCredential"[^>]*data-form-type="other"/);
  assert.doesNotMatch(html, /autocomplete="current-password"/);
  assert.doesNotMatch(html, /adminCredentialSubmit/);
  assert.doesNotMatch(html, /type="hidden" name="credential"/);
});

test("admin login masks the canonical direct field without client-side mirroring", async () => {
  const html = await (await render()).text();

  assert.match(html, new RegExp(`action="${ADMIN_LOGIN_SESSION_PATH}"`));
  assert.match(html, /class="mmd-login21__credential" id="adminCredential" name="credential" type="text" required/);
  assert.match(html, /\.mmd-login21__credential\{-webkit-text-security:disc\}/);
  assert.match(html, /supportsTextSecurity/);
  assert.match(html, /form\.addEventListener\('submit'/);
  assert.match(html, /input\.readOnly=true/);
  assert.doesNotMatch(html, /submitValue\.value=input\.value/);
});

test("admin login preserves the canonical next route, no-store policy, and deploy marker", async () => {
  const response = await render();
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, private, max-age=0");
  assert.equal(response.headers.get("x-mmd-login-ui"), "direct-no-autofill-v2");
  assert.match(html, /name="next" value="\/internal\/admin\/control-room"/);
  assert.match(html, /Secure HttpOnly cookie/);
});
