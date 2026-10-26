import test from "node:test";
import assert from "node:assert/strict";
import { createLineSignature } from "../src/index.js";
import { handleKenjiSeedLineRequest } from "../src/kenji-seed-line-runtime.mjs";
import { richMenuConversationStart, resolveRichMenuConversation } from "../src/rich-menu-conversation.mjs";
import { resolveKenjiLineContinuity, writeKenjiLineMatrixTurn } from "../src/kenji-line-continuity-runtime.mjs";

const MATRIX = "tblS6iRgPjYLBqZJh";
const textEvent = text => ({ type: "message", source: { type: "user", userId: `U${"1".repeat(32)}` }, message: { type: "text", text } });

async function conversation(fn, options = {}) {
  const original = globalThis.fetch;
  const replies = [], writes = [], egress = [];
  const matrices = new Map();
  let replyOk = true, takeover = false, controlsFail = false, matrixFail = false, kill = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (!["api.line.me", "api.airtable.com"].includes(url.hostname)) {
      egress.push(url.hostname);
      throw Error("unexpected external request");
    }
    if (url.hostname === "api.line.me") {
      assert.equal(url.pathname, "/v2/bot/message/reply");
      replies.push(JSON.parse(init.body));
      return Response.json({}, { status: replyOk ? 200 : 500 });
    }
    if (url.pathname.endsWith(MATRIX)) {
      if (matrixFail) return Response.json({}, { status: 503 });
      if (["POST", "PATCH"].includes(init.method)) {
        const record = JSON.parse(init.body).records[0];
        const row = { id: record.id || `recMatrix${matrices.size}`, fields: record.fields };
        matrices.set(row.fields.conversation_id_hash, row);
        writes.push(row);
        return Response.json({ records: [row] });
      }
      const filter = url.searchParams.get("filterByFormula") || "";
      const row = [...matrices.values()].find(row => filter.includes(row.fields.conversation_id_hash));
      return Response.json({ records: row ? [row] : [] });
    }
    if ((url.searchParams.get("filterByFormula") || "").includes("processing"))
      return Response.json({ records: takeover ? [{ id: "owner", fields: { status: "processing" } }] : [] }, { status: controlsFail ? 503 : 200 });
    if (["POST", "PATCH"].includes(init.method)) {
      assert.ok(url.pathname.endsWith("tbljCYfYqfm8gBTPq"), "only existing telemetry or conversation state may be written");
      return Response.json({ id: "test-event" });
    }
    return Response.json({ records: [] });
  };
  const env = {
    LINE_CHANNEL_SECRET: "test-secret", LINE_CHANNEL_ACCESS_TOKEN: "test-token",
    LINE_AUTO_REPLY_ENABLED: "true", LINE_FIRST_CONTACT_ENABLED: "false", LINE_KENJI_AI_ENABLED: "true",
    LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED: "true", LINE_KENJI_MODEL_ENABLED: "false",
    KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED: "false", KENJI_LINE_CONTINUITY_ENABLED: "true",
    AIRTABLE_API_KEY: "test", AIRTABLE_BASE_ID: "test", INTERNAL_TOKEN: "test", ...options,
    ADMIN_WORKER: { fetch: async () => Response.json({ ok: true, controls: { line_oa_auto_reply: kill } }) },
  };
  let sequence = 0;
  async function send(event, valid = true) {
    const background = [];
    const ctx = { waitUntil: work => background.push(work) };
    const raw = JSON.stringify({ events: [{ mode: "active", replyToken: `reply-${++sequence}`, webhookEventId: `evt-${sequence}`, source: textEvent("").source, ...event }] });
    const response = await handleKenjiSeedLineRequest(new Request("https://www.mmdbkk.com/webhooks/line", {
      method: "POST", headers: { "x-line-signature": valid ? await createLineSignature(raw, "test-secret") : "invalid" }, body: raw,
    }), env, ctx, { fetch: async (_request, _env, intakeCtx) => {
      // Exercise the existing intake-only legacy matrix writer as well as the
      // outer reply owner; a silent classification must not erase delivered state.
      for (const event of JSON.parse(raw).events) {
        if (event.type === "postback") assert.equal(intakeCtx, null, "menu intake must finish before the reply state write");
        const work = (async () => {
          const continuity = await resolveKenjiLineContinuity({ env, event, currentIntent: "note_only" });
          return writeKenjiLineMatrixTurn({ env, continuity, decision: { intent: "note_only" } });
        })();
        if (intakeCtx?.waitUntil) intakeCtx.waitUntil(work);
        else await work;
      }
      return Response.json({ saved: [{}] });
    } });
    await Promise.all(background);
    return { status: response.status, body: await response.json() };
  }
  try {
    await fn({ send, env, replies, writes, matrices, egress,
      tap: (data = "mmd_action=rich_menu&menu=guest&button=0") => send({ type: "postback", postback: { data } }),
      set: flags => { ({ replyOk = replyOk, takeover = takeover, controlsFail = controlsFail, matrixFail = matrixFail, kill = kill } = flags); },
    });
    assert.deepEqual(egress, [], "zero external model requests");
  } finally { globalThis.fetch = original; }
}

