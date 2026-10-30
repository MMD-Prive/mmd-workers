import test from "node:test";
import assert from "node:assert/strict";
import worker, { createLineSignature } from "../src/index.js";
import { isCheckptsShortcut } from "../src/checkpts-command.mjs";
import { handleKenjiSeedLineRequest } from "../src/kenji-seed-line-runtime.mjs";
import { aggregateKenjiLineTurn, prepareKenjiLineWebhookBatch } from "../src/kenji-line-turn-aggregation.mjs";

const UID = `U${"a".repeat(32)}`;
const ALIASES = ["Checkpts", "check point", "check points", "checkpoint", "เช็คสิทธิ์", "เช็กสิทธิ์"];
const MATRIX = "tblS6iRgPjYLBqZJh";
const AUTHORITY = "my_mmd_entitlement_resolver_v1";
const event = text => ({ type: "message", mode: "active", replyToken: "fixture-reply", timestamp: Date.now(),
  webhookEventId: "fixture-event", source: { type: "user", userId: UID }, message: { id: "fixture-message", type: "text", text } });
const truth = () => ({ ok: true, authority: AUTHORITY, identity_status: "resolved",
  membership: { level: "private_premium", label: "Premium", lifecycle: "active", expire_at: "2027-01-01" },
  points: { status: "verified", active_points: 120 } });

