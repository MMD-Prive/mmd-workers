import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import route from "../src/mms-line-front-gate-runtime.js";
import { createLineSignature, KenjiModelIdempotency } from "../src/index.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const PILOT_HASH = createHash("sha256").update(LINE_USER_ID).digest("hex");

function durableBinding({ contextPutFailures = 0, ingressEnqueueFailures = 0, ingressAlarmFailures = 0 } = {}) {
  const objects = new Map();
  let runtimeEnv = {};
  return {
    setEnv(env) { runtimeEnv = env; },
    objects,
    idFromName(name) { return name; },
    get(id) {
      if (!objects.has(id)) {
        const values = new Map();
        let alarmAt = null;
        let activeTransaction = null;
        let transactions = Promise.resolve();
        const storage = {
          async get(key) { return values.get(key); },
          async put(key, value) { values.set(key, value); },
          async delete(key) { values.delete(key); },
          async list({ prefix = "" } = {}) { return new Map([...values].filter(([key]) => key.startsWith(prefix))); },
          async getAlarm() { return alarmAt; },
          async setAlarm(value) {
            if (ingressAlarmFailures > 0) {
              ingressAlarmFailures -= 1;
              throw new Error("alarm_write_failed");
            }
            if (activeTransaction) activeTransaction.alarmAt = value;
            else alarmAt = value;
          },
          async transaction(callback) {
            const result = transactions.then(async () => {
              const staged = new Map(values);
              const stagedTransaction = { alarmAt };
              activeTransaction = stagedTransaction;
              const txn = {
                async get(key) { return staged.get(key); },
                async put(key, value) { staged.set(key, value); },
                async delete(key) { staged.delete(key); },
                async list({ prefix = "" } = {}) { return new Map([...staged].filter(([key]) => key.startsWith(prefix))); },
              };
              try {
                const value = await callback(txn);
                values.clear();
                for (const [key, item] of staged) values.set(key, item);
                alarmAt = stagedTransaction.alarmAt;
                return value;
              } finally {
                activeTransaction = null;
              }
            });
            transactions = result.catch(() => {});
            return result;
          },
        };
        objects.set(id, new KenjiModelIdempotency({ storage }, runtimeEnv));
      }
      return { fetch: (input, init) => {
        if (String(input).includes("/campaign-lead/ingress") && ingressEnqueueFailures > 0 && JSON.parse(init?.body || "{}").action === "enqueue") {
          ingressEnqueueFailures -= 1;
          return Response.json({ ok: false }, { status: 503 });
        }
        if (String(input).includes("/campaign-lead/context") && contextPutFailures > 0 && JSON.parse(init?.body || "{}").action === "put") {
          contextPutFailures -= 1;
          return Response.json({ ok: false }, { status: 503 });
        }
        return objects.get(id).fetch(new Request(input, init));
      } };
    },
  };
}

function lineEvent(text, id, overrides = {}) {
  return {
    type: "message",
    mode: "active",
    replyToken: `reply-${id}`,
    source: { type: "user", userId: LINE_USER_ID },
    message: { id, type: "text", text },
    ...overrides,
  };
}

function productionLineEvent(text, id, webhookEventId = `webhook-${id}`, overrides = {}) {
  return lineEvent(text, id, { webhookEventId, ...overrides });
}

function unsendEvent(messageId, id = `unsend-${messageId}`) {
  return { type: "unsend", mode: "active", webhookEventId: id, source: { type: "user", userId: LINE_USER_ID }, unsend: { messageId } };
}

async function signedWebhook(events, env) {
  const body = JSON.stringify({ events });
  return new Request("https://mmdbkk.com/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": await createLineSignature(body, env.LINE_CHANNEL_SECRET) },
    body,
  });
}

