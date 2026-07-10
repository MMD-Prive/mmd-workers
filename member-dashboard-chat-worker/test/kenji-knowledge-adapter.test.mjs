import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKenjiKnowledgeReply,
  detectMessageLanguage,
  fetchPublishedKenjiKnowledge,
  findBestKnowledgeCard,
  isKenjiKnowledgeEnabled,
  isLineUserAllowlisted,
  isSafeKenjiKnowledgeAnswer,
  maybeBuildKenjiKnowledgeReply,
  normalizeKnowledgeText,
  scoreKnowledgeCard,
} from "../src/kenji-knowledge-adapter.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";

function env(overrides = {}) {
  return {
    LINE_KENJI_AI_ENABLED: "true",
    LINE_KENJI_KNOWLEDGE_ENABLED: "true",
    LINE_KENJI_KNOWLEDGE_ALLOWLIST: LINE_USER_ID,
    KENJI_KNOWLEDGE_BASE_URL: `https://admin-worker.test/${Math.random().toString(36).slice(2)}`,
    KENJI_KNOWLEDGE_INTERNAL_TOKEN: "internal-test-token",
    KENJI_KNOWLEDGE_CACHE_TTL_MS: "1",
    ...overrides,
  };
}

function paymentCard(overrides = {}) {
  return {
    id: "card-payment",
    title: "ส่งสลิปแล้วต้องรอไหม",
    lane: "Payment",
    audience: "public_member",
    language: "th",
    customer_question_examples: ["ส่งสลิปแล้วต้องรอไหม", "โอนแล้วต้องรอระบบตรวจไหม"],
    kenji_safe_answer: "ได้รับหลักฐานแล้วครับ MMD ต้องตรวจจากระบบทางการก่อนอัปเดตสถานะนะครับ",
    related_routes: ["/confirm/payment-confirmation"],
    status: "published",
    ...overrides,
  };
}

