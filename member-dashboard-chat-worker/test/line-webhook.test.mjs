import assert from "node:assert/strict";
import test from "node:test";

import worker, {
  buildKenjiLineReply,
  buildKenjiKnowledgeLineReply,
  createLineSignature,
  inferLineIntent,
  isKenjiLineCandidate,
  resolveKenjiLineReply,
} from "../src/index.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const BASE_ENV = {
  LINE_CHANNEL_SECRET: "line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "line-token",
  LINE_AUTO_REPLY_ENABLED: "true",
  LINE_KENJI_AI_ENABLED: "true",
};

async function signedLineRequest(body, env = BASE_ENV) {
  const raw = JSON.stringify(body);
  const signature = await createLineSignature(raw, env.LINE_CHANNEL_SECRET);
  return new Request("https://worker/webhooks/line", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": signature,
    },
    body: raw,
  });
}

function lineTextEvent(text, overrides = {}) {
  return {
    type: "message",
    replyToken: "reply-token",
    source: { type: "user", userId: LINE_USER_ID },
    message: { id: "msg-1", type: "text", text },
    ...overrides,
  };
}

function installMemoryCache() {
  const originalCaches = globalThis.caches;
  const entries = new Map();
  globalThis.caches = {
    default: {
      async match(request) {
        return entries.has(request.url) ? new Response(entries.get(request.url)) : undefined;
      },
      async put(request, response) {
        entries.set(request.url, await response.text());
      },
    },
  };
  return () => {
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  };
}

test("health route works", async () => {
  const response = await worker.fetch(new Request("https://worker/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, worker: "member-dashboard-chat-worker" });
});

test("LINE webhook fails closed when signature is missing or invalid", async () => {
  const missing = await worker.fetch(new Request("https://worker/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [] }),
  }), BASE_ENV);
  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), { ok: false, error: "invalid_signature" });

  const invalid = await worker.fetch(new Request("https://worker/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": "wrong" },
    body: JSON.stringify({ events: [] }),
  }), BASE_ENV);
  assert.equal(invalid.status, 401);
});

test("LINE webhook fails closed if channel secret is absent", async () => {
  const request = await signedLineRequest({ events: [] }, BASE_ENV);
  const response = await worker.fetch(request, { ...BASE_ENV, LINE_CHANNEL_SECRET: "" });
  assert.equal(response.status, 401);
});

test("valid LINE signature can process empty events safely", async () => {
  const response = await worker.fetch(await signedLineRequest({ events: [] }), BASE_ENV);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    worker: "member-dashboard-chat-worker",
    route: "line_webhook",
    events: 0,
    saved: [],
  });
});

test("Cloudflare owner ignores retired upstream configuration", async () => {
  const response = await worker.fetch(
    await signedLineRequest({ events: [] }),
    { ...BASE_ENV, LINE_WEBHOOK_UPSTREAM_URL: "https://legacy.invalid/webhook" },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).worker, "member-dashboard-chat-worker");
});

test("Kenji 2.0 separates MMD, MMS, venue, and talent lanes", () => {
  const cases = [
    ["ไป dinner", "mmd_companion", /MMD Companion/],
    ["อยากนวด recovery", "mms_wellness", /MMS Wellness/],
    ["ไม่มีสถานที่ ใช้ Relax Spa", "partner_venue", /Relax Spa by 9/],
    ["หา private talent ด้านภาษา", "private_talent", /Private Talent/],
  ];
  for (const [text, intent, replyPattern] of cases) {
    const event = lineTextEvent(text);
    assert.equal(inferLineIntent(text, event), intent);
    assert.match(buildKenjiLineReply(event), replyPattern);
  }
});

test("payment proof routes safely without confirming funds", () => {
  const reply = buildKenjiLineReply(lineTextEvent("ส่งสลิป"));
  assert.match(reply, /\/confirm\/payment-proof/);
  assert.match(reply, /ยังไม่ถือว่ายืนยันยอด/);
  assert.doesNotMatch(reply, /ชำระเงินสำเร็จ|approved/i);
});

test("CARE BACK requires a saved Birthday Wish before the personal coupon opens", () => {
  const phrases = ["CARE BACK", "แคร์แบ็ก", "Birthday Wish", "CARE BACK ส่งสลิปแล้ว"];
  for (const phrase of phrases) {
    const event = lineTextEvent(phrase);
    assert.equal(inferLineIntent(phrase, event), "care_back", phrase);
    const reply = buildKenjiLineReply(event);
    assert.match(reply, /Birthday Wish/);
    assert.match(reply, /10%/);
    assert.match(reply, /30 วัน/);
    assert.doesNotMatch(reply, /ยืนยันตัวตนแล้ว(?:รับ|ได้)คูปอง|คูปองอัตโนมัติ|Points อัตโนมัติ/);
  }
});

