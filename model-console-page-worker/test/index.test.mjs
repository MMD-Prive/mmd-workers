import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

// Load HTML the same way as Wrangler's Text module rule.
const hooks = registerHooks({
  load(url, context, nextLoad) {
    const file = new URL(url);
    if (file.protocol !== "file:" || !file.pathname.endsWith(".html")) {
      return nextLoad(url, context);
    }
    return {
      format: "module",
      shortCircuit: true,
      source: "export default " + JSON.stringify(readFileSync(file, "utf8")),
    };
  },
});
const { default: worker } = await import("../src/index.js");
hooks.deregister();

const expected = {
  candidate: "4aff4a31b418a92501349e446af8ac893b9ff17183355ed20df623c41a4be739",
  rollback: "7dd6e42b4a4dcb292fb4830c8abd134b94ca356a8a9a3d4b5dba51128eae8965",
};
const hosts = ["mmdbkk.com", "www.mmdbkk.com"];
const path = "/sigil/model/console";
const digest = (body) => createHash("sha256").update(body).digest("hex");

test("both production hosts keep the pinned hash across staging changes and staging failure", async (t) => {
  let stage = "staging A";
  let upstreamCalls = 0;
  t.mock.method(globalThis, "fetch", async (request) => {
    upstreamCalls++;
    assert.equal(request.url, "https://mmdprive.webflow.io/sigil/model/console?lang=th");
    if (stage === null) throw new Error("staging offline");
    return new Response(stage);
  });

  const previewRequest = () => new Request("https://console-preview.example" + path + "?lang=th");
  for (stage of ["staging A", "staging B", null]) {
    if (stage === null) await assert.rejects(worker.fetch(previewRequest()), /staging offline/);
    else assert.equal(await (await worker.fetch(previewRequest())).text(), stage);

    for (const host of hosts) {
      const r = await worker.fetch(new Request("https://" + host + path + "?session_id=sess_LOCAL_B&lang=th"));
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("x-mmd-origin"), "pinned-artifact");
      assert.equal(r.headers.get("x-mmd-route-owner"), "model-console-page-worker");
      assert.equal(r.headers.get("cache-control"), "no-store");
      assert.equal(r.headers.get("x-mmd-console-html-sha256"), expected.candidate);
      assert.equal(r.headers.get("content-type"), "text/html; charset=utf-8");
      assert.equal(digest(Buffer.from(await r.arrayBuffer())), expected.candidate);
    }
  }
  assert.equal(upstreamCalls, 3);
});

test("explicit rollback serves the approved prior bytes without calling staging", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", () => { throw new Error("unexpected upstream"); });
  for (const host of hosts) {
    const url = "https://" + host + path;
    const get = await worker.fetch(new Request(url), { CONSOLE_HTML_RELEASE: "rollback" });
    assert.equal(get.status, 200);
    assert.equal(digest(Buffer.from(await get.arrayBuffer())), expected.rollback);
    const head = await worker.fetch(new Request(url, { method: "HEAD" }), { CONSOLE_HTML_RELEASE: "rollback" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("x-mmd-console-html-sha256"), expected.rollback);
    assert.equal(await head.text(), "");
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("unrecognized release fails closed without consulting staging or accepting query overrides", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", () => { throw new Error("unexpected upstream"); });
  const request = new Request("https://mmdbkk.com" + path + "?CONSOLE_HTML_RELEASE=rollback");
  const response = await worker.fetch(request, { CONSOLE_HTML_RELEASE: "invalid" });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const current = await worker.fetch(request);
  assert.equal(current.headers.get("x-mmd-console-html-sha256"), expected.candidate);
  assert.equal(upstream.mock.callCount(), 0);
});

test("legacy redirect retains host, canonical path and session query", async () => {
  const response = await worker.fetch(new Request("https://www.mmdbkk.com/model/console?session_id=sess_LOCAL_B"));
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://mmdbkk.com/sigil/model/console?session_id=sess_LOCAL_B");
});

test("non-page methods and other paths remain guarded", async () => {
  const post = await worker.fetch(new Request("https://mmdbkk.com" + path, { method: "POST" }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  for (const apiPath of ["/v1/model/session/current", "/v1/model/session/action"]) {
    const response = await worker.fetch(new Request("https://mmdbkk.com" + apiPath));
    assert.equal(response.status, 404);
  }
});

test("both pinned releases have identical Console JavaScript and same-origin session API paths", () => {
  const read = (release) => readFileSync(new URL("../src/artifacts/" + release + ".html", import.meta.url), "utf8");
  const candidate = read("candidate");
  const scripts = (html) => [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
  assert.equal(scripts(candidate).length, 37);
  assert.deepEqual(scripts(candidate), scripts(read("rollback")));
  assert.match(candidate, /data-current-endpoint="\/v1\/model\/session\/current"/);
  assert.match(candidate, /data-action-endpoint="\/v1\/model\/session\/action"/);
  assert.match(candidate, /allowed_actions\.includes\(/);
});
