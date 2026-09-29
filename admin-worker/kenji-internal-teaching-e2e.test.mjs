import assert from "node:assert/strict";
import test from "node:test";

import {
  rankKenjiKnowledgeForInternalDraft,
} from "./src/kenji-knowledge-runtime.js";
import {
  KNOWLEDGE_ACTION,
  executeKnowledgeCommand,
} from "./src/kenji-knowledge-publish-contract.js";

const CUSTOMER_TURN = {
  role: "customer",
  content: "เอาคนเดิมที่คุยไว้ครับ",
  occurred_at: "2026-09-29T10:00:00.000Z",
  evidence: "customer_received",
};

const CORRECTED_ANSWER = "ได้ครับ เดี๋ยวผมต่อจากคนเดิมที่คุยไว้ โดยเช็กบริบทล่าสุดก่อนตอบต่อครับ";
const PREVIOUS_ANSWER = "ครับ คนเดิมที่คุยไว้";

function correctionPayload() {
  return {
    single_owner: {
      mode: "correction",
      sample_question: CUSTOMER_TURN.content,
      operator: "Per",
      workflow: "teach_summary_publish",
    },
    per_correction: {
      customer_example: CUSTOMER_TURN.content,
      previous_answer: PREVIOUS_ANSWER,
      corrected_answer: CORRECTED_ANSWER,
      correction_reason: "ให้ต่อบริบท แต่ไม่เดาสถานะสด",
      learning_rule: "prefer_current_owner_correction_when_context_matches",
      protected_truth_override: false,
    },
  };
}

function contractRecord() {
  return {
    knowledge_id: "kenji_internal_e2e_per_correction",
    title: "Per Correction · คนเดิม",
    category: "general",
    language: "th",
    approved_answer: CORRECTED_ANSWER,
    allowed_audience: ["Guest", "Standard", "Premium"],
    source: "/internal/admin/kenji",
    owner: "Boss Per",
    risk_level: "medium",
    stage: "draft",
    version: 1,
    qa_snapshot: null,
    audit_log: [],
  };
}

function publishedCard(published) {
  return {
    id: "kenji_internal_e2e_per_correction",
    knowledge_id: "kenji_internal_e2e_per_correction",
    title: "Per Correction · คนเดิม",
    category: "general",
    language: "th",
    customer_answer: CORRECTED_ANSWER,
    answer: CORRECTED_ANSWER,
    internal_instruction: "Owner correction; live truth still wins.",
    allowed_channels: ["Admin Console", "LINE_OFC"],
    allowed_audience: ["Guest", "Standard", "Premium"],
    response_mode: "auto_reply_allowed",
    risk_level: "medium",
    status: "active",
    workflow_stage: published.record.stage,
    workflow_version: published.record.version,
    source_path: "/internal/admin/kenji",
    source_ref: "single-owner-friendly-v5:per-correction",
    payload_json: {
      ...correctionPayload(),
      workflow: {
        stage: published.record.stage,
        version: published.record.version,
        qa_snapshot: published.record.qa_snapshot,
        audit_log: published.record.audit_log,
      },
    },
    workflow_updated_at: published.record.updated_at,
  };
}

test("Internal Kenji Teaching E2E keeps a correction unavailable before Publish", () => {
  const draftCard = {
    ...publishedCard({
      record: {
        stage: "draft",
        version: 1,
        qa_snapshot: null,
        audit_log: [],
        updated_at: "2026-09-29T10:01:00.000Z",
      },
    }),
    status: "draft",
    workflow_stage: "draft",
  };

  const matches = rankKenjiKnowledgeForInternalDraft([draftCard], {
    query: CUSTOMER_TURN.content,
  });
  assert.deepEqual(matches, []);
});

