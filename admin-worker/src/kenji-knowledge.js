const ADMIN_PREFIX = "/v1/admin/kenji/knowledge";
const INTERNAL_PUBLISHED_PATH = "/v1/internal/kenji/knowledge/published";
const CARD_PREFIX = "kenji:knowledge:v1:card:";
const INDEX_KEY = "kenji:knowledge:v1:index";
const PUBLISHED_INDEX_KEY = "kenji:knowledge:v1:published:index";
const META_KEY = "kenji:knowledge:v1:meta";
const MAX_CARDS = 1000;

const ALLOWED_ORIGINS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
  "https://www.mmdprive.com",
]);

const ALLOWED_LANES = new Set([
  "Membership",
  "Renewal",
  "Payment",
  "Booking",
  "Guide",
  "Travel",
  "Support",
  "Apply Routing",
  "Privacy",
  "Rules",
  "Escalation",
]);
const ALLOWED_AUDIENCE = new Set([
  "public",
  "public_member",
  "member",
  "premium",
  "vip_review",
  "blackcard_review",
  "internal_only",
]);
const ALLOWED_LANGUAGE = new Set(["th", "en", "zh", "jp"]);
const ALLOWED_STATUS = new Set(["draft", "review", "published", "archived"]);
const CREATE_STATUS = new Set(["draft", "review"]);
const PATCH_STATUS = new Set(["draft", "review", "archived"]);
const SAFE_PATCH_FIELDS = new Set([
  "title",
  "lane",
  "audience",
  "language",
  "customer_question_examples",
  "kenji_safe_answer",
  "do_rules",
  "dont_rules",
  "escalation_rule",
  "related_routes",
  "status",
  "updated_by",
]);

