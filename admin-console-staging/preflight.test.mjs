import assert from "node:assert/strict";
import test from "node:test";
import worker from "./.build/staging.mjs";

const origin = "https://mmd-admin-console-3143-staging.malemodel-bkk.workers.dev";
const env = { ADMIN_LOGIN_CREDENTIAL: "local-owner-test", ADMIN_SESSION_SECRET: "local-session-test" };
const consolePath = "/internal/admin/console?view=create-job";
const create = "/internal/admin/jobs/create-job";

test("staging only accepts its own Owner session, serves the original form, and has no business writes or egress", async () => {
  const originalFetch = globalThis.fetch;
  const outbound = [];
  globalThis.fetch = async (...args) => {
    outbound.push(args[0]);
    throw new Error("Unexpected external fetch");
  };
  try {
    const send = (path, options) => worker.fetch(new Request(origin + path, options), env, {});
    assert.equal((await worker.fetch(new Request("https://mmdbkk.com" + consolePath), env, {})).status, 421);
    assert.equal((await send(consolePath)).status, 303);
    assert.equal((await send(create)).status, 403);

    const login = await send("/internal/admin/login/session", { method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, "X-MMD-Login-Fetch": "1" },
      body: new URLSearchParams({ action: "owner_login", credential: env.ADMIN_LOGIN_CREDENTIAL, next: consolePath }),
    });
    assert.equal(login.status, 200, await login.clone().text());
    assert.equal(login.headers.get("x-mmd-admin-role"), "owner");
    assert.equal((await login.json()).next, consolePath);
    const cookie = login.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly; Secure/);
    assert.doesNotMatch(cookie, /Domain=/i);
    const headers = { cookie: cookie.split(";")[0] };

    const consolePage = await send(consolePath, { headers });
    assert.equal(consolePage.status, 200);
    assert.match(consolePage.headers.get("content-security-policy") || "", /font-src 'self' https:\/\/cdn\.prod\.website-files\.com/);
    assert.equal(consolePage.headers.get("x-content-type-options"), "nosniff");
    const html = await consolePage.text();
    assert.match(html, /id="ac-staging-release-status"/);
    assert.match(html, /PR #3152/);
    assert.match(html, /Smoke/);
    assert.match(html, /6ee6eee7-235c-478e-bd12-3dbda2b3519c/);
    assert.match(html, /class="ac-staging-release__summary"/);
    assert.doesNotMatch(html, /ADMIN_SESSION_SECRET\s*=/);
    assert.doesNotMatch(html, /ADMIN_LOGIN_CREDENTIAL\s*=/);
    const loginPage = await send("/internal/admin/login", { headers });
    assert.doesNotMatch(await loginPage.text(), /id="ac-staging-release-status"/);
    assert.doesNotMatch(html, /https:\/\/(?:www\.)?mmdbkk\.com\/(?:internal\/admin|v1\/admin)/i);
    const form = await send(create, { headers: { ...headers, Referer: origin + consolePath,
      "Sec-Fetch-Dest": "iframe", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "same-origin",
    } });
    assert.equal(form.status, 200);
    assert.equal(form.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.match(await form.text(), /Per Rename/);
    const lookup = await send("/v1/admin/clients/lineage-lookup", { method: "POST", headers,
      body: JSON.stringify({ query: "Fixture Per Rename" }),
    });
    const { records } = await lookup.json();
    assert.equal(records[0].client_id, "recFixtureClient001");
    assert.equal(records[0].per_rename, "Fixture Per Rename");
    assert.equal(records[0].profile_photos.length, 6);
    for (const path of ["/v1/admin/job/create", "/v1/admin/create-job", "/v1/admin/clients/profile-photo/sync", "/v1/confirm/link", "/v1/admin/payments/review-queue"]) {
      assert.equal((await send(path, { method: "POST", headers })).status, 405, path);
    }
    const logout = await send("/internal/admin/login/session", { method: "DELETE", headers });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie") || "", /Max-Age=0/);
    assert.doesNotMatch(logout.headers.get("set-cookie") || "", /Domain=/i);
    assert.equal((await send("/unknown", { headers })).status, 404);
    assert.deepEqual(outbound, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
