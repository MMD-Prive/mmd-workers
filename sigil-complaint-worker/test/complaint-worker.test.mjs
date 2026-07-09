import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

function env() {
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
    WORKER_NAME: "sigil-complaint-worker-test",
    ALLOWED_ORIGINS: "https://mmdbkk.com,https://mmdprive.webflow.io",
    SIGIL_BOARD_KV: kv,
  };
}

test("ping returns worker status", async () => {
  const res = await worker.fetch(new Request("https://example.test/ping"), env());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.worker, "sigil-complaint-worker-test");
});

test("complaint evidence accepts multipart form data", async () => {
  const form = new FormData();
  form.set("lane", "client");
  form.set("session_id", "sid-test-001");
  form.set("client_name", "คุณเจต");
  form.set("model_name", "Kenji");
  form.set("statement", "Smoke test from dedicated worker");
  form.append("client_evidence[]", new File(["fake png"], "test.png", { type: "image/png" }));

  const res = await worker.fetch(
    new Request("https://example.test/member/api/recovery/complaint-evidence", {
      method: "POST",
      body: form,
    }),
    env(),
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.complaint.lane, "client");
  assert.equal(body.complaint.evidence.total_files, 1);
  assert.equal(body.storage.case_record.persisted, true);
});

test("complaint evidence rejects invalid content type", async () => {
  const res = await worker.fetch(
    new Request("https://example.test/member/api/recovery/complaint-evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    }),
    env(),
  );

  assert.equal(res.status, 415);
  const body = await res.json();
  assert.equal(body.error, "invalid_content_type");
});
