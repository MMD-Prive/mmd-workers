import assert from "node:assert/strict";
import test from "node:test";
import frontGate from "../src/mms-line-front-gate.js";
import { createLineSignature } from "../src/index.js";
import { handleKenjiSeedLineRequest } from "../src/kenji-seed-line-runtime.mjs";
import { canonicalSupportLevel, isRichMenuSupport, selectSupportPack } from "../src/rich-menu-membership-response.mjs";

const client = (status = "active", verification = "verified") => ({ id: "recClient", fields: { "Membership Status": status, "Verification Status": verification } });
const entitlement = (capability = "private_standard", access_status = "active") => ({ id: "recEntitlement", fields: { capability, access_status } });
const ids = { guest: "lv1_guest", public_member: "lv2_public_member", private_member: "lv3_private_member" };
const pack = (level) => ({ fields: {
  knowledge_id: `rich_menu_membership_level_response_pack_v1_${ids[level]}`,
  status: "active", response_mode: "auto_reply_allowed", allowed_channels: ["LINE_OFC"],
  customer_answer: level === "private_member" ? "Kenji พร้อมช่วยครับ" : "MMD พร้อมช่วยครับ",
  payload_json: JSON.stringify({ knowledge_type: "rich_menu_response", version: "v1", level, status: "published", source: "membership_resolver" }),
} });
const packs = Object.keys(ids).map(pack);
const cases = [
  ["Guest", [], [], "guest"],
  ["Public", [client()], [entitlement("public_member")], "public_member"],
  ["Private", [client()], [entitlement()], "private_member"],
  ["Expired entitlement", [client()], [entitlement("private_standard", "expired")], "public_member"],
  ["Grace entitlement", [client()], [entitlement("private_standard", "grace")], "public_member"],
  ["Expired client with active private row", [client("expired")], [entitlement()], "public_member"],
  ["Grace client with active private row", [client("grace")], [entitlement()], "public_member"],
  ...["blocked", "suspended", "revoked", "unresolved"].map(s => [s, [client(s)], [entitlement()], "guest"]),
  ["Mixed active and revoked", [client()], [entitlement(), entitlement("public_member", "revoked")], "guest"],
  ["Unverified private", [client("active", "unverified")], [entitlement()], "guest"],
];

async function signedRun({ clients = [], rows = [], cards = packs, failure = "", offset = false, standby = false, redelivery = false, kill = false, invalid = false, fullEntry = false } = {}) {
  const originalFetch = globalThis.fetch;
  const reads = []; const replies = []; const audits = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.hostname === "api.line.me") { replies.push(JSON.parse(init.body)); return Response.json({}); }
    assert.equal(url.hostname, "api.airtable.com", "no model or other network fallback");
    const table = url.pathname.split("/").at(-1);
    if (table === "audit") {
      if (init.method === "POST") { audits.push(JSON.parse(init.body).fields); return Response.json({id:"recAudit"}); }
      return Response.json({ records: [] });
    }
    reads.push(table);
    if (table === failure) return Response.json({}, {status:503});
    const records = table === "clients" ? clients : table === "entitlements" ? rows : table === "knowledge" ? cards : null;
    assert.ok(records, `no continuity/memory/model read: ${table}`);
    return Response.json({ records, ...(offset && table === "entitlements" ? {offset:"more"} : {}) });
  };
  try {
    const event = { type:"postback", mode:standby ? "standby" : "active", replyToken:"test-reply", webhookEventId:"test-event",
      deliveryContext:{isRedelivery:redelivery}, source:{type:"user",userId:`U${"1".repeat(32)}`},
      postback:{ data:"mmd_action=support&audience=private&intent=private_talent", displayText:"Kenji private" } };
    const raw = JSON.stringify({events:[event]});
    const signature = invalid ? "invalid" : await createLineSignature(raw, "test-secret");
    const handler = fullEntry ? frontGate.fetch.bind(frontGate) : handleKenjiSeedLineRequest;
    const response = await handler(new Request("https://www.mmdbkk.com/webhooks/line", {
      method:"POST", headers:{"x-line-signature":signature}, body:raw,
    }), {
      AIRTABLE_API_KEY:"test", AIRTABLE_BASE_ID:"test", AIRTABLE_TABLE_CLIENTS_ID:"clients",
      AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID:"entitlements", AIRTABLE_KENJI_KNOWLEDGE_TABLE_ID:"knowledge",
      AIRTABLE_TABLE_AI_MESSAGE_EVENTS_ID:"audit", LINE_CHANNEL_SECRET:"test-secret", LINE_CHANNEL_ACCESS_TOKEN:"test",
      LINE_AUTO_REPLY_ENABLED:"true", LINE_KENJI_AI_ENABLED:"true", LINE_KENJI_MODEL_ENABLED:"true", KENJI_LINE_CONTINUITY_ENABLED:"true",
      INTERNAL_TOKEN:"test", ADMIN_WORKER:{fetch:async()=>Response.json({ok:true,controls:{line_oa_auto_reply:kill,all_kenji_mutations:false,model_keyword_auto_reply:false}})},
    });
    return { status:response.status, data:await response.json(), reads, replies, audits };
  } finally { globalThis.fetch = originalFetch; }
}