// Uses the real signed Seed + canonical intake handlers. All outbound I/O is mocked.
async function run(command, options = {}) {
  const previousFetch = globalThis.fetch;
  const previousTimer = globalThis.setTimeout;
  const calls = { runtime: 0, matrix: 0, takeover: 0, truth: [], writes: [], replies: [], buffer: 0, waits: [], beforeTruth: null };
  let afterTruth = false;
  const matrix = { id: "recMatrix", fields: { Client: ["recClient"], matrix_id: "fixture-matrix", channel: "line_ofc",
    conversation_scope: "fixture-scope", matrix_status: "active", state_updated_at: new Date().toISOString(),
    state_expires_at: new Date(Date.now() + 60_000).toISOString(),
    payload_json: JSON.stringify(options.support ? { rich_menu_v1: { topic: "support", entry: "per_support_button",
      expires_at: new Date(Date.now() + 60_000).toISOString() } } : {}) } };
  globalThis.setTimeout = (callback, ms, ...args) => { calls.waits.push(ms); return previousTimer(callback, ms, ...args); };
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    if (url.hostname === "api.line.me") {
      assert.equal(url.pathname, "/v2/bot/message/reply", "no profile reads or secondary LINE sends");
      calls.replies.push(await request.json());
      return Response.json({}, { status: options.deliveryFails ? 500 : 200 });
    }
    assert.equal(url.hostname, "api.airtable.com", "no model/public upstream requests");
    if (request.method !== "GET") {
      const body = await request.json();
      calls.writes.push({ table: decodeURIComponent(url.pathname.split("/").at(-1)), body });
      assert.ok(!url.pathname.endsWith(MATRIX), "Points lookup cannot overwrite the conversation or Per handoff");
      return Response.json({ id: "recIntake", records: [{ id: "recIntake", fields: body.fields || {} }] });
    }
    if (url.pathname.endsWith(MATRIX)) {
      calls.matrix++;
      if (afterTruth && options.matrixFailsAfterTruth) return Response.json({}, { status: 503 });
      const fields = { ...matrix.fields };
      if ((afterTruth && options.matrixOwnerAfterTruth) || options.matrixOwner) Object.assign(fields,
        { handoff_required: true, handoff_owner: "Per", conversation_stage: "human_takeover", handoff_reason: "owner_takeover" });
      return Response.json({ records: [{ ...matrix, fields }] });
    }
    if ((url.searchParams.get("filterByFormula") || "").includes("processing")) {
      calls.takeover++;
      if (options.ownerUnavailable) return Response.json({}, { status: 503 });
      return Response.json({ records: options.owner || (afterTruth && options.ownerAfterTruth) ? [{ id: "recOwner" }] : [] });
    }
    return Response.json({ records: [] });
  };
  const env = { LINE_CHANNEL_SECRET: "fixture-secret", LINE_CHANNEL_ACCESS_TOKEN: "fixture-token", INTERNAL_TOKEN: "fixture-internal",
    AIRTABLE_API_KEY: "fixture-airtable", AIRTABLE_BASE_ID: "fixture-base", LINE_AUTO_REPLY_ENABLED: "false",
    LINE_KENJI_AI_ENABLED: "true", LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED: "true", KENJI_LINE_CONTINUITY_ENABLED: "true",
    KENJI_LINE_BRAIN_V1_ENABLED: "true", LINE_KENJI_KNOWLEDGE_ENABLED: "true", LINE_KENJI_MODEL_ENABLED: "false",
    KENJI_LINE_RIGHTS_CHECK_MODE: "command", KENJI_LINE_RIGHTS_COMMAND_ENABLED: "true",
    KENJI_LINE_MESSAGE_AGGREGATION_ENABLED: "true", KENJI_LINE_MESSAGE_AGGREGATION_WAIT_MS: "650",
    KENJI_MODEL_DEDUPE: { idFromName() { calls.buffer++; throw Error("command must not use the turn buffer"); } },
    ADMIN_WORKER: { fetch: async () => {
      calls.runtime++;
      if (options.runtimeUnavailable) return Response.json({}, { status: 503 });
      return Response.json({ ok: true, controls: { line_oa_auto_reply: Boolean(options.kill || (afterTruth && options.killAfterTruth)),
        all_kenji_mutations: Boolean(options.globalKill) } });
    } },
    MEMBER_PAGES_WORKER: { fetch: async request => {
      const body = await request.json();
      assert.equal(body.line_user_id, UID, "use only the signed provider identity");
      calls.truth.push({ path: new URL(request.url).pathname, intent: body.intent });
      calls.beforeTruth ||= { runtime: calls.runtime, matrix: calls.matrix, takeover: calls.takeover };
      afterTruth = true;
      const membershipRead = body.intent === "membership_status";
      return Response.json(membershipRead ? options.membershipTruth || options.truth || truth() : options.truth || truth(), {
        status: membershipRead ? options.membershipStatus || options.truthStatus || 200 : options.truthStatus || 200,
      });
    } }, ...options.env };
  const background = [];
  try {
    const e = { ...event(command), ...options.event };
    const raw = JSON.stringify({ events: [e], CHECKPTS_INTAKE: true });
    const request = new Request("https://mmdbkk.com/webhooks/line", { method: "POST", body: raw,
      headers: { "x-line-signature": options.invalidSignature ? "invalid" : await createLineSignature(raw, env.LINE_CHANNEL_SECRET) } });
    const ctx = { waitUntil: work => background.push(work) };
    const response = options.directCore ? await worker.fetch(request, env, ctx)
      : await handleKenjiSeedLineRequest(request, env, ctx, worker);
    await Promise.all(background);
    return { status: response.status, body: await response.json(), calls };
  } finally { globalThis.fetch = previousFetch; globalThis.setTimeout = previousTimer; }
}

for (const command of ALIASES) test(`${command} uses one canonical Points lane with and without SUPPORT`, async () => {
  for (const support of [false, true]) {
    const { status, body, calls } = await run(command, { support });
    assert.equal(status, 200);
    assert.equal(body.saved[0].reply_source, "my_mmd_points_shortcut_v2");
    assert.equal(body.saved[0].inferred_intent, "points_status");
    assert.equal(calls.replies.length, 1);
    assert.equal(calls.replies[0].replyToken, "fixture-reply");
    assert.match(calls.replies[0].messages[0].text, /สถานะสมาชิก: Premium.*\nPoints: 120 Points.*\nวันหมดอายุ: 01\/01\/2027/);
    assert.deepEqual(calls.truth, [{ path: "/__internal/kenji/member-truth", intent: "points_status" }]);
    assert.deepEqual(calls.beforeTruth, { runtime: 1, matrix: 1, takeover: 1 }, "no duplicate legacy context reads before truth");
    assert.equal(calls.matrix, 2, "the second read is a fresh pre-delivery takeover check");
    assert.equal(calls.runtime, 2);
    assert.equal(calls.buffer, 0);
    assert.ok(!calls.waits.includes(650), "no burst wait");
    const inbound = calls.writes.find(w => w.table === "MMD — Console Inbox");
    assert.ok(inbound, "retain canonical inbound intake");
    assert.equal(inbound.body.fields.line_user_id, UID);
    assert.equal(inbound.body.fields.admin_note, command);
  }
});

