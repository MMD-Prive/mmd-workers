import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { runInNewContext } from "node:vm";
import { setTimeout as delay } from "node:timers/promises";
import { modelLiffDigitalBootstrapHtml } from "./src/model-liff-digital-shell.js";

const SESSION = "sess_smoke_selectedjob2484";
const TOKEN = "SYNTHETIC_NOT_A_LINE_CREDENTIAL";
const TARGET = "/sigil/confirm/job-model?t=synthetic.model";
const MINIAPP = "https://miniapp.line.me/2010864854-N34SgCqq/?handoff=job-confirmed&session_id=" + SESSION;
const never = () => new Promise(() => {});
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const success = () => reply(200, { ok: true, redirect_url: "https://mmdbkk.com" + TARGET });

function bootstrap(path) {
  const html = modelLiffDigitalBootstrapHtml({
    liffId: "2010864854-N34SgCqq", fallback: MINIAPP,
    sdk: "https://static.line-scdn.net/liff/edge/2/sdk.js", environment: "published",
    ...(path === "selected" ? { selectedSessionId: SESSION } : { returnTo: TARGET }),
  });
  assert.match(html, /id="loading-meter"/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "test the script emitted by the real renderer");
  return script;
}

function harness(path, scenario = "success", overrides = {}) {
  const nodes = Object.fromEntries(["status", "session-pill", "fallback", "detail", "loading-meter"].map(id => [id, {
    textContent: "", hidden: id !== "loading-meter", href: MINIAPP, addEventListener() {},
  }]));
  const calls = [], redirects = [], timers = new Set();
  const pending = [];
  const scheduled = [];
  const schedule = (fn, ms) => {
    scheduled.push(ms);
    const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms === 5000 ? 1 : 50);
    timers.add(timer);
    return timer;
  };
  const unschedule = timer => { clearTimeout(timer); timers.delete(timer); };
  const fetchMock = async (url, init) => {
    assert.equal(url, path === "selected" ? "/v1/model/selected-job/handoff" : "/v1/model/liff/exchange");
    const body = JSON.parse(init.body);
    assert.equal(body.idToken, TOKEN);
    assert.equal(body.environment, "published");
    if (path === "selected") assert.equal(body.session_id, SESSION);
    assert.equal(init.credentials, "include");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal);
    calls.push({ url, signal: init.signal });
    if (scenario === "headers-stall") return new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    });
    if (scenario === "body-stall") return { ok: true, status: 200, json: never };
    if (scenario === "late-body") return { ok: true, status: 200, json: () => new Promise(resolve => pending.push(resolve)) };
    if (scenario === "401" || scenario === "503") return reply(Number(scenario), { ok: false, error: "unavailable" });
    if (scenario === "bad-json") return { ok: true, status: 200, json: async () => { throw new SyntaxError("not JSON"); } };
    if (scenario === "owner-wait" || (scenario === "owner-then-success" && calls.length === 1)) return reply(202, { ok: false, state: "owner_confirmation_required" });
    if (scenario === "external-redirect") return reply(200, { ok: true, redirect_url: "https://example.invalid/?t=synthetic" });
    if (scenario === "customer-redirect") return reply(200, { ok: true, redirect_url: "https://mmdbkk.com/sigil/confirm/job-confirmation?t=synthetic" });
    return success();
  };
  const context = {
    URL, URLSearchParams, AbortController, setTimeout: schedule, clearTimeout: unschedule,
    document: {
      getElementById: id => nodes[id],
      createElement: () => ({ remove() {}, onload: null, onerror: null }),
      head: { appendChild() {} },
    },
    window: {
      ...(scenario === "sdk-stall" ? {} : { liff: {
        init: scenario === "init-stall" ? never : async () => {},
        getIDToken: () => scenario === "missing-token" ? "" : TOKEN,
      } }),
      location: { origin: "https://mmdbkk.com", replace: url => redirects.push(url) },
    },
    fetch: fetchMock,
    ...overrides,
  };
  return {
    nodes, calls, redirects, pending, scheduled, timers,
    run: () => runInNewContext(bootstrap(path), context, { timeout: 1000 }),
    cleanup: () => { for (const timer of timers) clearTimeout(timer); timers.clear(); },
  };
}

async function boundedRun(h, ms = 1500) {
  let guard;
  try {
    await Promise.race([
      h.run(),
      new Promise((_, reject) => { guard = setTimeout(() => reject(new Error("bootstrap never settled")), ms); }),
    ]);
  } finally { clearTimeout(guard); }
}

