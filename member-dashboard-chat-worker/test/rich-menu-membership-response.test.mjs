import assert from "node:assert/strict";
import test from "node:test";
import frontGate from "../src/mms-line-front-gate.js";
import { createLineSignature } from "../src/index.js";
import { handleKenjiSeedLineRequest } from "../src/kenji-seed-line-runtime.mjs";
import { canonicalSupportLevel, isRichMenuSupport, selectSupportPack } from "../src/rich-menu-membership-response.mjs";

const ids = { guest: "lv1_guest", public_member: "lv2_public_member", private_member: "lv3_private_member" };
const pack = (level) => ({ fields: {
  knowledge_id: `rich_menu_membership_level_response_pack_v1_${ids[level]}`,
  status: "active", response_mode: "auto_reply_allowed", allowed_channels: ["LINE_OFC"],
  customer_answer: level === "private_member" ? "Kenji พร้อมช่วยครับ" : "MMD พร้อมช่วยครับ",
  payload_json: JSON.stringify({ knowledge_type: "rich_menu_response", version: "v1", level, status: "published", source: "membership_resolver" }),
} });
const packs = Object.keys(ids).map(pack);
const memberTruth = (level = "none", lifecycle = "unresolved", identity = "resolved") => ({
  ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: identity, canonical_client_id: identity === "resolved" ? "client_1" : "",
  membership: { level, lifecycle, private_visibility_envelope: ["private_standard", "private_premium", "vip", "svip", "black_card"].includes(level) ? "premium" : "none", member_blocked: ["blocked", "revoked"].includes(lifecycle) },
});
const cases = [
  ["Guest", memberTruth("none", "unresolved", "unresolved"), "guest"],
  ["Public", memberTruth("public_member", "active"), "public_member"],
  ["Private", memberTruth("private_premium", "active"), "private_member"],
  ["Expired", memberTruth("private_premium", "expired"), "public_member"],
  ["Grace", memberTruth("private_premium", "grace"), "public_member"],
  ["Blocked", memberTruth("private_premium", "blocked"), "guest"],
  ["Revoked", memberTruth("private_premium", "revoked"), "guest"],
  ["Pending", memberTruth("private_premium", "pending"), "guest"],
];

async function signedRun({ truth = memberTruth("none", "unresolved", "unresolved"), cards = packs, knowledgeFailure = false, standby = false, redelivery = false, kill = false, invalid = false, fullEntry = false } = {}) {
  const originalFetch = globalThis.fetch;
  const reads = []; const replies = []; const audits = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.hostname === "api.line.me") { replies.push(JSON.parse(init.body)); return Response.json({}); }
    assert.equal(url.hostname, "api.airtable.com", "only published response packs and audit use Airtable");
    const table = url.pathname.split("/").at(-1);
    if (table === "audit") { if (init.method === "POST") { audits.push(JSON.parse(init.body).fields); return Response.json({ id: "recAudit" }); } return Response.json({ records: [] }); }
    assert.equal(table, "knowledge", "identity and entitlement must use the resolver service binding");
    reads.push(table);
    if (knowledgeFailure) return Response.json({}, { status: 503 });
    return Response.json({ records: cards });
  };
  try {
    const event = { type: "postback", mode: standby ? "standby" : "active", replyToken: "test-reply", webhookEventId: "test-event",
      deliveryContext: { isRedelivery: redelivery }, source: { type: "user", userId: `U${"1".repeat(32)}` },
      postback: { data: "mmd_action=support&audience=private&intent=private_talent", displayText: "Kenji private" } };
    const raw = JSON.stringify({ events: [event] });
    const signature = invalid ? "invalid" : await createLineSignature(raw, "test-secret");
    const handler = fullEntry ? frontGate.fetch.bind(frontGate) : handleKenjiSeedLineRequest;
    const response = await handler(new Request("https://www.mmdbkk.com/webhooks/line", { method: "POST", headers: { "x-line-signature": signature }, body: raw }), {
      AIRTABLE_API_KEY: "test", AIRTABLE_BASE_ID: "test", AIRTABLE_KENJI_KNOWLEDGE_TABLE_ID: "knowledge", AIRTABLE_TABLE_AI_MESSAGE_EVENTS_ID: "audit",
      LINE_CHANNEL_SECRET: "test-secret", LINE_CHANNEL_ACCESS_TOKEN: "test", LINE_AUTO_REPLY_ENABLED: "true", LINE_KENJI_AI_ENABLED: "true", KENJI_LINE_CONTINUITY_ENABLED: "true", INTERNAL_TOKEN: "test",
      MEMBER_PAGES_WORKER: { fetch: async () => Response.json(truth) },
      ADMIN_WORKER: { fetch: async () => Response.json({ ok: true, controls: { line_oa_auto_reply: kill, all_kenji_mutations: false, model_keyword_auto_reply: false } }) },
    });
    return { status: response.status, data: await response.json(), reads, replies, audits };
  } finally { globalThis.fetch = originalFetch; }
}

