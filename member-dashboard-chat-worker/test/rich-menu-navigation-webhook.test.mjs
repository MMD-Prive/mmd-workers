import test from "node:test";
import assert from "node:assert/strict";
import { createLineSignature } from "../src/index.js";
import { handleKenjiSeedLineRequest } from "../src/kenji-seed-line-runtime.mjs";
import { getMmdRichMenuActionMap, getMmdRichMenuDestinationMap } from "../src/mmd-rich-menu-scheduled-runtime.mjs";

async function run(data, { kill = false, globalKill = false, takeover = false, auto = true, firstContact = false, mode = "active", redelivery = false, intake = true, signatureValid = true } = {}) {
  const replies = [], reads = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === "https://api.line.me/v2/bot/message/reply") { replies.push(JSON.parse(init.body)); return Response.json({}); }
    reads.push(url);
    if (url.includes("filterByFormula") && url.includes("processing")) return Response.json({ records: takeover ? [{ id: "owner", fields: { status: "processing" } }] : [] });
    if (init.method === "POST") return Response.json({ id: "test-event" });
    return Response.json({ records: [] });
  };
  try {
    const event = { type: "postback", mode, deliveryContext: { isRedelivery: redelivery },
      source: { type: "user", userId: `U${"1".repeat(32)}` }, replyToken: "test-reply", webhookEventId: "test-tap", postback: { data } };
    const raw = JSON.stringify({ events: [event] });
    const signature = signatureValid ? await createLineSignature(raw, "test-secret") : "invalid";
    const response = await handleKenjiSeedLineRequest(new Request("https://www.mmdbkk.com/webhooks/line", {
      method: "POST", headers: { "x-line-signature": signature }, body: raw,
    }), {
      LINE_CHANNEL_SECRET: "test-secret", LINE_CHANNEL_ACCESS_TOKEN: "test-token",
      LINE_AUTO_REPLY_ENABLED: String(auto), LINE_KENJI_AI_ENABLED: "true", LINE_FIRST_CONTACT_ENABLED: String(firstContact),
      KENJI_LINE_CONTINUITY_ENABLED: "true", AIRTABLE_API_KEY: "test", AIRTABLE_BASE_ID: "test",
      INTERNAL_TOKEN: "test",
      ADMIN_WORKER: { fetch: async () => Response.json({ ok: true, controls: { line_oa_auto_reply: kill, all_kenji_mutations: globalKill } }) },
      MEMBER_PAGES_WORKER: { fetch: async () => Response.json({ ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: "resolved",
        membership: { level: "private_premium", lifecycle: "active", private_visibility_envelope: "premium" } }) },
    }, null, { fetch: async () => Response.json({ ok: true, saved: intake ? [{ campaign_event: false }] : [] }) });
    return { status: response.status, body: await response.json(), replies, reads };
  } finally { globalThis.fetch = original; }
}

test("signed navigation taps send exactly one topic reply without knowledge, continuity or appended CTA", async () => {
  const destinations = getMmdRichMenuDestinationMap();
  for (const [menu, actions] of Object.entries(getMmdRichMenuActionMap())) {
    for (const [index, action] of actions.entries()) {

      const result = await run(action.data, { auto: false });
      assert.equal(result.status, 200);
      assert.equal(result.replies.length, 1);
      if (destinations[menu][index].type === "uri") assert.ok(result.replies[0].messages[0].text.endsWith(destinations[menu][index].uri));
      else assert.match(result.replies[0].messages[0].text, /พี่เปอร์ดูแลงาน|เช็กสิทธิ์/);
      assert.equal(result.body.saved[0].reply_source, "rich_menu_navigation_v1");
      assert.equal(result.body.saved[0].cta_appended, false);
      assert.equal(result.body.saved[0].continuity_topic, "");
      assert.ok(result.reads.every(url => url.includes("tbljCYfYqfm8gBTPq") || url.includes("processing")));
    }
  }
});

test("menu commands work with broad replies OFF and respect global stop, owner takeover, signature, intake, standby and redelivery", async () => {
  const data = getMmdRichMenuActionMap().guest[1].data;
  for (const options of [{ globalKill: true }, { takeover: true }, { takeover: true, auto: false }, { mode: "standby" }, { redelivery: true }, { intake: false }, { signatureValid: false }])
    assert.equal((await run(data, options)).replies.length, 0);
  assert.equal((await run(data, { auto: false, firstContact: false, kill: true })).replies.length, 1);
  assert.equal((await run(data, { auto: false, firstContact: true })).replies.length, 1);
});
