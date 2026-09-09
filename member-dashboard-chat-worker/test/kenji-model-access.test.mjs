import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import worker, {
  createLineSignature,
  extractKenjiModelLookupQuery,
  extractKenjiModelVerificationEmail,
  inferLineIntent,
  KenjiModelIdempotency,
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

test("committed rollout configuration keeps both model capabilities off and exposes no public admin RPC route", () => {
  const lineWrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const adminWrangler = readFileSync(new URL("../../admin-worker/wrangler.toml", import.meta.url), "utf8");
  assert.match(lineWrangler, /^LINE_KENJI_MODEL_ENABLED\s*=\s*"false"$/m);
  assert.match(lineWrangler, /^LINE_KENJI_MODEL_ACCESS_ENABLED\s*=\s*"false"$/m);
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

test("model lookup intent accepts neutral exact codes and explicit working-name queries", () => {
  assert.equal(extractKenjiModelLookupQuery("MX17"), "MX17");
  assert.equal(extractKenjiModelLookupQuery("model MX17 ครับ"), "MX17");
  assert.equal(extractKenjiModelLookupQuery("ชื่อนายแบบ น้องซิน"), "น้องซิน");
  assert.equal(extractKenjiModelLookupQuery("สวัสดีครับ"), "");
  assert.equal(inferLineIntent("MX17", lineEvent("MX17")), "model_lookup");
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

test("inactive or expired member receives only canonical renewal guidance", async () => {
  const decision = await resolveKenjiLineReply(lineEvent("MX17"), {}, {
    ...BASE_ENV,
    ADMIN_WORKER: adminBinding({ ok: true, status: "renewal" }),
  });
  assert.match(decision.text, /หมดอายุหรือยังไม่ active/);
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
