import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { persistVerifiedMmsContactEvents } from "../src/mms-customer-contact-history.mjs";
import { handleMmsLineRequest } from "../src/mms-line-runtime.mjs";

globalThis.crypto ||= webcrypto;
const uid = "U" + "a".repeat(32);
const base = { type: "message", webhookEventId: "event-1", timestamp: 1791110000000,
  source: { type: "user", userId: uid }, message: { type: "text", id: "1", text: "private customer text" } };
function storage() {
  const objects = new Map();
  return { objects, put: async (key, value) => objects.set(key, value) };
}
async function request(events, valid = true) {
  const body = JSON.stringify({ events });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return new Request("https://mmdbkk.com/webhooks/line/mms", { method: "POST", body,
    headers: { "x-line-signature": valid ? Buffer.from(bytes).toString("base64") : "invalid" } });
}
test("redelivery and concurrent attempts keep one object without message content or tokens", async () => {
  const bucket = storage();
  await Promise.all([base, { ...base, deliveryContext: { isRedelivery: true }, replyToken: "private token" }].map(event =>
    persistVerifiedMmsContactEvents([event], { LINE_SLIP_EVIDENCE: bucket })));
  assert.equal(bucket.objects.size, 1);
  const [key, value] = [...bucket.objects][0];
  assert.ok(!key.includes(uid));
  assert.ok(!value.includes("private customer text"));
  assert.ok(!value.includes("private token"));
  assert.equal(JSON.parse(value).membership_status, "not_verified");
});
test("records all message types and follow/unfollow; old events cannot erase newer contact evidence", async () => {
  const bucket = storage();
  for (const [index, type] of ["text", "image", "video", "audio", "file", "location", "sticker"].entries()) {
    await persistVerifiedMmsContactEvents([{ ...base, webhookEventId: `message-${index}`, message: { type, id: `${index}` } }], { LINE_SLIP_EVIDENCE: bucket });
  }
  await persistVerifiedMmsContactEvents([
    { ...base, type: "unfollow", timestamp: base.timestamp + 100, webhookEventId: "unfollow" },
    { ...base, type: "follow", timestamp: base.timestamp - 100, webhookEventId: "follow" },
  ], { LINE_SLIP_EVIDENCE: bucket });
  assert.equal(bucket.objects.size, 9);
  const events = [...bucket.objects.values()].map(JSON.parse).sort((a,b) => a.occurred_at.localeCompare(b.occurred_at));
  assert.equal(events.at(-1).event_type, "unfollow");
});
test("group, room, malformed identity, invalid timestamp and unsupported events do not become contacts", async () => {
  const bucket = storage();
  await persistVerifiedMmsContactEvents([
    { ...base, source: { type: "group", userId: uid } },
    { ...base, source: { type: "room", userId: uid } },
    { ...base, source: { type: "user", userId: "unknown" } },
    { ...base, timestamp: Infinity }, { ...base, timestamp: Date.now() + 600_000 },
    { ...base, type: "unsend" }, { ...base, webhookEventId: null, message: { type: "text" } },
  ], { LINE_SLIP_EVIDENCE: bucket });
  assert.equal(bucket.objects.size, 0);
});
test("signed production webhook persists even with AI off and on redelivery", async () => {
  const bucket = storage();
  const env = { MMS_LINE_CHANNEL_SECRET: "secret", MMS_LINE_AI_ENABLED: "false", LINE_SLIP_EVIDENCE: bucket };
  for (const event of [base, { ...base, deliveryContext: { isRedelivery: true } }]) {
    const response = await handleMmsLineRequest(await request([event]), env);
    assert.equal(response.status, 200);
  }
  assert.equal(bucket.objects.size, 1);
});
test("bad signatures never write; durable failures return retryable 503 before a reply", async () => {
  const bucket = storage();
  const env = { MMS_LINE_CHANNEL_SECRET: "secret", LINE_SLIP_EVIDENCE: bucket };
  assert.equal((await handleMmsLineRequest(await request([base], false), env)).status, 401);
  assert.equal(bucket.objects.size, 0);
  const fail = { ...env, LINE_SLIP_EVIDENCE: { put: async () => { throw new Error("storage down"); } } };
  assert.equal((await handleMmsLineRequest(await request([base]), fail)).status, 503);
  assert.equal((await handleMmsLineRequest(await request([base]), { MMS_LINE_CHANNEL_SECRET: "secret" })).status, 503);
});
