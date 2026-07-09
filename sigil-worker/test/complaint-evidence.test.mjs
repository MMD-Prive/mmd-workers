import assert from "node:assert/strict";
import test from "node:test";

import worker, { testInternals } from "../src/index.js";

const ORIGIN = "https://mmdbkk.com";

function makeKv() {
  const store = new Map();
  return {
    store,
    async get(key) {
      return store.get(key) || null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

function makeEnv() {
  return {
    WORKER_NAME: "sigil-worker-test",
    ALLOWED_ORIGINS: ORIGIN,
    SIGIL_COMPLAINT_KV: makeKv(),
    SIGIL_BOARD_KV: makeKv(),
  };
}

test("complaint evidence route rejects non multipart requests", async () => {
  const env = makeEnv();
  const res = await worker.fetch(
    new Request(`https://sigil.mmdbkk.com${testInternals.COMPLAINT_EVIDENCE_PATH}`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    }),
    env,
  );

  assert.equal(res.status, 415);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.error, "invalid_content_type");
});

test("complaint evidence route accepts multipart metadata and writes kv plus board card", async () => {
  const env = makeEnv();
  const form = new FormData();
  form.append("lane", "client");
  form.append("client_name", "คุณเจต");
  form.append("model_name", "Model A");
  form.append("statement", "ต้องการให้ MMD ตรวจสอบเคสนี้");
  form.append("client_evidence[]", new File(["fake-image"], "chat.png", { type: "image/png" }));

  const res = await worker.fetch(
    new Request(`https://sigil.mmdbkk.com${testInternals.COMPLAINT_EVIDENCE_PATH}`, {
      method: "POST",
      headers: { origin: ORIGIN },
      body: form,
    }),
    env,
  );

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.complaint.lane, "client");
  assert.equal(data.complaint.evidence.total_files, 1);
  assert.equal(data.storage.case_record.persisted, true);
  assert.equal(data.storage.board_card.persisted, true);

  const boardRaw = await env.SIGIL_BOARD_KV.get("sigil:board:v1:cards");
  const board = JSON.parse(boardRaw);
  assert.equal(board.cards.length, 1);
  assert.equal(board.cards[0].lane, "Private Review");
});

test("complaint evidence route rejects oversized files", async () => {
  const env = makeEnv();
  const form = new FormData();
  form.append("lane", "model");
  form.append("statement", "ไฟล์ใหญ่เกินไป");
  form.append("model_evidence[]", new File([new Uint8Array(16 * 1024 * 1024)], "large.pdf", { type: "application/pdf" }));

  const res = await worker.fetch(
    new Request(`https://sigil.mmdbkk.com${testInternals.COMPLAINT_EVIDENCE_PATH}`, {
      method: "POST",
      headers: { origin: ORIGIN },
      body: form,
    }),
    env,
  );

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "file_too_large");
});
