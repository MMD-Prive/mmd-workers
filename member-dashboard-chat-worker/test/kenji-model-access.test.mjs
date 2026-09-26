import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import worker, {
  createLineSignature,
  extractKenjiModelLookupQuery,
  extractKenjiModelVerificationEmail,
  inferLineIntent,
  KenjiModelIdempotency,
  resolveLineCardCampaignTrigger,
  resolveKenjiLineReply,
} from "../src/index.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const RUNTIME_STATUS_PATH = "/v1/internal/kenji/control/runtime/status";
const BASE_ENV = {
  INTERNAL_TOKEN: "internal-token",
  LINE_CHANNEL_SECRET: "line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "line-token",
  LINE_AUTO_REPLY_ENABLED: "true",
  LINE_KENJI_AI_ENABLED: "true",
  LINE_KENJI_KNOWLEDGE_ENABLED: "false",
  LINE_KENJI_MODEL_ENABLED: "false",
  LINE_KENJI_MODEL_ACCESS_ENABLED: "true",
};

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

function lineEvent(text, overrides = {}) {
  return {
    type: "message",
    mode: "active",
    replyToken: "reply-token",
    source: { type: "user", userId: LINE_USER_ID },
    message: { id: "msg-model-access-1", type: "text", text },
    ...overrides,
  };
}

function adminBinding(payload, status = 200, calls = []) {
  return {
    async fetch(request) {
      if (new URL(request.url).pathname === RUNTIME_STATUS_PATH) return healthyRuntimeResponse();
      calls.push(request);
      return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
    },
  };
}

function pendingBinding(calls = []) {
  let pending = null;
  return {
    idFromName(name) { return name; },
    get() {
      return {
        async fetch(input, init = {}) {
          const body = input instanceof Request ? await input.json() : JSON.parse(init.body || "{}");
          calls.push(body);
          if (body.action === "put") {
            pending = body.query;
            return new Response(JSON.stringify({ ok: true, stored: true }), { status: 200 });
          }
          if (body.action === "get") {
            return new Response(JSON.stringify(pending ? { ok: true, found: true, query: pending } : { ok: true, found: false }), { status: 200 });
          }
          if (body.action === "delete") {
            pending = null;
            return new Response(JSON.stringify({ ok: true, deleted: true }), { status: 200 });
          }
          return new Response(JSON.stringify({ ok: false }), { status: 400 });
        },
      };
    },
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
        const storage = {
          async get(key) { return values.get(key); },
          async put(key, value) { values.set(key, value); },
          async delete(keyOrKeys) {
            for (const key of Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]) values.delete(key);
          },
          async list({ prefix } = {}) { return new Map([...values].filter(([key]) => !prefix || key.startsWith(prefix))); },
          async getAlarm() { return alarm; },
          async setAlarm(value) { alarm = value; },
          async transaction(callback) {
            return callback({ get: storage.get, put: storage.put, delete: storage.delete });
          },
        };
        objects.set(id, new KenjiModelIdempotency({ storage }));
      }
      return {
        fetch(input, init = {}) {
          return objects.get(id).fetch(input instanceof Request ? input : new Request(String(input), init));
        },
      };
    },
  };
}

test("committed rollout configuration keeps both model capabilities off and exposes no public admin RPC route", () => {
  const lineWrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const adminWrangler = readFileSync(new URL("../../admin-worker/wrangler.toml", import.meta.url), "utf8");
  assert.match(lineWrangler, /^LINE_KENJI_MODEL_ENABLED\s*=\s*"false"$/m);
  assert.match(lineWrangler, /^LINE_KENJI_MODEL_ACCESS_ENABLED\s*=\s*"false"$/m);
  assert.match(lineWrangler, /^LINE_CARD_21829530_LEAD_ENABLED\s*=\s*"false"$/m);
  assert.match(lineWrangler, /^LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR\s*=\s*"false"$/m);
  assert.match(lineWrangler, /binding\s*=\s*"ADMIN_WORKER"\s*\nservice\s*=\s*"admin-worker"/m);
  assert.doesNotMatch(adminWrangler, /v1\/internal\/kenji\/model-access/);
});

