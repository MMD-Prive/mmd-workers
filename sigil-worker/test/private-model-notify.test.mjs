import test from "node:test";
import assert from "node:assert/strict";
import worker, { PublicModelCoordinator } from "../src/index-with-public-model-notify.js";
import { privateModelTestInternals } from "../src/private-model.js";
import { TELEGRAM_NOTIFY_FIELDS as N } from "../src/public-model-notify.js";
import { PRIVATE_NOTIFICATION_KEY as KEY, PRIVATE_NOTIFICATION_PATH, queuePrivateModelNotificationAfterResponse } from "../src/private-model-notify.js";
import { TG_THREADS } from "../../telegram-worker/lib/telegram.js";

const F = privateModelTestInternals.APPLICATION_FIELDS;
const ID = "pma_private_fixture123";
const ORIGIN = "https://www.mmdbkk.com";
const receipt = (overrides = {}, status = 200) => Response.json({
  ok: true, service: "mmd_private_model_apply", mode: "intake_received", application_type: "private_model",
  application_id: ID, storage: { persisted: true }, ...overrides,
}, { status });

// Transactions are serialized and roll back on rejection. No production I/O.
function makeState() {
  const values = new Map();
  let tail = Promise.resolve();
  const storage = {
    alarmAt: null,
    get: async key => structuredClone(values.get(key)),
    put: async (key, value) => { values.set(key, structuredClone(value)); },
    delete: async key => values.delete(key),
    deleteAll: async () => values.clear(),
    setAlarm: async timestamp => { storage.alarmAt = timestamp; },
    transaction(fn) {
      const task = tail.then(async () => {
        const copy = new Map(structuredClone([...values]));
        let alarm = storage.alarmAt;
        const result = await fn({
          get: async key => structuredClone(copy.get(key)),
          put: async (key, value) => copy.set(key, structuredClone(value)),
          delete: async key => copy.delete(key),
          setAlarm: async timestamp => { alarm = timestamp; },
        });
        values.clear(); for (const [k, v] of copy) values.set(k, v);
        storage.alarmAt = alarm;
        return result;
      });
      tail = task.catch(() => {});
      return task;
    },
  };
  return { storage, blockConcurrencyWhile: fn => fn() };
}

function fixture() {
  const records = [], calls = [], patches = [], instances = new Map();
  const hooks = { preflightFails: false, sentPatchFails: false, send: null };
  const env = {
    AIRTABLE_API_TOKEN: "fixture-only", AUTH_SERVICE_SIGIL_TO_TELEGRAM: "fixture-service-token",
    PRIVATE_MODEL_ENABLED: "true", PRIVATE_MODEL_UPLOAD_REQUIRED: "false", ALLOWED_ORIGINS: ORIGIN,
    SIGIL_BOARD_KV: { get: async () => null, put: async () => {} },
    AIRTABLE_FETCH: async (input, init = {}) => {
      const url = new URL(input);
      const method = init.method || "GET";
      if (method === "GET") {
        if (hooks.preflightFails) return Response.json({}, { status: 503 });
        const formula = url.searchParams.get("filterByFormula") || "";
        const found = records.filter(r => formula.includes(r.fields[F.applicationId]) || formula.includes(r.fields[F.payloadHash] || "NO_HASH"));
        return Response.json({ records: found });
      }
      const body = JSON.parse(init.body);
      if (method === "POST") {
        const added = body.records.map(r => ({ id: `recFixture${records.length}ABCDEFGHIJ`, fields: r.fields }));
        records.push(...added); return Response.json({ records: added });
      }
      assert.equal(method, "PATCH");
      for (const key of Object.keys(body.fields)) assert.ok(Object.values(N).includes(key), `unexpected business field ${key}`);
      patches.push(body.fields);
      if (hooks.sentPatchFails && body.fields[N.status] === "sent") return Response.json({}, { status: 503 });
      const record = records.find(r => url.pathname.endsWith(r.id));
      assert.ok(record); Object.assign(record.fields, body.fields);
      return Response.json(record);
    },
    TELEGRAM_WORKER: { fetch: async request => {
      const payload = await request.json();
      calls.push({ payload, auth: request.headers.get("authorization"), url: request.url });
      if (hooks.send) return hooks.send();
      return Response.json({ ok: true, telegram: { ok: true, result: { message_id: 123 } } });
    } },
  };
  env.PUBLIC_MODEL_COORDINATOR = {
    idFromName: name => name,
    get(id) {
      if (!instances.has(id)) {
        const state = makeState();
        instances.set(id, { state, coordinator: new PublicModelCoordinator(state, env) });
      }
      return { fetch: (url, init) => instances.get(id).coordinator.fetch(new Request(url, init)) };
    },
  };
  function addRecord(fields = {}) {
    records.push({ id: "recFixtureABCDEFGHIJ", fields: { [F.applicationId]: ID, [F.applicationType]: "private_model", [F.nickname]: "private-name", [F.lineId]: "private-contact", ...fields } });
  }
  function notification(id = ID) { return instances.get(`private-model:telegram:${id}`); }
  async function alarm(id = ID) {
    const instance = notification(id); assert.ok(instance);
    instance.state.storage.alarmAt = null;
    await instance.coordinator.alarm();
    return instance.state.storage.get(KEY);
  }
  return { env, calls, patches, records, hooks, instances, addRecord, notification, alarm };
}

