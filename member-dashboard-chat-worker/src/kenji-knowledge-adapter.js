const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_CACHE_TTL_MS = 60000;
const PUBLISHED_PATH = "/v1/internal/kenji/knowledge/published";
const FALLBACK_TH = "ผมช่วยอธิบายขั้นตอนเบื้องต้นให้ได้ครับ แต่เคสนี้ต้องให้ MMD ตรวจจากระบบทางการก่อนนะครับ";

const cache = new Map();

const TRIGGER_PATTERNS = [
  /\bhi\s+per\b/i,
  /\bhi\s+mmd\b/i,
  /\bmmd\b/i,
  /\bper\s*ai\b/i,
  /\bkenji\s*ai\b/i,
  /\bkenji\b/i,
  /เปอร์\s*ai/i,
  /เปอร์เอไอ/i,
  /เคนจิ/i,
];

const TRIGGER_ONLY_PATTERNS = [
  "hi per",
  "hi mmd",
  "mmd",
  "per ai",
  "kenji ai",
  "kenji",
  "เปอร์ ai",
  "เปอร์เอไอ",
  "เคนจิ",
];

const LANE_KEYWORDS = {
  Payment: ["สลิป", "โอน", "ชำระ", "จ่าย", "payment", "paid", "slip", "transfer"],
  Membership: ["สมัคร", "สมาชิก", "package", "แพ็กเกจ", "แพคเกจ", "member", "membership"],
  Renewal: ["ต่ออายุ", "renew", "renewal"],
  Booking: ["จอง", "booking", "model", "companion"],
  Rules: ["กฎ", "ข้อควรปฏิบัติ", "rules"],
  Support: ["ช่วย", "ติดต่อ", "support"],
  Privacy: ["ส่วนตัว", "ข้อมูล", "privacy"],
};

const SAFE_DIRECT_INTENT_PATTERNS = [
  /ส่ง\s*สลิป.*รอ/i,
  /สลิป.*รอ/i,
  /ช่วย.*สลิป/i,
  /เช็ก.*สลิป/i,
  /สมัครสมาชิก/i,
  /ต่ออายุสมาชิก/i,
  /จองยังไง/i,
  /how\s+to\s+(?:join|apply|book|renew)/i,
  /payment\s+(?:proof|slip|wait)/i,
  /membership\s+(?:apply|join|renew)/i,
  /booking\s+(?:how|help)/i,
];

const UNSAFE_ANSWER_PATTERNS = [
  /ชำระสำเร็จ/i,
  /จ่ายสำเร็จ/i,
  /โอนสำเร็จ/i,
  /payment\s+confirmed/i,
  /paid\s+successfully/i,
  /membership\s+active/i,
  /สมาชิก\s*active/i,
  /ปลดล็อกแล้ว/i,
  /unlock/i,
  /approved/i,
  /อนุมัติแล้ว/i,
  /VIP\s+approved/i,
  /Black\s+Card\s+approved/i,
  /SVIP\s+approved/i,
  /เปลี่ยนสถานะแล้ว/i,
  /mark\s+paid/i,
  /admin\s+note/i,
  /backend/i,
  /token/i,
  /secret/i,
  /API\s*key/i,
  /private\s+key/i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /(?:\+?66|0)\d[\d\s().-]{7,}\d/,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/i,
  new RegExp("\\b" + "s" + "k-" + "[A-Za-z0-9_-]{8,}\\b"),
  /\b[A-Za-z0-9_-]{32,}\b/,
];

function asString(value) {
  return String(value || "").trim();
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(asString(value).toLowerCase());
}

function safeKnowledgeLog(marker, fields = {}) {
  const payload = {
    event: marker,
    enabled: Boolean(fields.enabled),
    knowledge_enabled: Boolean(fields.knowledge_enabled),
    allowlisted: Boolean(fields.allowlisted),
    has_question: Boolean(fields.has_question),
    matched: Boolean(fields.matched),
    reason: asString(fields.reason),
    lane: asString(fields.lane),
    language: asString(fields.language || "unknown"),
    answer_safe: Boolean(fields.answer_safe),
  };
  console.log(marker, payload);
}

function numberFromEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isKenjiKnowledgeEnabled(env = {}) {
  return isEnabled(env.LINE_KENJI_AI_ENABLED) && isEnabled(env.LINE_KENJI_KNOWLEDGE_ENABLED);
}

export function isLineUserAllowlisted(env = {}, userId = "") {
  const id = asString(userId);
  if (!id) return false;
  return asString(env.LINE_KENJI_KNOWLEDGE_ALLOWLIST)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(id);
}

export function detectMessageLanguage(text = "") {
  const value = asString(text);
  if (/[ก-๙]/.test(value)) return "th";
  if (/[A-Za-z]/.test(value)) return "en";
  return "unknown";
}

