// Repository-owned Kenji knowledge sources currently define only medium and
// critical. Grounding admits medium only; critical, unknown, and missing fail closed.
const MODEL_SAFE_RISK_LEVELS = new Set(["medium"]);
export const KENJI_KNOWLEDGE_ID_RE = /^[a-z0-9][a-z0-9_-]{2,79}$/;
const INTERNAL_TEXT_RE = /(?:\badmin\b|internal|private|secret|token|cloudflare|worker|wrangler|airtable|ระบบหลังบ้าน|ข้อมูลภายใน|คำสั่งภายใน)/i;
const clean = (value) => String(value == null ? "" : value).trim();
const parseDate = (value) => {
  const raw = clean(value);
  if (!raw) return NaN;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
};

// Knowledge runtime IDs are 3-80 characters drawn from lowercase ASCII,
// digits, underscore, and hyphen. Matching remains exact and case-sensitive.
export function parseModelKnowledgeIdAllowlist(value) {
  const raw = clean(value);
  if (!raw) return { valid: true, ids: [] };
  const entries = raw.split(/[\s,]+/).filter(Boolean);
  if (!entries.length || entries.some((entry) => !KENJI_KNOWLEDGE_ID_RE.test(entry))) {
    return { valid: false, ids: [] };
  }
  return { valid: true, ids: [...new Set(entries)] };
}

export function isApprovedLineModelKnowledge(card = {}, now = Date.now(), approvedIds = new Set()) {
  const answer = clean(card.customer_answer);
  const effectiveAt = parseDate(card.effective_from);
  const expiresRaw = clean(card.effective_to || card.expires_at);
  const expiresAt = expiresRaw ? parseDate(expiresRaw) : Infinity;
  const channels = (Array.isArray(card.allowed_channels) ? card.allowed_channels : [card.allowed_channels]).map(clean);
  if (!clean(card.knowledge_id) || !answer || answer.length > 1600) return false;
  if (clean(card.status).toLowerCase() !== "active" || clean(card.response_mode).toLowerCase() !== "auto_reply_allowed") return false;
  if (!MODEL_SAFE_RISK_LEVELS.has(clean(card.risk_level).toLowerCase()) || !channels.includes("LINE_OFC")) return false;
  // The current Airtable schema has no public-safe boolean. A server-owned
  // allowlist is therefore the explicit publication classification; absence
  // fails closed instead of inferring safety from LINE_OFC eligibility.
  if (!approvedIds.has(clean(card.knowledge_id))) return false;
  if (!Number.isFinite(effectiveAt) || effectiveAt > now || (expiresRaw && (!Number.isFinite(expiresAt) || expiresAt <= now))) return false;
  if (card.superseded === true || clean(card.superseded_by)) return false;
  const privateSurface = [card.title, card.category, card.source_path, card.source_ref, card.internal_instruction, card.review_note, answer].map(clean).join(" ");
  return !INTERNAL_TEXT_RE.test(privateSurface);
}

export function selectApprovedLineModelKnowledge(cards = [], { now = Date.now(), approvedIds = [] } = {}) {
  const allowlist = new Set(approvedIds.map(clean).filter(Boolean));
  const newest = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    if (!isApprovedLineModelKnowledge(card, now, allowlist)) continue;
    const key = clean(card.knowledge_id);
    const timestamp = parseDate(card.effective_from);
    const prior = newest.get(key);
    if (!prior || timestamp > prior.timestamp) newest.set(key, { card, timestamp });
  }
  return [...newest.values()].map(({ card }) => card);
}
