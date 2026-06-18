import assert from "node:assert/strict";
import worker from "../src/index.js";

function makeKv() {
  const store = new Map();
  return {
    async get(key, type) {
      const value = store.get(key) || null;
      if (type === "json" && value) return JSON.parse(value);
      return value;
    },
    async put(key, value) {
      store.set(key, String(value));
    },
    store,
  };
}

async function post(path, body, env = {}) {
  return worker.fetch(
    new Request(`https://telegram-worker.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": "test-key" },
      body: JSON.stringify(body),
    }),
    { INTERNAL_API_TOKEN: "test-key", ...env },
  );
}

{
  const response = await post("/promo/issue", {
    telegram_user_id: "12345",
    campaign: "PRIDE_2026",
    source: "telegram",
    request_id: "req_1",
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, "storage_not_configured");
}

{
  const kv = makeKv();
  const response = await post(
    "/promo/issue",
    {
      telegram_user_id: "12345",
      campaign: "PRIDE_2026",
      source: "telegram",
      request_id: "req_1",
    },
    { PROMO_CODES_KV: kv },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.campaign, "PRIDE_2026");
  assert.equal(body.single_use, true);
  assert.equal(body.status, "issued");
  assert.match(body.code, /^[A-Z0-9]{6}$/);

  const record = await kv.get(`promo:PRIDE_2026:code:${body.code}`, "json");
  assert.equal(record.telegram_user_id, "12345");
  assert.equal(record.status, "issued");
  assert.equal(record.used_at, "");
  assert.equal(record.single_use, true);
}

{
  const kv = makeKv();
  const first = await post("/promo/issue", { telegram_user_id: "67890", campaign: "PRIDE_2026" }, { PROMO_CODES_KV: kv });
  const firstBody = await first.json();
  const second = await post("/promo/issue", { telegram_user_id: "67890", campaign: "PRIDE_2026" }, { PROMO_CODES_KV: kv });
  const secondBody = await second.json();
  assert.equal(second.status, 200);
  assert.equal(secondBody.code, firstBody.code);
  assert.equal(secondBody.idempotent, true);
}

console.log("telegram promo issue tests passed");
