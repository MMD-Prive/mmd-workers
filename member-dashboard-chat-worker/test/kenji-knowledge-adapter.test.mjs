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
    KENJI_KNOWLEDGE_BASE_URL: "https://admin-worker.test",
    KENJI_KNOWLEDGE_INTERNAL_TOKEN: "internal-test-token",
    KENJI_KNOWLEDGE_CACHE_TTL_MS: "1",
    ...overrides,
  };
}

function publishedCard(overrides = {}) {
  return {
    id: "card-renewal",
    title: "Renewal next step",
    lane: "Renewal",
    audience: "member",
    language: "th",
    customer_question_examples: ["ต่ออายุสมาชิกต้องทำยังไง", "Kenji AI ต่ออายุ"],
    kenji_safe_answer: "ต่ออายุได้ครับ แต่สถานะจริงต้องรอระบบ MMD ตรวจสอบและยืนยันก่อนนะครับ",
    related_routes: ["/sigil/pay/renewal"],
    status: "published",
    ...overrides,
  };
}

test("feature flags and allowlist must both be enabled", () => {
  assert.equal(isKenjiKnowledgeEnabled(env()), true);
  assert.equal(isKenjiKnowledgeEnabled(env({ LINE_KENJI_AI_ENABLED: "false" })), false);
  assert.equal(isKenjiKnowledgeEnabled(env({ LINE_KENJI_KNOWLEDGE_ENABLED: "false" })), false);
  assert.equal(isLineUserAllowlisted(env(), LINE_USER_ID), true);
  assert.equal(isLineUserAllowlisted(env(), "Uother"), false);
});

test("normalizes text and detects language", () => {
  assert.equal(normalizeKnowledgeText("Kenji_AI ต่ออายุ!!!"), "kenji ai ต่ออายุ");
  assert.equal(detectMessageLanguage("ต่ออายุ"), "th");
  assert.equal(detectMessageLanguage("renewal"), "en");
  assert.equal(detectMessageLanguage("123"), "unknown");
});

test("fetchPublishedKenjiKnowledge reads internal published endpoint only", async () => {
  const calls = [];
  const cards = [publishedCard()];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, cards }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await fetchPublishedKenjiKnowledge(env(), fetchImpl);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://admin-worker.test/v1/internal/kenji/knowledge/published");
  assert.equal(calls[0].init.method, "GET");
  assert.match(calls[0].init.headers.Authorization, /^Bearer /);
  assert.deepEqual(result, cards);
});

test("fetchPublishedKenjiKnowledge fails closed", async () => {
  assert.deepEqual(await fetchPublishedKenjiKnowledge(env({ KENJI_KNOWLEDGE_BASE_URL: "" }), async () => {
    throw new Error("must_not_fetch");
  }), []);
  assert.deepEqual(await fetchPublishedKenjiKnowledge(env(), async () => new Response("no", { status: 500 })), []);
});

test("scores and selects matching safe published card", () => {
  const renewal = publishedCard();
  const payment = publishedCard({
    id: "card-payment",
    title: "Payment proof wait",
    lane: "Payment",
    customer_question_examples: ["ส่งสลิปแล้วต้องรอไหม"],
    kenji_safe_answer: "ได้รับหลักฐานแล้วครับ ต้องรอระบบ MMD ตรวจสอบยอดจริงก่อนนะครับ",
  });

  assert.equal(scoreKnowledgeCard("Kenji AI ต่ออายุสมาชิกต้องทำยังไง", renewal) >= 60, true);
  assert.equal(findBestKnowledgeCard("Kenji AI ส่งสลิปแล้วต้องรอไหม", [renewal, payment])?.id, "card-payment");
  assert.equal(findBestKnowledgeCard("Kenji AI เรื่องที่ไม่มีในคลัง", [renewal, payment]), null);
});

test("unsafe answers fall back and unsafe routes are stripped", () => {
  assert.equal(isSafeKenjiKnowledgeAnswer("payment confirmed"), false);
  assert.equal(isSafeKenjiKnowledgeAnswer("ตอบแบบปลอดภัย"), true);
  assert.equal(buildKenjiKnowledgeReply("payment", publishedCard({ kenji_safe_answer: "payment confirmed" })), "ผมช่วยอธิบายขั้นตอนเบื้องต้นให้ได้ครับ แต่เคสนี้ต้องให้ MMD ตรวจจากระบบทางการก่อนนะครับ");
  assert.equal(buildKenjiKnowledgeReply("renewal", publishedCard({ related_routes: ["/internal/private", "/sigil/pay/renewal"] })), "ต่ออายุได้ครับ แต่สถานะจริงต้องรอระบบ MMD ตรวจสอบและยืนยันก่อนนะครับ\n\nต่อได้ที่: /sigil/pay/renewal");
});

test("maybeBuildKenjiKnowledgeReply is controlled mode only", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ ok: true, cards: [publishedCard()] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  assert.equal(await maybeBuildKenjiKnowledgeReply({
    env: env(),
    userId: LINE_USER_ID,
    messageText: "Kenji AI ต่ออายุสมาชิกต้องทำยังไง",
    fetchImpl,
  }), "ต่ออายุได้ครับ แต่สถานะจริงต้องรอระบบ MMD ตรวจสอบและยืนยันก่อนนะครับ\n\nต่อได้ที่: /sigil/pay/renewal");

  assert.equal(await maybeBuildKenjiKnowledgeReply({ env: env(), userId: "Uother", messageText: "Kenji AI ต่ออายุ", fetchImpl }), null);
  assert.equal(await maybeBuildKenjiKnowledgeReply({ env: env({ LINE_KENJI_KNOWLEDGE_DRY_RUN: "true" }), userId: LINE_USER_ID, messageText: "Kenji AI ต่ออายุ", fetchImpl }), null);
  assert.equal(await maybeBuildKenjiKnowledgeReply({ env: env(), userId: LINE_USER_ID, messageText: "Kenji", fetchImpl }), null);
});
