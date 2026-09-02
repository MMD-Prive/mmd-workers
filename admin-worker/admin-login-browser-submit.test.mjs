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

test("admin login exposes one canonical password field for secure browser submission", async () => {
  const html = await (await render()).text();

  assert.match(html, /<form[^>]*id="adminLoginForm"[^>]*autocomplete="off"/);
  assert.match(html, /id="adminCredential" name="credential" type="password"/);
  assert.match(html, /id="adminCredential"[^>]*autocomplete="current-password"/);
  assert.doesNotMatch(html, /adminCredentialSubmit/);
  assert.doesNotMatch(html, /type="hidden" name="credential"/);
});

test("admin login submits the canonical credential field without a client-side mirror", async () => {
  const html = await (await render()).text();

  assert.match(html, new RegExp(`action="${ADMIN_LOGIN_SESSION_PATH.replaceAll("/", "\\\\/")}"`));
  assert.match(html, /id="adminCredential" name="credential" type="password" required/);
  assert.match(html, /form\.addEventListener\('submit'/);
  assert.match(html, /input\.readOnly=true/);
  assert.doesNotMatch(html, /submitValue\.value=input\.value/);
});

test("admin login preserves the canonical next route and secure server-side session flow", async () => {
  const response = await render();
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, private, max-age=0");
  assert.match(html, /name="next" value="\/internal\/admin\/control-room"/);
  assert.match(html, /Secure HttpOnly cookie/);
});
