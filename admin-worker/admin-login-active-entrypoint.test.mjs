import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

import worker from "./src/admin-login-hero-worker.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const SESSION = "/internal/admin/login/session";
const NEXT = "/internal/admin/control-room";

function runtimeEnv(env = {}) {
  return {
    ALLOWED_ORIGINS: "https://mmdbkk.com,https://www.mmdbkk.com",
    INTERNAL_TOKEN: "service_internal_token",
    CONFIRM_KEY: "service_confirm_key",
    ...env,
  };
}

function login(credential, env) {
  return worker.fetch(
    new Request(`https://mmdbkk.com${SESSION}`, {
      method: "POST",
      headers: {
        Origin: "https://mmdbkk.com",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ credential, next: NEXT }).toString(),
    }),
    runtimeEnv(env),
    {}
  );
}

function cookiePair(response) {
  return (response.headers.get("set-cookie") || "").split(";", 1)[0];
}

async function authMe(Cookie, env) {
  return worker.fetch(
    new Request("https://mmdbkk.com/v1/admin/auth/me", {
      headers: {
        Origin: "https://mmdbkk.com",
        Cookie,
      },
    }),
    runtimeEnv(env),
    {}
  );
}

test("active entrypoint accepts established ADMIN_BEARER when dedicated browser credential is absent", async () => {
  const response = await login("owner_admin_bearer", {
    ADMIN_BEARER: "owner_admin_bearer",
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), NEXT);
  assert.match(response.headers.get("set-cookie") || "", /^mmd_admin_gate_v1=/);
});

test("dedicated browser credential stays authoritative when configured", async () => {
  const env = {
    ADMIN_BEARER: "owner_admin_bearer",
    ADMIN_LOGIN_CREDENTIAL: "dedicated_browser_code",
    ADMIN_SESSION_SECRET: "dedicated_session_secret",
  };
  const dedicated = await login("dedicated_browser_code", env);
  const bearer = await login("owner_admin_bearer", env);
  assert.equal(dedicated.status, 303);
  assert.equal(bearer.status, 401);
  assert.equal(bearer.headers.get("set-cookie"), null);
});

test("service-only INTERNAL_TOKEN and CONFIRM_KEY are never browser login fallbacks", async () => {
  const base = { ADMIN_BEARER: "owner_admin_bearer" };
  for (const credential of ["service_internal_token", "service_confirm_key"]) {
    const response = await login(credential, base);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("missing browser credential is distinguishable from a wrong credential", async () => {
  const unavailable = await login("anything", {});
  assert.equal(unavailable.status, 503);
  assert.match(await unavailable.text(), /ระบบรหัส Admin ยังไม่พร้อม/);

  const mismatch = await login("wrong", { ADMIN_BEARER: "owner_admin_bearer" });
  assert.equal(mismatch.status, 401);
  assert.match(await mismatch.text(), /รหัสยังไม่ถูกต้อง/);
});

test("dedicated credential without ADMIN_SESSION_SECRET fails closed after credential verification", async () => {
  const response = await login("dedicated_browser_code", {
    ADMIN_LOGIN_CREDENTIAL: "dedicated_browser_code",
    ADMIN_BEARER: "owner_admin_bearer",
  });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /ระบบ session Admin ยังไม่พร้อม/);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("active entrypoint recovers a valid owner session when a duplicate stale cookie also exists", async () => {
  const env = {
    ADMIN_BEARER: "owner_admin_bearer",
    ADMIN_LOGIN_CREDENTIAL: "dedicated_browser_code",
    ADMIN_SESSION_SECRET: "dedicated_session_secret",
  };
  const loginResponse = await login("dedicated_browser_code", env);
  assert.equal(loginResponse.status, 303);
  const validCookie = cookiePair(loginResponse);
  assert.match(validCookie, /^mmd_admin_gate_v1=/);

  const staleCookie = "mmd_admin_gate_v1=legacy-host-only-stale-session";
  for (const Cookie of [
    `${validCookie}; ${staleCookie}`,
    `${staleCookie}; ${validCookie}`,
  ]) {
    const response = await authMe(Cookie, env);
    const body = await response.json();
    assert.equal(response.status, 200, Cookie);
    assert.equal(body.ok, true, Cookie);
    assert.equal(body.authenticated, true, Cookie);
  }
});

test("duplicate invalid admin cookies still fail closed", async () => {
  const env = {
    ADMIN_BEARER: "owner_admin_bearer",
    ADMIN_LOGIN_CREDENTIAL: "dedicated_browser_code",
    ADMIN_SESSION_SECRET: "dedicated_session_secret",
  };
  const response = await authMe(
    "mmd_admin_gate_v1=stale-one; mmd_admin_gate_v1=stale-two",
    env,
  );
  assert.equal(response.status, 401);
});
