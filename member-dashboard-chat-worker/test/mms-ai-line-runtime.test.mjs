import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import worker, {
  MMS_AI_LINE_INTERNALS,
  createMmsLineSignature,
} from "../src/mms-ai-line-front-gate.js";
import {
  MMS_AI_KNOWLEDGE_VERSION,
  guardMmsAiOutput,
} from "../src/mms-ai-knowledge-v4.js";

function baseEnv(overrides = {}) {
  return {
    MMS_LINE_AI_ENABLED: "true",
    MMS_LINE_AI_MODEL_ENABLED: "false",
    MMS_LINE_CHANNEL_SECRET: "mms-secret",
    MMS_LINE_CHANNEL_ACCESS_TOKEN: "mms-access-token",
    MMS_WORKER: {
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/mms/api/catalog") {
          return Response.json({
            ok: true,
            data: {
              skills: [
                { code: "aroma_therapy_oil", label: "Aroma Therapy Oil Massage", th: "นวดผ่อนคลาย" },
                { code: "thai_massage", label: "Thai Massage", th: "นวดคลายเส้น" },
                { code: "sport_massage", label: "Sport Massage", th: "นวดแก้อาการ" },
                { code: "office_syndrome", label: "Office Syndrome", th: "นวดแก้อาการนั่งเป็นเวลานาน" },
                { code: "health_fitness_advisor", label: "Health and Fitness Advisor", th: "สุขภาพและฟิตเนส" },
                { code: "thai_herbal_compress", label: "Thai herbal compress massage", th: "นวดประคบสมุนไพร" },
                { code: "partner_present", label: "Partner-Present", th: "Partner-Present" },
                { code: "women_massage", label: "Women Massage", th: "Women Massage" },
              ],
              zones: ["bkk_central"],
              max_selected_skills: 6,
            },
          });
        }
        return Response.json({ ok: false }, { status: 404 });
      },
    },
    ...overrides,
  };
}

function lineBody(text, overrides = {}) {
  return JSON.stringify({
    events: [{
      type: "message",
      mode: "active",
      replyToken: "reply-token",
      source: { type: "user", userId: "U00000000000000000000000000000000" },
      message: { type: "text", id: "mms-message-1", text },
      ...overrides,
    }],
  });
}

async function signedRequest(text, env, overrides = {}) {
  const body = lineBody(text, overrides);
  const signature = await createMmsLineSignature(body, env.MMS_LINE_CHANNEL_SECRET);
  return new Request("https://mmdbkk.com/webhooks/line/mms", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body,
  });
}

async function withFetchMock(handler, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await fn();
  } finally {
    globalThis.fetch = previous;
  }
}

test("MMS webhook health exposes V4 runtime without exposing secrets", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/webhooks/line/mms"), baseEnv());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.route, "mms_line_webhook");
  assert.equal(payload.knowledge_version, MMS_AI_KNOWLEDGE_VERSION);
  assert.equal(payload.mms_worker_bound, true);
  assert.equal(payload.line_credentials_present, true);
  assert.equal(payload.mutation_allowed, false);
  assert.equal(JSON.stringify(payload).includes("mms-secret"), false);
  assert.equal(JSON.stringify(payload).includes("mms-access-token"), false);
});

test("MMS webhook requires the dedicated MMS LINE signature secret", async () => {
  const env = baseEnv();
  const response = await worker.fetch(new Request("https://mmdbkk.com/webhooks/line/mms", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": "wrong" },
    body: lineBody("มีบริการอะไรบ้าง"),
  }), env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "invalid_signature" });
});

test("service discovery replies from MMS V4 and uses only MMS LINE token", async () => {
  const env = baseEnv({
    LINE_CHANNEL_ACCESS_TOKEN: "must-not-be-used",
    LINE_CHANNEL_SECRET: "must-not-be-used",
  });
  const calls = [];
  await withFetchMock(async (url, init = {}) => {
    calls.push({ url: String(url), headers: Object.fromEntries(new Headers(init.headers).entries()), body: init.body ? JSON.parse(init.body) : null });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }, async () => {
    const response = await worker.fetch(await signedRequest("มีบริการอะไรบ้าง", env), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).knowledge_version, MMS_AI_KNOWLEDGE_VERSION);
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.line.me/v2/bot/message/reply");
  assert.equal(calls[0].headers.authorization, "Bearer mms-access-token");
  assert.notEqual(calls[0].headers.authorization, "Bearer must-not-be-used");
  const reply = calls[0].body.messages[0].text;
  assert.match(reply, /Aroma Oil/);
  assert.match(reply, /Office Syndrome/);
  assert.match(reply, /Women Massage/);
  assert.doesNotMatch(reply, /erotic|sexual|Soft Extra|Body to Body/i);
});

test("dynamic price questions do not reuse legacy fixed rates", async () => {
  const env = baseEnv();
  let replyText = "";
  await withFetchMock(async (_url, init = {}) => {
    replyText = JSON.parse(init.body).messages[0].text;
    return new Response("{}", { status: 200 });
  }, async () => {
    const response = await worker.fetch(await signedRequest("ราคาเท่าไหร่ ค่าเดินทางเท่าไหร่", env), env);
    assert.equal(response.status, 200);
  });
  assert.match(replyText, /ข้อมูลล่าสุด|บริการ|พื้นที่/);
  assert.doesNotMatch(replyText, /3,500|5,000|20\s*บาท|25\s*บาท|30\s*บาท/);
});

test("application ID alone never discloses protected application state", async () => {
  const env = baseEnv();
  let mmsReads = 0;
  env.MMS_WORKER = {
    async fetch() {
      mmsReads += 1;
      return Response.json({ ok: true, data: { status: "Approved", applicant_name: "private" } });
    },
  };
  let replyText = "";
  await withFetchMock(async (_url, init = {}) => {
    replyText = JSON.parse(init.body).messages[0].text;
    return new Response("{}", { status: 200 });
  }, async () => {
    const response = await worker.fetch(await signedRequest("ใบสมัคร mmsapp_1234567890abcdef12345678 ถึงไหนแล้ว", env), env);
    assert.equal(response.status, 200);
  });
  assert.equal(mmsReads, 0);
  assert.match(replyText, /ยืนยันตัวตน|ข้อมูลภายใน/);
  assert.doesNotMatch(replyText, /Approved|ผ่านแล้ว|private/);
});

test("MMS route remains isolated from the MMD Privé LINE webhook", () => {
  assert.equal(MMS_AI_LINE_INTERNALS.MMS_LINE_WEBHOOK_PATHS.has("/webhooks/line/mms"), true);
  assert.equal(MMS_AI_LINE_INTERNALS.MMS_LINE_WEBHOOK_PATHS.has("/webhooks/line"), false);
  assert.equal(MMS_AI_LINE_INTERNALS.MMS_LINE_WEBHOOK_PATHS.has("/webhook/line"), false);
});

test("V4 output guard blocks legacy service promises and ungrounded finality", () => {
  assert.equal(guardMmsAiOutput("มี Soft Extra ให้ครับ").ok, false);
  assert.equal(guardMmsAiOutput("อนุมัติแล้ว พร้อมรับงานแล้วครับ").ok, false);
  assert.equal(guardMmsAiOutput("ถ้าเน้นไหล่กับหลัง บอกช่วงเวลามาได้ครับ").ok, true);
});
