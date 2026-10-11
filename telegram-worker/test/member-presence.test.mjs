import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { classifyStatus, readMemberPresence } from "../src/member-presence.js";

const env = { TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_PREMIUM_GROUP_ID: "-100666", INTERNAL_API_TOKEN: "internal-token" };
const mkFetch = (payload, calls = []) => async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body) });
  return { json: async () => payload };
};

test("classifyStatus maps telegram statuses", () => {
  assert.equal(classifyStatus("member"), "present");
  assert.equal(classifyStatus("restricted"), "present");
  assert.equal(classifyStatus("left"), "absent");
  assert.equal(classifyStatus("kicked"), "absent");
  assert.equal(classifyStatus("administrator"), "privileged");
  assert.equal(classifyStatus("weird"), "unknown");
});

test("present member; only getChatMember is called with env chat id", async () => {
  const calls = [];
  const out = await readMemberPresence({ telegram_user_id: "123", room: "premium" }, env, mkFetch({ ok: true, result: { status: "member" } }, calls));
  assert.equal(out.status, 200);
  assert.equal(out.body.presence, "present");
  assert.equal(out.body.read_only, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/getChatMember"));
  assert.deepEqual(calls[0].body, { chat_id: "-100666", user_id: 123 });
});

test("not found is absent; other errors are lookup_failed, never absent", async () => {
  const gone = await readMemberPresence({ telegram_user_id: "1", room: "premium" }, env, mkFetch({ ok: false, description: "Bad Request: user not found" }));
  assert.equal(gone.body.presence, "absent");
  const bad = await readMemberPresence({ telegram_user_id: "1", room: "premium" }, env, mkFetch({ ok: false, description: "Forbidden: bot was kicked" }));
  assert.equal(bad.status, 502);
  assert.equal(bad.body.ok, false);
  const net = await readMemberPresence({ telegram_user_id: "1", room: "premium" }, env, async () => { throw new Error("x"); });
  assert.equal(net.status, 502);
});

test("validation and no hardcoded room", async () => {
  const f = mkFetch({ ok: true, result: { status: "member" } });
  assert.equal((await readMemberPresence({ telegram_user_id: "abc", room: "premium" }, env, f)).status, 400);
  assert.equal((await readMemberPresence({ telegram_user_id: "1", room: "vip" }, env, f)).status, 400);
  assert.equal((await readMemberPresence({ telegram_user_id: "1", room: "premium" }, { TELEGRAM_BOT_TOKEN: "t" }, f)).status, 503);
});

test("route requires internal token", async () => {
  const url = "https://t.test/telegram/internal/member-presence";
  const body = JSON.stringify({ telegram_user_id: "1", room: "premium" });
  const noAuth = await worker.fetch(new Request(url, { method: "POST", body, headers: { "content-type": "application/json" } }), env);
  assert.ok([401, 403].includes(noAuth.status));
});

test("admin service secret is accepted on the route", async () => {
  const url = "https://t.test/telegram/internal/member-presence";
  const res = await worker.fetch(new Request(url, { method: "POST", body: "{}", headers: { "content-type": "application/json", "x-internal-token": "svc" } }), { ...env, AUTH_SERVICE_STUDIO_TO_TELEGRAM: "svc" });
  assert.equal(res.status, 400); // authenticated; invalid user id rejected
});
