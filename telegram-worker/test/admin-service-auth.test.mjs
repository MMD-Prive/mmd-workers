import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/access-runtime.js";

const env = {
  AUTH_SERVICE_ADMIN_TO_TELEGRAM: "fixture-admin",
  AUTH_SERVICE_PAYMENTS_TO_TELEGRAM: "fixture-payments",
  INTERNAL_API_TOKEN: "fixture-api",
  INTERNAL_TOKEN: "fixture-legacy",
  TELEGRAM_BOT_TOKEN: "fixture-bot",
};
const sendPath = "/telegram/internal/send";

function request(path = sendPath, headers = {}, method = "POST") {
  return new Request(`https://telegram.example${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(method === "POST" ? { body: JSON.stringify({ chat_id: "123456789", text: "auth fixture" }) } : {}),
  });
}

for (const header of ["X-Internal-Token", "Authorization"]) {
  test(`Admin service token reaches canonical send via ${header}`, async (t) => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return Response.json({ ok: true, result: { message_id: 1 } });
    });
    const value = header === "Authorization" ? `Bearer ${env.AUTH_SERVICE_ADMIN_TO_TELEGRAM}` : env.AUTH_SERVICE_ADMIN_TO_TELEGRAM;
    const response = await worker.fetch(request(sendPath, { [header]: value }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).telegram.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.telegram.org/botfixture-bot/sendMessage");
    assert.equal(calls[0].body.text, "auth fixture");
  });
}

for (const [label, headers, override] of [
  ["missing token", {}, {}],
  ["invalid token", { "X-Internal-Token": "fixture-invalid" }, {}],
  ["legacy INTERNAL_TOKEN", { "X-Internal-Token": env.INTERNAL_TOKEN }, {}],
  ["unconfigured Admin service", { "X-Internal-Token": env.AUTH_SERVICE_ADMIN_TO_TELEGRAM }, { AUTH_SERVICE_ADMIN_TO_TELEGRAM: undefined }],
  ["invalid direct token with valid bearer", { "X-Internal-Token": "fixture-invalid", Authorization: `Bearer ${env.AUTH_SERVICE_ADMIN_TO_TELEGRAM}` }, {}],
]) {
  test(`${label} stays forbidden before provider access`, async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected provider access"); });
    const response = await worker.fetch(request(sendPath, headers), { ...env, ...override });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: "internal_token_required" });
    assert.equal(fetchMock.mock.callCount(), 0);
  });
}

for (const [path, method, status] of [
  ["/v1/internal/send", "POST", 403],
  ["/v1/send", "POST", 403],
  ["/telegram/internal/router/health", "GET", 403],
  ["/telegram/internal/payments/proof-document", "POST", 403],
  ["/telegram/preview/post", "POST", 403],
  ["/telegram/internal/access/reconcile", "POST", 401],
]) {
  test(`Admin send credential grants no access to ${path}`, async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected provider access"); });
    const response = await worker.fetch(request(path, { "X-Internal-Token": env.AUTH_SERVICE_ADMIN_TO_TELEGRAM }, method), env);
    assert.equal(response.status, status);
    assert.equal((await response.json()).ok, false);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
}

for (const [path, token] of [
  [sendPath, env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM],
  [sendPath, env.INTERNAL_API_TOKEN],
  ["/v1/internal/send", env.INTERNAL_API_TOKEN],
  ["/v1/send", env.INTERNAL_API_TOKEN],
]) {
  test(`existing caller stays authorized on ${path} with ${token}`, async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, result: { message_id: 1 } }));
    const response = await worker.fetch(request(path, { "X-Internal-Token": token }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).telegram.ok, true);
    assert.equal(fetchMock.mock.callCount(), 1);
  });
}
