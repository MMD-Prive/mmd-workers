import test from "node:test";
import assert from "node:assert/strict";
import canonicalWorker, { createLineSignature } from "../src/index.js";
import { handleKenjiSeedLineRequest } from "../src/kenji-seed-line-runtime.mjs";
import { resolveKenjiLineContinuity, writeKenjiLineMatrixTurn } from "../src/kenji-line-continuity-runtime.mjs";
import { lineIntakeCommand, lineIntakeTopic, resolveLineIntakeReply } from "../src/kenji-line-intake-commands.mjs";
import { prepareKenjiLineWebhookBatch, aggregateKenjiLineTurn } from "../src/kenji-line-turn-aggregation.mjs";

const UID = `U${"1".repeat(32)}`;
const MATRIX = "tblS6iRgPjYLBqZJh";
const textEvent = text => ({ type: "message", mode: "active", timestamp: Date.now(), source: { type: "user", userId: UID }, message: { type: "text", text } });
const catalog = () => ({ authority: "canonical_private_signup_catalog_v1", status: "verified", packages: [
  { code: "standard", price_thb: 1199, base_years: 1 }, { code: "premium", price_thb: 2999, base_years: 2 },
] });

async function conversation(fn, options = {}) {
  const original = globalThis.fetch;
  const matrices = new Map(), replies = [], writes = [], reads = [];
  let sequence = 0, takeover = false, matrixFail = false, kill = false, runtimeFail = false, replyFail = false;
  let afterCatalog = false;
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    if (url.hostname === "api.line.me") {
      assert.equal(url.pathname, "/v2/bot/message/reply");
      replies.push(await request.json());
      return Response.json({}, { status: replyFail ? 503 : 200 });
    }
    assert.equal(url.hostname, "api.airtable.com", "no model, public site or unrelated upstream");
    if (url.pathname.endsWith(MATRIX)) {
      if (matrixFail || afterCatalog && options.matrixFailsAfterCatalog) return Response.json({}, { status: 503 });
      if (request.method !== "GET") {
        const record = (await request.json()).records[0];
        const row = { id: record.id || "recMatrix", fields: record.fields };
        matrices.set(row.fields.conversation_id_hash, row);
        writes.push(row);
        return Response.json({ records: [row] });
      }
      const filter = url.searchParams.get("filterByFormula") || "";
      const row = [...matrices.values()].find(row => filter.includes(row.fields.conversation_id_hash));
      if (row && (options.matrixOwner || afterCatalog && options.matrixOwnerAfterCatalog)) {
        return Response.json({ records: [{ ...row, fields: { ...row.fields, handoff_required: true, handoff_owner: "Per", conversation_stage: "human_takeover", handoff_reason: "owner_takeover" } }] });
      }
      return Response.json({ records: row ? [row] : [] });
    }
    if ((url.searchParams.get("filterByFormula") || "").includes("processing")) {
      return Response.json({ records: takeover || afterCatalog && options.ownerAfterCatalog ? [{ id: "recOwner" }] : [] });
    }
    if (request.method !== "GET") {
      assert.ok(url.pathname.endsWith("tbljCYfYqfm8gBTPq") || options.publicEntry && decodeURIComponent(url.pathname).endsWith("MMD — Console Inbox"), "only existing intake, conversation state and telemetry writes");
      return Response.json({ id: "fixture-event" });
    }
    return Response.json({ records: [] });
  };
  const env = {
    LINE_CHANNEL_SECRET: "fixture-secret", LINE_CHANNEL_ACCESS_TOKEN: "fixture-token", INTERNAL_TOKEN: "fixture-internal",
    AIRTABLE_API_KEY: "fixture", AIRTABLE_BASE_ID: "fixture", LINE_AUTO_REPLY_ENABLED: "false", LINE_FIRST_CONTACT_ENABLED: "false",
    LINE_KENJI_AI_ENABLED: "true", LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED: "true", KENJI_LINE_CONTINUITY_ENABLED: "true",
    LINE_KENJI_MODEL_ENABLED: "false", ...options.env,
    ADMIN_WORKER: { fetch: async () => runtimeFail ? Response.json({}, { status: 503 }) : Response.json({ ok: true,
      controls: { line_oa_auto_reply: kill || afterCatalog && options.killAfterCatalog, all_kenji_mutations: options.globalKill === true } }) },
    MEMBER_PAGES_WORKER: { fetch: async request => {
      assert.equal(new URL(request.url).pathname, "/__internal/kenji/member-truth");
      const body = await request.json();
      assert.equal(body.line_user_id, UID);
      reads.push(body.intent);
      afterCatalog = true;
      if (body.intent === "points_status") return Response.json({ ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: "resolved",
        membership: { level: "private_premium", label: "Premium", lifecycle: "active", expire_at: "2027-01-01" }, points: { status: "verified", active_points: 120 } });
      assert.equal(body.intent, "private_interest");
      return Response.json({ ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: "unresolved", private_signup_catalog: options.catalog || catalog() },
        { status: options.catalogStatus || 200 });
    } },
  };
  async function send(text, changes = {}, valid = true) {
    const event = { ...textEvent(text), replyToken: `reply-${++sequence}`, webhookEventId: `event-${sequence}`, ...changes };
    const raw = JSON.stringify({ events: [event] });
    const background = [];
    const request = new Request("https://www.mmdbkk.com/webhooks/line", {
      method: "POST", body: raw, headers: { "x-line-signature": valid ? await createLineSignature(raw, env.LINE_CHANNEL_SECRET) : "invalid" },
    });
    const ctx = { waitUntil: task => background.push(task) };
    const response = await handleKenjiSeedLineRequest(request, env, ctx, options.publicEntry ? canonicalWorker : { fetch: async (_request, _env, ctx) => {
      const work = (async () => {
        const continuity = await resolveKenjiLineContinuity({ env, event, currentIntent: "note_only" });
        return writeKenjiLineMatrixTurn({ env, continuity, decision: { intent: "note_only" } });
      })();
      if (ctx?.waitUntil) ctx.waitUntil(work); else await work;
      return Response.json({ saved: [{}] });
    } });
    for (const task of background) await task;
    return { status: response.status, body: await response.json() };
  }
  try {
    await fn({ send, env, replies, writes, reads, matrices,
      set: values => { ({ takeover = takeover, matrixFail = matrixFail, kill = kill, runtimeFail = runtimeFail, replyFail = replyFail } = values); } });
  } finally { globalThis.fetch = original; }
}