function fixture({ queueStatus = 200, queueThrows = false, queueAmbiguous = false, flags = true, ownerActive = false, contextPutFailures = 0, ingressEnqueueFailures = 0, ingressAlarmFailures = 0, pilotHashes = PILOT_HASH } = {}) {
  const calls = [];
  const records = new Map();
  const env = {
    LINE_CHANNEL_SECRET: "line-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    LINE_AUTO_REPLY_ENABLED: "false",
    LINE_KENJI_AI_ENABLED: "true",
    LINE_FIRST_CONTACT_ENABLED: "false",
    LINE_CARD_21829530_LEAD_ENABLED: flags ? "true" : "false",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: flags ? "true" : "false",
    LINE_CARD_21829530_PILOT_HASHES: pilotHashes,
    LINE_KENJI_MODEL_ENABLED: "false",
    KENJI_LINE_CONTINUITY_ENABLED: "false",
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "base-id",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    INTERNAL_TOKEN: "internal-token",
    TELEGRAM_CHAT_ID: "ops-chat",
    TELEGRAM_WORKER: { fetch: async (input, init) => { calls.push({ type: "owner_alert", body: input instanceof Request ? await input.json() : JSON.parse(init.body) }); return Response.json({ ok: true }); } },
    KENJI_MODEL_DEDUPE: durableBinding({ contextPutFailures, ingressEnqueueFailures, ingressAlarmFailures }),
    ADMIN_WORKER: { fetch: async () => new Response(JSON.stringify({ ok: true, controls: {
      line_oa_auto_reply: false,
      model_keyword_auto_reply: false,
      all_kenji_mutations: false,
    } }), { status: 200, headers: { "content-type": "application/json" } }) },
  };
  env.KENJI_MODEL_DEDUPE.setEnv(env);
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "api.airtable.com") {
      if (init.method === "GET") {
        const formula = url.searchParams.get("filterByFormula") || "";
        if (formula.includes("{status}=\"processing\"")) {
          return Response.json({ records: ownerActive ? [{ id: "rec-owner" }] : [] });
        }
        const match = formula.match(/\{inbox_id\}="([^"]+)"/);
        return Response.json({ records: match && records.has(match[1]) ? [records.get(match[1])] : [] });
      }
      if (init.method === "POST") {
        const record = JSON.parse(init.body);
        if (!record.fields?.inbox_id) return Response.json({ id: "rec-trace" });
        calls.push({ type: "queue", body: record });
        if (queueThrows) throw new Error("queue_timeout");
        if (queueStatus !== 200) return new Response("queue failed", { status: queueStatus });
        const saved = { id: `rec-${records.size + 1}`, fields: record.fields };
        records.set(record.fields.inbox_id, saved);
        if (queueAmbiguous) throw new Error("queue_response_lost_after_write");
        return Response.json(saved);
      }
      if (init.method === "PATCH") {
        const id = decodeURIComponent(url.pathname.split("/").pop());
        const saved = [...records.values()].find((record) => record.id === id);
        if (!saved) return new Response("missing", { status: 404 });
        Object.assign(saved.fields, JSON.parse(init.body).fields || {});
        calls.push({ type: "redact", body: JSON.parse(init.body) });
        return Response.json(saved);
      }
    }
    if (url.hostname === "api.line.me" && url.pathname === "/v2/bot/message/reply") {
      calls.push({ type: "reply", body: JSON.parse(init.body) });
      return Response.json({});
    }
    throw new Error(`unexpected request ${url.hostname}${url.pathname}`);
  };
  return { env, calls, records, fetch, setQueueStatus(status) { queueStatus = status; }, setQueueAmbiguous(value) { queueAmbiguous = value; } };
}

async function withFetch(mock, action) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await action(); } finally { globalThis.fetch = original; }
}

test("production route queues JASPER and its linked brief before one reply each with global auto-reply off", async () => {
  const f = fixture();
  await withFetch(f.fetch, async () => {
    const lead = await route.fetch(await signedWebhook([lineEvent("JASPER", "msg-lead-1")], f.env), f.env);
    const brief = await route.fetch(await signedWebhook([lineEvent("จองพรุ่งนี้สองทุ่ม แถวสาทร", "msg-brief-1")], f.env), f.env);
    assert.equal(lead.status, 200);
    assert.equal(brief.status, 200);
  });
  assert.deepEqual(f.calls.map((call) => call.type), ["queue", "reply", "queue", "reply"]);
  assert.equal(JSON.parse(f.records.get("line_msg-brief-1").fields.payload_json).lead_inbox_id, "line_msg-lead-1");
  assert.doesNotMatch(JSON.stringify(f.calls.filter((call) => call.type === "reply")), /Jasper|บาท|โปรไฟล์|canonical_model_id|private_media/);
  assert.equal(f.env.LINE_AUTO_REPLY_ENABLED, "false");
});

