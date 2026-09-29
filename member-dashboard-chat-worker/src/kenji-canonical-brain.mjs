export const KENJI_CANONICAL_BRAIN_VERSION = "kenji-canonical-brain-v1-20260929";

export const KENJI_CANONICAL_VOICE_IDS = Object.freeze({
  th: "kenji_per_voice_jotform_th_v1",
  en: "kenji_per_voice_jotform_en_v1",
  zh: "kenji_per_voice_jotform_zh_v1",
});

export const KENJI_CANONICAL_VOICE_SOURCES = Object.freeze({
  th: Object.freeze(["Per_AI_UIPack_TH_EN.txt", "AI Per Master THEN.txt"]),
  en: Object.freeze(["Per_AI_UIPack_TH_EN.txt", "AI Per Master THEN.txt"]),
  zh: Object.freeze(["Per_AI_UIPack_ZH.txt", "Per_AI_MasterBrain_ZH.txt"]),
});

const THAI_RE = /[\u0E00-\u0E7F]/;
const HAN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF]/;

export function detectKenjiCanonicalLanguage(value = "") {
  const text = String(value ?? "");
  if (HAN_RE.test(text)) return "zh";
  if (THAI_RE.test(text)) return "th";
  return "en";
}

export function isCanonicalPerVoiceCard(card = {}) {
  const id = String(card?.knowledge_id || card?.id || "").trim();
  if (!Object.values(KENJI_CANONICAL_VOICE_IDS).includes(id)) return false;
  const payload = card?.payload_json && typeof card.payload_json === "object" ? card.payload_json : {};
  return payload.kind === "canonical_voice_corpus" || String(card?.category || "").toLowerCase() === "jotform";
}

export function canonicalPerVoiceCard(cards = [], language = "th") {
  const expected = KENJI_CANONICAL_VOICE_IDS[language] || KENJI_CANONICAL_VOICE_IDS.th;
  return (Array.isArray(cards) ? cards : []).find((card) => String(card?.knowledge_id || card?.id || "") === expected) || null;
}

export function factualKnowledgeCards(cards = []) {
  return (Array.isArray(cards) ? cards : []).filter((card) => !isCanonicalPerVoiceCard(card));
}

function thaiDirective() {
  return [
    "Canonical Per Voice language: Thai.",
    "Answer the customer's actual question first; normally use 1-2 short LINE lines.",
    "Use ครับ naturally. น้า may be used lightly to soften a request, never as a gimmick.",
    "For an existing conversation, continue naturally: no fresh welcome, no ceremonial self-introduction, no repeated brand intro.",
    "Do not use call-center Thai such as ทาง MMD, ขอเรียนแจ้ง, ดำเนินการ, or กรุณา.",
    "Natural English mixing is allowed only when it sounds like Per.",
    "Do not create a numbered menu unless the customer asked for options.",
    "If one missing fact blocks the answer, ask exactly one necessary clarification.",
  ].join("\n");
}

function englishDirective() {
  return [
    "Canonical Per Voice language: English.",
    "Be concise, warm, direct, discreet, premium, and human; normally use 1-2 short lines.",
    "Answer the question first. Continue existing conversations without a fresh welcome or self-introduction.",
    "Avoid call-center boilerplate, hard sell, over-explaining, and unsolicited numbered menus.",
    "Mirror the customer's register naturally rather than translating Thai phrasing literally.",
    "If one missing fact blocks the answer, ask exactly one necessary clarification.",
  ].join("\n");
}

function chineseDirective() {
  return [
    "Canonical Per Voice language: Simplified Chinese (ZH-CN).",
    "保持高级、克制、温和、直接和私密感；通常只用 1-2 个短句，并先回答用户真正的问题。",
    "已有对话自然续接，不重新欢迎，不重复自我介绍，不使用模板化客服语气。",
    "不要硬推销，不主动输出编号菜单；缺少必要信息时只问一个关键问题。",
    "保持 Per 的中文语气与节奏，不要把泰文客服句式逐字翻译成中文。",
  ].join("\n");
}

export function buildKenjiCanonicalVoiceDirective(value = "") {
  const language = detectKenjiCanonicalLanguage(value);
  const voice = language === "zh" ? chineseDirective() : language === "en" ? englishDirective() : thaiDirective();
  return [
    `Canonical Brain: ${KENJI_CANONICAL_BRAIN_VERSION}`,
    `Canonical voice source: Jotform / Per AI corpus (${KENJI_CANONICAL_VOICE_SOURCES[language].join(" + ")})`,
    voice,
    "Voice corpus is style/intake authority only. It never grants permission to auto-reply and never supplies current business truth.",
    "Current routes, prices, membership, payment, booking, access, availability, entitlement, approval, and protected state must come from current published knowledge or the owning live backend.",
  ].join("\n");
}

export function canonicalBrainLayers() {
  return Object.freeze([
    "canonical_per_voice",
    "published_knowledge",
    "customer_memory",
    "live_truth",
    "authority_guard",
    "reasoning",
    "per_voice_renderer",
    "delivery_gate",
  ]);
}