test("Kenji trigger phrases route to talk_to_per_ai intent", async () => {
  const phrases = ["Hi Per", "Per AI", "Kenji AI", "เปอร์ ai", "เปอร์เอไอ"];

  for (const phrase of phrases) {
    assert.equal(isKenjiLineCandidate(phrase), true, phrase);
    assert.equal(inferLineIntent(phrase, lineTextEvent(phrase)), "talk_to_per_ai", phrase);

    const response = await worker.fetch(await signedLineRequest({ events: [lineTextEvent(phrase)] }), {
      ...BASE_ENV,
      LINE_AUTO_REPLY_ENABLED: "false",
    });
    assert.equal(response.status, 200, phrase);
    const payload = await response.json();
    assert.equal(payload.saved[0].intent, "talk_to_per_ai", phrase);
    assert.equal(payload.saved[0].replied, false, phrase);
  }
});

test("Per Voice replies do not expose internal markers or the hidden Kenji identity", () => {
  const reply = buildKenjiLineReply(lineTextEvent("Hi Per"), { displayName: "Test User" });
  assert.match(reply, /MMD Privé/);
  assert.doesNotMatch(reply, /kenji|เคนจิ|ทีม(?:งาน)?|ระบบ|airtable|record_id|secret|token|authorization|bearer|telegram|gmail|r2|kv/i);
});

