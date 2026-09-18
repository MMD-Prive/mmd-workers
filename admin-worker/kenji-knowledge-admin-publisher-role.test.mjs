import assert from "node:assert/strict";
import test from "node:test";

import {
  KNOWLEDGE_ACTION,
  KnowledgeContractError,
  executeKnowledgeCommand,
} from "./src/kenji-knowledge-publish-contract.js";

const NOW = "2026-09-07T09:55:00.000Z";

function qaPassed() {
  return {
    knowledge_id: "kenji_seed_v1_test_admin_publish",
    title: "Admin owner session publish contract",
    category: "admin_policy",
    language: "th",
    approved_answer: "ส่งต่อให้ MMD ตรวจตามสถานะจริงครับ",
    allowed_audience: ["Guest"],
    source: "GitHub controlled publication test",
    owner: "Per",
    risk_level: "low",
    stage: "qa_passed",
    version: 1,
    qa_snapshot: {
      pass: true,
      version: 1,
      checked_at: NOW,
      channel: "LINE_OFC",
      audience: "customer",
      warnings: [],
    },
    audit_log: [
      { action: "submit_review" },
      { action: "record_qa" },
    ],
  };
}

test("trusted credential-bound admin role may publish after fresh QA", () => {
  const result = executeKnowledgeCommand(
    qaPassed(),
    { action: KNOWLEDGE_ACTION.PUBLISH },
    {
      actor: { id: "per", role: "admin" },
      expectedVersion: 1,
      now: NOW,
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.record.stage, "published");
  assert.equal(result.record.version, 2);
  assert.equal(result.record.published_by, "per");
  assert.equal(result.event.actor_role, "admin");
  assert.equal(result.event.action, "publish");
});

test("reviewer still cannot publish", () => {
  assert.throws(
    () => executeKnowledgeCommand(
      qaPassed(),
      { action: KNOWLEDGE_ACTION.PUBLISH },
      {
        actor: { id: "reviewer", role: "reviewer" },
        expectedVersion: 1,
        now: NOW,
      },
    ),
    (error) => error instanceof KnowledgeContractError &&
      error.code === "publisher_role_required" &&
      error.status === 403,
  );
});
