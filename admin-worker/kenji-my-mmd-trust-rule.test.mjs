import test from "node:test";
import assert from "node:assert/strict";

import { handleKenjiKnowledgeRequest } from "./src/kenji-knowledge-runtime.js";

test("Kenji internal knowledge exposes the canonical MY MMD Trust Rule", async () => {
  const request = new Request(
    "https://mmdbkk.com/v1/admin/kenji/knowledge/list?q=kenji_20_012_my_mmd_trust_rule",
    { method: "GET" },
  );
  const response = await handleKenjiKnowledgeRequest(request, {}, {
    isAuthed: async () => true,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  const card = body.cards.find((item) => item.id === "kenji_20_012_my_mmd_trust_rule");
  assert.ok(card);
  assert.equal(card.status, "active");
  assert.equal(card.risk_level, "critical");
  assert.equal(card.response_mode, "handoff_required");
  assert.equal(card.source_path, "docs/architecture/MY_MMD_TRUST_RULE_V1.md");
  assert.match(card.internal_instruction, /Verified LINE \+ protected\/canonical evidence never resolves to Guest/);
  assert.match(card.internal_instruction, /reconciled = terminal complete/);
  assert.match(card.internal_instruction, /review_required = terminal with bounded manual review/);
  assert.match(card.internal_instruction, /durable first-connect \+2y active-through/);
  assert.match(card.internal_instruction, /temporary 0 MUST NOT be finalized/);
  assert.match(card.internal_instruction, /\/internal\/admin\/my-mmd\/recovery/);
  assert.match(card.internal_instruction, /instead of repeated customer E2E/);
  assert.doesNotMatch(card.customer_answer, /\/internal\/admin\/my-mmd\/recovery/);
});

test("MY MMD Trust Rule remains internal and is not added to public static knowledge", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("./src/kenji-public-knowledge-runtime.js", import.meta.url), "utf8")
  );
  assert.doesNotMatch(source, /kenji_20_012_my_mmd_trust_rule/);
});
