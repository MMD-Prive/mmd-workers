import assert from "node:assert/strict";
import test from "node:test";

import { KenjiKnowledgeCoordinator } from "./src/kenji-knowledge-airtable-adapter.js";

const ENV = {
  AIRTABLE_API_KEY: "test",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_KENJI_KNOWLEDGE_TABLE_ID: "tblsLd1uVOtG2kHoU",
};

function initialRecord() {
  return {
    id: "recKenjiAtomic001",
    fields: {
      knowledge_id: "kenji_atomic_001",
      title: "Payment proof",
      category: "payment",
      language: "th",
      customer_answer: "MMD จะรับหลักฐานไว้ตรวจยอดจริงก่อนครับ",
      allowed_audience: ["Standard", "Premium"],
      risk_level: "critical",
      status: "draft",
      source_ref: "MMD Core Knowledge",
      owner: "Boss Per",
      payload_json: "{}",
      workflow_stage: "draft",
      workflow_version: 1,
    },
  };
}

function command(path, body, key, role = "reviewer") {
  return new Request("https://mmdbkk.com" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      "X-MMD-Trusted-Actor-Id": "boss-per",
      "X-MMD-Trusted-Actor-Role": role,
    },
    body: JSON.stringify(body),
  });
}

function passingQa() {
  return {
    privacy_checked: true,
    policy_path_match: true,
    sample_question: "ส่งหลักฐานแล้วใช้สิทธิ์ได้เลยไหม",
    blocked_information: ["payment confirmation"],
    checked_at: "2026-09-01T06:00:00.000Z",
    channel: "line_oa",
    audience: "Premium",
  };
}

test("Airtable adapter serializes Review, QA, Publish and Audit in one record", async () => {
  const originalFetch = globalThis.fetch;
  let record = initialRecord();
  let patchCount = 0;

  globalThis.fetch = async (_url, init = {}) => {
    if (!init.method || init.method === "GET") {
      return Response.json({ records: [structuredClone(record)] });
    }
    assert.equal(init.method, "PATCH");
    patchCount += 1;
    const payload = JSON.parse(init.body);
    assert.equal(payload.records.length, 1);
    assert.equal(payload.records[0].id, record.id);
    record = {
      ...record,
      fields: { ...record.fields, ...payload.records[0].fields },
    };
    return Response.json({ records: [structuredClone(record)] });
  };

  try {
    const coordinator = new KenjiKnowledgeCoordinator({}, ENV);

    const reviewResponse = await coordinator.fetch(command(
      "/v1/admin/kenji/knowledge/kenji_atomic_001/review",
      { expected_version: 1 },
      "cmd-review-0001",
    ));
    assert.equal(reviewResponse.status, 200);
    assert.equal((await reviewResponse.json()).stage, "review");
    assert.equal(record.fields.status, "pending_review");

    const qaResponse = await coordinator.fetch(command(
      "/v1/admin/kenji/knowledge/kenji_atomic_001/qa",
      { expected_version: 1, qa: passingQa() },
      "cmd-qa-pass-0001",
    ));
    assert.equal(qaResponse.status, 200);
    assert.equal((await qaResponse.json()).stage, "qa_passed");
    assert.equal(record.fields.status, "approved");

    const publishResponse = await coordinator.fetch(command(
      "/v1/admin/kenji/knowledge/kenji_atomic_001/publish",
      { expected_version: 1 },
      "cmd-publish-0001",
      "owner",
    ));
    assert.equal(publishResponse.status, 200);
    const published = await publishResponse.json();
    assert.equal(published.stage, "published");
    assert.equal(published.version, 2);
    assert.equal(record.fields.status, "active");

    const auditResponse = await coordinator.fetch(new Request(
      "https://mmdbkk.com/v1/admin/kenji/knowledge/kenji_atomic_001/audit",
      { headers: {
        "X-MMD-Trusted-Actor-Id": "boss-per",
        "X-MMD-Trusted-Actor-Role": "owner",
      } },
    ));
    assert.equal(auditResponse.status, 200);
    const audit = await auditResponse.json();
    assert.deepEqual(
      audit.events.map((event) => event.action),
      ["submit_review", "record_qa", "publish"],
    );
    assert.equal(audit.count, 3);
    assert.equal(patchCount, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed QA is persisted atomically without advancing Review", async () => {
  const originalFetch = globalThis.fetch;
  let record = initialRecord();

  globalThis.fetch = async (_url, init = {}) => {
    if (!init.method || init.method === "GET") return Response.json({ records: [structuredClone(record)] });
    const payload = JSON.parse(init.body);
    record = { ...record, fields: { ...record.fields, ...payload.records[0].fields } };
    return Response.json({ records: [structuredClone(record)] });
  };

  try {
    const coordinator = new KenjiKnowledgeCoordinator({}, ENV);
    await coordinator.fetch(command(
      "/v1/admin/kenji/knowledge/kenji_atomic_001/review",
      { expected_version: 1 },
      "cmd-review-0002",
    ));
    const response = await coordinator.fetch(command(
      "/v1/admin/kenji/knowledge/kenji_atomic_001/qa",
      { expected_version: 1, qa: { sample_question: "test" } },
      "cmd-qa-fail-0002",
    ));
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.stage, "review");
    assert.equal(record.fields.status, "pending_review");
    const workflow = JSON.parse(record.fields.payload_json).workflow;
    assert.equal(workflow.audit_log.at(-1).action, "qa_failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("idempotency key replays the saved result without a second PATCH", async () => {
  const originalFetch = globalThis.fetch;
  let record = initialRecord();
  let patchCount = 0;

  globalThis.fetch = async (_url, init = {}) => {
    if (!init.method || init.method === "GET") return Response.json({ records: [structuredClone(record)] });
    patchCount += 1;
    const payload = JSON.parse(init.body);
    record = { ...record, fields: { ...record.fields, ...payload.records[0].fields } };
    return Response.json({ records: [structuredClone(record)] });
  };

  try {
    const coordinator = new KenjiKnowledgeCoordinator({}, ENV);
    const req = () => command(
      "/v1/admin/kenji/knowledge/kenji_atomic_001/review",
      { expected_version: 1 },
      "cmd-replay-0001",
    );
    assert.equal((await coordinator.fetch(req())).status, 200);
    const replay = await coordinator.fetch(req());
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).idempotent_replay, true);
    assert.equal(patchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stale expected version and missing idempotency key fail closed", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ records: [initialRecord()] });
  try {
    const coordinator = new KenjiKnowledgeCoordinator({}, ENV);
    const stale = await coordinator.fetch(command(
      "/v1/admin/kenji/knowledge/kenji_atomic_001/review",
      { expected_version: 9 },
      "cmd-stale-0001",
    ));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error, "version_conflict");

    const missing = await coordinator.fetch(command(
      "/v1/admin/kenji/knowledge/kenji_atomic_001/review",
      { expected_version: 1 },
      "",
    ));
    assert.equal(missing.status, 428);
    assert.equal((await missing.json()).error, "idempotency_key_required");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
