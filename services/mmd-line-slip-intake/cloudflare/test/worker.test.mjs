import assert from "node:assert/strict";
import test from "node:test";
import worker, { handleQueue, handleStagingIntake, validJob } from "../worker.mjs";

const TOKEN = "staging-secret";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);

function r2Mock() {
  const store = new Map();
  const wrap = (value) => ({
    size: value.body.byteLength,
    arrayBuffer: async () => value.body.slice(0),
  });
  return {
    store,
    async head(key) { return store.has(key) ? { size: store.get(key).body.byteLength } : null; },
    async put(key, body, options) {
      const bytes = body instanceof ArrayBuffer
        ? body.slice(0)
        : body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
      store.set(key, { body: bytes, options });
    },
    async get(key) { return store.has(key) ? wrap(store.get(key)) : null; },
  };
}

function queueMock() {
  const jobs = [];
  return { jobs, async send(body) { jobs.push(body); } };
}

function extractorMock(result = { result: { amount_thb: 690, payment_ref: "ABCDEF123456", confidence_score: 0.94 } }) {
  const calls = [];
  return {
    calls,
    async fetch(request) {
      calls.push(new URL(request.url).pathname);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
}

function telegramMock() {
  const calls = [];
  return {
    calls,
    async fetch(request) {
      calls.push(JSON.parse(await request.text()));
      return new Response(JSON.stringify({ ok: true, telegram: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
}

function baseEnv(overrides = {}) {
  return {
    MMD_RUNTIME_SCOPE: "staging",
    MMD_SLIP_INTAKE_STAGING_TOKEN: TOKEN,
    MMD_SLIP_EXTRACTOR_TOKEN: "extractor-secret",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_API_KEY: "airtable-secret",
    AIRTABLE_PAYMENT_PROOFS_STAGING_TABLE_ID: "tbl9Y6IMM4EWYjIBJ",
    TELEGRAM_OPS_CHAT_ID: "-1000000000000",
    TG_THREAD_PAYMENT: "21",
    AUTH_SERVICE_LINE_TO_TELEGRAM: "line-to-telegram-secret",
    LINE_SLIP_EVIDENCE: r2Mock(),
    LINE_SLIP_QUEUE: queueMock(),
    SLIP_EXTRACTOR: extractorMock(),
    TELEGRAM_WORKER: telegramMock(),
    ...overrides,
  };
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

test("staging intake requires bearer and never exposes R2 key", async () => {
  const env = baseEnv();
  const unauthorized = await handleStagingIntake(new Request("https://staging/v1/staging/intake", {
    method: "POST",
    headers: { "content-type": "image/png" },
    body: PNG,
  }), env);
  assert.equal(unauthorized.status, 401);

  const response = await handleStagingIntake(new Request("https://staging/v1/staging/intake", {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "image/png",
      "x-mmd-run-id": "smoke-001",
    },
    body: PNG,
  }), env);
  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.state, "queued");
  assert.match(payload.proof_id, /^syn_[a-f0-9]{24}$/);
  assert.equal("r2_key" in payload, false);
  assert.equal(env.LINE_SLIP_QUEUE.jobs.length, 1);
  assert.equal(env.LINE_SLIP_QUEUE.jobs[0].source, "synthetic_isolated");
});

test("queue consumer creates pending evidence only and sends redacted HYPE alert", async () => {
  const env = baseEnv();
  const bytes = PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength);
  const sha = await sha256(bytes);
  const proofId = `syn_${sha.slice(0, 24)}`;
  const r2Key = `line-ofc/payment-proofs/staging/2026/09/${proofId}/original.png`;
  await env.LINE_SLIP_EVIDENCE.put(r2Key, bytes, {});
  const job = {
    version: 1,
    source: "synthetic_isolated",
    proof_id: proofId,
    r2_key: r2Key,
    evidence_sha256: sha,
    mime_type: "image/png",
    byte_size: PNG.byteLength,
    run_id: "smoke-queue-001",
    queued_at: "2026-09-04T15:00:00.000Z",
  };

  const airtableWrites = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (!href.includes("api.airtable.com")) throw new Error(`unexpected fetch ${href}`);
    if ((init.method || "GET") === "GET") {
      return new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const payload = JSON.parse(init.body);
    airtableWrites.push(payload.fields);
    return new Response(JSON.stringify({ id: "recStagingProof", fields: payload.fields }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  let acked = 0;
  let retried = 0;
  try {
    await handleQueue({
      messages: [{
        id: "qmsg-1",
        body: job,
        ack() { acked += 1; },
        retry() { retried += 1; },
      }],
    }, env);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(acked, 1);
  assert.equal(retried, 0);
  assert.equal(airtableWrites.length, 1);
  const fields = airtableWrites[0];
  assert.equal(fields.status, "pending");
  assert.equal(fields.source, "synthetic_isolated");
  assert.equal(fields.proof_id, proofId);
  assert.doesNotMatch(JSON.stringify(fields), /paid|verified|entitlement|points/i);
  assert.equal(env.SLIP_EXTRACTOR.calls[0], "/v1/extract/qr");
  assert.equal(env.TELEGRAM_WORKER.calls.length, 1);
  const alert = env.TELEGRAM_WORKER.calls[0];
  assert.equal(alert.flow, "payment_proof");
  assert.equal(alert.message_thread_id, 21);
  assert.doesNotMatch(alert.text, /ABCDEF123456/);
  assert.match(alert.text, /ABCD…3456/);
});

test("queue replay is idempotent and does not re-extract or re-alert", async () => {
  const env = baseEnv();
  const bytes = PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength);
  const sha = await sha256(bytes);
  const job = {
    version: 1,
    source: "synthetic_isolated",
    proof_id: `syn_${sha.slice(0, 24)}`,
    r2_key: "line-ofc/payment-proofs/staging/2026/09/replay/original.png",
    evidence_sha256: sha,
    mime_type: "image/png",
    byte_size: PNG.byteLength,
    run_id: "replay",
    queued_at: "2026-09-04T15:00:00.000Z",
  };
  await env.LINE_SLIP_EVIDENCE.put(job.r2_key, bytes, {});

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    records: [{ id: "recExisting", fields: { proof_id: job.proof_id } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  let acked = 0;
  try {
    await handleQueue({
      messages: [{
        id: "qmsg-replay",
        body: job,
        ack() { acked += 1; },
        retry() { throw new Error("must not retry"); },
      }],
    }, env);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(acked, 1);
  assert.equal(env.SLIP_EXTRACTOR.calls.length, 0);
  assert.equal(env.TELEGRAM_WORKER.calls.length, 0);
});

test("corrupt R2 evidence retries and never creates a proof", async () => {
  const env = baseEnv();
  const bytes = PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength);
  const sha = await sha256(bytes);
  const job = {
    version: 1,
    source: "synthetic_isolated",
    proof_id: `syn_${sha.slice(0, 24)}`,
    r2_key: "line-ofc/payment-proofs/staging/2026/09/corrupt/original.png",
    evidence_sha256: "0".repeat(64),
    mime_type: "image/png",
    byte_size: PNG.byteLength,
    run_id: "corrupt",
    queued_at: "2026-09-04T15:00:00.000Z",
  };
  await env.LINE_SLIP_EVIDENCE.put(job.r2_key, bytes, {});

  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (url, init = {}) => {
    if ((init.method || "GET") === "GET") {
      return new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    writes += 1;
    return new Response(JSON.stringify({ id: "unexpected" }), { status: 200 });
  };
  let retried = 0;
  try {
    await handleQueue({
      messages: [{
        id: "qmsg-corrupt",
        body: job,
        ack() {},
        retry() { retried += 1; },
      }],
    }, env);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(retried, 1);
  assert.equal(writes, 0);
});

test("runtime rejects real-line jobs in the staging consumer", async () => {
  const response = await worker.fetch(new Request("https://staging/health"), {
    MMD_RUNTIME_SCOPE: "production",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    worker: "mmd-line-slip-intake-staging",
    runtime_scope: "production",
  });
  assert.equal(validJob({ version: 1, source: "line_ofc" }), false);
});
