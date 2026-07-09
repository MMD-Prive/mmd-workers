import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

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
    SIGIL_RECOVERY_KV: makeKv(),
    SIGIL_COMPLAINT_KV: makeKv(),
    SIGIL_BOARD_KV: makeKv(),
    ALLOWED_ORIGINS: "https://mmdbkk.com,https://sigil.mmdbkk.com,https://mmdprive.webflow.io",
  };
}

async function readJson(response) {
  return response.json();
}

test("health returns ok", async () => {
  const env = makeEnv();
  const response = await worker.fetch(new Request("https://sigil.mmdbkk.com/ping"), env);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.worker, "sigil-worker");
});

test("recovery coupon status falls back when no KV record exists", async () => {
  const env = makeEnv();
  const response = await worker.fetch(
    new Request("https://sigil.mmdbkk.com/api/recovery/coupon/status?coupon=CPN-APOLOGY-JET-001"),
    env,
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.source, "fallback");
  assert.equal(body.coupon.coupon_id, "CPN-APOLOGY-JET-001");
});

test("recovery coupon ack persists claimed coupon", async () => {
  const env = makeEnv();
  const response = await worker.fetch(
    new Request("https://sigil.mmdbkk.com/api/recovery/coupon/ack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        coupon_id: "CPN-APOLOGY-JET-001",
        discount_percent: 10,
        client_name: "คุณเจต",
        session_id: "sid-test",
        token: "token-test",
      }),
    }),
    env,
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.coupon.status, "Claimed");
  assert.equal(body.storage.persisted, true);
});

test("complaint evidence accepts multipart form data and stores metadata", async () => {
  const env = makeEnv();
  const formData = new FormData();

  formData.append("lane", "client");
  formData.append("token", "token-test");
  formData.append("session_id", "sid-test");
  formData.append("client_name", "คุณเจต");
  formData.append("model_name", "Model A");
  formData.append("case_date", "2026-07-10");
  formData.append("case_time", "21:30");
  formData.append("case_location", "Bangkok");
  formData.append("client_statement", "ต้องการให้ MMD ตรวจสอบเคสนี้");
  formData.append("statement", "รายละเอียดเพิ่มเติม");
  formData.append("client_evidence[]", new File(["fake png bytes"], "chat.png", { type: "image/png" }));
  formData.append("model_evidence[]", new File(["fake pdf bytes"], "route.pdf", { type: "application/pdf" }));

  const response = await worker.fetch(
    new Request("https://sigil.mmdbkk.com/member/api/recovery/complaint-evidence", {
      method: "POST",
      body: formData,
    }),
    env,
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.match(body.complaint.complaint_id, /^cmp_/);
  assert.equal(body.complaint.lane, "client");
  assert.equal(body.complaint.evidence.total_files, 2);
  assert.equal(body.complaint.evidence.client[0].name, "chat.png");
  assert.equal(body.storage.case_record.persisted, true);
  assert.equal(body.storage.board_card.persisted, true);
});

test("complaint evidence rejects unsupported file types", async () => {
  const env = makeEnv();
  const formData = new FormData();

  formData.append("lane", "client");
  formData.append("client_statement", "test");
  formData.append("client_evidence[]", new File(["bad"], "malware.exe", { type: "application/octet-stream" }));

  const response = await worker.fetch(
    new Request("https://sigil.mmdbkk.com/member/api/recovery/complaint-evidence", {
      method: "POST",
      body: formData,
    }),
    env,
  );
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.error, "unsupported_file_type");
});

test("complaint evidence requires multipart form data", async () => {
  const env = makeEnv();
  const response = await worker.fetch(
    new Request("https://sigil.mmdbkk.com/member/api/recovery/complaint-evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lane: "client" }),
    }),
    env,
  );
  const body = await readJson(response);

  assert.equal(response.status, 415);
  assert.equal(body.ok, false);
  assert.equal(body.error, "invalid_content_type");
});