const UNSAFE_CONTENT_PATTERNS = [
  { name: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { name: "phone_number", pattern: /(?:\+?\d[\s().-]*){8,}/ },
  { name: "line_user_id", pattern: /\bline[_\s-]?user[_\s-]?id\b/i },
  { name: "line_id", pattern: /\bline\s*id\b/i },
  { name: "telegram_id", pattern: /\btelegram\s*id\b/i },
  { name: "telegram_username", pattern: /(^|[\s(])@[A-Za-z0-9_]{4,32}\b/ },
  { name: "airtable_record_id", pattern: /\brec[A-Za-z0-9]{10,}\b/ },
  { name: "payment_proof_url", pattern: /\bpayment\s*proof\s*(url|link)\b/i },
  { name: "proof_attached", pattern: /\bproof_attached\b/i },
  { name: "payment_ref_raw", pattern: /\bpayment_ref_raw\b/i },
  { name: "paid_at_raw", pattern: /\bpaid_at_raw\b/i },
  { name: "raw_payload", pattern: /\braw_payload\b/i },
  { name: "bank_account_number", pattern: /\bbank\s+account\s+(number|no\.?|#)?\b/i },
  { name: "swift", pattern: /\bswift\b/i },
  { name: "iban", pattern: /\biban\b/i },
  { name: "openai_token", pattern: new RegExp("\\bsk" + "-[A-Za-z0-9_-]{8,}\\b") },
  { name: "bearer_token", pattern: /\bbearer\s+[A-Za-z0-9._~+/-]+=*\b/i },
  { name: "api-key", pattern: /\bapi[_\s-]?key\b/i },
  { name: "line-channel-token", pattern: new RegExp("\\bLINE_CHANNEL_ACCESS" + "_TOKEN\\b", "i") },
  { name: "confirm_key", pattern: /\bconfirm[_\s-]?key\b/i },
  { name: "x_confirm_key", pattern: /\bx-confirm-key\b/i },
  { name: "secret", pattern: /\bsecret\b/i },
  { name: "pass-phrase", pattern: new RegExp("\\bpass" + "phrase\\b", "i") },
];

const DANGEROUS_ANSWER_PATTERNS = [
  /payment\s+approved/i,
  /mark\s+paid/i,
  /จ่ายสำเร็จแล้ว/i,
  /ชำระสำเร็จแล้ว/i,
  /เปิดสมาชิกให้แล้ว/i,
  /membership\s+active\s+แล้ว/i,
  /unlock\s+membership/i,
  /grant\s+VIP/i,
  /grant\s+SVIP/i,
  /grant\s+Black\s+Card/i,
  /อนุมัติ\s*VIP/i,
  /อนุมัติ\s*SVIP/i,
  /อนุมัติ\s*Black\s*Card/i,
  /override\s+backend/i,
  /ข้ามระบบ/i,
  /ไม่ต้องตรวจระบบ/i,
];

export async function handleKenjiKnowledgeRequest(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();

  if (!path.startsWith(`${ADMIN_PREFIX}/`) && path !== INTERNAL_PUBLISHED_PATH) {
    return null;
  }

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(request) });
  }

  try {
    if (path === INTERNAL_PUBLISHED_PATH) {
      if (!isAdminAuthed(request, env) && !isInternalAuthed(request, env)) {
        return json(request, { ok: false, error: "unauthorized" }, 401);
      }
      if (method !== "GET") return json(request, { ok: false, error: "method_not_allowed" }, 405);
      const cards = (await readAllCards(env)).filter((card) => (
        card.status === "published" && card.audience !== "internal_only"
      ));
      return json(request, { ok: true, cards, count: cards.length });
    }

    if (!isAdminAuthed(request, env)) {
      return json(request, { ok: false, error: "unauthorized" }, 401);
    }

    if (method === "GET" && path === `${ADMIN_PREFIX}/list`) return await listCards(request, env, url);
    if (method === "GET" && path === `${ADMIN_PREFIX}/meta`) return await metaCards(request, env);
    if (method === "POST" && path === `${ADMIN_PREFIX}/draft`) return await createCard(request, env);

    const itemMatch = path.match(/^\/v1\/admin\/kenji\/knowledge\/([^/]+)(?:\/(publish|archive))?$/);
    if (!itemMatch) return json(request, { ok: false, error: "not_found" }, 404);

    const id = decodeURIComponent(itemMatch[1]);
    const action = itemMatch[2] || "";
    if (method === "GET" && !action) return await getCard(request, env, id);
    if (method === "PATCH" && !action) return await patchCard(request, env, id);
    if (method === "POST" && action === "publish") return await publishCard(request, env, id);
    if (method === "POST" && action === "archive") return await archiveCard(request, env, id);
    return json(request, { ok: false, error: "method_not_allowed" }, 405);
  } catch (error) {
    return json(request, { ok: false, error: error.message || "kenji_knowledge_error" }, error.status || 500);
  }
}

async function listCards(request, env, url) {
  const page = await readCardPage(env, url.searchParams.get("cursor") || undefined);
  let cards = page.cards;
  const status = str(url.searchParams.get("status"));
  const lane = str(url.searchParams.get("lane"));
  const language = str(url.searchParams.get("language"));
  const audience = str(url.searchParams.get("audience"));
  const q = str(url.searchParams.get("q") || url.searchParams.get("query")).toLowerCase();

  if (status && status !== "all") cards = cards.filter((card) => card.status === status);
  if (lane && lane !== "all") cards = cards.filter((card) => card.lane === lane);
  if (language && language !== "all") cards = cards.filter((card) => card.language === language);
  if (audience && audience !== "all") cards = cards.filter((card) => card.audience === audience);
  if (q) cards = cards.filter((card) => searchableText(card).includes(q));

  cards.sort((a, b) => str(b.updated_at).localeCompare(str(a.updated_at)));
  return json(request, { ok: true, cards, count: cards.length, max: MAX_CARDS, cursor: page.cursor || null, list_complete: page.list_complete });
}

async function metaCards(request, env) {
  const cards = await readAllCards(env);
  const meta = buildMeta(cards);
  await putJson(env, META_KEY, meta);
  return json(request, { ok: true, meta });
}

async function getCard(request, env, id) {
  const card = await getCardById(env, id);
  if (!card) return json(request, { ok: false, error: "not_found" }, 404);
  return json(request, { ok: true, card });
}

async function createCard(request, env) {
  const body = await readJson(request);
  const now = new Date().toISOString();
  const id = makeId(body.id);
  const card = normalizeCard({
    ...body,
    id,
    status: body.status || "draft",
    version: 1,
    created_at: now,
    updated_at: now,
  }, { creating: true });

  validateCard(card, { creating: true });
  await putCard(env, card);
  await refreshIndexes(env);
  return json(request, { ok: true, card }, 201);
}

async function patchCard(request, env, id) {
  const existing = await getCardById(env, id);
  if (!existing) return json(request, { ok: false, error: "not_found" }, 404);

  const body = await readJson(request);
  const patch = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (SAFE_PATCH_FIELDS.has(key)) patch[key] = value;
  }
  if (patch.status === "published") {
    return json(request, { ok: false, error: "publish_requires_publish_endpoint" }, 400);
  }

  const card = normalizeCard({
    ...existing,
    ...patch,
    id: existing.id,
    created_at: existing.created_at,
    version: Number(existing.version || 1) + 1,
    updated_at: new Date().toISOString(),
  }, { creating: false });
  validateCard(card, { creating: false, patching: true });
  await putCard(env, card);
  await refreshIndexes(env);
  return json(request, { ok: true, card });
}