test("Internal Kenji Teaching E2E: bounded turn -> Per Correction -> Review -> QA -> Publish -> next internal retrieval", () => {
  const actor = { id: "Boss Per", role: "owner" };
  const review = executeKnowledgeCommand(
    contractRecord(),
    { action: KNOWLEDGE_ACTION.SUBMIT_REVIEW },
    { actor, expectedVersion: 1, now: "2026-09-29T10:02:00.000Z" },
  );
  assert.equal(review.record.stage, "review");

  const qa = executeKnowledgeCommand(
    review.record,
    {
      action: KNOWLEDGE_ACTION.RECORD_QA,
      qa: {
        privacy_checked: true,
        policy_path_match: true,
        sample_question: CUSTOMER_TURN.content,
        blocked_information: ["payment_truth", "membership_truth", "availability_truth", "private_notes"],
        checked_at: "2026-09-29T10:03:00.000Z",
        channel: "internal_admin",
        audience: "internal",
      },
    },
    { actor, expectedVersion: 1, now: "2026-09-29T10:03:00.000Z" },
  );
  assert.equal(qa.record.stage, "qa_passed");
  assert.equal(qa.record.qa_snapshot.pass, true);

  const publish = executeKnowledgeCommand(
    qa.record,
    { action: KNOWLEDGE_ACTION.PUBLISH },
    { actor, expectedVersion: 1, now: "2026-09-29T10:04:00.000Z" },
  );
  assert.equal(publish.record.stage, "published");
  assert.equal(publish.record.version, 2);

  const generic = {
    knowledge_id: "kenji_generic_continuity",
    title: "Generic continuity",
    category: "general",
    language: "th",
    customer_answer: "ได้ครับ ผมช่วยดูเรื่องเดิมให้ได้",
    status: "active",
    workflow_stage: "published",
    workflow_version: 4,
    risk_level: "medium",
    payload_json: { workflow: { stage: "published", version: 4 } },
    workflow_updated_at: "2026-09-29T09:00:00.000Z",
  };

  const matches = rankKenjiKnowledgeForInternalDraft(
    [generic, publishedCard(publish)],
    { query: CUSTOMER_TURN.content, limit: 6 },
  );

  assert.equal(matches[0].knowledge_id, "kenji_internal_e2e_per_correction");
  assert.equal(matches[0].customer_answer, CORRECTED_ANSWER);
  assert.equal(matches[0].match_reason, "published_per_correction");
  assert.equal(matches[0].owner_correction, true);
  assert.equal(matches[0].correction_policy, "prefer_current_owner_correction_when_context_matches");
  assert.equal(matches[0].protected_truth_override, false);
  assert.equal(matches[0].context_only, true);
  assert.equal(matches[0].live_truth_wins, true);
  assert.equal(matches[0].customer_delivery_allowed, false);
  assert.ok(matches[0].score > (matches[1]?.score || 0));

  const serialized = JSON.stringify(matches);
  assert.doesNotMatch(serialized, new RegExp(PREVIOUS_ANSWER));
  assert.doesNotMatch(serialized, /correction_reason|previous_answer/);
});

test("published protected-domain Per Correction is retrievable internally but still requires live truth", () => {
  const protectedCorrection = {
    ...publishedCard({
      record: {
        stage: "published",
        version: 2,
        qa_snapshot: { pass: true, version: 1 },
        audit_log: [],
        updated_at: "2026-09-29T10:04:00.000Z",
      },
    }),
    category: "payment",
    risk_level: "critical",
    customer_answer: "รับหลักฐานแล้วครับ เดี๋ยวให้ Money Truth ตรวจสถานะล่าสุดก่อนยืนยัน",
    payload_json: {
      ...correctionPayload(),
      per_correction: {
        ...correctionPayload().per_correction,
        corrected_answer: "รับหลักฐานแล้วครับ เดี๋ยวให้ Money Truth ตรวจสถานะล่าสุดก่อนยืนยัน",
      },
      workflow: { stage: "published", version: 2 },
    },
  };

  const match = rankKenjiKnowledgeForInternalDraft([protectedCorrection], {
    query: CUSTOMER_TURN.content,
    category: "payment",
  })[0];

  assert.equal(match.owner_correction, true);
  assert.equal(match.requires_live_truth, true);
  assert.equal(match.customer_delivery_allowed, false);
  assert.equal(match.protected_truth_override, false);
});
