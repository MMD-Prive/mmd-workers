import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import worker, {
  buildKenjiLineReply,
  createLineSignature,
  extractKenjiModelLookupQuery,
  extractKenjiModelVerificationEmail,
  inferLineIntent,
  KenjiModelIdempotency,
  resolveLineCardCampaignTrigger,
  resolveKenjiModelIntent,
  resolveKenjiLineReply,
} from "../src/index.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const LINE_USER_HASH = createHash("sha256").update(LINE_USER_ID).digest("hex");
const RUNTIME_STATUS_PATH = "/v1/internal/kenji/control/runtime/status";
const BASE_ENV = {
  INTERNAL_TOKEN: "internal-token",
  LINE_CHANNEL_SECRET: "line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "line-token",
  LINE_AUTO_REPLY_ENABLED: "true",
  LINE_KENJI_AI_ENABLED: "true",
  LINE_KENJI_KNOWLEDGE_ENABLED: "false",
  LINE_KENJI_MODEL_ENABLED: "false",
  LINE_KENJI_MODEL_ACCESS_ENABLED: "true",
  LINE_CARD_21829530_PILOT_HASHES: LINE_USER_HASH,
};

function healthyRuntimeResponse() {
  return new Response(JSON.stringify({
    ok: true,
    controls: {
      line_oa_auto_reply: false,
      model_keyword_auto_reply: false,
      all_kenji_mutations: false,
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function lineEvent(text, overrides = {}) {
  return {
    type: "message",
    mode: "active",
    replyToken: "reply-token",
    source: { type: "user", userId: LINE_USER_ID },
    message: { id: "msg-model-access-1", type: "text", text },
    ...overrides,
  };
}

function adminBinding(payload, status = 200, calls = []) {
  return {
    async fetch(request) {
      if (new URL(request.url).pathname === RUNTIME_STATUS_PATH) return healthyRuntimeResponse();
      calls.push(request);
      return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
    },
  };
}

function pendingBinding(calls = []) {
  let pending = null;
  return {
    idFromName(name) { return name; },
    get() {
      return {
        async fetch(input, init = {}) {
          const body = input instanceof Request ? await input.json() : JSON.parse(init.body || "{}");
          calls.push(body);
          if (body.action === "put") {
            pending = body.query;
            return new Response(JSON.stringify({ ok: true, stored: true }), { status: 200 });
          }
          if (body.action === "get") {
            return new Response(JSON.stringify(pending ? { ok: true, found: true, query: pending } : { ok: true, found: false }), { status: 200 });
          }
          if (body.action === "delete") {
            pending = null;
            return new Response(JSON.stringify({ ok: true, deleted: true }), { status: 200 });
          }
          return new Response(JSON.stringify({ ok: false }), { status: 400 });
        },
      };
    },
  };
}

function durableBinding(options = {}) {
  const objects = new Map();
  let contextPutFailuresRemaining = Number(options.contextPutFailures) || 0;
  let claimCommitFailuresRemaining = Number(options.claimCommitFailures) || 0;
  return {
    idFromName(name) { return name; },
    get(id) {
      if (!objects.has(id)) {
        const values = new Map();
        if (options.initialContext && String(id).includes("context-v1")) {
          values.set("campaign-lead:context", options.initialContext);
        }
        let alarm = null;
        const storage = {
          async get(key) { return values.get(key); },
          async put(key, value) { values.set(key, value); },
          async delete(keyOrKeys) {
            for (const key of Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]) values.delete(key);
          },
          async list({ prefix } = {}) { return new Map([...values].filter(([key]) => !prefix || key.startsWith(prefix))); },
          async getAlarm() { return alarm; },
          async setAlarm(value) { alarm = value; },
          async transaction(callback) {
            return callback({ get: storage.get, put: storage.put, delete: storage.delete });
          },
        };
        objects.set(id, new KenjiModelIdempotency({ storage }));
      }
      return {
        async fetch(input, init = {}) {
          const request = input instanceof Request ? input : new Request(String(input), init);
          if (new URL(request.url).pathname === "/campaign-lead/context" && contextPutFailuresRemaining > 0) {
            const body = JSON.parse(init.body || "{}");
            if (body.action === "put") {
              contextPutFailuresRemaining -= 1;
              return new Response(JSON.stringify({ ok: false, error: "context_unavailable" }), { status: 503 });
            }
          }
          if (new URL(request.url).pathname === "/campaign-lead/claim" && claimCommitFailuresRemaining > 0) {
            const body = JSON.parse(init.body || "{}");
            if (body.action === "commit") {
              claimCommitFailuresRemaining -= 1;
              return new Response(JSON.stringify({ ok: true, committed: false }), { status: 200 });
            }
          }
          return objects.get(id).fetch(request);
        },
      };
    },
  };
}

test("owner-approved rollout keeps LLM and card leads off while gated model lookup is on", () => {
  const lineWrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const adminWrangler = readFileSync(new URL("../../admin-worker/wrangler.toml", import.meta.url), "utf8");
  assert.match(lineWrangler, /^LINE_KENJI_MODEL_ENABLED\s*=\s*"false"$/m);
  assert.match(lineWrangler, /^LINE_KENJI_MODEL_ACCESS_ENABLED\s*=\s*"true"$/m);
  assert.match(lineWrangler, /^KENJI_LINE_MESSAGE_AGGREGATION_ENABLED\s*=\s*"true"$/m);
  assert.match(lineWrangler, /^KENJI_LINE_MESSAGE_AGGREGATION_WAIT_MS\s*=\s*"650"$/m);
  assert.match(lineWrangler, /^KENJI_LINE_MESSAGE_AGGREGATION_WINDOW_MS\s*=\s*"2200"$/m);
  assert.match(lineWrangler, /^KENJI_LINE_MESSAGE_AGGREGATION_MAX_MESSAGES\s*=\s*"4"$/m);
  assert.match(lineWrangler, /^LINE_CARD_21829530_LEAD_ENABLED\s*=\s*"false"$/m);
  assert.match(lineWrangler, /^LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR\s*=\s*"true"$/m);
  assert.match(lineWrangler, /^LINE_CARD_21829530_PILOT_HASHES\s*=\s*""$/m);
  assert.match(lineWrangler, /binding\s*=\s*"ADMIN_WORKER"\s*\nservice\s*=\s*"admin-worker"/m);
  assert.doesNotMatch(adminWrangler, /v1\/internal\/kenji\/model-access/);
});

async function signedWebhook(events, env = BASE_ENV) {
  const raw = JSON.stringify({ events });
  const signature = await createLineSignature(raw, env.LINE_CHANNEL_SECRET);
  return new Request("https://mmdbkk.com/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body: raw,
  });
}

test("greeting action keywords enter canonical intents", () => {
  assert.equal(inferLineIntent("ดูนายแบบ", lineEvent("ดูนายแบบ")), "model_browse");
  assert.equal(inferLineIntent("จองบริการ", lineEvent("จองบริการ")), "mmd_companion");
  assert.equal(inferLineIntent("สิทธิ์ของฉัน", lineEvent("สิทธิ์ของฉัน")), "membership_status");
  assert.equal(inferLineIntent("คุยกับเปอร์", lineEvent("คุยกับเปอร์")), "per_continuity");
  assert.equal(inferLineIntent("ถามเปอร์", lineEvent("ถามเปอร์")), "per_continuity");
  assert.equal(inferLineIntent("ชำระเงิน", lineEvent("ชำระเงิน")), "payment_center");
  assert.equal(inferLineIntent("payment", lineEvent("payment")), "payment_center");
  assert.equal(inferLineIntent("ส่งสลิป", lineEvent("ส่งสลิป")), "payment_slip");
  assert.match(buildKenjiLineReply(lineEvent("ชำระเงิน")), /Payment Center/);
  assert.match(buildKenjiLineReply(lineEvent("ชำระเงิน")), /member\/payments/);
  assert.doesNotMatch(buildKenjiLineReply(lineEvent("ชำระเงิน")), /ส่งสลิปหรือหลักฐาน/);
});

test("LINE Per entry never introduces HITO or Kenji to the customer", () => {
  const direct = buildKenjiLineReply(lineEvent("คุยกับเปอร์"));
  const aiAlias = buildKenjiLineReply(lineEvent("Hi Per"));
  assert.match(direct, /อยู่ครับ|บอกผมได้เลย/);
  assert.doesNotMatch(direct, /HITO|Kenji|เคนจิ/i);
  assert.doesNotMatch(aiAlias, /HITO|Kenji|เคนจิ/i);
});

test("explicit RUN number syntax enters model lookup while bare numbers stay non-model", () => {
  assert.equal(extractKenjiModelLookupQuery("RUN 19"), "19");
  assert.equal(extractKenjiModelLookupQuery("Run Number 19"), "19");
  assert.equal(extractKenjiModelLookupQuery("run no. 19"), "19");
  assert.equal(extractKenjiModelLookupQuery("รัน 19"), "19");
  assert.equal(extractKenjiModelLookupQuery("เลขรัน 19"), "19");
  assert.equal(extractKenjiModelLookupQuery("19"), "");
  assert.equal(extractKenjiModelLookupQuery("19:00"), "");
  assert.equal(extractKenjiModelLookupQuery("25000"), "");
});

test("plain conversational words remain blocked from standalone model lookup", () => {
  for (const value of ["คืนนี้", "ราคา", "จอง", "สมาชิก", "ชำระเงิน", "ผู้ชาย", "ผู้หญิง", "ทั้งคู่", "ขอบคุณ"]) {
    assert.equal(extractKenjiModelLookupQuery(value), "");
  }
});

test("model browse asks preference and never treats preference words as model names", async () => {
  for (const value of ["ผู้ชาย", "ผู้หญิง", "ทั้งคู่", "ชายหญิง", "ชญ"]) {
    assert.equal(extractKenjiModelLookupQuery(value), "");
  }

  const start = await resolveKenjiLineReply(lineEvent("ดูนายแบบ"), {}, BASE_ENV, {
    continuity: { effective_intent: "model_browse", matrix: { payload_json: {} } },
  });
  assert.match(start.text, /ผู้ชาย \/ ผู้หญิง \/ ทั้งคู่/);
  assert.equal(start.model_browse_state.awaiting, "model_gender");
  assert.equal(start.clear_model_context, true);

  const picked = await resolveKenjiLineReply(lineEvent("ผู้ชาย"), {}, BASE_ENV, {
    continuity: {
      effective_intent: "model_browse_gender",
      matrix: { payload_json: { model_browse_v1: { awaiting: "model_gender" } } },
    },
  });
  assert.match(picked.text, /Public Models/);
  assert.equal(picked.model_browse_state.awaiting, "model_name");
  assert.equal(picked.model_browse_state.preferred_model_gender, "man");
  assert.equal(picked.clear_model_context, true);
});

test("model browse copy follows canonical private visibility without granting protected groups", async () => {
  const memberPages = (membership) => ({
    async fetch() {
      return new Response(JSON.stringify({
        ok: true,
        authority: "my_mmd_entitlement_resolver_v1",
        identity_status: "resolved",
        canonical_client_id: "recClient",
        display_name: "Test",
        membership,
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const privateEnv = {
    ...BASE_ENV,
    MEMBER_PAGES_WORKER: memberPages({
      level: "private_premium",
      lifecycle: "active",
      private_visibility_envelope: "premium",
      member_blocked: false,
    }),
  };
  const privateStart = await resolveKenjiLineReply(lineEvent("ดูนายแบบ"), {}, privateEnv, {
    continuity: { effective_intent: "model_browse", matrix: { payload_json: {} } },
  });
  assert.match(privateStart.text, /Public และ Private/);
  assert.match(privateStart.text, /GWs \/ EMs/);
  assert.match(privateStart.text, /รายคน/);

  const publicEnv = {
    ...BASE_ENV,
    MEMBER_PAGES_WORKER: memberPages({
      level: "public_member",
      lifecycle: "active",
      private_visibility_envelope: "none",
      member_blocked: false,
    }),
  };
  const publicPicked = await resolveKenjiLineReply(lineEvent("ผู้ชาย"), {}, publicEnv, {
    continuity: {
      effective_intent: "model_browse_gender",
      matrix: { payload_json: { model_browse_v1: { awaiting: "model_gender" } } },
    },
  });
  assert.match(publicPicked.text, /Public Models/);
  assert.match(publicPicked.text, /Private \/ GWs \/ EMs/);
  assert.doesNotMatch(publicPicked.text, /มี Private visibility อยู่ด้วย/);
});

test("universal Model resolver normalizes campaign triggers and direct Model names through one identity query", () => {
  const campaign = resolveKenjiModelIntent("GWs19");
  assert.equal(campaign.matched, true);
  assert.equal(campaign.intent, "model_lookup");
  assert.equal(campaign.source, "campaign_trigger");
  assert.equal(campaign.query, "GWs19");
  assert.equal(campaign.campaign_trigger.card_trigger, "GWs19");

  const ems = resolveKenjiModelIntent("EMs11");
  assert.equal(ems.query, "EMs11");
  assert.equal(ems.source, "campaign_trigger");

  const tah = resolveKenjiModelIntent("Tah");
  assert.equal(tah.query, "TAH");
  assert.equal(tah.campaign_trigger.card_trigger, "TAH");

  const direct = resolveKenjiModelIntent("MX17");
  assert.equal(direct.matched, true);
  assert.equal(direct.source, "model_lookup");
  assert.equal(direct.query, "MX17");
  assert.equal(direct.campaign_trigger, null);

  const thai = resolveKenjiModelIntent("บุค");
  assert.equal(thai.matched, true);
  assert.equal(thai.query, "บุค");
  assert.equal(resolveKenjiModelIntent("คืนนี้").matched, false);
});

test("standalone model names and short follow-ups keep guarded model context", () => {
  assert.equal(extractKenjiModelLookupQuery("บุค"), "บุค");
  assert.equal(inferLineIntent("บุค", lineEvent("บุค")), "model_lookup");
  assert.equal(extractKenjiModelLookupQuery("คืนนี้"), "");
  assert.notEqual(inferLineIntent("คืนนี้", lineEvent("คืนนี้")), "model_lookup");

  const continuity = {
    decision: "ambiguous",
    effective_intent: "availability_request",
    matrix: {
      payload_json: {
        active_model_v1: { model_code: "MX17", working_name: "Jasper" },
      },
    },
  };
  assert.match(buildKenjiLineReply(lineEvent("คืนนี้"), {}, { continuity }), /Jasper \(MX17\)/);
  assert.match(buildKenjiLineReply(lineEvent("เท่าไหร่"), {}, {
    continuity: { ...continuity, effective_intent: "pricing_review" },
  }), /Jasper \(MX17\)/);
  assert.match(buildKenjiLineReply(lineEvent("จองเลย"), {}, {
    continuity: { ...continuity, effective_intent: "mmd_companion" },
  }), /Jasper \(MX17\)/);
});

test("stale active Model context is never reused in customer-facing follow-ups", () => {
  const continuity = {
    decision: "stale_refresh",
    effective_intent: "pricing_review",
    matrix: {
      matrix_status: "stale",
      state_expires_at: "2026-09-01T00:00:00.000Z",
      payload_json: {
        active_model_v1: { model_code: "OLD17", working_name: "Old Model" },
      },
    },
  };
  const reply = buildKenjiLineReply(lineEvent("ราคา"), {}, { continuity });
  assert.doesNotMatch(reply, /Old Model|OLD17/);
});

test("card triggers are campaign leads while neutral codes remain model lookups", () => {
  assert.equal(extractKenjiModelLookupQuery("MX17"), "MX17");
  assert.equal(extractKenjiModelLookupQuery("model MX17 ครับ"), "MX17");
  assert.equal(extractKenjiModelLookupQuery("ชื่อนายแบบ น้องซิน"), "น้องซิน");
  for (const card of ["JASPER", "NANO", "EMs01", "BOOK EI", "EMs11", "GWs19", "TAH"]) {
    assert.equal(extractKenjiModelLookupQuery(card), card);
    assert.equal(inferLineIntent(card, lineEvent(card)), "card_campaign_lead");
    assert.equal(resolveLineCardCampaignTrigger(card)?.card_trigger, card);
  }
  assert.equal(resolveLineCardCampaignTrigger("Jasper")?.card_trigger, "JASPER");
  assert.equal(resolveLineCardCampaignTrigger("JASPER")?.display_intent, "Jasper");
  assert.equal(resolveLineCardCampaignTrigger("Tah")?.card_trigger, "TAH");
  assert.equal(inferLineIntent("Tah", lineEvent("Tah")), "card_campaign_lead");
  assert.equal(resolveLineCardCampaignTrigger("JASPAL"), null);
  for (const inheritedKey of ["constructor", "toString", "__proto__"]) {
    assert.equal(resolveLineCardCampaignTrigger(inheritedKey), null);
    assert.notEqual(inferLineIntent(inheritedKey, lineEvent(inheritedKey)), "card_campaign_lead");
  }
  assert.equal(extractKenjiModelLookupQuery("Sky B"), "");
  assert.equal(resolveLineCardCampaignTrigger("Sky B"), null);
  assert.notEqual(inferLineIntent("Sky B", lineEvent("Sky B")), "card_campaign_lead");
  assert.equal(resolveLineCardCampaignTrigger("BOOK EI")?.card_trigger, "BOOK EI");
  assert.equal(resolveLineCardCampaignTrigger("Book EI")?.card_trigger, "BOOK EI");
  assert.equal(resolveLineCardCampaignTrigger("https://mmdbkk.com/my-mmd"), null);
  assert.notEqual(inferLineIntent("https://mmdbkk.com/my-mmd", lineEvent("https://mmdbkk.com/my-mmd")), "card_campaign_lead");
  assert.equal(extractKenjiModelLookupQuery("/my-mmd"), "");
  assert.equal(extractKenjiModelLookupQuery("Sky B สวัสดี"), "");
  assert.equal(extractKenjiModelLookupQuery("HELLO"), "");
  assert.equal(extractKenjiModelLookupQuery("สวัสดีครับ"), "");
  assert.equal(inferLineIntent("MX17", lineEvent("MX17")), "model_lookup");
  assert.equal(inferLineIntent("JASPER", lineEvent("JASPER")), "card_campaign_lead");
  assert.notEqual(inferLineIntent("JASPAL", lineEvent("JASPAL")), "card_campaign_lead");
  assert.equal(extractKenjiModelVerificationEmail("Customer.Name@gmail.com"), "customer.name@gmail.com");
  assert.equal(inferLineIntent("customer.name@gmail.com", lineEvent("customer.name@gmail.com")), "model_access_verification");
});

test("Durable Object keeps only the pending model query and supports one-time deletion", async () => {
  const values = new Map();
  const object = new KenjiModelIdempotency({
    storage: {
      async get(key) { return values.get(key); },
      async put(key, value) { values.set(key, value); },
      async delete(key) { values.delete(key); },
      async getAlarm() { return null; },
      async setAlarm() {},
    },
  });
  const call = (body) => object.fetch(new Request("https://kenji-model-dedupe.internal/model-access/pending", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  assert.equal((await (await call({ action: "put", query: "MX17" })).json()).stored, true);
  assert.deepEqual(await (await call({ action: "get" })).json(), { ok: true, found: true, query: "MX17" });
  assert.equal((await (await call({ action: "delete" })).json()).deleted, true);
  assert.deepEqual(await (await call({ action: "get" })).json(), { ok: true, found: false });
  assert.doesNotMatch(JSON.stringify([...values.values()]), /@|gmail|email/i);
});

test("campaign claim requires its own token to commit or release", async () => {
  const binding = durableBinding();
  const object = binding.get(binding.idFromName("campaign-claim-test"));
  const request = async (action, claimToken = "") => {
    const response = await object.fetch("https://kenji-model-dedupe.internal/campaign-lead/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, key: "a".repeat(64), claim_token: claimToken }),
    });
    return response.json();
  };
  const first = await request("claim");
  assert.equal(first.claimed, true);
  assert.ok(first.claim_token);
  assert.equal((await request("commit", "stale-token")).committed, false);
  assert.equal((await request("release", "stale-token")).released, false);
  assert.equal((await request("claim")).claimed, false);
  assert.equal((await request("commit", first.claim_token)).committed, true);
  assert.equal((await request("release", first.claim_token)).released, false);
  assert.equal((await request("claim")).claimed, false);
  const unlinkedContext = await object.fetch("https://kenji-model-dedupe.internal/campaign-lead/context", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "put", context: { card_id: "21829530", card_trigger: "JASPER", campaign_key: "line_card_21829530_lead_v1" } }),
  });
  assert.equal(unlinkedContext.status, 400);
});

test("expired campaign lease can be reclaimed without stale commit or release touching the new claim", async () => {
  const binding = durableBinding();
  const object = binding.get(binding.idFromName("campaign-expired-claim-test"));
  const request = async (action, claimToken = "") => {
    const response = await object.fetch("https://kenji-model-dedupe.internal/campaign-lead/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, key: "b".repeat(64), claim_token: claimToken }),
    });
    return response.json();
  };
  const originalNow = Date.now;
  let now = 1_800_000_000_000;
  Date.now = () => now;
  try {
    const first = await request("claim");
    now += 60_001;
    const second = await request("claim");
    assert.equal(second.claimed, true);
    assert.notEqual(second.claim_token, first.claim_token);
    assert.equal((await request("commit", first.claim_token)).committed, false);
    assert.equal((await request("release", first.claim_token)).released, false);
    assert.equal((await request("commit", second.claim_token)).committed, true);
    assert.equal((await request("commit", second.claim_token)).committed, false);
    assert.equal((await request("status", second.claim_token)).committed, true);
  } finally {
    Date.now = originalNow;
  }
});

test("campaign context compare-and-delete preserves a newer lead written during an older brief", async () => {
  const binding = durableBinding();
  const object = binding.get(binding.idFromName("campaign-context-interleaving-test"));
  const request = async (action, context = null) => {
    const response = await object.fetch("https://kenji-model-dedupe.internal/campaign-lead/context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, context }),
    });
    return response.json();
  };
  const base = {
    card_id: "21829530",
    campaign_key: "line_card_21829530_lead_v1",
    lead_claim_key: "c".repeat(64),
    lead_claim_token: "00000000-0000-4000-8000-000000000001",
  };
  const firstPut = await request("put", { ...base, card_trigger: "JASPER", lead_inbox_id: "line_lead-a" });
  const contextReadByBriefA = (await request("get")).context;
  assert.equal(contextReadByBriefA.lead_inbox_id, "line_lead-a");
  const secondPut = await request("put", {
    ...base,
    card_trigger: "NANO",
    lead_inbox_id: "line_lead-b",
    lead_claim_key: "d".repeat(64),
    lead_claim_token: "00000000-0000-4000-8000-000000000002",
  });
  assert.notEqual(secondPut.context_token, firstPut.context_token);
  const staleDelete = await request("delete", {
    lead_inbox_id: contextReadByBriefA.lead_inbox_id,
    context_token: contextReadByBriefA.context_token,
  });
  assert.equal(staleDelete.deleted, false);
  assert.equal(staleDelete.reason, "campaign_context_mismatch");
  const current = await request("get");
  assert.equal(current.context.lead_inbox_id, "line_lead-b");
  assert.equal(current.context.context_token, secondPut.context_token);
});

test("unlinked LINE asks one necessary Google email question and continues the pending lookup", async () => {
  const rpcCalls = [];
  const pendingCalls = [];
  const env = {
    ...BASE_ENV,
    KENJI_MODEL_DEDUPE: pendingBinding(pendingCalls),
    ADMIN_WORKER: {
      async fetch(request) {
        const body = await request.json();
        rpcCalls.push(body);
        const payload = body.verification_email
          ? { ok: true, status: "match", model: { model_code: "MX17", working_name: "น้องซิน" } }
          : { ok: true, status: "verification_required" };
        return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  };

  const question = await resolveKenjiLineReply(lineEvent("MX17"), {}, env);
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(pendingCalls.map((item) => item.action), ["put"]);
  assert.match(question.text, /อีเมล Google/);
  assert.match(question.text, /Premium Model|Standard Models/);
  assert.doesNotMatch(question.text, /malemodel\.bkk|airtable|record|token/i);
  assert.equal(question.reply_source, "model_access_verification");
  assert.equal(question.clear_model_context, true);

  const answer = await resolveKenjiLineReply(lineEvent("customer.name@gmail.com"), {}, env);
  assert.match(answer.text, /น้องซิน.*MX17/s);
  assert.deepEqual(rpcCalls, [
    { line_user_id: LINE_USER_ID, query: "MX17" },
    { line_user_id: LINE_USER_ID, query: "MX17", verification_email: "customer.name@gmail.com" },
  ]);
  assert.deepEqual(pendingCalls.map((item) => item.action), ["put", "get", "delete"]);
  assert.equal(answer.clear_model_context, undefined);
});

test("email without a pending model lookup stays silent and never calls the access backend", async () => {
  const calls = [];
  const decision = await resolveKenjiLineReply(lineEvent("customer.name@gmail.com"), {}, {
    ...BASE_ENV,
    KENJI_MODEL_DEDUPE: pendingBinding(),
    ADMIN_WORKER: adminBinding({ ok: true, status: "match" }, 200, calls),
  });
  assert.equal(decision.text, "");
  assert.equal(calls.length, 0);
});

test("expired member may continue a brief without new private disclosure", async () => {
  const decision = await resolveKenjiLineReply(lineEvent("MX17"), {}, {
    ...BASE_ENV,
    ADMIN_WORKER: adminBinding({ ok: true, status: "renewal" }),
  });
  assert.match(decision.text, /คุยเรื่องนายแบบและส่งบรีฟ/);
  assert.match(decision.text, /ก่อนยืนยันงานหรือเปิดข้อมูลใหม่/);
  assert.match(decision.text, /sigil\/member\/membership\?source=line&intent=renew/);
  assert.doesNotMatch(decision.text, /MX17|น้องซิน|Private Model.*ชื่อ/i);
  assert.equal(decision.reply_source, "model_access_renewal");
  assert.equal(decision.clear_model_context, true);
});

test("committed model-access flag off makes no RPC call and stays silent", async () => {
  const calls = [];
  const decision = await resolveKenjiLineReply(lineEvent("MX17"), {}, {
    ...BASE_ENV,
    LINE_KENJI_MODEL_ACCESS_ENABLED: "false",
    ADMIN_WORKER: adminBinding({ ok: true, status: "match" }, 200, calls),
  });
  assert.equal(calls.length, 0);
  assert.equal(decision.text, "");
  assert.equal(decision.reply_source, "silent");
  assert.equal(decision.clear_model_context, true);
});

test("authorized RPC match becomes one concise Per Voice reply without operational fields", async () => {
  const calls = [];
  const decision = await resolveKenjiLineReply(lineEvent("MX17"), {}, {
    ...BASE_ENV,
    ADMIN_WORKER: adminBinding({
      ok: true,
      status: "match",
      policy_version: "KENJI_MODEL_ACCESS_V1",
      model: {
        model_code: "MX17",
        working_name: "น้องซิน",
        summary: "ข้อมูลแนะนำตัวที่อนุมัติแล้ว",
        image_url: "https://images.example.test/model.webp",
        phone: "0800000000",
        availability_status: "available",
      },
    }, 200, calls),
  });
  assert.equal(calls.length, 1);
  assert.match(decision.text, /น้องซิน/);
  assert.match(decision.text, /MX17/);
  assert.match(decision.text, /ครับ/);
  assert.doesNotMatch(decision.text, /0800000000|available|images\.example|ทีม|ระบบ/i);
  assert.equal(decision.reply_source, "model_access");
  assert.equal(decision.clear_model_context, undefined);

  const request = calls[0];
  assert.equal(new URL(request.url).hostname, "admin-worker.local");
  assert.equal(request.headers.get("x-mmd-service-binding"), "member-dashboard-chat-worker");
  assert.equal(request.headers.get("x-mmd-internal-call"), "true");
  assert.equal(request.headers.get("authorization"), "Bearer internal-token");
  assert.deepEqual(await request.json(), { line_user_id: LINE_USER_ID, query: "MX17" });
});

test("LINE lookup asks for the work brief and never exposes an unscoped RPC price", async () => {
  const model = { model_code: "MX17", working_name: "น้องซิน" };
  const reply = async (sales) => resolveKenjiLineReply(lineEvent("MX17"), {}, {
    ...BASE_ENV,
    ADMIN_WORKER: adminBinding({ ok: true, status: "match", model: { ...model, sales } }),
  });
  const approved = await reply({ sellable: true, price_visible: true, requires_per_approval: false, customer_rate_thb: 4500, term_summary: "เรทที่อนุมัติ" });
  assert.doesNotMatch(approved.text, /4,500/);
  assert.match(approved.text, /ข้อมูลที่เปิดเผยได้/);
  assert.doesNotMatch(approved.text, /ส่งวัน|เช็กเรท|ราคา|จอง/);
  for (const sales of [
    { sellable: true, price_visible: false, requires_per_approval: false, customer_rate_thb: 4500 },
    { sellable: true, price_visible: true, requires_per_approval: true, customer_rate_thb: 4500 },
    { sellable: false, price_visible: true, requires_per_approval: false, customer_rate_thb: 4500 },
  ]) {
    const withheld = await reply(sales);
    assert.doesNotMatch(withheld.text, /4,500/);
  }
});

test("thin adapter drops unsafe summary content even if a compromised RPC labels it safe", async () => {
  const decision = await resolveKenjiLineReply(lineEvent("MX17"), {}, {
    ...BASE_ENV,
    ADMIN_WORKER: adminBinding({
      ok: true,
      status: "match",
      model: {
        model_code: "MX17",
        working_name: "น้องซิน",
        summary: "ว่างคืนนี้ ติดต่อ LINE ID private-contact หรือโทร 0800000000",
      },
    }),
  });
  assert.match(decision.text, /น้องซิน.*MX17/s);
  assert.doesNotMatch(decision.text, /ว่างคืนนี้|LINE ID|0800000000/);
});

for (const [label, payload, status] of [
  ["unknown", { ok: true, status: "silent" }, 200],
  ["expired or unauthorized", { ok: true, status: "silent" }, 200],
  ["source failure", { ok: false, error: "model_access_unavailable" }, 503],
  ["malformed response", { ok: true, status: "match", model: { model_code: "MX17" } }, 200],
]) {
  test(`${label} result stays silent with no holding copy`, async () => {
    const decision = await resolveKenjiLineReply(lineEvent("MX17"), {}, {
      ...BASE_ENV,
      ADMIN_WORKER: adminBinding(payload, status),
    });
    assert.equal(decision.text, "");
    assert.equal(decision.reply_source, "silent");
    assert.equal(decision.clear_model_context, true);
    assert.doesNotMatch(decision.text, /เช็ก|ตรวจ|รอ|รับเรื่อง|ขอบคุณ|please wait|let me check/i);
  });
}

test("ambiguous authorized result asks one necessary clarification without listing models", async () => {
  const decision = await resolveKenjiLineReply(lineEvent("model ซิน"), {}, {
    ...BASE_ENV,
    ADMIN_WORKER: adminBinding({ ok: true, status: "clarification", policy_version: "KENJI_MODEL_ACCESS_V1" }),
  });
  assert.match(decision.text, /ชื่อที่ใช้ทำงานหรือรหัส Model/);
  assert.doesNotMatch(decision.text, /รายชื่อ|MX17|folder|แพ็กเกจ|สิทธิ์/);
  assert.equal(decision.reply_source, "model_access_clarification");
  assert.equal(decision.clear_model_context, true);
});

test("availability and manual-review messages never call the model access RPC", async () => {
  const calls = [];
  const env = { ...BASE_ENV, ADMIN_WORKER: adminBinding({ ok: true, status: "match" }, 200, calls) };
  const availability = await resolveKenjiLineReply(lineEvent("model MX17 ว่างคืนนี้ไหม"), {}, env);
  const review = await resolveKenjiLineReply(lineEvent("ขอให้เปอร์ตรวจ model MX17 เอง"), {}, env);
  assert.equal(calls.length, 0);
  assert.match(availability.text, /ยังยืนยันคิวหรือความพร้อม/);
  assert.equal(review.text, "");
});

test("silent RPC outcome returns webhook 200 with zero LINE Reply and Push calls", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  globalThis.fetch = async (input) => {
    networkCalls.push(String(input));
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(await signedWebhook([lineEvent("MX17")]), {
      ...BASE_ENV,
      ADMIN_WORKER: adminBinding({ ok: true, status: "silent", policy_version: "KENJI_MODEL_ACCESS_V1" }),
    });
    assert.equal(response.status, 200);
    assert.equal(networkCalls.filter((url) => url.includes("/v2/bot/message/reply")).length, 0);
    assert.equal(networkCalls.filter((url) => url.includes("/v2/bot/message/push")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authorized webhook match sends exactly one LINE Reply and never Push", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  globalThis.fetch = async (input, init = {}) => {
    networkCalls.push({ url: String(input), init });
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(await signedWebhook([lineEvent("MX17")]), {
      ...BASE_ENV,
      ADMIN_WORKER: adminBinding({
        ok: true,
        status: "match",
        policy_version: "KENJI_MODEL_ACCESS_V1",
        model: { model_code: "MX17", working_name: "น้องซิน", summary: "ข้อมูลที่อนุมัติแล้ว" },
      }),
    });
    assert.equal(response.status, 200);
    const replies = networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply"));
    assert.equal(replies.length, 1);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/push")).length, 0);
    const body = JSON.parse(replies[0].init.body);
    assert.equal(body.messages.length, 1);
    assert.match(body.messages[0].text, /น้องซิน.*MX17/s);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("JASPER is campaign-scoped Jasper intent and never calls model access RPC", async () => {
  const calls = [];
  const decision = await resolveKenjiLineReply(lineEvent("JASPER"), {}, {
    ...BASE_ENV,
    ADMIN_WORKER: adminBinding({ ok: true, status: "match", model: { model_code: "EMJASPAL", working_name: "Jaspal OP", summary: "ข้อมูลแนะนำตัวที่อนุมัติแล้ว" } }, 200, calls),
  }, { campaignLeadQueued: true });
  assert.equal(calls.length, 0);
  assert.match(decision.text, /ตรวจข้อมูลที่เปิดเผยได้/);
  assert.doesNotMatch(decision.text, /Jaspal OP|Jasper|เรท\s*\d/);
  assert.equal(decision.reply_source, "line_card_campaign_lead");
});

test("queued Card text can return only exact approved model information without sales", async () => {
  const calls = [];
  const env = {
    ...BASE_ENV,
    LINE_CARD_21829530_MODEL_INFO_ENABLED: "true",
    LINE_KENJI_MODEL_ACCESS_ENABLED: "true",
    ADMIN_WORKER: adminBinding({ ok: true, status: "match", model: {
      model_code: "EMs01", working_name: "Jay", summary: "โปรไฟล์ที่อนุมัติแล้ว",
      sales: { customer_rate_thb: 9000 },
    } }, 200, calls),
  };
  const approved = await resolveKenjiLineReply(lineEvent("EMs01"), {}, env, { campaignLeadQueued: true, modelAccessAllowed: true });
  assert.equal(approved.reply_source, "line_card_model_info");
  assert.match(approved.text, /Jay.*EMs01.*โปรไฟล์ที่อนุมัติแล้ว/s);
  assert.doesNotMatch(approved.text, /9000|ส่งวัน|เช็กเรท|จอง/);
  assert.equal(calls.length, 1);

  const disabled = await resolveKenjiLineReply(lineEvent("EMs01"), {}, env, { campaignLeadQueued: true, modelAccessAllowed: false });
  assert.equal(disabled.reply_source, "line_card_campaign_lead");
  assert.equal(calls.length, 1);
  const unqueued = await resolveKenjiLineReply(lineEvent("EMs01"), {}, env, { campaignLeadQueued: false });
  assert.equal(unqueued.text, "");
  assert.equal(calls.length, 1);
});

test("Card aliases never reveal another Model profile", async () => {
  const calls = [];
  const decision = await resolveKenjiLineReply(lineEvent("JASPER"), {}, {
    ...BASE_ENV,
    LINE_CARD_21829530_MODEL_INFO_ENABLED: "true",
    LINE_KENJI_MODEL_ACCESS_ENABLED: "true",
    ADMIN_WORKER: adminBinding({ ok: true, status: "match", model: {
      model_code: "EMJASPAL", working_name: "Jaspal OP", summary: "Private info",
    } }, 200, calls),
  }, { campaignLeadQueued: true, modelAccessAllowed: true });
  assert.equal(calls.length, 1);
  assert.equal(decision.reply_source, "line_card_campaign_lead");
  assert.doesNotMatch(decision.text, /Jaspal|Private|Jasper/i);
});

test("a new campaign Model subject clears any previously active Model context", async () => {
  const decision = await resolveKenjiLineReply(lineEvent("Tah"), {}, {
    ...BASE_ENV,
    LINE_CARD_21829530_MODEL_INFO_ENABLED: "false",
  }, { campaignLeadQueued: true });
  assert.equal(decision.reply_source, "line_card_campaign_lead");
  assert.equal(decision.clear_model_context, true);
});

test("all seven active campaign triggers accept a generic brief without model resolution or rates", async () => {
  const calls = [];
  const env = { ...BASE_ENV, ADMIN_WORKER: adminBinding({ ok: true, status: "match" }, 200, calls) };
  for (const trigger of ["JASPER", "NANO", "EMs01", "BOOK EI", "EMs11", "GWs19", "Tah"]) {
    const decision = await resolveKenjiLineReply(lineEvent(trigger), {}, env, { campaignLeadQueued: true });
    assert.equal(decision.reply_source, "line_card_campaign_lead");
    assert.match(decision.text, /ตรวจข้อมูลที่เปิดเผยได้/);
    assert.doesNotMatch(decision.text, /บาท|โปรไฟล์|รหัส/);
  }
  assert.equal(calls.length, 0);
});

test("campaign pilot allowlist fails closed for missing malformed and non-matching hashes", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  globalThis.fetch = async (input, init = {}) => {
    networkCalls.push({ url: String(input), init });
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const common = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: durableBinding(),
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    for (const pilotHashes of ["", "not-a-hash", "0".repeat(64)]) {
      const env = { ...common, LINE_CARD_21829530_PILOT_HASHES: pilotHashes };
      await worker.fetch(await signedWebhook([lineEvent("NANO", { replyToken: `reply-${pilotHashes.length}` })], env), env);
    }
    assert.equal(networkCalls.filter((call) => call.url.includes("api.airtable.com")).length, 0);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("legacy and uncommitted campaign contexts stay silent and create no brief record", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  globalThis.fetch = async (input, init = {}) => {
    networkCalls.push({ url: String(input), init });
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const common = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  const baseContext = {
    card_id: "21829530",
    campaign_key: "line_card_21829530_lead_v1",
    card_trigger: "JASPER",
    lead_inbox_id: "line_original-lead",
    expires_at: Date.now() + 60_000,
  };
  try {
    const legacyEnv = { ...common, KENJI_MODEL_DEDUPE: durableBinding({ initialContext: baseContext }) };
    await worker.fetch(await signedWebhook([lineEvent("พรุ่งนี้สองทุ่ม", {
      message: { id: "msg-legacy-brief", type: "text", text: "พรุ่งนี้สองทุ่ม" },
    })], legacyEnv), legacyEnv);

    const pendingEnv = {
      ...common,
      KENJI_MODEL_DEDUPE: durableBinding({
        initialContext: {
          ...baseContext,
          lead_claim_key: "e".repeat(64),
          lead_claim_token: "00000000-0000-4000-8000-000000000003",
          context_token: "00000000-0000-4000-8000-000000000004",
        },
      }),
    };
    await worker.fetch(await signedWebhook([lineEvent("สาทร งานดินเนอร์", {
      message: { id: "msg-pending-brief", type: "text", text: "สาทร งานดินเนอร์" },
    })], pendingEnv), pendingEnv);

    assert.equal(networkCalls.filter((call) => call.url.includes("api.airtable.com")).length, 0);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("campaign lead is queued before one reply and duplicate delivery is idempotent", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  const binding = durableBinding();
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname === "api.airtable.com" && init.method === "POST") {
      return new Response(JSON.stringify({ id: "rec-line-card-lead" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: binding,
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    const first = await worker.fetch(await signedWebhook([lineEvent("JASPER")], env), env);
    const second = await worker.fetch(await signedWebhook([lineEvent("JASPER", { replyToken: "reply-token-2" })], env), env);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const posts = networkCalls.filter((call) => call.url.includes("api.airtable.com") && call.init.method === "POST");
    const replies = networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply"));
    assert.equal(posts.length, 1);
    assert.equal(replies.length, 1);
    const record = JSON.parse(posts[0].init.body);
    assert.equal(record.fields.intent, "note_only");
    const metadata = JSON.parse(record.fields.payload_json);
    assert.equal(metadata.parsed_intent, "card_campaign_lead");
    assert.equal(metadata.card_id, "21829530");
    assert.equal(metadata.card_trigger, "JASPER");
    assert.equal(metadata.campaign_attribution, "line_card_action_text");
    assert.equal(metadata.display_intent, "Jasper");
    assert.equal(metadata.model_resolution_status, "unresolved");
    assert.equal(metadata.canonical_model_id, null);
    assert.equal(metadata.auto_rate, "disabled");
    assert.equal(metadata.handoff_status, "queued");
    assert.doesNotMatch(replies[0].init.body, /Jaspal OP|Jasper|\d{1,3}(?:,\d{3})* บาท/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed owner queue creates no reply and releases the event for retry", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  const binding = durableBinding();
  let failQueue = true;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname === "api.airtable.com" && init.method === "POST") {
      if (failQueue) return new Response("queue unavailable", { status: 503 });
      return new Response(JSON.stringify({ id: "rec-retry-lead" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: binding,
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    await worker.fetch(await signedWebhook([lineEvent("NANO")], env), env);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
    failQueue = false;
    await worker.fetch(await signedWebhook([lineEvent("NANO", { replyToken: "reply-token-2" })], env), env);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed campaign context store releases the event and retries without duplicating the owner lead", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  const binding = durableBinding({ contextPutFailures: 1 });
  let ownerRecordExists = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      const isTakeoverLookup = String(url.searchParams.get("filterByFormula") || "").includes("processing");
      return new Response(JSON.stringify({ records: isTakeoverLookup || !ownerRecordExists ? [] : [{ id: "rec-context-retry" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.hostname === "api.airtable.com" && init.method === "POST") {
      ownerRecordExists = true;
      return new Response(JSON.stringify({ id: "rec-context-retry" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: binding,
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    await worker.fetch(await signedWebhook([lineEvent("NANO")], env), env);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
    await worker.fetch(await signedWebhook([lineEvent("NANO", { replyToken: "reply-token-context-retry" })], env), env);
    assert.equal(networkCalls.filter((call) => call.url.includes("api.airtable.com") && call.init.method === "POST").length, 1);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed claim commit removes its pending context and retries without duplicating the owner lead", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  const binding = durableBinding({ claimCommitFailures: 1 });
  let ownerRecordExists = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      const isTakeoverLookup = String(url.searchParams.get("filterByFormula") || "").includes("processing");
      return new Response(JSON.stringify({ records: isTakeoverLookup || !ownerRecordExists ? [] : [{ id: "rec-commit-retry" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.hostname === "api.airtable.com" && init.method === "POST") {
      ownerRecordExists = true;
      return new Response(JSON.stringify({ id: "rec-commit-retry" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: binding,
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    await worker.fetch(await signedWebhook([lineEvent("JASPER")], env), env);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
    await worker.fetch(await signedWebhook([lineEvent("JASPER", { replyToken: "reply-token-commit-retry" })], env), env);
    assert.equal(networkCalls.filter((call) => call.url.includes("api.airtable.com") && call.init.method === "POST").length, 1);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Airtable 422 and transport failure keep the campaign silent and retryable", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  const binding = durableBinding();
  let postAttempt = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname === "api.airtable.com" && init.method === "POST") {
      postAttempt += 1;
      if (postAttempt === 1) return new Response("invalid field", { status: 422 });
      throw new Error("queue timeout");
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: binding,
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    await worker.fetch(await signedWebhook([lineEvent("GWs19")], env), env);
    await worker.fetch(await signedWebhook([lineEvent("GWs19", { replyToken: "reply-token-retry" })], env), env);
    assert.equal(postAttempt, 2);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ambiguous queue timeout keeps the lease so an immediate retry cannot duplicate the write", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname === "api.airtable.com" && init.method === "POST") {
      return new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted queue transport")), { once: true });
      });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    LINE_CARD_21829530_QUEUE_TIMEOUT_MS: "10",
    KENJI_MODEL_DEDUPE: durableBinding(),
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    await worker.fetch(await signedWebhook([lineEvent("GWs19")], env), env);
    await worker.fetch(await signedWebhook([lineEvent("GWs19", { replyToken: "reply-token-timeout-retry" })], env), env);
    assert.equal(networkCalls.filter((call) => call.url.includes("api.airtable.com") && call.init.method === "POST").length, 1);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing stable message ID and takeover source failure create no owner lead or reply", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const networkCalls = [];
  const diagnostics = [];
  let ownerLookupAttempt = 0;
  console.log = (value) => {
    try {
      const parsed = JSON.parse(String(value));
      if (parsed?.line_webhook === "reply_diagnostics") diagnostics.push(parsed);
    } catch (_) {}
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      ownerLookupAttempt += 1;
      if (ownerLookupAttempt === 1) {
        return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("owner source unavailable", { status: 503 });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: durableBinding(),
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    const missingId = lineEvent("EMs01", { message: { type: "text", text: "EMs01" } });
    await worker.fetch(await signedWebhook([missingId], env), env);
    await worker.fetch(await signedWebhook([lineEvent("EMs11")], env), env);
    assert.equal(networkCalls.filter((call) => call.url.includes("api.airtable.com") && call.init.method === "POST").length, 0);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
    assert.deepEqual(diagnostics.map((entry) => entry.campaign_lead_reason), ["stable_message_id_missing", "takeover_lookup_failed"]);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalConsoleLog;
  }
});

test("next customer message is queued as the attributed campaign brief before acknowledgement", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  const binding = durableBinding();
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname === "api.airtable.com" && init.method === "POST") {
      return new Response(JSON.stringify({ id: `rec-${networkCalls.length}` }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: binding,
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    await worker.fetch(await signedWebhook([lineEvent("JASPER")], env), env);
    const briefEvent = lineEvent("พรุ่งนี้สองทุ่ม แถวสาทร งานดินเนอร์", {
      replyToken: "reply-token-brief",
      message: { id: "msg-campaign-brief-1", type: "text", text: "พรุ่งนี้สองทุ่ม แถวสาทร งานดินเนอร์" },
    });
    await worker.fetch(await signedWebhook([briefEvent], env), env);

    const posts = networkCalls.filter((call) => call.url.includes("api.airtable.com") && call.init.method === "POST");
    const replies = networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply"));
    assert.equal(posts.length, 2);
    assert.equal(replies.length, 2);
    const briefRecord = JSON.parse(posts[1].init.body);
    const metadata = JSON.parse(briefRecord.fields.payload_json);
    assert.equal(briefRecord.fields.intent, "note_only");
    assert.equal(metadata.parsed_intent, "card_campaign_brief");
    assert.equal(metadata.campaign_key, "line_card_21829530_lead_v1");
    assert.equal(metadata.card_trigger, "JASPER");
    assert.equal(metadata.display_intent, "Jasper");
    assert.equal(metadata.lead_stage, "brief_received");
    assert.equal(metadata.lead_inbox_id, "line_msg-model-access-1");
    assert.equal(metadata.auto_rate, "disabled");
    assert.match(replies[1].init.body, /ได้รับข้อความเพิ่มเติมแล้ว/);
    assert.doesNotMatch(replies[1].init.body, /บาท|โปรไฟล์|รหัส/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("active owner takeover suppresses ordinary deterministic LINE replies too", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && (init.method || "GET") === "GET") {
      return new Response(JSON.stringify({ records: [{ id: "rec-owner-processing", fields: { status: "processing" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.hostname === "api.airtable.com") {
      return new Response(JSON.stringify({ id: "rec-write" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.includes("/v2/bot/message/reply")) {
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_KENJI_MODEL_ENABLED: "false",
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    const response = await worker.fetch(await signedWebhook([lineEvent("คุยกับเปอร์")], env), env);
    assert.equal(response.status, 200);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("active owner takeover suppresses campaign queue and Kenji reply", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      return new Response(JSON.stringify({ records: [{ id: "rec-owner-processing" }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: durableBinding(),
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    await worker.fetch(await signedWebhook([lineEvent("Tah")], env), env);
    assert.equal(networkCalls.filter((call) => call.url.includes("api.airtable.com") && call.init.method === "POST").length, 0);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("owner takeover that starts after queue commit suppresses the LINE acknowledgement", async () => {
  const originalFetch = globalThis.fetch;
  const networkCalls = [];
  let takeoverLookups = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    networkCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && init.method === "GET") {
      const isTakeoverLookup = String(url.searchParams.get("filterByFormula") || "").includes("processing");
      if (isTakeoverLookup) {
        takeoverLookups += 1;
        return new Response(JSON.stringify({ records: takeoverLookups === 1 ? [] : [{ id: "rec-owner-now-processing" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname === "api.airtable.com" && init.method === "POST") {
      return new Response(JSON.stringify({ id: "rec-queued-before-takeover" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    ...BASE_ENV,
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_SYNC_TABLE: "console-inbox",
    LINE_CARD_21829530_LEAD_ENABLED: "true",
    LINE_CARD_21829530_NATIVE_AUTORESPONSE_CLEAR: "true",
    KENJI_MODEL_DEDUPE: durableBinding(),
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }),
  };
  try {
    await worker.fetch(await signedWebhook([lineEvent("Tah")], env), env);
    assert.equal(takeoverLookups, 2);
    assert.equal(networkCalls.filter((call) => call.url.includes("api.airtable.com") && call.init.method === "POST").length, 1);
    assert.equal(networkCalls.filter((call) => call.url.includes("/v2/bot/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verified EMs restricted-category denial stays generic and does not introduce Points", async () => {
  const calls = [];
  const env = {
    ...BASE_ENV,
    LINE_CARD_21829530_MODEL_INFO_ENABLED: "true",
    ADMIN_WORKER: adminBinding({ ok: true, status: "restricted_category", category: "ems" }, 200, calls),
  };
  const decision = await resolveKenjiLineReply(lineEvent("EMs11"), {}, env, { campaignLeadQueued: true });
  assert.equal(decision.reply_source, "line_card_model_access_restricted");
  assert.match(decision.text, /กลุ่มจำกัดสิทธิ์/);
  assert.match(decision.text, /ตรวจสิทธิ์ของบัญชีนี้และการอนุญาตของรายนั้น/);
  assert.doesNotMatch(decision.text, /points?|แต้ม|คะแนน|1,200|2,500|120,000|250,000|Black Card|35,000|member\/liff\?view=points/i);
  assert.doesNotMatch(decision.text, /Sprite|EMs11|รูปภาพของ|25000/);
  assert.equal(calls.length, 1);
});

test("unknown Model and disabled campaign never send the access promotion", async () => {
  const calls = [];
  const env = {
    ...BASE_ENV,
    LINE_CARD_21829530_MODEL_INFO_ENABLED: "true",
    ADMIN_WORKER: adminBinding({ ok: true, status: "silent" }, 200, calls),
  };
  const unknown = await resolveKenjiLineReply(lineEvent("Tah"), {}, env, { campaignLeadQueued: true });
  assert.equal(unknown.reply_source, "line_card_campaign_lead");
  assert.doesNotMatch(unknown.text, /1,200|2,500|35,000/);
  const disabled = await resolveKenjiLineReply(lineEvent("Tah"), {}, env, { campaignLeadQueued: false });
  assert.equal(disabled.text, "");
  assert.equal(calls.length, 1);
});


test("active Private Payment context wins over fresh pricing intake", () => {
  const continuity = {
    decision: "continuation",
    effective_intent: "pricing_review",
    matrix: {
      matrix_status: "active",
      conversation_stage: "awaiting_payment_verification",
      topic: "payment",
      pending_action: "continue payment",
      pending_reference: "payment_abc",
      continuity_summary: "Private Payment link already sent for this booking",
      payload_json: {
        active_model_v1: { model_code: "MX17", working_name: "Jasper" },
      },
    },
  };
  const reply = buildKenjiLineReply(lineEvent("เท่าไหร่"), {}, { continuity });
  assert.match(reply, /Private Payment/);
  assert.match(reply, /ไม่ต้องส่งวัน เวลา โซน หรือระยะเวลาใหม่/);
  assert.doesNotMatch(reply, /ถ้าหมายถึงเรทของ Jasper/);
});

test("stale payment context never overrides normal pricing intake", () => {
  const continuity = {
    decision: "stale_refresh",
    effective_intent: "pricing_review",
    matrix: {
      matrix_status: "stale",
      conversation_stage: "awaiting_payment_verification",
      topic: "payment",
      pending_action: "continue payment",
      continuity_summary: "Private Payment link already sent",
    },
  };
  const reply = buildKenjiLineReply(lineEvent("เท่าไหร่"), {}, { continuity });
  assert.doesNotMatch(reply, /Private Payment เดิม/);
  assert.match(reply, /วัน เวลา โซน และระยะเวลา/);
});
