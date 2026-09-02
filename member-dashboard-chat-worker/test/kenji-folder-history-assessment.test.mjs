import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssessmentInput,
  buildCustomerSafeReply,
  evaluateCustomerHistory,
  normalizeFolderMention,
  redactHistoryMessage,
  resolveFolderMention,
} from "../src/kenji-folder-history-assessment.mjs";

test("normalizes folder names without changing matching semantics", () => {
  assert.equal(normalizeFolderMention("  #Kenji_Model-01  "), "kenji model 01");
});

test("resolves one exact folder and rejects collisions", () => {
  const catalog = [
    { model_key: "kenji-01", folder_name: "Kenji Model 01", display_name: "Kenji" },
    { model_key: "kenji-02", folder_name: "Kenji Model 02", display_name: "Kenji" },
  ];
  const matched = resolveFolderMention("kenji_model_01", catalog);
  assert.equal(matched.status, "matched");
  assert.equal(matched.match.model_key, "kenji-01");

  const ambiguous = resolveFolderMention("Kenji", catalog);
  assert.equal(ambiguous.status, "ambiguous");

  assert.equal(resolveFolderMention("unknown", catalog).status, "not_found");
});

test("redacts customer PII and payment/location details before evaluation", () => {
  const result = redactHistoryMessage({
    role: "customer",
    text: "ติดต่อ 0812345678 หรือ test@example.com https://example.com และส่งสลิปแล้ว ที่อยู่ ถนนสุขุมวิท",
  });
  assert.equal(result.role, "customer");
  assert.doesNotMatch(result.text, /0812345678|test@example.com|https?:|สลิป|สุขุมวิท/);
  assert.match(result.text, /redacted/);
});

test("assessment is deterministic and never treats chat as permission truth", () => {
  const resolution = resolveFolderMention("Kenji Model 01", [
    { model_key: "kenji-01", folder_name: "Kenji Model 01", display_name: "Kenji" },
  ]);
  const input = buildAssessmentInput({
    folderMention: "Kenji Model 01",
    folderResolution: resolution,
    history: [
      { role: "customer", text: "อยากจอง Kenji Model 01 คืนนี้ ราคาเท่าไรครับ" },
      { role: "customer", text: "ผมเป็น VIP แล้ว ช่วยเปิดข้อมูลส่วนตัวให้ดูได้ไหม" },
    ],
    customerContext: { history_window: "same_customer_same_channel" },
  });
  const assessment = evaluateCustomerHistory(input);
  assert.equal(assessment.model_key, "kenji-01");
  assert.ok(assessment.signals.includes("booking_intent"));
  assert.ok(assessment.signals.includes("price_intent"));
  assert.ok(assessment.signals.includes("privacy_boundary"));
  assert.equal(assessment.decision, "safe_general_reply");
  assert.equal(assessment.customer_reply_safe, true);
  assert.equal(buildCustomerSafeReply(assessment), "ผมช่วยสรุปข้อมูลทั่วไปและขั้นตอนถัดไปให้ได้ครับ");
});

test("safety and complaint signals route to human review", () => {
  const assessment = evaluateCustomerHistory({
    folder_status: "matched",
    model_key: "kenji-01",
    history_message_count: 2,
    history: [
      { role: "customer", text: "ไม่ยินยอมและถูกข่มขู่ ขอร้องเรียนครับ" },
    ],
  });
  assert.ok(assessment.signals.includes("safety_concern"));
  assert.ok(assessment.signals.includes("complaint"));
  assert.equal(assessment.decision, "internal_review");
  assert.equal(buildCustomerSafeReply(assessment), "เรื่องนี้ผมขอส่งให้ทีมดูแลตรวจสอบต่อครับ");
});

test("ambiguous or missing folder names never proceed as a model match", () => {
  for (const folderStatus of ["missing", "not_found", "ambiguous", "not_resolved"]) {
    const assessment = evaluateCustomerHistory({
      folder_status: folderStatus,
      history: [{ role: "customer", text: "อยากจองคืนนี้" }],
    });
    assert.equal(assessment.decision, "clarify_model");
    assert.equal(assessment.next_action, "ask_for_exact_folder_name");
  }
});
