import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

function testEnv() {
  const store = new Map();
  const kv = {
    async get(key) {
      return store.get(key) || null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
  return {
    WORKER_NAME: "mmd-care-intake-worker-test",
    ALLOWED_ORIGINS: "https://mmdbkk.com,https://www.mmdbkk.com,https://sigil.mmdbkk.com,https://mmdprive.webflow.io",
    SIGIL_BOARD_KV: kv,
  };
}

test("ping returns worker status", async () => {
  const res = await worker.fetch(new Request("https://example.test/ping"), testEnv());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.worker, "mmd-care-intake-worker-test");
});

test("complaint intake accepts multipart metadata and file", async () => {
  const form = new FormData();
  form.set("lane", "client");
  form.set("session_id", "sid-test-001");
  form.set("client_name", "คุณเจต");
  form.set("model_name", "Kenji");
  form.set("statement", "Smoke test from fresh mmd care intake worker");
  form.append("client_evidence[]", new File(["fake png"], "test.png", { type: "image/png" }));

  const res = await worker.fetch(
    new Request("https://example.test/member/api/recovery/complaint-evidence", {
      method: "POST",
      body: form,
    }),
    testEnv(),
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.complaint.lane, "client");
  assert.equal(body.complaint.evidence.total_files, 1);
  assert.equal(body.storage.case_record.persisted, true);
  assert.equal(body.storage.board_card.persisted, true);
});

test("complaint intake rejects non multipart requests", async () => {
  const res = await worker.fetch(
    new Request("https://example.test/member/api/recovery/complaint-evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    }),
    testEnv(),
  );
  assert.equal(res.status, 415);
  const body = await res.json();
  assert.equal(body.error, "invalid_content_type");
});
