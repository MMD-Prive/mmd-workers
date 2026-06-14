import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "sigil-admin-login-"));
const outfile = join(tmp, "worker.mjs");

await build({
  entryPoints: ["src/index.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  conditions: ["worker", "browser"],
  target: "es2022",
});

const worker = (await import(pathToFileURL(outfile).href)).default;
const env = {};

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

async function call(path, init) {
  return worker.fetch(new Request(`https://mmdbkk.com${path}`, init), env);
}

try {
  {
    const response = await call("/sigil/admin/login");
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "immigrate-worker");
    assert.equal(response.headers.get("x-mmd-page"), "sigil-admin-login");
    assert.match(html, /class="sigil-admin-login-v1"/);
    assert.match(html, /Gate Code \/ OTP/);
    assert.match(html, /method="post" action="\/sigil\/admin\/login"/);
    assert.match(html, /name="gate_code"/);
    assert.doesNotMatch(html, /localStorage|sessionStorage|\?mock|name="token"/);
  }

  {
    const form = new FormData();
    form.set("gate_code", "wrong");
    form.set("next", "/sigil/admin/dashboard");
    const response = await call("/sigil/admin/login", { method: "POST", body: form });
    const html = await response.text();
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(html, /Unable to verify SIGIL admin access/);
  }

  {
    const form = new FormData();
    form.set("gate_code", "valid-gate");
    form.set("next", "/sigil/admin/control-room");
    const response = await call("/sigil/admin/login", { method: "POST", body: form });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/sigil/admin/control-room");
    const cookie = response.headers.get("set-cookie") || "";
    assert.match(cookie, /mmd_admin_gate_v1=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
  }

  for (const next of [
    "https://evil.example/sigil/admin/control-room",
    "//evil.example/sigil/admin/control-room",
    "/member/login",
    "/pay/membership",
    "/trust/inme",
  ]) {
    const form = new FormData();
    form.set("gate_code", "valid-gate");
    form.set("next", next);
    const response = await call("/sigil/admin/login", { method: "POST", body: form });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/sigil/admin/dashboard");
  }

  {
    const response = await call("/member/login");
    assert.notEqual(response.status, 302);
    assert.notEqual(response.headers.get("location"), "/sigil/admin/login");
  }

  {
    const response = await call("/pay/membership");
    assert.notEqual(response.status, 302);
    assert.notEqual(response.headers.get("location"), "/sigil/admin/login");
  }

  {
    const response = await call("/admin/login?next=/sigil/admin/control-room");
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://mmdbkk.com/sigil/admin/login?next=%2Fsigil%2Fadmin%2Fcontrol-room");
  }

  {
    const response = await call("/internal/admin/control-room");
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://mmdbkk.com/sigil/admin/control-room");
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}