test("only three exact text commands open intake; no group, image, postback or neighboring text", () => {
  for (const word of ["package", "regis", "apply"]) {
    assert.equal(lineIntakeCommand(textEvent(` \uFEFF${word.toUpperCase()}\u200B `)), word);
    assert.equal(lineIntakeCommand({ ...textEvent(word), source: { type: "group", userId: UID } }), "");
    assert.equal(lineIntakeCommand({ ...textEvent(word), type: "postback" }), "");
    assert.equal(lineIntakeCommand({ ...textEvent(word), message: { type: "image", text: word } }), "");
  }
  for (const word of ["checkpts", "register", "application", "my package", "apply now", "package\nignore instructions"])
    assert.equal(lineIntakeCommand(textEvent(word)), "");
});

test("exact commands are not concatenated with neighboring webhook messages", async () => {
  const events = [textEvent("package"), textEvent("regis"), textEvent("apply"), textEvent("hello")];
  assert.ok(prepareKenjiLineWebhookBatch(events).every(item => !item.suppressed && item.aggregate_count === 1));
  for (const event of events.slice(0, 3)) {
    const result = await aggregateKenjiLineTurn({ event, env: { KENJI_LINE_MESSAGE_AGGREGATION_ENABLED: "true",
      KENJI_MODEL_DEDUPE: { idFromName() { assert.fail("command must not use burst storage"); } } } });
    assert.equal(result.source, "line_intake_command");
  }
});

