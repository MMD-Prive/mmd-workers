import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import {
  EPHEMERAL_PRIVATE_COMPANION,
  handleEphemeralPrivateCompanion,
  isEphemeralPrivateCompanionPath,
} from "./src/ephemeral-private-companion.js";

const TOKEN = "Rn78C0pL1AOA2ltiA3G_jILmPPhjEK-hDZDfEzoFszQ";
const BASE = "https://sigil-worker.malemodel-bkk.workers.dev";

function kv(initial = new Map()) {
  return {
    map: initial,
    async get(key) { return this.map.has(key) ? this.map.get(key) : null; },
    async put(key, value) { this.map.set(key, value); },
  };
}

test("share routes are explicit and 180 seconds", () => {
  assert.equal(EPHEMERAL_PRIVATE_COMPANION.ttl_seconds, 180);
  assert.equal(EPHEMERAL_PRIVATE_COMPANION.language, "zh");
  assert.equal(isEphemeralPrivateCompanionPath("/v1/docs/private-companion-share"), true);
  assert.equal(isEphemeralPrivateCompanionPath("/v1/docs/private-companion-share/activate"), true);
  assert.equal(isEphemeralPrivateCompanionPath("/v1/docs/private-companion-share/read"), true);
  assert.equal(isEphemeralPrivateCompanionPath("/v1/docs/other"), false);
});

test("landing GET does not start the timer", async () => {
  const store = kv();
  const env = { SIGIL_BOARD_KV: store };
  const res = await handleEphemeralPrivateCompanion(
    new Request(BASE + "/v1/docs/private-companion-share?t=" + TOKEN),
    env,
  );
  assert.equal(res.status, 200);
  assert.equal(store.map.size, 0);
  const body = await res.text();
  assert.match(body, /打开文件 · 开始 3 分钟/);
  assert.match(body, /链接预览不会启动倒计时/);
});

test("activation starts one immutable 3-minute window", async () => {
  const store = kv();
  const env = { SIGIL_BOARD_KV: store };
  const url = BASE + "/v1/docs/private-companion-share/activate?t=" + TOKEN;
  const first = await handleEphemeralPrivateCompanion(new Request(url, { method: "POST" }), env);
  assert.equal(first.status, 200);
  const a = await first.json();
  assert.equal(a.ok, true);
  assert.match(a.read_url, /\/read\?t=/);
  assert.match(a.read_url, /lang=zh/);
  assert.equal(store.map.size, 1);
  const state1 = JSON.parse([...store.map.values()][0]);
  assert.equal(state1.ttl_seconds, 180);
  assert.equal(state1.expires_at_ms - state1.activated_at_ms, 180000);

  const second = await handleEphemeralPrivateCompanion(new Request(url, { method: "POST" }), env);
  const b = await second.json();
  const state2 = JSON.parse([...store.map.values()][0]);
  assert.equal(state2.activated_at_ms, state1.activated_at_ms);
  assert.equal(state2.expires_at_ms, state1.expires_at_ms);
  assert.equal(b.expires_at, a.expires_at);
});

test("expired state fails closed and cannot reactivate", async () => {
  const store = kv();
  const env = { SIGIL_BOARD_KV: store };
  await handleEphemeralPrivateCompanion(
    new Request(BASE + "/v1/docs/private-companion-share/activate?t=" + TOKEN, { method: "POST" }),
    env,
  );
  const [key] = [...store.map.keys()];
  const state = JSON.parse(store.map.get(key));
  state.expires_at_ms = Date.now() - 1;
  store.map.set(key, JSON.stringify(state));

  const res = await handleEphemeralPrivateCompanion(
    new Request(BASE + "/v1/docs/private-companion-share/activate?t=" + TOKEN, { method: "POST" }),
    env,
  );
  assert.equal(res.status, 410);
  assert.deepEqual(await res.json(), { ok: false, error: "expired" });

  const landing = await handleEphemeralPrivateCompanion(
    new Request(BASE + "/v1/docs/private-companion-share?t=" + TOKEN),
    env,
  );
  assert.equal(landing.status, 410);
});

test("active read proxies Chinese document and injects countdown + no-store", async () => {
  const store = kv();
  const env = { SIGIL_BOARD_KV: store };
  const activateUrl = BASE + "/v1/docs/private-companion-share/activate?t=" + TOKEN;
  await handleEphemeralPrivateCompanion(new Request(activateUrl, { method: "POST" }), env);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.match(String(input), /private-companion-bangkok\?lang=zh/);
    return new Response("<!doctype html><html><head><title>x</title></head><body><main>ZH DOC</main></body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };
  try {
    const res = await handleEphemeralPrivateCompanion(
      new Request(BASE + "/v1/docs/private-companion-share/read?t=" + TOKEN + "&lang=zh"),
      env,
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control").includes("no-store"), true);
    assert.equal(res.headers.get("content-language"), "zh-CN");
    const body = await res.text();
    assert.match(body, /<base href="https:\/\/www\.mmdbkk\.com\/">/);
    assert.match(body, /mmd-ephemeral-clock/);
    assert.match(body, /查看时间已结束/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wrong token is a 404 and does not touch KV", async () => {
  const store = kv();
  const res = await handleEphemeralPrivateCompanion(
    new Request(BASE + "/v1/docs/private-companion-share?t=wrong"),
    { SIGIL_BOARD_KV: store },
  );
  assert.equal(res.status, 404);
  assert.equal(store.map.size, 0);
});
