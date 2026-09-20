import assert from "node:assert/strict";
import test from "node:test";

import adminWorker from "../../admin-worker/src/admin-login-hero-worker.js";
import lineWorker, { createLineSignature, KenjiModelIdempotency } from "../src/index.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const INTERNAL_TOKEN = "synthetic-internal-token";
const RUNTIME_STATUS_PATH = "/v1/internal/kenji/control/runtime/status";

function healthyRuntimeResponse() {
  return new Response(JSON.stringify({
    ok: true,
    controls: {
      line_oa_auto_reply: false,
      model_keyword_auto_reply: false,
      all_kenji_mutations: false,
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function syntheticData({ capability = "private_standard", lifecycle = "active", model = true, linked = true } = {}) {
  return {
    entitlements: [{
      id: "rec-synthetic-entitlement",
      fields: {
        line_user_id: linked ? LINE_USER_ID : "Uother1234567890abcdef1234567890ab",
        capability,
        member_lifecycle_status: lifecycle,
        access_status: lifecycle,
        expire_at: lifecycle === "expired" ? "2020-01-01T00:00:00.000Z" : "2099-12-31T23:59:59.000Z",
      },
    }],
    models: model ? [{
      id: "rec-synthetic-model",
      fields: {
        model_code: "MX17",
        working_name: "น้องซิน",
        booking_visibility: "private",
        access_folder: "standard",
        status: "active",
        customer_safe_summary: "โปรไฟล์ที่อนุมัติสำหรับลูกค้า",
      },
    }] : [],
    offers: [],
  };
}

function durableBinding() {
  const objects = new Map();
  return {
    idFromName(name) { return name; },
    get(id) {
      if (!objects.has(id)) {
        const values = new Map();
        let alarm = null;
        objects.set(id, new KenjiModelIdempotency({
          storage: {
            async get(key) { return values.get(key); },
            async put(key, value) { values.set(key, value); },
            async delete(keyOrKeys) {
              for (const key of Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]) values.delete(key);
            },
            async getAlarm() { return alarm; },
            async setAlarm(value) { alarm = value; },
          },
        }));
      }
      const object = objects.get(id);
      return {
        fetch(input, init = {}) {
          const request = input instanceof Request ? input : new Request(String(input), init);
          return object.fetch(request);
        },
      };
    },
  };
}

const SCHEMAS = {
  entitlements: new Set(["line_user_id"]),
  models: new Set(["model_code", "model_lookup_key", "unique_key", "working_name", "Working Name", "display_name", "Display Name"]),
};

function installSyntheticNetwork(data, { sourceFailure = false } = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com") {
      if (sourceFailure) return new Response("synthetic source failure", { status: 503 });
      const table = decodeURIComponent(url.pathname.split("/").pop());
      if (table === "offers") return new Response(JSON.stringify({ records: data.offers || [] }), { status: 200, headers: { "content-type": "application/json" } });
      const formula = url.searchParams.get("filterByFormula") || "";
      const match = formula.match(/^LOWER\(\{(.+)}&""\)="(.*)"$/);
      if (!match || !SCHEMAS[table]?.has(match[1])) return new Response(JSON.stringify({ error: "unknown field" }), { status: 422 });
      const field = match[1];
      const value = match[2].toLowerCase();
      const records = (data[table] || []).filter((record) => String(record.fields?.[field] ?? "").trim().toLowerCase() === value);
      return new Response(JSON.stringify({ records }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ displayName: "Synthetic Member" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

function environments(data, rpcCalls) {
  const adminEnv = {
    INTERNAL_TOKEN,
    AIRTABLE_API_KEY: "synthetic-airtable-token",
    AIRTABLE_BASE_ID: "app-synthetic",
    AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "entitlements",
    AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD: "line_user_id",
    AIRTABLE_TABLE_MODELS: "models",
  };
  const lineEnv = {
    INTERNAL_TOKEN,
    LINE_CHANNEL_SECRET: "synthetic-line-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "synthetic-line-token",
    LINE_AUTO_REPLY_ENABLED: "true",
    LINE_KENJI_AI_ENABLED: "true",
    LINE_KENJI_KNOWLEDGE_ENABLED: "false",
    LINE_KENJI_MODEL_ENABLED: "false",
    LINE_KENJI_MODEL_ACCESS_ENABLED: "true",
    KENJI_MODEL_DEDUPE: durableBinding(),
    ADMIN_WORKER: {
      async fetch(request) {
        if (new URL(request.url).pathname === RUNTIME_STATUS_PATH) return healthyRuntimeResponse();
        rpcCalls.push(request);
        return adminWorker.fetch(request, adminEnv);
      },
    },
  };
  return { adminEnv, lineEnv };
}

async function webhookRequest(text, lineEnv, messageId) {
  const event = {
    type: "message",
    mode: "active",
    replyToken: `reply-${messageId}`,
    source: { type: "user", userId: LINE_USER_ID },
    message: { id: messageId, type: "text", text },
  };
  const raw = JSON.stringify({ events: [event] });
  const signature = await createLineSignature(raw, lineEnv.LINE_CHANNEL_SECRET);
  return new Request("https://mmdbkk.com/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body: raw,
  });
}

async function runSmoke({ text = "MX17", data = syntheticData(), sourceFailure = false, messageId = "msg-smoke" } = {}) {
  const network = installSyntheticNetwork(data, { sourceFailure });
  const rpcCalls = [];
  const { lineEnv } = environments(data, rpcCalls);
  try {
    const response = await lineWorker.fetch(await webhookRequest(text, lineEnv, messageId), lineEnv);
    return { response, rpcCalls, networkCalls: network.calls };
  } finally {
    network.restore();
  }
}

test("synthetic full-chain canonical Standard entitlement sends one safe LINE Reply", async () => {
  const result = await runSmoke({ messageId: "msg-smoke-authorized" });
  assert.equal(result.response.status, 200);
  assert.equal(result.rpcCalls.length, 1);
  const replies = result.networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply"));
  assert.equal(replies.length, 1);
  assert.equal(result.networkCalls.filter((call) => call.url.includes("/v2/bot/message/push")).length, 0);
  const body = JSON.parse(replies[0].init.body);
  assert.match(body.messages[0].text, /น้องซิน.*MX17/s);
  assert.doesNotMatch(body.messages[0].text, /airtable|record|availability|contact|ทีม|ระบบ/i);
});

test("synthetic full-chain unlinked LINE fails closed and typed email cannot widen model access", async () => {
  const data = syntheticData({ linked: false });
  const network = installSyntheticNetwork(data);
  const rpcCalls = [];
  const { lineEnv } = environments(data, rpcCalls);
  try {
    const lookupResponse = await lineWorker.fetch(await webhookRequest("MX17", lineEnv, "msg-smoke-unlinked-lookup"), lineEnv);
    const emailResponse = await lineWorker.fetch(await webhookRequest("synthetic@example.test", lineEnv, "msg-smoke-unlinked-email"), lineEnv);
    assert.equal(lookupResponse.status, 200);
    assert.equal(emailResponse.status, 200);
    assert.equal(rpcCalls.length, 1);
    const replies = network.calls.filter((call) => call.url.includes("/v2/bot/message/reply"));
    assert.equal(replies.length, 0);
    assert.equal(network.calls.filter((call) => call.url.includes("/v2/bot/message/push")).length, 0);
  } finally {
    network.restore();
  }
});

test("synthetic full-chain expired canonical entitlement sends only renewal guidance and never Push", async () => {
  const result = await runSmoke({ data: syntheticData({ lifecycle: "expired" }), messageId: "msg-smoke-expired-membership" });
  assert.equal(result.response.status, 200);
  assert.equal(result.rpcCalls.length, 1);
  const replies = result.networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply"));
  assert.equal(replies.length, 1);
  assert.equal(result.networkCalls.filter((call) => call.url.includes("/v2/bot/message/push")).length, 0);
  const body = JSON.parse(replies[0].init.body);
  assert.match(body.messages[0].text, /ต่ออายุ/);
  assert.match(body.messages[0].text, /sigil\/member\/membership/);
  assert.doesNotMatch(body.messages[0].text, /MX17|น้องซิน/);
});

for (const scenario of [
  { name: "unknown code", data: syntheticData({ model: false }) },
  { name: "source failure", data: syntheticData(), sourceFailure: true },
]) {
  test(`synthetic full-chain ${scenario.name} returns 200 with no Reply or Push`, async () => {
    const result = await runSmoke({ ...scenario, messageId: `msg-smoke-${scenario.name.replace(/\s/g, "-")}` });
    assert.equal(result.response.status, 200);
    assert.equal(result.rpcCalls.length, 1);
    assert.equal(result.networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
    assert.equal(result.networkCalls.filter((call) => call.url.includes("/v2/bot/message/push")).length, 0);
  });
}

test("synthetic manual-review case remains silent and never calls the RPC", async () => {
  const result = await runSmoke({ text: "ขอให้เปอร์ตรวจเอง", messageId: "msg-smoke-manual-review" });
  assert.equal(result.response.status, 200);
  assert.equal(result.rpcCalls.length, 0);
  assert.equal(result.networkCalls.filter((call) => /\/v2\/bot\/message\/(?:reply|push)/.test(call.url)).length, 0);
});
