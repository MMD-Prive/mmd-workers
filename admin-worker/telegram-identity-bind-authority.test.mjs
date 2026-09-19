import assert from "node:assert/strict";
import { test } from "node:test";
import {
  handleTelegramBindAuthorityRpc,
  issueModelTelegramBind,
  consumeTelegramBind,
} from "./src/telegram-identity-bind-authority.js";

const MODEL_ID = "recAAAAAAAAAAAAAA";
const BIND_ID = "recBBBBBBBBBBBBBB";
const modelFields = {
  working_name: "Simba",
  telegram_verification_status: "not_connected",
  telegram_user_id: "",
  telegram_username: "",
};
let bindFields = null;

function installFetch() {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const req = input instanceof Request && !init ? input : new Request(input, init);
    const url = new URL(req.url);
    const body = req.method === "GET" ? null : await req.json().catch(() => ({}));

    if (req.method === "GET" && url.pathname.endsWith("/Models/" + MODEL_ID)) {
      return Response.json({ id: MODEL_ID, fields: { ...modelFields } });
    }
    if (req.method === "POST" && url.pathname.endsWith("/MMD%20%E2%80%94%20Telegram%20Identity%20Binds")) {
      bindFields = body.records[0].fields;
      return Response.json({ records: [{ id: BIND_ID, fields: { ...bindFields } }] });
    }
    if (req.method === "GET" && url.pathname.endsWith("/MMD%20%E2%80%94%20Telegram%20Identity%20Binds")) {
      return Response.json({ records: bindFields ? [{ id: BIND_ID, fields: { ...bindFields } }] : [] });
    }
    if (req.method === "PATCH" && url.pathname.endsWith("/Models")) {
      Object.assign(modelFields, body.records[0].fields);
      return Response.json({ records: [{ id: MODEL_ID, fields: { ...modelFields } }] });
    }
    if (req.method === "PATCH" && url.pathname.endsWith("/MMD%20%E2%80%94%20Telegram%20Identity%20Binds")) {
      Object.assign(bindFields, body.records[0].fields);
      return Response.json({ records: [{ id: BIND_ID, fields: { ...bindFields } }] });
    }
    throw new Error("unexpected Airtable request " + req.method + " " + req.url);
  };
  return () => { globalThis.fetch = original; };
}

const env = {
  AIRTABLE_API_KEY: "pat-test",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_TABLE_MODELS: "Models",
  AIRTABLE_TABLE_TELEGRAM_IDENTITY_BINDS: "MMD — Telegram Identity Binds",
  TELEGRAM_BOT_USERNAME: "mmdprivebot",
};

test("public host cannot call internal Telegram bind authority", async () => {
  const res = await handleTelegramBindAuthorityRpc(new Request("https://www.mmdbkk.com/__internal/telegram-identity-bind", {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-service-binding": "telegram-worker" },
    body: JSON.stringify({ operation: "consume" }),
  }), env);
  assert.equal(res.status, 403);
});

test("model bind stores only token hash, then bot stable ID verifies canonical model", async () => {
  bindFields = null;
  Object.assign(modelFields, { telegram_verification_status: "not_connected", telegram_user_id: "", telegram_username: "" });
  const restore = installFetch();
  try {
    const issued = await issueModelTelegramBind(env, { model_record_id: MODEL_ID });
    assert.equal(issued.ok, true);
    assert.match(issued.connect_url, /^https:\/\/t\.me\/mmdprivebot\?start=bind_/);
    const startArg = new URL(issued.connect_url).searchParams.get("start");
    assert.ok(startArg);
    assert.equal(bindFields.role, "model");
    assert.match(bindFields.token_hash, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(bindFields).includes(startArg), false);
    assert.equal(JSON.stringify(bindFields).includes(MODEL_ID), true);

    const consumed = await consumeTelegramBind(env, {
      start_arg: startArg,
      telegram_user_id: "123456789",
      telegram_username: "simba_mmd",
    });
    assert.equal(consumed.ok, true);
    assert.equal(consumed.telegram_connected, true);
    assert.equal(modelFields.telegram_user_id, "123456789");
    assert.equal(modelFields.telegram_username, "simba_mmd");
    assert.equal(modelFields.telegram_verification_status, "verified");
    assert.ok(modelFields.telegram_verified_at);
    assert.equal(bindFields.status, "consumed");
  } finally {
    restore();
  }
});