test("ack-first production route completes campaign queue and reply in waitUntil", async () => {
  const f = fixture();
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
  const startedAt = performance.now();
  await withFetch(f.fetch, async () => {
    const response = await route.fetch(await signedWebhook([lineEvent("JASPER", "msg-ack-first")], f.env), f.env, ctx);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-line-ack"), "ack-first-v1");
    assert.ok(performance.now() - startedAt < 2000);
    for (let round = 0; round < 5; round += 1) {
      const count = pending.length;
      await Promise.all(pending);
      if (pending.length === count) break;
    }
  });
  assert.deepEqual(f.calls.map((call) => call.type), ["queue", "reply"]);
});

test("durable ingress retains post-200 Airtable 422 for explicit reprocess", async () => {
  const f = fixture({ queueStatus: 422 });
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
  await withFetch(f.fetch, async () => {
    const response = await route.fetch(await signedWebhook([lineEvent("JASPER", "msg-ack-failed")], f.env), f.env, ctx);
    assert.equal(response.status, 200);
    for (let round = 0; round < 5; round += 1) {
      const count = pending.length;
      await Promise.all(pending);
      if (pending.length === count) break;
    }
  });
  assert.equal(f.calls.filter((call) => call.type === "queue").length, 1);
  assert.equal(f.calls.filter((call) => call.type === "reply").length, 0);
  assert.equal(f.records.has("line_msg-ack-failed"), false);
  const key = createHash("sha256").update("msg-ack-failed").digest("hex");
  const stub = f.env.KENJI_MODEL_DEDUPE.get(f.env.KENJI_MODEL_DEDUPE.idFromName(`line-card-ingress-v1:${key}`));
  const action = async (name) => (await stub.fetch("https://kenji-model-dedupe.internal/campaign-lead/ingress", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: name }),
  })).json();
  const deadStatus = await action("status");
  assert.equal(deadStatus.status, "dead");
  assert.equal(f.calls.filter((call) => call.type === "owner_alert").length, 1, JSON.stringify(deadStatus));
  assert.doesNotMatch(JSON.stringify(f.calls.find((call) => call.type === "owner_alert")), new RegExp(`${LINE_USER_ID}|JASPER`));
  const receiptId = createHash("sha256").update("msg-ack-failed").digest("hex");
  const ownerUrl = "https://mmdbkk.com/v1/internal/line/card-21829530/ingress";
  assert.equal((await route.fetch(new Request(ownerUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status", receipt_id: receiptId }) }), f.env)).status, 401);
  const ownerStatus = await route.fetch(new Request(ownerUrl, { method: "POST", headers: { authorization: "Bearer internal-token", "content-type": "application/json" }, body: JSON.stringify({ action: "status", receipt_id: receiptId }) }), f.env);
  assert.equal((await ownerStatus.json()).status, "dead");
  f.setQueueStatus(200);
  await withFetch(f.fetch, async () => {
    const reprocess = await route.fetch(new Request(ownerUrl, { method: "POST", headers: { authorization: "Bearer internal-token", "content-type": "application/json" }, body: JSON.stringify({ action: "reprocess", receipt_id: receiptId }) }), f.env);
    assert.equal((await reprocess.json()).reprocessed, true);
    assert.equal((await action("process")).status, "done");
  });
  assert.equal(f.records.has("line_msg-ack-failed"), true);
  assert.equal(f.calls.filter((call) => call.type === "reply").length, 1);
  assert.equal(f.calls.filter((call) => call.type === "owner_alert").length, 1);
});

test("durable ingress write failure returns 503 before a webhook acknowledgement", async () => {
  const f = fixture({ ingressEnqueueFailures: 1 });
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
  await withFetch(f.fetch, async () => {
    const response = await route.fetch(await signedWebhook([lineEvent("JASPER", "msg-ingress-failed")], f.env), f.env, ctx);
    assert.equal(response.status, 503);
    await Promise.all(pending);
  });
  assert.equal(f.calls.filter((call) => call.type === "queue").length, 0);
  assert.equal(f.calls.filter((call) => call.type === "reply").length, 0);
});

test("alarm write failure rolls back the event receipt before HTTP 200", async () => {
  const f = fixture({ ingressAlarmFailures: 1 });
  const eventId = "msg-alarm-failed";
  const response = await withFetch(f.fetch, async () => route.fetch(
    await signedWebhook([lineEvent("JASPER", eventId)], f.env),
    f.env,
    { waitUntil() {} },
  ));
  assert.equal(response.status, 503);
  const key = createHash("sha256").update(eventId).digest("hex");
  const stub = f.env.KENJI_MODEL_DEDUPE.get(f.env.KENJI_MODEL_DEDUPE.idFromName(`line-card-ingress-v1:${key}`));
  const status = await stub.fetch("https://kenji-model-dedupe.internal/campaign-lead/ingress", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status" }),
  });
  assert.equal((await status.json()).found, false);
});

test("unsend before processing leaves a cancellation tombstone and blocks later redelivery", async () => {
  const f = fixture();
  const eventId = "msg-unsent-first";
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
  await withFetch(f.fetch, async () => {
    assert.equal((await route.fetch(await signedWebhook([unsendEvent(eventId)], f.env), f.env, ctx)).status, 200);
    assert.equal((await route.fetch(await signedWebhook([lineEvent("JASPER", eventId)], f.env), f.env, ctx)).status, 200);
    await Promise.all(pending);
  });
  assert.equal(f.records.has(`line_${eventId}`), false);
  assert.equal(f.calls.filter((call) => call.type === "reply").length, 0);
  const key = createHash("sha256").update(eventId).digest("hex");
  const stub = f.env.KENJI_MODEL_DEDUPE.get(f.env.KENJI_MODEL_DEDUPE.idFromName(`line-card-ingress-v1:${key}`));
  const status = await stub.fetch("https://kenji-model-dedupe.internal/campaign-lead/ingress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status" }) });
  assert.equal((await status.json()).status, "cancelled");
});

