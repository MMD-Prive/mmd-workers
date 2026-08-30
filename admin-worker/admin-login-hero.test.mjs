import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON,
  APPROVED_ADMIN_LOGIN_FAVICON,
  ADMIN_LOGIN_SESSION_PATH,
  APPROVED_ADMIN_LOGIN_HERO,
  APPROVED_ADMIN_LOGIN_LOGO,
  SIGIL_ADMIN_LOGIN_PAGE_PATH,
  normalizeNext,
  renderAdminLogin,
} from "./src/admin-login-hero-worker.js";

const request = (method = "GET") => new Request("https://www.mmdbkk.com/internal/admin/login", { method });

test("admin login renders the approved Webflow visual assets and responsive image treatment", async () => {
  const response = renderAdminLogin(request());
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, new RegExp(APPROVED_ADMIN_LOGIN_HERO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const asset of [APPROVED_ADMIN_LOGIN_HERO, APPROVED_ADMIN_LOGIN_LOGO, APPROVED_ADMIN_LOGIN_FAVICON, APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON]) {
    assert.match(html, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(html, /alt="Internal Admin Chang Ewvon"/);
  assert.match(html, /\.mmd-login21__visual img\{[^}]*object-fit:cover;[^}]*object-position:center;/);
  assert.match(html, /class="mmd-login21" data-mmd-login21/);
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
  assert.doesNotMatch(html, /access_code|\/v1\/admin\/auth\/login|\/kenji\/access-code\/validate/);
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

test("SIGIL admin login renders the approved Worker page without redirecting", async () => {
  const response = await (await import("./src/admin-login-hero-worker.js")).default.fetch(
    new Request(`https://www.mmdbkk.com${SIGIL_ADMIN_LOGIN_PAGE_PATH}`),
    {},
    {}
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.match(html, new RegExp(APPROVED_ADMIN_LOGIN_HERO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("active admin entrypoint forwards Model Console V16 schema-patch routes to core", async () => {
  const activeWorker = (await import("./src/admin-login-hero-worker.js")).default;

  const flash = await activeWorker.fetch(
    new Request("https://mmdbkk.com/v1/model/private-flash/authorize", { method: "GET" }),
    {},
    {}
  );
  assert.equal(flash.status, 401);
  assert.equal((await flash.json()).error, "unauthorized");

  const rate = await activeWorker.fetch(
    new Request("https://mmdbkk.com/v1/model/rate/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model_id: "recModel", rates: { minimum_rate_thb: 5000 } }),
    }),
    {},
    {}
  );
  assert.equal(rate.status, 401);
  assert.equal((await rate.json()).error, "signed_t_required");
});

test("active browser login accepts missing-origin safe browser posts only on allowed hosts", async () => {
  const env = {
    ADMIN_LOGIN_CREDENTIAL: "hero-login-credential",
    ADMIN_SESSION_SECRET: "hero-session-secret",
    ADMIN_BEARER: "hero-api-bearer",
    INTERNAL_TOKEN: "hero-internal-token",
    CONFIRM_KEY: "hero-confirm-key",
    ALLOWED_ORIGINS: "https://mmdbkk.com",
  };

  for (const secFetchSite of [undefined, "same-origin", "none"]) {
    const accepted = await loginRequest(env.ADMIN_LOGIN_CREDENTIAL, env, {
      origin: null,
      secFetchSite,
    });
    assert.equal(accepted.status, 303, `Sec-Fetch-Site ${secFetchSite || "absent"}`);
    assert.match(accepted.headers.get("set-cookie") || "", /^mmd_admin_gate_v1=/);
  }

  for (const secFetchSite of ["cross-site", "same-site"]) {
    const rejected = await loginRequest(env.ADMIN_LOGIN_CREDENTIAL, env, {
      origin: null,
      secFetchSite,
    });
    assert.equal(rejected.status, 403, `Sec-Fetch-Site ${secFetchSite}`);
    assert.equal(rejected.headers.get("set-cookie"), null);
  }

  const disallowedHost = await loginRequest(env.ADMIN_LOGIN_CREDENTIAL, env, {
    host: "evil.example",
    origin: null,
    secFetchSite: "same-origin",
  });
  assert.equal(disallowedHost.status, 403);
  assert.equal(disallowedHost.headers.get("set-cookie"), null);
});

test("active browser login stays bound to ADMIN_LOGIN_CREDENTIAL only", async () => {
  const env = {
    ADMIN_LOGIN_CREDENTIAL: "hero-login-credential",
    ADMIN_SESSION_SECRET: "hero-session-secret",
    ADMIN_BEARER: "hero-api-bearer",
    INTERNAL_TOKEN: "hero-internal-token",
    CONFIRM_KEY: "hero-confirm-key",
    ALLOWED_ORIGINS: "https://mmdbkk.com",
  };

  const valid = await loginRequest(env.ADMIN_LOGIN_CREDENTIAL, env);
  assert.equal(valid.status, 303);
  assert.match(valid.headers.get("set-cookie") || "", /^mmd_admin_gate_v1=/);

  for (const credential of [env.ADMIN_BEARER, env.INTERNAL_TOKEN, env.CONFIRM_KEY]) {
    const rejected = await loginRequest(credential, env);
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers.get("set-cookie"), null);
  }
});

test("wrangler claims only the exact Model Console V16 additive routes on apex and www", () => {
  const wrangler = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
  const routes = [
    "/v1/model/visibility/update",
    "/v1/model/rate/request",
    "/v1/model/media/upload-init",
    "/v1/model/media/upload-complete",
    "/v1/model/media/review-request",
    "/v1/model/private-gallery/request",
    "/v1/model/private-flash/request",
    "/v1/model/private-flash/authorize",
  ];

  for (const route of routes) {
    assert.match(wrangler, new RegExp(`pattern = "mmdbkk\\.com${route}"`));
    assert.match(wrangler, new RegExp(`pattern = "www\\.mmdbkk\\.com${route}"`));
  }
  assert.doesNotMatch(wrangler, /pattern = "(?:www\.)?mmdbkk\.com\/v1\/model\/\*"/);
});

async function loginRequest(
  credential,
  env,
  { host = "mmdbkk.com", origin = `https://${host}`, next = "/internal/admin/control-room", secFetchSite } = {}
) {
  const activeWorker = (await import("./src/admin-login-hero-worker.js")).default;
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (origin !== null) headers.Origin = origin;
  if (secFetchSite !== undefined) headers["Sec-Fetch-Site"] = secFetchSite;

  return activeWorker.fetch(
    new Request(`https://${host}${ADMIN_LOGIN_SESSION_PATH}`, {
      method: "POST",
      headers,
      body: new URLSearchParams({ credential, next }).toString(),
    }),
    env,
    {}
  );
}