const scenarios = ["success", "401", "503", "missing-token", "bad-json", "headers-stall", "body-stall", "init-stall", "sdk-stall", "owner-then-success", "owner-wait", "external-redirect", "customer-redirect"];
for (const scenario of scenarios) {
  test("selected-job regression: " + scenario, async () => {
    const h = harness("selected", scenario);
    try {
      await boundedRun(h);
      assert.equal(h.timers.size, 0, "all request/SDK timers must be cleared");
      assert.doesNotMatch(JSON.stringify(h.nodes), new RegExp(TOKEN));
      if (["success", "owner-then-success"].includes(scenario)) {
        assert.deepEqual(h.redirects, [TARGET]);
        assert.equal(h.nodes.fallback.hidden, true);
      } else {
        assert.deepEqual(h.redirects, []);
        assert.equal(h.nodes.fallback.hidden, false);
        assert.equal(h.nodes["loading-meter"].hidden, true);
        assert.equal(h.nodes.fallback.href, MINIAPP, "retry preserves the same selected job");
        assert.equal(h.nodes.fallback.textContent, "ลองเปิดงานอีกครั้ง");
      }
      if (["headers-stall", "body-stall"].includes(scenario)) {
        assert.equal(h.calls[0].signal.aborted, true);
        assert.match(h.nodes.detail.textContent, /ไม่ต้องสมัครใหม่/);
        assert.ok(h.scheduled.includes(15000));
      }
      if (["missing-token", "init-stall", "sdk-stall"].includes(scenario)) assert.equal(h.calls.length, 0);
      if (scenario === "owner-wait") assert.equal(h.calls.length, 60);
    } finally { h.cleanup(); }
  });
}

for (const scenario of ["success", "401", "503", "missing-token", "body-stall", "headers-stall", "bad-json"]) {
  test("signed-return deadline: " + scenario, async () => {
    const h = harness("return", scenario);
    try {
      await boundedRun(h);
      assert.equal(h.timers.size, 0);
      if (scenario === "success") assert.deepEqual(h.redirects, [TARGET]);
      else {
        assert.deepEqual(h.redirects, []);
        assert.equal(h.nodes.fallback.hidden, false);
        assert.equal(h.nodes["loading-meter"].hidden, true);
      }
      if (scenario.endsWith("stall")) assert.equal(h.calls[0].signal.aborted, true);
    } finally { h.cleanup(); }
  });
}

test("a late JSON result cannot navigate after the deadline has exposed retry", async () => {
  const h = harness("selected", "late-body");
  try {
    await boundedRun(h);
    assert.equal(h.nodes.fallback.hidden, false);
    assert.equal(h.calls[0].signal.aborted, true);
    h.pending[0]({ ok: true, redirect_url: "https://mmdbkk.com" + TARGET });
    await delay(20);
    assert.deepEqual(h.redirects, []);
    assert.equal(h.nodes.fallback.hidden, false);
    assert.equal(h.nodes["loading-meter"].hidden, true);
  } finally { h.cleanup(); }
});

test("real Fetch: incomplete localhost JSON is aborted at the unchanged 15-second deadline on both paths", { timeout: 22000 }, async () => {
  const sockets = new Set();
  let requests = 0, closedResponses = 0;
  const server = createServer((req, res) => {
    requests += 1;
    req.resume();
    res.on("close", () => { closedResponses += 1; });
    res.writeHead(200, { "content-type": "application/json" });
    res.flushHeaders();
    res.write('{"ok":true,'); // Intentionally never finish the body.
  });
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = "http://127.0.0.1:" + server.address().port + "/synthetic-only";
  const started = Date.now();
  const hs = ["selected", "return"].map(path => {
    let signal;
    const h = harness(path, "success", {
      setTimeout, clearTimeout,
      fetch: (requested, init) => {
        assert.equal(requested, path === "selected" ? "/v1/model/selected-job/handoff" : "/v1/model/liff/exchange");
        signal = init.signal;
        return fetch(url, init); // The only real request is to 127.0.0.1.
      },
    });
    h.signal = () => signal;
    return h;
  });
  try {
    await Promise.all(hs.map(h => boundedRun(h, 19000)));
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 14500 && elapsed < 19000, "deadline must cover body and remain 15000 ms; observed " + elapsed);
    assert.equal(requests, 2);
    for (const h of hs) {
      assert.equal(h.signal().aborted, true);
      assert.equal(h.nodes.fallback.hidden, false);
      assert.equal(h.nodes["loading-meter"].hidden, true);
      assert.match(h.nodes.detail.textContent, /ไม่ต้องสมัครใหม่/);
      assert.deepEqual(h.redirects, []);
    }
    for (let attempt = 0; closedResponses < 2 && attempt < 40; attempt += 1) await delay(25);
    assert.equal(closedResponses, 2, "both stalled HTTP streams must be closed");
    console.log("LOCALHOST_DEADLINE_PASS elapsed_ms=" + elapsed + " requests=2 closed_streams=" + closedResponses);
  } finally {
    for (const h of hs) h.cleanup();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});