async function publishCard(request, env, id) {
  const existing = await getCardById(env, id);
  if (!existing) return json(request, { ok: false, error: "not_found" }, 404);
  const body = await readOptionalJson(request);
  const card = normalizeCard({
    ...existing,
    updated_by: body.updated_by || existing.updated_by,
    status: "published",
    version: Number(existing.version || 1) + 1,
    updated_at: new Date().toISOString(),
  }, { creating: false });
  validateCard(card, { creating: false });
  await putCard(env, card);
  await refreshIndexes(env);
  return json(request, { ok: true, card });
}

async function archiveCard(request, env, id) {
  const existing = await getCardById(env, id);
  if (!existing) return json(request, { ok: false, error: "not_found" }, 404);
  const body = await readOptionalJson(request);
  const card = normalizeCard({
    ...existing,
    updated_by: body.updated_by || existing.updated_by,
    status: "archived",
    version: Number(existing.version || 1) + 1,
    updated_at: new Date().toISOString(),
  }, { creating: false });
  validateCard(card, { creating: false });
  await putCard(env, card);
  await refreshIndexes(env);
  return json(request, { ok: true, card });
}

function normalizeCard(input, options) {
  return {
    id: str(input.id),
    title: str(input.title),
    lane: str(input.lane),
    audience: str(input.audience || "public"),
    language: str(input.language || "th"),
    customer_question_examples: stringArray(input.customer_question_examples),
    kenji_safe_answer: str(input.kenji_safe_answer),
    do_rules: stringArray(input.do_rules),
    dont_rules: stringArray(input.dont_rules),
    escalation_rule: str(input.escalation_rule),
    related_routes: normalizeRelatedRoutes(input.related_routes),
    status: str(input.status || "draft"),
    version: Number(input.version || (options.creating ? 1 : 0)),
    updated_by: str(input.updated_by || "admin"),
    updated_at: str(input.updated_at),
    created_at: str(input.created_at),
  };
}

function validateCard(card, options) {
  if (!card.id) throw badRequest("missing_id");
  if (!card.title) throw badRequest("missing_title");
  if (!ALLOWED_LANES.has(card.lane)) throw badRequest("invalid_lane");
  if (!ALLOWED_AUDIENCE.has(card.audience)) throw badRequest("invalid_audience");
  if (!ALLOWED_LANGUAGE.has(card.language)) throw badRequest("invalid_language");
  if (!ALLOWED_STATUS.has(card.status)) throw badRequest("invalid_status");
  if (options.creating && !CREATE_STATUS.has(card.status)) throw badRequest("create_cannot_publish");
  if (options.patching && !PATCH_STATUS.has(card.status)) throw badRequest("patch_cannot_publish");
  scanForUnsafeContent(card);
  scanDangerousAnswer(card.kenji_safe_answer);
}

function scanForUnsafeContent(card) {
  const content = [
    card.title,
    card.lane,
    card.audience,
    card.language,
    ...card.customer_question_examples,
    card.kenji_safe_answer,
    ...card.do_rules,
    ...card.dont_rules,
    card.escalation_rule,
    ...card.related_routes,
    card.updated_by,
  ].join("\n");
  const match = UNSAFE_CONTENT_PATTERNS.find((entry) => entry.pattern.test(content));
  if (match) throw badRequest(`unsafe_content_${match.name}`);
}

function scanDangerousAnswer(answer) {
  const match = DANGEROUS_ANSWER_PATTERNS.find((pattern) => pattern.test(answer));
  if (match) throw badRequest("dangerous_kenji_safe_answer");
}

async function readAllCards(env, cursor) {
  const kv = knowledgeKv(env);
  const cards = [];
  let nextCursor = cursor;
  do {
    const page = await kv.list({ prefix: CARD_PREFIX, cursor: nextCursor, limit: Math.min(1000, MAX_CARDS - cards.length) });
    for (const keyInfo of page.keys || []) {
      if (cards.length >= MAX_CARDS) break;
      const key = keyInfo.name || keyInfo;
      const card = await getJson(env, key);
      if (card) cards.push(card);
    }
    nextCursor = page.list_complete ? undefined : page.cursor;
  } while (nextCursor && cards.length < MAX_CARDS);
  return cards;
}

