import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import worker, { shouldServeLiffPrimaryBootstrap } from "./src/index.js";
import { modelLiffDigitalBootstrapHtml } from "./src/model-liff-digital-shell.js";

const endpoint = "https://mmdbkk.com/sigil/model/dashboard";
const options = {
  liffId: "2010864854-N34SgCqq",
  sdk: "https://static.line-scdn.net/liff/edge/2/sdk.js",
  fallback: "https://miniapp.line.me/2010864854-N34SgCqq",
};

test("bare Android LINE endpoint serves bootstrap, not a Mini App redirect", async () => {
  const request = new Request(endpoint, { headers: { "user-agent": "Mozilla/5.0 Android Line/15.0.0" } });
  const response = await worker.fetch(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-mmd-model-entry"), "liff-primary-preboot-v1");
  assert.equal(response.headers.get("set-cookie"), "mmd_liff_boot=1; Path=/; Max-Age=120; Secure; SameSite=Lax");
  const html = await response.text();
  assert.doesNotMatch(html, /\/v1\/model\/liff\/exchange|\/v1\/model\/profile|idToken/);
});

test("UA is presentation-only; sessions, bootstrap cookie and other namespaces stay unchanged", () => {
  for (const cookie of ["mmd_liff_boot=1", "mmd_model_session_v1=opaque"]) {
    assert.equal(shouldServeLiffPrimaryBootstrap(new Request(endpoint, {
      headers: { "user-agent": "LINE/15.0.0 LIFF", cookie },
    })), false);
  }
  for (const url of [endpoint + "/profile", "https://mmdbkk.com/v1/model/profile", endpoint + "?session_id=sess_example123"]) {
    assert.equal(shouldServeLiffPrimaryBootstrap(new Request(url, {
      headers: { "user-agent": "LINE/15.0.0 LIFF" },
    })), false);
  }
  assert.equal(shouldServeLiffPrimaryBootstrap(new Request(endpoint, { method: "POST", headers: { "user-agent": "LINE/15.0.0" } })), false);
});

test("ordinary browser retains the registered Mini App handoff", async () => {
  const response = await worker.fetch(new Request(endpoint, { headers: { "user-agent": "Mozilla/5.0 Chrome/140" } }));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), options.fallback);
});

test("HEAD bootstrap has no response body", async () => {
  const response = await worker.fetch(new Request(endpoint, { method: "HEAD", headers: { "user-agent": "LINE/15.0.0" } }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

function runtime(liff) {
  const html = modelLiffDigitalBootstrapHtml(options);
  const nodes = Object.fromEntries(["status", "session-pill", "fallback", "detail"].map(id => [id, { hidden: true, textContent: "", addEventListener() {} }]));
  const timers = new Map();
  const scripts = [];
  const window = { liff };
  let sequence = 0;
  const document = {
    getElementById: id => nodes[id],
    createElement: () => ({ remove() { this.removed = true; } }),
    head: { appendChild: script => scripts.push(script) },
  };
  const code = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const done = vm.runInNewContext(code, {
    window, document,
    setTimeout: (fn, ms) => { const id = ++sequence; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return {
    html, nodes, scripts, window, timers, done,
    expire() { const [id, timer] = timers.entries().next().value; timers.delete(id); assert.equal(timer.ms, 12000); timer.fn(); },
  };
}

test("waiting content exists before any SDK load and external script is not parser-blocking", () => {
  const r = runtime();
  assert.doesNotMatch(r.html, /<script\s+src=/);
  assert.ok(r.html.indexOf('id="status"') < r.html.indexOf("document.head.appendChild"));
  assert.equal(r.scripts.length, 1);
  assert.equal(r.scripts[0].async, true);
  assert.equal(r.scripts[0].src, options.sdk);
  assert.match(r.html, /\.mmd-digital-action\[hidden\]\{display:none\}/);
  r.expire();
  return r.done;
});

test("SDK stall shows a bounded error and user-operated fallback", async () => {
  const r = runtime();
  r.expire();
  await r.done;
  assert.equal(r.nodes.detail.textContent, "line_sdk_timeout");
  assert.equal(r.nodes.fallback.hidden, false);
  assert.equal(r.scripts[0].removed, true);
  assert.equal(r.scripts[0].onload, null);
});

test("SDK network failure and loaded-without-SDK fail visibly", async () => {
  for (const event of ["onerror", "onload"]) {
    const r = runtime();
    r.scripts[0][event]();
    await r.done;
    assert.equal(r.nodes.detail.textContent, "line_sdk_unavailable");
    assert.equal(r.nodes.fallback.hidden, false);
    assert.equal(r.timers.size, 0);
  }
});

test("async SDK load completes before a single init and preserves LINE-owned navigation", async () => {
  let calls = 0;
  const r = runtime();
  r.window.liff = { init: async config => { calls++; assert.equal(config.liffId, options.liffId); } };
  r.scripts[0].onload();
  await r.done;
  assert.equal(calls, 1);
  assert.equal(r.nodes.fallback.hidden, true);
  assert.equal(r.scripts[0].onload, null);
  assert.equal(r.timers.size, 1);
  r.expire();
});

test("init timeout cannot resume after late SDK success", async () => {
  let resolveInit;
  const r = runtime({ init: () => new Promise(resolve => { resolveInit = resolve; }) });
  await Promise.resolve();
  await Promise.resolve();
  r.expire();
  await r.done;
  resolveInit();
  await Promise.resolve();
  assert.equal(r.nodes.detail.textContent, "line_init_timeout");
  assert.equal(r.nodes.fallback.hidden, false);
  assert.equal(r.timers.size, 0);
});

test("SDK success initializes once; missing secondary redirect becomes visible without automatic retry", async () => {
  let calls = 0;
  const r = runtime({ init: async config => { calls++; assert.equal(config.liffId, options.liffId); } });
  await r.done;
  assert.equal(calls, 1);
  r.expire();
  assert.equal(r.nodes.detail.textContent, "line_redirect_timeout");
  assert.equal(r.nodes.fallback.hidden, false);
  assert.doesNotMatch(r.html, /location\.(replace|reload)|liff\.login/);
});

test("raw SDK errors never expose credential URLs", async () => {
  const r = runtime({ init: async () => { throw new Error("https://example.invalid/#access_token=secret-fixture"); } });
  await r.done;
  assert.equal(r.nodes.detail.textContent, "line_connection_failed");
  assert.doesNotMatch(r.nodes.detail.textContent, /access_token|secret-fixture/);
});
