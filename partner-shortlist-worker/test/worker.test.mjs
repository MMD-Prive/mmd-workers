import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import worker from "../src/worker.js";

const page = "https://mmdbkk.com/internal/admin/model-selections";
const cookie = "mmd_admin_gate_v1=fixture.owner.credential";

test("owner page wrapper gates rendering and lookalike routes, with a fixed safe login redirect", async () => {
  let calls = 0;
  const env = { ADMIN: { fetch: async () => { calls++; return Response.json({ ok: false }, { status: 401 }); } } };
  const anonymous = await worker.fetch(new Request(page + "?next=https://evil.example"), env);
  assert.equal(anonymous.status, 303);
  assert.equal(anonymous.headers.get("location"), "/internal/admin/login?next=%2Finternal%2Fadmin%2Fmodel-selections");
  assert.equal(await anonymous.text(), ""); assert.equal(calls, 0);
  const rejected = await worker.fetch(new Request(page, { headers: { cookie } }), env);
  assert.equal(rejected.status, 303); assert.equal(calls, 1);
  const fake = await worker.fetch(new Request(page, { headers: { authorization: "Bearer alternate" } }), env);
  assert.equal(fake.status, 403); assert.equal(calls, 1);
  const lookalike = await worker.fetch(new Request(page + "-other"), env);
  assert.equal(lookalike.status, 404);
  env.ADMIN.fetch = async () => Response.json({ ok: true });
  const malformed = await worker.fetch(new Request(page, { headers: { cookie } }), env);
  assert.equal(malformed.status, 503); assert.doesNotMatch(await malformed.text(), /<!doctype|shortlist-owner/);
});

test("authorized owner page uses fresh matching CSP nonces, no cache, valid script and bodyless HEAD", async () => {
  const env = { BUILD_SHA: "a".repeat(40), ADMIN: { fetch: async request => {
    assert.equal(new URL(request.url).pathname, "/v1/admin/compcards/config");
    assert.equal(request.headers.get("cookie"), cookie);
    return Response.json({ ok: true, drive_roots: [] });
  } } };
  const first = await worker.fetch(new Request(page, { headers: { cookie } }), env);
  assert.equal(first.status, 200); assert.equal(first.headers.get("x-mmd-build"), env.BUILD_SHA);
  assert.match(first.headers.get("cache-control"), /private, no-store/);
  const csp = first.headers.get("content-security-policy"), nonce = csp.match(/script-src 'nonce-([^']+)'/)[1];
  assert.match(csp, /frame-ancestors 'none'/); assert.match(csp, /connect-src 'self'/); assert.doesNotMatch(csp, /unsafe-inline|https:/);
  const html = await first.text();
  const nonces = [...html.matchAll(/<(?:script|style) nonce="([^"]+)"/g)].map(match => match[1]);
  assert.equal(nonces.length, 2); assert.ok(nonces.every(value => value === nonce));
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1]; new Script(script);
  const second = await worker.fetch(new Request(page, { headers: { cookie } }), env);
  assert.notEqual(second.headers.get("content-security-policy"), csp, "each response gets a fresh nonce");
  const head = await worker.fetch(new Request(page, { method: "HEAD", headers: { cookie } }), env);
  assert.equal(head.status, 200); assert.equal(await head.text(), "");
});