test("delivered Rich Menu -> membership -> Standard/Premium -> Per handoff works only while replies enabled", async () => {
  for (const tier of ["Standard", "Premium"]) await conversation(async ({ tap, send, replies, writes, env }) => {
    await tap();
    assert.ok(JSON.parse(writes.at(-1).fields.payload_json).rich_menu_v1);
    const next = await send(textEvent("ขอรายละเอียดครับ"));
    assert.equal(next.body.saved[0].reply_source, "rich_menu_conversation_v1");
    assert.match(replies.at(-1).messages[0].text, /intent=signup&view=signup/);
    const handoff = await send(textEvent(tier));
    assert.equal(handoff.body.saved[0].handoff_required, true);
    assert.match(replies.at(-1).messages[0].text, /เปอร์ตรวจ/);
    assert.equal(writes.at(-1).fields.handoff_owner, "Per");
    assert.equal(JSON.parse(writes.at(-1).fields.payload_json).rich_menu_v1.closed, true);
    env.LINE_AUTO_REPLY_ENABLED = "false";
    await send(textEvent("มีอัปเดตไหม"));
    assert.equal(replies.length, 3, "leave the handed-off conversation to Per");
    assert.equal(writes.at(-1).fields.handoff_required, true);
    assert.equal(writes.at(-1).fields.handoff_owner, "Per");
  });
});

test("pause blocks repeated guest-models taps and existing continuity without clearing intake", async () => {
  await conversation(async ({ tap, send, replies, env }) => {
    await tap("mmd_action=rich_menu&menu=guest&button=1");
    assert.equal(replies.length, 1);
    env.LINE_AUTO_REPLY_ENABLED = "false";
    for (const action of [
      () => tap("mmd_action=rich_menu&menu=guest&button=1"),
      () => tap("mmd_action=rich_menu&menu=guest&button=1"),
      () => send(textEvent("สวัสดีครับ")),
      () => send(textEvent("Standard")),
      () => send(textEvent("ขอรายละเอียดครับ")),
    ]) {
      const result = await action();
      assert.equal(result.status, 200);
      assert.equal(result.body.saved[0].replied, false);
      assert.equal(result.body.saved[0].reply_source, "silent");
    }
    assert.equal(replies.length, 1);
    assert.equal(env.LINE_KENJI_MODEL_ENABLED, "false");
  });
});

test("SUPPORT continues renewal, Points and status without confirming truth or changing the payment contract", async () => {
  await conversation(async ({ tap, send, replies }) => {
    await tap("mmd_action=rich_menu&menu=public&button=5");
    for (const [text, route] of [["ต่ออายุ", "intent=renew&view=package"], ["ดูคะแนน", "intent=status&view=points"], ["สถานะสมาชิก", "intent=status&view=overview"]]) {
      await send(textEvent(text));
      assert.match(replies.at(-1).messages[0].text, new RegExp(route));
    }
    const result = await send(textEvent("ส่งสลิปสมัคร Premium แล้ว"));
    assert.equal(result.body.saved[0].handoff_required, true);
    assert.match(replies.at(-1).messages[0].text, /ยังไม่ยืนยันการชำระเงิน/);
    assert.doesNotMatch(replies.map(r => r.messages[0].text).join("\n"), /ชำระเงินสำเร็จ|อนุมัติแล้ว|Kenji|เคนจิ|api\.openai/);
  });
});