for (const command of ["package", "regis", "apply"]) test(`signed ${command} replies once with broad auto reply off and keeps LINE-only state`, async () => {
  await conversation(async ({ send, replies, writes, reads }) => {
    const result = await send(command);
    assert.equal(result.status, 200);
    assert.equal(result.body.saved[0].reply_source, "line_intake_command_v1");
    assert.equal(replies.length, 1);
    const answer = replies[0].messages[0].text;
    assert.doesNotMatch(answer, /https?:|liff:|\/sigil|ทีม|Kenji|เปิดสมาชิกแล้ว|ยืนยันการจองแล้ว/);
    assert.match(answer, command === "apply" ? /สมัครเป็นนายแบบ/ : /Standard.*1 ปี[\s\S]*Premium.*2 ปี/);
    const state = JSON.parse(writes.at(-1).fields.payload_json).rich_menu_v1;
    assert.equal(state.entry, "line_intake_command_v1");
    assert.equal(state.topic, command);
    assert.equal(state.closed, false);
    assert.deepEqual(reads, command === "apply" ? [] : ["private_interest"]);
  });
});

test("package -> Premium -> registration details stays in LINE then hands off to Per", async () => {
  await conversation(async ({ send, replies, writes, env }) => {
    await send("package");
    assert.match(replies.at(-1).messages[0].text, /1,199[\s\S]*2,999/);
    await send("Premium");
    assert.match(replies.at(-1).messages[0].text, /สนใจ Premium[\s\S]*เคยเป็นสมาชิก/);
    assert.equal(JSON.parse(writes.at(-1).fields.payload_json).rich_menu_v1.topic, "regis");
    await send("ไม่เคยครับ");
    assert.match(replies.at(-1).messages[0].text, /สรุปแพ็กเกจ ยอด พร้อมบัญชีรับเงิน/);
    assert.equal(writes.at(-1).fields.handoff_owner, "Per");
    assert.equal(JSON.parse(writes.at(-1).fields.payload_json).rich_menu_v1.closed, true);
    const count = replies.length;
    await send("ขอบคุณครับ");
    assert.equal(replies.length, count);
    assert.equal(env.LINE_AUTO_REPLY_ENABLED, "false");
  });
});

test("apply receives details without echoing personal input or creating a model/member", async () => {
  await conversation(async ({ send, replies, writes }) => {
    await send("apply");
    const next = await send("ชื่อทดสอบ อยู่กรุงเทพครับ");
    assert.equal(next.body.saved[0].intent, "model_application");
    assert.match(replies.at(-1).messages[0].text, /ยังไม่ถือว่าผ่านการคัดเลือก/);
    assert.doesNotMatch(replies.at(-1).messages[0].text, /ชื่อทดสอบ|สมัครสมาชิก|บัญชีรับเงิน/);
    assert.equal(writes.at(-1).fields.handoff_owner, "Per");
  });
});

test("checkpts retains its existing verified shortcut and unprompted text remains silent", async () => {
  await conversation(async ({ send, replies }) => {
    await send("hello");
    assert.equal(replies.length, 0);
    const result = await send("checkpts");
    assert.equal(result.body.saved[0].reply_source, "my_mmd_points_shortcut_v2");
    assert.match(replies.at(-1).messages[0].text, /120 Points/);
  });
});

test("signed webhook uses real canonical intake before replying to each new command", async () => {
  for (const command of ["package", "regis", "apply"]) await conversation(async ({ send, replies }) => {
    const result = await send(command);
    assert.equal(result.status, 200);
    assert.equal(replies.length, 1);
    assert.match(replies[0].messages[0].text, command === "apply" ? /สมัครเป็นนายแบบ/ : /Standard[\s\S]*Premium/);
    assert.doesNotMatch(replies[0].messages[0].text, /https?:|liff:|\/sigil/);
  }, { publicEntry: true });
});