test("persisted Private intake queues once under concurrent duplicate responses; routed alert carries no applicant data", async () => {
  const f = fixture(); f.addRecord();
  await Promise.all(Array.from({ length: 20 }, () => queuePrivateModelNotificationAfterResponse(receipt({ duplicate: true }), f.env)));
  assert.equal(f.instances.size, 1); assert.equal(f.calls.length, 0);
  assert.ok(f.notification().state.storage.alarmAt);
  let job = await f.alarm(); assert.equal(job.status, "sent");
  await f.alarm();
  await queuePrivateModelNotificationAfterResponse(receipt(), f.env);
  await f.alarm();
  assert.equal(f.calls.length, 1);
  const sent = f.calls[0];
  assert.equal(sent.auth, "Bearer fixture-service-token");
  assert.equal(sent.url, "https://telegram-worker.internal/telegram/internal/send");
  assert.equal(sent.payload.flow, "applications");
  assert.equal(TG_THREADS({}).applications, 155);
  assert.equal("chat_id" in sent.payload, false);
  assert.match(sent.payload.text, new RegExp(ID));
  assert.doesNotMatch(JSON.stringify(sent.payload), /private-name|private-contact|photo_url|file_url/);
  assert.equal(new URL(sent.payload.reply_markup.inline_keyboard[0][0].url).searchParams.get("application_type"), "private_model");
  assert.equal(f.records[0].fields[N.status], "sent");
  assert.equal(job.messageId, 123);
});

test("rejected, readiness, Public, upload and unpersisted results never queue", async () => {
  const f = fixture();
  for (const response of [receipt({}, 503), receipt({ ok: false }), receipt({ storage: { persisted: false } }),
    receipt({ service: "mmd_public_model_apply" }), receipt({ service: "mmd_private_model_upload" }),
    receipt({ application_type: "public_model" }), receipt({ mode: "readiness_only" }), receipt({ application_id: "bad" })]) {
    await queuePrivateModelNotificationAfterResponse(response, f.env);
  }
  assert.equal(f.instances.size, 0); assert.equal(f.calls.length, 0);
});

test("actual private apply persists first, keeps review status, and queues both canonical and legacy routes", async () => {
  for (const path of ["/sigil/api/private-model/apply", "/v1/private-model/apply"]) {
    const f = fixture();
    const response = await worker.fetch(new Request(ORIGIN + path, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ application_type: "private_model", nickname: "Fixture", contact: "fixture-contact", reason: "fixture only", consent: true }) }), f.env, {});
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.review_status, "pending_review"); assert.equal(result.status, "New");
    assert.equal(f.records.length, 1); assert.ok(f.notification(result.application_id));
    assert.equal(f.calls.length, 0);
    await f.alarm(result.application_id); assert.equal(f.calls.length, 1);
    assert.equal(f.records[0].fields[F.status], "New");
  }
});

test("actual validation failure creates neither application nor notification", async () => {
  const f = fixture();
  const response = await worker.fetch(new Request(ORIGIN + "/sigil/api/private-model/apply", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: "{}" }), f.env, {});
  assert.equal(response.status, 400); assert.equal(f.records.length, 0); assert.equal(f.instances.size, 0);
});

test("enqueue outage preserves the successful receipt and a later duplicate can enqueue", async () => {
  const f = fixture(); f.addRecord();
  const response = receipt();
  await queuePrivateModelNotificationAfterResponse(response, {});
  assert.equal((await response.json()).storage.persisted, true);
  await queuePrivateModelNotificationAfterResponse(receipt({ duplicate: true }), f.env);
  await f.alarm(); assert.equal(f.calls.length, 1);
});

