import assert from "node:assert/strict";
import test from "node:test";

import { generateKenjiModelReply, guardKenjiModelOutput } from "../src/kenji-model-policy.js";
import { isApprovedLineModelKnowledge, selectApprovedLineModelKnowledge } from "../src/kenji-knowledge-policy.js";

const unsafeProgression = [
  "ไปต่อได้เลยครับ", "ดำเนินการต่อได้เลยครับ", "ทำขั้นตอนต่อไปได้เลย", "ไปขั้นถัดไปได้ครับ", "ไปขั้นตอนถัดไปได้เลย",
  "ผ่านไปขั้นต่อไปได้ครับ", "เดินหน้าต่อได้เลย", "ใช้งานต่อได้เลยครับ", "ใช้ต่อได้เลย", "เริ่มใช้ได้เลยครับ",
  "เข้าใช้งานได้เลย", "ทำรายการต่อได้เลย", "กดต่อได้เลยครับ", "ยื่นต่อได้เลย", "ไม่มีปัญหา ไปต่อได้เลย",
  "you may proceed", "please proceed now", "you can continue", "continue to the next step", "continue to the next stage",
  "you're clear to proceed", "everything is fine, continue", "everything is okay; you can continue", "you can move forward", "you can move forward now",
  "go ahead now", "you can go ahead", "proceed to the next step", "you may proceed now", "you're good to continue",
  "โอเคครับ you may proceed", "ไม่มีปัญหา you can continue",
];

test("compositional progression authority blocks at least 30 novel Thai English and mixed variants", () => {
  assert.ok(unsafeProgression.length >= 30);
  for (const answer of unsafeProgression) {
    const result = guardKenjiModelOutput(answer);
    assert.equal(result.ok, false, answer);
    assert.equal(result.reason, "untrusted_semantic_finality", answer);
  }
});

test("conversation continuation remains allowed", () => {
  const safe = [
    "เล่าต่อได้เลยครับ", "ถ้าอยากเล่าต่อ ผมฟังอยู่ครับ", "อธิบายต่อได้เลยครับ", "บอกเพิ่มได้เลยครับ", "แชร์ต่อได้เลยครับ",
    "คุยต่อได้ครับ", "ถามต่อได้เลยครับ", "ผมอยากฟังต่อครับ", "you can keep telling me what happened", "feel free to explain more",
    "continue telling me what happened", "keep sharing if that helps",
  ];
  assert.ok(safe.length >= 10);
  for (const answer of safe) assert.equal(guardKenjiModelOutput(answer).ok, true, answer);
});

test("safe conversation wording cannot mask a second progression claim", () => {
  for (const answer of ["เล่าต่อได้เลยครับ แล้วคุณไปขั้นตอนถัดไปได้เลย", "feel free to explain more; you may proceed now"]) {
    assert.equal(guardKenjiModelOutput(answer).ok, false, answer);
  }
});

test("false-safe structured metadata cannot carry progression authority prose", async () => {
  for (const answer of unsafeProgression.slice(0, 8)) {
    const result = await generateKenjiModelReply({
      capability: "safe_conversation",
      text: "ช่วยตอบหน่อย",
      env: { OPENAI_API_KEY: "test-key" },
      fetchImpl: async () => new Response(JSON.stringify({
        status: "completed",
        output_text: JSON.stringify({ response_kind: "conversation", capability: "safe_conversation", requested_domain: "none", authority_domains: [], requires_truth: false, answer }),
      }), { status: 200 }),
    });
    assert.equal(result.success, false, answer);
    assert.equal(result.guard_reason, "untrusted_semantic_finality", answer);
  }
});

const NOW = Date.parse("2026-08-21T12:00:00Z");
const valid = {
  knowledge_id: "public-safe-1", title: "Customer guide", category: "service_guide", source_path: "/guide",
  customer_answer: "ข้อมูลบริการทั่วไปสำหรับลูกค้าครับ", status: "active", response_mode: "auto_reply_allowed",
  allowed_channels: ["LINE_OFC"], risk_level: "medium", effective_from: "2026-08-20T00:00:00Z",
};

test("knowledge grounding fails closed on every required safety dimension", () => {
  const approved = new Set([valid.knowledge_id]);
  assert.equal(isApprovedLineModelKnowledge(valid, NOW, approved), true);
  const rejected = [
    { ...valid, risk_level: "high" }, { ...valid, risk_level: "" }, { ...valid, effective_from: "2026-09-01" },
    { ...valid, effective_from: "not-a-date" }, { ...valid, expires_at: "2026-08-20" }, { ...valid, superseded: true },
    { ...valid, superseded_by: "new-card" }, { ...valid, title: "internal admin guide" }, { ...valid, status: "draft" },
    { ...valid, response_mode: "handoff_required" }, { ...valid, allowed_channels: ["Webflow"] }, { ...valid, customer_answer: "" },
  ];
  for (const card of rejected) assert.equal(isApprovedLineModelKnowledge(card, NOW, approved), false, JSON.stringify(card));
  assert.equal(isApprovedLineModelKnowledge(valid, NOW, new Set()), false, "missing explicit public-safe allowlist");
});

test("newest approved version replaces an older card with the same authoritative ID", () => {
  const older = { ...valid, customer_answer: "old", effective_from: "2026-08-01" };
  const newest = { ...valid, customer_answer: "new", effective_from: "2026-08-20" };
  assert.deepEqual(selectApprovedLineModelKnowledge([older, newest], { now: NOW, approvedIds: [valid.knowledge_id] }), [newest]);
});
