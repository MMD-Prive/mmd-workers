import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import worker from "./src/admin-login-hero-worker.js";
import { renderApprovedAdminLogin } from "./src/admin-login-page.js";
import {
  createCredentialBoundAdminSession,
  readCredentialBoundAdminActor,
  readCredentialBoundAdminLoginReason,
} from "./src/credential-bound-admin-session.js";

const origin = "https://mmdbkk.com";
const staging = "https://mmd-admin-console-3143-staging.malemodel-bkk.workers.dev";
const path = "/internal/admin/login";
const next = "/internal/admin/console?view=create-job";
const env = { ADMIN_LOGIN_CREDENTIAL: "fixture-owner-only", ADMIN_SESSION_SECRET: "fixture-session-only" };
const ttl = 8 * 60 * 60 * 1000;
const request = (cookie = "", suffix = "") => new Request(origin + path + suffix, { headers: { Cookie: cookie } });

async function session(age = 0) {
  const now = Date.now;
  try {
    const issuedAt = now() - age;
    Date.now = () => issuedAt;
    const token = await createCredentialBoundAdminSession(request(), { id: "per", role: "owner" }, env);
    return `mmd_admin_gate_v1=${token}`;
  } finally { Date.now = now; }
}

for (const [host, label] of [[origin, "Production"], ["https://www.mmdbkk.com", "Production"], [staging, "Staging"], ["http://localhost:8787", "Preview"], ["https://mmdbkk.com.example.test", "Preview"]]) {
  test(`login labels ${host} as ${label} without trusting query or forwarded host`, async () => {
    const response = renderApprovedAdminLogin(new Request(host + path + "?environment=Production", {
      headers: { "X-Forwarded-Host": "mmdbkk.com" },
    }));
    const html = await response.text();
    assert.ok(html.includes(`data-environment="${label}"`));
    assert.ok(html.includes(`Owner Password · ${label}`));
    assert.ok(html.includes(`<small>${new URL(host).host}</small>`));
    const canonical = host === "https://www.mmdbkk.com" ? origin : host;
    assert.equal(response.headers.get("x-mmd-admin-origin"), canonical);
    assert.ok(html.includes(`rel="canonical" href="${canonical}${path}"`));
  });
}

test("valid Owner sessions remain Owner, expire at eight hours, and are not renewed by login rendering", async () => {
  const cookie = await session();
  const actor = await readCredentialBoundAdminActor(request(cookie), env);
  assert.equal(actor.role, "owner");
  assert.equal(actor.exp - actor.iat, ttl);
  assert.equal(await readCredentialBoundAdminLoginReason(request(cookie), env), "");
  const response = await worker.fetch(request(cookie), env, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.doesNotMatch(await response.text(), /id="sessionNotice"/);
});

test("a verified expired session shows expiry separately while access remains denied", async () => {
  const cookie = await session(ttl + 60_000);
  assert.equal(await readCredentialBoundAdminActor(request(cookie), env), null);
  assert.equal(await readCredentialBoundAdminLoginReason(request(cookie), env), "session_expired");
  const response = await worker.fetch(request(cookie, `?next=${encodeURIComponent(next)}`), env, {});
  const html = await response.text();
  assert.match(html, /เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบอีกครั้งด้วยรหัสเดิม/);
  assert.ok(html.includes(`name="next" value="${next}"`));
  assert.equal(response.headers.get("set-cookie"), null);
  const denied = await worker.fetch(new Request(origin + "/v1/admin/auth/me", { headers: { Cookie: cookie } }), env, {});
  assert.equal(denied.status, 401);
});

test("missing, tampered, wrong-host and rotated-credential cookies cannot claim verified expiry", async () => {
  const expired = await session(ttl + 60_000);
  const changedSignature = expired.slice(0, -1) + (expired.endsWith("A") ? "B" : "A");
  for (const cookie of ["", "mmd_admin_gate_v1=invalid", changedSignature]) {
    assert.equal(await readCredentialBoundAdminLoginReason(request(cookie), env), "session_required");
    assert.equal(await readCredentialBoundAdminActor(request(cookie), env), null);
  }
  assert.equal(await readCredentialBoundAdminLoginReason(request(expired), { ...env, ADMIN_LOGIN_CREDENTIAL: "different-fixture" }), "session_required");
  const wrongHost = new Request(staging + path, { headers: { Cookie: expired } });
  assert.equal(await readCredentialBoundAdminLoginReason(wrongHost, env), "session_required");
  const response = await worker.fetch(request("", "?reason=session_expired&error=untrusted-message"), env, {});
  const html = await response.text();
  assert.match(html, /กรุณาเข้าสู่ระบบอีกครั้ง หากเซสชันหมดอายุ/);
  assert.doesNotMatch(html, /เซสชันหมดอายุแล้ว|untrusted-message/);
});

test("a valid duplicate cookie takes precedence over an expired cookie", async () => {
  const expired = await session(ttl + 60_000);
  const valid = await session();
  for (const cookie of [`${expired}; ${valid}`, `${valid}; ${expired}`]) {
    assert.equal(await readCredentialBoundAdminLoginReason(request(cookie), env), "");
    assert.equal((await readCredentialBoundAdminActor(request(cookie), env)).role, "owner");
  }
});

test("native form login keeps same-origin checks, Owner role, return path and cookie lifetime", async () => {
  const send = (credential, from = origin) => worker.fetch(new Request(origin + path + "/session", {
    method: "POST", headers: { Origin: from, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ action: "owner_login", username: "Owner · Production", credential, next }),
  }), env, {});
  const success = await send(env.ADMIN_LOGIN_CREDENTIAL);
  assert.equal(success.status, 303);
  assert.equal(success.headers.get("x-mmd-admin-role"), "owner");
  assert.equal(success.headers.get("location"), origin + next);
  assert.match(success.headers.get("set-cookie"), /Max-Age=28800; HttpOnly; Secure; SameSite=Lax/);
  const wrong = await send("incorrect-fixture");
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get("set-cookie"), null);
  const html = await wrong.text();
  assert.match(html, /รหัสยังไม่ถูกต้อง/);
  assert.doesNotMatch(html, /id="sessionNotice"|incorrect-fixture/);
  assert.equal((await send(env.ADMIN_LOGIN_CREDENTIAL, "https://foreign.example")).status, 403);
});