async function signedWebhook(events, env = BASE_ENV) {
  const raw = JSON.stringify({ events });
  const signature = await createLineSignature(raw, env.LINE_CHANNEL_SECRET);
  return new Request("https://mmdbkk.com/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body: raw,
  });
}

test("card triggers are campaign leads while neutral codes remain model lookups", () => {
  assert.equal(extractKenjiModelLookupQuery("MX17"), "MX17");
  assert.equal(extractKenjiModelLookupQuery("model MX17 ครับ"), "MX17");
  assert.equal(extractKenjiModelLookupQuery("ชื่อนายแบบ น้องซิน"), "น้องซิน");
  for (const card of ["JASPAL", "NANO", "EMs01", "Sky B", "BOOK EI", "EMs11", "GWs19", "EMs19"]) {
    assert.equal(extractKenjiModelLookupQuery(card), card);
    assert.equal(inferLineIntent(card, lineEvent(card)), "card_campaign_lead");
    assert.equal(resolveLineCardCampaignTrigger(card)?.card_trigger, card);
  }
  assert.equal(resolveLineCardCampaignTrigger("JASPAL")?.display_intent, "Jasper");
  assert.equal(resolveLineCardCampaignTrigger("Sky B")?.manager_action_enabled, false);
  assert.equal(resolveLineCardCampaignTrigger("BOOK EI")?.card_trigger, "BOOK EI");
  assert.equal(resolveLineCardCampaignTrigger("Book EI"), null);
  assert.equal(resolveLineCardCampaignTrigger("https://mmdbkk.com/my-mmd"), null);
  assert.notEqual(inferLineIntent("https://mmdbkk.com/my-mmd", lineEvent("https://mmdbkk.com/my-mmd")), "card_campaign_lead");
  assert.equal(extractKenjiModelLookupQuery("/my-mmd"), "");
  assert.equal(extractKenjiModelLookupQuery("Sky B สวัสดี"), "");
  assert.equal(extractKenjiModelLookupQuery("HELLO"), "");
  assert.equal(extractKenjiModelLookupQuery("สวัสดีครับ"), "");
  assert.equal(inferLineIntent("MX17", lineEvent("MX17")), "model_lookup");
  assert.equal(inferLineIntent("JASPAL", lineEvent("JASPAL")), "card_campaign_lead");
  assert.equal(extractKenjiModelVerificationEmail("Customer.Name@gmail.com"), "customer.name@gmail.com");
  assert.equal(inferLineIntent("customer.name@gmail.com", lineEvent("customer.name@gmail.com")), "model_access_verification");
});

