import assert from "node:assert/strict";
import test from "node:test";

import {
  isKenjiKnowledgeWorkflowRequest,
  KenjiKnowledgeCoordinator,
} from "./src/kenji-knowledge-airtable-adapter.js";

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

function publishedRecord() {
  return {
    id: "recKenjiPublished01",
    fields: {
      knowledge_id: "kenji_seed_v1_payment_03",
      title: "Payment pending review",
      category: "payment",
      language: "th",
      customer_answer: "OLD LIVE ANSWER",
      internal_instruction: "Old internal policy",
      allowed_channels: ["LINE_OFC"],
      allowed_audience: ["Customer"],
      response_mode: "auto_reply_allowed",
      risk_level: "critical",
      status: "active",
      effective_from: "2026-09-07",
      source_path: "/confirm/payment-proof",
      source_ref: "seed-pack-v1",
      owner: "Boss Per",
      reviewed_by: "per",
      review_note: "Published old route",
      payload_json: JSON.stringify({
        seed_pack: {
          version: "1.1",
          lane: "payment",
          related_routes: ["/confirm/payment-proof"],
        },
        workflow: {
          stage: "published",
          version: 2,
          qa_snapshot: { pass: true, version: 1 },
          audit_log: [{ action: "publish", version: 1 }],
          published_at: "2026-09-07T09:54:40.469Z",
          published_by: "per",
        },
      }),
      workflow_stage: "published",
      workflow_version: 2,
      last_command_id: "cmd-old-publish",
      workflow_updated_at: "2026-09-07T09:54:40.469Z",
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

test("published revision preserves live fields through Review and QA then promotes atomically", async () => {
  const originalFetch = globalThis.fetch;
  let record = publishedRecord();
  let patchCount = 0;

  globalThis.fetch = async (_url, init = {}) => {
    if (!init.method || init.method === "GET") return Response.json({ records: [structuredClone(record)] });
    assert.equal(init.method, "PATCH");
    patchCount += 1;
    const payload = JSON.parse(init.body);
    assert.equal(payload.records.length, 1);
    assert.equal(payload.records[0].id, "recKenjiPublished01");
    record = { ...record, fields: { ...record.fields, ...payload.records[0].fields } };
    return Response.json({ records: [structuredClone(record)] });
  };

  try {
    const coordinator = new KenjiKnowledgeCoordinator({}, ENV);
    const path = "/v1/admin/kenji/knowledge/kenji_seed_v1_payment_03";
    const revisedCard = {
      knowledge_id: "kenji_seed_v1_payment_03",
      title: "Payment pending review",
      category: "payment",
      language: "th",
      customer_answer: "NEW REVIEWED ANSWER",
      internal_instruction: "Use member payments; proof remains evidence.",
      allowed_channels: ["LINE_OFC"],
      allowed_audience: ["Customer"],
      response_mode: "auto_reply_allowed",
      risk_level: "critical",
      source_path: "/member/payments",
      source_ref: "seed-pack-v1.2",
      owner: "Boss Per",
      payload_json: {
        seed_pack: {
          version: "1.2",
          lane: "payment",
          related_routes: ["/member/payments"],
        },
      },
    };

    const reviseResponse = await coordinator.fetch(command(
      path + "/revise",
      { expected_version: 2, card: revisedCard },
      "cmd-revise-0001",
      "owner",
    ));
    assert.equal(reviseResponse.status, 200);
    const revised = await reviseResponse.json();
    assert.equal(revised.stage, "draft");
    assert.equal(revised.version, 2);
    assert.equal(revised.published_version, 2);
    assert.equal(revised.live_preserved, true);
    assert.equal(record.fields.customer_answer, "OLD LIVE ANSWER");
    assert.equal(record.fields.source_path, "/confirm/payment-proof");
    assert.equal(record.fields.status, "active");
    assert.equal(record.fields.workflow_stage, "published");
    assert.equal(record.fields.workflow_version, 2);
    let workflow = JSON.parse(record.fields.payload_json).workflow;
    assert.equal(workflow.pending_revision.card.customer_answer, "NEW REVIEWED ANSWER");
    assert.deepEqual(workflow.pending_revision.card.payload_json.seed_pack.related_routes, ["/member/payments"]);

    const reviewResponse = await coordinator.fetch(command(
      path + "/review",
      { expected_version: 2 },
      "cmd-revise-review-0001",
    ));
    assert.equal(reviewResponse.status, 200);
    assert.equal((await reviewResponse.json()).stage, "review");
    assert.equal(record.fields.customer_answer, "OLD LIVE ANSWER");
    assert.equal(record.fields.status, "active");
    workflow = JSON.parse(record.fields.payload_json).workflow;
    assert.equal(workflow.pending_revision.stage, "review");

    const qaResponse = await coordinator.fetch(command(
      path + "/qa",
      { expected_version: 2, qa: passingQa() },
      "cmd-revise-qa-0001",
    ));
    assert.equal(qaResponse.status, 200);
    assert.equal((await qaResponse.json()).stage, "qa_passed");
    assert.equal(record.fields.customer_answer, "OLD LIVE ANSWER");
    assert.equal(record.fields.status, "active");
    workflow = JSON.parse(record.fields.payload_json).workflow;
    assert.equal(workflow.pending_revision.stage, "qa_passed");

    const publishResponse = await coordinator.fetch(command(
      path + "/publish",
      { expected_version: 2 },
      "cmd-revise-publish-0001",
      "owner",
    ));
    assert.equal(publishResponse.status, 200);
    const published = await publishResponse.json();
    assert.equal(published.stage, "published");
    assert.equal(published.version, 3);
    assert.equal(published.revision_pending, false);
    assert.equal(record.fields.customer_answer, "NEW REVIEWED ANSWER");
    assert.equal(record.fields.source_path, "/member/payments");
    assert.equal(record.fields.status, "active");
    assert.equal(record.fields.workflow_stage, "published");
    assert.equal(record.fields.workflow_version, 3);
    const finalPayload = JSON.parse(record.fields.payload_json);
    assert.equal(finalPayload.seed_pack.version, "1.2");
    assert.deepEqual(finalPayload.seed_pack.related_routes, ["/member/payments"]);
    assert.equal("pending_revision" in finalPayload.workflow, false);
    assert.deepEqual(
      finalPayload.workflow.audit_log.map((event) => event.action),
      ["publish", "revise", "submit_review", "record_qa", "publish"],
    );
    assert.equal(patchCount, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("revision route is POST-only, versioned, owner-gated, and rejects a second pending revision", async () => {
  assert.equal(isKenjiKnowledgeWorkflowRequest("/v1/admin/kenji/knowledge/kenji_seed_v1_payment_03/revise", "POST"), true);
  assert.equal(isKenjiKnowledgeWorkflowRequest("/v1/admin/kenji/knowledge/kenji_seed_v1_payment_03/revise", "GET"), false);

  const originalFetch = globalThis.fetch;
  let record = publishedRecord();
  globalThis.fetch = async (_url, init = {}) => {
    if (!init.method || init.method === "GET") return Response.json({ records: [structuredClone(record)] });
    const payload = JSON.parse(init.body);
    record = { ...record, fields: { ...record.fields, ...payload.records[0].fields } };
    return Response.json({ records: [structuredClone(record)] });
  };

  try {
    const coordinator = new KenjiKnowledgeCoordinator({}, ENV);
    const path = "/v1/admin/kenji/knowledge/kenji_seed_v1_payment_03/revise";
    const stale = await coordinator.fetch(command(path, { expected_version: 9 }, "cmd-revise-stale", "owner"));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error, "version_conflict");

    const reviewer = await coordinator.fetch(command(path, { expected_version: 2 }, "cmd-revise-role-1", "reviewer"));
    assert.equal(reviewer.status, 403);
    assert.equal((await reviewer.json()).error, "revision_role_required");

    const accepted = await coordinator.fetch(command(
      path,
      { expected_version: 2, card: { knowledge_id: "kenji_seed_v1_payment_03", customer_answer: "candidate" } },
      "cmd-revise-accept",
      "admin",
    ));
    assert.equal(accepted.status, 200);

    const second = await coordinator.fetch(command(
      path,
      { expected_version: 2, card: { knowledge_id: "kenji_seed_v1_payment_03", customer_answer: "other" } },
      "cmd-revise-other1",
      "admin",
    ));
    assert.equal(second.status, 409);
    assert.equal((await second.json()).error, "revision_in_progress");
    assert.equal(record.fields.customer_answer, "OLD LIVE ANSWER");
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