async function browser({ status = 401, error = "invalid_access_code", reason = "session_expired" } = {}) {
  const html = await renderApprovedAdminLogin(request(), { next, reason }).text();
  // Scripts run only after simulated Password Manager autofill. No resources or
  // network are loaded; fetch below is an in-memory login response.
  const dom = new JSDOM(html, { url: origin + path, runScripts: "outside-only" });
  const { window } = dom;
  const input = window.document.getElementById("adminCredential");
  input.value = "autofilled-fixture-password";
  const calls = [];
  window.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ ok: false, error }, { status });
  };
  for (const script of window.document.scripts) if (!script.src) window.eval(script.textContent);
  return { dom, window, input, calls };
}

test("Password Manager value survives initialization, lane changes, reveal and mocked submit", async () => {
  const { dom, window, input, calls } = await browser();
  try {
    const doc = window.document;
    assert.equal(input.type, "password");
    assert.equal(input.autocomplete, "current-password");
    assert.equal(input.readOnly, false);
    assert.equal(input.value, "autofilled-fixture-password");
    doc.querySelector('[data-lane="partner"]').click();
    doc.querySelector('[data-lane="owner"]').click();
    const toggle = doc.querySelector('[data-toggle="adminCredential"]');
    toggle.click();
    assert.equal(input.type, "text");
    assert.equal(toggle.getAttribute("aria-pressed"), "true");
    toggle.click();
    assert.equal(input.type, "password");
    assert.equal(input.value, "autofilled-fixture-password");
    doc.getElementById("ownerLoginForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, path + "/session");
    assert.equal(calls[0].options.credentials, "same-origin");
    const body = new URLSearchParams(calls[0].options.body);
    assert.equal(body.get("credential"), "autofilled-fixture-password");
    assert.equal(body.get("next"), next);
    assert.match(doc.getElementById("ownerMessage").textContent, /รหัส Owner ไม่ถูกต้องสำหรับ Production/);
    assert.equal(doc.getElementById("sessionNotice").hidden, true);
    assert.equal(window.localStorage.length, 0);
    assert.equal(window.sessionStorage.length, 0);
    assert.equal(doc.cookie, "");
  } finally { dom.window.close(); }
});

test("mocked unavailable login is not described as a wrong password", async () => {
  const { dom, window } = await browser({ status: 503, error: "admin_session_secret_missing" });
  try {
    window.document.getElementById("ownerLoginForm").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await new Promise(resolve => setImmediate(resolve));
    const message = window.document.getElementById("ownerMessage").textContent;
    assert.match(message, /ยังไม่พร้อม/);
    assert.doesNotMatch(message, /รหัส Owner ไม่ถูกต้อง/);
  } finally { dom.window.close(); }
});