test("published Per Voice knowledge overrides the fallback only when it is LINE-approved and safe", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /api\.airtable\.com\/v0\/base-id\/tblsLd1uVOtG2kHoU/);
    return new Response(JSON.stringify({
      records: [{
        fields: {
          knowledge_id: "kenji_per_voice_line_entry_v1",
          customer_answer: "สวัสดีครับ ยินดีต้อนรับสู่ MMD Privé นะครับ",
          allowed_channels: ["LINE_OFC"],
          status: "active",
          response_mode: "auto_reply_allowed",
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const reply = await buildKenjiKnowledgeLineReply(lineTextEvent("Hi Per"), {}, {
      ...BASE_ENV,
      LINE_KENJI_KNOWLEDGE_ENABLED: "true",
      AIRTABLE_API_KEY: "airtable-key",
      AIRTABLE_BASE_ID: "base-id",
    });
    assert.equal(reply, "สวัสดีครับ ยินดีต้อนรับสู่ MMD Privé นะครับ");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("existing LINE inbox records remain deduped after the immediate reply", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });

    if (href.includes("/profile/")) {
      return new Response(JSON.stringify({ displayName: "Client" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (href.includes("api.airtable.com") && init?.method === "GET") {
      return new Response(JSON.stringify({ records: [{ id: "recExisting123" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (href.includes("/message/reply")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const response = await worker.fetch(await signedLineRequest({ events: [lineTextEvent("Hi Per")] }), {
      ...BASE_ENV,
      AIRTABLE_API_KEY: "airtable-key",
      AIRTABLE_BASE_ID: "base-id",
      AIRTABLE_SYNC_TABLE: "Console Inbox",
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.saved[0].deduped, true);
    assert.equal(payload.saved[0].replied, true);
    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LINE replies before slow profile, Airtable, and knowledge work", async () => {
  const calls = [];
  const deferred = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });

    if (href.includes("/message/reply")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (href.includes("/profile/") || href.includes("api.airtable.com")) {
      return new Promise(() => {});
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const ctx = {
    waitUntil(promise) {
      deferred.push(promise);
    },
  };

  try {
    const response = await Promise.race([
      worker.fetch(await signedLineRequest({ events: [lineTextEvent("Hi Per")] }), {
        ...BASE_ENV,
        AIRTABLE_API_KEY: "airtable-key",
        AIRTABLE_BASE_ID: "base-id",
        LINE_KENJI_KNOWLEDGE_ENABLED: "true",
      }, ctx),
      new Promise((_, reject) => setTimeout(() => reject(new Error("LINE reply was blocked by background work")), 100)),
    ]);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.saved[0].replied, true);
    assert.equal(payload.saved[0].record_pending, true);
    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 1);
    assert.equal(deferred.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("valid LINE event can auto reply through reply API when not deduped", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });

    if (href.includes("/profile/")) {
      return new Response(JSON.stringify({ displayName: "Client" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (href.includes("/message/reply")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const response = await worker.fetch(await signedLineRequest({ events: [lineTextEvent("Hi Per")] }), BASE_ENV);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.saved[0].replied, true);
    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("safe local responses do not use the failure fallback", async () => {
  for (const text of [
    "สวัสดี",
    "สมาชิกมีอะไรบ้าง",
    "ราคาเท่าไหร่",
    "ใช้บริการยังไง",
    "ส่งสลิปแล้วต้องทำอะไรต่อ",
    "เคนจิช่วยอะไรได้บ้าง",
  ]) {
    const decision = await resolveKenjiLineReply(lineTextEvent(text), {}, BASE_ENV);
    assert.ok(decision.text, text);
    assert.equal(decision.fallback, false, text);
    assert.doesNotMatch(decision.text, /รับข้อความแล้วครับ|ขอผมเช็กข้อมูลตรงนี้ก่อนนะครับ/, text);
  }
});

test("successful knowledge-assisted response sends exactly one LINE reply", async () => {
  const calls = [];
  const deferred = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href.includes("api.airtable.com")) {
      return new Response(JSON.stringify({
        records: [{
          fields: {
            knowledge_id: "kenji_20_008_membership_intake_catalog",
            customer_answer: "ดูรายละเอียดสมาชิกและเลือกขั้นตอนที่เหมาะได้ที่ MY MMD ครับ",
            allowed_channels: ["LINE_OFC"],
            status: "active",
            response_mode: "auto_reply_allowed",
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (href.includes("/message/reply")) return new Response("{}", { status: 200 });
    if (href.includes("/profile/")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 200 });
  };

  try {
    const env = {
      ...BASE_ENV,
      LINE_KENJI_KNOWLEDGE_ENABLED: "true",
      AIRTABLE_API_KEY: "airtable-key",
      AIRTABLE_BASE_ID: "priority-base",
    };
    await buildKenjiKnowledgeLineReply(lineTextEvent("สมาชิกมีอะไรบ้าง"), {}, env);
    calls.length = 0;
    const response = await worker.fetch(
      await signedLineRequest({ events: [lineTextEvent("สมาชิกมีอะไรบ้าง")] }),
      env,
      { waitUntil(promise) { deferred.push(promise); } },
    );
    assert.equal(response.status, 200);
    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 1);
    const replyCall = calls.find((call) => call.url.includes("/message/reply"));
    const body = JSON.parse(replyCall.init.body);
    assert.equal(body.messages.length, 1);
    assert.doesNotMatch(body.messages[0].text, /รับข้อความแล้วครับ|ขอผมเช็กข้อมูลตรงนี้ก่อนนะครับ/);
    await Promise.allSettled(deferred);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("no safe local or knowledge response may use the short fallback", async () => {
  const originalFetch = globalThis.fetch;
  const restoreCache = installMemoryCache();
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.airtable.com")) throw new Error("temporary knowledge failure");
    return new Response("{}", { status: 200 });
  };

  try {
    const decision = await resolveKenjiLineReply(lineTextEvent("ช่วยดูเรื่องนี้ให้หน่อย"), {}, {
      ...BASE_ENV,
      LINE_KENJI_KNOWLEDGE_ENABLED: "true",
      AIRTABLE_API_KEY: "airtable-key",
      AIRTABLE_BASE_ID: "base-id",
    });
    assert.equal(decision.text, "ขอผมเช็กข้อมูลตรงนี้ก่อนนะครับ");
    assert.equal(decision.fallback, true);
  } finally {
    restoreCache();
    globalThis.fetch = originalFetch;
  }
});

test("repeated unresolved messages do not spam the failure fallback", async () => {
  // The Cache API mock proves best-effort UX suppression only. Production cache
  // is not persistent state, authorization, dedupe correctness, or
  // payment/session/member state, and eviction or another colo may allow the
  // fallback to appear again.
  const calls = [];
  const originalFetch = globalThis.fetch;
  const restoreCache = installMemoryCache();
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes("/message/reply")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 503 });
  };

  try {
    const first = lineTextEvent("ช่วยดูเรื่องนี้ให้หน่อย", { message: { id: "msg-fallback-1", type: "text", text: "ช่วยดูเรื่องนี้ให้หน่อย" } });
    const second = lineTextEvent("ยังอยู่ไหม", { replyToken: "reply-token-2", message: { id: "msg-fallback-2", type: "text", text: "ยังอยู่ไหม" } });
    const firstResponse = await worker.fetch(await signedLineRequest({ events: [first] }), BASE_ENV);
    const secondResponse = await worker.fetch(await signedLineRequest({ events: [second] }), BASE_ENV);
    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.equal(calls.filter((url) => url.includes("/message/reply")).length, 1);
  } finally {
    restoreCache();
    globalThis.fetch = originalFetch;
  }
});

test("manual-review intent may use the short fallback", async () => {
  const restoreCache = installMemoryCache();
  try {
    const event = lineTextEvent("ขอให้เปอร์ตรวจเอง");
    assert.equal(inferLineIntent(event.message.text, event), "manual_review");
    const decision = await resolveKenjiLineReply(event, {}, BASE_ENV);
    assert.equal(decision.text, "ขอผมเช็กข้อมูลตรงนี้ก่อนนะครับ");
    assert.equal(decision.fallback, true);
  } finally {
    restoreCache();
  }
});
