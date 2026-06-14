import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const workerBundle = resolve(here, "../.tmp/sigil-admin-login-worker.mjs");
mkdirSync(dirname(workerBundle), { recursive: true });

await build({
  entryPoints: [resolve(here, "../src/index.ts")],
  outfile: workerBundle,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
});

const worker = (await import(pathToFileURL(workerBundle).href + `?v=${Date.now()}`)).default;

function bytesToBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function passwordHash(password) {
  const salt = new Uint8Array(16);
  salt.set([11, 23, 37, 41, 53, 67, 79, 83, 97, 101, 113, 127, 131, 149, 157, 163]);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
    key,
    256,
  );
  return `pbkdf2-sha256$100000$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(bits))}`;
}

const env = {
  INTERNAL_TOKEN: "test-internal",
  ADMIN_SESSION_SECRET: "test-admin-session-secret",
  AIRTABLE_API_KEY: "test-airtable",
  AIRTABLE_BASE_ID: "appTest",
  AIRTABLE_TABLE_ADMIN_USERS: "Admin Users",
  AIRTABLE_TABLE_ADMIN_INVITES: "Admin Invites",
  AIRTABLE_TABLE_ADMIN_OTP_CHALLENGES: "Admin OTP",
  AIRTABLE_TABLE_ADMIN_SESSIONS: "Admin Sessions",
  AIRTABLE_TABLE_ACTIVITY_LOGS: "Activity Logs",
};

const adminUser = {
  id: "recAdminUser",
  fields: {
    Username: "operator",
    Email: "operator@mmdbkk.test",
    Status: "active",
    "Password Hash": await passwordHash("correct horse battery staple"),
    "Failed Login Count": 0,
  },
};

let latestSession = null;
const originalFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function airtableTableName(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] || "");
}

globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(String(input), init);
  const url = new URL(request.url);
  if (url.hostname !== "api.airtable.com") {
    return originalFetch(request);
  }

  const table = airtableTableName(url);
  const body = request.method === "POST" || request.method === "PATCH"
    ? await request.json().catch(() => ({}))
    : {};

  if (request.method === "GET" && table === "Admin Users") {
    const formula = decodeURIComponent(url.searchParams.get("filterByFormula") || "");
    return jsonResponse({ records: formula.includes("operator") ? [adminUser] : [] });
  }

  if (request.method === "GET" && table === "Admin Sessions") {
    const formula = decodeURIComponent(url.searchParams.get("filterByFormula") || "");
    const hash = latestSession?.fields?.["Session Token Hash"] || "";
    return jsonResponse({ records: hash && formula.includes(hash) ? [latestSession] : [] });
  }

  if (request.method === "POST" && table === "Admin Sessions") {
    latestSession = {
      id: "recAdminSession",
      fields: body.fields,
    };
    return jsonResponse(latestSession);
  }

  if (request.method === "POST" && table === "Activity Logs") {
    return jsonResponse({ id: `recActivity${Date.now()}`, fields: body.fields || {} });
  }

  if (request.method === "PATCH") {
    return jsonResponse({ id: "recPatched", fields: body.fields || {} });
  }

  return jsonResponse({ records: [] });
};

async function call(path, init = {}) {
  return worker.fetch(new Request(`https://sigil.mmdbkk.com${path}`, init), env);
}

try {
  {
    const response = await call("/sigil/admin/login");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "immigrate-worker");
    assert.equal(response.headers.get("x-mmd-page"), "sigil-admin-login");
    assert.match(html, /sigil-admin-login/);
    assert.match(html, /Gate Code \/ OTP/);
    assert.match(html, /name="gate_code"/);
    assert.doesNotMatch(html, /name=["']token["']/);
    assert.doesNotMatch(html, /gate_token/);
    assert.doesNotMatch(html, /localStorage/);
    assert.doesNotMatch(html, /\?mock/);
  }

  {
    const body = new URLSearchParams({ identity: "operator", password: "wrong" });
    const response = await call("/sigil/admin/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const html = await response.text();

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(html, /Invalid username or password/);
    assert.doesNotMatch(html, /wrong/);
  }

  {
    const body = new URLSearchParams({
      identity: "operator",
      password: "correct horse battery staple",
      gate_code: "123456",
      next: "/sigil/admin/dashboard?view=ops",
    });
    const response = await call("/sigil/admin/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const cookie = response.headers.get("set-cookie") || "";

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/sigil/admin/dashboard?view=ops");
    assert.match(cookie, /mmd_sigil_admin_session=/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);

    const me = await call("/sigil/admin/auth/me", { headers: { cookie } });
    const meBody = await me.json();
    assert.equal(me.status, 200);
    assert.equal(meBody.ok, true);
    assert.equal(meBody.admin_user_record_id, "recAdminUser");
  }

  for (const next of ["https://evil.example/sigil/admin/dashboard", "//evil.example/sigil/admin/dashboard", "/member/dashboard", "/pay/membership", "/trust/inme"]) {
    const body = new URLSearchParams({
      identity: "operator",
      password: "correct horse battery staple",
      next,
    });
    const response = await call("/sigil/admin/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    assert.equal(response.status, 302, next);
    assert.equal(response.headers.get("location"), "/sigil/admin/control-room", next);
  }

  {
    const response = await call("/member/login");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-page"), "member-login");
    assert.match(html, /MMD SĪGIL Member Access/);
  }

  {
    const response = await call("/pay/membership");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    assert.match(html, /MMD SIGIL Payment/);
  }

  const webflowJs = readFileSync(resolve(here, "../../../webflow/sigil/admin/login/admin-login.js"), "utf8");
  assert.doesNotMatch(webflowJs, /localStorage/);
  assert.doesNotMatch(webflowJs, /\?mock/);
  assert.doesNotMatch(webflowJs, /gate_token/);

  console.log("sigil admin login checks passed");
} finally {
  globalThis.fetch = originalFetch;
}