test("Guest/Public SUPPORT offers checkpts and routes it to verified MY MMD Points", async () => {
  for (const menu of ["guest", "public"]) await conversation(async ({ tap, send, replies, env }) => {
    env.LINE_AUTO_REPLY_ENABLED = "false";
    await tap(`mmd_action=rich_menu&menu=${menu}&button=5`);
    assert.match(replies.at(-1).messages[0].text, /checkpts/);
    const result = await send(textEvent("checkpts"));
    assert.equal(result.body.saved[0].reply_source, "rich_menu_conversation_v1");
    assert.match(replies.at(-1).messages[0].text, /intent=status&view=points/);
    assert.doesNotMatch(replies.at(-1).messages[0].text, /\d[\d,]*\s*(?:Points|แต้ม)/);
  });
});

test("no opt-in, different customer, expired window, disabled model-free lane and failed delivery cannot start menu chat", async () => {
  await conversation(async ({ tap, send, replies, matrices, set }) => {
    const initial = await send(textEvent("สมัครสมาชิก"));
    assert.notEqual(initial.body.saved[0].reply_source, "rich_menu_conversation_v1");
    set({ replyOk: false });
    await tap();
    assert.equal(matrices.size, 1); // The prior ordinary turn exists, but no delivered menu state.
    const failed = await send(textEvent("Standard"));
    assert.notEqual(failed.body.saved[0].reply_source, "rich_menu_conversation_v1");
    set({ replyOk: true });
    await tap();
    const other = await send({ ...textEvent("Standard"), source: { type: "user", userId: `U${"2".repeat(32)}` } });
    assert.notEqual(other.body.saved[0].reply_source, "rich_menu_conversation_v1");
    for (const row of matrices.values()) {
      const payload = JSON.parse(row.fields.payload_json);
      if (payload.rich_menu_v1) payload.rich_menu_v1.expires_at = "2000-01-01T00:00:00Z";
      row.fields.payload_json = JSON.stringify(payload);
    }
    const expired = await send(textEvent("Standard"));
    assert.notEqual(expired.body.saved[0].reply_source, "rich_menu_conversation_v1");
  });
  await conversation(async ({ tap, send, replies }) => {
    await tap(); const result = await send(textEvent("Standard"));
    assert.notEqual(result.body.saved[0].reply_source, "rich_menu_conversation_v1");
  }, { LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED: "false" });
});

test("owner takeover, failed owner lookup, kill switch, bad signature, redelivery and standby block follow-ups", async () => {
  for (const block of [{ takeover: true }, { controlsFail: true }, { matrixFail: true }, { kill: true }, { invalid: true }, { standby: true }, { redelivery: true }]) {
    await conversation(async ({ tap, send, replies, set }) => {
      await tap(); set(block);
      const event = { ...textEvent("Premium"), ...(block.standby ? { mode: "standby" } : {}), ...(block.redelivery ? { deliveryContext: { isRedelivery: true } } : {}) };
      const result = await send(event, !block.invalid);
      if (block.invalid) assert.equal(result.status, 401);
      else assert.notEqual(result.body.saved[0].reply_source, "rich_menu_conversation_v1");
      if (!block.matrixFail) assert.equal(replies.length, 1);
    });
  }
});

test("only bounded server-owned topics survive, and menu state contains no customer data", () => {
  const now = Date.now();
  const state = richMenuConversationStart({ menu: "private", button: 0 }, now);
  assert.deepEqual(Object.keys(state).sort(), ["expires_at", "topic"]);
  const continuity = { available: true, matrix: { payload_json: { rich_menu_v1: state } } };
  assert.equal(resolveRichMenuConversation(textEvent("Standard"), continuity, now).model_attempted, false);
  assert.equal(resolveRichMenuConversation(textEvent("Standard"), continuity, now + 30 * 60 * 1000), null);
  assert.equal(resolveRichMenuConversation(textEvent("x".repeat(601)), continuity, now), null);
  assert.equal(richMenuConversationStart({ menu: "unknown", button: 0 }), null);
});
