import test from "node:test";
import assert from "node:assert/strict";
import { createLineSignature } from "../src/index.js";
import { handleKenjiSeedLineRequest } from "../src/kenji-seed-line-runtime.mjs";
import { getMmdRichMenuActionMap, getMmdRichMenuDestinationMap } from "../src/mmd-rich-menu-scheduled-runtime.mjs";

async function run(data, { kill = false, globalKill = false, takeover = false, auto = true, deterministic = false, firstContact = false, mode = "active", redelivery = false, intake = true, signatureValid = true, message = "", matrixState = null, rightsCommand = false, memberTruth = null, memberTruthByIntent = null } = {}) {
  const replies = [], reads = [], memberTruthCalls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === "https://api.line.me/v2/bot/message/reply") { replies.push(JSON.parse(init.body)); return Response.json({}); }
    reads.push(url);
    if (url.includes("filterByFormula") && url.includes("processing")) return Response.json({ records: takeover ? [{ id: "owner", fields: { status: "processing" } }] : [] });
    if (matrixState && url.includes("tblS6iRgPjYLBqZJh") && init.method !== "POST")
      return Response.json({ records: [{ id: "matrix", fields: { payload_json: JSON.stringify({ rich_menu_v1: matrixState }), matrix_status: "active", state_expires_at: matrixState.expires_at } }] });
    if (init.method === "POST") return Response.json({ id: "test-event" });
    return Response.json({ records: [] });
  };
  try {
    const event = { type: message ? "message" : "postback", mode, ...(rightsCommand ? { timestamp: Date.now() } : {}), deliveryContext: { isRedelivery: redelivery },
      source: { type: "user", userId: `U${"1".repeat(32)}` }, replyToken: "test-reply", webhookEventId: "test-tap",
      ...(message ? { message: { type: "text", text: message } } : { postback: { data } }) };
    const raw = JSON.stringify({ events: [event] });
    const signature = signatureValid ? await createLineSignature(raw, "test-secret") : "invalid";
    const response = await handleKenjiSeedLineRequest(new Request("https://www.mmdbkk.com/webhooks/line", {
      method: "POST", headers: { "x-line-signature": signature }, body: raw,
    }), {
      LINE_CHANNEL_SECRET: "test-secret", LINE_CHANNEL_ACCESS_TOKEN: "test-token",
      LINE_AUTO_REPLY_ENABLED: String(auto), LINE_KENJI_AI_ENABLED: "true", LINE_FIRST_CONTACT_ENABLED: String(firstContact),
      LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED: String(deterministic),
      KENJI_LINE_RIGHTS_CHECK_MODE: rightsCommand ? "command" : "off",
      KENJI_LINE_RIGHTS_COMMAND_ENABLED: String(rightsCommand),
      KENJI_LINE_CONTINUITY_ENABLED: "true", AIRTABLE_API_KEY: "test", AIRTABLE_BASE_ID: "test",
      INTERNAL_TOKEN: "test",
      ADMIN_WORKER: { fetch: async () => Response.json({ ok: true, controls: { line_oa_auto_reply: kill, all_kenji_mutations: globalKill } }) },
      MEMBER_PAGES_WORKER: { fetch: async request => {
        const intent = (await request.json()).intent;
        memberTruthCalls.push(intent);
        const override = memberTruthByIntent?.[intent];
        return Response.json(override?.body || memberTruth || { ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: "resolved",
          membership: { level: "private_premium", lifecycle: "active", private_visibility_envelope: "premium" } },
        { status: override?.httpStatus || 200 });
      } },
    }, null, { fetch: async () => Response.json({ ok: true, saved: intake ? [{ campaign_event: false }] : [] }) });
    return { status: response.status, body: await response.json(), replies, reads, memberTruthCalls };
  } finally { globalThis.fetch = original; }
}