for (const [label, clients, rows, level] of cases) test(`signed SUPPORT: ${label}; forged audience cannot raise level`, async () => {
  const result = await signedRun({clients, rows});
  assert.equal(result.status,200);
  const decision = result.data.saved[0];
  assert.equal(decision.canonical_level,level);
  assert.equal(decision.response_level,level);
  assert.equal(decision.reply_source,"rich_menu_response");
  assert.deepEqual(decision.selected_knowledge_ids,[pack(level).fields.knowledge_id]);
  assert.equal(result.replies.length,1);
  assert.equal(result.replies[0].messages[0].text,pack(level).fields.customer_answer);
  const audit = JSON.parse(result.audits[0].payload_json);
  assert.equal(audit.canonical_level,level);
  assert.equal(audit.line_delivery_succeeded,true);
  assert.equal(audit.line_delivery_status,200);
  assert.equal(audit.truth_authority,"my_mmd_entitlement_resolver_v1");
  assert.equal(result.audits[0].selected_knowledge_ids,pack(level).fields.knowledge_id);
  if (level !== "private_member") assert.doesNotMatch(result.replies[0].messages[0].text,/Kenji/);
});

for (const failure of ["clients","entitlements","knowledge"]) test(`${failure} failure returns generic MMD`,async()=>{
  const r=await signedRun({clients:[client()],rows:[entitlement()],failure});
  assert.equal(r.data.saved[0].response_level,"guest");
  assert.deepEqual(r.data.saved[0].selected_knowledge_ids,[]);
  assert.doesNotMatch(r.replies[0].messages[0].text,/Kenji/);
});
for (const opts of [{clients:[client(),client()]},{clients:[client()],rows:[entitlement()],offset:true},{clients:[client()],rows:[entitlement()],cards:[pack("private_member"),pack("private_member")]},{clients:[client()],rows:[entitlement()],cards:[]}]) test("ambiguous/incomplete lookup or pack fails closed",async()=>{
  const r=await signedRun(opts); assert.equal(r.data.saved[0].response_level,"guest"); assert.deepEqual(r.data.saved[0].selected_knowledge_ids,[]);
});
for (const opts of [{standby:true},{redelivery:true},{kill:true},{invalid:true}]) test("transport and runtime gates remain enforced",async()=>{
  const r=await signedRun(opts); assert.equal(r.replies.length,0); assert.equal(r.reads.length,0);
});
test("pack must match exact published ID, level, source, mode and channel",()=>{
  for(const patch of [{knowledge_id:"different"},{status:"inactive"},{response_mode:"do_not_answer"},{allowed_channels:["WEB"]},{payload_json:"{"},{payload_json:JSON.stringify({knowledge_type:"rich_menu_response",version:"v1",level:"private_member",status:"draft",source:"membership_resolver"})}]) {
    assert.equal(selectSupportPack([{fields:{...pack("private_member").fields,...patch}}],"private_member"),null);
  }
  assert.equal(selectSupportPack([{fields:{...pack("guest").fields,customer_answer:"Kenji"}}],"guest"),null);
});
test("only SUPPORT postbacks enter this branch",()=>{
  assert.equal(isRichMenuSupport({type:"message",postback:{data:"mmd_action=support"}}),false);
  assert.equal(isRichMenuSupport({type:"postback",postback:{data:"mmd_action=membership"}}),false);
  assert.equal(canonicalSupportLevel(null,[]).level,"guest");
});

 test("production entrypoint signed SUPPORT selects Guest despite forged Private audience", async () => {
  const r = await signedRun({fullEntry:true});
  assert.equal(r.status,200);
  assert.equal(r.replies.length,1);
  assert.equal(r.data.saved[0].response_level,"guest");
  assert.deepEqual(r.data.saved[0].selected_knowledge_ids,[pack("guest").fields.knowledge_id]);
});
