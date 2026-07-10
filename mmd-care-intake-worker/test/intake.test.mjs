import assert from "node:assert/strict";
import { describe, it } from "node:test";
import worker from "../src/index.js";

const ENV = {
  WORKER_NAME: "mmd-care-intake-worker",
  ALLOWED_ORIGINS: "https://mmdbkk.com,https://www.mmdbkk.com,https://sigil.mmdbkk.com,https://mmdprive.webflow.io"
};

class MockKV {
  constructor(entries = []) {
    this.store = new Map(entries);
  }

  async get(key) {
    return this.store.get(key) ?? null;
  }

  async put(key, value) {
    this.store.set(key, value);
  }
}

class MockR2 {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options) {
    this.objects.set(key, { value, options });
  }
}

describe("mmd-care-intake-worker", () => {
  it("GET /ping returns 200 and ok true", async () => {
    const response = await worker.fetch(new Request("https://worker.test/ping"), ENV);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.worker, "mmd-care-intake-worker");
    assert.equal(body.mode, "private_care_metadata_intake");
  });

  it("POST complaint evidence accepts multipart form data with one fake png file", async () => {
    const kv = new MockKV();
    const form = new FormData();
    form.set("lane", "Private Review");
    form.set("token", "token-123");
    form.set("session_id", "session-123");
    form.set("client_name", "Client");
    form.set("statement", "Private care review needed");
    form.set("client_evidence[]", new File([new Uint8Array([137, 80, 78, 71])], "evidence.png", { type: "image/png" }));

    const response = await worker.fetch(new Request("https://worker.test/member/api/recovery/complaint-evidence", {
      method: "POST",
      body: form
    }), {
      ...ENV,
      SIGIL_BOARD_KV: kv
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.complaint.lane, "Private Review");
    assert.equal(body.complaint.evidence.total_files, 1);
    assert.equal(body.complaint.evidence.client.length, 1);
    assert.equal(body.complaint.evidence.client[0].storage_status, "metadata_received");
    assert.equal(body.complaint.evidence.client[0].r2_key, null);
    assert.equal(body.storage.case_record.persisted, true);
    assert.equal(body.storage.board_card.persisted, true);
    assert.equal(body.storage.r2.enabled, false);
    assert.equal(body.storage.r2.stored_files, 0);
    assert.equal(body.storage.r2.reason, "missing_COMPLAINT_EVIDENCE_R2");
    assert.equal(body.binary_storage, "not_stored_in_kv");
  });

  it("stores raw complaint evidence in R2 when binding is present", async () => {
    const kv = new MockKV();
    const r2 = new MockR2();
    const form = new FormData();
    form.set("case_id", "complaint_test-r2");
    form.set("client_evidence[]", new File([new Uint8Array([137, 80, 78, 71])], "../Test File.PNG", { type: "image/png" }));

    const response = await worker.fetch(new Request("https://worker.test/member/api/recovery/complaint-evidence", {
      method: "POST",
      body: form
    }), {
      ...ENV,
      SIGIL_BOARD_KV: kv,
      COMPLAINT_EVIDENCE_R2: r2
    });
    const body = await response.json();
    const file = body.complaint.evidence.client[0];

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.storage.r2.enabled, true);
    assert.equal(body.storage.r2.stored_files, 1);
    assert.equal(file.storage_status, "stored_in_r2");
    assert.equal(file.name, "../Test File.PNG");
    assert.equal(file.safe_name, "test-file.png");
    assert.equal(file.type, "image/png");
    assert.equal(file.extension, "png");
    assert.match(file.r2_key, /^complaints\/complaint_test-r2\/client\/\d{8}_\d{6}-test-file\.png$/);
    assert.equal(r2.objects.size, 1);
    assert.equal(r2.objects.has(file.r2_key), true);
    assert.equal(r2.objects.get(file.r2_key).options.httpMetadata.contentType, "image/png");
    assert.equal(r2.objects.get(file.r2_key).options.customMetadata.complaint_id, "complaint_test-r2");
  });

  it("non-multipart request returns 415 invalid_content_type", async () => {
    const response = await worker.fetch(new Request("https://worker.test/member/api/recovery/complaint-evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statement: "not multipart" })
    }), ENV);
    const body = await response.json();

    assert.equal(response.status, 415);
    assert.equal(body.error, "invalid_content_type");
    assert.equal(body.message, "multipart/form-data is required");
  });

  it("KV writes return persisted true when mock KV is present", async () => {
    const kv = new MockKV();
    const form = new FormData();
    form.set("case_id", "case-abc");
    form.set("session_id", "session-abc");
    form.set("token", "secret-token");
    form.set("model_evidence", new File([new Uint8Array([137, 80, 78, 71])], "model.png", { type: "image/png" }));

    const response = await worker.fetch(new Request("https://worker.test/member/api/recovery/complaint-evidence", {
      method: "POST",
      body: form
    }), {
      ...ENV,
      SIGIL_BOARD_KV: kv
    });
    const body = await response.json();

    assert.equal(body.storage.case_record.persisted, true);
    assert.equal(body.storage.board_card.persisted, true);
    assert.equal(kv.store.has("mmd:private-care:complaint:v1:id:case-abc"), true);
    assert.equal(kv.store.has("mmd:private-care:complaint:v1:sid:session-abc"), true);
    assert.equal(kv.store.has("sigil:board:v1:cards"), true);
  });
});