test("signed navigation taps send exactly one topic reply without knowledge or appended CTA", async () => {
  const destinations = getMmdRichMenuDestinationMap();
  for (const [menu, actions] of Object.entries(getMmdRichMenuActionMap())) {
    for (const [index, action] of actions.entries()) {
      if (action.type === "uri") {
        assert.equal(menu, "private");
        assert.equal(index, 0);
        assert.equal(action.uri, "https://www.mmdbkk.com/concierge/kenji?source=line&entry_route=rich_menu_private_kenji");
        continue;
      }

      const result = await run(action.data, { auto: true });
      assert.equal(result.status, 200);
      assert.equal(result.replies.length, 1);
      if (destinations[menu][index].type === "uri") assert.ok(result.replies[0].messages[0].text.endsWith(destinations[menu][index].uri));
      else assert.match(result.replies[0].messages[0].text, /พี่เปอร์ดูแลงาน|เช็กสิทธิ์|checkpts/);
      assert.equal(result.body.saved[0].reply_source, "rich_menu_navigation_v1");
      assert.equal(result.body.saved[0].cta_appended, false);
      assert.equal(result.body.saved[0].continuity_topic, "");
      assert.ok(result.reads.every(url => /tbljCYfYqfm8gBTPq|processing|tblS6iRgPjYLBqZJh|tblVv58TCbwh5j1fS|conversation_id/.test(decodeURIComponent(url))));
    }
  }
});

test("menu commands respect auto reply pause, LINE/global stop, owner takeover, signature, intake, standby and redelivery", async () => {
  const data = getMmdRichMenuActionMap().guest[1].data;
  for (const options of [{ globalKill: true }, { takeover: true }, { takeover: true, auto: false }, { mode: "standby" }, { redelivery: true }, { intake: false }, { signatureValid: false }])
    assert.equal((await run(data, options)).replies.length, 0);
  for (const options of [{ auto: false }, { auto: false, firstContact: true }, { kill: true }]) {
    const result = await run(data, options);
    assert.equal(result.replies.length, 0);
    assert.equal(result.body.saved[0].reply_source, "silent");
  }
});

test("pause silences every installed navigation postback including support without changing mappings", async () => {
  for (const actions of Object.values(getMmdRichMenuActionMap())) {
    for (const action of actions) {
      if (action.type === "uri") continue;
      const result = await run(action.data, { auto: false });
      assert.equal(result.status, 200);
      assert.equal(result.replies.length, 0);
      assert.equal(result.body.saved[0].replied, false);
    }
  }
});

test("scoped Per AI replies only to Guest/Public SUPPORT taps while the general LINE pause stays on", async () => {
  const map = getMmdRichMenuActionMap();
  for (const menu of ["guest", "public"]) {
    const support = await run(map[menu][5].data, { auto: false, deterministic: true });
    assert.equal(support.replies.length, 1);
    assert.equal(support.body.saved[0].reply_source, "rich_menu_navigation_v1");
    assert.match(support.replies[0].messages[0].text, /เปอร์|เช็กสิทธิ์/);
    for (const options of [{ kill: true }, { globalKill: true }, { takeover: true }, { mode: "standby" }, { redelivery: true }])
      assert.equal((await run(map[menu][5].data, { auto: false, deterministic: true, ...options })).replies.length, 0);
    assert.equal((await run(map[menu][1].data, { auto: false, deterministic: true })).replies.length, 0);
  }
  assert.equal((await run(map.private[5].data, { auto: false, deterministic: true })).replies.length, 0);
});

