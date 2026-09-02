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

test("admin login keeps password managers away from the operator access-code field", async () => {
  const html = await (await render()).text();

  assert.match(html, /<form[^>]*id="adminLoginForm"[^>]*autocomplete="off"/);
  assert.match(html, /id="adminCredential" type="text"/);
  assert.match(html, /id="adminCredential"[^>]*autocomplete="off"/);
  assert.match(html, /id="adminCredential"[^>]*data-1p-ignore="true"/);
  assert.match(html, /id="adminCredential"[^>]*data-lpignore="true"/);
  assert.doesNotMatch(html, /id="adminCredential"[^>]*autocomplete="current-password"/);
});

test("admin login submits only the synchronized hidden canonical credential field", async () => {
  const html = await (await render()).text();

  assert.match(html, new RegExp(`action="${ADMIN_LOGIN_SESSION_PATH.replaceAll("/", "\\/")}"`));
  assert.match(html, /<input id="adminCredentialSubmit" name="credential" type="password" hidden[^>]*value="">/);
  assert.doesNotMatch(html, /id="adminCredential"[^>]*name="credential"/);
  assert.match(html, /submitValue\.value=input\.value/);
  assert.match(html, /form\.addEventListener\('submit'/);
  assert.match(html, /input\.disabled=true/);
});

test("admin login preserves the canonical next route and secure server-side session flow", async () => {
  const response = await render();
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, private, max-age=0");
  assert.match(html, /name="next" value="\/internal\/admin\/control-room"/);
  assert.match(html, /Secure HttpOnly cookie/);
});