for (const [label, truth, level] of cases) test(`signed SUPPORT: ${label}; canonical member truth decides the response level`, async () => {
  const result = await signedRun({ truth });
  assert.equal(result.status, 200);
  const decision = result.data.saved[0];
  assert.equal(decision.canonical_level, level);
  assert.equal(decision.response_level, level);
  assert.equal(decision.reply_source, "rich_menu_response");
  assert.deepEqual(decision.selected_knowledge_ids, [pack(level).fields.knowledge_id]);
  assert.equal(result.reads.length, 1);
  assert.equal(result.replies[0].messages[0].text, pack(level).fields.customer_answer);
  assert.equal(JSON.parse(result.audits[0].payload_json).truth_authority, "my_mmd_entitlement_resolver_v1");
  if (level !== "private_member") assert.doesNotMatch(result.replies[0].messages[0].text, /Kenji/);
});

test("member truth or knowledge failure returns generic MMD without private disclosure", async () => {
  for (const options of [{ truth: {} }, { truth: memberTruth("private_premium", "active"), knowledgeFailure: true }]) {
    const result = await signedRun(options);
    assert.equal(result.data.saved[0].response_level, "guest");
    assert.deepEqual(result.data.saved[0].selected_knowledge_ids, []);
    assert.doesNotMatch(result.replies[0].messages[0].text, /Kenji/);
  }
});

for (const options of [{ standby: true }, { redelivery: true }, { kill: true }, { invalid: true }]) test("transport and runtime gates remain enforced", async () => {
  const result = await signedRun(options); assert.equal(result.replies.length, 0); assert.equal(result.reads.length, 0);
});

test("pack must match exact published ID, level, source, mode and channel", () => {
  for (const patch of [{ knowledge_id: "different" }, { status: "inactive" }, { response_mode: "do_not_answer" }, { allowed_channels: ["WEB"] }, { payload_json: "{" }]) {
    assert.equal(selectSupportPack([{ fields: { ...pack("private_member").fields, ...patch } }], "private_member"), null);
  }
  assert.equal(selectSupportPack([{ fields: { ...pack("guest").fields, customer_answer: "Kenji" } }], "guest"), null);
});

test("only SUPPORT postbacks enter this branch and unresolved truth remains Guest", () => {
  assert.equal(isRichMenuSupport({ type: "message", postback: { data: "mmd_action=support" } }), false);
  assert.equal(isRichMenuSupport({ type: "postback", postback: { data: "mmd_action=membership" } }), false);
  assert.equal(canonicalSupportLevel(null).level, "guest");
});

test("production entrypoint signed SUPPORT ignores forged Private audience", async () => {
  const result = await signedRun({ fullEntry: true });
  assert.equal(result.status, 200);
  assert.equal(result.data.saved[0].response_level, "guest");
  assert.deepEqual(result.data.saved[0].selected_knowledge_ids, [pack("guest").fields.knowledge_id]);
});