function fetchWithCards(cards, options = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (options.reject) throw new Error("network_down");
    if (options.malformed) return new Response("{bad json", { status: 200 });
    return new Response(JSON.stringify({ ok: true, cards }), {
      status: options.status || 200,
      headers: { "content-type": "application/json" },
    });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test("feature flag off returns null and existing behavior can continue", async () => {
  const fetchImpl = fetchWithCards([paymentCard()]);
  const reply = await maybeBuildKenjiKnowledgeReply({
    env: env({ LINE_KENJI_AI_ENABLED: "false" }),
    userId: LINE_USER_ID,
    messageText: "Kenji AI ส่งสลิปแล้วต้องรอไหม",
    fetchImpl,
  });
  assert.equal(reply, null);
  assert.equal(fetchImpl.calls.length, 0);
});

test("knowledge flag off returns null", async () => {
  const fetchImpl = fetchWithCards([paymentCard()]);
  const reply = await maybeBuildKenjiKnowledgeReply({
    env: env({ LINE_KENJI_KNOWLEDGE_ENABLED: "false" }),
    userId: LINE_USER_ID,
    messageText: "Kenji AI ส่งสลิปแล้วต้องรอไหม",
    fetchImpl,
  });
  assert.equal(reply, null);
  assert.equal(fetchImpl.calls.length, 0);
});

test("user not allowlisted returns null", async () => {
  const fetchImpl = fetchWithCards([paymentCard()]);
  const reply = await maybeBuildKenjiKnowledgeReply({
    env: env(),
    userId: "Uffffffffffffffffffffffffffffffff",
    messageText: "Kenji AI ส่งสลิปแล้วต้องรอไหม",
    fetchImpl,
  });
  assert.equal(reply, null);
  assert.equal(fetchImpl.calls.length, 0);
});

test("allowlisted user with trigger and matching Payment card returns safe answer", async () => {
  const fetchImpl = fetchWithCards([paymentCard()]);
  const reply = await maybeBuildKenjiKnowledgeReply({
    env: env(),
    userId: LINE_USER_ID,
    messageText: "Kenji AI ส่งสลิปแล้วต้องรอไหม",
    fetchImpl,
  });
  assert.match(reply, /ได้รับหลักฐานแล้วครับ/);
  assert.match(reply, /\/confirm\/payment-confirmation/);
});

test("message with only trigger returns null so scripted intro can continue", async () => {
  const fetchImpl = fetchWithCards([paymentCard()]);
  const reply = await maybeBuildKenjiKnowledgeReply({
    env: env(),
    userId: LINE_USER_ID,
    messageText: "Kenji AI",
    fetchImpl,
  });
  assert.equal(reply, null);
  assert.equal(fetchImpl.calls.length, 0);
});

test("fetch failure returns null and does not crash", async () => {
  const reply = await maybeBuildKenjiKnowledgeReply({
    env: env(),
    userId: LINE_USER_ID,
    messageText: "Kenji AI ส่งสลิปแล้วต้องรอไหม",
    fetchImpl: fetchWithCards([], { reject: true }),
  });
  assert.equal(reply, null);
});

test("malformed published response returns null", async () => {
  const reply = await maybeBuildKenjiKnowledgeReply({
    env: env(),
    userId: LINE_USER_ID,
    messageText: "Kenji AI ส่งสลิปแล้วต้องรอไหม",
    fetchImpl: fetchWithCards([], { malformed: true }),
  });
  assert.equal(reply, null);
});

test("draft review and archived cards are ignored if included", async () => {
  const cards = [
    paymentCard({ id: "draft-card", status: "draft" }),
    paymentCard({ id: "review-card", status: "review" }),
    paymentCard({ id: "archived-card", status: "archived" }),
  ];
  const reply = await maybeBuildKenjiKnowledgeReply({
    env: env(),
    userId: LINE_USER_ID,
    messageText: "Kenji AI ส่งสลิปแล้วต้องรอไหม",
    fetchImpl: fetchWithCards(cards),
  });
  assert.equal(reply, null);
});

test("internal_only card is ignored", async () => {
  const reply = await maybeBuildKenjiKnowledgeReply({
    env: env(),
    userId: LINE_USER_ID,
    messageText: "Kenji AI ส่งสลิปแล้วต้องรอไหม",
    fetchImpl: fetchWithCards([paymentCard({ audience: "internal_only" })]),
  });
  assert.equal(reply, null);
});

test("unsafe payment answer is rejected with safe fallback", () => {
  const reply = buildKenjiKnowledgeReply("Kenji AI ส่งสลิป", paymentCard({
    kenji_safe_answer: "ชำระสำเร็จแล้วครับ membership active แล้ว",
  }));
  assert.match(reply, /ต้องให้ MMD ตรวจจากระบบทางการ/);
  assert.doesNotMatch(reply, /ชำระสำเร็จ|membership active/i);
});

test("PII email answer is rejected", () => {
  assert.equal(isSafeKenjiKnowledgeAnswer("ติดต่อ client@example.com"), false);
});

test("low confidence match returns null", () => {
  const card = findBestKnowledgeCard("Kenji AI วันนี้อากาศดีไหม", [paymentCard()]);
  assert.equal(card, null);
});

test("adapter never calls mutation endpoints", async () => {
  const fetchImpl = fetchWithCards([paymentCard()]);
  await maybeBuildKenjiKnowledgeReply({
    env: env(),
    userId: LINE_USER_ID,
    messageText: "Kenji AI ส่งสลิปแล้วต้องรอไหม",
    fetchImpl,
  });
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].init.method, "GET");
  assert.match(fetchImpl.calls[0].url, /\/v1\/internal\/kenji\/knowledge\/published$/);
  assert.doesNotMatch(fetchImpl.calls[0].url, /\/(?:draft|publish|archive)(?:\/|$)|\/v1\/admin\//);
});

test("no secrets are printed in logs", async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const calls = [];
  console.log = (...args) => calls.push(args);
  console.error = (...args) => calls.push(args);
  try {
    await maybeBuildKenjiKnowledgeReply({
      env: env(),
      userId: LINE_USER_ID,
      messageText: "Kenji AI ส่งสลิปแล้วต้องรอไหม",
      fetchImpl: fetchWithCards([paymentCard()]),
    });
    assert.deepEqual(calls, []);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test("helpers normalize language and score deterministic matches", async () => {
  assert.equal(isKenjiKnowledgeEnabled(env()), true);
  assert.equal(isLineUserAllowlisted(env(), LINE_USER_ID), true);
  assert.equal(detectMessageLanguage("ส่งสลิป"), "th");
  assert.equal(detectMessageLanguage("payment slip"), "en");
  assert.equal(normalizeKnowledgeText(" Kenji-AI! "), "kenji ai");
  assert.ok(scoreKnowledgeCard("Kenji AI ส่งสลิปแล้วต้องรอไหม", paymentCard()) >= 60);

  const cards = await fetchPublishedKenjiKnowledge(env(), fetchWithCards([
    paymentCard({ status: "published" }),
    paymentCard({ id: "draft", status: "draft" }),
  ]));
  assert.equal(cards.length, 1);
});
