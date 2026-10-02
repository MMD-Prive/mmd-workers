import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { handleFixtureRequest, LineRightsFixtureState, fixtureEnvironmentSafe } from "../src/line-rights-fixture-entry.mjs";
import { createLineSignature } from "../src/index.js";
globalThis.crypto ||= webcrypto;
const UID = `U${"1".repeat(32)}`, BOT = `U${"2".repeat(32)}`;
const sha = async value => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).toString("hex");
async function fixture() {
  const objects = new Map();
  const namespace = { idFromName: name => name, get(name) {
    if (!objects.has(name)) {
      const map = new Map(); let queue = Promise.resolve();
      const storage = { get: async key => map.get(key), put: async (key, value) => map.set(key, value), delete: async key => map.delete(key), getAlarm: async () => null, setAlarm: async () => {}, transaction: fn => { const work = queue.then(() => fn(storage)); queue = work.catch(() => {}); return work; } };
      const object = new LineRightsFixtureState({ storage });
      objects.set(name, { fetch: (url, init) => object.fetch(url instanceof Request ? url : new Request(url, init)), map });
    }
    return objects.get(name);
  } };
  const env = { MMD_FIXTURE_ONLY: "true", LINE_FIXTURE_CHANNEL_ID: "2011839389", LINE_FIXTURE_PROVIDER_ID: "2004492377", LINE_FIXTURE_DESTINATION_ID: BOT, LINE_FIXTURE_EMERGENCY_STOP: "false", KENJI_LINE_RIGHTS_CHECK_MODE: "pilot", KENJI_LINE_RIGHTS_CHECK_PILOT_HASHES: await sha(UID), LINE_AUTO_REPLY_ENABLED: "true", LINE_KENJI_AI_ENABLED: "true", KENJI_MODEL_DEDUPE: namespace, LINE_CHANNEL_SECRET: "fixture-only-secret", LINE_CHANNEL_ACCESS_TOKEN: "fixture-only-token", LINE_FIXTURE_OPERATOR_TOKEN: "fixture-only-operator" };
  const replies = [];
  const transports = { line: async (_, init) => { replies.push(JSON.parse(init.body)); return Response.json({}); } };
  const operator = async (path, body = {}, token = env.LINE_FIXTURE_OPERATOR_TOKEN) => handleFixtureRequest(new Request(`https://fixture.test${path}`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), env, transports);
  const arm = scenario => operator("/fixture/control", { scenario, all_kenji_mutations: false, line_oa_auto_reply: false, owner_takeover: false });
  const send = async (id = "event-one", overrides = {}, destination = BOT, signatureOverride) => {
    const event = { type: "message", mode: "active", timestamp: Date.now(), webhookEventId: id, replyToken: "mock-reply", source: { type: "user", userId: UID }, message: { type: "text", id, text: "เช็กสิทธิ์" }, ...overrides };
    const raw = JSON.stringify({ destination, events: [event] });
    return handleFixtureRequest(new Request("https://fixture.test/webhooks/line", { method: "POST", headers: { "x-line-signature": signatureOverride ?? await createLineSignature(raw, env.LINE_CHANNEL_SECRET) }, body: raw }), env, transports);
  };
  return { env, replies, operator, arm, send, objects, transports };
}
test("production data/service bindings are rejected before any transport", async () => {
  const f = await fixture(); f.env.AIRTABLE_BASE_ID = "forbidden";
  assert.equal(fixtureEnvironmentSafe(f.env), false); assert.equal((await f.send()).status, 503); assert.equal(f.replies.length, 0); assert.equal(f.objects.size, 0);
});
test("signed owner messages remain silent until operator explicitly arms controls", async () => {
  const f = await fixture(); await f.send(); assert.equal(f.replies.length, 0);
  await f.arm("active"); await f.send("second"); assert.equal(f.replies.length, 1);
  assert.match(f.replies[0].messages[0].text, /^\[STAGING/); assert.match(f.replies[0].messages[0].text, /ไม่ใช่สิทธิ์จริง/);
  const receipt = await (await f.operator("/fixture/receipt")).json(); assert.equal(receipt.delivered_count, 1);
});
test("invalid signature and a different bot destination cannot reply", async () => {
  const f = await fixture(); await f.arm("active"); assert.equal((await f.send("bad", {}, BOT, "bad")).status, 401);
  assert.equal((await f.send("other-bot", {}, UID)).status, 403); assert.equal(f.replies.length, 0);
});
test("nonowner, groups, stale events, unrelated text, redelivery stay silent", async () => {
  const f = await fixture(); await f.arm("active");
  await f.send("outside", { source: { type: "user", userId: BOT } });
  await f.send("group", { source: { type: "group", userId: UID } });
  await f.send("old", { timestamp: Date.now() - 600000 });
  await f.send("other", { message: { type: "text", text: "โอนแล้ว" } });
  await f.send("redelivery", { deliveryContext: { isRedelivery: true } });
  assert.equal(f.replies.length, 0);
});
test("reload/redelivery ambiguity cannot cause a second reply", async () => {
  const f = await fixture(); await f.arm("active"); await f.send(); await f.send(); assert.equal(f.replies.length, 1);
});
test("emergency stop and owner takeover each override armed pilot", async () => {
  const f = await fixture(); await f.arm("active"); f.env.LINE_FIXTURE_EMERGENCY_STOP = "true"; await f.send(); assert.equal(f.replies.length, 0);
  f.env.LINE_FIXTURE_EMERGENCY_STOP = "false"; await f.operator("/fixture/control", { scenario: "active", all_kenji_mutations: false, line_oa_auto_reply: false, owner_takeover: true }); await f.send("takeover"); assert.equal(f.replies.length, 0);
});
test("LINE credentials do not grant control access and arbitrary fields are rejected", async () => {
  const f = await fixture(); assert.equal((await f.operator("/fixture/receipt", {}, f.env.LINE_CHANNEL_ACCESS_TOKEN)).status, 401);
  await assert.rejects(f.operator("/fixture/control", { scenario: "active", amount: 9000 }));
  await f.send(); assert.equal(f.replies.length, 0);
});
test("unknown fixture records one synthetic review and never claims genuine truth", async () => {
  const f = await fixture(); await f.arm("unknown"); await f.send(); await f.send("again");
  const receipt = await (await f.operator("/fixture/receipt")).json(); assert.equal(receipt.matrix.handoff_required, true);
  assert.match(f.replies[0].messages[0].text, /ยังรอตรวจ/);
  const state = JSON.stringify([...f.objects.values()].map(object => [...object.map])); assert.ok(!state.includes(UID)); assert.ok(!state.includes("mock-reply"));
});
test("fixture renewal versus new signup and protected tiers remain distinct", async () => {
  for (const scenario of ["expired", "new_signup", "vip", "svip", "black_card"]) {
    const f = await fixture(); await f.arm(scenario); await f.send(); const text = f.replies[0].messages[0].text;
    if (scenario === "expired") assert.match(text, /ต่ออายุ Standard/);
    else { assert.doesNotMatch(text, /ต่ออายุ Standard/); if (scenario === "new_signup") assert.match(text, /สมัครใหม่/); }
  }
});
test("ambiguous failed LINE transport does not retry or record delivery", async () => {
  const f = await fixture(); let attempts = 0; f.transports.line = async () => { attempts++; throw new Error("mock timeout"); };
  await f.arm("active"); await f.send(); await f.send();
  assert.equal(attempts, 1); assert.equal((await (await f.operator("/fixture/receipt")).json()).delivered_count, 0);
});
test("operator takeover during a slow truth operation suppresses delivery", async () => {
  const f = await fixture(); await f.arm("active");
  const object = f.env.KENJI_MODEL_DEDUPE.get("fixture-owner-state-v1"), original = object.fetch; let reads = 0;
  object.fetch = async (request, init) => {
    if (new URL(request.url).pathname === "/fixture/read" && ++reads === 4) await original(new Request("https://fixture.internal/fixture/control", { method: "POST", body: JSON.stringify({ scenario: "active", all_kenji_mutations: false, line_oa_auto_reply: false, owner_takeover: true }) }));
    return original(request, init);
  };
  await f.send(); assert.equal(f.replies.length, 0);
});
test("committed fixture config cannot inherit production routes, services or data stores", async () => {
  const config = await readFile(new URL("../wrangler.line-rights-fixture.toml", import.meta.url), "utf8");
  assert.match(config, /workers_dev = false/); assert.match(config, /routes = \[\]/); assert.match(config, /KENJI_LINE_RIGHTS_CHECK_MODE = "off"/);
  assert.match(config, /preview_urls = false/);
  assert.match(config, /LINE_FIXTURE_EMERGENCY_STOP = "true"/);
  assert.doesNotMatch(config, /\[\[?(?:env\.|services|kv_namespaces|r2_buckets|d1_databases)/);
});
test("fixture reserves at most ten sends even when the owner rearms", async () => {
  const f = await fixture(); await f.arm("active");
  for (let i = 0; i < 12; i++) { await f.arm("active"); await f.send(`limited-${i}`); }
  assert.equal(f.replies.length, 10);
  const receipt = await (await f.operator("/fixture/receipt")).json(); assert.equal(receipt.reply_attempts, 10);
});
test("expired operator arm prevents all sends and attempts", async () => {
  const f = await fixture(); await f.arm("active");
  const map = f.env.KENJI_MODEL_DEDUPE.get("fixture-owner-state-v1").map;
  const control = map.get("fixture-control"); map.set("fixture-control", { ...control, expires_at: Date.now() - 1 });
  await f.send(); assert.equal(f.replies.length, 0); assert.equal(map.get("fixture-attempts"), undefined);
});
