import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "canonical-admin-login-"));
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

async function call(path, init, host = "mmdbkk.com", env = {}) {
  return worker.fetch(new Request(`https://${host}${path}`, init), env);
}

try {
  for (const path of [
    "/sigil/admin/login?abc=123",
    "/sigil/internal/admin/login?abc=123",
    "/admin/login?abc=123",
  ]) {
    const response = await call(path);
    assert.equal(response.status, 308, path);
    assert.equal(response.headers.get("location"), `https://mmdbkk.com/internal/admin/login${new URL(`https://mmdbkk.com${path}`).search}`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-mmd-admin-login-canonical"), "/internal/admin/login");
    assert.equal(await response.text(), "");
  }

  const head = await call("/sigil/admin/login?abc=123", { method: "HEAD" });
  assert.equal(head.status, 308);
  assert.equal(head.headers.get("location"), "https://mmdbkk.com/internal/admin/login?abc=123");
  assert.equal(await head.text(), "");

  const post = await call("/sigil/admin/login", { method: "POST", body: "gate_code=secret" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  assert.equal(post.headers.get("set-cookie"), null);
  assert.deepEqual(await post.json(), {
    ok: false,
    error: "legacy_admin_login_method_not_allowed",
    canonical_login: "/internal/admin/login",
  });

  for (const [legacyPath, canonicalPath] of [
    ["/sigil/admin", "/internal/admin/dashboard"],
    ["/sigil/admin/dashboard", "/internal/admin/dashboard"],
    ["/sigil/admin/control-room", "/internal/admin/control-room"],
  ]) {
    const response = await call(`${legacyPath}?source=legacy`);
    assert.equal(response.status, 308, legacyPath);
    assert.equal(response.headers.get("location"), `https://mmdbkk.com${canonicalPath}?source=legacy`);
    assert.equal(response.headers.get("x-mmd-admin-canonical"), canonicalPath);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), "");

    const headResponse = await call(legacyPath, { method: "HEAD" });
    assert.equal(headResponse.status, 308, `${legacyPath} HEAD`);
    assert.equal(await headResponse.text(), "");

    const postResponse = await call(legacyPath, { method: "POST", body: "unsafe=1" });
    assert.equal(postResponse.status, 405, `${legacyPath} POST`);
    assert.equal(postResponse.headers.get("set-cookie"), null);
    assert.deepEqual(await postResponse.json(), {
      ok: false,
      error: "legacy_admin_browser_method_not_allowed",
      canonical_path: canonicalPath,
    });
  }

  const protectedControlRoom = await call("/internal/admin/control-room?view=live");
  assert.ok(protectedControlRoom.status >= 300 && protectedControlRoom.status < 400);
  const protectedLocation = new URL(protectedControlRoom.headers.get("location"));
  assert.equal(protectedLocation.pathname, "/internal/admin/login");
  assert.equal(protectedLocation.searchParams.get("next"), "/internal/admin/control-room?view=live");
  assert.equal(protectedControlRoom.headers.get("x-mmd-admin-login-canonical"), "/internal/admin/login");
  assert.equal(protectedControlRoom.headers.get("cache-control"), "no-store");

  const distinctSigilControlRoom = await call("/sigil/control-room");
  assert.notEqual(distinctSigilControlRoom.status, 308);
  assert.notEqual(distinctSigilControlRoom.headers.get("x-mmd-admin-canonical"), "/internal/admin/control-room");

  const assetEnv = {
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        assert.equal(url.pathname, "/a/create-session.js");
        assert.equal(url.search, "");
        return new Response('const flow_version = "mmd_sigil_create_session_external_js_v3";', {
          status: 200,
          headers: { "content-type": "application/javascript" },
        });
      },
    },
  };

  const core = await call("/internal/admin/jobs/create-session/core", undefined, "mmdbkk.com", assetEnv);
  assert.equal(core.status, 200);
  assert.equal(core.headers.get("content-type"), "application/javascript; charset=utf-8");
  assert.equal(core.headers.get("cache-control"), "no-store");
  assert.equal(core.headers.get("x-mmd-create-session-core"), "worker-owned");
  assert.equal(core.headers.get("x-mmd-create-session-core-route"), "extensionless-v1");
  assert.equal(core.headers.get("x-mmd-create-session-business"), "mmd");
  assert.match(await core.text(), /mmd_sigil_create_session_external_js_v3/);

  const coreHead = await call("/internal/admin/jobs/create-session/core", { method: "HEAD" }, "www.mmdbkk.com", assetEnv);
  assert.equal(coreHead.status, 200);
  assert.equal(coreHead.headers.get("x-mmd-create-session-core"), "worker-owned");
  assert.equal(await coreHead.text(), "");

  const corePost = await call(
    "/internal/admin/jobs/create-session/core",
    { method: "POST", body: "nope=1" },
    "mmdbkk.com",
    assetEnv,
  );
  assert.equal(corePost.status, 405);
  assert.equal(corePost.headers.get("allow"), "GET, HEAD");
  assert.equal(corePost.headers.get("x-mmd-create-session-business"), "mmd");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
