import assert from "node:assert/strict";
import test from "node:test";

import deployNotify from "./deploy-notify.js";

const {
  assertNotificationEnvironment,
  extractVersionId,
  formatFailure,
  formatRollback,
  formatSuccess,
  getWorkerConfig,
  runSmokeTest,
  sendTelegram,
} = deployNotify;

const VERSION_ID = "e0e9f103-6678-4269-a1cd-7e95314484c0";

test("formats success, failure, and rollback messages", () => {
  const success = formatSuccess({
    worker: "mmd-redirect-worker",
    environment: "Production",
    gitSha: "abc123",
    versionId: VERSION_ID,
    timestamp: "2026-08-03T04:15:00.000Z",
    deployUser: "MMD Ops",
    branch: "main",
    routes: ["mmdbkk.com/*"],
    smokeResult: "PASS",
    rollbackVersion: "previous",
  });
  assert.match(success, /✅ MMD Deployment Success/);
  assert.match(success, /Rollback version:\nprevious/);
  assert.match(formatFailure({ worker: "x", command: "deploy", exitCode: 1, gitSha: "abc", log: "last line" }), /Last log lines:\nlast line/);
  assert.match(formatRollback({ worker: "x", previousVersion: "a", newActiveVersion: "b", reason: "regression" }), /New Active Version:\nb/);
});

test("extracts Wrangler text and JSON version IDs", () => {
  assert.equal(extractVersionId(`Current Version ID: ${VERSION_ID}`), VERSION_ID);
  assert.equal(extractVersionId(JSON.stringify([{ id: VERSION_ID }])), VERSION_ID);
  assert.equal(extractVersionId("no version"), "");
});

test("registry fails closed for unknown or unavailable workers", () => {
  assert.equal(getWorkerConfig("admin-worker").config, "admin-worker/wrangler.toml");
  assert.throws(() => getWorkerConfig("member-api-worker"), /not present on origin\/main/);
  assert.throws(() => getWorkerConfig("unknown-worker"), /Unknown worker/);
});

test("notification environment rejects missing secrets", () => {
  assert.throws(() => assertNotificationEnvironment({}), /TELEGRAM_BOT_TOKEN/);
});

test("Telegram sender posts only environment-provided credentials", async () => {
  let request;
  const fetchStub = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  await sendTelegram("hello", { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_DEPLOY_CHAT_ID: "chat" }, fetchStub);
  assert.equal(request.url, "https://api.telegram.org/bottoken/sendMessage");
  assert.deepEqual(JSON.parse(request.options.body), { chat_id: "chat", text: "hello", disable_web_page_preview: true });
});

test("smoke test enforces the registered status contract", async () => {
  const pass = await runSmokeTest("admin-worker", "https://example.test", async () => new Response("ok", { status: 200 }));
  assert.match(pass, /^PASS \(HTTP 200:/);
  await assert.rejects(
    runSmokeTest("admin-worker", "https://example.test", async () => new Response("bad", { status: 500 })),
    /expected/,
  );
});
