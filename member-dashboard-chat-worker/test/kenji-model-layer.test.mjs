import assert from "node:assert/strict";
import test from "node:test";

import worker, { createLineSignature, resolveKenjiLineReply } from "../src/index.js";
import {
  generateKenjiModelReply,
  guardKenjiModelOutput,
  KENJI_MODEL_POLICY_VERSION,
  KENJI_SYSTEM_PROMPT_V1,
} from "../src/kenji-model-policy.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const BASE_ENV = {
  LINE_CHANNEL_SECRET: "line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "line-token",
  LINE_AUTO_REPLY_ENABLED: "true",
  LINE_KENJI_AI_ENABLED: "true",
  LINE_KENJI_MODEL_ENABLED: "true",
  OPENAI_API_KEY: "test-openai-key",
};

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
    output_text: JSON.stringify({ answer, needs_clarification: true }),
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("versioned production prompt contains Per Voice and authority boundaries", () => {
  assert.equal(KENJI_MODEL_POLICY_VERSION, "kenji-line-production-v1");
  assert.match(KENJI_SYSTEM_PROMPT_V1, /Per Voice/);
  assert.match(KENJI_SYSTEM_PROMPT_V1, /Speak as "ผม"/);
  assert.match(KENJI_SYSTEM_PROMPT_V1, /Never claim that payment is paid/);
  assert.match(KENJI_SYSTEM_PROMPT_V1, /Never invent membership status, points/);
  assert.match(KENJI_SYSTEM_PROMPT_V1, /Never reveal internal worker names/);
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
});

test("model timeout fails safely", async () => {
  const result = await generateKenjiModelReply({
    text: "คุยเล่นหน่อย",
    env: { ...BASE_ENV, KENJI_MODEL_TIMEOUT_MS: "500" },
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }),
  });
  assert.equal(result.success, false);
  assert.equal(result.attempted, true);
  assert.equal(result.guard_reason, "model_timeout");
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

test("output guard blocks invented payment, membership, points, booking, availability, and internals", () => {
  const blocked = [
    "ชำระเงินสำเร็จและยืนยันแล้วครับ",
    "membership ของคุณ active แล้วครับ",
    "คะแนนมี 900 points ครับ",
    "จองยืนยันแล้วครับ",
    "นายแบบว่างคืนนี้ครับ",
    "ดูรายละเอียดจาก Airtable worker recABCDEFGHIJKL ครับ",
  ];
  for (const answer of blocked) {
    const result = guardKenjiModelOutput(answer);
    assert.equal(result.ok, false, answer);
    assert.ok(result.reason, answer);
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
    const response = await worker.fetch(await signedLineRequest([lineTextEvent("วันนี้เหนื่อยนิดหน่อย")]), BASE_ENV, {
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