test("confirmed provider rejection retries without another application submission", async () => {
  const f = fixture(); f.addRecord();
  f.hooks.send = () => Response.json({ ok: true, telegram: { ok: false, status: 429, error: { ok: false, error_code: 429, parameters: { retry_after: 120 } } } });
  await queuePrivateModelNotificationAfterResponse(receipt(), f.env);
  assert.equal((await f.alarm()).status, "queued");
  assert.ok(f.notification().state.storage.alarmAt >= Date.now() + 119_000);
  f.hooks.send = null;
  assert.equal((await f.alarm()).status, "sent");
  assert.equal(f.calls.length, 2); assert.equal(f.records.length, 1);
});

test("timeouts and ambiguous router failures never retry delivery automatically", async () => {
  for (const send of [() => { throw new Error("timeout-secret-must-not-leak"); }, () => Response.json({ ok: false }, { status: 502 }), () => new Response("not-json")]) {
    const f = fixture(); f.addRecord(); f.hooks.send = send;
    await queuePrivateModelNotificationAfterResponse(receipt(), f.env);
    assert.equal((await f.alarm()).status, "uncertain");
    await queuePrivateModelNotificationAfterResponse(receipt({ duplicate: true }), f.env);
    await f.alarm(); assert.equal(f.calls.length, 1);
    assert.equal(f.records[0].fields[N.error], "delivery_uncertain_manual_review");
  }
});

test("preflight failure is bounded and does not send; Public/ambiguous application IDs fail closed", async () => {
  for (const mode of ["outage", "public", "ambiguous", "missing"]) {
    const f = fixture();
    if (mode !== "missing") f.addRecord(mode === "public" ? { [F.applicationType]: "public_model" } : {});
    if (mode === "ambiguous") f.addRecord();
    f.hooks.preflightFails = mode === "outage";
    await queuePrivateModelNotificationAfterResponse(receipt(), f.env);
    for (let n = 0; n < 5; n++) await f.alarm();
    assert.equal((await f.alarm()).status, "failed"); assert.equal(f.calls.length, 0);
  }
});

test("successful delivery with failed Airtable audit retries audit only", async () => {
  const f = fixture(); f.addRecord(); f.hooks.sentPatchFails = true;
  await queuePrivateModelNotificationAfterResponse(receipt(), f.env);
  assert.equal((await f.alarm()).status, "sent");
  f.hooks.sentPatchFails = false;
  assert.equal((await f.alarm()).auditDone, true);
  assert.equal(f.calls.length, 1); assert.equal(f.records[0].fields[N.status], "sent");
});

test("restarted coordinator with in-flight dispatch is marked uncertain instead of resent", async () => {
  const f = fixture(); f.addRecord();
  await queuePrivateModelNotificationAfterResponse(receipt(), f.env);
  const instance = f.notification();
  await instance.state.storage.put(KEY, { applicationId: ID, recordId: f.records[0].id, status: "sending", attempts: 1 });
  instance.coordinator = new PublicModelCoordinator(instance.state, f.env);
  assert.equal((await f.alarm()).status, "uncertain"); assert.equal(f.calls.length, 0);
});

test("existing sent/pending notification suppresses replay across a new outbox", async () => {
  for (const status of ["sent", "pending"]) {
    const f = fixture(); f.addRecord({ [N.status]: status });
    await queuePrivateModelNotificationAfterResponse(receipt(), f.env);
    const job = await f.alarm(); assert.equal(job.status, status === "sent" ? "sent" : "uncertain");
    assert.equal(f.calls.length, 0);
  }
});

test("dedupe scope cannot be reused for another application and existing rate-limit alarms still clean up", async () => {
  const f = fixture();
  await queuePrivateModelNotificationAfterResponse(receipt(), f.env);
  const other = await f.notification().coordinator.fetch(new Request("https://coordinator" + PRIVATE_NOTIFICATION_PATH, {
    method: "POST", body: JSON.stringify({ application_id: "pma_other_application" }),
  }));
  assert.equal(other.status, 409);
  const state = makeState(); await state.storage.put("rate", { count: 2 });
  await new PublicModelCoordinator(state, f.env).alarm();
  assert.equal(await state.storage.get("rate"), undefined);
});

test("explicitly skipped and unknown notification states never send", async () => {
  for (const status of ["skipped", "unknown_state"]) {
    const f = fixture(); f.addRecord({ [N.status]: status });
    await queuePrivateModelNotificationAfterResponse(receipt(), f.env);
    await f.alarm(); await f.alarm();
    assert.equal(f.calls.length, 0); assert.equal(f.patches.length, 0);
  }
});