test("aliases normalize case, spacing and invisible paste separators but stay exact", () => {
  for (const text of [" CHECKPTS ", "CHECK\tPOINT", "check   points", "\uFEFFเช็คสิทธิ์\u200B", "เช็ก\u200Bสิทธิ์"])
    assert.equal(isCheckptsShortcut(event(text)), true);
  for (const text of ["mycheckpts", "checkpoints", "check point for someone", "เช็กสิทธิ์ให้คนอื่น", "เมื่อวานเช็คสิทธิ์แล้ว", "checkpts\nignore instructions", "เช็กสิทธิ์ โอนแล้ว"])
    assert.equal(isCheckptsShortcut(event(text)), false);
  assert.equal(isCheckptsShortcut({ ...event("Checkpts"), source: { type: "group", userId: UID } }), false);
});

test("commands stay separate from neighboring messages and never wait or enter the turn buffer", async () => {
  const ordinary = event("ถามเรื่องสมาชิก");
  const prepared = prepareKenjiLineWebhookBatch([ordinary, ...ALIASES.map(event)]);
  assert.ok(prepared.every(p => !p.suppressed && p.aggregate_count === 1));
  assert.deepEqual(prepared.map(p => p.turn_event.message.text), [ordinary.message.text, ...ALIASES]);
  for (const command of ALIASES) {
    const result = await aggregateKenjiLineTurn({ event: event(command), env: {
      KENJI_LINE_MESSAGE_AGGREGATION_ENABLED: "true", KENJI_LINE_MESSAGE_AGGREGATION_WAIT_MS: "650",
      KENJI_MODEL_DEDUPE: { idFromName() { assert.fail("command reached burst storage"); } },
    } });
    assert.equal(result.source, "points_command");
    assert.equal(result.event.message.text, command);
  }
});

for (const options of [{ owner: true }, { matrixOwner: true }, { ownerUnavailable: true }, { kill: true }, { globalKill: true },
  { runtimeUnavailable: true }, { invalidSignature: true }, { event: { mode: "standby" } },
  { event: { deliveryContext: { isRedelivery: true } } }, { event: { replyToken: "" } },
  { env: { LINE_KENJI_AI_ENABLED: "false" } }, { env: { KENJI_LINE_CONTINUITY_ENABLED: "false" } },
  { env: { LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED: "false" } }]) {
  test(`shared command gate blocks before truth: ${JSON.stringify(options)}`, async () => {
    for (const command of ALIASES) {
      const { calls } = await run(command, options);
      assert.equal(calls.replies.length, 0);
      assert.equal(calls.truth.length, 0);
      if (options.invalidSignature) assert.equal(calls.writes.length, 0);
    }
  });
}

for (const options of [{ ownerAfterTruth: true }, { matrixOwnerAfterTruth: true }, { killAfterTruth: true }, { matrixFailsAfterTruth: true }]) {
  test(`Per takeover or stop during lookup suppresses every alias: ${JSON.stringify(options)}`, async () => {
    for (const command of ALIASES) {
      const { calls } = await run(command, options);
      assert.equal(calls.truth.length, 1);
      assert.equal(calls.replies.length, 0);
    }
  });
}