test("Per AI handles a bounded SUPPORT follow-up and never exposes an unverified Points number", async () => {
  const expires_at = new Date(Date.now() + 10 * 60_000).toISOString();
  const state = { topic: "support", entry: "per_support_button", expires_at };
  const result = await run("", { message: "เช็ก Points", matrixState: state, auto: false, deterministic: true });
  assert.equal(result.replies.length, 1);
  assert.equal(result.body.saved[0].reply_source, "rich_menu_conversation_v1");
  assert.match(result.replies[0].messages[0].text, /สถานะสมาชิก:.*\nPoints:.*\nวันหมดอายุ:/);
  assert.doesNotMatch(result.replies[0].messages[0].text, /https?:\/\//);
  assert.doesNotMatch(result.replies[0].messages[0].text, /\d[\d,]*\s*(?:Points|แต้ม)/);
  for (const other of [{ topic: "support", expires_at }, { topic: "models", entry: "per_support_button", expires_at }])
    assert.equal((await run("", { message: "เช็ก Points", matrixState: other, auto: false, deterministic: true })).replies.length, 0);
  assert.equal((await run("", { message: "เช็ก Points", matrixState: state, auto: false, deterministic: true, kill: true })).replies.length, 0);
});

test("Checkpts gives three fields plus campaign route after SUPPORT expires", async () => {
  const expired = { topic: "support", entry: "per_support_button", expires_at: "2000-01-01T00:00:00Z" };
  for (const [message, matrixState] of [["checkpts", null], ["Checkpts", expired]]) {
    const result = await run("", { message, matrixState, auto: false, deterministic: true });
    assert.equal(result.replies.length, 1);
    assert.equal(result.body.saved[0].reply_source, "my_mmd_points_shortcut_v2");
    assert.match(result.replies[0].messages[0].text, /สถานะสมาชิก:.*\nPoints:.*\nวันหมดอายุ:/);
    assert.match(result.replies[0].messages[0].text, /promotion\/6-years-care-back/);
    assert.doesNotMatch(result.replies[0].messages[0].text, /\d[\d,]*\s*(?:Points|แต้ม)/);
  }
  for (const options of [{ kill: true }, { globalKill: true }, { takeover: true }, { mode: "standby" }, { redelivery: true }, { signatureValid: false }, { deterministic: false }])
    assert.equal((await run("", { message: "Checkpts", auto: false, deterministic: true, ...options })).replies.length, 0);
  assert.equal((await run("", { message: "mycheckpts", auto: false, deterministic: true })).replies.length, 0);
});

test("Checkpts reports verified status, zero Points and expiry from canonical member truth", async () => {
  const memberTruth = { ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: "resolved",
    membership: { level: "private_premium", label: "Private Premium", lifecycle: "active", expire_at: "2027-02-03" },
    points: { status: "verified", active_points: 0 } };
  const active = { topic: "support", entry: "per_support_button", expires_at: new Date(Date.now() + 10 * 60_000).toISOString() };
  for (const [message, matrixState] of [["Checkpts", null], ["checkpts", active]]) {
    const result = await run("", { message, matrixState, memberTruth, auto: false, deterministic: true });
    assert.equal(result.replies.length, 1);
    assert.match(result.replies[0].messages[0].text, /^สถานะสมาชิก: Private Premium.*\nPoints: 0 Points ครับ\nวันหมดอายุ: 03\/02\/2027 ครับ/);
    assert.match(result.replies[0].messages[0].text, /promotion\/6-years-care-back/);
  }
});

test("Checkpts has separate replies for unverified Points and unverified identity", async () => {
  const known = await run("", { message: "Checkpts", auto: false, deterministic: true, memberTruth: {
    ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: "resolved",
    membership: { level: "public_member", label: "Public Member", lifecycle: "active", expire_at: "" },
    points: { status: "unavailable", active_points: null },
  } });
  assert.match(known.replies[0].messages[0].text, /สถานะสมาชิก: Public Member.*\nPoints: ยังยืนยันยอดไม่ได้ครับ\nวันหมดอายุ: ยังไม่มีวันที่ยืนยันได้ครับ/);
  const unknown = await run("", { message: "Checkpts", auto: false, deterministic: true, memberTruth: {
    ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: "unresolved",
    membership: { level: "private_premium", label: "Private Premium", lifecycle: "active", expire_at: "2027-02-03" },
    points: { status: "verified", active_points: 999 },
  } });
  assert.match(unknown.replies[0].messages[0].text, /^สถานะสมาชิก: ตอนนี้ยังตรวจสถานะจากระบบไม่ได้ครับ\nPoints: ยังยืนยันยอดไม่ได้ครับ\nวันหมดอายุ: ยังตรวจไม่ได้ครับ/);
  assert.match(unknown.replies[0].messages[0].text, /ยืนยันบัญชีผ่าน LINE/);
  assert.match(unknown.replies[0].messages[0].text, /promotion\/6-years-care-back/);
  assert.doesNotMatch(unknown.replies[0].messages[0].text, /999|Private Premium|2027/);
  assert.match(unknown.replies[0].messages[0].text, /promotion\/6-years-care-back/);
});

test("Checkpts keeps SVIP indefinite and sends a private-care CTA when Points lookup times out", async () => {
  const result = await run("", { message: "Checkpts", auto: false, deterministic: true, memberTruthByIntent: {
    points_status: { httpStatus: 503, body: { ok: false, status: "unavailable" } },
    membership_status: { body: { ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: "resolved",
      membership: { level: "svip", label: "SVIP", lifecycle: "active", expire_at: "2027-02-03" },
      points: { status: "verified", active_points: 999 } } },
  } });
  assert.deepEqual(result.memberTruthCalls, ["points_status", "membership_status"]);
  assert.equal(result.replies.length, 1);
  assert.match(result.replies[0].messages[0].text, /^สถานะสมาชิก: SVIP.*\nPoints: ยังยืนยันยอดไม่ได้ครับ\nวันหมดอายุ: SVIP ไม่มีวันหมดอายุปกติครับ/);
  assert.match(result.replies[0].messages[0].text, /ดูแลเป็นรายบุคคล/);
  assert.match(result.replies[0].messages[0].text, /promotion\/6-years-care-back/);
  assert.doesNotMatch(result.replies[0].messages[0].text, /999|03\/02\/2027/);

  const unavailable = await run("", { message: "Checkpts", auto: false, deterministic: true, memberTruthByIntent: {
    points_status: { httpStatus: 503, body: { ok: false, status: "unavailable" } },
    membership_status: { httpStatus: 503, body: { ok: false, status: "unavailable" } },
  } });
  assert.match(unavailable.replies[0].messages[0].text, /^สถานะสมาชิก: ตอนนี้ยังตรวจสถานะจากระบบไม่ได้ครับ\nPoints: ยังยืนยันยอดไม่ได้ครับ\nวันหมดอายุ: ยังตรวจไม่ได้ครับ/);
  assert.match(unavailable.replies[0].messages[0].text, /promotion\/6-years-care-back/);
});

test("exact rights alias uses the same Points shortcut inside and outside SUPPORT", async () => {
  const state = { topic: "support", entry: "per_support_button", expires_at: new Date(Date.now() + 10 * 60_000).toISOString() };
  const support = await run("", { message: "เช็กสิทธิ์", matrixState: state, auto: false, deterministic: true, rightsCommand: true });
  assert.equal(support.replies.length, 1);
  assert.equal(support.body.saved[0].reply_source, "my_mmd_points_shortcut_v2");
  assert.match(support.replies[0].messages[0].text, /สถานะสมาชิก:.*\nPoints:.*\nวันหมดอายุ:/);
  assert.match(support.replies[0].messages[0].text, /CARE BACK|Standard|Premium/);
  assert.match(support.replies[0].messages[0].text, /promotion\/6-years-care-back/);

  const standalone = await run("", { message: "เช็กสิทธิ์", auto: false, deterministic: true, rightsCommand: true });
  assert.equal(standalone.body.saved[0].reply_source, "my_mmd_points_shortcut_v2");
  assert.equal(standalone.replies.length, 1);
  assert.equal(standalone.replies[0].messages[0].text, support.replies[0].messages[0].text);
});
