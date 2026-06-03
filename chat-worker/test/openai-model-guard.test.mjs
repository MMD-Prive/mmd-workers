import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "../src/index.js";

const INTERNAL_TOKEN = "test-internal-token";
const CONFIG_ERROR = "OPENAI_MODEL must be a text model for chat-worker /v1/responses.";
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
});

function env(overrides = {}) {
  return {
    AI_PROVIDER: "openai",
    INTERNAL_TOKEN,
    OPENAI_API_KEY: "test-openai-api-key",
    ...overrides,
  };
}

function internalRequest(text = "hello") {
  return new Request("https://chat-worker.test/v1/chat/internal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": INTERNAL_TOKEN,
    },
    body: JSON.stringify({ member_id: "member-1", text }),
  });
}

function captureWarnings() {
  const warnings = [];
  console.warn = (...args) => {
    warnings.push(args.map(String).join(" "));
  };
  return warnings;
}

function mockOpenAIResponse(calls) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")) });
    return new Response(JSON.stringify({ output_text: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

for (const rejectedModel of ["gpt-image-1", "gpt-image-2"]) {
  test(`OPENAI_MODEL=${rejectedModel} is rejected without calling OpenAI`, async () => {
    const calls = [];
    const warnings = captureWarnings();
    mockOpenAIResponse(calls);

    const response = await worker.fetch(internalRequest(), env({ OPENAI_MODEL: rejectedModel }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.reply, "ai_config_error");
    assert.deepEqual(body.meta, { provider: "openai", error: "invalid_model" });
    assert.equal(calls.length, 0);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0], CONFIG_ERROR);
    assert.doesNotMatch(warnings[0], /gpt-image-[12]/);
  });
}

test("valid text OPENAI_MODEL calls /v1/responses with the configured model", async () => {
  const calls = [];
  mockOpenAIResponse(calls);

  const response = await worker.fetch(internalRequest(), env({ OPENAI_MODEL: "gpt-4.1-mini" }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.reply, "ok");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].body.model, "gpt-4.1-mini");
});

for (const emptyValue of [undefined, "", "   "]) {
  test(`empty OPENAI_MODEL value ${JSON.stringify(emptyValue)} uses the default text model`, async () => {
    const calls = [];
    mockOpenAIResponse(calls);

    const response = await worker.fetch(internalRequest(), env({ OPENAI_MODEL: emptyValue }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.reply, "ok");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.model, "gpt-4.1-mini");
  });
}
