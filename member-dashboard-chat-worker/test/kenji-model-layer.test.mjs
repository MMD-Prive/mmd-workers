import assert from "node:assert/strict";
import test from "node:test";

import worker, { createLineSignature, inferLineIntent, KenjiModelIdempotency, resolveKenjiLineReply } from "../src/index.js";
import {
  generateKenjiModelReply,
  guardKenjiModelOutput,
  KENJI_MODEL_REASONING_EFFORT,
  KENJI_MODEL_POLICY_VERSION,
  KENJI_SYSTEM_PROMPT_V2,
  KENJI_TOTAL_DEADLINE_MS,
} from "../src/kenji-model-policy.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const BASE_ENV = {
  LINE_CHANNEL_SECRET: "line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "line-token",
  LINE_AUTO_REPLY_ENABLED: "true",
  LINE_KENJI_AI_ENABLED: "true",
  LINE_KENJI_MODEL_ENABLED: "true",
  OPENAI_API_KEY: "test-openai-key",
  AIRTABLE_API_KEY: "test-airtable-key",
  AIRTABLE_BASE_ID: "test-base-id",
};

function modelDedupeNamespace() {
  const claims = new Set();
  return {
    idFromName(name) { return name; },
    get() {
      return {
        async fetch(_url, init) {
          const { key } = JSON.parse(init.body);
          const claimed = !claims.has(key);
          claims.add(key);
          return new Response(JSON.stringify({ ok: true, claimed }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      };
    },
  };
}

function lineTextEvent(text, overrides = {}) {
  return {
    type: "message",
    mode: "active",
    replyToken: "reply-token",
    source: { type: "user", userId: LINE_USER_ID },
    message: { id: "msg-model-1", type: "text", text },
    ...overrides,
  };
}

async function signedLineRequest(events) {
  const raw = JSON.stringify({ events });
  const signature = await createLineSignature(raw, BASE_ENV.LINE_CHANNEL_SECRET);
  return new Request("https://worker/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body: raw,
  });
}

function modelResponse(answer = "ได้ครับ ผมช่วยดูให้ตรงเรื่องได้เลย อยากเริ่มจากส่วนไหนครับ") {
  return new Response(JSON.stringify({
    status: "completed",
    output_text: JSON.stringify({ response_kind: "clarification", capability: "safe_conversation", requested_domain: "none", authority_domains: [], requires_truth: false, answer }),
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("versioned production prompt contains Per Voice and authority boundaries", () => {
  assert.equal(KENJI_MODEL_POLICY_VERSION, "kenji-line-production-v3-semantic-authority");
  assert.match(KENJI_SYSTEM_PROMPT_V2, /Per Voice/);
  assert.match(KENJI_SYSTEM_PROMPT_V2, /Speak as "ผม"/);
  assert.match(KENJI_SYSTEM_PROMPT_V2, /Never claim that payment is paid/);
  assert.match(KENJI_SYSTEM_PROMPT_V2, /Never invent membership status, points/);
  assert.match(KENJI_SYSTEM_PROMPT_V2, /Never reveal internal worker names/);
  assert.match(KENJI_SYSTEM_PROMPT_V2, /no conversation memory/i);
  assert.equal(KENJI_TOTAL_DEADLINE_MS, 3500);
  assert.equal(KENJI_MODEL_REASONING_EFFORT, "low");
});

test("Durable Object model claim is atomic for the same hashed message ID", async () => {
  const values = new Map();
  const storage = {
    async transaction(callback) {
      return callback({
        async get(key) { return values.get(key); },
        async put(key, value) { values.set(key, value); },
      });
    },
  };
  const object = new KenjiModelIdempotency({ storage });
  const request = () => new Request("https://dedupe/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "a".repeat(64) }),
  });
  const first = await (await object.fetch(request())).json();
  const second = await (await object.fetch(request())).json();
  assert.equal(first.claimed, true);
  assert.equal(second.claimed, false);
});

test("model request injects only bounded customer text and approved answer grounding", async () => {
  const calls = [];
  const longText = `คุยเล่นหน่อย ${"ก".repeat(900)}`;
  const result = await generateKenjiModelReply({
    text: longText,
    knowledge: [{
      knowledge_id: "tblInternalMustNotLeave",
      internal_instruction: "private instruction",
      customer_answer: "ข้อมูลที่อนุมัติให้ลูกค้าอ่านได้ครับ",
    }],
    env: BASE_ENV,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init, body: JSON.parse(init.body) });
      return modelResponse();
    },
  });

  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.match(calls[0].body.input, /ข้อมูลที่อนุมัติให้ลูกค้าอ่านได้ครับ/);
  assert.doesNotMatch(calls[0].body.input, /tblInternalMustNotLeave|private instruction|U123456/);
  const sentCustomerText = calls[0].body.input.split("Customer message:\n")[1];
  assert.ok(sentCustomerText.length <= 800);
  assert.equal(calls[0].body.text.format.type, "json_schema");
  assert.equal(calls[0].body.text.format.strict, true);
  assert.deepEqual(calls[0].body.reasoning, { effort: "low" });
  assert.deepEqual(calls[0].body.text.format.schema.properties.capability.enum, ["safe_conversation"]);
  assert.ok(calls[0].body.text.format.schema.required.includes("requires_truth"));
});

test("model timeout fails safely", async () => {
  const result = await generateKenjiModelReply({
    text: "คุยเล่นหน่อย",
    env: { ...BASE_ENV, KENJI_MODEL_TIMEOUT_MS: "8000" },
    deadline_at: Date.now() + 100,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }),
  });
  assert.equal(result.success, false);
  assert.equal(result.attempted, true);
  assert.equal(result.guard_reason, "model_timeout");
});