test("unsend after processing redacts the Inbox record and preserves a cancellation tombstone", async () => {
  const f = fixture();
  const eventId = "msg-unsent-after";
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
  await withFetch(f.fetch, async () => {
    await route.fetch(await signedWebhook([lineEvent("JASPER", eventId)], f.env), f.env, ctx);
    for (let round = 0; round < 5; round += 1) {
      const count = pending.length;
      await Promise.all(pending);
      if (pending.length === count) break;
    }
    assert.equal((await route.fetch(await signedWebhook([unsendEvent(eventId)], f.env), f.env, ctx)).status, 200);
  });
  const record = f.records.get(`line_${eventId}`);
  assert.equal(record.fields.line_user_id, "");
  assert.equal(record.fields.admin_note, "[LINE message unsent]");
  assert.equal(JSON.parse(record.fields.payload_json).unsent, true);
  assert.equal(f.calls.filter((call) => call.type === "redact").length, 1);
  const key = createHash("sha256").update(eventId).digest("hex");
  const stub = f.env.KENJI_MODEL_DEDUPE.get(f.env.KENJI_MODEL_DEDUPE.idFromName(`line-card-ingress-v1:${key}`));
  const status = await stub.fetch("https://kenji-model-dedupe.internal/campaign-lead/ingress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status" }) });
  assert.equal((await status.json()).cleanup_pending, false);
});

test("unsend uses LINE message ID when webhookEventId differs from the original message ID", async () => {
  const f = fixture();
  const messageId = "msg-unsent-real-shape";
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
  await withFetch(f.fetch, async () => {
    await route.fetch(await signedWebhook([productionLineEvent("JASPER", messageId)], f.env), f.env, ctx);
    for (let round = 0; round < 5; round += 1) {
      const count = pending.length;
      await Promise.all(pending);
      if (pending.length === count) break;
    }
    assert.equal((await route.fetch(await signedWebhook([unsendEvent(messageId)], f.env), f.env, ctx)).status, 200);
  });
  const record = f.records.get(`line_${messageId}`);
  assert.equal(record.fields.line_user_id, "");
  assert.equal(record.fields.admin_note, "[LINE message unsent]");
  assert.equal(f.calls.filter((call) => call.type === "redact").length, 1);
  const key = createHash("sha256").update(messageId).digest("hex");
  const stub = f.env.KENJI_MODEL_DEDUPE.get(f.env.KENJI_MODEL_DEDUPE.idFromName(`line-card-ingress-v1:${key}`));
  const status = await stub.fetch("https://kenji-model-dedupe.internal/campaign-lead/ingress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status" }) });
  assert.equal((await status.json()).status, "cancelled");
});