export function normalizeKnowledgeText(text = "") {
  return asString(text)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[._\-]+/g, " ")
    .replace(/[^a-z0-9ก-๙\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(text = "") {
  return normalizeKnowledgeText(text).replace(/\s+/g, "");
}

function hasKenjiTrigger(text = "") {
  return TRIGGER_PATTERNS.some((pattern) => pattern.test(asString(text)));
}

function stripTriggers(text = "") {
  let output = asString(text);
  for (const pattern of TRIGGER_PATTERNS) output = output.replace(pattern, " ");
  return normalizeKnowledgeText(output);
}

function isTriggerOnly(text = "") {
  const normalized = normalizeKnowledgeText(text);
  const compact = compactText(text);
  if (!normalized) return false;
  return TRIGGER_ONLY_PATTERNS.some((trigger) => {
    const normalizedTrigger = normalizeKnowledgeText(trigger);
    return normalized === normalizedTrigger || compact === normalizedTrigger.replace(/\s+/g, "");
  });
}

function hasSafeDirectIntent(text = "") {
  const normalized = normalizeKnowledgeText(text);
  if (!normalized) return false;
  if (SAFE_DIRECT_INTENT_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  return Object.values(LANE_KEYWORDS).flat().some((keyword) => normalized.includes(normalizeKnowledgeText(keyword)));
}

function cacheKey(env = {}) {
  return `${asString(env.KENJI_KNOWLEDGE_BASE_URL).replace(/\/+$/, "")}|${asString(env.KENJI_KNOWLEDGE_INTERNAL_TOKEN || env.INTERNAL_TOKEN) ? "authed" : "missing"}`;
}

export async function fetchPublishedKenjiKnowledge(env = {}, fetchImpl = fetch) {
  const baseUrl = asString(env.KENJI_KNOWLEDGE_BASE_URL).replace(/\/+$/, "");
  const token = asString(env.KENJI_KNOWLEDGE_INTERNAL_TOKEN || env.INTERNAL_TOKEN);
  if (!baseUrl || !token || typeof fetchImpl !== "function") return [];

  const ttlMs = numberFromEnv(env.KENJI_KNOWLEDGE_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS);
  const key = cacheKey(env);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < ttlMs) return cached.cards;

  const timeoutMs = numberFromEnv(env.KENJI_KNOWLEDGE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetchImpl(`${baseUrl}${PUBLISHED_PATH}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller?.signal,
    });
    if (!response || !response.ok) return [];
    const data = await response.json().catch(() => null);
    const cards = Array.isArray(data?.cards) ? data.cards.filter(isUsablePublishedCard) : [];
    cache.set(key, { ts: Date.now(), cards });
    return cards;
  } catch (_) {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isUsablePublishedCard(card = {}) {
  return card && card.status === "published" && card.audience !== "internal_only" && asString(card.kenji_safe_answer);
}

function tokens(text = "") {
  return normalizeKnowledgeText(text).split(/\s+/).filter((token) => token.length >= 2);
}

function tokenOverlapScore(message, candidate) {
  const messageTokens = new Set(tokens(message));
  const candidateTokens = tokens(candidate);
  if (!messageTokens.size || !candidateTokens.length) return 0;
  const hits = candidateTokens.filter((token) => messageTokens.has(token)).length;
  return hits / Math.max(candidateTokens.length, 1);
}

function laneKeywordHits(messageText, lane) {
  const normalized = normalizeKnowledgeText(messageText);
  const keywords = LANE_KEYWORDS[lane] || [];
  return keywords.filter((keyword) => normalized.includes(normalizeKnowledgeText(keyword))).length;
}

export function scoreKnowledgeCard(messageText = "", card = {}) {
  if (!isUsablePublishedCard(card)) return 0;
  const message = stripTriggers(messageText) || normalizeKnowledgeText(messageText);
  if (!message) return 0;

  let score = 0;
  for (const example of Array.isArray(card.customer_question_examples) ? card.customer_question_examples : []) {
    const normalizedExample = normalizeKnowledgeText(example);
    if (!normalizedExample) continue;
    if (message === normalizedExample || message.includes(normalizedExample) || normalizedExample.includes(message)) {
      score = Math.max(score, 100);
      continue;
    }
    const overlap = tokenOverlapScore(message, normalizedExample);
    if (overlap >= 0.66) score = Math.max(score, 82);
    else if (overlap >= 0.45) score = Math.max(score, 68);
  }

  const titleOverlap = tokenOverlapScore(message, card.title);
  if (titleOverlap >= 0.6) score = Math.max(score, 58);
  else if (titleOverlap >= 0.35) score = Math.max(score, 45);

  const laneHits = laneKeywordHits(message, card.lane);
  if (laneHits >= 2 && score >= 45) score += 12;
  else if (laneHits >= 1 && score >= 45) score += 6;
  else if (laneHits >= 2) score = Math.max(score, 34);
  else if (laneHits >= 1) score = Math.max(score, 24);

  return score;
}

export function findBestKnowledgeCard(messageText = "", cards = [], options = {}) {
  const preferredLanguage = options.language || detectMessageLanguage(messageText);
  const languageOrder = preferredLanguage === "en" ? ["en", "th"] : preferredLanguage === "unknown" ? ["th", "en"] : [preferredLanguage, "th", "en"];
  const scored = cards
    .filter(isUsablePublishedCard)
    .map((card) => {
      const languageBonus = languageOrder.indexOf(card.language) === 0 ? 8 : languageOrder.includes(card.language) ? 3 : 0;
      return { card, score: scoreKnowledgeCard(messageText, card) + languageBonus };
    })
    .filter((entry) => entry.score >= 60)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.card || null;
}

export function isSafeKenjiKnowledgeAnswer(answer = "") {
  const text = asString(answer);
  if (!text) return false;
  return !UNSAFE_ANSWER_PATTERNS.some((pattern) => pattern.test(text));
}

function safeRoute(route = "") {
  const value = asString(route);
  if (!value.startsWith("/")) return "";
  if (/^\/(?:internal|admin|__internal|v1\/admin|v1\/internal)\b/i.test(value)) return "";
  return value;
}

export function buildKenjiKnowledgeReply(messageText = "", card = {}) {
  const answer = asString(card.kenji_safe_answer);
  if (!isSafeKenjiKnowledgeAnswer(answer)) return FALLBACK_TH;
  const route = (Array.isArray(card.related_routes) ? card.related_routes : []).map(safeRoute).find(Boolean);
  if (!route) return answer;
  return `${answer}\n\nต่อได้ที่: ${route}`;
}

export async function maybeBuildKenjiKnowledgeReply({ env = {}, userId = "", messageText = "", fetchImpl = fetch } = {}) {
  const enabled = isEnabled(env.LINE_KENJI_AI_ENABLED);
  const knowledgeEnabled = isEnabled(env.LINE_KENJI_KNOWLEDGE_ENABLED);
  const allowlisted = isLineUserAllowlisted(env, userId);
  const language = detectMessageLanguage(messageText);
  const hasQuestion = Boolean(asString(messageText)) && !isTriggerOnly(messageText) && (hasKenjiTrigger(messageText) || hasSafeDirectIntent(messageText));
  const baseLog = {
    enabled,
    knowledge_enabled: knowledgeEnabled,
    allowlisted,
    has_question: hasQuestion,
    matched: false,
    reason: "",
    lane: "",
    language,
    answer_safe: false,
  };

  safeKnowledgeLog("line_kenji_knowledge_probe", baseLog);

  if (!enabled) {
    safeKnowledgeLog("line_kenji_knowledge_blocked", { ...baseLog, reason: "feature_off" });
    return null;
  }
  if (!knowledgeEnabled) {
    safeKnowledgeLog("line_kenji_knowledge_blocked", { ...baseLog, reason: "knowledge_off" });
    return null;
  }
  if (!allowlisted) {
    safeKnowledgeLog("line_kenji_knowledge_blocked", { ...baseLog, reason: "not_allowlisted" });
    return null;
  }
  if (!hasQuestion) {
    safeKnowledgeLog("line_kenji_knowledge_blocked", { ...baseLog, reason: "no_question" });
    return null;
  }
  if (isEnabled(env.LINE_KENJI_KNOWLEDGE_DRY_RUN)) {
    safeKnowledgeLog("line_kenji_knowledge_blocked", { ...baseLog, reason: "feature_off" });
    return null;
  }

  const cards = await fetchPublishedKenjiKnowledge(env, fetchImpl);
  if (!cards.length) {
    safeKnowledgeLog("line_kenji_knowledge_fallback", { ...baseLog, reason: "no_cards" });
    return null;
  }
  const card = findBestKnowledgeCard(messageText, cards, { language });
  if (!card) {
    safeKnowledgeLog("line_kenji_knowledge_fallback", { ...baseLog, reason: "no_match" });
    return null;
  }
  const answerSafe = isSafeKenjiKnowledgeAnswer(card.kenji_safe_answer);
  if (!answerSafe) {
    safeKnowledgeLog("line_kenji_knowledge_fallback", {
      ...baseLog,
      matched: true,
      reason: "unsafe_answer",
      lane: card.lane,
      answer_safe: false,
    });
    return FALLBACK_TH;
  }
  safeKnowledgeLog("line_kenji_knowledge_match", {
    ...baseLog,
    matched: true,
    lane: card.lane,
    answer_safe: true,
  });
  return buildKenjiKnowledgeReply(messageText, card);
}

export const KENJI_KNOWLEDGE_FALLBACK_TH = FALLBACK_TH;