test("Durable Object keeps only the pending model query and supports one-time deletion", async () => {
  const values = new Map();
  const object = new KenjiModelIdempotency({
    storage: {
      async get(key) { return values.get(key); },
      async put(key, value) { values.set(key, value); },
      async delete(key) { values.delete(key); },
      async getAlarm() { return null; },
      async setAlarm() {},
    },
  });
  const call = (body) => object.fetch(new Request("https://kenji-model-dedupe.internal/model-access/pending", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  assert.equal((await (await call({ action: "put", query: "MX17" })).json()).stored, true);
  assert.deepEqual(await (await call({ action: "get" })).json(), { ok: true, found: true, query: "MX17" });
  assert.equal((await (await call({ action: "delete" })).json()).deleted, true);
  assert.deepEqual(await (await call({ action: "get" })).json(), { ok: true, found: false });
  assert.doesNotMatch(JSON.stringify([...values.values()]), /@|gmail|email/i);
});

test("unlinked LINE asks one necessary Google email question and continues the pending lookup", async () => {
  const rpcCalls = [];
  const pendingCalls = [];
  const env = {
    ...BASE_ENV,
    KENJI_MODEL_DEDUPE: pendingBinding(pendingCalls),
    ADMIN_WORKER: {
      async fetch(request) {
        const body = await request.json();
        rpcCalls.push(body);
        const payload = body.verification_email
          ? { ok: true, status: "match", model: { model_code: "MX17", working_name: "น้องซิน" } }
          : { ok: true, status: "verification_required" };
        return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  };

  const question = await resolveKenjiLineReply(lineEvent("MX17"), {}, env);
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(pendingCalls.map((item) => item.action), ["put"]);
  assert.match(question.text, /อีเมล Google/);
  assert.match(question.text, /Premium Model|Standard Models/);
  assert.doesNotMatch(question.text, /malemodel\.bkk|airtable|record|token/i);
  assert.equal(question.reply_source, "model_access_verification");

  const answer = await resolveKenjiLineReply(lineEvent("customer.name@gmail.com"), {}, env);
  assert.match(answer.text, /น้องซิน.*MX17/s);
  assert.deepEqual(rpcCalls, [
    { line_user_id: LINE_USER_ID, query: "MX17" },
    { line_user_id: LINE_USER_ID, query: "MX17", verification_email: "customer.name@gmail.com" },
  ]);
  assert.deepEqual(pendingCalls.map((item) => item.action), ["put", "get", "delete"]);
});

test("email without a pending model lookup stays silent and never calls the access backend", async () => {
  const calls = [];
  const decision = await resolveKenjiLineReply(lineEvent("customer.name@gmail.com"), {}, {
    ...BASE_ENV,
    KENJI_MODEL_DEDUPE: pendingBinding(),
    ADMIN_WORKER: adminBinding({ ok: true, status: "match" }, 200, calls),
  });
  assert.equal(decision.text, "");
  assert.equal(calls.length, 0);
});

test("expired member may continue a brief without new private disclosure", async () => {
  const decision = await resolveKenjiLineReply(lineEvent("MX17"), {}, {
    ...BASE_ENV,
    ADMIN_WORKER: adminBinding({ ok: true, status: "renewal" }),
  });
  assert.match(decision.text, /คุยเรื่องนายแบบและส่งบรีฟ/);
  assert.match(decision.text, /ก่อนยืนยันงานหรือเปิดข้อมูลใหม่/);
  assert.match(decision.text, /sigil\/member\/membership\?source=line&intent=renew/);
  assert.doesNotMatch(decision.text, /MX17|น้องซิน|Private Model.*ชื่อ/i);
  assert.equal(decision.reply_source, "model_access_renewal");
});

test("committed model-access flag off makes no RPC call and stays silent", async () => {
  const calls = [];
  const decision = await resolveKenjiLineReply(lineEvent("MX17"), {}, {
    ...BASE_ENV,
    LINE_KENJI_MODEL_ACCESS_ENABLED: "false",
    ADMIN_WORKER: adminBinding({ ok: true, status: "match" }, 200, calls),
  });
  assert.equal(calls.length, 0);
  assert.equal(decision.text, "");
  assert.equal(decision.reply_source, "silent");
});

test("authorized RPC match becomes one concise Per Voice reply without operational fields", async () => {
  const calls = [];
  const decision = await resolveKenjiLineReply(lineEvent("MX17"), {}, {
    ...BASE_ENV,
    ADMIN_WORKER: adminBinding({
      ok: true,
      status: "match",
      policy_version: "KENJI_MODEL_ACCESS_V1",
      model: {
        model_code: "MX17",
        working_name: "น้องซิน",
        summary: "ข้อมูลแนะนำตัวที่อนุมัติแล้ว",
        image_url: "https://images.example.test/model.webp",
        phone: "0800000000",
        availability_status: "available",
      },
    }, 200, calls),
  });
  assert.equal(calls.length, 1);
  assert.match(decision.text, /น้องซิน/);
  assert.match(decision.text, /MX17/);
  assert.match(decision.text, /ครับ/);
  assert.doesNotMatch(decision.text, /0800000000|available|images\.example|ทีม|ระบบ/i);
  assert.equal(decision.reply_source, "model_access");

  const request = calls[0];
  assert.equal(new URL(request.url).hostname, "admin-worker.local");
  assert.equal(request.headers.get("x-mmd-service-binding"), "member-dashboard-chat-worker");
  assert.equal(request.headers.get("x-mmd-internal-call"), "true");
  assert.equal(request.headers.get("authorization"), "Bearer internal-token");
  assert.deepEqual(await request.json(), { line_user_id: LINE_USER_ID, query: "MX17" });
});

test("LINE lookup asks for the work brief and never exposes an unscoped RPC price", async () => {
  const model = { model_code: "MX17", working_name: "น้องซิน" };
  const reply = async (sales) => resolveKenjiLineReply(lineEvent("MX17"), {}, {
    ...BASE_ENV,
    ADMIN_WORKER: adminBinding({ ok: true, status: "match", model: { ...model, sales } }),
  });
  const approved = await reply({ sellable: true, price_visible: true, requires_per_approval: false, customer_rate_thb: 4500, term_summary: "เรทที่อนุมัติ" });
  assert.doesNotMatch(approved.text, /4,500/);
  assert.match(approved.text, /วัน เวลา สถานที่ และรูปแบบงาน/);
  for (const sales of [
    { sellable: true, price_visible: false, requires_per_approval: false, customer_rate_thb: 4500 },
    { sellable: true, price_visible: true, requires_per_approval: true, customer_rate_thb: 4500 },
    { sellable: false, price_visible: true, requires_per_approval: false, customer_rate_thb: 4500 },
  ]) {
    const withheld = await reply(sales);
    assert.doesNotMatch(withheld.text, /4,500/);
  }
});

test("thin adapter drops unsafe summary content even if a compromised RPC labels it safe", async () => {
  const decision = await resolveKenjiLineReply(lineEvent("MX17"), {}, {
    ...BASE_ENV,
    ADMIN_WORKER: adminBinding({
      ok: true,
      status: "match",
      model: {
        model_code: "MX17",
        working_name: "น้องซิน",
        summary: "ว่างคืนนี้ ติดต่อ LINE ID private-contact หรือโทร 0800000000",
      },
    }),
  });
  assert.match(decision.text, /น้องซิน.*MX17/s);
  assert.doesNotMatch(decision.text, /ว่างคืนนี้|LINE ID|0800000000/);
});

for (const [label, payload, status] of [
  ["unknown", { ok: true, status: "silent" }, 200],
  ["expired or unauthorized", { ok: true, status: "silent" }, 200],
  ["source failure", { ok: false, error: "model_access_unavailable" }, 503],
  ["malformed response", { ok: true, status: "match", model: { model_code: "MX17" } }, 200],
]) {
  test(`${label} result stays silent with no holding copy`, async () => {
    const decision = await resolveKenjiLineReply(lineEvent("MX17"), {}, {
      ...BASE_ENV,
      ADMIN_WORKER: adminBinding(payload, status),
    });
    assert.equal(decision.text, "");
    assert.equal(decision.reply_source, "silent");
    assert.doesNotMatch(decision.text, /เช็ก|ตรวจ|รอ|รับเรื่อง|ขอบคุณ|please wait|let me check/i);
  });
}

test("ambiguous authorized result asks one necessary clarification without listing models", async () => {
  const decision = await resolveKenjiLineReply(lineEvent("model ซิน"), {}, {
    ...BASE_ENV,
    ADMIN_WORKER: adminBinding({ ok: true, status: "clarification", policy_version: "KENJI_MODEL_ACCESS_V1" }),
  });
  assert.match(decision.text, /ชื่อที่ใช้ทำงานหรือรหัส Model/);
  assert.doesNotMatch(decision.text, /รายชื่อ|MX17|folder|แพ็กเกจ|สิทธิ์/);
  assert.equal(decision.reply_source, "model_access_clarification");
});

test("availability and manual-review messages never call the model access RPC", async () => {
  const calls = [];
  const env = { ...BASE_ENV, ADMIN_WORKER: adminBinding({ ok: true, status: "match" }, 200, calls) };
  const availability = await resolveKenjiLineReply(lineEvent("model MX17 ว่างคืนนี้ไหม"), {}, env);
  const review = await resolveKenjiLineReply(lineEvent("ขอให้เปอร์ตรวจ model MX17 เอง"), {}, env);
  assert.equal(calls.length, 0);
  assert.match(availability.text, /ยังยืนยันคิวหรือความพร้อม/);
  assert.equal(review.text, "");
});

test("silent RPC outcome returns webhook 200 with zero LINE Reply and Push calls", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  globalThis.fetch = async (input) => {
    networkCalls.push(String(input));
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(await signedWebhook([lineEvent("MX17")]), {
      ...BASE_ENV,
      ADMIN_WORKER: adminBinding({ ok: true, status: "silent", policy_version: "KENJI_MODEL_ACCESS_V1" }),
    });
    assert.equal(response.status, 200);
    assert.equal(networkCalls.filter((url) => url.includes("/v2/bot/message/reply")).length, 0);
    assert.equal(networkCalls.filter((url) => url.includes("/v2/bot/message/push")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authorized webhook match sends exactly one LINE Reply and never Push", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  globalThis.fetch = async (input, init = {}) => {
    networkCalls.push({ url: String(input), init });
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(await signedWebhook([lineEvent("MX17")]), {
      ...BASE_ENV,
      ADMIN_WORKER: adminBinding({
        ok: true,
        status: "match",
        policy_version: "KENJI_MODEL_ACCESS_V1",
        model: { model_code: "MX17", working_name: "น้องซิน", summary: "ข้อมูลที่อนุมัติแล้ว" },
      }),
    });
    assert.equal(response.status, 200);
    const replies = networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply"));
    assert.equal(replies.length, 1);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/push")).length, 0);
    const body = JSON.parse(replies[0].init.body);
    assert.equal(body.messages.length, 1);
    assert.match(body.messages[0].text, /น้องซิน.*MX17/s);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("JASPAL is campaign-scoped Jasper intent and never calls model access RPC", async () => {
  const calls = [];
  const decision = await resolveKenjiLineReply(lineEvent("JASPAL"), {}, {
    ...BASE_ENV,
    ADMIN_WORKER: adminBinding({ ok: true, status: "match", model: { model_code: "EMJASPAL", working_name: "Jaspal OP", summary: "ข้อมูลแนะนำตัวที่อนุมัติแล้ว" } }, 200, calls),
  }, { campaignLeadQueued: true });
  assert.equal(calls.length, 0);
  assert.match(decision.text, /เห็นว่าคุณสนใจการ์ดนี้/);
  assert.doesNotMatch(decision.text, /Jaspal OP|Jasper|เรท\s*\d/);
  assert.equal(decision.reply_source, "line_card_campaign_lead");
});

test("all eight campaign triggers accept a generic brief without model resolution or rates", async () => {
  const calls = [];
  const env = { ...BASE_ENV, ADMIN_WORKER: adminBinding({ ok: true, status: "match" }, 200, calls) };
  for (const trigger of ["JASPAL", "NANO", "EMs01", "Sky B", "BOOK EI", "EMs11", "GWs19", "EMs19"]) {
    const decision = await resolveKenjiLineReply(lineEvent(trigger), {}, env, { campaignLeadQueued: true });
    assert.equal(decision.reply_source, "line_card_campaign_lead");
    assert.match(decision.text, /วัน เวลา สถานที่ และรูปแบบงาน/);
    assert.doesNotMatch(decision.text, /บาท|โปรไฟล์|รหัส/);
  }
  assert.equal(calls.length, 0);
});

test("campaign lead is queued before one reply and duplicate delivery is idempotent", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  const binding = durableBinding();
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname === "api.airtable.com" && init.method === "POST") {
      return new Response(JSON.stringify({ id: "rec-line-card-lead" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: binding,
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    const first = await worker.fetch(await signedWebhook([lineEvent("JASPAL")], env), env);
    const second = await worker.fetch(await signedWebhook([lineEvent("JASPAL", { replyToken: "reply-token-2" })], env), env);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const posts = networkCalls.filter((call) => call.url.includes("api.airtable.com") && call.init.method === "POST");
    const replies = networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply"));
    assert.equal(posts.length, 1);
    assert.equal(replies.length, 1);
    const record = JSON.parse(posts[0].init.body);
    assert.equal(record.fields.intent, "note_only");
    const metadata = JSON.parse(record.fields.payload_json);
    assert.equal(metadata.parsed_intent, "card_campaign_lead");
    assert.equal(metadata.card_id, "21829530");
    assert.equal(metadata.card_trigger, "JASPAL");
    assert.equal(metadata.display_intent, "Jasper");
    assert.equal(metadata.model_resolution_status, "unresolved");
    assert.equal(metadata.canonical_model_id, null);
    assert.equal(metadata.auto_rate, "disabled");
    assert.equal(metadata.handoff_status, "queued");
    assert.doesNotMatch(replies[0].init.body, /Jaspal OP|Jasper|\d{1,3}(?:,\d{3})* บาท/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed owner queue creates no reply and releases the event for retry", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  const binding = durableBinding();
  let failQueue = true;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname === "api.airtable.com" && init.method === "POST") {
      if (failQueue) return new Response("queue unavailable", { status: 503 });
      return new Response(JSON.stringify({ id: "rec-retry-lead" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: binding,
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    await worker.fetch(await signedWebhook([lineEvent("NANO")], env), env);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
    failQueue = false;
    await worker.fetch(await signedWebhook([lineEvent("NANO", { replyToken: "reply-token-2" })], env), env);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Airtable 422 and transport failure keep the campaign silent and retryable", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  const binding = durableBinding();
  let postAttempt = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname === "api.airtable.com" && init.method === "POST") {
      postAttempt += 1;
      if (postAttempt === 1) return new Response("invalid field", { status: 422 });
      throw new Error("queue timeout");
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: binding,
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    await worker.fetch(await signedWebhook([lineEvent("GWs19")], env), env);
    await worker.fetch(await signedWebhook([lineEvent("GWs19", { replyToken: "reply-token-retry" })], env), env);
    assert.equal(postAttempt, 2);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing stable message ID and takeover source failure create no owner lead or reply", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const networkCalls = [];
  const diagnostics = [];
  let ownerLookupAttempt = 0;
  console.log = (value) => {
    try {
      const parsed = JSON.parse(String(value));
      if (parsed?.line_webhook === "reply_diagnostics") diagnostics.push(parsed);
    } catch (_) {}
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      ownerLookupAttempt += 1;
      if (ownerLookupAttempt === 1) {
        return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("owner source unavailable", { status: 503 });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: durableBinding(),
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    const missingId = lineEvent("EMs01", { message: { type: "text", text: "EMs01" } });
    await worker.fetch(await signedWebhook([missingId], env), env);
    await worker.fetch(await signedWebhook([lineEvent("EMs11")], env), env);
    assert.equal(networkCalls.filter((call) => call.url.includes("api.airtable.com") && call.init.method === "POST").length, 0);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
    assert.deepEqual(diagnostics.map((entry) => entry.campaign_lead_reason), ["stable_message_id_missing", "takeover_lookup_failed"]);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalConsoleLog;
  }
});

test("next customer message is queued as the attributed campaign brief before acknowledgement", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  const binding = durableBinding();
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname === "api.airtable.com" && init.method === "POST") {
      return new Response(JSON.stringify({ id: `rec-${networkCalls.length}` }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: binding,
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    await worker.fetch(await signedWebhook([lineEvent("JASPAL")], env), env);
    const briefEvent = lineEvent("พรุ่งนี้สองทุ่ม แถวสาทร งานดินเนอร์", {
      replyToken: "reply-token-brief",
      message: { id: "msg-campaign-brief-1", type: "text", text: "พรุ่งนี้สองทุ่ม แถวสาทร งานดินเนอร์" },
    });
    await worker.fetch(await signedWebhook([briefEvent], env), env);

    const posts = networkCalls.filter((call) => call.url.includes("api.airtable.com") && call.init.method === "POST");
    const replies = networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply"));
    assert.equal(posts.length, 2);
    assert.equal(replies.length, 2);
    const briefRecord = JSON.parse(posts[1].init.body);
    const metadata = JSON.parse(briefRecord.fields.payload_json);
    assert.equal(briefRecord.fields.intent, "note_only");
    assert.equal(metadata.parsed_intent, "card_campaign_brief");
    assert.equal(metadata.campaign_key, "line_card_21829530_lead_v1");
    assert.equal(metadata.card_trigger, "JASPAL");
    assert.equal(metadata.display_intent, "Jasper");
    assert.equal(metadata.lead_stage, "brief_received");
    assert.equal(metadata.auto_rate, "disabled");
    assert.match(replies[1].init.body, /รับรายละเอียดแล้ว/);
    assert.doesNotMatch(replies[1].init.body, /บาท|โปรไฟล์|รหัส/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("active owner takeover suppresses campaign queue and Kenji reply", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      return new Response(JSON.stringify({ records: [{ id: "rec-owner-processing" }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: durableBinding(),
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    await worker.fetch(await signedWebhook([lineEvent("EMs19")], env), env);
    assert.equal(networkCalls.filter((call) => call.url.includes("api.airtable.com") && call.init.method === "POST").length, 0);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