test("invalid LINE signature cannot create a durable campaign receipt", async () => {
  const f = fixture();
  const request = await signedWebhook([lineEvent("JASPER", "msg-bad-signature")], f.env);
  request.headers.set("x-line-signature", "invalid");
  const pending = [];
  await withFetch(f.fetch, async () => {
    const response = await route.fetch(request, f.env, { waitUntil(promise) { pending.push(Promise.resolve(promise)); } });
    assert.notEqual(response.status, 200);
    await Promise.all(pending);
  });
  const key = createHash("sha256").update("msg-bad-signature").digest("hex");
  assert.equal(f.env.KENJI_MODEL_DEDUPE.objects.has(`line-card-ingress-v1:${key}`), false);
  assert.equal(f.calls.filter((call) => call.type === "queue" || call.type === "reply").length, 0);
});

test("one signed webhook with lead and following brief journals both before HTTP 200", async () => {
  const f = fixture();
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
  await withFetch(f.fetch, async () => {
    const response = await route.fetch(await signedWebhook([
      lineEvent("JASPER", "msg-batch-lead"),
      lineEvent("พรุ่งนี้สองทุ่ม แถวสาทร", "msg-batch-brief"),
    ], f.env), f.env, ctx);
    assert.equal(response.status, 200);
    const briefKey = createHash("sha256").update("msg-batch-brief").digest("hex");
    const briefStub = f.env.KENJI_MODEL_DEDUPE.get(f.env.KENJI_MODEL_DEDUPE.idFromName(`line-card-ingress-v1:${briefKey}`));
    const receipt = await briefStub.fetch("https://kenji-model-dedupe.internal/campaign-lead/ingress", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status" }),
    });
    assert.equal((await receipt.json()).found, true);
    for (let round = 0; round < 6; round += 1) {
      const count = pending.length;
      await Promise.all(pending);
      if (pending.length === count) break;
    }
  });
  assert.equal(f.records.has("line_msg-batch-lead"), true);
  assert.equal(f.records.has("line_msg-batch-brief"), true);
  assert.equal(JSON.parse(f.records.get("line_msg-batch-brief").fields.payload_json).lead_inbox_id, "line_msg-batch-lead");
});

test("reordered brief waits for source lead instead of entering Inbox as ordinary text", async () => {
  const f = fixture();
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
  await withFetch(f.fetch, async () => {
    const response = await route.fetch(await signedWebhook([
      lineEvent("พรุ่งนี้สองทุ่ม แถวสาทร", "msg-reordered-brief"),
      lineEvent("JASPER", "msg-reordered-lead"),
    ], f.env), f.env, ctx);
    assert.equal(response.status, 200);
    for (let round = 0; round < 6; round += 1) {
      const count = pending.length;
      await Promise.all(pending);
      if (pending.length === count) break;
    }
    assert.equal(f.records.has("line_msg-reordered-brief"), false);
    assert.equal(f.records.has("line_msg-reordered-lead"), true);
    const key = createHash("sha256").update("msg-reordered-brief").digest("hex");
    const stub = f.env.KENJI_MODEL_DEDUPE.get(f.env.KENJI_MODEL_DEDUPE.idFromName(`line-card-ingress-v1:${key}`));
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 2000;
      const result = await stub.fetch("https://kenji-model-dedupe.internal/campaign-lead/ingress", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "process" }),
      });
      assert.equal((await result.json()).status, "done");
    } finally { Date.now = realNow; }
  });
  assert.equal(JSON.parse(f.records.get("line_msg-reordered-brief").fields.payload_json).lead_inbox_id, "line_msg-reordered-lead");
});