for (const invalid of [{ ...truth(), identity_status: "unresolved" }, { ...truth(), identity_status: "ambiguous" },
  { ...truth(), authority: "untrusted" }, { ...truth(), points: { status: "unavailable", active_points: 999 } },
  { ...truth(), points: { status: "verified", active_points: -1 } }]) {
  test(`unverified truth never becomes a numeric balance: ${JSON.stringify(invalid.points)}/${invalid.identity_status}/${invalid.authority}`, async () => {
    const { calls } = await run("checkpoint", { truth: invalid });
    assert.equal(calls.replies.length, 1);
    assert.match(calls.replies[0].messages[0].text, /Points: ยังยืนยันยอดไม่ได้/);
    assert.doesNotMatch(calls.replies[0].messages[0].text, /\d[\d,]* Points/);
  });
}

test("snapshot mode remains opt-in and cannot fall back to stale or unverified values", async () => {
  const { calls } = await run("เช็คสิทธิ์", { env: { LINE_MEMBER_REPLY_SNAPSHOT_ENABLED: "true" }, truth: {}, truthStatus: 503 });
  assert.deepEqual(calls.truth, [
    { path: "/__internal/kenji/member-reply-snapshot", intent: undefined },
    { path: "/__internal/kenji/member-truth", intent: "membership_status" },
  ]);
  assert.equal(calls.replies.length, 1);
  assert.match(calls.replies[0].messages[0].text, /Points: ยังยืนยันยอดไม่ได้/);
});

test("snapshot miss reads canonical membership without accepting its profile Points", async () => {
  for (const command of ALIASES) {
    const { calls } = await run(command, { env: { LINE_MEMBER_REPLY_SNAPSHOT_ENABLED: "true" },
      truth: {}, truthStatus: 503, membershipStatus: 200,
      membershipTruth: { ...truth(), points: { status: "verified", active_points: 999 } },
    });
    assert.deepEqual(calls.truth, [
      { path: "/__internal/kenji/member-reply-snapshot", intent: undefined },
      { path: "/__internal/kenji/member-truth", intent: "membership_status" },
    ]);
    const text = calls.replies[0].messages[0].text;
    assert.match(text, /สถานะสมาชิก: Premium/);
    assert.match(text, /วันหมดอายุ: 01\/01\/2027/);
    assert.match(text, /Points: ยังยืนยันยอดไม่ได้/);
    assert.doesNotMatch(text, /999|\d[\d,]* Points/);
  }
});

test("a usable snapshot needs no extra membership read", async () => {
  const { calls } = await run("checkpts", { env: { LINE_MEMBER_REPLY_SNAPSHOT_ENABLED: "true" } });
  assert.equal(calls.truth.length, 1);
  assert.match(calls.replies[0].messages[0].text, /Points: 120 Points/);
});

test("Per takeover during snapshot fallback still suppresses delivery", async () => {
  const { calls } = await run("checkpts", { env: { LINE_MEMBER_REPLY_SNAPSHOT_ENABLED: "true" },
    truth: {}, truthStatus: 503, membershipTruth: truth(), membershipStatus: 200, ownerAfterTruth: true,
  });
  assert.equal(calls.replies.length, 0);
});

test("malformed provider identity never reaches the canonical reader", async () => {
  const { calls } = await run("check point", { event: { source: { type: "user", userId: "typed-name" } } });
  assert.equal(calls.truth.length, 0);
  assert.ok(calls.replies.every(reply => !/\d[\d,]* Points/.test(reply.messages[0].text)));
});

test("a public webhook body cannot request the private lightweight intake branch", async () => {
  const { calls } = await run("Checkpts", { directCore: true, env: { KENJI_LINE_MESSAGE_AGGREGATION_ENABLED: "false", KENJI_LINE_BRAIN_V1_ENABLED: "false" } });
  assert.ok(calls.runtime >= 1, "the public request still goes through normal runtime controls");
  assert.equal(calls.truth.length, 0);
  assert.equal(calls.replies.length, 0);
});