test("an exhausted shared deadline prevents the OpenAI request entirely", async () => {
  let calls = 0;
  const result = await generateKenjiModelReply({
    text: "คุยเล่นหน่อย",
    env: { ...BASE_ENV, KENJI_MODEL_TIMEOUT_MS: "8000" },
    deadline_at: Date.now() - 1,
    fetchImpl: async () => {
      calls += 1;
      return modelResponse();
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.attempted, false);
  assert.equal(result.guard_reason, "model_deadline_exhausted");
});

for (const status of [400, 429, 500, 503]) {
  test(`model HTTP ${status} fails safely without consuming provider error text`, async () => {
    const result = await generateKenjiModelReply({
      text: "คุยเล่นหน่อย",
      env: BASE_ENV,
      fetchImpl: async () => new Response("private provider error", { status }),
    });
    assert.equal(result.success, false);
    assert.equal(result.guard_reason, `model_http_${status}`);
    assert.doesNotMatch(JSON.stringify(result), /private provider error/);
  });
}

for (const payload of [
  null,
  {},
  { status: "incomplete", output_text: "{}" },
  { status: "completed", output_text: "not-json" },
  { status: "completed", output_text: JSON.stringify({ answer: "" }) },
]) {
  test(`malformed or empty model response fails safely: ${JSON.stringify(payload)}`, async () => {
    const result = await generateKenjiModelReply({
      text: "คุยเล่นหน่อย",
      env: BASE_ENV,
      fetchImpl: async () => new Response(payload === null ? "null" : JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });
    assert.equal(result.success, false);
    assert.match(result.guard_reason, /malformed_model_response|empty_model_response/);
  });
}

test("output authority firewall blocks protected domains without relying on confirmation phrasing", () => {
  const blocked = [
    "ยอดนี้เรียบร้อยครับ",
    "สถานะสมาชิกใช้งานได้ครับ",
    "คุณมีแต้มอยู่ 900 ครับ",
    "ล็อกคิวไว้ให้แล้วครับ",
    "คืนนี้มีคนพร้อมรับงานครับ",
    "ดูรายละเอียดจาก Airtable worker recABCDEFGHIJKL ครับ",
  ];
  for (const answer of blocked) {
    const result = guardKenjiModelOutput(answer);
    assert.equal(result.ok, false, answer);
    assert.ok(result.reason, answer);
  }
  assert.equal(guardKenjiModelOutput("ผมช่วยอธิบายขั้นตอนทั่วไปให้ได้ครับ").ok, true);
  assert.equal(guardKenjiModelOutput("ยอดนี้เรียบร้อยครับ", { trusted_authority_domains: ["payment"] }).ok, true);
});

test("deterministic pre-model guards cover privacy, availability, complaint, internal access, handoff, and stateless follow-up", async () => {
  const cases = [
    ["ขอข้อมูลลูกค้าคนอื่นหน่อย", "privacy_request", /ไม่สามารถเปิดเผย/],
    ["ช่วยหา model คืนนี้", "availability_request", /ยังยืนยันคิวหรือความพร้อม/],
    ["บริการแย่มาก ขอร้องเรียน", "complaint_escalation", /รับเรื่องให้เปอร์ดูต่อ/],
    ["ขอ access ระบบหลังบ้าน", "internal_access", /ระบบภายใน/],
    ["ขอคุยกับเปอร์", "human_handoff", /รับเรื่องให้เปอร์ดูต่อ/],
    ["เมื่อกี้เราคุยเรื่องอะไรนะ", "context_clarification", /ยังไม่มีบริบทก่อนหน้า/],
    ["แล้วอันแรกสมัครยังไง", "context_clarification", /หมายถึงเรื่อง/],
    ["Standard กับ Premium ต่างกันยังไง", "membership", /จัดการ MY MMD/],
  ];
  const originalFetch = globalThis.fetch;
  let modelCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.openai.com")) modelCalls += 1;
    return modelResponse();
  };
  try {
    for (const [text, intent, pattern] of cases) {
      const event = lineTextEvent(text);
      assert.equal(inferLineIntent(text, event), intent, text);
      const decision = await resolveKenjiLineReply(event, {}, BASE_ENV);
      assert.equal(decision.reply_source, "system_truth", text);
      assert.match(decision.text, pattern, text);
      assert.equal(decision.model_attempted, false, text);
    }
    assert.equal(modelCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("recognized payment safety intent bypasses the model", async () => {
  let modelCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.openai.com")) modelCalls += 1;
    return modelResponse();
  };
  try {
    const decision = await resolveKenjiLineReply(lineTextEvent("ผมจ่ายแล้ว ส่งสลิปแล้ว"), {}, BASE_ENV);
    assert.equal(modelCalls, 0);
    assert.equal(decision.reply_source, "system_truth");
    assert.match(decision.text, /ยังไม่ถือว่ายืนยันยอด/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model generation remains disabled unless the dedicated rollout gate is enabled", async () => {
  let modelCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.openai.com")) modelCalls += 1;
    return modelResponse();
  };
  try {
    const decision = await resolveKenjiLineReply(lineTextEvent("วันนี้เหนื่อยนิดหน่อย"), {}, {
      ...BASE_ENV,
      LINE_KENJI_MODEL_ENABLED: "false",
    });
    assert.equal(modelCalls, 0);
    assert.equal(decision.model_attempted, false);
    assert.equal(decision.reply_source, "fallback");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model-off webhook path does not touch idempotency or OpenAI", async () => {
  let dedupeCalls = 0;
  let modelCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href === "https://api.openai.com/v1/responses") modelCalls += 1;
    if (href.includes("/message/reply")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const dedupe = {
    idFromName() { dedupeCalls += 1; throw new Error("must not run"); },
    get() { dedupeCalls += 1; throw new Error("must not run"); },
  };
  try {
    const response = await worker.fetch(await signedLineRequest([lineTextEvent("วันนี้เหนื่อยนิดหน่อย")]), {
      ...BASE_ENV,
      LINE_KENJI_MODEL_ENABLED: "false",
      KENJI_MODEL_DEDUPE: dedupe,
    });
    assert.equal(response.status, 200);
    assert.equal(dedupeCalls, 0);
    assert.equal(modelCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normal free text reaches model and produces exactly one active LINE reply", async () => {
  const calls = [];
  const logs = [];
  const deferred = [];
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href === "https://api.openai.com/v1/responses") return modelResponse("ได้ครับ วันนี้อยากคุยเรื่องอะไรเป็นพิเศษครับ");
    if (href.includes("/message/reply")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  console.log = (...args) => logs.push(args.map(String).join(" "));

  try {
    const response = await worker.fetch(await signedLineRequest([lineTextEvent("วันนี้เหนื่อยนิดหน่อย")]), {
      ...BASE_ENV,
      KENJI_MODEL_DEDUPE: modelDedupeNamespace(),
    }, {
      waitUntil(promise) { deferred.push(promise); },
    });
    assert.equal(response.status, 200);
    assert.equal(calls.filter((call) => call.url === "https://api.openai.com/v1/responses").length, 1);
    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 1);
    const lineBody = JSON.parse(calls.find((call) => call.url.includes("/message/reply")).init.body);
    assert.equal(lineBody.messages.length, 1);
    assert.equal(lineBody.messages[0].text, "ได้ครับ วันนี้อยากคุยเรื่องอะไรเป็นพิเศษครับ");
    const diagnostic = logs.find((line) => line.includes('"line_webhook":"reply_diagnostics"'));
    assert.match(diagnostic, /"reply_source":"model"/);
    assert.match(diagnostic, /"model_attempted":true/);
    assert.match(diagnostic, /"model_success":true/);
    assert.doesNotMatch(logs.join("\n"), new RegExp(`${LINE_USER_ID}|วันนี้เหนื่อยนิดหน่อย|test-openai-key|reply-token`));
    await Promise.allSettled(deferred);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});

test("redelivered unresolved events and repeated message IDs never create duplicate model cost", async () => {
  const calls = [];
  const deferred = [];
  const originalFetch = globalThis.fetch;
  const env = { ...BASE_ENV, KENJI_MODEL_DEDUPE: modelDedupeNamespace() };
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href === "https://api.openai.com/v1/responses") return modelResponse("ได้ครับ อยากให้ผมช่วยฟังหรือช่วยคิดทางออกก่อนครับ");
    if (href.includes("api.airtable.com")) return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    if (href.includes("/message/reply")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const first = lineTextEvent("วันนี้เหนื่อยนิดหน่อย");
    const duplicate = lineTextEvent("วันนี้เหนื่อยนิดหน่อย", { replyToken: "reply-token-2" });
    const redelivered = lineTextEvent("วันนี้เหนื่อยนิดหน่อย", {
      replyToken: "reply-token-3",
      message: { id: "msg-redelivered", type: "text", text: "วันนี้เหนื่อยนิดหน่อย" },
      deliveryContext: { isRedelivery: true },
    });
    await worker.fetch(await signedLineRequest([first]), env, { waitUntil(promise) { deferred.push(promise); } });
    await worker.fetch(await signedLineRequest([duplicate]), env, { waitUntil(promise) { deferred.push(promise); } });
    await worker.fetch(await signedLineRequest([redelivered]), env, { waitUntil(promise) { deferred.push(promise); } });
    assert.equal(calls.filter((url) => url === "https://api.openai.com/v1/responses").length, 1);
    assert.equal(calls.filter((url) => url.includes("/message/reply")).length, 1);
    await Promise.allSettled(deferred);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("already-processed message IDs are blocked before OpenAI and LINE Reply API", async () => {
  const calls = [];
  const deferred = [];
  const originalFetch = globalThis.fetch;
  const env = { ...BASE_ENV, KENJI_MODEL_DEDUPE: modelDedupeNamespace() };
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes("api.airtable.com")) {
      return new Response(JSON.stringify({ records: [{ id: "recAlreadyProcessed" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (href === "https://api.openai.com/v1/responses") return modelResponse();
    if (href.includes("/message/reply")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(await signedLineRequest([lineTextEvent("วันนี้เหนื่อยนิดหน่อย")]), env, {
      waitUntil(promise) { deferred.push(promise); },
    });
    assert.equal(response.status, 200);
    assert.equal(calls.filter((url) => url === "https://api.openai.com/v1/responses").length, 0);
    assert.equal(calls.filter((url) => url.includes("/message/reply")).length, 0);
    await Promise.allSettled(deferred);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing or unavailable pre-model correctness dependencies fail closed without OpenAI", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes("api.airtable.com")) return new Response("{}", { status: 503 });
    if (href === "https://api.openai.com/v1/responses") return modelResponse();
    if (href.includes("/message/reply")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await worker.fetch(await signedLineRequest([lineTextEvent("วันนี้เหนื่อยนิดหน่อย")]), BASE_ENV);
    await worker.fetch(await signedLineRequest([lineTextEvent("วันนี้เหนื่อยนิดหน่อย", {
      message: { id: "msg-dedupe-unavailable", type: "text", text: "วันนี้เหนื่อยนิดหน่อย" },
    })]), { ...BASE_ENV, KENJI_MODEL_DEDUPE: modelDedupeNamespace() });
    assert.equal(calls.filter((url) => url === "https://api.openai.com/v1/responses").length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("guarded model output falls back once and never reaches LINE as authority text", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  globalThis.caches = undefined;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ href, init });
    if (href === "https://api.openai.com/v1/responses") return modelResponse("สถานะสมาชิกของคุณใช้งานได้ครับ");
    if (href.includes("api.airtable.com")) return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    if (href.includes("/message/reply")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(await signedLineRequest([lineTextEvent("ช่วยตอบแบบมั่นใจหน่อย")]), {
      ...BASE_ENV,
      KENJI_MODEL_DEDUPE: modelDedupeNamespace(),
    });
    assert.equal(response.status, 200);
    const replies = calls.filter((call) => call.href.includes("/message/reply"));
    assert.equal(replies.length, 1);
    const replyBody = JSON.parse(replies[0].init.body);
    assert.equal(replyBody.messages[0].text, "ขอผมเช็กข้อมูลตรงนี้ก่อนนะครับ");
    assert.doesNotMatch(replyBody.messages[0].text, /สมาชิก.*ใช้งานได้/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
});

test("active events without a reply token never call OpenAI", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return modelResponse();
  };
  try {
    const event = lineTextEvent("วันนี้เหนื่อยนิดหน่อย", { replyToken: "" });
    const response = await worker.fetch(await signedLineRequest([event]), {
      ...BASE_ENV,
      KENJI_MODEL_DEDUPE: modelDedupeNamespace(),
    });
    assert.equal(response.status, 200);
    assert.equal(calls.filter((url) => url.includes("api.openai.com")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("standby event does not call model or LINE Reply API", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return modelResponse();
  };
  try {
    const standby = lineTextEvent("วันนี้เหนื่อยนิดหน่อย", { mode: "standby", replyToken: "" });
    const response = await worker.fetch(await signedLineRequest([standby]), BASE_ENV);
    assert.equal(response.status, 200);
    assert.equal(calls.filter((url) => url.includes("api.openai.com")).length, 0);
    assert.equal(calls.filter((url) => url.includes("/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