test("Durable Object alarm recovers a persisted lead after processor restart", async () => {
  const f = fixture();
  const event = lineEvent("JASPER", "msg-restart");
  const key = createHash("sha256").update("msg-restart").digest("hex");
  const id = f.env.KENJI_MODEL_DEDUPE.idFromName(`line-card-ingress-v1:${key}`);
  const stub = f.env.KENJI_MODEL_DEDUPE.get(id);
  const enqueue = await stub.fetch("https://kenji-model-dedupe.internal/campaign-lead/ingress", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "enqueue", event, receipt_id: key }),
  });
  assert.equal((await enqueue.json()).accepted, true);
  const old = f.env.KENJI_MODEL_DEDUPE.objects.get(id);
  const restarted = new KenjiModelIdempotency(old.state, f.env);
  f.env.KENJI_MODEL_DEDUPE.objects.set(id, restarted);
  await withFetch(f.fetch, async () => restarted.alarm());
  assert.equal(f.records.has("line_msg-restart"), true);
  assert.equal((await (await stub.fetch("https://kenji-model-dedupe.internal/campaign-lead/ingress", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status" }),
  })).json()).status, "done");
});

test("expired processing lease is recovered by an alarm after a worker crash", async () => {
  const f = fixture();
  const event = lineEvent("JASPER", "msg-crashed-lease");
  const key = createHash("sha256").update("msg-crashed-lease").digest("hex");
  const id = f.env.KENJI_MODEL_DEDUPE.idFromName(`line-card-ingress-v1:${key}`);
  const stub = f.env.KENJI_MODEL_DEDUPE.get(id);
  await stub.fetch("https://kenji-model-dedupe.internal/campaign-lead/ingress", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "enqueue", event, receipt_id: key }),
  });
  const old = f.env.KENJI_MODEL_DEDUPE.objects.get(id);
  const stored = await old.state.storage.get("campaign-ingress:event");
  await old.state.storage.put("campaign-ingress:event", { ...stored, status: "processing", lease_token: "abandoned-lease", lease_expires_at: Date.now() - 1 });
  const restarted = new KenjiModelIdempotency(old.state, f.env);
  f.env.KENJI_MODEL_DEDUPE.objects.set(id, restarted);
  await withFetch(f.fetch, () => restarted.alarm());
  assert.equal(f.records.has("line_msg-crashed-lease"), true);
  const status = await restarted.fetch(new Request("https://kenji-model-dedupe.internal/campaign-lead/ingress", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status" }),
  }));
  assert.equal((await status.json()).status, "done");
});

test("expired reply token keeps the lead and suppresses customer reply", async () => {
  const f = fixture();
  const event = lineEvent("JASPER", "msg-expired-token", { timestamp: Date.now() - 61_000 });
  const key = createHash("sha256").update("msg-expired-token").digest("hex");
  const stub = f.env.KENJI_MODEL_DEDUPE.get(f.env.KENJI_MODEL_DEDUPE.idFromName(`line-card-ingress-v1:${key}`));
  await stub.fetch("https://kenji-model-dedupe.internal/campaign-lead/ingress", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "enqueue", event, receipt_id: key }),
  });
  await withFetch(f.fetch, async () => stub.fetch("https://kenji-model-dedupe.internal/campaign-lead/ingress", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "process" }),
  }));
  assert.equal(f.records.has("line_msg-expired-token"), true);
  assert.equal(f.calls.filter((call) => call.type === "reply").length, 0);
});

test("ambiguous Airtable write recovers by logical Inbox ID after claim lease", async () => {
  const f = fixture({ queueAmbiguous: true });
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
  const key = createHash("sha256").update("msg-ambiguous").digest("hex");
  const stub = f.env.KENJI_MODEL_DEDUPE.get(f.env.KENJI_MODEL_DEDUPE.idFromName(`line-card-ingress-v1:${key}`));
  await withFetch(f.fetch, async () => {
    const response = await route.fetch(await signedWebhook([lineEvent("JASPER", "msg-ambiguous")], f.env), f.env, ctx);
    assert.equal(response.status, 200);
    for (let round = 0; round < 5; round += 1) {
      const count = pending.length;
      await Promise.all(pending);
      if (pending.length === count) break;
    }
    assert.equal(f.records.has("line_msg-ambiguous"), true);
    assert.equal(f.calls.filter((call) => call.type === "reply").length, 0);
    f.setQueueAmbiguous(false);
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 63_000;
      const result = await stub.fetch("https://kenji-model-dedupe.internal/campaign-lead/ingress", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "process" }),
      });
      assert.equal((await result.json()).status, "done");
    } finally { Date.now = realNow; }
  });
  assert.equal(f.calls.filter((call) => call.type === "queue").length, 1);
  assert.equal(f.calls.filter((call) => call.type === "reply").length, 0);
});

