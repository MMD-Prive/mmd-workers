import test from "node:test";
import assert from "node:assert/strict";
import {
  KENJI_CANONICAL_BRAIN_VERSION,
  KENJI_CANONICAL_VOICE_IDS,
  buildKenjiCanonicalVoiceDirective,
  canonicalBrainLayers,
  canonicalPerVoiceCard,
  detectKenjiCanonicalLanguage,
  factualKnowledgeCards,
  isCanonicalPerVoiceCard,
} from "../src/kenji-canonical-brain.mjs";
import {
  KENJI_CANONICAL_PUBLISHED_KNOWLEDGE_PATH,
  fetchKenjiCanonicalPublishedKnowledge,
} from "../src/kenji-canonical-knowledge-runtime.mjs";

test("canonical brain keeps TH EN ZH as first-class Per Voice languages", () => {
  assert.equal(detectKenjiCanonicalLanguage("ขอคัดนายแบบให้หน่อย"), "th");
  assert.equal(detectKenjiCanonicalLanguage("Can you help me with this?"), "en");
  assert.equal(detectKenjiCanonicalLanguage("可以帮我看看吗？"), "zh");
  assert.match(buildKenjiCanonicalVoiceDirective("ขอคัดให้หน่อย"), /Jotform \/ Per AI corpus/);
  assert.match(buildKenjiCanonicalVoiceDirective("Can you help?"), /Canonical Per Voice language: English/);
  assert.match(buildKenjiCanonicalVoiceDirective("可以帮我看看吗？"), /Simplified Chinese/);
  assert.equal(KENJI_CANONICAL_BRAIN_VERSION, "kenji-canonical-brain-v1-20260929");
});

test("voice cards are instruction-only and excluded from factual grounding", () => {
  const voice = {
    knowledge_id: KENJI_CANONICAL_VOICE_IDS.th,
    category: "jotform",
    payload_json: { kind: "canonical_voice_corpus" },
    internal_instruction: "voice only",
  };
  const fact = { knowledge_id: "kenji_20_006_payment_proof", category: "payment", customer_answer: "fact" };
  assert.equal(isCanonicalPerVoiceCard(voice), true);
  assert.equal(canonicalPerVoiceCard([fact, voice], "th"), voice);
  assert.deepEqual(factualKnowledgeCards([voice, fact]), [fact]);
  assert.deepEqual(canonicalBrainLayers(), [
    "canonical_per_voice",
    "published_knowledge",
    "customer_memory",
    "live_truth",
    "authority_guard",
    "reasoning",
    "per_voice_renderer",
    "delivery_gate",
  ]);
});

test("canonical published knowledge reads through admin-worker service binding", async () => {
  const calls = [];
  const env = {
    INTERNAL_TOKEN: "internal-token",
    ADMIN_WORKER: {
      fetch: async (request) => {
        calls.push(request);
        return new Response(JSON.stringify({ ok: true, data_status: "live", cards: [{ knowledge_id: "k1" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  };
  const out = await fetchKenjiCanonicalPublishedKnowledge(env);
  assert.equal(out.ok, true);
  assert.equal(out.source, "admin-worker");
  assert.deepEqual(out.cards, [{ knowledge_id: "k1" }]);
  assert.equal(new URL(calls[0].url).pathname, KENJI_CANONICAL_PUBLISHED_KNOWLEDGE_PATH);
  assert.equal(calls[0].headers.get("authorization"), "Bearer internal-token");
});

test("canonical published knowledge fails closed when the binding is unavailable", async () => {
  assert.deepEqual(await fetchKenjiCanonicalPublishedKnowledge({}, {}), {
    ok: false,
    source: "unavailable",
    cards: [],
  });
});
