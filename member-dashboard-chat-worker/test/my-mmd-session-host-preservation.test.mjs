import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalMyMmdHostRedirect } from "../src/my-mmd-bounded-status-front-gate.js";

const SESSION_COOKIE = "__Host-mmd_liff_session";

test("apex My MMD keeps the host when a verified LIFF session cookie already exists", () => {
  const response = canonicalMyMmdHostRedirect(new Request("https://mmdbkk.com/my-mmd/?from=line", {
    headers: { cookie: `${SESSION_COOKIE}=signed-session-token` },
  }));

  assert.equal(response, null);
});

test("legacy apex My MMD path also keeps the host when a LIFF session exists", () => {
  const response = canonicalMyMmdHostRedirect(new Request("https://mmdbkk.com/member/my-mmd?from=line", {
    headers: { cookie: `${SESSION_COOKIE}=signed-session-token` },
  }));

  assert.equal(response, null);
});

test("unauthenticated apex My MMD still canonicalizes to www", () => {
  const response = canonicalMyMmdHostRedirect(new Request("https://mmdbkk.com/my-mmd/?from=public"));

  assert.ok(response);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://www.mmdbkk.com/my-mmd/?from=public");
});

test("www My MMD is never redirected by the apex compatibility gate", () => {
  const response = canonicalMyMmdHostRedirect(new Request("https://www.mmdbkk.com/my-mmd/", {
    headers: { cookie: `${SESSION_COOKIE}=signed-session-token` },
  }));

  assert.equal(response, null);
});
