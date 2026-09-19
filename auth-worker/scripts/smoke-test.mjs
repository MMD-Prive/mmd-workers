#!/usr/bin/env node

const baseUrl = normalizeBaseUrl(process.env.AUTH_WORKER_BASE_URL);
const testIdentity = String(process.env.TEST_IDENTITY || "").trim();

if (!baseUrl || !testIdentity) {
  console.error("Usage: AUTH_WORKER_BASE_URL=https://auth.example.com TEST_IDENTITY=test@example.com node auth-worker/scripts/smoke-test.mjs");
  process.exit(2);
}

const steps = [];

try {
  await step("GET /ping", async () => {
    const { response, data } = await request("/ping");
    assert(response.ok, `expected 2xx, got ${response.status}`);
    assert(data?.ok === true, "expected ok=true");
  });

  await step("GET /v1/auth/me unauthenticated", async () => {
    const { response, data } = await request("/v1/auth/me");
    assert(response.status === 401, `expected 401, got ${response.status}`);
    assert(data?.authenticated === false, "expected authenticated=false");
  });

  let devCode = "";
  await step("POST /v1/auth/request-code", async () => {
    const { response, data } = await request("/v1/auth/request-code", {
      method: "POST",
      body: { identifier: testIdentity },
    });
    assert(response.ok, `expected 2xx, got ${response.status}`);
    assert(data?.ok === true, "expected ok=true");
    assert(/^\d{6}$/.test(String(data?.dev_code || "")), "expected 6-digit dev_code; confirm MMD_AUTH_DEV_MODE=true");
    devCode = data.dev_code;
  });

  let sessionCookie = "";
  await step("POST /v1/auth/verify-code", async () => {
    const { response, data, setCookie } = await request("/v1/auth/verify-code", {
      method: "POST",
      body: { identifier: testIdentity, code: devCode },
    });
    assert(response.ok, `expected 2xx, got ${response.status}`);
    assert(data?.ok === true, "expected ok=true");
    sessionCookie = cookieHeaderFromSetCookie(setCookie);
    assert(sessionCookie, "expected Set-Cookie session header");
  });

  await step("GET /v1/auth/me with cookie", async () => {
    const { response, data } = await request("/v1/auth/me", {
      headers: { Cookie: sessionCookie },
    });
    assert(response.ok, `expected 2xx, got ${response.status}`);
    assert(data?.ok === true, "expected ok=true");
    assert(data?.authenticated === true, "expected authenticated=true");
    assert(data?.profile, "expected profile");
    assert(data.profile.member_id, "expected profile.member_id");
    assert(data.profile.status, "expected profile.status");
    assert(Array.isArray(data.profile.entitlements), "expected profile.entitlements array");
    assert(Array.isArray(data.profile.grants), "expected profile.grants array");
  });

  await step("GET /v1/auth/me grants shape", async () => {
    const { response, data } = await request("/v1/auth/me", {
      headers: { Cookie: sessionCookie },
    });
    assert(response.ok, `expected 2xx, got ${response.status}`);
    assert(data?.authenticated === true, "expected authenticated=true");
    assert(Array.isArray(data?.profile?.grants), "expected grants array");
  });

  await step("POST /v1/auth/logout", async () => {
    const { response, data } = await request("/v1/auth/logout", {
      method: "POST",
      headers: { Cookie: sessionCookie },
    });
    assert(response.ok, `expected 2xx, got ${response.status}`);
    assert(data?.ok === true, "expected ok=true");
  });

  await step("GET /v1/auth/me after logout", async () => {
    const { response, data } = await request("/v1/auth/me", {
      headers: { Cookie: sessionCookie },
    });
    assert(response.status === 401, `expected 401, got ${response.status}`);
    assert(data?.authenticated === false, "expected authenticated=false");
  });

  for (const item of steps) {
    console.log(`PASS ${item}`);
  }
} catch (error) {
  for (const item of steps) {
    console.log(`PASS ${item}`);
  }
  console.error(`FAIL ${error.message}`);
  process.exit(1);
}

async function step(name, fn) {
  await fn();
  steps.push(name);
}

async function request(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };
  const init = {
    method: options.method || "GET",
    headers,
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  const data = parseJson(text);

  if (!response.ok && !data) {
    throw new Error(`${init.method} ${path} returned ${response.status}`);
  }

  return {
    response,
    data,
    setCookie: getSetCookie(response.headers),
  };
}

function getSetCookie(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie().join(", ");
  }
  return headers.get("set-cookie") || "";
}

function cookieHeaderFromSetCookie(setCookie) {
  const firstCookie = String(setCookie || "").split(/,(?=\s*[^;,]+=)/)[0] || "";
  const cookiePair = firstCookie.split(";")[0].trim();
  return cookiePair && cookiePair.includes("=") ? cookiePair : "";
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  return raw ? raw.replace(/\/+$/, "") : "";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