test("redelivery reuses one durable receipt and sends one campaign reply", async () => {
  const f = fixture();
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
  await withFetch(f.fetch, async () => {
    await route.fetch(await signedWebhook([lineEvent("JASPER", "msg-redelivered")], f.env), f.env, ctx);
    for (let round = 0; round < 5; round += 1) {
      const count = pending.length;
      await Promise.all(pending);
      if (pending.length === count) break;
    }
    await route.fetch(await signedWebhook([lineEvent("JASPER", "msg-redelivered", { deliveryContext: { isRedelivery: true } })], f.env), f.env, ctx);
    await Promise.all(pending);
  });
  assert.equal(f.calls.filter((call) => call.type === "queue").length, 1);
  assert.equal(f.calls.filter((call) => call.type === "reply").length, 1);
});

test("nonpilot hash creates no campaign receipt or reply", async () => {
  const f = fixture({ pilotHashes: "" });
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
  await withFetch(f.fetch, async () => {
    await route.fetch(await signedWebhook([lineEvent("JASPER", "msg-nonpilot")], f.env), f.env, ctx);
    for (let round = 0; round < 5; round += 1) {
      const count = pending.length;
      await Promise.all(pending);
      if (pending.length === count) break;
    }
  });
  const key = createHash("sha256").update("msg-nonpilot").digest("hex");
  assert.equal(f.env.KENJI_MODEL_DEDUPE.objects.has(`line-card-ingress-v1:${key}`), false);
  assert.equal(f.calls.filter((call) => call.type === "reply").length, 0);
});

test("production route keeps campaign silent on queue failure, disabled flags, and duplicate delivery", async () => {
  for (const options of [{ queueStatus: 422 }, { queueThrows: true }, { flags: false }, { ownerActive: true }]) {
    const f = fixture(options);
    await withFetch(f.fetch, async () => route.fetch(await signedWebhook([lineEvent("JASPER", "msg-failed")], f.env), f.env));
    assert.equal(f.calls.filter((call) => call.type === "reply").length, 0);
  }
  const f = fixture();
  await withFetch(f.fetch, async () => {
    await route.fetch(await signedWebhook([lineEvent("JASPER", "msg-once")], f.env), f.env);
    await route.fetch(await signedWebhook([lineEvent("JASPER", "msg-once", { deliveryContext: { isRedelivery: true } })], f.env), f.env);
  });
  assert.equal(f.calls.filter((call) => call.type === "queue").length, 1);
  assert.equal(f.calls.filter((call) => call.type === "reply").length, 1);
});

test("production route follows the exact LINE Card action text contract", async () => {
  for (const [text, expectedQueue] of [
    ["JASPER", 1], ["BOOK EI", 1], ["JASPAL", 0], ["Book EI", 0],
    ["Sky B", 0], ["https://mmdbkk.com/my-mmd", 0],
  ]) {
    const f = fixture();
    await withFetch(f.fetch, async () => route.fetch(await signedWebhook([lineEvent(text, "msg-trigger")], f.env), f.env));
    const campaignLeads = f.calls.filter((call) => call.type === "queue" && JSON.parse(call.body.fields.payload_json).parsed_intent === "card_campaign_lead");
    assert.equal(campaignLeads.length, expectedQueue, text);
    assert.equal(f.calls.filter((call) => call.type === "reply").length, expectedQueue, text);
  }
  const group = fixture();
  await withFetch(group.fetch, async () => route.fetch(await signedWebhook([
    lineEvent("JASPER", "msg-group", { source: { type: "group", userId: LINE_USER_ID, groupId: "C123" } }),
  ], group.env), group.env));
  const groupCampaigns = group.calls.filter((call) => call.type === "queue" && JSON.parse(call.body.fields.payload_json).parsed_intent === "card_campaign_lead");
  assert.equal(groupCampaigns.length, 0);
  assert.equal(group.calls.filter((call) => call.type === "reply").length, 0);
});