async function readCardPage(env, cursor) {
  const kv = knowledgeKv(env);
  const page = await kv.list({ prefix: CARD_PREFIX, cursor, limit: MAX_CARDS });
  const cards = [];
  for (const keyInfo of page.keys || []) {
    if (cards.length >= MAX_CARDS) break;
    const key = keyInfo.name || keyInfo;
    const card = await getJson(env, key);
    if (card) cards.push(card);
  }
  return {
    cards,
    cursor: page.list_complete ? undefined : page.cursor,
    list_complete: Boolean(page.list_complete),
  };
}

async function getCardById(env, id) {
  return getJson(env, `${CARD_PREFIX}${id}`);
}

async function putCard(env, card) {
  await putJson(env, `${CARD_PREFIX}${card.id}`, card);
}

async function refreshIndexes(env) {
  const cards = await readAllCards(env);
  const index = cards.map((card) => ({ id: card.id, status: card.status, lane: card.lane, language: card.language, audience: card.audience, updated_at: card.updated_at }));
  const published = index.filter((card) => card.status === "published");
  await putJson(env, INDEX_KEY, index);
  await putJson(env, PUBLISHED_INDEX_KEY, published);
  await putJson(env, META_KEY, buildMeta(cards));
}

function buildMeta(cards) {
  return {
    total: cards.length,
    status: countBy(cards, "status"),
    lane: countBy(cards, "lane"),
    language: countBy(cards, "language"),
    audience: countBy(cards, "audience"),
    updated_at: new Date().toISOString(),
  };
}

function countBy(cards, field) {
  return cards.reduce((acc, card) => {
    acc[card[field]] = (acc[card[field]] || 0) + 1;
    return acc;
  }, {});
}

function knowledgeKv(env) {
  if (!env.KENJI_KNOWLEDGE_KV) throw Object.assign(new Error("missing_KENJI_KNOWLEDGE_KV"), { status: 500 });
  return env.KENJI_KNOWLEDGE_KV;
}

async function getJson(env, key) {
  const value = await knowledgeKv(env).get(key, "json");
  if (value && typeof value === "object") return value;
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

async function putJson(env, key, value) {
  await knowledgeKv(env).put(key, JSON.stringify(value));
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    throw badRequest("invalid_json");
  }
}

async function readOptionalJson(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch (_) {
    return {};
  }
}

function isAdminAuthed(request, env) {
  const bearer = bearerToken(request);
  const confirmKey = request.headers.get("X-Confirm-Key") || "";
  return tokenMatches(bearer, [env.ADMIN_BEARER, env.ADMIN_API_TOKEN, env.ADMIN_TOKEN]) ||
    tokenMatches(confirmKey, [env.CONFIRM_KEY, env.ADMIN_CONFIRM_KEY, env.X_CONFIRM_KEY]);
}

function isInternalAuthed(request, env) {
  const bearer = bearerToken(request);
  const internal = request.headers.get("X-Internal-Token") || "";
  return tokenMatches(bearer, [env.INTERNAL_TOKEN, env.KENJI_INTERNAL_TOKEN, env.SERVICE_TOKEN]) ||
    tokenMatches(internal, [env.INTERNAL_TOKEN, env.KENJI_INTERNAL_TOKEN, env.SERVICE_TOKEN]);
}

function bearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function tokenMatches(value, candidates) {
  return Boolean(value && candidates.some((candidate) => candidate && value === candidate));
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(request) });
}

function responseHeaders(request) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Confirm-Key, X-Internal-Token",
  };
  const origin = request.headers.get("Origin") || "";
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function makeId(value) {
  const candidate = str(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return candidate || `kenji_${crypto.randomUUID()}`;
}

function normalizeRelatedRoutes(value) {
  return stringArray(value).filter((route) => route.startsWith("/") && !route.startsWith("/internal/admin") && !route.startsWith("/v1/admin"));
}

function stringArray(value) {
  if (Array.isArray(value)) return value.map(str).filter(Boolean);
  const single = str(value);
  return single ? [single] : [];
}

function searchableText(card) {
  return [
    card.title,
    card.lane,
    card.audience,
    card.language,
    ...card.customer_question_examples,
    card.kenji_safe_answer,
  ].join(" ").toLowerCase();
}

function normalizePath(pathname) {
  return `/${String(pathname || "").replace(/^\/+|\/+$/g, "")}`;
}

function str(value) {
  return String(value ?? "").trim();
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}