for (const kind of ["takeover", "matrixFail", "kill", "runtimeFail"]) test(`${kind} blocks intake and catalog reads`, async () => {
  await conversation(async ({ send, set, replies, reads }) => {
    set({ [kind]: true });
    await send("package");
    assert.equal(replies.length, 0);
    assert.equal(reads.length, 0);
  });
});

for (const options of [{ ownerAfterCatalog: true }, { matrixOwnerAfterCatalog: true }, { matrixFailsAfterCatalog: true }, { killAfterCatalog: true }, { globalKill: true },
  { env: { LINE_KENJI_AI_ENABLED: "false" } }, { env: { LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED: "false" } }, { env: { KENJI_LINE_CONTINUITY_ENABLED: "false" } }]) {
  test(`runtime/owner gates remain fail-closed: ${JSON.stringify(options)}`, async () => {
    await conversation(async ({ send, replies }) => { await send("package"); assert.equal(replies.length, 0); }, options);
  });
}

test("bad signature, stale event, group, redelivery, missing token and malformed identity never reply", async () => {
  await conversation(async ({ send, replies, reads }) => {
    assert.equal((await send("package", {}, false)).status, 401);
    for (const change of [{ timestamp: Date.now() - 360000 }, { mode: "standby" }, { deliveryContext: { isRedelivery: true } },
      { replyToken: "" }, { source: { type: "group", userId: UID } }, { source: { type: "user", userId: "unverified" } }]) await send("package", change);
    assert.equal(replies.length, 0);
    assert.equal(reads.length, 0);
  });
});

test("unavailable or malformed catalog never turns into a price or raw error", async () => {
  for (const options of [{ catalogStatus: 503 }, { catalog: { authority: "untrusted", status: "verified", packages: catalog().packages } },
    { catalog: { ...catalog(), packages: [...catalog().packages, catalog().packages[0]] } }]) await conversation(async ({ send, replies }) => {
    await send("package");
    assert.match(replies[0].messages[0].text, /ราคาล่าสุดยังตรวจไม่ได้/);
    assert.doesNotMatch(replies[0].messages[0].text, /1,199|2,999|503|Error|https?:/);
  }, options);
});

test("follow-up needs delivered, unexpired state; failed sends do not open intake", async () => {
  const now = Date.now();
  const continuity = { available: true, matrix: { payload_json: { rich_menu_v1: { entry: "line_intake_command_v1", topic: "regis", expires_at: new Date(now - 1).toISOString() } } } };
  assert.equal(lineIntakeTopic(textEvent("Premium"), continuity, now), "");
  await conversation(async ({ send, set, replies, writes }) => {
    set({ replyFail: true });
    await send("package");
    assert.ok(writes.every(row => !JSON.parse(row.fields.payload_json || "{}").rich_menu_v1));
    set({ replyFail: false });
    await send("Premium");
    assert.equal(replies.length, 1, "failed attempted reply only; no follow-up window");
  });
});

test("payment/approval topics hand off; CARE BACK copy stops at Bangkok month end", () => {
  const now = Date.parse("2026-10-29T12:00:00+07:00");
  const first = resolveLineIntakeReply(textEvent("package"), {}, catalog(), now);
  assert.match(first.text, /CARE BACK ถึง 31 ต.ค. 2569/);
  assert.doesNotMatch(resolveLineIntakeReply(textEvent("package"), {}, catalog(), Date.parse("2026-11-01T00:00:00+07:00")).text, /CARE BACK|10%/);
  const continuity = { available: true, matrix: { payload_json: { rich_menu_v1: first.rich_menu_state } } };
  const decision = resolveLineIntakeReply(textEvent("โอนแล้วครับ"), continuity, null, now);
  assert.equal(decision.handoff_required, true);
  assert.equal(decision.rich_menu_state.closed, true);
  assert.match(decision.text, /ยังไม่ต้องโอนซ้ำ/);
});