test("context failure retries the same lead without a duplicate Inbox record", async () => {
  const f = fixture({ contextPutFailures: 1 });
  await withFetch(f.fetch, async () => {
    await route.fetch(await signedWebhook([lineEvent("JASPER", "msg-retry")], f.env), f.env);
    assert.equal(f.calls.filter((call) => call.type === "reply").length, 0);
    await route.fetch(await signedWebhook([lineEvent("JASPER", "msg-retry")], f.env), f.env);
  });
  assert.equal(f.calls.filter((call) => call.type === "queue").length, 1);
  assert.equal(f.calls.filter((call) => call.type === "reply").length, 1);
});

test("brief claim is restricted to its LINE subject and consumed once under concurrency", async () => {
  const otherUserId = "Uabcdef1234567890abcdef1234567890";
  const otherHash = createHash("sha256").update(otherUserId).digest("hex");
  const f = fixture({ pilotHashes: `${PILOT_HASH},${otherHash}` });
  await withFetch(f.fetch, async () => {
    await route.fetch(await signedWebhook([lineEvent("JASPER", "msg-subject-lead")], f.env), f.env);
    const wrongSubject = lineEvent("พรุ่งนี้สองทุ่ม", "msg-other-subject", { source: { type: "user", userId: otherUserId } });
    await route.fetch(await signedWebhook([wrongSubject], f.env), f.env);
    const briefs = ["msg-brief-a", "msg-brief-b"].map(async (id) =>
      route.fetch(await signedWebhook([lineEvent("พรุ่งนี้สองทุ่ม", id)], f.env), f.env));
    await Promise.all(briefs);
  });
  const briefs = f.calls.filter((call) => call.type === "queue" && JSON.parse(call.body.fields.payload_json).parsed_intent === "card_campaign_brief");
  assert.equal(briefs.length, 1);
  assert.equal(JSON.parse(briefs[0].body.fields.payload_json).lead_inbox_id, "line_msg-subject-lead");
  assert.equal(f.calls.filter((call) => call.type === "reply").length, 2);
});

test("campaign context rejects wrong campaign and stale or replayed consume tokens", async () => {
  const binding = durableBinding();
  const object = binding.get(binding.idFromName(`kenji-line-card-21829530-context-v1:${PILOT_HASH}`));
  const action = async (name, context = {}) => {
    const response = await object.fetch("https://kenji-model-dedupe.internal/campaign-lead/context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: name, context }),
    });
    return { status: response.status, body: await response.json() };
  };
  const leadContext = { card_id: "21829530", card_trigger: "JASPER", campaign_key: "line_card_21829530_lead_v1", lead_inbox_id: "line_msg-lead", lead_claim_key: "a".repeat(64), lead_claim_token: "12345678-1234-1234-1234-123456789abc" };
  assert.equal((await action("put", { ...leadContext, campaign_key: "wrong_campaign" })).status, 400);
  assert.equal((await action("put", leadContext)).status, 200);
  const first = (await action("claim")).body;
  assert.equal(first.claimed, true);
  assert.equal((await action("claim")).body.claimed, false);
  assert.equal((await action("commit", { claim_token: "stale-token" })).body.committed, false);
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 61_000;
    assert.equal((await action("commit", { claim_token: first.claim_token })).body.committed, false);
    const second = (await action("claim")).body;
    assert.equal(second.claimed, true);
    assert.equal((await action("release", { claim_token: first.claim_token })).body.released, false);
    assert.equal((await action("commit", { claim_token: second.claim_token })).body.committed, true);
    assert.equal((await action("claim")).body.claimed, false);
  } finally {
    Date.now = realNow;
  }
});

test("lead event claim cannot be committed or released by a stale token", async () => {
  const binding = durableBinding();
  const object = binding.get(binding.idFromName("kenji-line-card-21829530-lead-v1"));
  const action = async (name, claimToken = "") => {
    const response = await object.fetch("https://kenji-model-dedupe.internal/campaign-lead/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: name, key: "a".repeat(64), claim_token: claimToken }),
    });
    return response.json();
  };
  const first = await action("claim");
  assert.equal(first.claimed, true);
  assert.equal((await action("commit", "stale-token")).committed, false);
  assert.equal((await action("release", "stale-token")).released, false);
  assert.equal((await action("claim")).claimed, false);
  assert.equal((await action("commit", first.claim_token)).committed, true);
  assert.equal((await action("release", first.claim_token)).released, false);
});
