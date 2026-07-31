import test from "node:test";
import assert from "node:assert/strict";

import {
  ADMIN_LOGIN_SESSION_PATH,
  APPROVED_ADMIN_LOGIN_HERO,
  normalizeNext,
  renderAdminLogin,
} from "./src/admin-login-hero-worker.js";

const request = (method = "GET") => new Request("https://www.mmdbkk.com/internal/admin/login", { method });

test("admin login renders the exact approved Chang and Ewvon hero", async () => {
  const response = renderAdminLogin(request());
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, new RegExp(APPROVED_ADMIN_LOGIN_HERO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /alt="Ewvon and Chang in MMD internal administration environment"/);
  assert.match(html, /\.visual img\{[^}]*object-fit:contain;[^}]*object-position:center center;/);
  assert.doesNotMatch(html, /placeholder|default[-_ ]hero/i);
});

test("admin login preserves the canonical secure form contract", async () => {
  const response = renderAdminLogin(request(), {
    next: "/internal/admin/control-room?tab=queue",
  });
  const html = await response.text();

  assert.match(html, new RegExp(`form method="post" action="${ADMIN_LOGIN_SESSION_PATH.replaceAll("/", "\\/")}"`));
  assert.match(html, /name="credential" type="password"/);
  assert.match(html, /name="next" value="\/internal\/admin\/control-room\?tab=queue"/);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.match(response.headers.get("content-security-policy") || "", /img-src https:\/\/cdn\.prod\.website-files\.com/);
  assert.match(response.headers.get("content-security-policy") || "", /form-action 'self'/);
  assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker");
  assert.equal(response.headers.get("x-mmd-page"), "admin-login-approved-hero");
});

test("admin login next route fails closed", () => {
  assert.equal(normalizeNext("https://evil.example/internal/admin/control-room"), "/internal/admin/control-room");
  assert.equal(normalizeNext("//evil.example/internal/admin/control-room"), "/internal/admin/control-room");
  assert.equal(normalizeNext("/internal/admin/control-room?token=secret"), "/internal/admin/control-room");
  assert.equal(normalizeNext("/internal/admin/../../private"), "/internal/admin/control-room");
  assert.equal(normalizeNext("/internal/admin/control-room?tab=queue"), "/internal/admin/control-room?tab=queue");
});

test("HEAD returns headers without a response body", async () => {
  const response = renderAdminLogin(request("HEAD"));
  assert.equal(await response.text(), "");
  assert.match(response.headers.get("cache-control") || "", /no-store/);
});
