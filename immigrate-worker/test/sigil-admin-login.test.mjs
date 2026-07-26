import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "sigil-admin-login-"));
const outfile = join(tmp, "worker.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [join(workerRoot, "src/canonical-admin-login-wrapper.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  conditions: ["worker", "browser"],
  target: "es2022",
});

const worker = (await import(pathToFileURL(outfile).href)).default;
const env = {};
const bindingCalls = [];
const bridgeEnv = {
  ADMIN_WORKER: {
    fetch: async (request) => {
      bindingCalls.push(request);
      return new Response(JSON.stringify({ ok: true, authenticated: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  },
};

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.pathname === "/v1/admin/ping") {
    const authorization = new Headers(init.headers).get("authorization") || "";
    return new Response(JSON.stringify({ ok: authorization === "Bearer valid-gate" }), {
      status: authorization === "Bearer valid-gate" ? 200 : 401,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response("<!doctype html><title>control</title>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

async function call(path, init, host = "mmdbkk.com") {
  return worker.fetch(new Request(`https://${host}${path}`, init), env);
}

try {
  for (const legacyPath of [
    "/sigil/admin/login?abc=123&next=%2Finternal%2Fadmin%2Fcontrol-room",
    "/sigil/internal/admin/login?abc=123",
    "/admin/login?abc=123",
  ]) {
    const response = await call(legacyPath);
    assert.equal(response.status, 308, legacyPath);
    assert.equal(
      response.headers.get("location"),
      `https://mmdbkk.com/internal/admin/login${new URL(`https://mmdbkk.com${legacyPath}`).search}`,
      legacyPath,
    );
    assert.equal(response.headers.get("cache-control"), "no-store", legacyPath);
    assert.equal(response.headers.get("x-mmd-admin-login-canonical"), "/internal/admin/login", legacyPath);
    assert.equal(await response.text(), "", legacyPath);
  }

  {
    const response = await call("/sigil/admin/login?abc=123", { method: "HEAD" });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), "https://mmdbkk.com/internal/admin/login?abc=123");
    assert.equal(await response.text(), "");
  }

  {
    const form = new FormData();
    form.set("gate_code", "valid-gate");
    form.set("next", "/internal/admin/control-room");
    const response = await call("/sigil/admin/login", { method: "POST", body: form });
    const body = await response.json();
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(body.ok, false);
    assert.equal(body.error, "legacy_admin_login_method_not_allowed");
    assert.equal(body.canonical_login, "/internal/admin/login");
  }

  {
    const response = await call("/member/login");
    assert.notEqual(response.status, 308);
    assert.notEqual(response.headers.get("location"), "https://mmdbkk.com/internal/admin/login");
  }

  {
    const response = await call("/pay/membership");
    assert.notEqual(response.status, 308);
    assert.notEqual(response.headers.get("location"), "https://mmdbkk.com/internal/admin/login");
  }

  {
    const response = await call("/member/dashboard?t=abc&code=gold&promo=vip&debug=recovery");
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "immigrate-worker");
    assert.equal(response.headers.get("x-mmd-page"), "member-dashboard");
    assert.match(html, /Member Home \/ Status Hub/);
    assert.ok(html.includes("/member/membership?t=abc&amp;code=gold&amp;promo=vip&amp;debug=recovery"));
    assert.doesNotMatch(html, /name="token"/);
  }

  {
    const response = await call("/member/membership?t=abc&code=gold&promo=vip&debug=recovery");
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "immigrate-worker");
    assert.equal(response.headers.get("x-mmd-page"), "member-membership");
    assert.match(html, /Choose your private access/);
    assert.ok(html.includes("/member/dashboard?t=abc&amp;code=gold&amp;promo=vip&amp;debug=recovery"));
    assert.ok(html.includes("/pay/membership?t=abc&amp;code=gold&amp;promo=vip&amp;debug=recovery"));
    assert.doesNotMatch(html, /name="token"/);
  }

  {
    const response = await call("/internal/admin/control-room");
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/internal/admin/login?next=%2Finternal%2Fadmin%2Fcontrol-room");
  }

  {
    bindingCalls.length = 0;
    const response = await worker.fetch(new Request("https://mmdbkk.com/internal/admin/jobs/create-session", {
      headers: { cookie: "mmd_admin_gate_v1=signed-test-cookie" },
    }), bridgeEnv);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Create Session/);
    assert.equal(bindingCalls.length, 1);
    assert.equal(bindingCalls[0].url, "https://mmdbkk.com/v1/admin/auth/me");
    assert.equal(bindingCalls[0].headers.get("x-mmd-auth-bridge"), "immigrate-internal-admin-gate");
    assert.equal(bindingCalls[0].headers.get("x-mmd-public-host"), "mmdbkk.com");
  }

  {
    bindingCalls.length = 0;
    const response = await worker.fetch(new Request("https://www.mmdbkk.com/v1/admin/models/search?query=test", {
      headers: {
        accept: "application/json",
        authorization: "Bearer should-not-forward",
        cookie: "mmd_admin_gate_v1=signed-test-cookie",
      },
    }), bridgeEnv);
    assert.equal(response.status, 200);
    assert.equal(bindingCalls.length, 1);
    assert.equal(bindingCalls[0].url, "https://www.mmdbkk.com/v1/admin/models/search?query=test");
    assert.equal(bindingCalls[0].headers.get("authorization"), null);
    assert.equal(bindingCalls[0].headers.get("cookie"), "mmd_admin_gate_v1=signed-test-cookie");
    assert.equal(bindingCalls[0].headers.get("x-mmd-auth-bridge"), "immigrate-internal-admin-api");
    assert.equal(bindingCalls[0].headers.get("x-mmd-public-host"), "www.mmdbkk.com");
  }

  {
    bindingCalls.length = 0;
    const payload = JSON.stringify({ session_id: "sess_public_safe", amount_thb: 9000, source: "test" });
    const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/create-job?source=worker-page", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer should-not-forward",
        cookie: "mmd_admin_gate_v1=signed-test-cookie",
      },
      body: payload,
    }), bridgeEnv);
    assert.equal(response.status, 200);
    assert.equal(bindingCalls.length, 1);
    assert.equal(bindingCalls[0].url, "https://mmdbkk.com/v1/admin/job/create?source=worker-page");
    assert.equal(bindingCalls[0].method, "POST");
    assert.equal(bindingCalls[0].headers.get("authorization"), null);
    assert.equal(bindingCalls[0].headers.get("content-type"), "application/json");
    const forwardedPayload = JSON.parse(await bindingCalls[0].text());
    assert.equal(forwardedPayload.session_id, "sess_public_safe");
    assert.equal(forwardedPayload.client_name, "sess_public_safe");
    assert.equal(forwardedPayload.model_name, "model_pending");
    assert.equal(forwardedPayload.job_type, "public_work");
    assert.equal(forwardedPayload.job_date, "pending_date");
    assert.equal(forwardedPayload.start_time, "00:00");
    assert.equal(forwardedPayload.end_time, "01:30");
    assert.equal(forwardedPayload.location_name, "pending_location");
    assert.equal(forwardedPayload.amount_thb, 9000);
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}
