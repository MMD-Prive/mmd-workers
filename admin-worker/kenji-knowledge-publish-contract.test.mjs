import assert from "node:assert/strict";
import test from "node:test";

import {
  KNOWLEDGE_ACTION,
  KnowledgeContractError,
  executeKnowledgeCommand,
  runKnowledgeQa,
  toCustomerSafeKnowledge,
} from "./src/kenji-knowledge-publish-contract.js";

const NOW = "2026-09-01T06:00:00.000Z";
const REVIEWER = { id: "boss-per", role: "reviewer" };
const PUBLISHER = { id: "boss-per", role: "owner" };

function draft(overrides = {}) {
  return {
    knowledge_id: "kenji_contract_001",
    title: "Payment proof guidance",
    category: "payment",
    language: "th",
    approved_answer: "MMD จะรับหลักฐานไว้ตรวจยอดจริงก่อนครับ",
    allowed_audience: ["standard", "premium"],
    source: "MMD Core Knowledge",
    owner: "Boss Per",
    risk_level: "critical",
    stage: "draft",
    version: 3,
    audit_log: [],
    ...overrides,
  };
}

function context(actor, expectedVersion = 3) {
  return { actor, expectedVersion, now: NOW };
}

function passingQa() {
  return {
    privacy_checked: true,
    policy_path_match: true,
    sample_question: "ส่งสลิปแล้ว ใช้สิทธิ์ได้เลยไหม",
    blocked_information: ["payment confirmation"],
    checked_at: NOW,
    channel: "line_oa",
    audience: "premium",
  };
}

test("Draft cannot skip Review and publish directly", () => {
  assert.throws(
    () => executeKnowledgeCommand(
      draft(),
      { action: KNOWLEDGE_ACTION.PUBLISH },
      context(PUBLISHER),
    ),
    (error) => error instanceof KnowledgeContractError &&
      error.code === "invalid_stage_transition" &&
      error.status === 409,
  );
});

test("browser-supplied actor, status and publish fields cannot grant authority", () => {
  assert.throws(
    () => executeKnowledgeCommand(
      draft(),
      {
        action: KNOWLEDGE_ACTION.SUBMIT_REVIEW,
        actor: { id: "browser", role: "owner" },
        status: "published",
        publish: true,
      },
      { expectedVersion: 3, now: NOW },
    ),
    (error) => error.code === "trusted_actor_required",
  );
});

test("incomplete Draft cannot enter Review", () => {
  assert.throws(
    () => executeKnowledgeCommand(
      draft({ source: "", allowed_audience: [] }),
      { action: KNOWLEDGE_ACTION.SUBMIT_REVIEW },
      context(REVIEWER),
    ),
    (error) => error.code === "review_validation_failed" &&
      error.details.errors[0].fields.includes("source") &&
      error.details.errors[0].fields.includes("allowed_audience"),
  );
});

test("QA failure records an audit event but does not advance state", () => {
  const reviewed = executeKnowledgeCommand(
    draft(),
    { action: KNOWLEDGE_ACTION.SUBMIT_REVIEW },
    context(REVIEWER),
  ).record;

  const result = executeKnowledgeCommand(
    reviewed,
    {
      action: KNOWLEDGE_ACTION.RECORD_QA,
      qa: { sample_question: "test", policy_path_match: false },
    },
    context(REVIEWER),
  );

  assert.equal(result.ok, false);
  assert.equal(result.transitioned, false);
  assert.equal(result.record.stage, "review");
  assert.equal(result.event.action, "qa_failed");
  assert.equal(result.record.audit_log.length, 2);
  assert.ok(result.qa.errors.some((item) => item.code === "privacy_check_required"));
  assert.ok(result.qa.errors.some((item) => item.code === "production_policy_path_not_verified"));
});

test("Review, QA and Publish produce ordered append-only audit events", () => {
  const review = executeKnowledgeCommand(
    draft(),
    { action: KNOWLEDGE_ACTION.SUBMIT_REVIEW },
    context(REVIEWER),
  );
  const qa = executeKnowledgeCommand(
    review.record,
    { action: KNOWLEDGE_ACTION.RECORD_QA, qa: passingQa() },
    context(REVIEWER),
  );
  const publish = executeKnowledgeCommand(
    qa.record,
    { action: KNOWLEDGE_ACTION.PUBLISH },
    context(PUBLISHER),
  );

  assert.equal(review.record.stage, "review");
  assert.equal(qa.record.stage, "qa_passed");
  assert.equal(publish.record.stage, "published");
  assert.equal(publish.record.version, 4);
  assert.equal(publish.record.published_by, "boss-per");
  assert.deepEqual(
    publish.record.audit_log.map((event) => event.action),
    ["submit_review", "record_qa", "publish"],
  );
});

test("Publish rejects stale versions and non-publisher roles", () => {
  const review = executeKnowledgeCommand(
    draft(),
    { action: KNOWLEDGE_ACTION.SUBMIT_REVIEW },
    context(REVIEWER),
  ).record;
  const qa = executeKnowledgeCommand(
    review,
    { action: KNOWLEDGE_ACTION.RECORD_QA, qa: passingQa() },
    context(REVIEWER),
  ).record;

  assert.throws(
    () => executeKnowledgeCommand(
      qa,
      { action: KNOWLEDGE_ACTION.PUBLISH },
      context(PUBLISHER, 2),
    ),
    (error) => error.code === "version_conflict",
  );
  assert.throws(
    () => executeKnowledgeCommand(
      qa,
      { action: KNOWLEDGE_ACTION.PUBLISH },
      context(REVIEWER),
    ),
    (error) => error.code === "publisher_role_required",
  );
});

test("unsafe customer copy fails QA", () => {
  const result = runKnowledgeQa(
    draft({ approved_answer: "Payment Successful — verified by Admin" }),
    passingQa(),
  );
  assert.equal(result.pass, false);
  assert.ok(result.errors.some((item) => item.code === "unsafe_customer_copy"));
});

test("customer projection is available only after Publish and strips internal fields", () => {
  assert.throws(
    () => toCustomerSafeKnowledge(draft()),
    (error) => error.code === "published_record_required",
  );

  const published = draft({
    stage: "published",
    version: 4,
    internal_instruction: "Never expose this",
    audit_log: [{ action: "publish" }],
  });
  const output = toCustomerSafeKnowledge(published);
  assert.equal(output.version, 4);
  assert.equal(output.answer, published.approved_answer);
  assert.equal("internal_instruction" in output, false);
  assert.equal("audit_log" in output, false);
});
